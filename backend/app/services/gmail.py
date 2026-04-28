"""Send mail via the Gmail REST API using OAuth.

Two credential modes, selected by GMAIL_MODE in .env:

  oauth            — user-credentials flow. You run the one-time CLI
                     (python -m app.cli.gmail_oauth) to obtain a refresh
                     token for a specific Gmail / Workspace mailbox, and
                     we refresh access tokens from it on every send.

  service_account  — Workspace-only. Requires domain-wide delegation:
                     a Workspace admin authorizes the service-account
                     client ID for the gmail.send scope, and we
                     impersonate GMAIL_IMPERSONATE on every send.

Both paths end up calling:
    POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
with the raw RFC-822 message base64url-encoded.
"""
from __future__ import annotations

import base64
from email.message import EmailMessage
from typing import Any

import requests
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials as UserCredentials

from ..config import get_settings

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def _credentials() -> Any:
    s = get_settings()
    if s.gmail_mode == "service_account":
        if not s.gmail_service_account_file or not s.gmail_impersonate:
            raise RuntimeError("gmail_service_account mode requires GMAIL_SERVICE_ACCOUNT_FILE and GMAIL_IMPERSONATE")
        return service_account.Credentials.from_service_account_file(
            s.gmail_service_account_file, scopes=SCOPES
        ).with_subject(s.gmail_impersonate)

    if s.gmail_mode == "oauth":
        missing = [
            k for k, v in {
                "GMAIL_CLIENT_ID": s.gmail_client_id,
                "GMAIL_CLIENT_SECRET": s.gmail_client_secret,
                "GMAIL_REFRESH_TOKEN": s.gmail_refresh_token,
            }.items() if not v
        ]
        if missing:
            raise RuntimeError(f"gmail oauth mode missing: {', '.join(missing)}")
        return UserCredentials(
            token=None,
            refresh_token=s.gmail_refresh_token,
            client_id=s.gmail_client_id,
            client_secret=s.gmail_client_secret,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES,
        )

    raise RuntimeError(f"unknown GMAIL_MODE: {s.gmail_mode}")


def send_message(to: str, subject: str, body: str) -> None:
    s = get_settings()
    sender = s.gmail_sender or s.gmail_impersonate or s.email_from

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    creds = _credentials()
    creds.refresh(GoogleAuthRequest())

    resp = requests.post(
        SEND_URL,
        headers={
            "Authorization": f"Bearer {creds.token}",
            "Content-Type": "application/json",
        },
        json={"raw": raw},
        timeout=20,
    )
    if resp.status_code >= 400:
        raise RuntimeError(f"gmail API send failed: {resp.status_code} {resp.text[:500]}")
