# ⚡ BillShield — Smart Hostel Electricity Verification System

> **Transparent Dual-Meter Electricity Monitoring & Bill Verification Platform for Aditya University Hostels**

BillShield empowers hostel students to record independent room-level electricity meter readings, compare them side-by-side against official hostel billing meter readings for the exact same billing period, analyze consumption trends interactively, maintain a tamper-transparent reading audit log, and download verification evidence reports as PDFs.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Problem Statement](#problem-statement)
3. [Objectives](#objectives)
4. [Implemented Features](#implemented-features)
5. [Technology Stack](#technology-stack)
6. [System Architecture](#system-architecture)
7. [Project Folder Structure](#project-folder-structure)
8. [Installation & Setup Instructions](#installation--setup-instructions)
9. [Running Frontend & Backend](#running-frontend--backend)
10. [API Documentation](#api-documentation)
11. [Testing Instructions](#testing-instructions)
12. [Screenshots](#screenshots)
13. [Known Limitations](#known-limitations)
14. [Future Scope: ESP32 Hardware Integration](#future-scope-esp32-hardware-integration)
15. [Team Members & Contributions](#team-members--contributions)

---

## Project Overview

Hostel residents at **Aditya University** are organized across **Boys Hostel (Blocks A–G)** and **Girls Hostel (Blocks A–G)**, with both **AC** and **Non-AC** room categories housing **three roommates per room**. Monthly electricity bills are traditionally issued solely from consolidated hostel-side meter sheets without giving students an easy way to cross-check room consumption over the exact billing dates.

BillShield closes this visibility gap cleanly:
- Students register their room configuration in a demo workspace (**not** official university authentication and with **zero invented student/room records**).
- Every room maintains strictly isolated meter ledgers.
- Room Sensor readings and Hostel Meter readings must share the exact same **Billing Period** and **Electrical Boundary** before verification runs.
- Every reading carries a mandatory origin badge (`Manual Entry`, `SIMULATED DATA`, or `Sensor (Future)`). Simulated demonstration data is never presented as real physical sensor output.

---

## Problem Statement

Students sharing university hostel rooms often receive high monthly electricity charges without granular visibility into starting meter indices, ending indices, unit tariffs, or per-appliance baseline loads. Comparing two separate readings manually across notebooks or spreadsheets easily introduces billing-period mismatches, calculation discrepancies, and disputes without clear verification evidence.

---

## Objectives

1. **Structured Room Identity**: Model Aditya University's Boys/Girls hostel hierarchy, Blocks A–G, AC/Non-AC room configurations, and fixed 3-roommate allocation per room.
2. **Dual-Meter Accountability**: Record Room Sensor (student-side) and Hostel Meter (billing-side) start/end indices, timestamps, and billed amounts independently per room.
3. **Billing Period Alignment**: Enforce database-level and API-level checks so comparisons only execute within identical billing windows.
4. **Transparent Verdicts**: Classify discrepancies without accusing fraud (`Readings Match`, `Minor Variation`, `Significant Mismatch`) using configurable tariff rates (`₹/kWh`) and tolerance thresholds (`±%`).
5. **Interactive Analytics & Audit Evidence**: Visualize consumption across Hourly, Daily, Weekly, Monthly, Cumulative, and AC vs Non-AC views, maintain editable/deletable reading history, and export verification PDF reports containing graphs and explicit `DEMO / SIMULATED DATA` watermarks when applicable.

---

## Implemented Features

### 1. Student Registration & Profile Management (`/register`)
- Captures Student Full Name, University Roll Number, Hostel Category (`Boys` / `Girls`), Block (`A`–`G`), Room Number, Room Type (`AC` / `Non-AC`), and Floor.
- Validates required fields and roll/room formatting client- and server-side.
- Persists demo registration session across reloads (`localStorage` synced with FastAPI SQLite) and supports editing room allocation.
- Prominently displays a **Project Demonstration Notice — Not Official University Authentication**.

### 2. Room Configuration Module (`/room`)
- Standard appliance profiles automatically provisioned by room type:
  - **AC Room (5 appliance types)**: 1 Air Conditioner (1500W), 2 Normal Fans (75W), 2 Tube Lights (40W), 1 Washroom Light (15W), 1 Balcony Light (15W).
  - **Non-AC Room (4 appliance types)**: 2 Normal Fans (75W), 2 Tube Lights (40W), 1 Washroom Light (15W), 1 Balcony Light (15W).
- Fixed 3-roommate slot roster with per-room isolation guarantee.
- Shared room consumption card + toggleable equal 3-way per-roommate cost estimate.

### 3. Dual Meter Monitoring & Comparison (`/readings`, `/compare`)
- Side-by-side manual entry forms for **Room Sensor Reading** and **Hostel Meter Reading** with date/time stamps.
- Live consumption calculation (`Ending − Starting`) and billing period mismatch alerts with quick period alignment.
- Non-decreasing cumulative meter validation across billing periods.
- Clear verdict engine (`Readings Match` ≤ ±tol, `Minor Variation` ≤ ±2×tol, `Significant Mismatch` > ±2×tol) plus boundary & circuit alignment guidance.

### 4. Electricity Analytics (`/analytics`)
- Interactive **Recharts** responsive line graphs with legends, tooltips, date range filters, and difference series toggle:
  1. Hourly Electricity Consumption (interpolated from period totals)
  2. Daily Electricity Consumption (interpolated from period totals)
  3. Weekly Electricity Consumption (interpolated from period totals)
  4. Monthly Electricity Consumption (direct billing totals)
  5. Cumulative Room Sensor vs Hostel Meter Trajectory
  6. AC vs Non-AC Average Consumption Comparison
- Prominent `SIMULATED DATA` disclosures whenever simulated datasets are plotted.

### 5. Reading History (`/history`)
- Consolidated per-period history showing Room & Hostel start/end indices, calculated units, applied rate (`₹/kWh`), bill amounts, unit differences, timestamps, source tags, and verification verdict.
- Search by billing period/notes, filter by reading source or completeness, and sort ascending/descending by date, period, or difference.
- Record Detail Modal, Two-Step Confirmed Edit Modal (`PUT`), and scoped Delete Confirmation Modal (`DELETE`).

### 6. Downloadable PDF Evidence Reports (`/report` & FastAPI `/report/pdf`)
- Server-generated vector PDF certificates via **ReportLab** using the exact same `compute_comparison` backend logic as the web UI:
  - BillShield & Aditya University branding, Report Reference ID, and IST generation timestamp
  - Student name & roll number, hostel category, block, room number, AC/Non-AC type
  - Billing window, start/end indices, consumed units, unit difference, tariff rate, expected vs hostel bills, rupee delta
  - Vector Consumption Comparison bar graph (Room Sensor vs Hostel Meter in kWh)
  - Verification notes & boundary limitations + diagonal `DEMO / SIMULATED DATA` watermark across pages when simulated records appear.

### 7. Configurable Verification Parameters (`/settings`)
- Edit electricity tariff rate (default `₹10.00/kWh`) and match tolerance (default `±5.0%`), automatically syncing stored verification results.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend UI** | React 18, TypeScript (strict), Vite 5, Tailwind CSS v3 |
| **Charts & Routing** | Recharts v2, React Router v6 |
| **Backend API** | Python 3.11+, FastAPI, Uvicorn, Pydantic v2, `pydantic-settings` |
| **Database & ORM** | SQLite (WAL mode + `PRAGMA foreign_keys=ON`), SQLAlchemy 2.0 |
| **PDF Engine** | ReportLab (`reportlab>=4.2.0`) |
| **Automated Testing** | Pytest, FastAPI `TestClient` (`httpx`), TypeScript Compiler (`tsc`), Vite Build |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ React 18 + TypeScript Frontend (Vite Dev Server :5173)               │
│  ├── AuthContext & RoomContext (strict room isolation by roomId)     │
│  ├── Recharts Analytics / History CRUD / Report PDF Downloader       │
│  └── Proxy (/api/* ──▶ VITE_BACKEND_URL http://127.0.0.1:8000)       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ REST JSON / PDF Stream
┌───────────────────────────────▼──────────────────────────────────────┐
│ FastAPI Backend (:8000 /api/v1)                                      │
│  ├── Routers: health, hostels, rooms, students, billing_periods,     │
│  │            readings, hostel_meter, compare, aggregate,            │
│  │            simulation, settings, report                           │
│  ├── Services: appliances, compare, aggregate, simulate,             │
│  │             bootstrap, pdf_report (ReportLab)                     │
│  └── SQLAlchemy 2.0 ORM + Pydantic v2 Validation                     │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ SQLite + PRAGMA foreign_keys=ON
┌───────────────────────────────▼──────────────────────────────────────┐
│ SQLite Database (11 Tables)                                          │
│  hostel_categories ─▶ blocks ─▶ rooms ─┬─▶ roommates ◀── students    │
│                                        ├─▶ appliances                │
│                                        ├─▶ room_readings ───┐        │
│                                        ├─▶ hostel_meter ────┼─▶ verification_results
│  settings (rate & tolerance)           └─▶ billing_periods ─┘        │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Project Folder Structure

```text
BillShield/
├── .env.example                       # Placeholder env configuration template
├── .gitignore                         # Excludes node_modules, venv, .env, *.db, builds
├── README.md                          # Complete project documentation
├── screenshots/                       # UI screenshot directory & capture index
│   └── README.md
├── backend/
│   ├── .env.example                   # Backend env placeholders
│   ├── README.md                      # Backend service quickstart
│   ├── requirements.txt               # Python dependencies (FastAPI, SQLAlchemy, ReportLab, Pytest)
│   ├── run.py                         # Uvicorn entrypoint driven by AppConfig env vars
│   ├── seed.py                        # Initializes 11 tables + Boys/Girls Blocks A-G (+ optional --demo)
│   ├── app/
│   │   ├── config.py                  # Pydantic Settings loader (.env support, no hardcoded secrets)
│   │   ├── database.py                # SQLAlchemy engine, WAL + FK PRAGMAs, SessionLocal
│   │   ├── dependencies.py            # get_db() request session dependency
│   │   ├── main.py                    # FastAPI app, lifespan bootstrap, CORS, Swagger /docs
│   │   ├── models.py                  # 11 ORM models (Room, Student, Roommate, HostelCategory, Block, etc.)
│   │   ├── schemas.py                 # Pydantic v2 validation & response models
│   │   ├── routers/
│   │   │   ├── aggregate.py           # Hourly/Daily/Weekly/Monthly & AC/Non-AC analytics
│   │   │   ├── billing_periods.py     # Period CRUD + overlap prevention
│   │   │   ├── compare.py             # /compare verification & /verifications history
│   │   │   ├── health.py              # /health DB & table inspector
│   │   │   ├── hostel_meter.py        # Hostel meter CRUD & continuity checks
│   │   │   ├── hostels.py             # Boys/Girls & Blocks A-G catalog endpoint
│   │   │   ├── readings.py            # Room sensor CRUD & continuity checks
│   │   │   ├── report.py              # /report/pdf downloadable verification certificate
│   │   │   ├── rooms.py               # Room config CRUD + /roommates slots
│   │   │   ├── settings.py            # Tariff rate & tolerance config
│   │   │   ├── simulation.py          # Explicit "Simulated Demo Data" generator
│   │   │   └── students.py            # Registration & 3-roommate capacity checks
│   │   └── services/
│   │       ├── aggregate.py           # Time-series curve interpolation & AC/Non-AC averages
│   │       ├── appliances.py          # Standard AC & Non-AC wattage profiles
│   │       ├── bootstrap.py           # Idempotent reference seeding & VerificationResult sync
│   │       ├── compare.py             # Shared bill calculation & verdict classification logic
│   │       ├── pdf_report.py          # ReportLab PDF builder & vector chart generator
│   │       └── simulate.py            # Synthetic demo data generator
│   └── tests/
│       ├── conftest.py                # Isolated temporary SQLite fixtures
│       ├── test_api.py                # End-to-end API & PDF verification tests
│       └── test_calculations.py       # Unit tests for kWh, verdict boundaries & comparisons
└── frontend/
    ├── index.html
    ├── package.json
    ├── postcss.config.js
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx                    # Routes for all 9 application screens
        ├── main.tsx
        ├── index.css
        ├── vite-env.d.ts
        ├── api/client.ts              # Typed Fetch API client
        ├── constants/hostel.ts        # Boys/Girls hostels, Blocks A-G, inclusive day counter
        ├── context/
        │   ├── AuthContext.tsx
        │   ├── DarkModeContext.tsx
        │   └── RoomContext.tsx
        ├── theme/tokens.ts
        ├── types/api.ts
        ├── components/
        │   ├── layout/                # AppLayout, Header, Sidebar (responsive drawer + bottom bar)
        │   └── ui/                    # Badge, Button, Card, EmptyState, Input, KpiCard, Modal, etc.
        └── pages/
            ├── AnalyticsPage.tsx      # 6 interactive Recharts graphs
            ├── ComparePage.tsx        # Side-by-side dual meter comparison
            ├── DashboardPage.tsx      # KPI overview & live verification panel
            ├── HistoryPage.tsx        # Reading history table, details, 2-step edit & delete
            ├── ReadingsPage.tsx       # Manual entry & simulation forms + period alignment check
            ├── RegisterPage.tsx       # Student registration & room editing
            ├── ReportPage.tsx         # Official verification certificate & PDF download
            ├── RoomConfigPage.tsx     # Room specs, 3 roommates & equal-share cost card
            └── SettingsPage.tsx       # Tariff & tolerance management
```

---

## Installation & Setup Instructions

### Prerequisites
- **Python** `3.11+`
- **Node.js** `18+` and **npm** `9+`

### 1. Environment Variables
Copy the safe placeholder templates (never commit real secrets or `.env` files):

```bash
# Backend environment variables
cp .env.example backend/.env
```

All configuration values have safe local defaults in `backend/app/config.py`:
- `HOST` (`127.0.0.1`), `PORT` (`8000`)
- `DATABASE_URL` (`sqlite:///./billshield.db`)
- `DEFAULT_RATE_PER_UNIT` (`10.0`), `DEFAULT_TOLERANCE_PERCENT` (`5.0`)
- `VITE_BACKEND_URL` (`http://127.0.0.1:8000`), `VITE_API_BASE_URL` (`/api/v1`)

### 2. Backend Setup

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1      # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Initialize SQLite tables & reference catalog (Boys/Girls, Blocks A-G, Settings, Periods)
python seed.py

# Optional: also load synthetic SIMULATED DEMO rooms/readings
# python seed.py --demo
```

### 3. Frontend Setup

```powershell
cd frontend
npm install
```

---

## Running Frontend & Backend

Run both servers in separate terminals during local development:

**Terminal 1 — Backend (FastAPI):**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python run.py
```
- API Server: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc UI: `http://127.0.0.1:8000/redoc`

**Terminal 2 — Frontend (React + Vite):**
```powershell
cd frontend
npm run dev
```
- Web Application: `http://127.0.0.1:5173/`

---

## API Documentation

Interactive Swagger documentation is available at **`http://127.0.0.1:8000/docs`** (and ReDoc at `/redoc`).

| Domain | Method & Endpoint | Description |
|---|---|---|
| Health | `GET /api/v1/health` | Service health & list of all 11 SQLite tables |
| Hostels | `GET /api/v1/hostels` | Boys/Girls categories with Blocks A–G |
| Rooms | `GET / POST /api/v1/rooms`, `GET / PUT / DELETE /api/v1/rooms/{id}`, `GET /api/v1/rooms/{id}/roommates` | Room configuration, appliance specs & 3 roommate slots |
| Students | `GET / POST /api/v1/students`, `GET / PUT / DELETE /api/v1/students/{id}` | Student registration (max 3 roommates/room, unique roll no.) |
| Periods | `GET / POST /api/v1/billing-periods` | Shared billing date windows (overlap-checked) |
| Room Readings | `GET / POST /api/v1/rooms/{id}/readings`, `PUT / DELETE /api/v1/readings/{id}` | Room sensor readings with continuity validation |
| Hostel Readings | `GET / POST /api/v1/rooms/{id}/hostel-readings`, `PUT / DELETE /api/v1/hostel-readings/{id}` | Official hostel meter readings & bill overrides |
| Verification | `GET /api/v1/rooms/{id}/compare?billing_period_id=...`, `GET /api/v1/rooms/{id}/verifications` | Dual-meter verification verdict & persisted audit records |
| Simulation | `POST /api/v1/rooms/{id}/simulate` | Generate `Simulated Demo Data` readings cleanly tagged |
| Analytics | `GET /api/v1/rooms/{id}/aggregate?granularity=...`, `GET /api/v1/analytics/room-type-comparison` | Hourly/Daily/Weekly/Monthly curves & AC vs Non-AC averages |
| PDF Reports | `GET /api/v1/rooms/{id}/report/pdf?billing_period_id=...` | Downloadable ReportLab verification PDF certificate |
| Settings | `GET / PUT /api/v1/settings` | Configure rate (`₹/kWh`) & tolerance (`±%`) |

---

## Testing Instructions

### Backend Automated Tests (Pytest)
Uses isolated temporary SQLite databases (never alters `backend/billshield.db`):
```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -v
```

### Frontend Type-Check & Production Bundle
```powershell
cd frontend
npx tsc --noEmit
npm run build
```

---

## Screenshots

Verified application screenshots belong in the [`screenshots/`](./screenshots/README.md) directory (with synthetic demo data only):

- `screenshots/01-registration.png` — *Student Registration & Aditya University Block A–G Picker (placeholder)*
- `screenshots/02-dashboard.png` — *Personalized Room Electricity Dashboard & KPI Cards (placeholder)*
- `screenshots/03-room-config.png` — *Room Appliances, 3-Roommate Roster & Equal-Share Cost (placeholder)*
- `screenshots/04-analytics.png` — *Recharts Hourly/Daily/Weekly/Monthly & AC/Non-AC Graphs (placeholder)*
- `screenshots/05-history.png` — *Reading History Search/Filter/Edit/Delete Audit Log (placeholder)*
- `screenshots/06-mobile-responsive.png` — *Mobile Responsive Layout & Drawer Navigation (placeholder)*

---

## Known Limitations

1. **No Physical Sensor Hardware Attached**: Current consumption values rely on manual student entry or explicitly labelled `SIMULATED DATA`. Hourly, daily, and weekly curves are mathematically interpolated from stored billing-period totals rather than real interval telemetry.
2. **Demo Session Persistence**: Student registration stores demo selection state locally in browser `localStorage` mapped to SQLite records — this is a project demonstration and does not integrate with Aditya University SSO or ERP systems.
3. **Electrical Boundary Assumption**: Verification accuracy assumes both the Room Sensor and Hostel Meter measure the exact same room electrical circuit boundary across identical dates. Common corridor or shared panel wiring can produce legitimate unit variances without implying billing fraud.

---

## Future Scope: ESP32 Hardware Integration

Physical hardware has **not yet been implemented**. When an **ESP32 + PZEM-004T / SCT-013** energy monitoring node is deployed at the room distribution board:

1. **Circuit Measurement**: Measure RMS voltage, current, and cumulative kilowatt-hours (`kWh`) at the room's isolated sub-circuit boundary.
2. **Existing API Ingestion**: The backend schema (`ReadingSource.SENSOR = "Sensor (Future)"`) already accepts automated hardware uploads on the existing endpoint with zero schema redesign:
   ```json
   POST /api/v1/rooms/{room_id}/readings
   {
     "billing_period_id": 1,
     "reading_start": 1240.0,
     "reading_end": 1512.4,
     "source": "Sensor (Future)",
     "notes": "Automated upload from ESP32 room energy monitor"
   }
   ```
3. **Device Authentication & Interval Storage**: Add per-room API keys/JWT device tokens (via `.env` secrets) and an interval telemetry table for native 15-minute / hourly kWh readings before enabling production hardware uploads.

---

## Team Members & Contributions

| Member | Role & Focus Area |
|---|---|
| **[Team Lead / Full-Stack Developer]** | FastAPI architecture, SQLite schema design, verification comparison engine, React integration |
| **[Backend & PDF Engineer]** | Meter reading validation rules, analytics aggregation, ReportLab PDF verification reports & Pytest suite |
| **[Frontend & UI Engineer]** | Responsive Tailwind UI, registration flow, dual-meter comparison screens, Recharts visualization & dark mode |
| **[Documentation & Hardware Research]** | Aditya University hostel electrical boundary study, QA testing, ESP32 future scope specification |
