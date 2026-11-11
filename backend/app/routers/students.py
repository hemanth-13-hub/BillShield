"""
Students router for BillShield API.
Handles student registration, profile/room updates, and room capacity checks.
Enforces: 3 roommates per room max, unique roll number.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models import Room, Student
from app.schemas import StudentCreate, StudentOut, StudentUpdate
from app.services.bootstrap import sync_student_roommate

router = APIRouter(prefix="/students", tags=["students"])


def _ensure_room_available(db: Session, room_id: int) -> Room:
    """Verify target room exists and currently has fewer than 3 roommates."""
    room = db.get(Room, room_id)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room with id {room_id} not found",
        )
    current_count = db.scalar(
        select(func.count(Student.id)).where(Student.room_id == room_id)
    ) or 0
    if current_count >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Room {room.room_number} is already full (maximum 3 roommates per room)",
        )
    return room


@router.get("", response_model=list[StudentOut], summary="List students")
def list_students(
    room_id: Optional[int] = Query(None, description="Filter students by room"),
    db: Session = Depends(get_db),
) -> list[Student]:
    stmt = select(Student)
    if room_id is not None:
        stmt = stmt.where(Student.room_id == room_id)
    stmt = stmt.order_by(Student.roll_number)
    return list(db.scalars(stmt).all())


@router.get("/{student_id}", response_model=StudentOut, summary="Get student by id")
def get_student(student_id: int, db: Session = Depends(get_db)) -> Student:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )
    return student


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED, summary="Register a student to a room")
def register_student(payload: StudentCreate, db: Session = Depends(get_db)) -> Student:
    name = payload.name.strip()
    roll_number = payload.roll_number.strip().upper()
    if not name or not roll_number:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Student name and roll number are required",
        )

    _ensure_room_available(db, payload.room_id)

    existing_roll = db.scalar(
        select(Student).where(Student.roll_number == roll_number)
    )
    if existing_roll:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student with roll number '{roll_number}' is already registered",
        )

    student = Student(
        room_id=payload.room_id,
        name=name,
        roll_number=roll_number,
    )
    db.add(student)
    db.flush()
    sync_student_roommate(db, student)
    db.commit()
    db.refresh(student)
    return student


@router.put("/{student_id}", response_model=StudentOut, summary="Update student details or room allocation")
def update_student(student_id: int, payload: StudentUpdate, db: Session = Depends(get_db)) -> Student:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )

    if payload.name is not None:
        cleaned_name = payload.name.strip()
        if not cleaned_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Student name cannot be empty",
            )
        student.name = cleaned_name

    if payload.roll_number is not None:
        cleaned_roll = payload.roll_number.strip().upper()
        if not cleaned_roll:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Roll number cannot be empty",
            )
        conflict = db.scalar(
            select(Student).where(
                Student.id != student_id,
                Student.roll_number == cleaned_roll,
            )
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Student with roll number '{cleaned_roll}' is already registered",
            )
        student.roll_number = cleaned_roll

    if payload.room_id is not None and payload.room_id != student.room_id:
        _ensure_room_available(db, payload.room_id)
        student.room_id = payload.room_id
        sync_student_roommate(db, student)

    db.commit()
    db.refresh(student)
    return student


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a student")
def delete_student(student_id: int, db: Session = Depends(get_db)) -> None:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student with id {student_id} not found",
        )
    db.delete(student)
    db.commit()
