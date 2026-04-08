from __future__ import annotations

import json
import re
import shutil
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


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
        "motifs": ["waves", "dots"],
        "density": "low",
        "substyle": "seamless",
    },
    "illustration": {
        "vector": True,
        "raster": True,
        "prompt_suffix": "minimal, soft contrast",
    },
    "prompts": {
        "icons": ["camera", "chat", "settings", "user", "home", "star", "bell", "heart"],
        "patterns": ["minimal wave dots background", "soft abstract geometry"],
        "illustrations": ["friendly mascot for a chat app", "hero header abstract shapes"],
    },
    "references": {
        "style_images": [],
    },
    "style_id": "",
}

ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


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
        return conn

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    slug TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    brand_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
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
        slug = f'{base_slug}-{uuid.uuid4().hex[:6]}'
        now = datetime.now(timezone.utc).isoformat()
        tokens = self.make_default_tokens(project_name)

        with self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO projects (user_id, slug, name, brand_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user_id, slug, project_name, tokens['brand_id'], now, now),
            )
            project_id = int(cur.lastrowid)
            conn.commit()

        self.save_tokens(user_id, slug, tokens)
        shutil.copyfile(self.tokens_path(user_id, slug), self.backup_path(user_id, slug))
        return ProjectRecord(project_id, user_id, slug, project_name, tokens['brand_id'], now, now)

    def list_projects(self, user_id: int) -> list[ProjectRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, user_id, slug, name, brand_id, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
                (user_id,),
            ).fetchall()
        return [ProjectRecord(**dict(row)) for row in rows]

    def get_project(self, user_id: int, slug: str) -> Optional[ProjectRecord]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, user_id, slug, name, brand_id, created_at, updated_at FROM projects WHERE user_id = ? AND slug = ? LIMIT 1",
                (user_id, slug),
            ).fetchone()
        if row is None:
            return None
        return ProjectRecord(**dict(row))

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
        data['prompts'].setdefault('icons', [])
        data['prompts'].setdefault('patterns', [])
        data['prompts'].setdefault('illustrations', [])
        data.setdefault('references', {})
        refs = data['references']
        refs.setdefault('style_images', [])
        refs['style_images'] = sorted(list(dict.fromkeys([str(x) for x in refs['style_images']])))
        return data

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
        return normalized

    def reset_tokens(self, user_id: int, slug: str) -> dict:
        self.ensure_project(user_id, slug)
        backup = self.backup_path(user_id, slug)
        if not backup.exists():
            raise FileNotFoundError('Резервная копия проекта не найдена.')
        shutil.copyfile(backup, self.tokens_path(user_id, slug))
        return self.load_tokens(user_id, slug)

    def upload_refs(self, user_id: int, slug: str, files: list[tuple[str, bytes]]) -> list[str]:
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
        tokens.setdefault('references', {}).setdefault('style_images', [])
        tokens['references']['style_images'].extend(added)
        self.save_tokens(user_id, slug, tokens)
        return sorted(list(dict.fromkeys(tokens['references']['style_images'])))

    def delete_ref(self, user_id: int, slug: str, rel_path: str) -> list[str]:
        tokens = self.load_tokens(user_id, slug)
        if not rel_path.startswith('uploads/refs/'):
            raise ValueError('Некорректный путь референса.')
        file_path = self.project_dir(user_id, slug) / rel_path
        if file_path.exists():
            file_path.unlink()
        images = [item for item in tokens.get('references', {}).get('style_images', []) if item != rel_path]
        tokens.setdefault('references', {})['style_images'] = images
        self.save_tokens(user_id, slug, tokens)
        return images
