"""Краткое сообщение об ошибке генерации для UI (без полного traceback и stderr)."""
from __future__ import annotations

import json
import re
import subprocess
from typing import Any


def _collect_text(exc: BaseException) -> str:
    if isinstance(exc, subprocess.CalledProcessError):
        parts = [exc.stderr or '', exc.stdout or '', str(exc)]
        return '\n'.join(p for p in parts if p and str(p).strip())
    return str(exc) or ''


def _norm_primary(msg: str) -> str:
    msg = ' '.join(msg.split())
    if len(msg) > 320:
        return msg[:317] + '…'
    return msg


def summarize_generation_failure(exc: BaseException) -> tuple[str, str | None]:
    """
    Извлекает главное сообщение об ошибке из stdout/stderr CLI и текста исключения.
    Возвращает (сообщение для пользователя, опциональная подсказка).
    """
    blob = _collect_text(exc)
    hint: str | None = None
    primary: str | None = None

    m = re.search(r'response text \(head\):\s*(.+?)(?:\r?\n|$)', blob, re.IGNORECASE | re.MULTILINE)
    if m:
        candidate = (m.group(1) or '').strip()
        if candidate:
            primary = candidate

    if not primary:
        mj = re.search(r'"message"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', blob)
        if mj and mj.group(1).strip():
            primary = mj.group(1).replace('\\n', '\n').strip()

    if not primary:
        me = re.search(r'"error"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', blob, re.IGNORECASE)
        if me:
            primary = me.group(1).strip()

    if not primary:
        mjson = re.search(r'response json:\s*(\{[\s\S]{0,12000}?\})', blob)
        if mjson:
            try:
                data: Any = json.loads(mjson.group(1))
                if isinstance(data, dict):
                    inner = data.get('error') or data.get('message') or data.get('detail')
                    if isinstance(inner, str) and inner.strip():
                        primary = inner.strip()
                    elif isinstance(inner, dict) and isinstance(inner.get('message'), str):
                        primary = str(inner['message']).strip()
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    if not primary:
        mh = re.search(r'(\d{3})\s+Client Error:\s*([^\r\n]+)', blob)
        if mh:
            primary = f"HTTP {mh.group(1)}: {mh.group(2).strip()}"

    if not primary:
        if 'RECRAFT_API_KEY' in blob and ('не задан' in blob or 'not set' in blob.lower()):
            primary = 'Не задан ключ API Recraft (RECRAFT_API_KEY).'
            hint = 'Добавьте RECRAFT_API_KEY в файл .env в корне проекта и перезапустите сервер.'

    if not primary:
        mconn = re.search(
            r'(Connection(?:Error| refused)|Timeout|Name or service not known|'
            r'Failed to establish a new connection|Temporary failure in name resolution)'
            r'[^\r\n]*',
            blob,
            re.IGNORECASE,
        )
        if mconn:
            primary = _norm_primary(mconn.group(0))
            hint = hint or 'Проверьте доступ к интернету и настройки прокси / DNS.'

    if not primary:
        for line in blob.splitlines():
            s = line.strip()
            if not s or s.startswith('Traceback'):
                continue
            if 'returned non-zero exit status' in s and 'Command' in s:
                continue
            if '[DEBUG]' in s or (s.startswith('[') and '] [INFO]' in s):
                continue
            if '[ERROR]' in s and 'response text' not in s.lower():
                inner = re.sub(r'^\[[^\]]+\]\s*(\[[^\]]+\]\s*)*', '', s)
                inner = re.sub(r'^\[ERROR\]\s*', '', inner, flags=re.IGNORECASE).strip()
                if inner and len(inner) > 3:
                    primary = inner
                    break

    if not primary:
        primary = 'Генерация не удалась. Подробности смотрите в консоли, где запущен сервер.'

    primary = _norm_primary(primary)

    low = primary.lower()
    blob_low = blob.lower()
    if hint is None and ('401' in blob or 'unauthorized' in low or 'request unauthorized' in blob_low):
        hint = (
            'Ключ Recraft отклонён (401). Проверьте RECRAFT_API_KEY в .env в корне проекта '
            'и что на счёте есть средства / доступ к API.'
        )
    if hint is None and '402' in blob:
        hint = 'Проверьте баланс и тариф в панели Recraft.'
    if hint is None and ('429' in blob or 'rate limit' in blob_low):
        hint = 'Слишком много запросов к API. Подождите и повторите попытку.'

    return primary, hint
