"""Краткое сообщение об ошибке генерации для UI (без полного traceback и stderr)."""
from __future__ import annotations

import json
import re
import subprocess
from typing import Any


class ProviderGenerationError(RuntimeError):
    """Исключение с уже нормализованной ошибкой конкретного провайдера."""

    def __init__(
        self,
        provider: str,
        user_message: str,
        hint: str | None = None,
        *,
        stdout: str | None = None,
        stderr: str | None = None,
    ) -> None:
        super().__init__(user_message)
        self.provider = provider
        self.user_message = user_message
        self.hint = hint
        self.stdout = stdout or ''
        self.stderr = stderr or ''


def _collect_text(exc: BaseException) -> str:
    if isinstance(exc, ProviderGenerationError):
        parts = [exc.stderr or '', exc.stdout or '', exc.user_message or '', str(exc)]
        return '\n'.join(p for p in parts if p and str(p).strip())

    if isinstance(exc, subprocess.CalledProcessError):
        parts = [exc.stderr or '', exc.stdout or '', str(exc)]
        return '\n'.join(p for p in parts if p and str(p).strip())

    return str(exc) or ''


def _norm_primary(msg: str) -> str:
    msg = ' '.join(msg.split())
    if len(msg) > 320:
        return msg[:317] + '…'
    return msg


def _extract_provider(exc: BaseException, provider: str | None) -> str | None:
    explicit = (provider or '').strip().lower()
    if explicit:
        return explicit

    exc_provider = getattr(exc, 'provider', None)
    if isinstance(exc_provider, str) and exc_provider.strip():
        return exc_provider.strip().lower()

    blob = _collect_text(exc).lower()
    if 'recraft' in blob:
        return 'recraft'
    if 'openrouter' in blob:
        return 'openrouter'
    return None


def _extract_http_code(blob: str) -> int | None:
    patterns = [
        r'openrouter error \((\d{3})\)',
        r'http\s*(\d{3})',
        r'(\d{3})\s+client error',
        r'"code"\s*:\s*(\d{3})',
        r'"status"\s*:\s*(\d{3})',
    ]
    for pattern in patterns:
        m = re.search(pattern, blob, re.IGNORECASE)
        if m:
            try:
                return int(m.group(1))
            except (TypeError, ValueError):
                return None
    return None


def _provider_hint(provider: str | None, code: int | None, blob: str, primary: str) -> str | None:
    provider = (provider or '').strip().lower()
    low = primary.lower()
    blob_low = blob.lower()

    if provider in ('seedream', 'flux', 'openrouter', 'nano_banana', 'gpt5_image'):
        api_name = 'OpenRouter'
        env_name = 'OPENROUTER_API_KEY'
    else:
        api_name = 'Recraft'
        env_name = 'RECRAFT_API_KEY'

    if code == 401 or 'unauthorized' in low or 'request unauthorized' in blob_low or 'missing authentication header' in low:
        return (
            f'Ключ {api_name} отклонён (401). Проверьте {env_name} в .env '
            f'в корне проекта и что у аккаунта есть доступ к API.'
        )

    if code == 402:
        return f'Проверьте баланс и тариф в панели {api_name}.'

    if code == 429 or 'rate limit' in blob_low:
        return f'Слишком много запросов к API {api_name}. Подождите и повторите попытку.'

    return None


def _contains_cyrillic(text: str) -> bool:
    return bool(re.search(r'[\u0400-\u04FF]', text))


def _russianize_provider_detail(raw: str) -> str:
    """Краткое объяснение для журнала UI: по возможности без сырого англ. вывода консоли."""
    cleaned = ' '.join(str(raw or '').split())
    if not cleaned:
        return ''
    if _contains_cyrillic(cleaned):
        return cleaned[:280] + ('…' if len(cleaned) > 280 else '')

    low = cleaned.lower()
    code = _extract_http_code(cleaned)

    if code == 401 or 'unauthorized' in low or 'invalid api key' in low or 'incorrect api key' in low:
        return 'Ошибка доступа: API отклонил ключ (401). Проверьте ключ в профиле или в .env.'
    if code == 402 or ('payment' in low and 'required' in low) or 'insufficient' in low and (
        'credit' in low or 'balance' in low or 'quota' in low
    ):
        return 'Недостаточно средств, кредитов или квоты у провайдера (402 / balance).'
    if code == 403 or 'forbidden' in low:
        return 'Доступ запрещён (403): проверьте права ключа и регион API.'
    if code == 404 or 'not found' in low:
        return 'Ресурс или модель не найдены (404). Проверьте имя модели в настройках.'
    if code == 429 or 'rate limit' in low or 'too many requests' in low:
        return 'Слишком много запросов (429). Подождите и запустите генерацию снова.'
    if code is not None and 500 <= code < 600:
        return f'Сбой на стороне сервиса (HTTP {code}). Повторите позже.'

    if 'timeout' in low or 'timed out' in low or 'read operation timed out' in low:
        return 'Превышено время ожидания ответа от API. Повторите попытку или уменьшите объём генерации.'
    if 'connection' in low or 'name or service not known' in low or 'failed to establish' in low:
        return 'Нет соединения с сервером API. Проверьте интернет, VPN и DNS.'
    if 'non-zero exit status' in low or 'calledprocesserror' in low:
        return 'Процесс провайдера завершился с ошибкой (подробный вывод — в консоли сервера).'
    if 'bad gateway' in low or 'gateway timeout' in low or 'service unavailable' in low or '503' in cleaned:
        return 'Сервис временно недоступен (шлюз / 503). Повторите позже.'

    return (
        'Запрос к внешнему API завершился ошибкой. Проверьте ключи в профиле, баланс и доступность моделей.'
    )


def user_log_line_for_provider_error(provider_slug: str, message: str | None, hint: str | None) -> str:
    """Одна строка для job.logs при ошибке провайдера (понятный русский для модалки / истории)."""
    from app.core.providers import PROVIDERS

    cfg = PROVIDERS.get(provider_slug)
    label = cfg.label if cfg else str(provider_slug).replace('_', ' ').title()
    msg = str(message or '').strip()
    hint_str = str(hint or '').strip()
    detail = _russianize_provider_detail(msg) if msg else ''

    parts: list[str] = [f'— {label}: сбой генерации.']
    if detail:
        parts.append(detail)
    if hint_str:
        combined = ' '.join(parts)
        if hint_str not in combined:
            parts.append(f'Подсказка: {hint_str}')
    return ' '.join(parts)


def summarize_generation_failure(exc: BaseException, provider: str | None = None) -> tuple[str, str | None]:
    """
    Извлекает главное сообщение об ошибке из stdout/stderr CLI и текста исключения.
    Возвращает (сообщение для пользователя, опциональная подсказка).
    """
    if isinstance(exc, ProviderGenerationError):
        primary = _norm_primary(exc.user_message or 'Генерация не удалась.')
        hint = exc.hint
        if hint is None:
            blob = _collect_text(exc)
            code = _extract_http_code(blob)
            hint = _provider_hint(_extract_provider(exc, provider), code, blob, primary)
        return primary, hint

    blob = _collect_text(exc)
    hint: str | None = None
    primary: str | None = None
    resolved_provider = _extract_provider(exc, provider)

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
        if me and me.group(1).strip():
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
        if 'OPENROUTER_API_KEY' in blob and ('не задан' in blob or 'not set' in blob.lower()):
            primary = 'Не задан ключ API OpenRouter (OPENROUTER_API_KEY).'
            hint = 'Добавьте OPENROUTER_API_KEY в файл .env в корне проекта и перезапустите сервер.'

    if not primary:
        mconn = re.search(
            r'(Connection(?:Error| refused)|Timeout|Name or service not known|'
            r'Failed to establish a new connection|Temporary failure in name resolution|'
            r'The read operation timed out)'
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
            if re.search(r'\[(DEBUG|INFO|WARN)\]', s, re.IGNORECASE):
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

    if hint is None:
        code = _extract_http_code(blob)
        hint = _provider_hint(resolved_provider, code, blob, primary)

    return primary, hint
