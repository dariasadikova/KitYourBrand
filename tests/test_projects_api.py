from __future__ import annotations

from fastapi.testclient import TestClient


def _register_user(
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


def _login_user(client: TestClient, *, email: str, password: str = 'strongpass123') -> dict:
    response = client.post('/api/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['authenticated'] is True
    return payload


def _create_project(client: TestClient, name: str = 'Test Brand') -> dict:
    response = client.post('/api/projects', json={'name': name})
    assert response.status_code == 200
    payload = response.json()
    assert payload['ok'] is True
    assert payload['project']['name'] == name
    assert payload['redirect_url'].startswith('/app/projects/')
    return payload['project']


def test_projects_require_authentication(client: TestClient) -> None:
    response = client.get('/api/projects')

    assert response.status_code == 401


def test_create_project_and_list_it(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Aurora Brand')

    response = authenticated_client.get('/api/projects')
    assert response.status_code == 200
    payload = response.json()

    assert payload['ok'] is True
    assert payload['show_generation_history'] is True
    assert [item['slug'] for item in payload['projects']] == [project['slug']]
    assert payload['projects'][0]['editor_url'] == f"/app/projects/{project['slug']}"
    assert payload['projects'][0]['results_url'] == f"/app/projects/{project['slug']}/results"


def test_editor_returns_default_tokens(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Editor Brand')

    response = authenticated_client.get(f"/api/projects/{project['slug']}/editor")
    assert response.status_code == 200
    payload = response.json()

    assert payload['ok'] is True
    assert payload['project']['slug'] == project['slug']
    assert payload['tokens']['name'] == 'Editor Brand'
    assert payload['tokens']['brand_id'].startswith('editor-brand-')
    assert payload['references'] == {
        'logos': [],
        'icons': [],
        'patterns': [],
        'illustrations': [],
    }


def test_save_and_reset_project_tokens(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Resettable Brand')
    editor_response = authenticated_client.get(f"/api/projects/{project['slug']}/editor")
    tokens = editor_response.json()['tokens']

    tokens['name'] = 'Updated Brand'
    tokens['brand_description'] = 'Updated description'
    tokens['palette']['primary'] = '#00AEFF'

    save_response = authenticated_client.post(f"/api/projects/{project['slug']}/editor/save", json=tokens)
    assert save_response.status_code == 200
    saved = save_response.json()
    assert saved['ok'] is True
    assert saved['tokens']['name'] == 'Updated Brand'
    assert saved['tokens']['palette']['primary'] == '#00AEFF'

    reset_response = authenticated_client.post(f"/api/projects/{project['slug']}/editor/reset")
    assert reset_response.status_code == 200
    reset_payload = reset_response.json()
    assert reset_payload['ok'] is True
    assert reset_payload['tokens']['name'] == 'Resettable Brand'
    assert reset_payload['tokens']['palette']['primary'] != '#00AEFF'


def test_delete_and_restore_project(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Archived Brand')

    delete_response = authenticated_client.post(f"/api/projects/{project['slug']}/delete")
    assert delete_response.status_code == 200
    assert delete_response.json()['ok'] is True

    list_after_delete = authenticated_client.get('/api/projects').json()
    assert list_after_delete['projects'] == []

    editor_after_delete = authenticated_client.get(f"/api/projects/{project['slug']}/editor")
    assert editor_after_delete.status_code == 404

    restore_response = authenticated_client.post(f"/api/projects/{project['slug']}/restore")
    assert restore_response.status_code == 200
    assert restore_response.json()['ok'] is True

    list_after_restore = authenticated_client.get('/api/projects').json()
    assert [item['slug'] for item in list_after_restore['projects']] == [project['slug']]


def test_project_access_is_scoped_to_owner(client: TestClient, unique_email: str) -> None:
    owner_email = unique_email
    _register_user(client, email=owner_email)
    _login_user(client, email=owner_email)
    project = _create_project(client, 'Private Brand')

    client.post('/api/auth/logout')
    other_email = f'other-{unique_email}'
    _register_user(client, email=other_email)
    _login_user(client, email=other_email)

    editor_response = client.get(f"/api/projects/{project['slug']}/editor")
    delete_response = client.post(f"/api/projects/{project['slug']}/delete")

    assert editor_response.status_code == 404
    assert delete_response.status_code == 404
