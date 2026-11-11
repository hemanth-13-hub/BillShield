"""
Rooms router for BillShield API.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_db
from app.models import Block, HostelType, Room, RoomType, Roommate
from app.schemas import RoomCreate, RoomDetail, RoomOut, RoomUpdate, RoommateOut
from app.services.appliances import set_room_appliances
from app.services.bootstrap import resolve_block_id

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomOut], summary="List and filter rooms")
def list_rooms(
    hostel_type: Optional[HostelType] = Query(None, description="Filter by hostel type"),
    block: Optional[Block] = Query(None, description="Filter by block"),
    room_type: Optional[RoomType] = Query(None, description="Filter by AC / Non-AC"),
    floor: Optional[int] = Query(None, ge=0, le=20, description="Filter by floor"),
    db: Session = Depends(get_db),
) -> list[Room]:
    stmt = select(Room)
    if hostel_type is not None:
        stmt = stmt.where(Room.hostel_type == hostel_type.value)
    if block is not None:
        stmt = stmt.where(Room.block == block.value)
    if room_type is not None:
        stmt = stmt.where(Room.room_type == room_type.value)
    if floor is not None:
        stmt = stmt.where(Room.floor == floor)

    stmt = stmt.order_by(Room.hostel_type, Room.block, Room.room_number)
    return list(db.scalars(stmt).all())


@router.post("", response_model=RoomDetail, status_code=status.HTTP_201_CREATED, summary="Create a new room")
def create_room(payload: RoomCreate, db: Session = Depends(get_db)) -> Room:
    normalized_room = payload.room_number.strip().upper()
    if not normalized_room:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Room number is required",
        )

    existing = db.scalar(
        select(Room).where(
            Room.hostel_type == payload.hostel_type.value,
            Room.block == payload.block.value,
            Room.room_number == normalized_room,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Room {normalized_room} in {payload.hostel_type.value} hostel "
                f"block {payload.block.value} already exists"
            ),
        )

    block_id = resolve_block_id(db, payload.hostel_type.value, payload.block.value)
    room = Room(
        block_id=block_id,
        hostel_type=payload.hostel_type.value,
        block=payload.block.value,
        room_number=normalized_room,
        room_type=payload.room_type.value,
        floor=payload.floor,
    )
    db.add(room)
    db.flush()

    set_room_appliances(db, room.id, room.room_type)

    db.commit()
    return get_room(room.id, db)


@router.get("/{room_id}", response_model=RoomDetail, summary="Get room details with students and appliances")
def get_room(room_id: int, db: Session = Depends(get_db)) -> Room:
    stmt = (
        select(Room)
        .options(selectinload(Room.students), selectinload(Room.appliances))
        .where(Room.id == room_id)
    )
    room = db.scalar(stmt)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )
    return room


@router.put("/{room_id}", response_model=RoomDetail, summary="Update room configuration")
def update_room(room_id: int, payload: RoomUpdate, db: Session = Depends(get_db)) -> Room:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )

    next_hostel = payload.hostel_type.value if payload.hostel_type is not None else room.hostel_type
    next_block = payload.block.value if payload.block is not None else room.block
    next_room_num = (
        payload.room_number.strip().upper()
        if payload.room_number is not None
        else room.room_number
    )
    next_room_type = payload.room_type.value if payload.room_type is not None else room.room_type
    next_floor = payload.floor if payload.floor is not None else room.floor

    if not next_room_num:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Room number cannot be empty",
        )

    conflict = db.scalar(
        select(Room).where(
            Room.id != room_id,
            Room.hostel_type == next_hostel,
            Room.block == next_block,
            Room.room_number == next_room_num,
        )
    )
    if conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Room {next_room_num} in {next_hostel} hostel block {next_block} "
                "already exists"
            ),
        )

    room_type_changed = next_room_type != room.room_type

    room.hostel_type = next_hostel
    room.block = next_block
    room.block_id = resolve_block_id(db, next_hostel, next_block)
    room.room_number = next_room_num
    room.room_type = next_room_type
    room.floor = next_floor

    if room_type_changed:
        set_room_appliances(db, room.id, next_room_type)

    db.commit()
    return get_room(room.id, db)


@router.get(
    "/{room_id}/roommates",
    response_model=list[RoommateOut],
    summary="List ordered roommate slots (1-3) assigned to a room",
)
def list_room_roommates(room_id: int, db: Session = Depends(get_db)) -> list[Roommate]:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )
    stmt = (
        select(Roommate)
        .options(selectinload(Roommate.student))
        .where(Roommate.room_id == room_id)
        .order_by(Roommate.slot_number.asc())
    )
    return list(db.scalars(stmt).all())


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a room")
def delete_room(room_id: int, db: Session = Depends(get_db)) -> None:
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )
    db.delete(room)
    db.commit()
