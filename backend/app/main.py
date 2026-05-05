"""FastAPI entrypoint."""
from __future__ import annotations

import asyncio
import logging
import re
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


_SENSITIVE_KEY_RE = re.compile(
    r"password|token|secret|refresh_token|access_token|authorization|cookie|api[_-]?key",
    re.IGNORECASE,
)


def _redact(obj):  # type: ignore[no-untyped-def]
    if obj is None or isinstance(obj, (int, float, bool, str)):
        return obj
    if isinstance(obj, list):
        return [_redact(v) for v in obj]
    if isinstance(obj, dict):
        return {
            k: ("[redacted]" if isinstance(k, str) and _SENSITIVE_KEY_RE.search(k) else _redact(v))
            for k, v in obj.items()
        }
    return obj


def _scrub_event(event, _hint):  # type: ignore[no-untyped-def]
    """Sentry before_send hook: drop IPs / auth headers / password fields."""
    req = event.get("request") or {}
    if "headers" in req:
        req["headers"] = _redact(req["headers"])
    if "cookies" in req:
        req["cookies"] = "[redacted]"
    if "data" in req:
        req["data"] = _redact(req["data"])
    if req:
        event["request"] = req
    user = event.get("user") or {}
    for k in ("ip_address", "email", "username"):
        user.pop(k, None)
    if user:
        event["user"] = user
    if "extra" in event:
        event["extra"] = _redact(event["extra"])
    return event


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
        # Employee-monitoring app: never ship IPs / usernames / cookies to a
        # third-party SaaS. Bodies are never captured either.
        send_default_pii=False,
        max_request_body_size="never",
        before_send=_scrub_event,
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
                extra={
                    "request_id": rid,
                    "method": request.method,
                    "path": request.url.path,
                    "elapsed_ms": elapsed_ms,
                },
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

    nonce_gc_task: asyncio.Task[None] | None = None

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
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001
                    _log.warning("nonce gc failed: %s", e)
                await asyncio.sleep(300)   # every 5 min

        nonlocal nonce_gc_task
        nonce_gc_task = asyncio.create_task(loop(), name="nonce-gc")

    @app.on_event("shutdown")
    async def _stop_nonce_gc() -> None:
        if nonce_gc_task is None or nonce_gc_task.done():
            return
        nonce_gc_task.cancel()
        try:
            await asyncio.wait_for(nonce_gc_task, timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    return app


app = create_app()
