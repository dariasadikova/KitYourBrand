export function FigmaPluginPage() {
  return (
    <section className="figma-plugin-page profile-page">
      <div className="profile-page__head">
        <h1>Figma-плагин KYBBY</h1>
        <p>Перенесите сгенерированный бренд-комплект из KYBBY в ваш файл Figma</p>
      </div>

      <article className="profile-card figma-plugin-hero">
        <p className="figma-plugin-hero__eyebrow">Интеграция</p>
        <h2>KYBBY BrandKit Importer</h2>
        <p className="figma-plugin-hero__text">
          Плагин создаёт в Figma страницу с логотипами, иконками, паттернами и иллюстрациями вашего бренда —
          в удобной структуре, готовой к дальнейшей работе дизайнером.
        </p>
        <ul className="figma-plugin-tags" aria-label="Что импортируется">
          <li>Логотипы</li>
          <li>Иконки</li>
          <li>Паттерны</li>
          <li>Иллюстрации</li>
        </ul>
      </article>

      <article className="profile-card">
        <h2>Установка в Figma</h2>
        <ol className="figma-plugin-steps">
          <li>Скачайте архив плагина KYBBY и распакуйте его на компьютер.</li>
          <li>Убедитесь, что в одной папке лежат три файла: <strong>manifest.json</strong>, <strong>code.js</strong>, <strong>ui.html</strong>.</li>
          <li>Откройте Figma → меню <strong>Плагины</strong> (Plugins).</li>
          <li>Выберите <strong>Development</strong> → <strong>Import plugin from manifest…</strong> (не «New plugin»).</li>
          <li>Укажите <strong>manifest.json</strong> из этой папки и подтвердите установку.</li>
          <li>Запустите <strong>KYBBY BrandKit Importer</strong> из списка плагинов.</li>
        </ol>
        <p className="figma-plugin-note">
          Если окно плагина белое и пустое — Figma не нашла <strong>ui.html</strong>. Скачайте архив заново и импортируйте manifest из папки со всеми файлами. При необходимости распакуйте в путь без кириллицы, например <code>C:\kybby-plugin</code>.
        </p>
        <div className="figma-plugin-actions">
          <a href="/figma-plugin/download" className="btn btn-primary">
            Скачать плагин{' '}
            <span className="btn__brand">KYBBY</span>
          </a>
        </div>
        <p className="figma-plugin-note">
          Плагин устанавливается в ваш аккаунт Figma и остаётся доступным для повторного использования. На хостинге в поле адреса KYBBY укажите <strong>https://kybby-app.amvera.io</strong> (без <code>/app</code>). Для локальной разработки — <strong>http://localhost:8000</strong> (не 127.0.0.1).
        </p>
      </article>

      <article className="profile-card">
        <h2>Как импортировать проект</h2>
        <ol className="figma-plugin-steps">
          <li>Создайте или откройте проект в KYBBY и дождитесь генерации бренд-комплекта.</li>
          <li>На странице <strong>Результаты</strong> нажмите «Экспорт бренд-комплекта».</li>
          <li>Скопируйте <strong>Brand ID</strong> и <strong>адрес KYBBY</strong> на той же странице.</li>
          <li>В плагине вставьте эти значения, выберите провайдера и нажмите Import.</li>
        </ol>
        <p className="figma-plugin-note">
          Brand ID у каждого проекта свой. Копировать данные для плагина удобнее на странице <strong>Результаты</strong> — там они собраны в одном месте.
        </p>
      </article>
    </section>
  )
}
