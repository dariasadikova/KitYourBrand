from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


PBKDF2_ITERATIONS = 600_000


@dataclass(slots=True)
class RegistrationResult:
    ok: bool
    error: Optional[str] = None


class AuthService:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    auth_provider TEXT NOT NULL DEFAULT 'local',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def email_exists(self, email: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1",
                (email.strip(),),
            ).fetchone()
            return row is not None

    def hash_password(self, password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PBKDF2_ITERATIONS)
        return f'pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}'

    def verify_password(self, password: str, encoded_hash: str) -> bool:
        try:
            algorithm, iterations_str, salt_hex, digest_hex = encoded_hash.split('$', 3)
            if algorithm != 'pbkdf2_sha256':
                return False
            iterations = int(iterations_str)
        except ValueError:
            return False

        calculated = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            bytes.fromhex(salt_hex),
            iterations,
        ).hex()
        return hmac.compare_digest(calculated, digest_hex)

    def register_user(self, name: str, email: str, password: str) -> RegistrationResult:
        normalized_name = name.strip()
        normalized_email = email.strip().lower()

        if len(normalized_name) < 2:
            return RegistrationResult(ok=False, error='Имя должно содержать хотя бы 2 символа.')

        if '@' not in normalized_email or '.' not in normalized_email.split('@')[-1]:
            return RegistrationResult(ok=False, error='Введите корректный email.')

        if len(password) < 8:
            return RegistrationResult(ok=False, error='Пароль должен содержать минимум 8 символов.')

        if self.email_exists(normalized_email):
            return RegistrationResult(ok=False, error='Пользователь с таким email уже зарегистрирован.')

        password_hash = self.hash_password(password)
        created_at = datetime.now(timezone.utc).isoformat()

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users (name, email, password_hash, auth_provider, created_at)
                VALUES (?, ?, ?, 'local', ?)
                """,
                (normalized_name, normalized_email, password_hash, created_at),
            )
            conn.commit()

        return RegistrationResult(ok=True)
