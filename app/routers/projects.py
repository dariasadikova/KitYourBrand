from __future__ import annotations

import json
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.core.paths import OUT_DIR, TEMPLATES_DIR
from app.core.settings import settings
from app.services.generation_service import GenerationService
from app.services.generation_jobs import generation_jobs
from app.services.project_service import ProjectService

router = APIRouter()
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
project_service = ProjectService(settings.data_dir / 'app.db', settings.data_dir / 'projects')
project_service.init_db()
generation_service = GenerationService(project_service)


def require_auth(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return int(user_id)


def redirect_auth(request: Request):
    if not request.session.get('user_id'):
        return RedirectResponse(url='/login', status_code=status.HTTP_303_SEE_OTHER)
    return None


def project_or_404(user_id: int, project_slug: str):
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    return project

def _palette_items_from_tokens(tokens: dict) -> list[dict]:
    generation_cfg = tokens.get('generation') if isinstance(tokens.get('generation'), dict) else {}
    active_keys = generation_cfg.get('active_palette_keys') if isinstance(generation_cfg.get('active_palette_keys'), list) else []
    active_keys = [k for k in active_keys if isinstance(k, str)]

    palette_slots = tokens.get('palette_slots') if isinstance(tokens.get('palette_slots'), dict) else {}
    palette = tokens.get('palette') if isinstance(tokens.get('palette'), dict) else {}
    source = palette_slots or palette

    if not active_keys:
        active_keys = list(source.keys())[:6]

    labels = {
        'primary': 'Primary',
        'secondary': 'Secondary',
        'accent': 'Accent',
        'tertiary': 'Tertiary',
        'neutral': 'Neutral',
        'extra': 'Extra',
    }

    items = []
    for key in active_keys:
        value = source.get(key) or palette.get(key)
        if not value:
            continue
        items.append({'key': key, 'label': labels.get(key, key.title()), 'value': str(value).upper()})
    return items


def _scan_asset_group(brand_id: str, section: str, suffixes: tuple[str, ...]) -> list[dict]:
    provider_roots = [
        ('recraft', OUT_DIR / 'recraft' / brand_id / section),
        ('seedream', OUT_DIR / 'seedream' / brand_id / section),
        ('flux', OUT_DIR / 'flux' / brand_id / section),
    ]
    assets = []
    for provider, root in provider_roots:
        if not root.exists():
            continue
        for file_path in sorted(root.iterdir()):
            if file_path.is_file() and file_path.suffix.lower() in suffixes:
                assets.append({
                    'provider': provider,
                    'name': file_path.stem,
                    'filename': file_path.name,
                    'url': f'/assets/{brand_id}/{provider}/{section}/{file_path.name}',
                })
    return assets

def _build_download_zip(user_id: int, project_slug: str, brand_id: str, kind: str) -> Path:
    exports_dir = project_service.exports_dir(user_id, project_slug)
    exports_dir.mkdir(parents=True, exist_ok=True)
    zip_path = exports_dir / f'{project_slug}_{kind}.zip'

    section_map = {
        'icons': ['icons'],
        'patterns': ['patterns'],
        'illustrations': ['illustrations'],
        'all': ['icons', 'patterns', 'illustrations'],
    }
    if kind not in section_map:
        raise HTTPException(status_code=404, detail='Неизвестный тип экспорта.')

    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for provider in ('recraft', 'seedream', 'flux'):
            for section in section_map[kind]:
                section_dir = OUT_DIR / provider / brand_id / section
                if not section_dir.exists():
                    continue
                for file_path in sorted(section_dir.iterdir()):
                    if file_path.is_file():
                        zf.write(file_path, arcname=f'{provider}/{section}/{file_path.name}')

        if kind == 'all':
            meta_dir = OUT_DIR / '_meta' / brand_id
            if meta_dir.exists():
                for file_path in sorted(meta_dir.iterdir()):
                    if file_path.is_file():
                        zf.write(file_path, arcname=f'_meta/{file_path.name}')
            tokens_path = project_service.tokens_path(user_id, project_slug)
            if tokens_path.exists():
                zf.write(tokens_path, arcname='tokens.json')

    return zip_path

@router.post('/projects/create')
async def create_project(request: Request, name: str = Form('Новый проект')):
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect
    user_id = int(request.session['user_id'])
    project = project_service.create_project(user_id, name)
    return RedirectResponse(url=f'/projects/{project.slug}?new=1', status_code=status.HTTP_303_SEE_OTHER)


@router.post('/projects/{project_slug}/delete')
async def delete_project(request: Request, project_slug: str):
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    project_service.delete_project(user_id, project_slug)
    return RedirectResponse(url='/dashboard', status_code=status.HTTP_303_SEE_OTHER)


@router.post('/projects/{project_slug}/restore')
async def restore_project(request: Request, project_slug: str):
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect
    user_id = int(request.session['user_id'])
    if not project_service.restore_project(user_id, project_slug):
        raise HTTPException(status_code=404, detail='Проект не найден или уже активен.')
    return RedirectResponse(url='/generation-history', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/projects/{project_slug}', response_class=HTMLResponse)
async def project_editor_page(request: Request, project_slug: str) -> HTMLResponse:
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect
    user_id = int(request.session['user_id'])
    project = project_or_404(user_id, project_slug)
    tokens = project_service.load_tokens(user_id, project_slug)
    is_new_project_flow = request.query_params.get('new') == '1'
    context = {
        'request': request,
        'project': project,
        'is_new_project_flow': is_new_project_flow,
        'tokens_json': json.dumps(tokens, ensure_ascii=False),
        'user_email': request.session.get('user_email') or '',
        'user_initial': ((request.session.get('user_name') or '?')[:1]).upper(),
        'project_refs': tokens.get('references', {}).get('style_images', []),
    }
    return templates.TemplateResponse('pages/project_editor.html', context)


@router.post('/projects/{project_slug}/save')
async def save_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    data = await request.json()
    try:
        saved = project_service.save_tokens(user_id, project_slug, data)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'tokens': saved})


@router.get('/projects/{project_slug}/download')
async def download_project(request: Request, project_slug: str):
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    path = project_service.tokens_path(user_id, project_slug)
    if not path.exists():
        raise HTTPException(status_code=404, detail='tokens.json не найден.')
    return FileResponse(path, filename='tokens.json', media_type='application/json')


@router.post('/projects/{project_slug}/reset')
async def reset_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    try:
        tokens = project_service.reset_tokens(user_id, project_slug)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'tokens': tokens})


@router.post('/projects/{project_slug}/upload-refs')
async def upload_refs(request: Request, project_slug: str, files: list[UploadFile] = File(...)) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    if not files:
        return JSONResponse({'ok': False, 'error': 'Файлы не переданы.'}, status_code=400)
    payload = []
    for file in files:
        payload.append((file.filename or '', await file.read()))
    try:
        images = project_service.upload_refs(user_id, project_slug, payload)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'images': images})


@router.get('/projects/{project_slug}/list-refs')
async def list_refs(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    tokens = project_service.load_tokens(user_id, project_slug)
    return JSONResponse({'ok': True, 'images': tokens.get('references', {}).get('style_images', [])})


@router.post('/projects/{project_slug}/delete-ref')
async def delete_ref(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    data = await request.json()
    try:
        images = project_service.delete_ref(user_id, project_slug, str(data.get('path', '')))
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'images': images})


@router.get('/projects/{project_slug}/refs/{filename}')
async def serve_ref(request: Request, project_slug: str, filename: str):
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    path = project_service.uploads_dir(user_id, project_slug) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail='Файл не найден.')
    return FileResponse(path)


@router.post('/projects/{project_slug}/generate-figma')
async def generate_figma(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)

    try:
        data = await request.json()
        if not isinstance(data, dict):
            data = {}
    except Exception:
        data = {}

    tokens = project_service.load_tokens(user_id, project_slug)
    brand_id = (data.get('brand_id') or tokens.get('brand_id') or '').strip()
    if not brand_id:
        return JSONResponse({'ok': False, 'error': 'Укажите brand_id.'}, status_code=400)

    base_host = str(request.base_url).rstrip('/').replace('127.0.0.1', 'localhost')
    try:
        _, counts, export_path = generation_service.build_and_save_figma_manifest(
            user_id,
            project_slug,
            brand_id,
            base_host,
        )
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    return JSONResponse({
        'ok': True,
        'brand_id': brand_id,
        'counts': counts,
        'manifest_url': f'/assets/{brand_id}/figma_plugin_manifest.json',
        'download_url': f'/projects/{project_slug}/exports/{export_path.name}',
        'production_url': f'https://brand.kit/assets/{brand_id}/icons|patterns|illustrations',
        'local_url': f'{base_host}/assets/{brand_id}/...',
    })


@router.get('/projects/{project_slug}/exports/{filename}')
async def download_export(request: Request, project_slug: str, filename: str):
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    path = project_service.exports_dir(user_id, project_slug) / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail='Файл не найден.')
    return FileResponse(path, filename=filename)


@router.post('/projects/{project_slug}/generate/start')
async def start_generate_assets(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    data = await request.json()
    job = generation_jobs.create_job(user_id=user_id, project_slug=project_slug)
    project_service.record_generation_job(user_id=user_id, job_id=job['id'], project_slug=project_slug)
    generation_jobs.start_generation(
        job_id=job['id'],
        generation_service=generation_service,
        user_id=user_id,
        project_slug=project_slug,
        payload=data,
        base_host=str(request.base_url).rstrip('/'),
        project_service=project_service,
    )
    return JSONResponse({'ok': True, 'job_id': job['id']})


@router.get('/generation-jobs/{job_id}')
async def get_generation_job(request: Request, job_id: str) -> JSONResponse:
    user_id = require_auth(request)
    job = generation_jobs.get_job(job_id)
    if not job or int(job['user_id']) != user_id:
        raise HTTPException(status_code=404, detail='Задача не найдена.')
    return JSONResponse({'ok': True, 'job': job})


@router.post('/generation-jobs/{job_id}/cancel')
async def cancel_generation_job(request: Request, job_id: str) -> JSONResponse:
    user_id = require_auth(request)
    ok = generation_jobs.request_cancel(job_id, user_id)
    if not ok:
        return JSONResponse({'ok': False, 'error': 'Задача не найдена или уже завершена.'}, status_code=400)
    return JSONResponse({'ok': True})


@router.get('/projects/{project_slug}/generation/active')
async def get_active_generation_job_for_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = require_auth(request)
    project_or_404(user_id, project_slug)
    job = generation_jobs.get_active_job_for_project(user_id=user_id, project_slug=project_slug)
    return JSONResponse({'ok': True, 'job': job})


@router.api_route('/assets/{brand_id}/{relpath:path}', methods=['GET', 'OPTIONS'])
async def serve_assets(brand_id: str, relpath: str):
    if relpath.startswith('recraft/'):
        base_dir = OUT_DIR / 'recraft' / brand_id
        rel = relpath[len('recraft/'):]
    elif relpath.startswith('seedream/'):
        base_dir = OUT_DIR / 'seedream' / brand_id
        rel = relpath[len('seedream/'):]
    elif relpath.startswith('flux/'):
        base_dir = OUT_DIR / 'flux' / brand_id
        rel = relpath[len('flux/'):]
    elif relpath.startswith(('icons/', 'patterns/', 'illustrations/')):
        base_dir = OUT_DIR / 'recraft' / brand_id
        rel = relpath
    else:
        base_dir = OUT_DIR / '_meta' / brand_id
        rel = relpath
    file_path = (base_dir / rel).resolve()
    if not str(file_path).startswith(str(base_dir.resolve())):
        raise HTTPException(status_code=403, detail='Forbidden')
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail='Файл не найден.')
    return FileResponse(file_path, headers=headers)

@router.get('/projects/{project_slug}/results', response_class=HTMLResponse)
async def project_results_page(request: Request, project_slug: str) -> HTMLResponse:
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect

    user_id = int(request.session['user_id'])
    project = project_or_404(user_id, project_slug)
    tokens = project_service.load_tokens(user_id, project_slug)
    brand_id = (tokens.get('brand_id') or project.brand_id or '').strip()
    if not brand_id:
        raise HTTPException(status_code=400, detail='У проекта не указан brand_id.')
    active_job = generation_jobs.get_active_job_for_project(user_id=user_id, project_slug=project_slug)

    context = {
        'request': request,
        'project': project,
        'user_email': request.session.get('user_email') or '',
        'user_initial': ((request.session.get('user_name') or '?')[:1]).upper(),
        'palette_items': _palette_items_from_tokens(tokens),
        'icons': _scan_asset_group(brand_id, 'icons', ('.png', '.svg', '.jpg', '.jpeg')),
        'patterns': _scan_asset_group(brand_id, 'patterns', ('.png', '.svg', '.jpg', '.jpeg')),
        'illustrations': _scan_asset_group(brand_id, 'illustrations', ('.png', '.svg', '.jpg', '.jpeg')),
        'active_generation_job_id': (active_job or {}).get('id') if active_job else '',
    }
    return templates.TemplateResponse(request, 'pages/generation_results.html', context)


@router.get('/projects/{project_slug}/downloads/{kind}')
async def download_generated_assets(request: Request, project_slug: str, kind: str):
    user_id = require_auth(request)
    project = project_or_404(user_id, project_slug)
    tokens = project_service.load_tokens(user_id, project_slug)
    brand_id = (tokens.get('brand_id') or project.brand_id or '').strip()
    if not brand_id:
        raise HTTPException(status_code=400, detail='У проекта не указан brand_id.')

    zip_path = _build_download_zip(user_id, project_slug, brand_id, kind)
    return FileResponse(zip_path, filename=zip_path.name, media_type='application/zip')
