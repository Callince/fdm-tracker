"""FastAPI entrypoint."""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sqlalchemy import delete, text

from .config import get_settings
from .database import SessionLocal, engine
from .logging_config import configure_logging, get_logger
from .models.hmac_nonce import HmacNonce
from .routers import activity, admin, auth, breaks, holidays, me, meetings, sessions, teams


def _init_sentry(dsn: str, env: str) -> None:
    """Initialize Sentry once at process start. No-op if dsn is empty."""
    if not dsn:
        return
    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        # Errors only — performance tracing burns the free tier.
        traces_sample_rate=0.0,
        profiles_sample_rate=0.0,
        # Capture default PII (request method, path, headers without auth).
        # We never capture bodies on this API since they often contain
        # passwords / verification codes.
        send_default_pii=True,
        max_request_body_size="never",
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )


_log = get_logger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    _init_sentry(settings.sentry_dsn, settings.env)

    app = FastAPI(
        title="FDM Tracker API",
        version="0.1.0",
        description="Internal employee monitoring — Fourth Dimension Media Solutions.",
    )

    # CORS: in production we require an explicit allow-list. `*` with
    # `allow_credentials=True` is invalid per the CORS spec and gets
    # rejected by browsers, so we never emit it.
    origins = settings.cors_origins_list
    if not origins:
        if settings.env.lower() == "production":
            raise RuntimeError("CORS_ORIGINS must be set in production")
        origins = ["http://localhost:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def _request_context(request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex
        request.state.request_id = rid
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            _log.exception(
                "unhandled exception",
                extra={"request_id": rid, "path": request.url.path, "elapsed_ms": elapsed_ms},
            )
            return JSONResponse(
                status_code=500,
                content={"detail": "internal server error", "request_id": rid},
                headers={"X-Request-Id": rid},
            )
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        response.headers["X-Request-Id"] = rid
        logging.getLogger("api").info(
            "request",
            extra={
                "request_id": rid,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
            },
        )
        return response

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

    @app.get("/health/ready", tags=["meta"])
    def health_ready() -> dict[str, str]:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}

    @app.on_event("startup")
    async def _start_nonce_gc() -> None:
        # Periodically expire old HMAC nonces. Runs out-of-band so requests
        # never wait on a DELETE-where-expires_at scan.
        async def loop() -> None:
            while True:
                try:
                    with SessionLocal() as db:
                        db.execute(
                            delete(HmacNonce).where(
                                HmacNonce.expires_at < datetime.now(timezone.utc)
                            )
                        )
                        db.commit()
                except Exception as e:  # noqa: BLE001
                    _log.warning("nonce gc failed: %s", e)
                await asyncio.sleep(300)   # every 5 min
        asyncio.create_task(loop())

    return app


app = create_app()
