"""
BillShield FastAPI application.

Startup behaviour
─────────────────
On first run (or after deleting billshield.db) Base.metadata.create_all()
creates all tables.  Run seed.py once after first startup to populate
hostel / room / appliance / student reference data.

Router mount points (all prefixed /api/v1):
  /health        – liveness check (this phase)
  /rooms         – room CRUD              (Phase 2)
  /readings      – room reading CRUD      (Phase 3)
  /hostel-meter  – hostel meter readings  (Phase 3)
  /verify        – bill verification      (Phase 5)
  /simulate      – demo data generation   (Phase 4)
  /settings      – rate & tolerance       (Phase 6)
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import config
from app.database import Base, SessionLocal, engine
from app.routers import (
    aggregate,
    billing_periods,
    compare,
    health,
    hostel_meter,
    hostels,
    readings,
    report,
    rooms,
    settings,
    simulation,
    students,
)
from app.services.bootstrap import ensure_reference_data


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Create all DB tables and reference catalog rows on startup (idempotent).
    Yields control to the app, then cleans up on shutdown.
    """
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        ensure_reference_data(db)
    yield
    # Future: add shutdown cleanup (e.g. close connection pool) here


app = FastAPI(
    title=config.app_name,
    version=config.app_version,
    description=(
        "**BillShield** – Smart Hostel Electricity Verification System.\n\n"
        "Lets Aditya University hostel students monitor their room's electricity "
        "consumption and verify it against the official hostel meter reading.\n\n"
        "All readings carry a source tag: *Manual Entry*, *Simulated Demo Data*, "
        "or *Sensor (Future)*.  Simulated data is never presented as real."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow the Vite dev server (port 5173) and local development variants.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(health.router,          prefix=API_PREFIX)
app.include_router(hostels.router,         prefix=API_PREFIX)
app.include_router(rooms.router,           prefix=API_PREFIX)
app.include_router(students.router,        prefix=API_PREFIX)
app.include_router(billing_periods.router, prefix=API_PREFIX)
app.include_router(readings.router,        prefix=API_PREFIX)
app.include_router(hostel_meter.router,    prefix=API_PREFIX)
app.include_router(compare.router,         prefix=API_PREFIX)
app.include_router(aggregate.router,       prefix=API_PREFIX)
app.include_router(simulation.router,      prefix=API_PREFIX)
app.include_router(settings.router,        prefix=API_PREFIX)
app.include_router(report.router,          prefix=API_PREFIX)


# ── Root ──────────────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Redirect bare root to the interactive API docs."""
    return RedirectResponse(url="/docs")
