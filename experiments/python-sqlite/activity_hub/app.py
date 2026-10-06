"""ASGI entrypoint: public health/contracts; private activity via web sessions."""
import json
import logging
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse

from activity_hub.access import PrivateRoute, bind_private_operations, require_private_access
from activity_hub.auth import AuthService, AuthSettings, MAX_LOGIN_BODY_BYTES, SESSION_LIFETIME, require_origin
from activity_hub.contracts import (
    AccessCodeLogin, CheckOut, CheckWrite, DashboardPage, DashboardQuery, FrontCreate, FrontOut,
    FrontPage, FrontPatch, FrontQuery, HistoryPage, HistoryQuery, SessionOut, SignupOut, SignupRequest,
)
from activity_hub.database import Database
from activity_hub.errors import DomainError, StorageUnavailable
from activity_hub.operations import Operations

logger = logging.getLogger("activity_hub")
RequestId = Annotated[UUID, Header(
    alias="Idempotency-Key",
    description="Required UUID. Reuse only for retries of the exact same operation and payload. "
                "Replays return the original result, including the resolved Madrid calendar date.",
)]


async def _auth_input(request, contract):
    content_types = request.headers.getlist("content-type")
    if len(content_types) != 1 or content_types[0].split(";", 1)[0].strip().lower() != "application/json":
        raise DomainError(415, "JSON required")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_LOGIN_BODY_BYTES:
            raise DomainError(413, "Request too large")
        body.extend(chunk)
    try:
        data = json.loads(body.decode("utf-8"))
        return contract.model_validate(data)
    except (ValueError, ValidationError):
        raise DomainError(400, "Invalid request") from None


def create_app(database: Database | None = None, *, clock=None, web_origin=None) -> FastAPI:
    settings = AuthSettings.from_environment() if web_origin is None else AuthSettings(web_origin)
    owns_database = database is None
    database = database if database is not None else Database()

    @asynccontextmanager
    async def lifespan(app):
        try:
            yield
        finally:
            if owns_database:
                database.dispose()

    app = FastAPI(
        title="Activity Hub — backend local",
        version="0.1.0",
        description="Registro privado mediante código de acceso y sesiones web. "
                    "Alta abierta, cuentas privadas y códigos permanentes sin recuperación. "
                    "API protegida por contexto de cuenta, Origin y X-CSRF-Token. Sin "
                    "credenciales MCP ni bypass de desarrollo.",
        lifespan=lifespan,
        telemetry={"auto_configure": False, "tracing": False, "metrics": False,
                   "logs": False, "operation_spans": False},
    )
    app.state.database = database
    app.state.operations = Operations(database, clock=clock)
    app.state.auth = AuthService(database, clock=clock)
    app.state.auth_settings = settings

    @app.middleware("http")
    async def contain_unexpected_errors(request, call_next):
        try:
            if request.url.path == "/api" or request.url.path.startswith("/api/"):
                await bind_private_operations(request)
            response = await call_next(request)
        except DomainError as error:
            response = JSONResponse(status_code=error.status_code, content={"detail": error.detail}, headers=error.headers)
        except Exception:
            # Do not let an uncaught SQL/validation error reach Uvicorn's traceback
            # logger: exception text can contain activity, URLs, or future tokens.
            logger.error("Unhandled request failure")
            response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
        if request.url.path in ("/api", "/auth") or request.url.path.startswith(("/api/", "/auth/")):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(DomainError)
    async def domain_error(request, error):
        return JSONResponse(status_code=error.status_code, content={"detail": error.detail}, headers=error.headers)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, error):
        # Pydantic's default errors echo input values. Contracts remain in OpenAPI,
        # but rejected names, URLs, cookies, and request bodies are not echoed.
        return JSONResponse(status_code=422, content={"detail": "Invalid request"})

    @app.get("/health", responses={503: {"description": "Schema or storage is unavailable"}})
    def health():
        if not database.schema_ready():
            raise StorageUnavailable()
        return {"status": "ok"}

    @app.get("/auth/session", response_model=SessionOut)
    async def auth_session(request: Request):
        proof = await run_in_threadpool(app.state.auth.authenticate, request.cookies.get(settings.cookie_name))
        return proof.response()

    @app.post("/auth/login", response_model=SessionOut, openapi_extra={
        "requestBody": {"required": True, "content": {
            "application/json": {"schema": AccessCodeLogin.model_json_schema()}}},
    })
    async def auth_login(request: Request, response: Response):
        require_origin(request, settings)
        # Commit the limiter even if parsing/content type/code verification fails.
        await run_in_threadpool(app.state.auth.reserve_login_attempt)
        code = (await _auth_input(request, AccessCodeLogin)).code
        token, proof = await run_in_threadpool(app.state.auth.login, code, request.cookies.get(settings.cookie_name))
        response.set_cookie(settings.cookie_name, token, max_age=int(SESSION_LIFETIME.total_seconds()),
                            expires=proof.expires_at, path="/", secure=settings.secure_cookie,
                            httponly=True, samesite="strict")
        return proof.response()

    @app.post("/auth/signup", response_model=SignupOut, status_code=201, openapi_extra={
        "requestBody": {"required": True, "content": {
            "application/json": {"schema": SignupRequest.model_json_schema()}}},
    })
    async def auth_signup(request: Request):
        require_origin(request, settings)
        prior_token = request.cookies.get(settings.cookie_name)
        try:
            await run_in_threadpool(app.state.auth.reserve_attempt, "signup")
        except DomainError as error:
            if error.status_code != 429:
                raise
            # Count eligible-Origin requests, but preserve the explicit signed-in
            # conflict even when the public signup counter is already full.
            await run_in_threadpool(app.state.auth.require_signup_allowed, prior_token)
            raise
        await run_in_threadpool(app.state.auth.require_signup_allowed, prior_token)
        await _auth_input(request, SignupRequest)
        # No cookie/session: the client must save the response then explicitly log in.
        return await run_in_threadpool(app.state.auth.signup, prior_token)

    @app.post("/auth/logout", status_code=204)
    async def auth_logout(request: Request):
        proof = await run_in_threadpool(require_private_access, request)
        await run_in_threadpool(app.state.auth.logout, proof)
        # Do not delete the browser cookie here: delayed headers could erase
        # another tab's newer login. The captured token is already revoked;
        # retaining that unusable cookie is safe, and a later login replaces it.
        return Response(status_code=204)

    router = APIRouter(
        prefix="/api", route_class=PrivateRoute,
        responses={503: {"description": "Schema or storage unavailable"}},
    )

    def operations(request):
        return getattr(request.state, "operations", request.app.state.operations)

    @router.post("/fronts", response_model=FrontOut, status_code=201)
    def create_front(request: Request, data: FrontCreate, request_id: RequestId):
        return operations(request).create_front(data, request_id)

    @router.get("/fronts", response_model=FrontPage)
    def list_fronts(request: Request, query: Annotated[FrontQuery, Query()]):
        return operations(request).list_fronts(query)

    @router.get("/fronts/{front_id}", response_model=FrontOut)
    def get_front(request: Request, front_id: UUID):
        return operations(request).get_front(front_id)

    @router.patch("/fronts/{front_id}", response_model=FrontOut)
    def patch_front(request: Request, front_id: UUID, data: FrontPatch):
        return operations(request).patch_front(front_id, data)

    @router.put("/fronts/{front_id}/check", response_model=CheckOut)
    def write_check(request: Request, front_id: UUID, data: CheckWrite, request_id: RequestId):
        return operations(request).write_check(front_id, data, request_id)

    @router.get("/history", response_model=HistoryPage)
    def history(request: Request, query: Annotated[HistoryQuery, Query()]):
        return operations(request).history(query)

    @router.get("/dashboard", response_model=DashboardPage)
    def dashboard(request: Request, query: Annotated[DashboardQuery, Query()]):
        return operations(request).dashboard(query)

    app.include_router(router)
    return app


app = create_app()
