from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.core.settings import settings


def _register(client: TestClient, *, email: str, password: str = 'strongpass123', name: str = 'Test User') -> None:
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
    assert response.json()['ok'] is True


def _login(client: TestClient, *, email: str, password: str = 'strongpass123') -> dict:
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['authenticated'] is True
    return payload


def test_me_unauthenticated(client: TestClient) -> None:
    response = client.get('/api/auth/me')
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['authenticated'] is False
    assert payload['user'] is None


def test_register_login_me_logout(client: TestClient, unique_email: str) -> None:
    _register(client, email=unique_email)
    login_payload = _login(client, email=unique_email)
    assert login_payload['user']['email'] == unique_email

    me_response = client.get('/api/auth/me')
    assert me_response.status_code == 200
    me_payload = me_response.json()
    assert me_payload['authenticated'] is True
    assert me_payload['user']['email'] == unique_email

    logout_response = client.post('/api/auth/logout')
    assert logout_response.status_code == 200
    assert logout_response.json()['authenticated'] is False

    me_after_logout = client.get('/api/auth/me')
    assert me_after_logout.json()['authenticated'] is False


def test_register_password_mismatch(client: TestClient, unique_email: str) -> None:
    response = client.post(
        '/api/auth/register',
        json={
            'name': 'Test User',
            'email': unique_email,
            'password': 'strongpass123',
            'password_confirm': 'otherpass123',
        },
    )
    assert response.status_code == 400
    assert response.json()['ok'] is False


def test_login_wrong_password(client: TestClient, unique_email: str) -> None:
    _register(client, email=unique_email)
    response = client.post(
        '/api/auth/login',
        json={'email': unique_email, 'password': 'wrong-password'},
    )
    assert response.status_code == 400
    assert response.json()['ok'] is False


def test_forgot_password_unknown_email_same_response(client: TestClient) -> None:
    response = client.post(
        '/api/auth/forgot-password',
        json={'email': 'nobody@example.com'},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert 'message' in payload
    assert 'dev_reset_url' not in payload


def test_password_reset_flow(client: TestClient, unique_email: str) -> None:
    old_password = 'strongpass123'
    new_password = 'newstrong99'
    _register(client, email=unique_email, password=old_password)
    _login(client, email=unique_email, password=old_password)

    forgot_response = client.post('/api/auth/forgot-password', json={'email': unique_email})
    assert forgot_response.status_code == 200
    forgot_payload = forgot_response.json()
    assert forgot_payload['ok'] is True

    if not settings.debug:
        return

    dev_reset_url = forgot_payload.get('dev_reset_url')
    assert dev_reset_url
    token = parse_qs(urlparse(dev_reset_url).query)['token'][0]

    validate_response = client.get(f'/api/auth/reset-password/validate?token={token}')
    assert validate_response.status_code == 200
    assert validate_response.json()['valid'] is True

    client.post('/api/auth/logout')

    reset_response = client.post(
        '/api/auth/reset-password',
        json={
            'token': token,
            'password': new_password,
            'password_confirm': new_password,
        },
    )
    assert reset_response.status_code == 200
    assert reset_response.json()['ok'] is True

    old_login = client.post('/api/auth/login', json={'email': unique_email, 'password': old_password})
    assert old_login.status_code == 400

    _login(client, email=unique_email, password=new_password)
