# KYBBY Figma Plugin (BrandKit Importer)

Плагин импортирует ассеты, сгенерированные в веб-приложении **KYBBY** (KitYourBrand), в файл Figma.

## Связка с веб-приложением

1. В KYBBY: сгенерируйте бренд-комплект → страница **Результаты** → **Экспорт бренд-комплекта**.
2. Скопируйте **Brand ID** и **Base URL** с той же страницы.
3. В Figma: **Plugins → Development → Import plugin from manifest…** → выберите `manifest.json` из этой папки.
4. Запустите плагин, вставьте Brand ID и Base URL, нажмите **Import**.

## Поля плагина

- **Brand ID** — идентификатор набора ассетов (`/assets/<brand_id>/...`)
- **Provider** — `All` (по умолчанию), `Recraft`, `Seedream` или `Flux`
- **Base URL** — корень сервера KYBBY, например `http://localhost:8000` (без суффикса `/app`)

## Manifest (HTTP)

В зависимости от провайдера плагин запрашивает:

- `.../assets/<brand_id>/figma_plugin_manifest.json` (All)
- `.../assets/<brand_id>/figma_plugin_manifest_recraft.json`
- `.../assets/<brand_id>/figma_plugin_manifest_seedream.json`
- `.../assets/<brand_id>/figma_plugin_manifest_flux.json`

Сервер должен отдавать CORS для `/assets/*` (в KYBBY уже настроено).

## Что создаётся в Figma

- Страница **BrandKit** (или текущая, если создать страницу нельзя)
- Корневой фрейм **BrandKit / &lt;brand_id&gt; / &lt;provider&gt;**
- Секции: Docs, Icons, Patterns, Illustrations

## Dev setup

1. Запустите KYBBY: `uvicorn` на порту **8000** (или укажите свой порт в Base URL).
2. В Figma: **Plugins → Development → Import plugin from manifest…**
3. Выберите `manifest.json` из `brandkit_figma_plugin_provider/`.
4. Импортируйте проект по Brand ID со страницы результатов.
