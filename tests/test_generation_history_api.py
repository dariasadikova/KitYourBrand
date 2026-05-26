from __future__ import annotations

from fastapi.testclient import TestClient

from app.db import project_service


def _register_user(client: TestClient, *, email: str, password: str = 'strongpass123') -> None:
    response = client.post(
        '/api/auth/register',
        json={
            'name': 'History User',
            'email': email,
            'password': password,
            'password_confirm': password,
        },
    )
    assert response.status_code == 200


def _login_user(client: TestClient, *, email: str, password: str = 'strongpass123') -> dict:
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    payload = response.json()
    assert payload['authenticated'] is True
    return payload


def _create_project(client: TestClient, name: str = 'History Brand') -> dict:
    response = client.post('/api/projects', json={'name': name})
    assert response.status_code == 200
    return response.json()['project']


def _create_history_row(client: TestClient, unique_email: str, *, job_id: str = 'job-success-001') -> tuple[int, dict]:
    _register_user(client, email=unique_email)
    login_payload = _login_user(client, email=unique_email)
    user_id = int(login_payload['user']['id'])
    project = _create_project(client)

    project_service.record_generation_job(
        user_id=user_id,
        job_id=job_id,
        project_slug=project['slug'],
        provider_statuses={'recraft': 'success', 'seedream': 'skipped'},
        initial_logs=['Задача создана', 'Генерация завершена успешно!'],
    )
    project_service.finalize_generation_job_record(job_id, 'success')
    return user_id, project


def test_generation_history_requires_authentication(client: TestClient) -> None:
    response = client.get('/api/generation-history')

    assert response.status_code == 401


def test_generation_history_empty_state(authenticated_client: TestClient) -> None:
    response = authenticated_client.get('/api/generation-history')

    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['rows'] == []
    assert payload['total'] == 0
    assert payload['total_pages'] == 1
    assert payload['showing_from'] == 0
    assert payload['showing_to'] == 0


def test_generation_history_lists_successful_jobs(client: TestClient, unique_email: str) -> None:
    _, project = _create_history_row(client, unique_email)

    response = client.get('/api/generation-history')
    assert response.status_code == 200
    payload = response.json()

    assert payload['ok'] is True
    assert payload['total'] == 1
    assert payload['stats']['total'] == 1
    assert payload['stats']['successful'] == 1
    assert payload['rows'][0]['job_id'] == 'job-success-001'
    assert payload['rows'][0]['project_slug'] == project['slug']
    assert payload['rows'][0]['status_key'] == 'success'
    assert payload['rows'][0]['action'] == 'open'
    assert payload['rows'][0]['results_url'] == f"/app/projects/{project['slug']}/results?job=job-success-001"


def test_generation_history_delete_selected(client: TestClient, unique_email: str) -> None:
    _create_history_row(client, unique_email, job_id='job-delete-001')

    response = client.post('/api/generation-history/delete-selected', json={'job_ids': ['job-delete-001']})
    assert response.status_code == 200
    assert response.json() == {'ok': True, 'deleted': 1, 'skipped': 0}

    after = client.get('/api/generation-history').json()
    assert after['total'] == 0
    assert after['rows'] == []


def test_generation_history_clear_skips_running_jobs(client: TestClient, unique_email: str) -> None:
    login_user_id, project = _create_history_row(client, unique_email, job_id='job-clear-success')
    project_service.record_generation_job(
        user_id=login_user_id,
        job_id='job-clear-running',
        project_slug=project['slug'],
        provider_statuses={'recraft': 'running'},
    )
    project_service.set_generation_job_running('job-clear-running')

    response = client.post('/api/generation-history/clear')

    assert response.status_code == 200
    payload = response.json()
    assert payload == {'ok': True, 'deleted': 1, 'skipped': 1}

    after = client.get('/api/generation-history').json()
    assert after['total'] == 1
    assert after['rows'][0]['job_id'] == 'job-clear-running'
