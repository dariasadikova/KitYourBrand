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
  const projectSlug = byId('project-slug')?.textContent?.trim() || document.querySelector('.project-shell')?.dataset?.projectSlug || '';
  console.log('[refs] projectSlug =', projectSlug);
  const refList = byId('refs-list');
  const statusLabel = byId('generate-status');
  const figmaGenerateBtn = byId('gen-figma');
  const figmaDownloadLink = byId('figma-link');
  const figmaProductionUrlInput = byId('figma-production-url');
  const figmaLocalUrlInput = byId('figma-local-url');

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


  function getCurrentBrandId() {
    return byId('brand_id')?.value.trim() || deepGet(tokens, 'brand_id', '') || '';
  }

  function buildFigmaUrls(brandId) {
    const safeBrandId = brandId || '<brand_id>';
    const origin = window.location.origin.replace('127.0.0.1', 'localhost');

    return {
      production_url: `https://brand.kit/assets/${safeBrandId}/icons|patterns|illustrations`,
      local_url: `${origin}/assets/${safeBrandId}/...`,
    };
  }

  function setFigmaDownloadEnabled(enabled, href = '#') {
    if (!figmaDownloadLink) return;

    figmaDownloadLink.hidden = false;

    if (!enabled) {
      figmaDownloadLink.href = '#';
      figmaDownloadLink.setAttribute('aria-disabled', 'true');
      figmaDownloadLink.style.pointerEvents = 'none';
      figmaDownloadLink.style.opacity = '0.55';
      figmaDownloadLink.style.cursor = 'default';
      return;
    }

    figmaDownloadLink.href = href;
    figmaDownloadLink.removeAttribute('aria-disabled');
    figmaDownloadLink.style.pointerEvents = 'auto';
    figmaDownloadLink.style.opacity = '1';
    figmaDownloadLink.style.cursor = 'pointer';
  }

  function updateFigmaExportUi(payload = {}) {
    const brandId = payload.brand_id || getCurrentBrandId();
    const fallbackUrls = buildFigmaUrls(brandId);

    const productionUrl = payload.production_url || fallbackUrls.production_url;
    const localUrl = payload.local_url || fallbackUrls.local_url;
    const manifestUrl = payload.download_url || payload.manifest_url || `/projects/${projectSlug}/exports/figma_plugin_manifest.json`;

    if (figmaProductionUrlInput) figmaProductionUrlInput.value = productionUrl;
    if (figmaLocalUrlInput) figmaLocalUrlInput.value = localUrl;

    if (brandId) {
      setFigmaDownloadEnabled(true, manifestUrl);
    } else {
      setFigmaDownloadEnabled(false);
    }
  }

  function setFigmaButtonBusy(isBusy, label) {
    if (!figmaGenerateBtn) return;

    if (!figmaGenerateBtn.dataset.defaultLabel) {
      figmaGenerateBtn.dataset.defaultLabel = figmaGenerateBtn.textContent.trim() || 'Сгенерировать Figma Plugin JSON';
    }

    figmaGenerateBtn.disabled = !!isBusy;
    figmaGenerateBtn.textContent = label || (isBusy ? 'Генерируем Figma JSON…' : figmaGenerateBtn.dataset.defaultLabel);
    figmaGenerateBtn.style.opacity = isBusy ? '0.8' : '1';
    figmaGenerateBtn.style.cursor = isBusy ? 'progress' : 'pointer';
  }

  function normalizeRefsPayload(data) {
    const raw =
      data?.refs ??
      data?.images ??
      data?.items ??
      data?.files ??
      data?.references ??
      data;

    if (!Array.isArray(raw)) return [];

    return raw.map((item) => {
      if (typeof item === 'string') {
        const name = item.split('/').pop();
        return {
          name,
          url: `/projects/${projectSlug}/refs/${name}`,
        };
      }

      if (item && typeof item === 'object') {
        const name =
          item.name ||
          item.filename ||
          item.file ||
          item.path?.split('/')?.pop() ||
          'ref';

        const url =
          item.url ||
          item.path ||
          `/projects/${projectSlug}/refs/${name}`;

        return { name, url };
      }

      return null;
    }).filter(Boolean);
  }

  async function refreshRefs() {
    if (!refList) return;

    if (!projectSlug) {
      console.error('[refs] refreshRefs: empty projectSlug');
      refList.innerHTML = '<div class="refs-empty">Не найден projectSlug</div>';
      return;
    }

    refList.innerHTML = '<div class="refs-empty">Загрузка...</div>';

    try {
      console.log('[refs] list url =', `/projects/${projectSlug}/list-refs`);

      const response = await fetch(`/projects/${projectSlug}/list-refs`);

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        console.error('[refs] list response is not JSON', e);
        refList.innerHTML = '<div class="refs-empty">Некорректный ответ сервера</div>';
        return;
      }

      console.log('[refs] list response =', response.status, data);

      if (!response.ok || (data.ok === false)) {
        refList.innerHTML = '<div class="refs-empty">Не удалось загрузить референсы</div>';
        return;
      }

      const refs = normalizeRefsPayload(data);

      console.log('[refs] normalized refs =', refs);

      if (!refs.length) {
        refList.innerHTML = '<div class="refs-empty">Референсы пока не загружены</div>';
        return;
      }

      refList.innerHTML = refs.map((ref) => `
        <div class="ref-card">
          <a href="${ref.url}" target="_blank" rel="noopener" class="ref-card__preview">
            <img src="${ref.url}" alt="${ref.name}" class="ref-card__image" />
          </a>
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
            if (!response.ok || (data.ok === false)) {
              throw new Error(data?.error || 'Не удалось удалить референс');
            }

            showToast('Референс удалён');
            await refreshRefs();
          } catch (error) {
            console.error('[refs] delete failed', error);
            showToast(error.message, true);
          }
        });
      });
    } catch (error) {
      console.error('[refs] refresh failed', error);
      refList.innerHTML = '<div class="refs-empty">Не удалось загрузить референсы</div>';
    }
  }

  hydrateForm();
  updateFigmaExportUi({ brand_id: getCurrentBrandId() });
  refreshRefs();

  const generationModal = byId('generation-modal');
  const generationLog = byId('generation-log');
  const generationStatusText = byId('generation-status-text');
  const generationProgressText = byId('generation-progress-text');
  const generationProgressBar = byId('generation-progress-bar');
  const generationResultLink = byId('generation-result-link');
  const generationCancelBtn = byId('generation-cancel-btn');
  const generateBtn = byId('btn-generate');

  const generationErrorModal = byId('generation-error-modal');
  const generationErrorBody = byId('generation-error-body');
  const generationErrorHint = byId('generation-error-hint');
  let generationErrorShownJobId = null;

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

  function openGenerationErrorModal(message, hint) {
    if (!generationErrorModal || !generationErrorBody) return;
    generationErrorBody.textContent = message && String(message).trim()
      ? String(message).trim()
      : 'Генерация не удалась.';
    if (generationErrorHint) {
      const h = hint && String(hint).trim();
      if (h) {
        generationErrorHint.textContent = h;
        generationErrorHint.hidden = false;
      } else {
        generationErrorHint.textContent = '';
        generationErrorHint.hidden = true;
      }
    }
    generationErrorModal.hidden = false;
  }

  function closeGenerationErrorModal() {
    if (!generationErrorModal) return;
    generationErrorModal.hidden = true;
  }

  function openGenerationModal() {
    if (!generationModal) return;
    resetGenerationModal();
    generationErrorShownJobId = null;
    generationModal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeGenerationModal() {
    if (!generationModal) return;
    closeGenerationErrorModal();
    generationModal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  document.querySelectorAll('[data-close-generation-error]').forEach((el) => {
    el.addEventListener('click', closeGenerationErrorModal);
  });
  byId('generation-error-dismiss')?.addEventListener('click', closeGenerationErrorModal);
  byId('generation-error-close')?.addEventListener('click', closeGenerationErrorModal);

  function inferProviderStatuses(job) {
    const base = {
      recraft: { status: 'pending', text: 'ожидание' },
      seedream: { status: 'pending', text: 'ожидание' },
      flux: { status: 'pending', text: 'ожидание' },
    };

    const source =
      (job && typeof job.provider_statuses === 'object' && job.provider_statuses) ||
      (job && typeof job.providers === 'object' && job.providers) ||
      {};

    Object.entries(source).forEach(([name, info]) => {
      if (!base[name]) return;

      let rawStatus = '';
      let customText = '';

      if (typeof info === 'string') {
        rawStatus = info.toLowerCase();
      } else if (info && typeof info === 'object') {
        rawStatus = String(info.status || info.state || '').toLowerCase();
        customText = String(info.text || '').trim();
      }

      let normalized = 'pending';
      if (['running', 'in_progress'].includes(rawStatus)) normalized = 'running';
      else if (['success', 'done', 'completed', 'ok'].includes(rawStatus)) normalized = 'success';
      else if (['error', 'failed', 'fail'].includes(rawStatus)) normalized = 'error';
      else if (['pending', 'wait', 'waiting'].includes(rawStatus)) normalized = 'pending';

      base[name] = {
        status: normalized,
        text:
          customText ||
          ({
            pending: 'ожидание',
            running: 'выполняется',
            success: 'успех',
            error: 'ошибка',
          })[normalized],
      };
    });

    const providerErrors = job && typeof job.provider_errors === 'object' ? job.provider_errors : {};
    Object.keys(providerErrors).forEach((name) => {
      if (!base[name]) return;
      if (providerErrors[name]) {
        base[name] = { status: 'error', text: 'ошибка' };
      }
    });

    const failedProvider = String(job?.failed_provider || '').trim().toLowerCase();
    if (failedProvider && base[failedProvider] && base[failedProvider].status !== 'success') {
      base[failedProvider] = { status: 'error', text: 'ошибка' };
    }

    const currentProvider = String(job?.current_provider || '').trim().toLowerCase();
    if (
      currentProvider &&
      base[currentProvider] &&
      job?.status === 'running' &&
      base[currentProvider].status === 'pending'
    ) {
      base[currentProvider] = { status: 'running', text: 'выполняется' };
    }

    const terminalFailed = job?.status === 'failed' || job?.status === 'completed_with_errors';
    if (terminalFailed) {
      Object.keys(base).forEach((name) => {
        if (base[name].status === 'running') {
          base[name] = { status: 'error', text: 'ошибка' };
        }
      });
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

    const finalState = job.status;

    const logs = Array.isArray(job.logs) ? [...job.logs] : [];
    const providerErrorMessages = [];

    const providerErrors = job && typeof job.provider_errors === 'object' ? job.provider_errors : {};
    ['recraft', 'seedream', 'flux'].forEach((name) => {
      const err = providerErrors[name];
      if (err && typeof err === 'object' && err.message) {
        providerErrorMessages.push(`${name[0].toUpperCase()}${name.slice(1)}: ${err.message}`);
        if (err.hint) {
          providerErrorMessages.push(`${name[0].toUpperCase()}${name.slice(1)}: ${err.hint}`);
        }
      }
    });

    if (finalState === 'failed') {
      if (job.error && !logs.includes(job.error)) {
        logs.push(job.error);
      }
      if (job.error_hint && !logs.includes(job.error_hint)) {
        logs.push(job.error_hint);
      }
      providerErrorMessages.forEach((line) => {
        if (!logs.includes(line)) logs.push(line);
      });

      generationLogLines = logs.length ? logs : ['Ошибка генерации'];
      renderGenerationLog(generationLogLines);

      if (job.id && generationErrorShownJobId !== job.id) {
        generationErrorShownJobId = job.id;
        openGenerationErrorModal(job.error, job.error_hint);
      }
    } else {
      generationLogLines = logs;
      renderGenerationLog(generationLogLines);
    }

    const fallbackResultUrl = `/projects/${projectSlug}/results`;
    const resolvedResultUrl = job.result_url || fallbackResultUrl;

    if (finalState === 'failed') {
      setTopStatus('Ошибка генерации', 'error');
      setResultLinkEnabled(false);
    } else if (finalState === 'completed_with_errors') {
      setTopStatus('Завершено с ошибками', 'warning');
      setResultLinkEnabled(true, resolvedResultUrl);
    } else if (finalState === 'completed') {
      setTopStatus('Завершено', 'success');
      setResultLinkEnabled(true, resolvedResultUrl);
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
    console.log('[refs] selected files =', files);

    if (!files.length) return;

    if (!projectSlug) {
      console.error('[refs] empty projectSlug');
      showToast('Не найден projectSlug для загрузки референсов', true);
      return;
    }

    const form = new FormData();
    files.forEach((file) => form.append('files', file));

    try {
      console.log('[refs] upload url =', `/projects/${projectSlug}/upload-refs`);

      const response = await fetch(`/projects/${projectSlug}/upload-refs`, {
        method: 'POST',
        body: form,
      });

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
        console.error('[refs] upload response is not JSON', e);
        throw new Error('Сервер вернул некорректный ответ при загрузке референсов');
      }

      console.log('[refs] upload response =', response.status, data);

      if (!response.ok || (data.ok === false)) {
        throw new Error(data?.error || 'Не удалось загрузить референсы');
      }

      showToast('Референсы загружены');
      event.target.value = '';
      await refreshRefs();
    } catch (error) {
      console.error('[refs] upload failed', error);
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

  figmaGenerateBtn?.addEventListener('click', async () => {
    try {
      setFigmaButtonBusy(true, 'Сохраняем проект…');
      setFigmaDownloadEnabled(false);

      const brandId = getCurrentBrandId();
      if (!brandId) {
        throw new Error('Укажите Brand ID перед генерацией Figma manifest');
      }

      if (figmaLocalUrlInput) figmaLocalUrlInput.value = 'Подготовка manifest…';
      await saveProject();

      setFigmaButtonBusy(true, 'Генерируем Figma JSON…');
      const response = await fetch(`/projects/${projectSlug}/generate-figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Не удалось собрать Figma manifest');
      }

      updateFigmaExportUi({
        brand_id: data.brand_id || brandId,
        production_url: data.production_url,
        local_url: data.local_url,
        manifest_url: data.manifest_url,
        download_url: data.download_url,
      });

      setFigmaButtonBusy(true, 'Manifest готов ✓');
      showToast('Figma manifest собран');
      setTimeout(() => setFigmaButtonBusy(false), 900);
    } catch (error) {
      updateFigmaExportUi({ brand_id: getCurrentBrandId() });
      setFigmaDownloadEnabled(false);
      setFigmaButtonBusy(false);
      showToast(error.message, true);
      return;
    } finally {
      if (figmaGenerateBtn?.disabled) {
        setTimeout(() => setFigmaButtonBusy(false), 900);
      }
    }
  });
});
