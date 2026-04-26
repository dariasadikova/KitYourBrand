from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime

LOG_FILE = Path(__file__).resolve().parents[1] / "recraft.log"


def _ts() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _fmt(fmt: str, args: tuple) -> str:
    if not args:
        return fmt
    try:
        return fmt % args
    except (TypeError, ValueError):
        return fmt


def _append_to_file(line: str) -> None:
    try:
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        # Логирование не должно ломать генерацию
        pass


def _emit(level: str, message: str, *, to_stderr: bool = False) -> None:
    line = f"[{_ts()}] [{level}] {message}"

    if to_stderr:
        print(line, file=sys.stderr, flush=True)
    else:
        print(line, flush=True)

    _append_to_file(line)


def info(fmt: str, *args: object) -> None:
    _emit("INFO", _fmt(fmt, args), to_stderr=False)


def warn(fmt: str, *args: object) -> None:
    _emit("WARN", _fmt(fmt, args), to_stderr=True)


def error(fmt: str, *args: object) -> None:
    _emit("ERROR", _fmt(fmt, args), to_stderr=True)


def debug(fmt: str, *args: object) -> None:
    """Подробности для отладки (в stderr)."""
    _emit("DEBUG", _fmt(fmt, args), to_stderr=True)
