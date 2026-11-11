"""
FastAPI dependency injection helpers for BillShield.
"""

from collections.abc import Generator

from sqlalchemy.orm import Session

from app.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    Yield a SQLAlchemy Session for the duration of a request, then close it.

    Usage in route functions:
        db: Session = Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
