"""add holidays.kind for working-day exceptions

Revision ID: 20260429_0008
Revises: 20260429_0007
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260429_0008"
down_revision = "20260429_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "holidays",
        sa.Column("kind", sa.String(16), nullable=False, server_default="holiday"),
    )


def downgrade() -> None:
    op.drop_column("holidays", "kind")
