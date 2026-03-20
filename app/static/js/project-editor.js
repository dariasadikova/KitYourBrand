
console.log("project-editor.js loaded (generation modal v3 provider status fix)");

function byId(id) { return document.getElementById(id); }
function parseJsonScript(id, fallback) {
  try {
    const el = byId(id);
    if (!el) return fallback;
    return JSON.parse(el.textContent || 'null') ?? fallback;
  } catch (error) {
    console.error('parseJsonScript failed for', id, error);
    return fallback;
  }
}
function deepGet(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj) ?? fallback;
}
function deepSet(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  keys.slice(0, -1).forEach((key) => {
    if (!current[key] || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  });
  current[keys[keys.length - 1]] = value;
}
function showToast(message, isError = false) {
  let toast = document.querySelector('.floating-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'floating-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('floating-toast--error', isError);
  toast.classList.add('floating-toast--show');
  clearTimeout(window.__kytbToastTimer);
  window.__kytbToastTimer = setTimeout(() => toast.classList.remove('floating-toast--show'), 3200);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
  const shell = document.querySelector('.project-shell');
  if (!shell) return;

  const projectSlug = shell.dataset.projectSlug;
  let tokens = parseJsonScript('project-tokens', {});
  let refs = parseJsonScript('project-refs', []);

  const fieldIds = ['name', 'style_id', 'brand_id', 'icon.strokeWidth', 'icon.corner', 'icon.fill'];
  fieldIds.forEach((id) => {
    const input = byId(id);
    if (input) input.value = deepGet(tokens, id, '');
  });

  ['primary', 'secondary', 'accent'].forEach((key) => {
    const color = deepGet(tokens, `palette.${key}`, '#000000');
    const input = byId(`palette.${key}`);
    const text = byId(`palette.${key}_text`);
    if (input) input.value = color;
    if (text) text.value = color;
    input?.addEventListener('input', () => { if (text) text.value = input.value.toUpperCase(); });
    text?.addEventListener('input', () => {
      const value = text.value.trim();
      if (/^#[0-9A-Fa-f]{6}$/.test(value) && input) input.value = value;
    });
  });

  function renderChips(path) {
    const holder = byId(path);
    if (!holder) return;
    holder.innerHTML = '';
    const values = deepGet(tokens, path, []);
    values.forEach((value, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.innerHTML = `<span>${escapeHtml(value)}</span><span class="chip__remove">×</span>`;
      chip.addEventListener('click', () => {
        const next = [...values];
        next.splice(index, 1);
        deepSet(tokens, path, next);
        renderChips(path);
      });
      holder.appendChild(chip);
    });
  }
  ['prompts.icons'].forEach(renderChips);

  document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.dataset.add;
      const input = byId('icons-input');
      if (!input || !path) return;
      const parts = input.value.split(',').map((item) => item.trim()).filter(Boolean);
      if (!parts.length) return;
      const current = deepGet(tokens, path, []);
      deepSet(tokens, path, [...current, ...parts]);
      input.value = '';
      renderChips(path);
    });
  });

  function buildPayload() {
    const clone = structuredClone(tokens);
    clone.name = byId('name')?.value.trim() || clone.name;
    clone.style_id = byId('style_id')?.value.trim() || '';
    clone.brand_id = byId('brand_id')?.value.trim() || clone.brand_id;
    clone.palette = clone.palette || {};
    ['primary', 'secondary', 'accent'].forEach((key) => {
      clone.palette[key] = byId(`palette.${key}_text`)?.value.trim() || byId(`palette.${key}`)?.value || clone.palette[key];
    });
    clone.icon = clone.icon || {};
    clone.icon.strokeWidth = Number(byId('icon.strokeWidth')?.value || clone.icon.strokeWidth || 0);
    clone.icon.corner = byId('icon.corner')?.value || clone.icon.corner;
    clone.icon.fill = byId('icon.fill')?.value || clone.icon.fill;
    clone.references = clone.references || {};
    clone.references.style_images = refs;
    return clone;
  }

  async function saveProject() {
    const payload = buildPayload();
    const response = await fetch(`/projects/${projectSlug}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка сохранения');
    tokens = data.tokens;
    refs = tokens.references?.style_images || [];
    renderRefs();
    renderChips('prompts.icons');
    return data;
  }

  byId('save')?.addEventListener('click', async () => {
    try {
      await saveProject();
      showToast('Проект сохранён');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  byId('reset')?.addEventListener('click', async () => {
    if (!window.confirm('Сбросить конфигурацию проекта к исходному состоянию?')) return;
    try {
      const response = await fetch(`/projects/${projectSlug}/reset`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка сброса');
      tokens = data.tokens;
      refs = tokens.references?.style_images || [];
      window.location.reload();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  function refUrl(relPath) {
    const filename = relPath.split('/').pop();
    return `/projects/${projectSlug}/refs/${filename}`;
  }
  function renderRefs() {
    const holder = byId('refs-list');
    if (!holder) return;
    holder.innerHTML = '';
    if (!refs.length) {
      const empty = document.createElement('div');
      empty.className = 'ref-empty';
      empty.textContent = 'Пока нет загруженных референсов';
      holder.appendChild(empty);
      return;
    }
    refs.forEach((relPath) => {
      const card = document.createElement('div');
      card.className = 'ref-card';
      card.innerHTML = `<img src="${refUrl(relPath)}" alt="ref"><button type="button" class="ref-remove">✕</button>`;
      card.querySelector('.ref-remove')?.addEventListener('click', async () => {
        try {
          const response = await fetch(`/projects/${projectSlug}/delete-ref`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: relPath }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка удаления');
          refs = data.images || [];
          tokens.references = tokens.references || {};
          tokens.references.style_images = refs;
          renderRefs();
        } catch (error) {
          showToast(error.message, true);
        }
      });
      holder.appendChild(card);
    });
  }
  renderRefs();

  byId('ref-files')?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    try {
      const response = await fetch(`/projects/${projectSlug}/upload-refs`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка загрузки');
      refs = data.images || [];
      tokens.references = tokens.references || {};
      tokens.references.style_images = refs;
      renderRefs();
      showToast('Референсы загружены');
    } catch (error) {
      showToast(error.message, true);
    } finally {
      event.target.value = '';
    }
  });

  byId('gen-figma')?.addEventListener('click', async () => {
    try {
      await saveProject();
      const response = await fetch(`/projects/${projectSlug}/generate-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: byId('brand_id')?.value.trim() || '' }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка генерации manifest');
      const link = byId('figma-link');
      if (link) {
        link.hidden = false;
        link.href = data.download;
      }
      showToast('Figma manifest готов');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  const generationModal = byId('generation-modal');
  const generationLog = byId('generation-log');
  const generationStatusText = byId('generation-status-text');
  const generationProgressText = byId('generation-progress-text');
  const generationProgressBar = byId('generation-progress-bar');
  const generationResultLink = byId('generation-result-link');
  const generateBtn = byId('btn-generate');
  const providerPills = {
    recraft: byId('provider-status-recraft'),
    seedream: byId('provider-status-seedream'),
    flux: byId('provider-status-flux'),
  };

  let generationLogLines = [];

  function setTopStatus(label, tone = 'neutral') {
    if (!generationStatusText) return;
    generationStatusText.textContent = label;
    generationStatusText.style.color = tone === 'error' ? '#dc2626' : tone === 'success' ? '#16a34a' : tone === 'warning' ? '#d97706' : '#64748b';
    generationStatusText.style.fontWeight = '700';
  }

  function setProviderStatus(name, status, text) {
    const el = providerPills[name];
    if (!el) return;
    const normalized = ['running','success','error','pending'].includes(status)
      ? status
      : (status === 'done' || status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'pending');
    el.textContent = text || ({pending: 'ожидание', running: 'выполняется', success: 'успех', error: 'ошибка'})[normalized] || 'ожидание';
    el.className = 'provider-pill';
    el.classList.add(`provider-pill--${normalized}`);
  }

  function setResultLinkEnabled(enabled, href = '#') {
    if (!generationResultLink) return;
    if (!enabled) {
      generationResultLink.hidden = false;
      generationResultLink.href = '#';
      generationResultLink.setAttribute('aria-disabled', 'true');
      generationResultLink.style.pointerEvents = 'none';
      generationResultLink.style.opacity = '0.55';
      generationResultLink.style.cursor = 'default';
      return;
    }
    generationResultLink.hidden = false;
    generationResultLink.href = href || '#';
    generationResultLink.removeAttribute('aria-disabled');
    generationResultLink.style.pointerEvents = 'auto';
    generationResultLink.style.opacity = '1';
    generationResultLink.style.cursor = 'pointer';
  }

  function formatLogLine(line) {
    const text = String(line || '');
    const escaped = escapeHtml(text);
    const lower = text.toLowerCase();
    let color = '#e2e8f0';
    if (lower.includes('успешно') || lower.includes('завершено успешно') || lower.includes('получен новый style_id')) color = '#22c55e';
    if (lower.includes('с ошибкой') || lower.startsWith('ошибка') || lower.includes('error:') || lower.includes('traceback')) color = '#ef4444';
    if (lower.includes('запуск провайдера') || lower.includes('подготовка') || lower.includes('сборка') || lower.includes('постобработка')) color = '#cbd5e1';
    return `<div class="generation-log__line" style="color:${color}">${escaped}</div>`;
  }

  function renderGenerationLog(lines) {
    if (!generationLog) return;
    generationLog.innerHTML = lines.map(formatLogLine).join('');
    generationLog.scrollTop = generationLog.scrollHeight;
  }

  function resetGenerationModal() {
    generationLogLines = [];
    renderGenerationLog([]);
    if (generationProgressText) generationProgressText.textContent = '0%';
    if (generationProgressBar) generationProgressBar.style.width = '0%';
    setTopStatus('Ожидание');
    setProviderStatus('recraft', 'pending', 'ожидание');
    setProviderStatus('seedream', 'pending', 'ожидание');
    setProviderStatus('flux', 'pending', 'ожидание');
    setResultLinkEnabled(false);
  }

  function openGenerationModal() {
    if (!generationModal) return;
    resetGenerationModal();
    generationModal.hidden = false;
    document.body.classList.add('modal-open');
  }
  function closeGenerationModal() {
    if (!generationModal) return;
    generationModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  document.querySelectorAll('[data-close-generation]').forEach((el) => el.addEventListener('click', closeGenerationModal));
  byId('generation-modal-close-btn')?.addEventListener('click', closeGenerationModal);


  function inferProviderStatuses(job) {
    const base = {
      recraft: { status: 'pending', text: 'ожидание' },
      seedream: { status: 'pending', text: 'ожидание' },
      flux: { status: 'pending', text: 'ожидание' },
    };

    const providers = job.providers || {};
    Object.entries(providers).forEach(([name, info]) => {
      if (!base[name]) return;
      const rawStatus = String(info?.status || '').toLowerCase();
      let normalized = 'pending';
      if (['running', 'in_progress'].includes(rawStatus)) normalized = 'running';
      else if (['success', 'done', 'completed', 'ok'].includes(rawStatus)) normalized = 'success';
      else if (['error', 'failed', 'fail'].includes(rawStatus)) normalized = 'error';
      base[name] = {
        status: normalized,
        text: info?.text || ({ pending: 'ожидание', running: 'выполняется', success: 'успех', error: 'ошибка' })[normalized],
      };
    });

    const logs = Array.isArray(job.logs) ? job.logs : [];
    const patterns = {
      recraft: /recraft/i,
      seedream: /seedream/i,
      flux: /flux/i,
    };

    for (const line of logs) {
      const lower = String(line || '').toLowerCase();
      for (const [name, rx] of Object.entries(patterns)) {
        if (!rx.test(lower)) continue;
        if (lower.includes('запуск провайдера')) {
          base[name] = { status: 'running', text: 'выполняется' };
        }
        if (lower.includes('завершён успешно') || lower.includes('завершено успешно')) {
          base[name] = { status: 'success', text: 'успех' };
        }
        if (lower.includes('завершён с ошибкой') || lower.includes('ошибка')) {
          base[name] = { status: 'error', text: 'ошибка' };
        }
      }
    }

    return base;
  }

  function updateGenerationUi(job) {
    const progress = Number(job.progress || 0);
    if (generationProgressBar) generationProgressBar.style.width = `${progress}%`;
    if (generationProgressText) generationProgressText.textContent = `${progress}%`;

    const providers = inferProviderStatuses(job);
    ['recraft', 'seedream', 'flux'].forEach((name) => {
      const info = providers[name] || { status: 'pending', text: 'ожидание' };
      setProviderStatus(name, info.status, info.text);
    });

    generationLogLines = Array.isArray(job.logs) ? job.logs : [];
    renderGenerationLog(generationLogLines);

    const finalState = job.status;
    if (finalState === 'failed') {
      setTopStatus('Ошибка генерации', 'error');
      setResultLinkEnabled(false);
    } else if (finalState === 'completed_with_errors') {
      setTopStatus('Завершено с ошибками', 'warning');
      setResultLinkEnabled(Boolean(job.result_url), job.result_url || '#');
    } else if (finalState === 'completed') {
      setTopStatus('Завершено', 'success');
      setResultLinkEnabled(Boolean(job.result_url), job.result_url || '#');
    } else {
      setTopStatus(job.status_text || 'Выполняется');
      setResultLinkEnabled(false);
    }
  }

  async function pollGenerationJob(jobId, statusEl) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const response = await fetch(`/generation-jobs/${jobId}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Не удалось получить статус задачи');
      }
      const job = payload.job;
      updateGenerationUi(job);
      const state = job.status;
      if (statusEl) {
        statusEl.textContent = state === 'completed'
          ? 'Бренд-комплект успешно сгенерирован ✅'
          : state === 'completed_with_errors'
            ? 'Генерация завершена с ошибками'
            : state === 'failed'
              ? 'Ошибка генерации'
              : 'Идёт генерация...';
      }
      if (state === 'completed' || state === 'completed_with_errors' || state === 'failed') {
        return job;
      }
      await sleep(1000);
    }
    throw new Error('Превышено время ожидания статуса генерации');
  }

  generateBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    const status = byId('generate-status');
    try {
      openGenerationModal();
      setTopStatus('Автосохранение проекта');
      generationLogLines = ['Инициализация генерации...'];
      renderGenerationLog(generationLogLines);

      await saveProject();
      generationLogLines = ['Инициализация генерации...', 'tokens.json сохранён и подготовлен для генерации'];
      renderGenerationLog(generationLogLines);
      if (status) status.textContent = 'Идёт генерация...';

      const payload = {
        style_id: byId('style_id')?.value.trim() || '',
        brand_id: byId('brand_id')?.value.trim() || '',
        icons_count: Number(byId('gen.icons_count')?.value || 0),
        patterns_count: Number(byId('gen.patterns_count')?.value || 0),
        illustrations_count: Number(byId('gen.illustrations_count')?.value || 0),
        build_style: !!byId('build_style')?.checked,
      };

      const response = await fetch(`/projects/${projectSlug}/generate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Ошибка запуска генерации');
      if (!data.job_id) throw new Error('Сервер не вернул job_id');

      generationLogLines.push(`Задача создана: ${data.job_id}`);
      renderGenerationLog(generationLogLines);
      const job = await pollGenerationJob(data.job_id, status);
      if (job.style_id && byId('style_id')) byId('style_id').value = job.style_id;
      showToast(job.status === 'completed' ? 'Генерация завершена' : job.status === 'failed' ? 'Ошибка генерации' : 'Генерация завершена с замечаниями', job.status === 'failed');
    } catch (error) {
      setTopStatus('Ошибка генерации', 'error');
      generationLogLines.push(`Ошибка: ${error.message}`);
      renderGenerationLog(generationLogLines);
      setProviderStatus('recraft', 'pending', byId('provider-status-recraft')?.textContent || 'ожидание');
      setProviderStatus('seedream', 'pending', byId('provider-status-seedream')?.textContent || 'ожидание');
      setProviderStatus('flux', 'pending', byId('provider-status-flux')?.textContent || 'ожидание');
      setResultLinkEnabled(false);
      if (status) status.textContent = 'Ошибка генерации';
      showToast(error.message, true);
      console.error('generation failed', error);
    }
  });
});
