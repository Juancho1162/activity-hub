"""Private accounts, domain/replay tables and opaque web authentication."""
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """SQLite stores UTC without an offset; Python always receives aware UTC."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("UTC metadata requires an aware datetime")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


# The characters trimmed by Python str.strip(), expressed using SQLite char().
_TRIM = "trim(name, char(9,10,11,12,13,28,29,30,31,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288))"


class Front(Base):
    __tablename__ = "fronts"
    __table_args__ = (
        CheckConstraint(f"instr(name, char(0)) = 0 AND length(name) BETWEEN 1 AND 200 AND name = {_TRIM} AND length({_TRIM}) > 0", name="ck_fronts_name"),
        CheckConstraint("state IN ('open', 'standby', 'archived')", name="ck_fronts_state"),
        CheckConstraint("reference IS NULL OR (length(reference) BETWEEN 8 AND 2048 AND (reference LIKE 'http://_%' OR reference LIKE 'https://_%'))", name="ck_fronts_reference"),
        CheckConstraint("length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'", name="ck_fronts_uuid"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    account_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("accounts.id"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(2048))
    state: Mapped[str] = mapped_column(String(8), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)


class ActivityCheck(Base):
    __tablename__ = "activity_checks"
    __table_args__ = (
        CheckConstraint("length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(day,1,4) >= '0001' AND date(day, '+0 days') IS NOT NULL AND date(day, '+0 days') = day", name="ck_activity_checks_day"),
    )
    # Composite primary key is the database-level per-front/day uniqueness rule.
    front_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("fronts.id", ondelete="RESTRICT"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)


class IdempotencyRequest(Base):
    __tablename__ = "idempotency_requests"
    __table_args__ = (
        CheckConstraint("operation IN ('create_front', 'write_check')", name="ck_idempotency_operation"),
        CheckConstraint("(operation = 'create_front' AND target IS NULL) OR (operation = 'write_check' AND target IS NOT NULL)", name="ck_idempotency_target"),
        CheckConstraint("json_valid(payload) AND json_valid(response)", name="ck_idempotency_json"),
        CheckConstraint("length(key) = 32 AND key NOT GLOB '*[^0-9a-f]*'", name="ck_idempotency_uuid"),
    )
    account_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("accounts.id", ondelete="RESTRICT"), primary_key=True, nullable=True)
    key: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    operation: Mapped[str] = mapped_column(String(20), nullable=False)
    target: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("fronts.id", ondelete="RESTRICT"))
    payload: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'", name="ck_accounts_uuid"),
        CheckConstraint("length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_accounts_verifier"),
    )
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    code_verifier: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    # Preserve legacy metadata, never used to replace a credential.
    legacy_updated_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class WebSession(Base):
    __tablename__ = "web_sessions"
    __table_args__ = (
        CheckConstraint("length(token_verifier) = 64 AND token_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_web_sessions_verifier"),
        CheckConstraint("length(csrf_token) = 43 AND csrf_token NOT GLOB '*[^A-Za-z0-9_-]*'", name="ck_web_sessions_csrf"),
        CheckConstraint("expires_at > created_at", name="ck_web_sessions_expiry"),
    )
    token_verifier: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(43), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)


class ActionThrottle(Base):
    __tablename__ = "action_throttle"
    __table_args__ = (
        CheckConstraint("action IN ('login', 'signup')", name="ck_action_throttle_action"),
        CheckConstraint("attempts >= 0 AND ((action = 'login' AND attempts <= 10) OR (action = 'signup' AND attempts <= 5))", name="ck_action_throttle_attempts"),
    )
    action: Mapped[str] = mapped_column(String(6), primary_key=True)
    window_started_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
