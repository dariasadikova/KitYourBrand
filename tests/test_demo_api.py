from __future__ import annotations

from fastapi.testclient import TestClient


def test_demo_status_is_inactive_for_new_session(client: TestClient) -> None:
    response = client.get('/api/demo/status')

    assert response.status_code == 200
    assert response.json() == {'ok': True, 'demo_mode': False}


def test_start_demo_creates_guest_project(client: TestClient) -> None:
    response = client.post('/api/demo/start')

    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['demo_mode'] is True
    assert payload['demo_generation_used'] is False
    assert payload['project']['slug']
    assert payload['project']['editor_url'] == f"/app/demo/projects/{payload['project']['slug']}"
    assert payload['project']['results_url'] == f"/app/demo/projects/{payload['project']['slug']}/results"
    assert payload['redirect_url'] == f"/app/demo/projects/{payload['project']['slug']}?new=1"

    status_response = client.get('/api/demo/status')
    assert status_response.status_code == 200
    status_payload = status_response.json()
    assert status_payload['demo_mode'] is True
    assert status_payload['demo_project_slug'] == payload['project']['slug']
    assert status_payload['project']['slug'] == payload['project']['slug']


def test_start_demo_reuses_existing_guest_project(client: TestClient) -> None:
    first = client.post('/api/demo/start').json()
    second_response = client.post('/api/demo/start')

    assert second_response.status_code == 200
    second = second_response.json()
    assert second['project']['slug'] == first['project']['slug']
    assert second['redirect_url'] == f"/app/demo/projects/{first['project']['slug']}"


def test_authenticated_user_cannot_start_demo(authenticated_client: TestClient) -> None:
    response = authenticated_client.post('/api/demo/start')

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'аккаунт' in payload['error'].lower()
