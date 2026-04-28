"""add users.position

Revision ID: 20260422_0003
Revises: 20260422_0002
Create Date: 2026-04-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260422_0003"
down_revision = "20260422_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("position", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "position")
