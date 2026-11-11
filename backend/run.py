"""
BillShield backend development server entry point.

Usage:
    py run.py
    OR (with venv active):
    python run.py

Serves the FastAPI app on http://127.0.0.1:8000
Interactive API docs: http://127.0.0.1:8000/docs
"""

import uvicorn

from app.config import config

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=config.host,
        port=config.port,
        reload=config.reload,
        reload_dirs=["app"],
        log_level="info",
    )
