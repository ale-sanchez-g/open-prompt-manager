import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import models so Base.metadata is fully populated before create_all
from app.models.prompt import Prompt, Tag, Agent, PromptMetric, PromptExecution  # noqa
from app.database.base import Base, get_db
from main import app

# File-based SQLite avoids the per-connection isolation issue of in-memory SQLite
TEST_DATABASE_URL = "sqlite:///./test_prompts.db"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test; drop them after for isolation."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
