"""Create or promote the first admin user.

Usage:
    python -m app.cli.seed_admin "Tamil Raj" digital@fourdm.com "<plaintext-pw>"
"""
from __future__ import annotations

import sys

from sqlalchemy import select

from ..database import SessionLocal
from ..models.user import User
from ..security import hash_password


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: seed_admin <name> <email> <password>", file=sys.stderr)
        return 2
    name, email, password = sys.argv[1], sys.argv[2].lower(), sys.argv[3]

    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if user is None:
            user = User(name=name, email=email, password_hash=hash_password(password), role="admin")
            db.add(user)
            print(f"created admin {email}")
        else:
            user.name = name
            user.password_hash = hash_password(password)
            user.role = "admin"
            user.is_active = True
            print(f"promoted/updated admin {email}")
        db.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main())
