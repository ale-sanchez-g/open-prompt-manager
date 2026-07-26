from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, false
from sqlalchemy.orm import relationship

from app.database.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = 'users'

    id = Column(String(32), primary_key=True, default=lambda: f'usr_{uuid4().hex[:12]}')
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default='user', server_default='user')
    created_at = Column(DateTime, default=_utcnow)

    # --- Extended registration fields (OPM-FLAG-REG-001, expand phase) --------
    # All nullable with safe defaults: rows created while the
    # registration_extended_fields flag is off simply leave them null. No NOT NULL,
    # enum or check constraints until the contract phase (spec §10).
    #
    # These live on the contract branch rather than the DB branch so the backend
    # and frontend branches can build against them in parallel; the *migration*
    # that adds them to an existing database is the DB branch's work.
    #
    # server_default uses false() rather than a literal so it renders correctly
    # on both dialects in play: SQLite in development, Postgres in RDS.
    company_name = Column(String(200), nullable=True)
    job_role = Column(String(120), nullable=True)
    phone = Column(String(32), nullable=True)  # PII - normalised before storage
    marketing_opt_in = Column(Boolean, nullable=True, default=False, server_default=false())
    # Consent evidence: what was agreed, and when. A bare boolean does not record
    # which copy the user was shown (spec guardrail 8).
    marketing_consent_at = Column(DateTime, nullable=True)
    marketing_consent_version = Column(String(32), nullable=True)

    refresh_tokens = relationship('RefreshToken', back_populates='user', cascade='all, delete-orphan')


class RefreshToken(Base):
    __tablename__ = 'refresh_tokens'

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id = Column(String(32), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship('User', back_populates='refresh_tokens')
