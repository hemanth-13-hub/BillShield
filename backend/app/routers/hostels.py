"""
Hostels & Blocks catalog router for BillShield API.
Exposes Aditya University Hostel Categories (Boys / Girls) and Blocks (A-G).
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import HostelCategory
from app.schemas import HostelCategoryOut
from app.services.bootstrap import ensure_reference_data

router = APIRouter(prefix="/hostels", tags=["hostels"])


@router.get(
    "",
    response_model=list[HostelCategoryOut],
    summary="List hostel categories and blocks (A-G)",
)
def list_hostels(db: Session = Depends(get_db)) -> list[HostelCategory]:
    stmt = (
        select(HostelCategory)
        .options(selectinload(HostelCategory.blocks))
        .order_by(HostelCategory.code.asc())
    )
    categories = list(db.scalars(stmt).all())
    if not categories:
        ensure_reference_data(db)
        categories = list(db.scalars(stmt).all())
    for cat in categories:
        cat.blocks.sort(key=lambda b: b.code)
    return categories

