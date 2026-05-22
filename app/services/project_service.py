from __future__ import annotations

import json
import logging
import re
import shutil
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


DEFAULT_TOKENS = {
    "name": "Demo Brand",
    "brand_id": "demo-brand",
    "palette": {
        "primary": "#5B7C99",
        "secondary": "#E3E7ED",
        "accent": "#1E2A33",
    },
    "icon": {
        "strokeWidth": 2,
        "corner": "rounded",
        "fill": "outline",
    },
    "texture": {
        "motifs": [],
        "density": "low",
        "substyle": "seamless",
    },
    "illustration": {
        "vector": True,
        "raster": True,
        "prompt_suffix": "minimal, soft contrast",
    },
    "prompts": {
        "logos": [],
        "icons": [],
        "patterns": [],
        "illustrations": [],
    },
    "references": {
        "logos": [],
        "icons": [],
        "patterns": [],
        "illustrations": [],
        "style_images": [],
    },
    "style_id": "",
}

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
REFERENCE_ASSET_KINDS = ('logos', 'icons', 'patterns', 'illustrations')

logger = logging.getLogger('kityourbrand.project')


@dataclass(slots=True)
class ProjectRecord:
    id: int
    user_id: int
    slug: str
    name: str
    brand_id: str
    created_at: str
    updated_at: str


class ProjectService:
    def __init__(self, db_path: Path, storage_dir: Path) -> None:
        self.db_path = db_path
        self.storage_dir = storage_dir
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        return conn

    def _utc_now_iso(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    _TERMINAL_PROVIDER_STATUSES = frozenset({'success', 'error', 'skipped', 'failed'})

    def _delete_generation_job_related(self, conn: sqlite3.Connection, job_ids: list[str]) -> None:
        if not job_ids:
            return
        placeholders = ', '.join(['?'] * len(job_ids))
        conn.execute(
            f'DELETE FROM generation_job_log_entries WHERE job_id IN ({placeholders})',
            job_ids,
        )
        conn.execute(
            f'DELETE FROM generation_provider_runs WHERE job_id IN ({placeholders})',
            job_ids,
        )

    def _table_columns(self, conn: sqlite3.Connection, table: str) -> set[str]:
        rows = conn.execute(f'PRAGMA table_info({table})').fetchall()
        return {str(r[1]) for r in rows}

    def init_db(self) -> None:
        with self._connect() as conn:
            cols = self._table_columns(conn, 'projects')
            if cols and 'deleted_at' not in cols:
                conn.execute('ALTER TABLE projects ADD COLUMN deleted_at TEXT')
            hist_cols = self._table_columns(conn, 'generation_jobs_history')
            if hist_cols:
                if 'error_message' not in hist_cols:
                    conn.execute('ALTER TABLE generation_jobs_history ADD COLUMN error_message TEXT')
                if 'error_hint' not in hist_cols:
                    conn.execute('ALTER TABLE generation_jobs_history ADD COLUMN error_hint TEXT')
                if 'tokens_snapshot' not in hist_cols:
                    conn.execute('ALTER TABLE generation_jobs_history ADD COLUMN tokens_snapshot TEXT')
            conn.commit()

    def _slugify(self, value: str) -> str:
        value = (value or '').strip().lower()
        value = re.sub(r'[^a-z0-9]+', '-', value)
        value = re.sub(r'-{2,}', '-', value).strip('-')
        return value or 'brand'

    def user_projects_dir(self, user_id: int) -> Path:
        path = self.storage_dir / str(user_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def project_dir(self, user_id: int, slug: str) -> Path:
        path = self.user_projects_dir(user_id) / slug
        path.mkdir(parents=True, exist_ok=True)
        return path

    def tokens_path(self, user_id: int, slug: str) -> Path:
        return self.project_dir(user_id, slug) / 'tokens.json'

    def backup_path(self, user_id: int, slug: str) -> Path:
        return self.project_dir(user_id, slug) / 'tokens.original.json'

    def uploads_dir(self, user_id: int, slug: str) -> Path:
        path = self.project_dir(user_id, slug) / 'uploads' / 'refs'
        path.mkdir(parents=True, exist_ok=True)
        return path

    def exports_dir(self, user_id: int, slug: str) -> Path:
        path = self.project_dir(user_id, slug) / 'exports'
        path.mkdir(parents=True, exist_ok=True)
        return path

    def make_default_tokens(self, project_name: str) -> dict:
        data = json.loads(json.dumps(DEFAULT_TOKENS))
        safe_name = project_name.strip() or 'Новый проект'
        data['name'] = safe_name
        data['brand_id'] = self._slugify(safe_name)
        return data

    def create_project(self, user_id: int, name: str) -> ProjectRecord:
        project_name = (name or '').strip() or 'Новый проект'
        base_slug = self._slugify(project_name)
        rand = uuid.uuid4().hex
        slug = f'{base_slug}-{rand[:6]}'
        now = datetime.now(timezone.utc).isoformat()
        tokens = self.make_default_tokens(project_name)
        tokens['brand_id'] = f'{base_slug}-{rand[:10]}'

        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO projects (user_id, slug, name, brand_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, slug, project_name, tokens['brand_id'], now, now),
            )
            conn.execute(
                "UPDATE users SET had_projects = 1 WHERE id = ?",
                (user_id,),
            )
            project_id = int(cur.lastrowid)
            conn.commit()

        self.save_tokens(user_id, slug, tokens)
        shutil.copyfile(self.tokens_path(user_id, slug), self.backup_path(user_id, slug))
        return ProjectRecord(project_id, user_id, slug, project_name, tokens['brand_id'], now, now)

    def list_projects(self, user_id: int) -> list[ProjectRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, user_id, slug, name, brand_id, created_at, updated_at
                FROM projects
                WHERE user_id = ? AND deleted_at IS NULL
                ORDER BY updated_at DESC, id DESC
                """,
                (user_id,),
            ).fetchall()
        return [ProjectRecord(**dict(row)) for row in rows]

    def get_project(self, user_id: int, slug: str) -> Optional[ProjectRecord]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, user_id, slug, name, brand_id, created_at, updated_at
                FROM projects
                WHERE user_id = ? AND slug = ? AND deleted_at IS NULL
                LIMIT 1
                """,
                (user_id, slug),
            ).fetchone()
        if row is None:
            return None
        return ProjectRecord(**dict(row))

    def delete_project(self, user_id: int, slug: str) -> bool:
        project = self.get_project(user_id, slug)
        if project is None:
            return False
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                'UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?',
                (now, now, project.id),
            )
            conn.commit()
        return True

    def restore_project(self, user_id: int, slug: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id FROM projects
                WHERE user_id = ? AND slug = ? AND deleted_at IS NOT NULL
                LIMIT 1
                """,
                (user_id, slug),
            ).fetchone()
            if row is None:
                return False
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                'UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?',
                (now, int(row['id'])),
            )
            conn.commit()
        self.ensure_project(user_id, slug)
        return True

    def record_generation_job(
        self,
        *,
        user_id: int,
        job_id: str,
        project_slug: str,
        provider_statuses: dict[str, str] | None = None,
        initial_logs: list[str] | None = None,
    ) -> None:
        project = self.get_project(user_id, project_slug)
        if project is None:
            return
        started = self._utc_now_iso()
        tokens_snapshot: str | None = None
        try:
            tokens_snapshot = json.dumps(self.load_tokens(user_id, project_slug), ensure_ascii=False)
        except Exception:
            tokens_snapshot = None
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO generation_jobs_history (
                    user_id, job_id, project_id, project_slug, project_name, status, started_at, tokens_snapshot
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (user_id, job_id, project.id, project_slug, project.name, started, tokens_snapshot),
            )
            conn.commit()
        if provider_statuses:
            self.init_generation_provider_runs(job_id, provider_statuses)
        for line in initial_logs or []:
            self.append_generation_job_log(job_id, str(line))

    def init_generation_provider_runs(self, job_id: str, statuses: dict[str, str]) -> None:
        if not statuses:
            return
        try:
            with self._connect() as conn:
                for provider, status in statuses.items():
                    slug = str(provider).strip()
                    if not slug:
                        continue
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO generation_provider_runs (job_id, provider, status)
                        VALUES (?, ?, ?)
                        """,
                        (job_id, slug, str(status or 'pending')),
                    )
                conn.commit()
        except Exception as exc:
            logger.warning('generation_provider_runs init skipped: %s', exc)

    def sync_generation_provider_runs(
        self,
        job_id: str,
        statuses: dict[str, str],
        *,
        provider_errors: dict[str, Any] | None = None,
    ) -> None:
        if not statuses:
            return
        now = self._utc_now_iso()
        errors = provider_errors or {}
        try:
            with self._connect() as conn:
                for provider, status in statuses.items():
                    slug = str(provider).strip()
                    if not slug:
                        continue
                    normalized = str(status or 'pending')
                    row = conn.execute(
                        """
                        SELECT id, status, started_at, finished_at
                        FROM generation_provider_runs
                        WHERE job_id = ? AND provider = ?
                        LIMIT 1
                        """,
                        (job_id, slug),
                    ).fetchone()
                    err_payload = errors.get(slug) or errors.get(provider)
                    err_msg: str | None = None
                    if isinstance(err_payload, dict):
                        err_msg = str(err_payload.get('message') or err_payload.get('error') or '') or None
                    elif err_payload is not None:
                        err_msg = str(err_payload)

                    if row is None:
                        started_at = now if normalized == 'running' else None
                        finished_at = now if normalized in self._TERMINAL_PROVIDER_STATUSES else None
                        conn.execute(
                            """
                            INSERT INTO generation_provider_runs (
                                job_id, provider, status, started_at, finished_at, error_message
                            ) VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (job_id, slug, normalized, started_at, finished_at, err_msg),
                        )
                        continue

                    started_at = row['started_at']
                    finished_at = row['finished_at']
                    if normalized == 'running' and not started_at:
                        started_at = now
                    if normalized in self._TERMINAL_PROVIDER_STATUSES and not finished_at:
                        finished_at = now
                    conn.execute(
                        """
                        UPDATE generation_provider_runs
                        SET status = ?, started_at = ?, finished_at = ?, error_message = ?
                        WHERE id = ?
                        """,
                        (normalized, started_at, finished_at, err_msg, int(row['id'])),
                    )
                conn.commit()
        except Exception as exc:
            logger.warning('generation_provider_runs sync skipped: %s', exc)

    def append_generation_job_log(self, job_id: str, message: str) -> None:
        text = str(message or '').strip()
        if not text:
            return
        created_at = self._utc_now_iso()
        try:
            with self._connect() as conn:
                row = conn.execute(
                    'SELECT COALESCE(MAX(seq), 0) AS max_seq FROM generation_job_log_entries WHERE job_id = ?',
                    (job_id,),
                ).fetchone()
                next_seq = int(row['max_seq'] if row else 0) + 1
                conn.execute(
                    """
                    INSERT INTO generation_job_log_entries (job_id, seq, message, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (job_id, next_seq, text, created_at),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('generation_job_log_entries insert skipped: %s', exc)

    def list_reference_image_paths(self, user_id: int, slug: str) -> list[str]:
        project = self.get_project(user_id, slug)
        if project is None:
            return []
        self.sync_reference_images_from_tokens(user_id, slug)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT storage_path
                FROM project_reference_images
                WHERE project_id = ?
                ORDER BY sort_order ASC, id ASC
                """,
                (project.id,),
            ).fetchall()
        return [str(row['storage_path']) for row in rows]

    def sync_reference_images_from_tokens(self, user_id: int, slug: str) -> None:
        project = self.get_project(user_id, slug)
        if project is None:
            return
        try:
            tokens = self.load_tokens(user_id, slug)
        except Exception:
            return
        paths = self.collect_reference_paths(tokens.get('references', {}) or {})
        if not isinstance(paths, list):
            return
        now = self._utc_now_iso()
        try:
            with self._connect() as conn:
                existing = {
                    str(row['storage_path']): int(row['id'])
                    for row in conn.execute(
                        'SELECT id, storage_path FROM project_reference_images WHERE project_id = ?',
                        (project.id,),
                    ).fetchall()
                }
                for index, raw in enumerate(paths):
                    rel = str(raw).strip()
                    if not rel.startswith('uploads/refs/'):
                        continue
                    if rel in existing:
                        conn.execute(
                            'UPDATE project_reference_images SET sort_order = ? WHERE id = ?',
                            (index, existing[rel]),
                        )
                        continue
                    original = Path(rel).name
                    conn.execute(
                        """
                        INSERT INTO project_reference_images (
                            project_id, storage_path, original_filename, sort_order, created_at
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (project.id, rel, original, index, now),
                    )
                conn.commit()
        except Exception as exc:
            logger.warning('project_reference_images sync skipped: %s', exc)

    def insert_reference_image(
        self,
        project_id: int,
        storage_path: str,
        *,
        original_filename: str | None = None,
        sort_order: int | None = None,
    ) -> None:
        rel = str(storage_path).strip()
        if not rel:
            return
        now = self._utc_now_iso()
        try:
            with self._connect() as conn:
                if sort_order is None:
                    row = conn.execute(
                        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM project_reference_images WHERE project_id = ?',
                        (project_id,),
                    ).fetchone()
                    sort_order = int(row['max_order'] if row else -1) + 1
                conn.execute(
                    """
                    INSERT OR IGNORE INTO project_reference_images (
                        project_id, storage_path, original_filename, sort_order, created_at
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (project_id, rel, original_filename, int(sort_order), now),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('project_reference_images insert skipped: %s', exc)

    def delete_reference_image(self, project_id: int, storage_path: str) -> None:
        rel = str(storage_path).strip()
        if not rel:
            return
        try:
            with self._connect() as conn:
                conn.execute(
                    'DELETE FROM project_reference_images WHERE project_id = ? AND storage_path = ?',
                    (project_id, rel),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('project_reference_images delete skipped: %s', exc)

    def project_has_successful_generation(self, user_id: int, project_slug: str) -> bool:
        """True if generation completed for this project (row finalized as success in history)."""
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT 1 AS ok
                FROM generation_jobs_history
                WHERE user_id = ? AND project_slug = ? AND status = 'success'
                LIMIT 1
                """,
                (user_id, project_slug),
            ).fetchone()
        return row is not None

    def set_generation_job_running(self, job_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE generation_jobs_history SET status = 'running' WHERE job_id = ?",
                (job_id,),
            )
            conn.commit()

    def finalize_generation_job_record(
        self,
        job_id: str,
        outcome: str,
        *,
        error_message: str | None = None,
        error_hint: str | None = None,
    ) -> None:
        """outcome: success | failed"""
        status = 'success' if outcome == 'success' else 'failed'
        finished = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            row = conn.execute(
                'SELECT started_at FROM generation_jobs_history WHERE job_id = ?',
                (job_id,),
            ).fetchone()
            if row is None:
                return
            started_raw = str(row['started_at'])
            duration: float | None = None
            try:
                s = started_raw.replace('Z', '+00:00')
                t0 = datetime.fromisoformat(s)
                t1 = datetime.fromisoformat(finished.replace('Z', '+00:00'))
                duration = max(0.0, (t1 - t0).total_seconds())
            except (TypeError, ValueError):
                duration = None
            conn.execute(
                """
                UPDATE generation_jobs_history
                SET status = ?, finished_at = ?, duration_seconds = ?, error_message = ?, error_hint = ?
                WHERE job_id = ?
                """,
                (status, finished, duration, error_message, error_hint, job_id),
            )
            conn.commit()

    def mark_abandoned_generation_jobs(self) -> None:
        """After restart in-memory jobs are lost; pending/running rows become failed."""
        finished = datetime.now(timezone.utc).isoformat()
        lost_msg = (
            'Генерация прервалась: сервер был перезапущен, пока задача ещё выполнялась. '
            'Подробный журнал недоступен — запустите генерацию снова.'
        )
        lost_hint = (
            'Если сбой повторяется, проверьте ключи API в профиле, баланс провайдеров и стабильность сети.'
        )
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE generation_jobs_history
                SET status = 'failed',
                    finished_at = ?,
                    duration_seconds = NULL,
                    error_message = ?,
                    error_hint = ?
                WHERE status IN ('pending', 'running')
                """,
                (finished, lost_msg, lost_hint),
            )
            conn.commit()

    def generation_history_stats(self, user_id: int) -> dict[str, Any]:
        with self._connect() as conn:
            total = conn.execute(
                'SELECT COUNT(*) AS c FROM generation_jobs_history WHERE user_id = ?',
                (user_id,),
            ).fetchone()
            ok = conn.execute(
                "SELECT COUNT(*) AS c FROM generation_jobs_history WHERE user_id = ? AND status = 'success'",
                (user_id,),
            ).fetchone()
            avg = conn.execute(
                """
                SELECT AVG(duration_seconds) AS a
                FROM generation_jobs_history
                WHERE user_id = ? AND status = 'success' AND duration_seconds IS NOT NULL
                """,
                (user_id,),
            ).fetchone()
            projects_n = conn.execute(
                """
                SELECT COUNT(DISTINCT project_id) AS c
                FROM generation_jobs_history
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        return {
            'total': int(total['c']) if total else 0,
            'successful': int(ok['c']) if ok else 0,
            'avg_duration': float(avg['a']) if avg and avg['a'] is not None else None,
            'projects_with_generations': int(projects_n['c']) if projects_n else 0,
        }

    def list_generation_history_page(
        self, user_id: int, *, page: int = 1, per_page: int = 10
    ) -> tuple[list[dict[str, Any]], int]:
        page = max(1, page)
        per_page = max(1, min(per_page, 50))
        offset = (page - 1) * per_page
        with self._connect() as conn:
            total_row = conn.execute(
                'SELECT COUNT(*) AS c FROM generation_jobs_history WHERE user_id = ?',
                (user_id,),
            ).fetchone()
            total = int(total_row['c']) if total_row else 0
            rows = conn.execute(
                """
                SELECT
                    h.job_id,
                    h.project_slug,
                    h.project_name,
                    h.status AS db_status,
                    h.started_at,
                    h.finished_at,
                    h.duration_seconds,
                    h.error_message,
                    h.error_hint,
                    CASE
                        WHEN p.id IS NULL THEN 1
                        WHEN p.deleted_at IS NOT NULL THEN 1
                        ELSE 0
                    END AS project_deleted
                FROM generation_jobs_history h
                LEFT JOIN projects p ON p.id = h.project_id
                WHERE h.user_id = ?
                ORDER BY datetime(h.started_at) DESC, h.id DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, per_page, offset),
            ).fetchall()
        return [dict(row) for row in rows], total

    def delete_generation_history_all(self, user_id: int) -> tuple[int, int]:
        """Delete all terminal history rows for user. Returns (deleted, skipped_active)."""
        deleted_jobs: list[tuple[str, str]] = []
        with self._connect() as conn:
            total_row = conn.execute(
                'SELECT COUNT(*) AS c FROM generation_jobs_history WHERE user_id = ?',
                (user_id,),
            ).fetchone()
            total = int(total_row['c']) if total_row else 0
            rows = conn.execute(
                """
                SELECT job_id, project_slug
                FROM generation_jobs_history
                WHERE user_id = ? AND status NOT IN ('pending', 'running')
                """,
                (user_id,),
            ).fetchall()
            deleted_jobs = [(str(row['job_id']), str(row['project_slug'])) for row in rows]
            cur = conn.execute(
                """
                DELETE FROM generation_jobs_history
                WHERE user_id = ? AND status NOT IN ('pending', 'running')
                """,
                (user_id,),
            )
            deleted = int(cur.rowcount or 0)
            if deleted_jobs:
                job_ids = [job_id for job_id, _ in deleted_jobs]
                placeholders = ', '.join(['?'] * len(job_ids))
                params: list[Any] = [user_id, *job_ids]
                conn.execute(
                    f'DELETE FROM assets WHERE user_id = ? AND generation_job_id IN ({placeholders})',
                    params,
                )
                conn.execute(
                    f'DELETE FROM asset_manifests WHERE user_id = ? AND generation_job_id IN ({placeholders})',
                    params,
                )
                conn.execute(
                    f'DELETE FROM error_logs WHERE user_id = ? AND generation_job_id IN ({placeholders})',
                    params,
                )
                self._delete_generation_job_related(conn, job_ids)
            conn.commit()
        self._delete_generation_result_snapshots(user_id, deleted_jobs)
        skipped = max(0, total - deleted)
        return deleted, skipped

    def delete_generation_history_selected(self, user_id: int, job_ids: list[str]) -> tuple[int, int]:
        """Delete selected terminal history rows for user. Returns (deleted, skipped_active_or_missing)."""
        normalized = [str(j).strip() for j in job_ids if str(j).strip()]
        unique_ids = list(dict.fromkeys(normalized))
        if not unique_ids:
            return 0, 0

        placeholders = ', '.join(['?'] * len(unique_ids))
        params: list[Any] = [user_id, *unique_ids]
        deleted_jobs: list[tuple[str, str]] = []
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT job_id, project_slug
                FROM generation_jobs_history
                WHERE user_id = ?
                  AND job_id IN ({placeholders})
                  AND status NOT IN ('pending', 'running')
                """,
                params,
            ).fetchall()
            deleted_jobs = [(str(row['job_id']), str(row['project_slug'])) for row in rows]
            cur = conn.execute(
                f"""
                DELETE FROM generation_jobs_history
                WHERE user_id = ?
                  AND job_id IN ({placeholders})
                  AND status NOT IN ('pending', 'running')
                """,
                params,
            )
            deleted = int(cur.rowcount or 0)
            if deleted_jobs:
                deletable_ids = [job_id for job_id, _ in deleted_jobs]
                delete_placeholders = ', '.join(['?'] * len(deletable_ids))
                delete_params: list[Any] = [user_id, *deletable_ids]
                conn.execute(
                    f'DELETE FROM assets WHERE user_id = ? AND generation_job_id IN ({delete_placeholders})',
                    delete_params,
                )
                conn.execute(
                    f'DELETE FROM asset_manifests WHERE user_id = ? AND generation_job_id IN ({delete_placeholders})',
                    delete_params,
                )
                conn.execute(
                    f'DELETE FROM error_logs WHERE user_id = ? AND generation_job_id IN ({delete_placeholders})',
                    delete_params,
                )
                self._delete_generation_job_related(conn, deletable_ids)
            conn.commit()
        self._delete_generation_result_snapshots(user_id, deleted_jobs)
        skipped = max(0, len(unique_ids) - deleted)
        return deleted, skipped

    def _delete_generation_result_snapshots(self, user_id: int, jobs: list[tuple[str, str]]) -> None:
        for job_id, project_slug in jobs:
            snapshot_dir = self.project_dir(user_id, project_slug) / 'generation_results' / job_id
            try:
                if snapshot_dir.exists() and snapshot_dir.is_dir():
                    shutil.rmtree(snapshot_dir)
            except Exception as exc:
                logger.warning('generation result snapshot delete skipped: %s', exc)

    def get_generation_history_job(self, user_id: int, project_slug: str, job_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT job_id, project_id, project_slug, project_name, status, started_at, finished_at,
                       tokens_snapshot
                FROM generation_jobs_history
                WHERE user_id = ? AND project_slug = ? AND job_id = ?
                """,
                (user_id, project_slug, job_id),
            ).fetchone()
        return dict(row) if row else None

    def tokens_at_generation_start(
        self,
        user_id: int,
        project_slug: str,
        *,
        tokens_snapshot_json: str | None,
        started_at: str | None,
    ) -> dict[str, Any] | None:
        """Палитра/токены на момент запуска: снимок из истории или последний style_profiles до started_at."""
        if tokens_snapshot_json:
            try:
                data = json.loads(tokens_snapshot_json)
                if isinstance(data, dict):
                    return self.normalize_tokens(data)
            except (json.JSONDecodeError, TypeError):
                pass
        if not started_at:
            return None
        project = self.get_project(user_id, project_slug)
        if project is None:
            return None
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload FROM style_profiles
                WHERE project_id = ? AND created_at <= ?
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (project.id, str(started_at).strip()),
            ).fetchone()
        if not row or row['payload'] is None:
            return None
        raw = row['payload']
        try:
            if isinstance(raw, str):
                data = json.loads(raw)
            elif isinstance(raw, (bytes, bytearray)):
                data = json.loads(raw.decode('utf-8'))
            else:
                data = raw
            if isinstance(data, dict):
                return self.normalize_tokens(data)
        except (json.JSONDecodeError, TypeError, UnicodeDecodeError):
            return None
        return None

    def list_assets_for_generation(self, user_id: int, project_slug: str, job_id: str) -> list[dict[str, Any]]:
        project = self.get_project(user_id, project_slug)
        if project is None:
            return []
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT kind, provider, storage_path, filename, meta, created_at
                FROM assets
                WHERE user_id = ?
                  AND project_id = ?
                  AND generation_job_id = ?
                ORDER BY kind, provider, filename
                """,
                (user_id, project.id, job_id),
            ).fetchall()
        return [dict(row) for row in rows]

    def ensure_project(self, user_id: int, slug: str) -> ProjectRecord:
        project = self.get_project(user_id, slug)
        if project is None:
            raise FileNotFoundError('Проект не найден.')
        path = self.tokens_path(user_id, slug)
        if not path.exists():
            tokens = self.normalize_tokens(self.make_default_tokens(project.name))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding='utf-8')
            backup = self.backup_path(user_id, slug)
            if not backup.exists():
                shutil.copyfile(path, backup)
        return project

    def load_tokens(self, user_id: int, slug: str) -> dict:
        self.ensure_project(user_id, slug)
        with self.tokens_path(user_id, slug).open('r', encoding='utf-8') as fh:
            data = json.load(fh)
        return self.normalize_tokens(data)

    def normalize_tokens(self, data: dict) -> dict:
        data.setdefault('name', 'Brand')
        data['brand_id'] = (data.get('brand_id') or self._slugify(data.get('name', 'brand'))).strip()
        data.setdefault('style_id', '')
        data.setdefault('palette', {})
        data['palette'].setdefault('primary', '#5B7C99')
        data['palette'].setdefault('secondary', '#E3E7ED')
        data['palette'].setdefault('accent', '#1E2A33')
        data.setdefault('icon', {})
        data['icon'].setdefault('strokeWidth', 2)
        data['icon'].setdefault('corner', 'rounded')
        data['icon'].setdefault('fill', 'outline')
        data.setdefault('texture', {})
        data['texture'].setdefault('motifs', [])
        data['texture'].setdefault('density', 'low')
        data['texture'].setdefault('substyle', 'seamless')
        data.setdefault('illustration', {})
        data['illustration'].setdefault('vector', False)
        data['illustration'].setdefault('raster', True)
        data['illustration'].setdefault('prompt_suffix', '')
        data.setdefault('prompts', {})
        data['prompts'].setdefault('logos', [])
        data['prompts'].setdefault('icons', [])
        data['prompts'].setdefault('patterns', [])
        data['prompts'].setdefault('illustrations', [])
        data.setdefault('references', {})
        data['references'] = self.normalize_references_block(data['references'])
        return data

    @staticmethod
    def collect_reference_paths(references: dict[str, Any]) -> list[str]:
        seen: set[str] = set()
        ordered: list[str] = []
        for kind in REFERENCE_ASSET_KINDS:
            raw = references.get(kind, [])
            if not isinstance(raw, list):
                continue
            for item in raw:
                path = str(item).strip()
                if path and path not in seen:
                    seen.add(path)
                    ordered.append(path)
        legacy = references.get('style_images', [])
        if isinstance(legacy, list):
            for item in legacy:
                path = str(item).strip()
                if path and path not in seen:
                    seen.add(path)
                    ordered.append(path)
        return ordered

    def normalize_references_block(self, references: dict[str, Any]) -> dict[str, Any]:
        refs = dict(references or {})
        for kind in REFERENCE_ASSET_KINDS:
            raw = refs.get(kind, [])
            if not isinstance(raw, list):
                raw = []
            refs[kind] = list(dict.fromkeys(str(item).strip() for item in raw if str(item).strip()))

        legacy = refs.get('style_images', [])
        legacy_list = (
            [str(item).strip() for item in legacy if str(item).strip()]
            if isinstance(legacy, list)
            else []
        )
        has_per_type = any(refs[kind] for kind in REFERENCE_ASSET_KINDS)
        if legacy_list and not has_per_type:
            refs['logos'] = list(dict.fromkeys(legacy_list))

        refs['style_images'] = self.collect_reference_paths(refs)
        return refs

    def references_by_asset(self, tokens: dict[str, Any]) -> dict[str, list[str]]:
        block = self.normalize_references_block(tokens.get('references', {}) or {})
        return {kind: list(block.get(kind, [])) for kind in REFERENCE_ASSET_KINDS}

    def insert_style_profile_version(
        self,
        user_id: int,
        slug: str,
        tokens: dict[str, Any],
        *,
        snapshot_path: str | None = None,
    ) -> None:
        """Сохраняет снимок tokens.json в style_profiles (версия ++)."""
        try:
            project = self.get_project(user_id, slug)
            if project is None:
                return
            now = datetime.now(timezone.utc).isoformat()
            payload_txt = json.dumps(tokens, ensure_ascii=False)
            with self._connect() as conn:
                row = conn.execute(
                    'SELECT COALESCE(MAX(version), 0) AS v FROM style_profiles WHERE project_id = ?',
                    (project.id,),
                ).fetchone()
                ver = int(row['v'] if row else 0) + 1
                conn.execute(
                    """
                    INSERT INTO style_profiles (project_id, user_id, version, payload, snapshot_path, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (project.id, user_id, ver, payload_txt, snapshot_path, now),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('style_profiles insert skipped: %s', exc)

    def record_generated_assets_for_brand(
        self,
        user_id: int,
        project_slug: str,
        brand_id: str,
        out_root: Path,
        *,
        job_id: str | None = None,
        provider_slugs: frozenset[str] | None = None,
    ) -> int:
        """Индексирует файлы в out/<provider>/<brand_id>/... в таблицу assets."""
        try:
            project = self.get_project(user_id, project_slug)
            if not project or not brand_id:
                return 0
            now = datetime.now(timezone.utc).isoformat()
            scan_ext = {'.png', '.svg', '.jpg', '.jpeg', '.webp'}
            rows: list[tuple[Any, ...]] = []
            from app.core.providers import ASSET_PROVIDER_SLUGS

            for provider in ASSET_PROVIDER_SLUGS:
                if provider_slugs is not None and provider not in provider_slugs:
                    continue
                base = out_root / provider / brand_id
                for kind in ('logos', 'icons', 'patterns', 'illustrations'):
                    d = base / kind
                    if not d.is_dir():
                        continue
                    for fp in sorted(d.iterdir()):
                        if not fp.is_file() or fp.suffix.lower() not in scan_ext:
                            continue
                        storage = f'out/{provider}/{brand_id}/{kind}/{fp.name}'
                        if job_id:
                            snapshot_rel = f'generation_results/{job_id}/{provider}/{kind}/{fp.name}'
                            snapshot_path = self.project_dir(user_id, project_slug) / snapshot_rel
                            snapshot_path.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(fp, snapshot_path)
                            storage = snapshot_rel
                        meta_txt = json.dumps({'brand_id': brand_id, 'relative': storage}, ensure_ascii=False)
                        rows.append(
                            (project.id, user_id, kind, provider, storage, fp.name, meta_txt, job_id, now)
                        )
            if not rows:
                return 0
            with self._connect() as conn:
                conn.executemany(
                    """
                    INSERT INTO assets (
                        project_id, user_id, kind, provider, storage_path, filename, meta, generation_job_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )
                conn.commit()
            return len(rows)
        except Exception as exc:
            logger.warning('assets batch insert skipped: %s', exc)
            return 0

    def record_figma_asset_manifest(
        self,
        user_id: int,
        project_slug: str,
        *,
        manifest: dict[str, Any],
        export_rel_path: str,
        job_id: str | None = None,
    ) -> None:
        try:
            project = self.get_project(user_id, project_slug)
            if not project:
                return
            now = datetime.now(timezone.utc).isoformat()
            payload_txt = json.dumps(manifest, ensure_ascii=False)
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO asset_manifests (
                        project_id, user_id, kind, payload, storage_path, generation_job_id, created_at
                    ) VALUES (?, ?, 'figma_plugin', ?, ?, ?, ?)
                    """,
                    (project.id, user_id, payload_txt, export_rel_path, job_id, now),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('asset_manifests insert skipped: %s', exc)

    def record_error_log(
        self,
        *,
        user_id: int | None = None,
        project_slug: str | None = None,
        job_id: str | None = None,
        source: str,
        code: str | None = None,
        message: str,
        detail: dict[str, Any] | list | None = None,
    ) -> None:
        try:
            now = datetime.now(timezone.utc).isoformat()
            project_id: int | None = None
            if user_id is not None and project_slug:
                p = self.get_project(int(user_id), str(project_slug))
                if p:
                    project_id = p.id
            detail_txt = json.dumps(detail, ensure_ascii=False) if detail is not None else None
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO error_logs (
                        user_id, project_id, generation_job_id, source, code, message, detail, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (user_id, project_id, job_id, source, code, message, detail_txt, now),
                )
                conn.commit()
        except Exception as exc:
            logger.warning('error_logs insert skipped: %s', exc)

    def save_tokens(self, user_id: int, slug: str, data: dict) -> dict:
        project = self.ensure_project(user_id, slug)
        normalized = self.normalize_tokens(data)
        path = self.tokens_path(user_id, slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding='utf-8')
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                'UPDATE projects SET name = ?, brand_id = ?, updated_at = ? WHERE id = ?',
                (normalized['name'], normalized['brand_id'], now, project.id),
            )
            conn.commit()
        self.insert_style_profile_version(user_id, slug, normalized, snapshot_path='tokens.json')
        return normalized

    def reset_tokens(self, user_id: int, slug: str) -> dict:
        self.ensure_project(user_id, slug)
        backup = self.backup_path(user_id, slug)
        if not backup.exists():
            raise FileNotFoundError('Резервная копия проекта не найдена.')
        shutil.copyfile(backup, self.tokens_path(user_id, slug))
        return self.load_tokens(user_id, slug)

    def upload_refs(
        self,
        user_id: int,
        slug: str,
        files: list[tuple[str, bytes]],
        asset_type: str = 'logos',
    ) -> dict[str, list[str]]:
        if asset_type not in REFERENCE_ASSET_KINDS:
            raise ValueError('Некорректный тип ассета для референса.')
        project = self.get_project(user_id, slug)
        if project is None:
            raise FileNotFoundError('Проект не найден.')
        tokens = self.load_tokens(user_id, slug)
        uploads = self.uploads_dir(user_id, slug)
        added: list[str] = []
        for filename, content in files:
            ext = Path(filename or '').suffix.lower()
            if ext not in ALLOWED_EXT:
                raise ValueError(f'Недопустимый тип файла: {ext}')
            safe_name = f'{uuid.uuid4().hex}{ext}'
            dest = uploads / safe_name
            dest.write_bytes(content)
            rel = f'uploads/refs/{safe_name}'
            added.append(rel)
            self.insert_reference_image(
                project.id,
                rel,
                original_filename=(filename or safe_name),
            )
        ref_block = dict(tokens.get('references', {}) or {})
        for kind in REFERENCE_ASSET_KINDS:
            ref_block.setdefault(kind, [])
        ref_block[asset_type] = list(dict.fromkeys([*ref_block.get(asset_type, []), *added]))
        ref_block = self.normalize_references_block(ref_block)
        tokens['references'] = ref_block
        self.save_tokens(user_id, slug, tokens)
        return self.references_by_asset(tokens)

    def delete_ref(self, user_id: int, slug: str, rel_path: str, asset_type: str | None = None) -> dict[str, list[str]]:
        if asset_type is not None and asset_type not in REFERENCE_ASSET_KINDS:
            raise ValueError('Некорректный тип ассета для референса.')
        project = self.get_project(user_id, slug)
        if project is None:
            raise FileNotFoundError('Проект не найден.')
        tokens = self.load_tokens(user_id, slug)
        if not rel_path.startswith('uploads/refs/'):
            raise ValueError('Некорректный путь референса.')
        ref_block = dict(tokens.get('references', {}) or {})
        for kind in REFERENCE_ASSET_KINDS:
            ref_block.setdefault(kind, [])
            if asset_type is None or asset_type == kind:
                ref_block[kind] = [item for item in ref_block.get(kind, []) if item != rel_path]
        ref_block = self.normalize_references_block(ref_block)
        tokens['references'] = ref_block
        still_used = rel_path in self.collect_reference_paths(ref_block)
        if not still_used:
            file_path = self.project_dir(user_id, slug) / rel_path
            if file_path.exists():
                file_path.unlink()
            self.delete_reference_image(project.id, rel_path)
        self.save_tokens(user_id, slug, tokens)
        return self.references_by_asset(tokens)
