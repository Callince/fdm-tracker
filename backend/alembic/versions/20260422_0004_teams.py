"""add teams + users.team_id

Revision ID: 20260422_0004
Revises: 20260422_0003
Create Date: 2026-04-22
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260422_0004"
down_revision = "20260422_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teams",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_teams_name"),
    )
    op.create_index("ix_teams_name", "teams", ["name"])

    op.add_column(
        "users",
        sa.Column(
            "team_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("teams.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_users_team_id", "users", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_users_team_id", table_name="users")
    op.drop_column("users", "team_id")
    op.drop_index("ix_teams_name", table_name="teams")
    op.drop_table("teams")
