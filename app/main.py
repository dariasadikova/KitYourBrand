from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.settings import settings
from app.routers import pages


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
    )

    app.mount('/static', StaticFiles(directory='app/static'), name='static')

    app.include_router(pages.router)

    return app


app = create_app()
