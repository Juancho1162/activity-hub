"""Open private accounts, immutable credentials and account-scoped replay keys.

Revision ID: 0003
Revises: 0002
The current legacy verifier/timestamps are imported unchanged into a stable UUID.
Ownerless domain/replay rows remain NULL-owned and cannot be claimed by signup.
Legacy sessions are explicitly revoked because the account-context protocol changes.
Downgrade refuses to merge private accounts or remove ownership.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

# Fixed identity for the one legacy owner; no new code or public account is made.
LEGACY_ACCOUNT_HEX = "9bab56e2fe2c4a32b6ca2331c5a8f76a"


def upgrade():
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code_verifier", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("legacy_updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'", name="ck_accounts_uuid"),
        sa.CheckConstraint("length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_accounts_verifier"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code_verifier"),
    )
    op.execute(sa.text("INSERT INTO accounts (id, code_verifier, created_at, legacy_updated_at) "
                       f"SELECT '{LEGACY_ACCOUNT_HEX}', code_verifier, created_at, updated_at FROM private_owner WHERE id=1"))
    op.execute("CREATE TRIGGER accounts_code_immutable BEFORE UPDATE OF code_verifier ON accounts "
               "BEGIN SELECT RAISE(ABORT, 'Account code is immutable'); END")
    # SQLite supports a nullable REFERENCES column directly. Do NOT batch/drop
    # fronts: checks and replay targets reference it, with foreign_keys enabled.
    op.execute("ALTER TABLE fronts ADD COLUMN account_id CHAR(32) REFERENCES accounts(id)")
    op.execute(sa.text("UPDATE fronts SET account_id = (SELECT id FROM accounts LIMIT 1)"))
    op.create_table(
        "account_replays",
        sa.Column("account_id", sa.Uuid(), nullable=True),
        sa.Column("key", sa.Uuid(), nullable=False),
        sa.Column("operation", sa.String(20), nullable=False),
        sa.Column("target", sa.Uuid(), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("response", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("operation IN ('create_front', 'write_check')", name="ck_idempotency_operation"),
        sa.CheckConstraint("(operation = 'create_front' AND target IS NULL) OR (operation = 'write_check' AND target IS NOT NULL)", name="ck_idempotency_target"),
        sa.CheckConstraint("json_valid(payload) AND json_valid(response)", name="ck_idempotency_json"),
        sa.CheckConstraint("length(key) = 32 AND key NOT GLOB '*[^0-9a-f]*'", name="ck_idempotency_uuid"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["target"], ["fronts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("account_id", "key"),
    )
    op.execute("INSERT INTO account_replays (account_id,key,operation,target,payload,response,created_at) "
               "SELECT (SELECT id FROM accounts LIMIT 1),key,operation,target,payload,response,created_at FROM idempotency_requests")
    op.drop_table("idempotency_requests")
    op.rename_table("account_replays", "idempotency_requests")
    op.create_table(
        "action_throttle",
        sa.Column("action", sa.String(6), nullable=False),
        sa.Column("window_started_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.CheckConstraint("action IN ('login', 'signup')", name="ck_action_throttle_action"),
        sa.CheckConstraint("attempts >= 0 AND ((action = 'login' AND attempts <= 10) OR (action = 'signup' AND attempts <= 5))", name="ck_action_throttle_attempts"),
        sa.PrimaryKeyConstraint("action"),
    )
    op.execute("INSERT INTO action_throttle SELECT 'login', window_started_at, attempts FROM login_throttle")
    op.drop_table("login_throttle")
    op.drop_index("ix_web_sessions_expires_at", table_name="web_sessions")
    op.drop_table("web_sessions")
    op.create_table(
        "web_sessions",
        sa.Column("token_verifier", sa.String(64), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("csrf_token", sa.String(43), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("length(token_verifier) = 64 AND token_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_web_sessions_verifier"),
        sa.CheckConstraint("length(csrf_token) = 43 AND csrf_token NOT GLOB '*[^A-Za-z0-9_-]*'", name="ck_web_sessions_csrf"),
        sa.CheckConstraint("expires_at > created_at", name="ck_web_sessions_expiry"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_verifier"),
    )
    op.create_index("ix_web_sessions_expires_at", "web_sessions", ["expires_at"])
    op.drop_table("private_owner")


def downgrade():
    raise RuntimeError("Downgrade refused: cannot merge private accounts or remove ownership")
