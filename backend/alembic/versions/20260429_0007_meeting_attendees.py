"""replace meetings.team_id with meeting_attendees join table

Revision ID: 20260429_0007
Revises: 20260429_0006
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "20260429_0007"
down_revision = "20260429_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meeting_attendees",
        sa.Column(
            "meeting_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("meetings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("meeting_id", "user_id", name="pk_meeting_attendees"),
    )
    op.create_index("ix_meeting_attendees_user_id", "meeting_attendees", ["user_id"])

    op.drop_index("ix_meetings_team_id", table_name="meetings")
    op.drop_column("meetings", "team_id")


def downgrade() -> None:
    op.add_column(
        "meetings",
        sa.Column("team_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "meetings_team_id_fkey", "meetings", "teams", ["team_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_meetings_team_id", "meetings", ["team_id"])
    op.drop_index("ix_meeting_attendees_user_id", table_name="meeting_attendees")
    op.drop_table("meeting_attendees")
