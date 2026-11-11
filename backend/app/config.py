"""
Centralised application configuration for BillShield.

All tuneable values live here so nothing is scattered across the codebase.
Values can be overridden by a .env file or real environment variables.

ESP32 future-integration note
──────────────────────────────
When hardware becomes available, the sensor will POST to:
    POST /api/v1/rooms/{room_id}/readings
with JSON payload:
    {
      "billing_period_id": <int>,
      "reading_start": <float>,   # kWh at period start
      "reading_end":   <float>,   # kWh at period end
      "source":        "Sensor (Future)",
      "notes":         "Auto-submitted by ESP32 sensor"
    }
No backend schema changes will be needed; the source enum already accepts
"Sensor (Future)" and the endpoint validates it identically to manual entries.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── API metadata & server bind ────────────────────────────────────────
    app_name: str = "BillShield API"
    app_version: str = "1.0.0"
    host: str = "127.0.0.1"
    port: int = 8000
    reload: bool = True

    # ── Database ──────────────────────────────────────────────────────────
    # SQLite file is created inside /backend on first run.
    # To reset all data: stop the server, delete billshield.db, re-run seed.py.
    database_url: str = "sqlite:///./billshield.db"

    # ── CORS ──────────────────────────────────────────────────────────────
    # Allow the Vite dev server and common local variants.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ── Business defaults (also stored in the Settings DB row) ────────────
    default_rate_per_unit: float = 10.0      # ₹ per kWh
    default_tolerance_percent: float = 5.0   # ±% threshold before flagging mismatch


# Singleton instance imported everywhere else in the app
config = AppConfig()
