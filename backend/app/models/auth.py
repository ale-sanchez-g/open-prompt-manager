from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = 'users'

    id = Column(String(32), primary_key=True, default=lambda: f'usr_{uuid4().hex[:12]}')
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    refresh_tokens = relationship('RefreshToken', back_populates='user', cascade='all, delete-orphan')


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(32), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship('User', back_populates='refresh_tokens')
