from fastapi import APIRouter


router = APIRouter(prefix='/api/projects', tags=['api-projects'])


@router.get('')
def projects_api_info() -> dict[str, str]:
    return {
        'scope': 'projects',
        'message': 'Projects API scaffold is ready for SPA migration.',
    }
