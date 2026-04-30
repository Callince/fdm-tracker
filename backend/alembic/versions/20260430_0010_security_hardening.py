"""Security hardening: password_changed_at, refresh_token_jti, hmac_nonces, audit_logs, server-clock timestamps

Revision ID: 20260430_0010
Revises: 20260430_0009
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "20260430_0010"
down_revision = "20260430_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: record when password was last changed so sessions issued before the change can be force-expired
    op.add_column(
        "users",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # devices: store the JTI of the current valid refresh token for rotation / reuse detection
    op.add_column(
        "devices",
        sa.Column("refresh_token_jti", sa.String(64), nullable=True),
    )
    op.create_index("ix_devices_refresh_token_jti", "devices", ["refresh_token_jti"])

    # work_sessions: server-authoritative timestamps alongside client-supplied ones
    op.add_column(
        "work_sessions",
        sa.Column(
            "server_started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.add_column(
        "work_sessions",
        sa.Column("server_ended_at", sa.DateTime(timezone=True), nullable=True),
    )

    # break_logs: same server-clock treatment
    op.add_column(
        "break_logs",
        sa.Column(
            "server_started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=True,
        ),
    )
    op.add_column(
        "break_logs",
        sa.Column("server_ended_at", sa.DateTime(timezone=True), nullable=True),
    )

    # hmac_nonces: replay-prevention store; GC via background job deleting rows with expires_at < now()
    op.create_table(
        "hmac_nonces",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "device_id",
            UUID(as_uuid=True),
            sa.ForeignKey("devices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("nonce", sa.String(128), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("device_id", "nonce", name="uq_hmac_nonce"),
    )
    op.create_index("ix_hmac_nonces_device_id", "hmac_nonces", ["device_id"])
    op.create_index("ix_hmac_nonces_expires_at", "hmac_nonces", ["expires_at"])

    # audit_logs: immutable append-only log of auth and admin actions
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=True),
        sa.Column("target_id", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_hmac_nonces_expires_at", table_name="hmac_nonces")
    op.drop_index("ix_hmac_nonces_device_id", table_name="hmac_nonces")
    op.drop_table("hmac_nonces")

    op.drop_column("break_logs", "server_ended_at")
    op.drop_column("break_logs", "server_started_at")
    op.drop_column("work_sessions", "server_ended_at")
    op.drop_column("work_sessions", "server_started_at")

    op.drop_index("ix_devices_refresh_token_jti", table_name="devices")
    op.drop_column("devices", "refresh_token_jti")

    op.drop_column("users", "password_changed_at")
