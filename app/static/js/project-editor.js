function byId(id) { return document.getElementById(id); }
function parseJsonScript(id, fallback) {
  try {
    const el = byId(id);
    if (!el) return fallback;
    return JSON.parse(el.textContent || 'null') ?? fallback;
  } catch (_) {
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

function clampAssetCount(value, fallback = 1) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return fallback;
  return Math.max(1, Math.min(20, num));
}

function showToast(message, isError = false) {
  const root = byId('toast-root');
  if (!root) return;
  const item = document.createElement('div');
  item.className = `toast ${isError ? 'toast--error' : ''}`;
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => {
    item.classList.add('toast--hide');
    setTimeout(() => item.remove(), 250);
  }, 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  const tokens = parseJsonScript('tokens-data', {});
  const projectSlug = byId('project-slug')?.textContent?.trim() || '';
  const refList = byId('refs-list');
  const statusLabel = byId('generate-status');

  const PROVIDER_NAMES = ['recraft', 'seedream', 'flux'];

  function syncCountInput(id, fallback) {
    const input = byId(id);
    if (!input) return fallback;
    const normalized = clampAssetCount(input.value, fallback);
    input.value = String(normalized);
    return normalized;
  }

  function getRequestedCounts() {
    return {
      icons: syncCountInput('gen.icons_count', 8),
      patterns: syncCountInput('gen.patterns_count', 4),
      illustrations: syncCountInput('gen.illustrations_count', 4),
    };
  }

  function updateGenerationSummary() {
    const providerCount = PROVIDER_NAMES.length;
    const counts = getRequestedCounts();
    const totals = {
      icons: counts.icons * providerCount,
      patterns: counts.patterns * providerCount,
      illustrations: counts.illustrations * providerCount,
    };

    const iconsLabel = byId('summary-icons');
    const patternsLabel = byId('summary-patterns');
    const illustrationsLabel = byId('summary-illustrations');

    if (iconsLabel) iconsLabel.textContent = String(totals.icons);
    if (patternsLabel) patternsLabel.textContent = String(totals.patterns);
    if (illustrationsLabel) illustrationsLabel.textContent = String(totals.illustrations);
  }

  const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'tertiary', 'neutral', 'extra'];
  const MIN_ACTIVE_PALETTE = 2;
  const MAX_ACTIVE_PALETTE = 6;
  const DEFAULT_PALETTE = {
    primary: '#E5A50A',
    secondary: '#C64600',
    accent: '#613583',
    tertiary: '#5E81AC',
    neutral: '#D8DEE9',
    extra: '#2E3440',
  };

  function getStoredPaletteSlots(sourceTokens) {
    const rawSlots = sourceTokens.palette_slots && typeof sourceTokens.palette_slots === 'object'
      ? sourceTokens.palette_slots
      : (sourceTokens.palette && typeof sourceTokens.palette === 'object' ? sourceTokens.palette : {});
    const slots = {};
    PALETTE_KEYS.forEach((key) => {
      slots[key] = rawSlots[key] || DEFAULT_PALETTE[key];
    });
    return slots;
  }

  function getActivePaletteKeysFromTokens(sourceTokens) {
    const raw = sourceTokens.generation?.active_palette_keys;
    const normalized = Array.isArray(raw) ? raw.filter((key) => PALETTE_KEYS.includes(key)) : [];
    return normalized.length >= MIN_ACTIVE_PALETTE ? normalized.slice(0, MAX_ACTIVE_PALETTE) : ['primary', 'secondary', 'accent'];
  }

  function updatePaletteControlsState() {
    const activeKeys = PALETTE_KEYS.filter((key) => byId(`palette.${key}_enabled`)?.checked);
    PALETTE_KEYS.forEach((key) => {
      const enabled = byId(`palette.${key}_enabled`)?.checked;
      byId(`palette.${key}`)?.toggleAttribute('disabled', !enabled);
      byId(`palette.${key}_text`)?.toggleAttribute('disabled', !enabled);
      byId(`palette.${key}`)?.closest('.palette-item')?.classList.toggle('palette-item--disabled', !enabled);
    });
    const hint = byId('palette-validation');
    if (hint) {
      hint.hidden = activeKeys.length >= MIN_ACTIVE_PALETTE;
    }
    return activeKeys;
  }

  function enforcePaletteMinimum(changedKey) {
    const activeKeys = PALETTE_KEYS.filter((key) => byId(`palette.${key}_enabled`)?.checked);
    if (activeKeys.length >= MIN_ACTIVE_PALETTE) return activeKeys;
    const checkbox = byId(`palette.${changedKey}_enabled`);
    if (checkbox) checkbox.checked = true;
    showToast('Нужно оставить минимум 2 цвета палитры', true);
    return PALETTE_KEYS.filter((key) => byId(`palette.${key}_enabled`)?.checked);
  }

  function hydrateForm() {
    byId('name') && (byId('name').value = deepGet(tokens, 'name', ''));
    byId('brand_id') && (byId('brand_id').value = deepGet(tokens, 'brand_id', ''));
    byId('style_id') && (byId('style_id').value = deepGet(tokens, 'style_id', ''));
    byId('icon.style') && (byId('icon.style').value = deepGet(tokens, 'icon.style', ''));
    byId('icon.background') && (byId('icon.background').value = deepGet(tokens, 'icon.background', ''));
    byId('icon.stroke') && (byId('icon.stroke').value = deepGet(tokens, 'icon.stroke', ''));
    byId('icon.corner_radius') && (byId('icon.corner_radius').value = deepGet(tokens, 'icon.corner_radius', ''));
    byId('texture.enabled') && (byId('texture.enabled').checked = !!deepGet(tokens, 'texture.enabled', false));
    byId('texture.mode') && (byId('texture.mode').value = deepGet(tokens, 'texture.mode', ''));
    byId('texture.scale') && (byId('texture.scale').value = deepGet(tokens, 'texture.scale', ''));
    byId('illustration.style') && (byId('illustration.style').value = deepGet(tokens, 'illustration.style', ''));
    byId('illustration.background') && (byId('illustration.background').value = deepGet(tokens, 'illustration.background', ''));
    byId('prompts.icons') && (byId('prompts.icons').value = deepGet(tokens, 'prompts.icons', ''));
    byId('prompts.patterns') && (byId('prompts.patterns').value = deepGet(tokens, 'prompts.patterns', ''));
    byId('prompts.illustrations') && (byId('prompts.illustrations').value = deepGet(tokens, 'prompts.illustrations', ''));

    const paletteSlots = getStoredPaletteSlots(tokens);
    const activePaletteKeys = getActivePaletteKeysFromTokens(tokens);

    PALETTE_KEYS.forEach((key) => {
      const color = paletteSlots[key] || DEFAULT_PALETTE[key];
      const input = byId(`palette.${key}`);
      const text = byId(`palette.${key}_text`);
      const checkbox = byId(`palette.${key}_enabled`);
      if (input) input.value = color;
      if (text) text.value = color.toUpperCase();
      if (checkbox) checkbox.checked = activePaletteKeys.includes(key);

      input?.addEventListener('input', () => {
        if (text) text.value = input.value.toUpperCase();
      });
      text?.addEventListener('input', () => {
        const normalized = text.value.trim().toUpperCase();
        if (/^#[0-9A-F]{6}$/.test(normalized) && input) input.value = normalized;
      });
      checkbox?.addEventListener('change', () => {
        enforcePaletteMinimum(key);
        updatePaletteControlsState();
      });
    });
    updatePaletteControlsState();

    const gen = tokens.generation || {};
    if (byId('gen.icons_count')) byId('gen.icons_count').value = gen.icons_count ?? 8;
    if (byId('gen.patterns_count')) byId('gen.patterns_count').value = gen.patterns_count ?? 4;
    if (byId('gen.illustrations_count')) byId('gen.illustrations_count').value = gen.illustrations_count ?? 4;
    if (byId('build_style')) byId('build_style').checked = !!gen.build_style;

    updateGenerationSummary();
  }

  function buildPayload() {
    const clone = structuredClone(tokens);

    clone.name = byId('name')?.value.trim() || clone.name;
    clone.style_id = byId('style_id')?.value.trim() || '';
    clone.brand_id = byId('brand_id')?.value.trim() || clone.brand_id;
    clone.palette = clone.palette || {};
    clone.palette_slots = clone.palette_slots || {};
    clone.generation = clone.generation || {};
    clone.icon = clone.icon || {};
    clone.texture = clone.texture || {};
    clone.illustration = clone.illustration || {};
    clone.prompts = clone.prompts || {};
    clone.references = clone.references || {};
    clone.references.style_images = clone.references.style_images || [];

    const selectedPaletteKeys = updatePaletteControlsState();
    if (selectedPaletteKeys.length < MIN_ACTIVE_PALETTE) {
      throw new Error('Выберите минимум 2 цвета палитры для генерации.');
    }

    PALETTE_KEYS.forEach((key) => {
      const nextColor = byId(`palette.${key}_text`)?.value.trim().toUpperCase()
        || byId(`palette.${key}`)?.value
        || clone.palette_slots[key]
        || DEFAULT_PALETTE[key];
      clone.palette_slots[key] = nextColor;
    });

    clone.generation.active_palette_keys = selectedPaletteKeys;
    clone.palette = {};
    selectedPaletteKeys.forEach((key) => {
      clone.palette[key] = clone.palette_slots[key];
    });

    clone.icon.style = byId('icon.style')?.value || '';
    clone.icon.background = byId('icon.background')?.value || '';
    clone.icon.stroke = byId('icon.stroke')?.value || '';
    clone.icon.corner_radius = byId('icon.corner_radius')?.value || '';
    clone.texture.enabled = !!byId('texture.enabled')?.checked;
    clone.texture.mode = byId('texture.mode')?.value || '';
    clone.texture.scale = byId('texture.scale')?.value || '';
    clone.illustration.style = byId('illustration.style')?.value || '';
    clone.illustration.background = byId('illustration.background')?.value || '';

    clone.prompts.icons = byId('prompts.icons')?.value || '';
    clone.prompts.patterns = byId('prompts.patterns')?.value || '';
    clone.prompts.illustrations = byId('prompts.illustrations')?.value || '';

    clone.generation.icons_count = syncCountInput('gen.icons_count', 8);
    clone.generation.patterns_count = syncCountInput('gen.patterns_count', 4);
    clone.generation.illustrations_count = syncCountInput('gen.illustrations_count', 4);
    clone.generation.build_style = !!byId('build_style')?.checked;

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
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Не удалось сохранить проект');
    }
    Object.assign(tokens, payload);
    return data;
  }

  async function refreshRefs() {
    if (!refList) return;
    refList.innerHTML = '<div class="refs-empty">Загрузка...</div>';

    const response = await fetch(`/projects/${projectSlug}/list-refs`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      refList.innerHTML = '<div class="refs-empty">Не удалось загрузить референсы</div>';
      return;
    }

    const refs = data.refs || [];
    if (!refs.length) {
      refList.innerHTML = '<div class="refs-empty">Референсы пока не загружены</div>';
      return;
    }

    refList.innerHTML = refs.map((ref) => `
      <div class="ref-item">
        <a href="${ref.url}" target="_blank" rel="noopener">${ref.name}</a>
        <button type="button" class="ref-delete" data-ref-name="${ref.name}">Удалить</button>
      </div>
    `).join('');

    refList.querySelectorAll('.ref-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.getAttribute('data-ref-name');
        if (!name) return;
        try {
          const response = await fetch(`/projects/${projectSlug}/delete-ref`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось удалить референс');
          showToast('Референс удалён');
          await refreshRefs();
        } catch (error) {
          showToast(error.message, true);
        }
      });
    });
  }

  hydrateForm();
  refreshRefs();

  const generationModal = byId('generation-modal');
  const generationLog = byId('generation-log');
  const generationStatusText = byId('generation-status-text');
  const generationProgressText = byId('generation-progress-text');
  const generationProgressBar = byId('generation-progress-bar');
  const generationResultLink = byId('generation-result-link');
  const generationCancelBtn = byId('generation-cancel-btn');
  const generateBtn = byId('btn-generate');

  document
   .querySelectorAll('[data-close-generation]')
   .forEach((el) => el.addEventListener('click', closeGenerationModal));

  byId('generation-modal-close-btn')?.addEventListener('click', closeGenerationModal);

  generationCancelBtn?.addEventListener('click', closeGenerationModal);

  const providerPills = {
    recraft: byId('provider-status-recraft'),
    seedream: byId('provider-status-seedream'),
    flux: byId('provider-status-flux'),
  };

  let generationLogLines = [];

  function setTopStatus(label, tone = 'neutral') {
    if (!generationStatusText) return;
    generationStatusText.textContent = label;
    generationStatusText.style.color =
      tone === 'error' ? '#dc2626'
      : tone === 'success' ? '#16a34a'
      : tone === 'warning' ? '#d97706'
      : '#64748b';
    generationStatusText.style.fontWeight = '700';
  }

  function setProviderStatus(name, status, text) {
    const el = providerPills[name];
    if (!el) return;

    const normalized = ['running', 'success', 'error', 'pending'].includes(status)
      ? status
      : (status === 'done' || status === 'completed'
          ? 'success'
          : status === 'failed'
            ? 'error'
            : 'pending');

    el.textContent =
      text ||
      ({
        pending: 'ожидание',
        running: 'выполняется',
        success: 'успех',
        error: 'ошибка',
      })[normalized] ||
      'ожидание';

    el.className = 'provider-pill';
    el.classList.add(`provider-pill--${normalized}`);
  }

  function setResultLinkEnabled(enabled, href = '#') {
    console.log('[result-link] setResultLinkEnabled called', { enabled, href });

    if (!generationResultLink) {
      console.warn('[result-link] generationResultLink not found');
      return;
    }

    console.log('[result-link] BEFORE', {
      hidden: generationResultLink.hidden,
      hrefCurrent: generationResultLink.getAttribute('href'),
      ariaDisabled: generationResultLink.getAttribute('aria-disabled'),
      pointerEvents: generationResultLink.style.pointerEvents,
      opacity: generationResultLink.style.opacity,
      className: generationResultLink.className,
      text: generationResultLink.textContent,
    });

    generationResultLink.hidden = false;

    if (!enabled) {
      generationResultLink.href = '#';
      generationResultLink.setAttribute('aria-disabled', 'true');
      generationResultLink.style.pointerEvents = 'none';
      generationResultLink.style.opacity = '0.55';
      generationResultLink.style.cursor = 'default';

      console.log('[result-link] AFTER DISABLE', {
        hidden: generationResultLink.hidden,
        hrefCurrent: generationResultLink.getAttribute('href'),
        ariaDisabled: generationResultLink.getAttribute('aria-disabled'),
        pointerEvents: generationResultLink.style.pointerEvents,
        opacity: generationResultLink.style.opacity,
      });
      return;
    }

    generationResultLink.href = href || '#';
    generationResultLink.removeAttribute('aria-disabled');
    generationResultLink.style.pointerEvents = 'auto';
    generationResultLink.style.opacity = '1';
    generationResultLink.style.cursor = 'pointer';

    console.log('[result-link] AFTER ENABLE', {
      hidden: generationResultLink.hidden,
      hrefCurrent: generationResultLink.getAttribute('href'),
      ariaDisabled: generationResultLink.getAttribute('aria-disabled'),
      pointerEvents: generationResultLink.style.pointerEvents,
      opacity: generationResultLink.style.opacity,
    });
  }

  function formatLogLine(line) {
    const text = String(line || '');
    const escaped = escapeHtml(text);
    const lower = text.toLowerCase();

    let color = '#e2e8f0';

    if (
      lower.includes('успешно') ||
      lower.includes('завершено успешно') ||
      lower.includes('получен новый style_id')
    ) {
      color = '#22c55e';
    }

    if (
      lower.includes('с ошибкой') ||
      lower.startsWith('ошибка') ||
      lower.includes('error:') ||
      lower.includes('traceback')
    ) {
      color = '#ef4444';
    }

    if (
      lower.includes('запуск провайдера') ||
      lower.includes('подготовка') ||
      lower.includes('сборка') ||
      lower.includes('постобработка')
    ) {
      color = '#cbd5e1';
    }

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

  document
    .querySelectorAll('[data-close-generation]')
    .forEach((el) => el.addEventListener('click', closeGenerationModal));

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
        text:
          info?.text ||
          ({
            pending: 'ожидание',
            running: 'выполняется',
            success: 'успех',
            error: 'ошибка',
          })[normalized],
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
    console.log('[generation-ui] updateGenerationUi called', job);

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
    const fallbackResultUrl = `/projects/${projectSlug}/results`;
    const resolvedResultUrl = job.result_url || fallbackResultUrl;

    console.log('[generation-ui] state', {
      finalState,
      projectSlug,
      jobResultUrl: job.result_url,
      fallbackResultUrl,
      resolvedResultUrl,
      generationResultLinkExists: !!generationResultLink,
    });

    if (finalState === 'failed') {
      console.log('[generation-ui] branch = failed');
      setTopStatus('Ошибка генерации', 'error');
      setResultLinkEnabled(false);
    } else if (finalState === 'completed_with_errors') {
      console.log('[generation-ui] branch = completed_with_errors');
      setTopStatus('Завершено с ошибками', 'warning');
      setResultLinkEnabled(true, resolvedResultUrl);
    } else if (finalState === 'completed') {
      console.log('[generation-ui] branch = completed');
      setTopStatus('Завершено', 'success');
      setResultLinkEnabled(true, resolvedResultUrl);
    } else {
      console.log('[generation-ui] branch = running/other');
      setTopStatus(job.status_text || 'Выполняется');
      setResultLinkEnabled(false);
    }

    if (generationResultLink) {
      console.log('[generation-ui] FINAL LINK STATE', {
        hidden: generationResultLink.hidden,
        hrefCurrent: generationResultLink.getAttribute('href'),
        ariaDisabled: generationResultLink.getAttribute('aria-disabled'),
        pointerEvents: generationResultLink.style.pointerEvents,
        opacity: generationResultLink.style.opacity,
        outerHTML: generationResultLink.outerHTML,
      });
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
        statusEl.textContent =
          state === 'completed'
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

  byId('save')?.addEventListener('click', async () => {
    try {
      await saveProject();
      showToast('Проект сохранён');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  [
    byId('gen.icons_count'),
    byId('gen.patterns_count'),
    byId('gen.illustrations_count'),
  ].forEach((el) => {
    el?.addEventListener('input', updateGenerationSummary);
    el?.addEventListener('change', updateGenerationSummary);
  });
  updateGenerationSummary();

  byId('reset')?.addEventListener('click', async () => {
    try {
      const response = await fetch(`/projects/${projectSlug}/reset`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось сбросить проект');
      window.location.reload();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  byId('download')?.addEventListener('click', () => {
    window.location.href = `/projects/${projectSlug}/download`;
  });

  byId('upload-refs')?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    try {
      const response = await fetch(`/projects/${projectSlug}/upload-refs`, {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось загрузить референсы');
      showToast('Референсы загружены');
      event.target.value = '';
      await refreshRefs();
    } catch (error) {
      showToast(error.message, true);
    }
  });

  generateBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    const status = byId('generate-status');

    try {
      openGenerationModal();
      setTopStatus('Автосохранение проекта');

      generationLogLines = ['Инициализация генерации...'];
      renderGenerationLog(generationLogLines);

      await saveProject();

      generationLogLines = [
        'Инициализация генерации...',
        'tokens.json сохранён и подготовлен для генерации',
      ];
      renderGenerationLog(generationLogLines);

      if (status) status.textContent = 'Идёт генерация...';

      const payload = {
        style_id: byId('style_id')?.value.trim() || '',
        brand_id: byId('brand_id')?.value.trim() || '',
        icons_count: syncCountInput('gen.icons_count', 8),
        patterns_count: syncCountInput('gen.patterns_count', 4),
        illustrations_count: syncCountInput('gen.illustrations_count', 4),
        build_style: !!byId('build_style')?.checked,
      };

      const response = await fetch(`/projects/${projectSlug}/generate/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Ошибка запуска генерации');
      }
      if (!data.job_id) {
        throw new Error('Сервер не вернул job_id');
      }

      generationLogLines.push(`Задача создана: ${data.job_id}`);
      renderGenerationLog(generationLogLines);

      const job = await pollGenerationJob(data.job_id, status);

      if (job.style_id && byId('style_id')) {
        byId('style_id').value = job.style_id;
      }

      showToast(
        job.status === 'completed'
          ? 'Генерация завершена'
          : job.status === 'failed'
            ? 'Ошибка генерации'
            : 'Генерация завершена с замечаниями',
        job.status === 'failed'
      );
    } catch (error) {
      setTopStatus('Ошибка генерации', 'error');
      generationLogLines.push(`Ошибка: ${error.message}`);
      renderGenerationLog(generationLogLines);
      setResultLinkEnabled(false);

      if (status) status.textContent = 'Ошибка генерации';
      showToast(error.message, true);
      console.error('generation failed', error);
    }
  });

  byId('gen-figma')?.addEventListener('click', async () => {
    try {
      const response = await fetch(`/projects/${projectSlug}/generate-figma`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Не удалось собрать Figma manifest');
      showToast('Figma manifest собран');
    } catch (error) {
      showToast(error.message, true);
    }
  });
});
