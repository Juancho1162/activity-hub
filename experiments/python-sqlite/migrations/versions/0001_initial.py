"""Initial fronts, checks, and internal durable idempotency log.

Revision ID: 0001
Revises: None
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "fronts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("reference", sa.String(2048), nullable=True),
        sa.Column("state", sa.String(8), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("instr(name, char(0)) = 0 AND length(name) BETWEEN 1 AND 200 AND name = trim(name, char(9,10,11,12,13,28,29,30,31,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288)) AND length(trim(name, char(9,10,11,12,13,28,29,30,31,32,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288))) > 0", name="ck_fronts_name"),
        sa.CheckConstraint("state IN ('open', 'standby', 'archived')", name="ck_fronts_state"),
        sa.CheckConstraint("reference IS NULL OR (length(reference) BETWEEN 8 AND 2048 AND (reference LIKE 'http://_%' OR reference LIKE 'https://_%'))", name="ck_fronts_reference"),
        sa.CheckConstraint("length(id) = 32 AND id NOT GLOB '*[^0-9a-f]*'", name="ck_fronts_uuid"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "activity_checks",
        sa.Column("front_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.CheckConstraint("length(day) = 10 AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(day,1,4) >= '0001' AND date(day, '+0 days') IS NOT NULL AND date(day, '+0 days') = day", name="ck_activity_checks_day"),
        sa.ForeignKeyConstraint(["front_id"], ["fronts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("front_id", "day"),
    )
    op.create_table(
        "idempotency_requests",
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
        sa.ForeignKeyConstraint(["target"], ["fronts.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade():
    op.drop_table("idempotency_requests")
    op.drop_table("activity_checks")
    op.drop_table("fronts")
