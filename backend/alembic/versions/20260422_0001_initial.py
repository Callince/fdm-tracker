"""initial schema

Revision ID: 20260422_0001
Revises:
Create Date: 2026-04-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260422_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False),
        sa.Column("fingerprint", sa.String(128), nullable=False),
        sa.Column("device_secret", sa.String(128), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_devices_user_id", "devices", ["user_id"])

    op.create_table(
        "work_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("client_ip", sa.String(64)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sessions_user_id", "work_sessions", ["user_id"])
    op.create_index("ix_sessions_device_id", "work_sessions", ["device_id"])

    op.create_table(
        "activity_logs",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "device_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("active_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("idle_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("keystroke_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("mouse_event_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("device_id", "client_event_id", name="uq_activity_dedup"),
    )
    op.create_index("ix_activity_user_bucket", "activity_logs", ["user_id", "bucket_start"])
    op.create_index("ix_activity_session_bucket", "activity_logs", ["session_id", "bucket_start"])

    op.create_table(
        "break_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("work_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("reason", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_breaks_user_id", "break_logs", ["user_id"])
    op.create_index("ix_breaks_session_id", "break_logs", ["session_id"])

    op.create_table(
        "daily_summary",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("total_active_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_idle_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_break_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("first_activity_at", sa.DateTime(timezone=True)),
        sa.Column("last_activity_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_summary_user_date"),
    )
    op.create_index("ix_daily_summary_user_id", "daily_summary", ["user_id"])

    op.create_table(
        "settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("idle_threshold_minutes", sa.Integer, nullable=False, server_default="5"),
        sa.Column("workday_start_hour", sa.Integer, nullable=False, server_default="4"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
    )
    op.execute("INSERT INTO settings (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("settings")
    op.drop_index("ix_daily_summary_user_id", table_name="daily_summary")
    op.drop_table("daily_summary")
    op.drop_index("ix_breaks_session_id", table_name="break_logs")
    op.drop_index("ix_breaks_user_id", table_name="break_logs")
    op.drop_table("break_logs")
    op.drop_index("ix_activity_session_bucket", table_name="activity_logs")
    op.drop_index("ix_activity_user_bucket", table_name="activity_logs")
    op.drop_table("activity_logs")
    op.drop_index("ix_sessions_device_id", table_name="work_sessions")
    op.drop_index("ix_sessions_user_id", table_name="work_sessions")
    op.drop_table("work_sessions")
    op.drop_index("ix_devices_user_id", table_name="devices")
    op.drop_table("devices")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
