(() => {
  const root = document.querySelector('[data-results-page]');
  if (!root) return;

  const projectSlug = root.dataset.projectSlug || '';
  const brandId = (root.dataset.brandId || '').trim();
  const generateBtn = document.getElementById('results-figma-generate-btn');
  const statusNode = document.getElementById('results-figma-status');
  const downloadLink = document.getElementById('results-figma-download-link');

  if (!projectSlug || !generateBtn || !statusNode || !downloadLink) return;

  const initialLabel = generateBtn.textContent.trim();

  function setStatus(message, tone = '') {
    statusNode.textContent = message || '';
    statusNode.classList.remove(
      'results-export__status--loading',
      'results-export__status--success',
      'results-export__status--error'
    );
    if (tone) {
      statusNode.classList.add(`results-export__status--${tone}`);
    }
  }

  function setBusy(isBusy, label) {
    generateBtn.disabled = isBusy;
    generateBtn.classList.toggle('is-loading', isBusy);
    generateBtn.textContent = label || initialLabel;
  }

  function setDownloadLink(url) {
    if (!url) {
      downloadLink.hidden = true;
      downloadLink.removeAttribute('href');
      return;
    }
    downloadLink.hidden = false;
    downloadLink.href = url;
  }

  generateBtn.addEventListener('click', async () => {
    try {
      setDownloadLink('');
      setBusy(true, 'Генерируем Figma JSON…');
      setStatus('Подготовка manifest…', 'loading');

      const response = await fetch(`/projects/${projectSlug}/generate-figma`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(brandId ? { brand_id: brandId } : {}),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Не удалось подготовить Figma manifest.');
      }

      setDownloadLink(data.download_url || data.manifest_url || '');
      setStatus('Manifest готов. Теперь его можно скачать и использовать в Figma plugin.', 'success');
      setBusy(true, 'Manifest готов ✓');

      window.setTimeout(() => {
        setBusy(false, initialLabel);
      }, 1600);
    } catch (error) {
      setStatus(error?.message || 'Не удалось подготовить Figma manifest.', 'error');
      setBusy(false, initialLabel);
    }
  });
})();
