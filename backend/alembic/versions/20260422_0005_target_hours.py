"""add settings.target_hours_per_day

Revision ID: 20260422_0005
Revises: 20260422_0004
Create Date: 2026-04-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260422_0005"
down_revision = "20260422_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "settings",
        sa.Column("target_hours_per_day", sa.Integer, nullable=False, server_default="8"),
    )


def downgrade() -> None:
    op.drop_column("settings", "target_hours_per_day")
