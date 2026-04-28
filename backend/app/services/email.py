"""Email sender dispatcher.

Backends:
  console  — dev only; prints to the uvicorn log.
  gmail    — production; uses the Gmail REST API over OAuth (see gmail.py).
  smtp     — fallback for non-Google providers.
"""
from __future__ import annotations

import smtplib
from email.message import EmailMessage

from ..config import get_settings
from ..logging_config import get_logger
from . import gmail as gmail_svc

_log = get_logger("email")


def send(to: str, subject: str, body: str) -> None:
    s = get_settings()
    if s.email_backend == "console":
        _log.info(f"[console-email] to={to} subject={subject!r}\n{body}")
        return

    if s.email_backend == "gmail":
        gmail_svc.send_message(to, subject, body)
        return

    if s.email_backend != "smtp":
        raise RuntimeError(f"unknown EMAIL_BACKEND: {s.email_backend}")

    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    if s.smtp_use_tls:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as client:
            client.starttls()
            if s.smtp_user:
                client.login(s.smtp_user, s.smtp_password)
            client.send_message(msg)
    else:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as client:
            if s.smtp_user:
                client.login(s.smtp_user, s.smtp_password)
            client.send_message(msg)


def send_verification_code(to: str, code: str, ttl_min: int) -> None:
    subject = "Your FDM Tracker verification code"
    body = (
        f"Your FDM Tracker verification code is: {code}\n\n"
        f"It expires in {ttl_min} minutes.\n\n"
        "If you didn't sign up, you can ignore this email."
    )
    send(to, subject, body)
