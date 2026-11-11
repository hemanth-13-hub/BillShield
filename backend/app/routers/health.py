"""
Health-check router for BillShield API.
GET /api/v1/health  →  confirms the app is running and lists all DB tables.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.database import engine
from app.dependencies import get_db
from app.schemas import HealthOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut, summary="API health check")
def health_check(db: Session = Depends(get_db)) -> HealthOut:
    """
    Returns:
      - status: "ok" if the app and DB are reachable
      - db_tables: sorted list of SQLite tables that have been created
    """
    # Quick DB connectivity test
    db.execute(text("SELECT 1"))

    # List tables via SQLAlchemy inspector (SQLAlchemy 2.x API)
    inspector = inspect(engine)
    tables = sorted(inspector.get_table_names())

    return HealthOut(
        status="ok",
        app="BillShield API",
        version="1.0.0",
        db_tables=tables,
    )
