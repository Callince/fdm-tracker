"""FastAPI entrypoint."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .logging_config import configure_logging
from .routers import activity, admin, auth, breaks, holidays, me, meetings, sessions, teams


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="FDM Tracker API",
        version="0.1.0",
        description="Internal employee monitoring — Fourth Dimension Media Solutions.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(activity.router)
    app.include_router(breaks.router)
    app.include_router(me.router)
    app.include_router(teams.public_router)
    app.include_router(teams.admin_router)
    app.include_router(meetings.public_router)
    app.include_router(meetings.admin_router)
    app.include_router(holidays.public_router)
    app.include_router(holidays.admin_router)
    app.include_router(admin.router)

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
