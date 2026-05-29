from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional


PBKDF2_ITERATIONS = 600_000
SESSION_TTL_DAYS = 30
PASSWORD_RESET_TTL_HOURS = 1


@dataclass(slots=True)
class RegistrationResult:
    ok: bool
    error: Optional[str] = None


@dataclass(slots=True)
class AuthResult:
    ok: bool
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    error: Optional[str] = None


class AuthService:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        return conn

    def _utc_now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def init_db(self) -> None:
        with self._connect() as conn:
            cols = conn.execute('PRAGMA table_info(users)').fetchall()
            if not cols:
                return
            col_names = {str(col['name']) for col in cols}
            if 'avatar_path' not in col_names:
                conn.execute('ALTER TABLE users ADD COLUMN avatar_path TEXT')
            if 'had_projects' not in col_names:
                conn.execute('ALTER TABLE users ADD COLUMN had_projects INTEGER NOT NULL DEFAULT 0')
            if 'recraft_api_key' not in col_names:
                conn.execute('ALTER TABLE users ADD COLUMN recraft_api_key TEXT')
            if 'openrouter_api_key' not in col_names:
                conn.execute('ALTER TABLE users ADD COLUMN openrouter_api_key TEXT')
            conn.commit()

    def email_exists(self, email: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1",
                (email.strip(),),
            ).fetchone()
            return row is not None

    def get_user_by_email(self, email: str) -> Optional[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT id, name, email, password_hash, is_active, avatar_path, had_projects, recraft_api_key, openrouter_api_key FROM users WHERE lower(email) = lower(?) LIMIT 1",
                (email.strip(),),
            ).fetchone()

    def get_user_by_id(self, user_id: int) -> Optional[sqlite3.Row]:
        with self._connect() as conn:
            return conn.execute(
                "SELECT id, name, email, password_hash, is_active, avatar_path, had_projects, recraft_api_key, openrouter_api_key FROM users WHERE id = ? LIMIT 1",
                (user_id,),
            ).fetchone()

    def update_user_profile(
        self,
        user_id: int,
        *,
        name: str,
        avatar_path: str | None,
        recraft_api_key: str | None = None,
        openrouter_api_key: str | None = None,
    ) -> None:
        normalized_name = (name or "").strip()
        if len(normalized_name) < 2:
            raise ValueError("Имя должно содержать хотя бы 2 символа.")
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE users
                SET name = ?,
                    avatar_path = ?,
                    recraft_api_key = COALESCE(?, recraft_api_key),
                    openrouter_api_key = COALESCE(?, openrouter_api_key)
                WHERE id = ?
                """,
                (normalized_name, avatar_path, recraft_api_key, openrouter_api_key, user_id),
            )
            conn.commit()


    def get_user_api_keys(self, user_id: int) -> dict[str, str]:
        row = self.get_user_by_id(user_id)
        if row is None:
            return {'recraft_api_key': '', 'openrouter_api_key': ''}
        return {
            'recraft_api_key': str(row['recraft_api_key'] or '').strip(),
            'openrouter_api_key': str(row['openrouter_api_key'] or '').strip(),
        }

    def change_password(self, user_id: int, *, new_password: str, current_password: str) -> None:
        row = self.get_user_by_id(user_id)
        if row is None:
            raise ValueError("Пользователь не найден.")
        if not (current_password or "").strip():
            raise ValueError("Введите текущий пароль.")
        if not self.verify_password(current_password, str(row["password_hash"])):
            raise ValueError("Текущий пароль введен неверно.")
        if len((new_password or "").strip()) < 8:
            raise ValueError("Новый пароль должен содержать минимум 8 символов.")
        new_hash = self.hash_password(new_password)
        with self._connect() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (new_hash, user_id),
            )
            conn.commit()

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

    def authenticate_user(self, email: str, password: str) -> AuthResult:
        normalized_email = email.strip().lower()

        if '@' not in normalized_email or len(password) < 1:
            return AuthResult(ok=False, error='Введите email и пароль.')

        row = self.get_user_by_email(normalized_email)
        if row is None:
            return AuthResult(ok=False, error='Пользователь с таким email не найден.')

        if not row['is_active']:
            return AuthResult(ok=False, error='Аккаунт деактивирован.')

        if not self.verify_password(password, row['password_hash']):
            return AuthResult(ok=False, error='Неверный пароль.')

        return AuthResult(
            ok=True,
            user_id=int(row['id']),
            user_name=str(row['name']),
            user_email=str(row['email']),
        )

    def create_user_session(self, user_id: int) -> str:
        session_id = secrets.token_urlsafe(32)
        created_at = self._utc_now_iso()
        expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_sessions (id, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, int(user_id), created_at, expires_at),
            )
            conn.commit()
        return session_id

    def revoke_user_session(self, session_id: str | None) -> None:
        token = (session_id or '').strip()
        if not token:
            return
        now = self._utc_now_iso()
        with self._connect() as conn:
            conn.execute(
                'UPDATE user_sessions SET expires_at = ? WHERE id = ?',
                (now, token),
            )
            conn.commit()

    def revoke_other_user_sessions(self, user_id: int, *, keep_session_id: str | None = None) -> None:
        """Завершает остальные серверные сессии пользователя (например, после смены пароля)."""
        now = self._utc_now_iso()
        keep = (keep_session_id or '').strip()
        try:
            with self._connect() as conn:
                if keep:
                    conn.execute(
                        'UPDATE user_sessions SET expires_at = ? WHERE user_id = ? AND id != ?',
                        (now, int(user_id), keep),
                    )
                else:
                    conn.execute(
                        'UPDATE user_sessions SET expires_at = ? WHERE user_id = ?',
                        (now, int(user_id)),
                    )
                conn.commit()
        except sqlite3.OperationalError:
            return

    def verify_current_password(self, user_id: int, password: str) -> None:
        row = self.get_user_by_id(user_id)
        if row is None:
            raise ValueError('Пользователь не найден.')
        if not (password or '').strip():
            raise ValueError('Введите пароль для подтверждения.')
        if not self.verify_password(password, str(row['password_hash'])):
            raise ValueError('Неверный пароль.')

    def delete_user(self, user_id: int) -> None:
        with self._connect() as conn:
            conn.execute('DELETE FROM users WHERE id = ?', (int(user_id),))
            conn.commit()

    def create_password_reset_token(self, email: str) -> Optional[str]:
        """Создаёт токен сброса. None, если email не зарегистрирован (без утечки в API)."""
        normalized_email = email.strip().lower()
        if '@' not in normalized_email:
            return None

        row = self.get_user_by_email(normalized_email)
        if row is None or not row['is_active']:
            return None

        user_id = int(row['id'])
        token = secrets.token_urlsafe(32)
        created_at = self._utc_now_iso()
        expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=PASSWORD_RESET_TTL_HOURS)
        ).isoformat()

        with self._connect() as conn:
            conn.execute(
                'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
                (user_id,),
            )
            conn.execute(
                """
                INSERT INTO password_reset_tokens (token, user_id, created_at, expires_at, used_at)
                VALUES (?, ?, ?, ?, NULL)
                """,
                (token, user_id, created_at, expires_at),
            )
            conn.commit()

        return token

    def get_valid_password_reset_token(self, token: str) -> Optional[sqlite3.Row]:
        normalized = (token or '').strip()
        if not normalized:
            return None

        now = datetime.now(timezone.utc)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT token, user_id, created_at, expires_at, used_at
                FROM password_reset_tokens
                WHERE token = ?
                LIMIT 1
                """,
                (normalized,),
            ).fetchone()

        if row is None or row['used_at']:
            return None

        try:
            expires_at = datetime.fromisoformat(str(row['expires_at']))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

        if expires_at <= now:
            return None

        return row

    def reset_password_with_token(self, token: str, new_password: str) -> None:
        row = self.get_valid_password_reset_token(token)
        if row is None:
            raise ValueError('Ссылка для сброса пароля недействительна или устарела.')

        if len((new_password or '').strip()) < 8:
            raise ValueError('Пароль должен содержать минимум 8 символов.')

        user_id = int(row['user_id'])
        new_hash = self.hash_password(new_password)
        used_at = self._utc_now_iso()

        with self._connect() as conn:
            conn.execute(
                'UPDATE users SET password_hash = ? WHERE id = ?',
                (new_hash, user_id),
            )
            conn.execute(
                'UPDATE password_reset_tokens SET used_at = ? WHERE token = ?',
                (used_at, str(row['token'])),
            )
            conn.commit()

        self.revoke_other_user_sessions(user_id)
