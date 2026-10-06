"""Cookie/account gate BEFORE parsing. No bearer, IP, header or runtime bypass.

Only isolated test apps use FastAPI dependency overrides with prebound operations.
"""
from inspect import isawaitable

from fastapi.routing import APIRoute
from starlette.concurrency import run_in_threadpool

from activity_hub.auth import require_account_context, require_csrf, require_origin
from activity_hub.errors import DomainError


def require_private_access(request=None):
    if request is None:
        raise DomainError(401, "Authentication required")
    settings = request.app.state.auth_settings
    proof = request.app.state.auth.authenticate(request.cookies.get(settings.cookie_name))
    require_account_context(request, proof)
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        require_origin(request, settings)
        require_csrf(request, proof)
    return proof


async def bind_private_operations(request):
    if getattr(request.state, "private_access_checked", False):
        return
    override = request.app.dependency_overrides.get(require_private_access)
    if override is not None:
        result = await run_in_threadpool(override)
        if isawaitable(result):
            await result
        # The test must explicitly prebind its isolated app to a real account.
    else:
        proof = await run_in_threadpool(require_private_access, request)
        auth = request.app.state.auth
        request.state.operations = request.app.state.operations.with_account(
            proof.account_id, lambda session: auth.authorize(session, proof))
    request.state.private_access_checked = True


class PrivateRoute(APIRoute):
    """FastAPI Depends runs too late to reject malformed JSON safely."""
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def gated(request):
            await bind_private_operations(request)
            return await handler(request)

        return gated
