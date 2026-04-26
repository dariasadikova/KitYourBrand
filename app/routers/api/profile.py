from fastapi import APIRouter


router = APIRouter(prefix='/api/profile', tags=['api-profile'])


@router.get('')
def profile_api_info() -> dict[str, str]:
    return {
        'scope': 'profile',
        'message': 'Profile API scaffold is ready for SPA migration.',
    }
