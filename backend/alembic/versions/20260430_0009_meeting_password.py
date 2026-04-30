"""add meetings.meeting_password

Revision ID: 20260430_0009
Revises: 20260429_0008
Create Date: 2026-04-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "20260430_0009"
down_revision = "20260429_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("meeting_password", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "meeting_password")
