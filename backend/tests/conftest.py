import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import models so Base.metadata is fully populated before create_all
from app.models.prompt import Prompt, Tag, Agent, PromptMetric, PromptExecution  # noqa
import app.database.base as db_module
from app.database.base import Base, get_db
from main import create_app

# Use a shared in-memory SQLite database to avoid on-disk artifacts and support multiple connections
TEST_DATABASE_URL = "sqlite:///file:test_prompts?mode=memory&cache=shared&uri=true"

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


@pytest.fixture
def app():
    """
    Create a fresh application (and therefore a fresh MCP session manager)
    for each test.  This avoids the StreamableHTTPSessionManager one-shot
    constraint that would cause the second test to fail.
    """
    application = create_app()
    application.dependency_overrides[get_db] = override_get_db
    return application


@pytest.fixture(autouse=True)
def setup_database(app):
    """
    Create all tables before each test; drop them after for isolation.

    Also patches ``app.database.base.SessionLocal`` so that MCP tools (which
    call ``SessionLocal()`` directly) use the same in-memory test database as
    the REST API tests.
    """
    Base.metadata.create_all(bind=engine)
    # Patch SessionLocal so MCP tools connect to the test database
    original_session_local = db_module.SessionLocal
    db_module.SessionLocal = TestingSessionLocal
    yield
    Base.metadata.drop_all(bind=engine)
    db_module.SessionLocal = original_session_local
    app.dependency_overrides.clear()


@pytest.fixture
def client(app):
    with TestClient(app, base_url='http://localhost:8000') as c:
        yield c
