from __future__ import annotations

import json
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


@router.post('/projects/create')
async def create_project(request: Request, name: str = Form('Новый проект')):
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect
    user_id = int(request.session['user_id'])
    project = project_service.create_project(user_id, name)
    return RedirectResponse(url=f'/projects/{project.slug}', status_code=status.HTTP_303_SEE_OTHER)


@router.get('/projects/{project_slug}', response_class=HTMLResponse)
async def project_editor_page(request: Request, project_slug: str) -> HTMLResponse:
    auth_redirect = redirect_auth(request)
    if auth_redirect:
        return auth_redirect
    user_id = int(request.session['user_id'])
    project = project_or_404(user_id, project_slug)
    tokens = project_service.load_tokens(user_id, project_slug)
    context = {
        'request': request,
        'project': project,
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
    project = project_or_404(user_id, project_slug)
    data = await request.json()
    brand_id = (data.get('brand_id') or project.brand_id or '').strip()
    if not brand_id:
        return JSONResponse({'ok': False, 'error': 'Укажите brand_id.'}, status_code=400)
    try:
        _, counts, export_path = generation_service.build_and_save_figma_manifest(user_id, project_slug, brand_id, str(request.base_url).rstrip('/'))
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'counts': counts, 'download': f'/projects/{project_slug}/exports/{export_path.name}'})


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
    generation_jobs.start_generation(
        job_id=job['id'],
        generation_service=generation_service,
        user_id=user_id,
        project_slug=project_slug,
        payload=data,
        base_host=str(request.base_url).rstrip('/'),
    )
    return JSONResponse({'ok': True, 'job_id': job['id']})


@router.get('/generation-jobs/{job_id}')
async def get_generation_job(request: Request, job_id: str) -> JSONResponse:
    user_id = require_auth(request)
    job = generation_jobs.get_job(job_id)
    if not job or int(job['user_id']) != user_id:
        raise HTTPException(status_code=404, detail='Задача не найдена.')
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
