"""Add private owner, server-side web sessions and a bounded login limiter.

Revision ID: 0002
Revises: 0001
No owner or credential is created by migration.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "private_owner",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code_verifier", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_private_owner_singleton"),
        sa.CheckConstraint("length(code_verifier) = 64 AND code_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_private_owner_verifier"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "web_sessions",
        sa.Column("token_verifier", sa.String(64), nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("csrf_token", sa.String(43), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("length(token_verifier) = 64 AND token_verifier NOT GLOB '*[^0-9a-f]*'", name="ck_web_sessions_verifier"),
        sa.CheckConstraint("length(csrf_token) = 43 AND csrf_token NOT GLOB '*[^A-Za-z0-9_-]*'", name="ck_web_sessions_csrf"),
        sa.CheckConstraint("expires_at > created_at", name="ck_web_sessions_expiry"),
        sa.ForeignKeyConstraint(["owner_id"], ["private_owner.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_verifier"),
    )
    op.create_index("ix_web_sessions_expires_at", "web_sessions", ["expires_at"])
    op.create_table(
        "login_throttle",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_login_throttle_singleton"),
        sa.CheckConstraint("attempts BETWEEN 0 AND 10", name="ck_login_throttle_attempts"),
        sa.ForeignKeyConstraint(["id"], ["private_owner.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade():
    op.drop_table("login_throttle")
    op.drop_index("ix_web_sessions_expires_at", table_name="web_sessions")
    op.drop_table("web_sessions")
    op.drop_table("private_owner")
