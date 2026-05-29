from __future__ import annotations

from fastapi.testclient import TestClient


def test_profile_requires_authentication(client: TestClient) -> None:
    response = client.get('/api/profile')

    assert response.status_code == 401


def test_get_profile_returns_user_data(authenticated_client: TestClient) -> None:
    response = authenticated_client.get('/api/profile')

    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['profile']['name'] == 'Test User'
    assert payload['profile']['email'].endswith('@example.com')
    assert payload['profile']['initial'] == 'T'
    assert payload['profile']['avatar_url'] == ''
    assert payload['profile']['api_keys']['recraft']['configured'] is False
    assert payload['profile']['api_keys']['openrouter']['configured'] is False


def test_update_profile_name_and_api_keys(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        '/api/profile/update',
        data={
            'name': 'Updated User',
            'recraft_api_key': 'recraft-secret-123456',
            'openrouter_api_key': 'openrouter-secret-654321',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['profile']['name'] == 'Updated User'
    assert payload['profile']['initial'] == 'U'
    assert payload['profile']['api_keys']['recraft'] == {
        'configured': True,
        'masked': 'recr••••3456',
    }
    assert payload['profile']['api_keys']['openrouter'] == {
        'configured': True,
        'masked': 'open••••4321',
    }


def test_update_profile_rejects_short_name(authenticated_client: TestClient) -> None:
    response = authenticated_client.post('/api/profile/update', data={'name': 'A'})

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'Имя' in payload['error']


def test_delete_account_requires_password(authenticated_client: TestClient) -> None:
    response = authenticated_client.post('/api/profile/delete-account', data={'password': ''})

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'пароль' in payload['error'].lower()


def test_delete_account_rejects_wrong_password(authenticated_client: TestClient) -> None:
    response = authenticated_client.post('/api/profile/delete-account', data={'password': 'wrong-password'})

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'Неверный пароль' in payload['error']


def test_delete_account_removes_user_and_logs_out(authenticated_client: TestClient) -> None:
    response = authenticated_client.post('/api/profile/delete-account', data={'password': 'strongpass123'})

    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True

    me = authenticated_client.get('/api/auth/me')
    assert me.status_code == 200
    assert me.json()['authenticated'] is False

    profile = authenticated_client.get('/api/profile')
    assert profile.status_code == 401


def test_update_profile_rejects_invalid_avatar_type(authenticated_client: TestClient) -> None:
    response = authenticated_client.post(
        '/api/profile/update',
        data={'name': 'Test User'},
        files={'avatar': ('avatar.txt', b'not-an-image', 'text/plain')},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'формат' in payload['error'].lower()
