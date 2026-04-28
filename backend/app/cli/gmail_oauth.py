"""One-time helper: obtain a Gmail API refresh token via browser consent.

Prerequisites (one-time setup in Google Cloud Console):
  1. Create or pick a project.
  2. Enable "Gmail API".
  3. Configure the OAuth consent screen.
     - User type: "Internal" if you are on Workspace — zero review needed.
       Otherwise "External" + add yourself to the test-user list.
     - Scope: https://www.googleapis.com/auth/gmail.send
  4. Create OAuth client credentials, type = "Desktop app".
  5. Copy the client_id and client_secret.

Then run:
    python -m app.cli.gmail_oauth <client_id> <client_secret>

A browser window will open. Sign in as the mailbox you want to send FROM
(e.g. no-reply@fourdm.com). Grant the "send email on your behalf" scope.

When the flow completes, the script prints the refresh token. Paste it
(and the client id/secret) into backend/.env:

    EMAIL_BACKEND=gmail
    GMAIL_MODE=oauth
    GMAIL_SENDER=no-reply@fourdm.com
    GMAIL_CLIENT_ID=...
    GMAIL_CLIENT_SECRET=...
    GMAIL_REFRESH_TOKEN=...

Refresh tokens don't expire for "Internal" Workspace apps. For "External"
apps in Testing status, Google invalidates refresh tokens after ~7 days.
Move the consent screen to "In production" to avoid that.
"""
from __future__ import annotations

import sys

from google_auth_oauthlib.flow import InstalledAppFlow


SCOPES = ["https://www.googleapis.com/auth/gmail.send"]


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python -m app.cli.gmail_oauth <client_id> <client_secret>", file=sys.stderr)
        return 2
    client_id, client_secret = sys.argv[1], sys.argv[2]

    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["http://localhost"],
        }
    }
    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    # Fixed port so a "Web application" OAuth client can whitelist
    # http://localhost:8765/ as an authorized redirect URI.
    # access_type=offline + prompt=consent guarantees a refresh_token.
    creds = flow.run_local_server(
        port=8765,
        access_type="offline",
        prompt="consent",
        open_browser=True,
    )

    print()
    print("=== paste into backend/.env ===")
    print(f"EMAIL_BACKEND=gmail")
    print(f"GMAIL_MODE=oauth")
    print(f"GMAIL_CLIENT_ID={client_id}")
    print(f"GMAIL_CLIENT_SECRET={client_secret}")
    print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
    print(f"# GMAIL_SENDER=<the address you just consented as>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
