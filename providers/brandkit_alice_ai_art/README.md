# Alice AI ART provider

CLI-провайдер KitYourBrand для генерации изображений через Alice AI ART в Yandex Cloud AI Studio.

Использует OpenAI-compatible Images API:

- `base_url`: `https://ai.api.cloud.yandex.net/v1`
- модель по умолчанию: `aliceai-image-art-3.0/latest`
- model URI: `art://<YANDEX_CLOUD_FOLDER>/aliceai-image-art-3.0/latest`

Нужны переменные окружения:

```bash
YANDEX_CLOUD_API_KEY=...
YANDEX_CLOUD_FOLDER=...
```

Основное приложение передаёт эти значения из профиля пользователя в subprocess.
