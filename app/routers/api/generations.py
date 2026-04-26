from fastapi import APIRouter


router = APIRouter(prefix='/api/generations', tags=['api-generations'])


@router.get('')
def generations_api_info() -> dict[str, str]:
    return {
        'scope': 'generations',
        'message': 'Generations API scaffold is ready for SPA migration.',
    }
