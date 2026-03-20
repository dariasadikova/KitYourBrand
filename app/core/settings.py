from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = 'KitYourBrand'
    debug: bool = True
    app_host: str = '127.0.0.1'
    app_port: int = 8000
    secret_key: str = 'change-me'

    project_root: Path = BASE_DIR
    providers_dir: Path = BASE_DIR / 'providers'
    output_dir: Path = BASE_DIR / 'out'
    recraft_dir: Path = BASE_DIR / 'providers' / 'brandkit_recraft'
    seedream_dir: Path = BASE_DIR / 'providers' / 'brandkit_seedream'
    flux_dir: Path = BASE_DIR / 'providers' / 'brandkit_flux2'
    figma_plugin_dir: Path = BASE_DIR.parent / 'brandkit_figma_plugin_provider'
    legacy_flask_dir: Path = BASE_DIR.parent / 'brandkit_tokens_ui_three_providers'
    data_dir: Path = BASE_DIR / 'data'

    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')


settings = Settings()
