"""Password hashing and request authentication (stdlib only)."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from typing import Optional

PBKDF2_ITERATIONS = 240_000
COOKIE_NAME = "is_session"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: Optional[str]) -> bool:
    if not stored:
        return False
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "false").lower() in ("1", "true", "yes")


@dataclass
class AuthContext:
    token: str
    user_id: str
    user_name: str
    is_guest: bool
    active_patient_id: Optional[str]
