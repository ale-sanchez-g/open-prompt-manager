"""Unit tests for database helpers and auth model utilities."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import inspect, text

import app.database.base as db_module
from app.database.base import get_db, create_tables
from app.models.auth import _utcnow


# ── get_db ────────────────────────────────────────────────────────────────────

def test_get_db_yields_a_session():
    """get_db must yield a session object that can be used for queries."""
    gen = get_db()
    session = next(gen)
    try:
        # If a session was yielded, it should support execute
        result = session.execute(text("SELECT 1"))
        assert result is not None
    finally:
        try:
            gen.close()
        except StopIteration:
            pass


def test_get_db_closes_session_on_generator_close():
    """get_db must close the session in the finally block (kills mutations removing db.close)."""
    from unittest.mock import MagicMock, patch

    mock_session = MagicMock()
    with patch.object(db_module, 'SessionLocal', return_value=mock_session):
        gen = get_db()
        yielded = next(gen)
        assert yielded is mock_session
        # Closing the generator triggers the finally block
        gen.close()
        mock_session.close.assert_called_once()


def test_get_db_closes_session_after_exception():
    """Session must be closed even when an exception propagates out of the with-block."""
    from unittest.mock import MagicMock, patch

    mock_session = MagicMock()
    with patch.object(db_module, 'SessionLocal', return_value=mock_session):
        gen = get_db()
        next(gen)
        with pytest.raises(Exception):
            gen.throw(Exception("test error"))
        mock_session.close.assert_called_once()


# ── create_tables ─────────────────────────────────────────────────────────────

def test_create_tables_creates_expected_tables():
    """create_tables must call Base.metadata.create_all, which creates all model tables."""
    create_tables()
    inspector = inspect(db_module.engine)
    tables = inspector.get_table_names()
    assert 'users' in tables
    assert 'refresh_tokens' in tables
    assert 'prompts' in tables
    assert 'tags' in tables


def test_create_tables_is_idempotent():
    """Calling create_tables twice must not raise."""
    create_tables()
    create_tables()  # second call must not raise


# ── models.auth._utcnow ───────────────────────────────────────────────────────

def test_utcnow_returns_naive_datetime():
    """_utcnow must return a naive datetime (no tzinfo) — .replace(tzinfo=None) must run."""
    result = _utcnow()
    assert isinstance(result, datetime)
    assert result.tzinfo is None


def test_utcnow_is_close_to_now():
    """_utcnow must return a value close to the current UTC time."""
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    result = _utcnow()
    after = datetime.now(timezone.utc).replace(tzinfo=None)
    assert before <= result <= after


def test_utcnow_differs_from_local_if_different_timezone():
    """Ensures _utcnow is based on UTC, not local time."""
    import time
    result = _utcnow()
    # The result should be within 1 second of now UTC
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    diff = abs((now_utc - result).total_seconds())
    assert diff < 2.0
