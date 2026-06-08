from __future__ import annotations

import subprocess

from app.services.generation_error_summary import (
    ProviderGenerationError,
    summarize_generation_failure,
    user_log_line_for_provider_error,
)


def test_summarize_disk_full_from_cli_traceback() -> None:
    stderr = (
        'Traceback (most recent call last):\n'
        '  File "main.py", line 134, in save_png\n'
        '    f.write(raw)\n'
        'OSError: [Errno 28] No space left on device\n'
    )
    exc = subprocess.CalledProcessError(1, ['python', 'main.py'], output='', stderr=stderr)
    primary, hint = summarize_generation_failure(exc, provider='alice_ai_art')
    assert 'места на диске' in primary
    assert hint is not None
    assert 'диск' in hint.lower()


def test_user_log_line_never_mentions_server_console() -> None:
    line = user_log_line_for_provider_error(
        'alice_ai_art',
        'Генерация не удалась. Подробности смотрите в консоли, где запущен сервер.',
        'Освободите место на диске.',
    )
    assert 'консол' not in line.lower()
    assert 'Alice AI ART' in line
    assert 'диск' in line.lower()


def test_provider_generation_error_recovers_from_stderr() -> None:
    exc = ProviderGenerationError(
        'alice_ai_art',
        'Генерация не удалась. Подробности смотрите в консоли, где запущен сервер.',
        stderr='OSError: [Errno 28] No space left on device',
    )
    primary, hint = summarize_generation_failure(exc, provider='alice_ai_art')
    assert 'места на диске' in primary
    assert hint is not None


def test_summarize_yandex_api_key_missing_from_cli_stderr() -> None:
    stderr = 'ERROR: set YANDEX_CLOUD_API_KEY env var\n'
    exc = subprocess.CalledProcessError(2, ['python', 'main.py'], output='', stderr=stderr)
    primary, hint = summarize_generation_failure(exc, provider='alice_ai_art')
    assert 'Yandex Cloud API Key' in primary
    assert hint is not None
    assert 'профил' in hint.lower()


def test_user_log_line_yandex_api_key_missing() -> None:
    line = user_log_line_for_provider_error(
        'alice_ai_art',
        'ERROR: set YANDEX_CLOUD_API_KEY env var',
        None,
    )
    assert 'не удалось сгенерировать ассеты' not in line.lower()
    assert 'Yandex Cloud API Key' in line
    assert 'Alice AI ART' in line
    assert 'профил' in line.lower()
