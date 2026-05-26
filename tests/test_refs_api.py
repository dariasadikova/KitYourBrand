from __future__ import annotations

from fastapi.testclient import TestClient


def _create_project(client: TestClient, name: str = 'Refs Brand') -> dict:
    response = client.post('/api/projects', json={'name': name})
    assert response.status_code == 200
    return response.json()['project']


def test_refs_require_authentication(client: TestClient) -> None:
    response = client.get('/api/projects/missing/editor/refs')

    assert response.status_code == 401


def test_upload_list_and_delete_reference(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)

    upload_response = authenticated_client.post(
        f"/api/projects/{project['slug']}/editor/refs",
        data={'asset_type': 'icons'},
        files={'files': ('icon-ref.png', b'fake-png-bytes', 'image/png')},
    )
    assert upload_response.status_code == 200
    uploaded = upload_response.json()
    assert uploaded['ok'] is True
    assert uploaded['asset_type'] == 'icons'
    assert uploaded['references']['icons']
    ref_path = uploaded['references']['icons'][0]
    assert ref_path.startswith('uploads/refs/')
    assert uploaded['images'] == [ref_path]

    list_response = authenticated_client.get(f"/api/projects/{project['slug']}/editor/refs")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed['ok'] is True
    assert listed['references']['icons'] == [ref_path]
    assert listed['images'] == [ref_path]

    delete_response = authenticated_client.post(
        f"/api/projects/{project['slug']}/editor/refs/delete",
        json={'path': ref_path, 'asset_type': 'icons'},
    )
    assert delete_response.status_code == 200
    deleted = delete_response.json()
    assert deleted['ok'] is True
    assert deleted['asset_type'] == 'icons'
    assert deleted['references']['icons'] == []
    assert deleted['images'] == []


def test_upload_reference_rejects_unknown_asset_type(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)

    response = authenticated_client.post(
        f"/api/projects/{project['slug']}/editor/refs",
        data={'asset_type': 'unknown'},
        files={'files': ('ref.png', b'fake', 'image/png')},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'тип ассета' in payload['error'].lower()


def test_upload_reference_rejects_bad_extension(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)

    response = authenticated_client.post(
        f"/api/projects/{project['slug']}/editor/refs",
        data={'asset_type': 'logos'},
        files={'files': ('ref.txt', b'not-an-image', 'text/plain')},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'тип файла' in payload['error'].lower()


def test_delete_reference_rejects_unsafe_path(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)

    response = authenticated_client.post(
        f"/api/projects/{project['slug']}/editor/refs/delete",
        json={'path': '../tokens.json', 'asset_type': 'logos'},
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload['ok'] is False
    assert 'путь' in payload['error'].lower()
