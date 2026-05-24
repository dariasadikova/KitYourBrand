from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.demo_mode import DEMO_LIMITS_PAYLOAD, DEMO_MAX_REFERENCE_BYTES, DEMO_MAX_REFERENCES
from app.core.project_access import require_project_access
from app.db import auth_service, project_service
from app.services.project_service import ProjectRecord, REFERENCE_ASSET_KINDS

router = APIRouter(prefix='/api/projects', tags=['api-projects'])


class CreateProjectPayload(BaseModel):
    name: str = 'Новый проект'


class DeleteRefPayload(BaseModel):
    path: str = ''
    asset_type: str | None = None


def _refs_payload(refs: dict[str, list[str]], asset_type: str | None = None) -> dict:
    payload: dict = {'ok': True, 'references': refs, 'images': project_service.collect_reference_paths(refs)}
    if asset_type:
        payload['asset_type'] = asset_type
    return payload


def _require_user_id(request: Request) -> int:
    user_id = request.session.get('user_id')
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Требуется авторизация.')
    return int(user_id)


def _project_payload(project: ProjectRecord, *, is_demo: bool = False) -> dict:
    base = '/demo/projects' if is_demo else '/projects'
    return {
        'id': project.id,
        'slug': project.slug,
        'name': project.name,
        'brand_id': project.brand_id,
        'created_at': project.created_at,
        'updated_at': project.updated_at,
        'is_imported': project.is_imported,
        'results_url': f'/app{base}/{project.slug}/results',
        'editor_url': f'/app{base}/{project.slug}',
    }


def _editor_payload(request: Request, access, tokens: dict, refs: dict) -> dict:
    payload = {
        'ok': True,
        'project': _project_payload(access.project, is_demo=access.is_demo),
        'tokens': tokens,
        'refs': project_service.collect_reference_paths(tokens.get('references', {}) or {}),
        'references': refs,
        'is_new_project_flow': request.query_params.get('new') == '1',
    }
    if access.is_demo:
        payload['demo_mode'] = True
        payload['demo_limits'] = DEMO_LIMITS_PAYLOAD
    return payload


def _project_or_404(user_id: int, project_slug: str) -> ProjectRecord:
    project = project_service.get_project(user_id, project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail='Проект не найден.')
    return project


def _show_generation_history(user_id: int, projects: list[ProjectRecord]) -> bool:
    user_row = auth_service.get_user_by_id(user_id)
    had_projects = bool(int(user_row['had_projects'])) if user_row and 'had_projects' in user_row.keys() else False
    return had_projects or bool(projects)


@router.get('')
def list_projects(request: Request) -> JSONResponse:
    user_id = _require_user_id(request)
    projects = project_service.list_projects(user_id)

    return JSONResponse(
        {
            'ok': True,
            'projects': [_project_payload(project) for project in projects],
            'show_generation_history': _show_generation_history(user_id, projects),
        }
    )


@router.post('')
def create_project(request: Request, payload: CreateProjectPayload) -> JSONResponse:
    user_id = _require_user_id(request)
    project = project_service.create_project(user_id, payload.name)

    return JSONResponse(
        {
            'ok': True,
            'project': _project_payload(project),
            'redirect_url': f'/app/projects/{project.slug}?new=1',
        }
    )


@router.post('/import-bundle')
async def import_project_bundle(
    request: Request,
    file: UploadFile = File(...),
) -> JSONResponse:
    user_id = _require_user_id(request)
    filename = (file.filename or '').lower()
    if filename and not filename.endswith('.zip'):
        return JSONResponse({'ok': False, 'error': 'Ожидается ZIP-архив проекта.'}, status_code=400)

    content = await file.read()
    try:
        project, warnings = project_service.import_project_bundle(user_id, content)
    except ValueError as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)

    return JSONResponse(
        {
            'ok': True,
            'project': _project_payload(project),
            'warnings': warnings,
            'redirect_url': f'/app/projects/{project.slug}?new=1',
        }
    )


@router.post('/{project_slug}/delete')
def delete_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_user_id(request)
    if not project_service.delete_project(user_id, project_slug):
        raise HTTPException(status_code=404, detail='Проект не найден.')
    return JSONResponse({'ok': True})


@router.post('/{project_slug}/restore')
def restore_project(request: Request, project_slug: str) -> JSONResponse:
    user_id = _require_user_id(request)
    if not project_service.restore_project(user_id, project_slug):
        raise HTTPException(status_code=404, detail='Проект не найден или уже активен.')
    return JSONResponse({'ok': True})


@router.get('/{project_slug}/editor')
def get_project_editor(request: Request, project_slug: str) -> JSONResponse:
    access = require_project_access(request, project_slug)
    tokens = project_service.load_tokens(access.user_id, project_slug)
    refs = project_service.references_by_asset(tokens)
    return JSONResponse(_editor_payload(request, access, tokens, refs))


@router.post('/{project_slug}/editor/save')
async def save_project_editor(request: Request, project_slug: str) -> JSONResponse:
    access = require_project_access(request, project_slug)
    data = await request.json()
    try:
        saved = project_service.save_tokens(access.user_id, project_slug, data)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    response: dict = {'ok': True, 'tokens': saved}
    if access.is_demo:
        response['demo_mode'] = True
    return JSONResponse(response)


@router.post('/{project_slug}/editor/reset')
def reset_project_editor(request: Request, project_slug: str) -> JSONResponse:
    access = require_project_access(request, project_slug)
    try:
        tokens = project_service.reset_tokens(access.user_id, project_slug)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse({'ok': True, 'tokens': tokens})


@router.get('/{project_slug}/editor/refs')
def list_project_editor_refs(request: Request, project_slug: str) -> JSONResponse:
    access = require_project_access(request, project_slug)
    tokens = project_service.load_tokens(access.user_id, project_slug)
    refs = project_service.references_by_asset(tokens)
    return JSONResponse(_refs_payload(refs))


@router.post('/{project_slug}/editor/refs')
async def upload_project_editor_refs(
    request: Request,
    project_slug: str,
    files: list[UploadFile] = File(...),
    asset_type: str = Form('logos'),
) -> JSONResponse:
    access = require_project_access(request, project_slug)
    if asset_type not in REFERENCE_ASSET_KINDS:
        return JSONResponse({'ok': False, 'error': 'Некорректный тип ассета.'}, status_code=400)
    if not files:
        return JSONResponse({'ok': False, 'error': 'Файлы не переданы.'}, status_code=400)

    if access.is_demo:
        current_count = project_service.count_project_references(access.user_id, project_slug)
        if current_count >= DEMO_MAX_REFERENCES:
            return JSONResponse(
                {
                    'ok': False,
                    'error': 'В демо-режиме можно загрузить только 1 референс. Зарегистрируйтесь, чтобы загружать больше.',
                },
                status_code=400,
            )
        if len(files) > 1:
            return JSONResponse(
                {'ok': False, 'error': 'В демо-режиме можно загрузить только 1 референс за раз.'},
                status_code=400,
            )

    payload = []
    for file in files:
        content = await file.read()
        if access.is_demo and len(content) > DEMO_MAX_REFERENCE_BYTES:
            return JSONResponse(
                {'ok': False, 'error': 'В демо-режиме размер референса ограничен 2 МБ.'},
                status_code=400,
            )
        payload.append((file.filename or '', content))

    try:
        refs = project_service.upload_refs(access.user_id, project_slug, payload, asset_type=asset_type)
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse(_refs_payload(refs, asset_type=asset_type))


@router.post('/{project_slug}/editor/refs/delete')
def delete_project_editor_ref(request: Request, project_slug: str, payload: DeleteRefPayload) -> JSONResponse:
    access = require_project_access(request, project_slug)
    try:
        refs = project_service.delete_ref(
            access.user_id,
            project_slug,
            payload.path,
            asset_type=payload.asset_type,
        )
    except Exception as exc:
        return JSONResponse({'ok': False, 'error': str(exc)}, status_code=400)
    return JSONResponse(_refs_payload(refs, asset_type=payload.asset_type))
