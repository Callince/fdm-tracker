"""HMAC replay-protection nonce store.

One row per (device_id, mac_hex) seen on a signed request. The composite
PK forces an IntegrityError on replay. Rows older than the clock-skew
window are pruned periodically.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class HmacNonce(Base):
    __tablename__ = "hmac_nonces"

    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("devices.id", ondelete="CASCADE"),
        primary_key=True,
    )
    mac_hex: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_hmac_nonces_expires", "expires_at"),)
