from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_ROOT = Path(tempfile.mkdtemp(prefix='kybby-tests-'))
os.environ['DATA_DIR'] = str(TEST_ROOT / 'data')
os.environ['OUTPUT_DIR'] = str(TEST_ROOT / 'out')

from app.main import app  # noqa: E402


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    shutil.rmtree(TEST_ROOT, ignore_errors=True)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def unique_email() -> str:
    return f'{uuid4().hex}@example.com'


def register_user(
    client: TestClient,
    *,
    email: str,
    password: str = 'strongpass123',
    name: str = 'Test User',
) -> dict:
    response = client.post(
        '/api/auth/register',
        json={
            'name': name,
            'email': email,
            'password': password,
            'password_confirm': password,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    return payload


def login_user(client: TestClient, *, email: str, password: str = 'strongpass123') -> dict:
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['authenticated'] is True
    return payload


@pytest.fixture
def authenticated_client(client: TestClient, unique_email: str) -> TestClient:
    register_user(client, email=unique_email)
    login_user(client, email=unique_email)
    return client
