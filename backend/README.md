# BillShield – Backend API (FastAPI + SQLite)

FastAPI + SQLAlchemy 2.0 + SQLite backend for the **BillShield Smart Hostel Electricity Verification System** (Aditya University student project).

## Features & Architecture

- **11 Normalized SQLite Tables** (`PRAGMA foreign_keys=ON` + WAL mode):
  - `hostel_categories` (Boys / Girls hostel definitions)
  - `blocks` (Blocks `A`–`G` per hostel category)
  - `rooms` (Hostel, block, room number, AC / Non-AC type, floor)
  - `students` (Student metadata with unique roll numbers)
  - `roommates` (Fixed 3-slot `1..3` allocation per room)
  - `appliances` (Standard AC vs Non-AC room appliance wattages)
  - `billing_periods` (Shared timeframe anchor guaranteeing period alignment)
  - `room_readings` (Room sensor / manual / simulated start & end readings)
  - `hostel_meter_readings` (Official hostel meter start & end / billed units)
  - `verification_results` (Persisted dual-meter comparison verdicts & bill deltas)
  - `settings` (Tariff ₹/kWh & match tolerance threshold)
- **Strict Rules Enforced**:
  - Independent room ledgers — readings never mix across rooms.
  - Same-billing-period validation on `/compare` and `/report/pdf`.
  - Mandatory `source` tag (`Manual Entry`, `Simulated Demo Data`, or `Sensor (Future)`).
  - Non-decreasing cumulative meter continuity checks across periods.
  - ReportLab PDF generator reusing exact `compute_comparison` math and stamping `"DEMO / SIMULATED DATA"` watermarks on simulated reports.

## Setup & Running

```bash
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows PowerShell
pip install -r requirements.txt

# Copy environment template (placeholders only)
cp .env.example .env

# Initialize database tables and reference catalogs
python seed.py
# Optional: also populate clearly labelled SIMULATED sample demo rooms
# python seed.py --demo

# Run development server
python run.py
```

- API Base URL: `http://127.0.0.1:8000/api/v1`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`
- ReDoc Reference: `http://127.0.0.1:8000/redoc`

## Running Backend Tests

```bash
pytest -v
```
