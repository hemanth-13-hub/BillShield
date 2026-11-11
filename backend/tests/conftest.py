"""
Pytest configuration and isolated SQLite database fixtures for BillShield tests.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.database import Base  # noqa: E402
from app.dependencies import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import health as health_router  # noqa: E402
from app.services.bootstrap import ensure_reference_data  # noqa: E402


@pytest.fixture()
def test_db(tmp_path: Path) -> Generator[Session, None, None]:
    db_file = tmp_path / "test_billshield.db"
    test_engine = create_engine(
        f"sqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(test_engine, "connect")
    def _pragmas(dbapi_conn, _record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=test_engine
    )
    Base.metadata.create_all(bind=test_engine)

    with TestingSessionLocal() as db:
        ensure_reference_data(db)

    orig_health_engine = health_router.engine
    health_router.engine = test_engine

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        health_router.engine = orig_health_engine
        test_engine.dispose()


@pytest.fixture()
def client(test_db: Session) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        yield test_db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()

