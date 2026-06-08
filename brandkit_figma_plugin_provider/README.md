# KYBBY Figma Plugin (BrandKit Importer)

Плагин импортирует ассеты, сгенерированные в веб-приложении **KYBBY** (KitYourBrand), в файл Figma.

## Связка с веб-приложением

1. В KYBBY: сгенерируйте бренд-комплект → страница **Результаты** → **Экспорт бренд-комплекта**.
2. Скопируйте **Brand ID** и **Base URL** с той же страницы.
3. В Figma: **Plugins** → **Development** → **Import plugin from manifest…** → выберите `manifest.json` из распакованного архива.
4. Запустите плагин, вставьте Brand ID и адрес KYBBY (`http://localhost:8000` локально), нажмите **Import**.

## Поля плагина

- **Brand ID** — идентификатор набора ассетов (`/assets/<brand_id>/...`)
- **Provider** — `All` (по умолчанию), `Recraft`, `Seedream`, `Flux`, `Nano Banana`, `GPT-5 Image`, `Alice AI ART`
- **Base URL** — корень сервера KYBBY, например `http://localhost:8000` (без суффикса `/app`)

## Manifest (HTTP)

В зависимости от провайдера плагин запрашивает:

- `.../assets/<brand_id>/figma_plugin_manifest.json` (All)
- `.../assets/<brand_id>/figma_plugin_manifest_<provider>.json` — recraft, seedream, flux, nano_banana, gpt5_image, alice_ai_art

Сервер должен отдавать CORS для `/assets/*` (в KYBBY уже настроено).

**Локальная разработка:** в `manifest.json` для dev-режима Figma разрешён только `http://localhost:8000` (не `127.0.0.1` — Figma не принимает IP в manifest). После изменения manifest переимпортируйте плагин. Убедитесь, что uvicorn запущен на порту 8000.

## Что создаётся в Figma

- Страница **BrandKit** (или текущая, если создать страницу нельзя)
- Корневой фрейм **BrandKit / &lt;brand_id&gt; / &lt;provider&gt;**
- Секции: Docs, Icons, Patterns, Illustrations

## Dev setup

1. Запустите KYBBY: `uvicorn` на порту **8000** (или укажите свой порт в Base URL).
2. В Figma: **Plugins → Development → Import plugin from manifest…**
3. Выберите `manifest.json` из `brandkit_figma_plugin_provider/`.
4. Импортируйте проект по Brand ID со страницы результатов.
