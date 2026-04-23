(() => {
  const root = document.querySelector('[data-results-page]');
  if (!root) return;

  const projectSlug = root.dataset.projectSlug || '';
  const brandId = (root.dataset.brandId || '').trim();
  const activeJobIdFromPage = (root.dataset.activeJobId || '').trim();
  const manifestPanel = document.getElementById('results-manifest-panel');
  const generateBtn = document.getElementById('results-figma-generate-btn');
  const statusNode = document.getElementById('results-figma-status');
  const downloadLink = document.getElementById('results-figma-download-link');
  const generationModal = document.getElementById('results-generation-modal');
  const generationClose = document.getElementById('results-generation-close');
  const generationCancelBtn = document.getElementById('results-generation-cancel-btn');
  const progressBar = document.getElementById('results-generation-progress-bar');
  const progressText = document.getElementById('results-generation-progress-text');
  const statusText = document.getElementById('results-generation-status-text');
  const generationLog = document.getElementById('results-generation-log');
  const providerPills = {
    recraft: document.getElementById('results-provider-status-recraft'),
    seedream: document.getElementById('results-provider-status-seedream'),
    flux: document.getElementById('results-provider-status-flux'),
  };

  if (!projectSlug || !generateBtn || !statusNode || !downloadLink) return;

  const initialLabel = generateBtn.textContent.trim();
  let activeGenerationJobId = '';
  let cancelRequested = false;

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
      if (manifestPanel) manifestPanel.open = true;
      setBusy(true, 'Manifest готов ✓');

      window.setTimeout(() => {
        setBusy(false, initialLabel);
      }, 1600);
    } catch (error) {
      setStatus(error?.message || 'Не удалось подготовить Figma manifest.', 'error');
      setBusy(false, initialLabel);
    }
  });

  function openGenerationModal() {
    if (!generationModal) return;
    generationModal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeGenerationModal() {
    if (!generationModal) return;
    generationModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  async function requestCancelGeneration() {
    if (!activeGenerationJobId || cancelRequested) return;
    cancelRequested = true;
    if (generationCancelBtn) {
      generationCancelBtn.disabled = true;
      generationCancelBtn.textContent = 'Прерываем...';
    }
    try {
      const response = await fetch(`/generation-jobs/${activeGenerationJobId}/cancel`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось прервать генерацию');
      }
      if (statusText) statusText.textContent = 'Прерывание генерации...';
    } catch (_) {
      cancelRequested = false;
      if (generationCancelBtn) {
        generationCancelBtn.disabled = false;
        generationCancelBtn.textContent = 'Прервать генерацию';
      }
    }
  }

  function setProviderStatus(name, status, text) {
    const el = providerPills[name];
    if (!el) return;
    const normalized = ['pending', 'running', 'success', 'error'].includes(status) ? status : 'pending';
    el.className = 'provider-pill';
    el.classList.add(`provider-pill--${normalized}`);
    el.textContent = text || (
      normalized === 'running' ? 'выполняется'
        : normalized === 'success' ? 'успех'
          : normalized === 'error' ? 'ошибка'
            : 'ожидание'
    );
  }

  function updateGenerationModal(job) {
    if (!job) return;
    activeGenerationJobId = String(job.id || activeGenerationJobId || '');
    const progress = Number(job.progress || 0);
    if (progressBar) progressBar.style.width = `${progress}%`;
    if (progressText) progressText.textContent = `${progress}%`;
    if (statusText) statusText.textContent = job.message || 'Выполняется';
    if (generationLog) generationLog.textContent = Array.isArray(job.logs) ? job.logs.join('\n') : '';
    const statuses = job.provider_statuses || job.providers || {};
    ['recraft', 'seedream', 'flux'].forEach((name) => setProviderStatus(name, statuses[name], ''));
    const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(job.status || ''));
    if (generationClose) generationClose.hidden = !terminal;
    if (generationCancelBtn) {
      generationCancelBtn.hidden = terminal;
      generationCancelBtn.disabled = cancelRequested;
      generationCancelBtn.textContent = cancelRequested ? 'Прерываем...' : 'Прервать генерацию';
    }
    if (terminal && statusText) {
      statusText.textContent = job.status === 'cancelled' ? 'Генерация прервана' : (job.message || 'Генерация завершена');
    }
  }

  async function pollJob(jobId) {
    activeGenerationJobId = String(jobId || '');
    cancelRequested = false;
    if (generationCancelBtn) {
      generationCancelBtn.hidden = false;
      generationCancelBtn.disabled = false;
      generationCancelBtn.textContent = 'Прервать генерацию';
    }
    openGenerationModal();
    while (true) {
      const response = await fetch(`/generation-jobs/${jobId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.job) break;
      const job = payload.job;
      updateGenerationModal(job);
      const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(job.status || ''));
      if (terminal) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  async function attachActiveGenerationWatcher() {
    if (!generationModal) return;
    if (activeJobIdFromPage) {
      await pollJob(activeJobIdFromPage);
      return;
    }
    try {
      const response = await fetch(`/projects/${projectSlug}/generation/active`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.job || !payload.job.id) return;
      const jobId = payload.job.id;
      await pollJob(jobId);
    } catch (_) {
      // silently ignore watcher errors on results page
    }
  }

  generationClose?.addEventListener('click', closeGenerationModal);
  generationCancelBtn?.addEventListener('click', requestCancelGeneration);
  attachActiveGenerationWatcher();
})();
