from __future__ import annotations

import io
import zipfile

from fastapi.testclient import TestClient

from app.core.paths import OUT_DIR
from app.db import project_service


def _create_project(client: TestClient, name: str = 'Results Brand') -> dict:
    response = client.post('/api/projects', json={'name': name})
    assert response.status_code == 200
    return response.json()['project']


def _editor_tokens(client: TestClient, slug: str) -> dict:
    response = client.get(f'/api/projects/{slug}/editor')
    assert response.status_code == 200
    return response.json()['tokens']


def _save_tokens(client: TestClient, slug: str, tokens: dict) -> dict:
    response = client.post(f'/api/projects/{slug}/editor/save', json=tokens)
    assert response.status_code == 200
    return response.json()['tokens']


def test_results_require_authentication(client: TestClient) -> None:
    response = client.get('/api/projects/missing/results')

    assert response.status_code == 401


def test_results_empty_before_successful_generation(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)
    tokens = _editor_tokens(authenticated_client, project['slug'])
    tokens['brand_description'] = 'A test brand for empty results.'
    tokens['generation'] = {'provider_slugs': ['recraft', 'seedream']}
    saved = _save_tokens(authenticated_client, project['slug'], tokens)

    response = authenticated_client.get(f"/api/projects/{project['slug']}/results")
    assert response.status_code == 200
    payload = response.json()

    assert payload['ok'] is True
    assert payload['project']['slug'] == project['slug']
    assert payload['project']['brand_id'] == saved['brand_id']
    assert payload['project']['brand_description'] == 'A test brand for empty results.'
    assert payload['palette_items'] == []
    assert payload['assets'] == {'logos': [], 'icons': [], 'patterns': [], 'illustrations': []}
    assert payload['generation_provider_slugs'] == ['recraft', 'seedream']
    assert payload['active_generation_job_id'] == ''
    assert payload['selected_generation_job_id'] == ''


def test_results_use_selected_successful_generation_assets(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Generated Brand')
    tokens = _editor_tokens(authenticated_client, project['slug'])
    tokens['brand_id'] = 'generated-brand'
    tokens['palette_slots'] = {
        'primary': '#111111',
        'secondary': '#222222',
        'accent': '#333333',
    }
    tokens['generation'] = {
        'active_palette_keys': ['primary', 'accent'],
        'provider_slugs': ['recraft'],
    }
    _save_tokens(authenticated_client, project['slug'], tokens)

    me_response = authenticated_client.get('/api/auth/me')
    user_id = int(me_response.json()['user']['id'])
    job_id = 'job-results-001'

    out_file = OUT_DIR / 'recraft' / 'generated-brand' / 'logos' / 'logo.png'
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_bytes(b'fake-image')

    project_service.record_generation_job(
        user_id=user_id,
        job_id=job_id,
        project_slug=project['slug'],
        provider_statuses={'recraft': 'success'},
        initial_logs=['ok'],
    )
    inserted = project_service.record_generated_assets_for_brand(
        user_id,
        project['slug'],
        'generated-brand',
        OUT_DIR,
        job_id=job_id,
        provider_slugs=frozenset({'recraft'}),
    )
    project_service.finalize_generation_job_record(job_id, 'success')
    assert inserted == 1

    response = authenticated_client.get(f"/api/projects/{project['slug']}/results?job={job_id}")
    assert response.status_code == 200
    payload = response.json()

    assert payload['ok'] is True
    assert payload['selected_generation_job_id'] == job_id
    assert payload['palette_items'] == [
        {'key': 'primary', 'label': 'Primary', 'value': '#111111'},
        {'key': 'accent', 'label': 'Accent', 'value': '#333333'},
    ]
    assert payload['assets']['logos'] == [
        {
            'provider': 'recraft',
            'name': 'logo',
            'filename': 'logo.png',
            'url': f"/projects/{project['slug']}/result-assets/{job_id}/recraft/logos/logo.png",
        }
    ]
    assert payload['assets']['icons'] == []


def test_results_reject_unknown_generation_job(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client)

    response = authenticated_client.get(f"/api/projects/{project['slug']}/results?job=missing-job")

    assert response.status_code == 404


def test_download_all_generated_assets_from_legacy_output(authenticated_client: TestClient) -> None:
    project = _create_project(authenticated_client, 'Downloadable Brand')
    tokens = _editor_tokens(authenticated_client, project['slug'])
    tokens['brand_id'] = 'downloadable-brand'
    _save_tokens(authenticated_client, project['slug'], tokens)

    logo_file = OUT_DIR / 'recraft' / 'downloadable-brand' / 'logos' / 'logo.png'
    logo_file.parent.mkdir(parents=True, exist_ok=True)
    logo_file.write_bytes(b'fake-logo')
    meta_file = OUT_DIR / '_meta' / 'downloadable-brand' / 'manifest.json'
    meta_file.parent.mkdir(parents=True, exist_ok=True)
    meta_file.write_text('{"ok": true}', encoding='utf-8')

    response = authenticated_client.get(f"/projects/{project['slug']}/downloads/all")

    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/zip'
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert 'recraft/logos/logo.png' in archive.namelist()
        assert '_meta/manifest.json' in archive.namelist()
        assert 'tokens.json' in archive.namelist()
