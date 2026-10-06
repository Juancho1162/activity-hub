"""Private-account code verification and durable opaque web sessions, not MCP auth.

Generated codes have 32 independent symbols from a 32-symbol alphabet (160 bits).
Normalization is ASCII-only: remove literal spaces/hyphens and uppercase a-z;
exactly 32 alphabet symbols must remain. No password-like user-chosen codes.
SHA-256 verifiers are appropriate here because BOTH credentials are CSPRNG
secrets with high entropy, not human passwords. No raw code/cookie is persisted.
"""
import hashlib
import hmac
import ipaddress
import math
import os
import re
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from sqlalchemy import delete, select

from activity_hub.contracts import SessionOut, SignupOut
from activity_hub.database import Database
from activity_hub.errors import DomainError, StorageUnavailable
from activity_hub.models import Account, ActionThrottle, WebSession

DEFAULT_WEB_ORIGIN = "http://127.0.0.1:5173"
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_SYMBOLS = 32
MAX_CODE_LENGTH = 128
MAX_LOGIN_BODY_BYTES = 1024
SESSION_LIFETIME = timedelta(days=30)
LOGIN_WINDOW = timedelta(seconds=60)
LOGIN_ATTEMPTS = 10
SIGNUP_ATTEMPTS = 5
_OPAQUE_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}")
_ORIGIN = re.compile(r"(https?)://(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(?::([0-9]+))?")
_DNS_HOST = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*")


def _web_origin(value):
    # urlsplit alone tolerates paths, stripped control characters and credentials.
    if not isinstance(value, str) or not _ORIGIN.fullmatch(value):
        raise ValueError("A single HTTP(S) web origin is required")
    parsed = urlsplit(value)
    host = parsed.hostname.lower()
    try:
        port = parsed.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError
        if parsed.netloc.startswith("["):
            host = "[" + ipaddress.IPv6Address(host).compressed + "]"
        elif len(host) > 253 or not _DNS_HOST.fullmatch(host):
            raise ValueError
    except ValueError:
        raise ValueError("A single HTTP(S) web origin is required") from None
    # Only these literal loopback spellings permit HTTP; they confer NO access.
    literal_host = _ORIGIN.fullmatch(value).group(2).lower()
    if parsed.scheme == "http" and literal_host not in ("localhost", "127.0.0.1", "[::1]"):
        raise ValueError("HTTPS is required for nonloopback web origins")
    # Match browser origin serialization: lowercase host, no default port.
    suffix = "" if port is None or port == (443 if parsed.scheme == "https" else 80) else f":{port}"
    return f"{parsed.scheme}://{host}{suffix}"


@dataclass(frozen=True)
class AuthSettings:
    web_origin: str = DEFAULT_WEB_ORIGIN

    def __post_init__(self):
        object.__setattr__(self, "web_origin", _web_origin(self.web_origin))

    @classmethod
    def from_environment(cls):
        return cls(os.environ.get("ACTIVITY_HUB_WEB_ORIGIN", DEFAULT_WEB_ORIGIN))

    @property
    def secure_cookie(self):
        return self.web_origin.startswith("https://")

    @property
    def cookie_name(self):
        return "__Host-activity_hub_session" if self.secure_cookie else "activity_hub_session"


def normalize_access_code(value):
    if not isinstance(value, str) or len(value) > MAX_CODE_LENGTH or not value.isascii():
        return None
    normalized = value.replace("-", "").replace(" ", "").upper()
    if len(normalized) != CODE_SYMBOLS or any(symbol not in CODE_ALPHABET for symbol in normalized):
        return None
    return normalized


def generate_access_code():
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_SYMBOLS))
    return "-".join(raw[index:index + 4] for index in range(0, CODE_SYMBOLS, 4))


def _code_verifier(normalized):
    return hashlib.sha256(b"activity-hub:access-code:v1:" + normalized.encode("ascii")).hexdigest()


def _session_verifier(token):
    if not isinstance(token, str) or not _OPAQUE_TOKEN.fullmatch(token):
        return None
    return hashlib.sha256(b"activity-hub:session:v1:" + token.encode("ascii")).hexdigest()


def require_origin(request, settings):
    origins = request.headers.getlist("origin")
    if origins != [settings.web_origin]:
        raise DomainError(403, "Request forbidden")


def require_csrf(request, proof):
    tokens = request.headers.getlist("x-csrf-token")
    if (len(tokens) != 1 or not _OPAQUE_TOKEN.fullmatch(tokens[0])
            or not hmac.compare_digest(tokens[0], proof.csrf_token)):
        raise DomainError(403, "Request forbidden")


def require_account_context(request, proof):
    # A tab's expected context is not an authentication credential. The cookie
    # is checked FIRST; this exact single canonical UUID prevents stale intents.
    if request.headers.getlist("x-activity-account") != [str(proof.account_id)]:
        raise DomainError(409, "Account context changed")


@dataclass(frozen=True)
class SessionProof:
    account_id: UUID
    token_verifier: str = field(repr=False)
    csrf_token: str = field(repr=False)
    expires_at: datetime

    def response(self):
        return SessionOut(authenticated=True, account_id=self.account_id,
                          csrf_token=self.csrf_token, expires_at=self.expires_at)


class AuthService:
    def __init__(self, database: Database, *, clock=None):
        self.database = database
        self.clock = clock if clock is not None else lambda: datetime.now(UTC)

    def _now(self):
        now = self.clock()
        if now.tzinfo is None or now.utcoffset() is None:
            raise ValueError("The clock must provide an aware datetime")
        return now.astimezone(UTC)

    def _require_schema(self):
        if not self.database.schema_ready():
            raise StorageUnavailable()

    def _session(self, session, verifier):
        stored = session.get(WebSession, verifier) if verifier is not None else None
        if (stored is None or stored.expires_at <= self._now()
                or not hmac.compare_digest(stored.token_verifier, verifier)):
            raise DomainError(401, "Authentication required")
        return stored

    def authenticate(self, token):
        self._require_schema()
        with self.database.transaction() as session:
            stored = self._session(session, _session_verifier(token))
            return SessionProof(stored.account_id, stored.token_verifier, stored.csrf_token, stored.expires_at)

    def authorize(self, session, proof):
        """Recheck proof/account/expiry in the DOMAIN transaction before lookup/replay."""
        stored = self._session(session, proof.token_verifier)
        if (stored.account_id != proof.account_id or stored.expires_at != proof.expires_at
                or not hmac.compare_digest(stored.csrf_token, proof.csrf_token)):
            raise DomainError(401, "Authentication required")

    def reserve_attempt(self, action):
        """Commit before parsing: <=2 global rows, serialized by BEGIN IMMEDIATE.

        Every allowed-Origin attempt counts, including malformed/successful ones.
        This bounded local limiter is not a production public-DoS solution.
        """
        if action not in ("login", "signup"):
            raise ValueError("Unknown authentication action")
        self._require_schema()
        limit = LOGIN_ATTEMPTS if action == "login" else SIGNUP_ATTEMPTS
        retry_after = None
        with self.database.transaction(write=True) as session:
            now = self._now()
            throttle = session.get(ActionThrottle, action)
            if throttle is None:
                throttle = ActionThrottle(action=action, window_started_at=now, attempts=0)
                session.add(throttle)
            elif now >= throttle.window_started_at + LOGIN_WINDOW:
                throttle.window_started_at = now
                throttle.attempts = 0
            if throttle.attempts >= limit:
                retry_after = max(1, math.ceil((throttle.window_started_at + LOGIN_WINDOW - now).total_seconds()))
            else:
                throttle.attempts += 1
        if retry_after is not None:
            raise DomainError(429, f"Too many {action} attempts", headers={"Retry-After": str(retry_after)})

    def reserve_login_attempt(self):
        self.reserve_attempt("login")

    def _signup_allowed(self, session, prior_token):
        verifier = _session_verifier(prior_token)
        stored = session.get(WebSession, verifier) if verifier is not None else None
        if stored is not None and stored.expires_at > self._now():
            raise DomainError(409, "Sign out before creating an account")

    def require_signup_allowed(self, prior_token):
        self._require_schema()
        with self.database.transaction() as session:
            self._signup_allowed(session, prior_token)

    def signup(self, prior_token=None):
        """Generate once for a NEW empty account; return only after commit, no session.

        Losing this response loses the code. There is deliberately no recovery,
        reissue, administrative bootstrap, or implicit claim of legacy data.
        """
        self._require_schema()
        with self.database.transaction(write=True) as session:
            self._signup_allowed(session, prior_token)
            # All writers are serialized, so collision retries cannot change an
            # existing verifier or race the unique constraint before commit.
            for _ in range(8):
                code = generate_access_code()
                verifier = _code_verifier(normalize_access_code(code))
                if session.scalar(select(Account.id).where(Account.code_verifier == verifier)) is None:
                    break
            else:
                raise StorageUnavailable()
            account_id = uuid4()
            session.add(Account(id=account_id, code_verifier=verifier, created_at=self._now()))
        return SignupOut(account_id=account_id, code=code)

    def login(self, code, prior_token=None):
        """Called after a committed attempt reservation and bounded parsing."""
        self._require_schema()
        normalized = normalize_access_code(code)
        verifier = _code_verifier(normalized if normalized is not None else "")
        proof = token = None
        with self.database.transaction(write=True) as session:
            account = session.scalar(select(Account).where(Account.code_verifier == verifier))
            matched = hmac.compare_digest(verifier, account.code_verifier if account is not None else "0" * 64)
            if account is not None and matched and normalized is not None:
                now = self._now()
                session.execute(delete(WebSession).where(WebSession.expires_at <= now))
                prior_verifier = _session_verifier(prior_token)
                if prior_verifier is not None:
                    session.execute(delete(WebSession).where(WebSession.token_verifier == prior_verifier))
                token = secrets.token_urlsafe(32)
                proof = SessionProof(account.id, _session_verifier(token), secrets.token_urlsafe(32), now + SESSION_LIFETIME)
                session.add(WebSession(token_verifier=proof.token_verifier, account_id=account.id,
                                       csrf_token=proof.csrf_token, created_at=now, expires_at=proof.expires_at))
        if proof is None:
            raise DomainError(401, "Authentication failed")
        return token, proof

    def logout(self, proof):
        with self.database.transaction(write=True) as session:
            self.authorize(session, proof)
            session.execute(delete(WebSession).where(WebSession.token_verifier == proof.token_verifier))
