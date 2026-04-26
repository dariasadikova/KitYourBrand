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
  const projectShell = document.querySelector('.project-shell');
  const tokens = parseJsonScript('tokens-data', {});
  const styleIdPlaceholderLocked = 'Будет заполнен после генерации стиля';
  const projectSlug = byId('project-slug')?.textContent?.trim() || projectShell?.dataset?.projectSlug || '';
  const isNewProjectFlow = projectShell?.dataset?.newProjectFlow === '1';
  console.log('[refs] projectSlug =', projectSlug);
  const refList = byId('refs-list');
  const statusLabel = byId('generate-status');
  const figmaGenerateBtn = byId('gen-figma');
  const figmaDownloadLink = byId('figma-link');
  const figmaProductionUrlInput = byId('figma-production-url');
  const figmaLocalUrlInput = byId('figma-local-url');
  let hasGeneratedStyleId = !!String(deepGet(tokens, 'style_id', '')).trim();

  const PROVIDER_NAMES = ['recraft', 'seedream', 'flux'];

  /** IDs вида gen.icons_count: в querySelector нельзя писать #gen.icons_count (точка = класс). */
  function resolveGenCountInput(id) {
    const root = byId('project-editor-form');
    return root?.querySelector(`[id="${id}"]`) ?? byId(id);
  }

  function peekCountInput(id, fallback) {
    const input = resolveGenCountInput(id);
    if (!input) return fallback;
    return clampAssetCount(input.value, fallback);
  }

  function syncCountInput(id, fallback) {
    const input = resolveGenCountInput(id);
    if (!input) return fallback;
    const normalized = clampAssetCount(input.value, fallback);
    input.value = String(normalized);
    return normalized;
  }

  function getRequestedCounts() {
    return {
      logos: peekCountInput('gen.logos_count', 4),
      icons: peekCountInput('gen.icons_count', 8),
      patterns: peekCountInput('gen.patterns_count', 4),
      illustrations: peekCountInput('gen.illustrations_count', 4),
    };
  }

  function refreshStyleIdInputState() {
    const styleIdInput = byId('style_id');
    if (!styleIdInput) return;
    styleIdInput.disabled = !hasGeneratedStyleId;
    styleIdInput.placeholder = hasGeneratedStyleId ? '' : styleIdPlaceholderLocked;
  }

  const promptChips = { logos: [], icons: [], patterns: [], illustrations: [] };
  let paletteSuggestions = null;
  let activePaletteSeedRole = 'primary';
  let activePaletteSeedColor = '';
  let activePaletteVariant = 'balanced';

  function normalizePromptArray(raw) {
    if (Array.isArray(raw)) {
      return raw.map((x) => String(x).trim()).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }

  function renderChipList(type) {
    const listIdMap = {
      logos: 'chip-list-logos',
      icons: 'chip-list-icons',
      patterns: 'chip-list-patterns',
      illustrations: 'chip-list-illustrations',
    };
    const listId = listIdMap[type];
    const el = byId(listId);
    if (!el) return;

    const items = promptChips[type] || [];
    el.innerHTML = items
      .map(
        (text, idx) => `
      <span class="chip" role="listitem">
        <span class="chip__text">${escapeHtml(text)}</span>
        <button type="button" class="chip__remove" data-chip-type="${type}" data-chip-index="${idx}" aria-label="Удалить">✕</button>
      </span>`,
      )
      .join('');

    el.querySelectorAll('.chip__remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-chip-type');
        const i = parseInt(btn.getAttribute('data-chip-index'), 10);
        if (!t || Number.isNaN(i)) return;
        markStepTouched(3);
        promptChips[t].splice(i, 1);
        renderChipList(t);
        refreshStepProgression();
      });
    });
  }

  function addChipsFromInput(type, inputId) {
    const input = byId(inputId);
    const raw = input?.value || '';
    const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    markStepTouched(3);
    promptChips[type].push(...parts);
    input.value = '';
    renderChipList(type);
    refreshStepProgression();
  }

  document.querySelectorAll('[data-chip-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-chip-add');
      if (type === 'logos') addChipsFromInput('logos', 'logos-input');
      else if (type === 'icons') addChipsFromInput('icons', 'icons-input');
      else if (type === 'patterns') addChipsFromInput('patterns', 'patterns-input');
      else if (type === 'illustrations') addChipsFromInput('illustrations', 'illustrations-input');
    });
  });

  [['logos-input', 'logos'], ['icons-input', 'icons'], ['patterns-input', 'patterns'], ['illustrations-input', 'illustrations']].forEach(([inputId, type]) => {
    byId(inputId)?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addChipsFromInput(type, inputId);
    });
  });

  function initAssetTabs() {
    const tablist = document.querySelector('#project-editor-form .asset-tabs');
    const panels = {
      logos: byId('asset-panel-logos'),
      icons: byId('asset-panel-icons'),
      patterns: byId('asset-panel-patterns'),
      illustrations: byId('asset-panel-illustrations'),
    };

    function setPanelHidden(panel, hidden) {
      if (!panel) return;
      if (hidden) {
        panel.setAttribute('hidden', '');
      } else {
        panel.removeAttribute('hidden');
      }
    }

    function activate(tabName) {
      if (tablist) {
        tablist.querySelectorAll('[data-asset-tab]').forEach((tab) => {
          const name = tab.getAttribute('data-asset-tab');
          const active = name === tabName;
          tab.classList.toggle('asset-tab--active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      } else {
        document.querySelectorAll('#project-editor-form [data-asset-tab]').forEach((tab) => {
          const name = tab.getAttribute('data-asset-tab');
          const active = name === tabName;
          tab.classList.toggle('asset-tab--active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      }
      Object.entries(panels).forEach(([name, panel]) => {
        const active = name === tabName;
        setPanelHidden(panel, !active);
        panel?.classList.toggle('asset-panel--active', active);
      });
    }

    const tabClickRoot = tablist || byId('project-editor-form');
    tabClickRoot?.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-asset-tab]');
      if (!tab || !tabClickRoot.contains(tab)) return;
      e.preventDefault();
      const name = tab.getAttribute('data-asset-tab');
      if (name) activate(name);
    });

    activate('logos');
  }

  function getProgressCards() {
    const cards = {};
    document.querySelectorAll('[data-progress-step]').forEach((el) => {
      cards[el.getAttribute('data-progress-step')] = el;
    });
    return cards;
  }

  function setStepVisible(card, visible) {
    if (!card) return;
    card.classList.toggle('is-hidden-step', !visible);
  }

  const stepTouched = { 1: false, 2: false, 3: false, 4: false, 5: false };

  function markStepTouched(step) {
    const key = Number(step);
    if (!Number.isFinite(key) || key < 1 || key > 5) return;
    if (!stepTouched[key]) stepTouched[key] = true;
  }

  function isStep1Complete() {
    return stepTouched[1] && !!byId('name')?.value.trim();
  }

  function isStep2Complete() {
    const activeCount = PALETTE_KEYS.filter((key) => byId(`palette.${key}_enabled`)?.checked).length;
    return stepTouched[2] && activeCount >= MIN_ACTIVE_PALETTE && activeCount <= MAX_ACTIVE_PALETTE;
  }

  function isStep3Complete() {
    return (
      stepTouched[3]
      && promptChips.logos.length > 0
      && promptChips.icons.length > 0
      && promptChips.patterns.length > 0
      && promptChips.illustrations.length > 0
    );
  }

  function refreshStepProgression() {
    const cards = getProgressCards();
    if (!isNewProjectFlow) {
      Object.values(cards).forEach((card) => setStepVisible(card, true));
      return;
    }
    const step1 = isStep1Complete();
    const step2 = isStep2Complete();
    const step3 = isStep3Complete();
    const step4 = stepTouched[4];
    const step5 = stepTouched[5];
    const step6Ready = stepTouched[5];

    setStepVisible(cards['1'], true);
    setStepVisible(cards['2'], step1);
    setStepVisible(cards['3'], step1 && step2);
    setStepVisible(cards['4'], step1 && step2 && step3);
    setStepVisible(cards['5'], step1 && step2 && step3 && step4);
    setStepVisible(cards['6'], step1 && step2 && step3 && step4 && step6Ready);

  }

  function updateGenerationSummary() {
    const counts = getRequestedCounts();

    const logosLabel = byId('summary-logos');
    const iconsLabel = byId('summary-icons');
    const patternsLabel = byId('summary-patterns');
    const illustrationsLabel = byId('summary-illustrations');

    if (logosLabel) logosLabel.textContent = String(counts.logos);
    if (iconsLabel) iconsLabel.textContent = String(counts.icons);
    if (patternsLabel) patternsLabel.textContent = String(counts.patterns);
    if (illustrationsLabel) illustrationsLabel.textContent = String(counts.illustrations);
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

  function normalizeHexColor(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
    if (/^#[0-9A-F]{3}$/.test(raw)) {
      return `#${raw.slice(1).split('').map((char) => char + char).join('')}`;
    }
    return '';
  }

  function setPaletteSlotValue(key, color) {
    const normalized = normalizeHexColor(color) || DEFAULT_PALETTE[key];
    const input = byId(`palette.${key}`);
    const textInput = byId(`palette.${key}_text`);
    if (input) input.value = normalized;
    if (textInput) textInput.value = normalized;
  }

  function renderPalettePreview(variantName) {
    const preview = byId('palette-autofill-preview');
    if (!preview || !paletteSuggestions || !paletteSuggestions[variantName]) {
      if (preview) preview.innerHTML = '';
      return;
    }
    const palette = paletteSuggestions[variantName];
    preview.innerHTML = PALETTE_KEYS.map((key) => `
      <div class="palette-preview-swatch">
        <div class="palette-preview-swatch__color" style="background:${palette[key]}"></div>
        <div class="palette-preview-swatch__meta">
          <span class="palette-preview-swatch__label">${key[0].toUpperCase()}${key.slice(1)}</span>
          <strong class="palette-preview-swatch__value">${palette[key]}</strong>
        </div>
      </div>`).join('');
  }

  function updatePaletteVariantButtons() {
    document.querySelectorAll('.palette-variant-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.paletteVariant === activePaletteVariant);
    });
  }

  function showPaletteAutofill(seedRole, seedColor) {
    const normalized = normalizeHexColor(seedColor);
    const panel = byId('palette-autofill');
    const caption = byId('palette-autofill-caption');
    const seed = byId('palette-autofill-seed');
    if (!panel) return;
    if (!normalized) {
      panel.hidden = true;
      return;
    }
    activePaletteSeedRole = seedRole;
    activePaletteSeedColor = normalized;
    panel.hidden = false;
    if (caption) caption.textContent = `Основа палитры: ${seedRole[0].toUpperCase()}${seedRole.slice(1)} ${normalized}. Выберите один из готовых вариантов.`;
    if (seed) seed.textContent = `Основа: ${seedRole[0].toUpperCase()}${seedRole.slice(1)} · ${normalized}`;
  }

  async function fetchPaletteSuggestions(seedRole = activePaletteSeedRole, seedColor = activePaletteSeedColor) {
    const normalized = normalizeHexColor(seedColor);
    if (!normalized) return;
    const response = await fetch(`/projects/${projectSlug}/palette/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed_color: normalized, seed_role: seedRole }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Не удалось подобрать палитру');
    }
    paletteSuggestions = data.variants || null;
    activePaletteVariant = paletteSuggestions?.balanced ? 'balanced' : 'soft';
    updatePaletteVariantButtons();
    renderPalettePreview(activePaletteVariant);
  }

  async function refreshPaletteSuggestions(seedRole, seedColor) {
    showPaletteAutofill(seedRole, seedColor);
    try {
      await fetchPaletteSuggestions(seedRole, seedColor);
    } catch (error) {
      showToast(error.message, true);
    }
  }

  function applySuggestedPalette(variantName) {
    if (!paletteSuggestions || !paletteSuggestions[variantName]) return;
    activePaletteVariant = variantName;
    const palette = paletteSuggestions[variantName];
    PALETTE_KEYS.forEach((key) => {
      setPaletteSlotValue(key, palette[key]);
    });
    const activeCheckbox = byId(`palette.${activePaletteSeedRole}_enabled`);
    if (activeCheckbox) activeCheckbox.checked = true;
    updatePaletteControlsState();
    updatePaletteVariantButtons();
    renderPalettePreview(variantName);
    markStepTouched(2);
    refreshStepProgression();
    showToast(`Палитра ${variantName} применена`);
  }

  function hydrateForm() {
    byId('name') && (byId('name').value = deepGet(tokens, 'name', ''));
    byId('brand_id') && (byId('brand_id').value = deepGet(tokens, 'brand_id', ''));
    byId('style_id') && (byId('style_id').value = deepGet(tokens, 'style_id', ''));
    hasGeneratedStyleId = !!String(deepGet(tokens, 'style_id', '')).trim();
    refreshStyleIdInputState();
    byId('icon.strokeWidth') && (byId('icon.strokeWidth').value = deepGet(tokens, 'icon.strokeWidth', 2));
    byId('icon.corner') && (byId('icon.corner').value = deepGet(tokens, 'icon.corner', 'rounded'));
    byId('icon.fill') && (byId('icon.fill').value = deepGet(tokens, 'icon.fill', 'outline'));
    byId('texture.enabled') && (byId('texture.enabled').checked = !!deepGet(tokens, 'texture.enabled', false));
    byId('texture.mode') && (byId('texture.mode').value = deepGet(tokens, 'texture.mode', ''));
    byId('texture.scale') && (byId('texture.scale').value = deepGet(tokens, 'texture.scale', ''));
    byId('illustration.style') && (byId('illustration.style').value = deepGet(tokens, 'illustration.style', ''));
    byId('illustration.background') && (byId('illustration.background').value = deepGet(tokens, 'illustration.background', ''));
    promptChips.logos = normalizePromptArray(deepGet(tokens, 'prompts.logos', []));
    promptChips.icons = normalizePromptArray(deepGet(tokens, 'prompts.icons', []));
    promptChips.patterns = normalizePromptArray(deepGet(tokens, 'prompts.patterns', []));
    promptChips.illustrations = normalizePromptArray(deepGet(tokens, 'prompts.illustrations', []));
    renderChipList('logos');
    renderChipList('icons');
    renderChipList('patterns');
    renderChipList('illustrations');

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
        refreshPaletteSuggestions(key, input.value);
      });
      text?.addEventListener('input', () => {
        const normalized = normalizeHexColor(text.value);
        if (normalized && input) {
          input.value = normalized;
          refreshPaletteSuggestions(key, normalized);
        }
      });
      checkbox?.addEventListener('change', () => {
        enforcePaletteMinimum(key);
        updatePaletteControlsState();
      });
    });
    updatePaletteControlsState();
    const initialSeedColor = paletteSlots.primary || DEFAULT_PALETTE.primary;
    showPaletteAutofill('primary', initialSeedColor);
    fetchPaletteSuggestions('primary', initialSeedColor).catch((error) => {
      console.warn('[palette] suggest failed', error);
    });

    const gen = tokens.generation || {};
    const logosEl = resolveGenCountInput('gen.logos_count');
    const iconsEl = resolveGenCountInput('gen.icons_count');
    const patternsEl = resolveGenCountInput('gen.patterns_count');
    const illEl = resolveGenCountInput('gen.illustrations_count');
    if (logosEl) logosEl.value = gen.logos_count ?? 4;
    if (iconsEl) iconsEl.value = gen.icons_count ?? 8;
    if (patternsEl) patternsEl.value = gen.patterns_count ?? 4;
    if (illEl) illEl.value = gen.illustrations_count ?? 4;
    if (byId('build_style')) byId('build_style').checked = !!gen.build_style;

    if (byId('illustration.vector')) {
      byId('illustration.vector').checked = !!deepGet(tokens, 'illustration.vector', false);
    }
    if (byId('illustration.raster')) {
      byId('illustration.raster').checked = !!deepGet(tokens, 'illustration.raster', true);
    }

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

    clone.icon.strokeWidth = Number(byId('icon.strokeWidth')?.value || 2);
    clone.icon.corner = byId('icon.corner')?.value || 'rounded';
    clone.icon.fill = byId('icon.fill')?.value || 'outline';
    // Не тащим скрытый legacy-дефолт motifs ("waves","dots"), т.к. в UI это поле не редактируется.
    clone.texture.motifs = [];
    clone.texture.enabled = !!byId('texture.enabled')?.checked;
    clone.texture.mode = byId('texture.mode')?.value || '';
    clone.texture.scale = byId('texture.scale')?.value || '';
    clone.illustration.style = byId('illustration.style')?.value || '';
    clone.illustration.background = byId('illustration.background')?.value || '';
    clone.illustration.vector = !!byId('illustration.vector')?.checked;
    clone.illustration.raster = !!byId('illustration.raster')?.checked;

    clone.prompts.logos = [...promptChips.logos];
    clone.prompts.icons = [...promptChips.icons];
    clone.prompts.patterns = [...promptChips.patterns];
    clone.prompts.illustrations = [...promptChips.illustrations];

    clone.generation.logos_count = syncCountInput('gen.logos_count', 4);
    clone.generation.icons_count = syncCountInput('gen.icons_count', 8);
    clone.generation.patterns_count = syncCountInput('gen.patterns_count', 4);
    clone.generation.illustrations_count = syncCountInput('gen.illustrations_count', 4);
    clone.generation.build_style = !!byId('build_style')?.checked;

    return clone;
  }

  byId('palette-autofill-refresh')?.addEventListener('click', async () => {
    if (!activePaletteSeedColor) return;
    try {
      await fetchPaletteSuggestions(activePaletteSeedRole, activePaletteSeedColor);
      showToast('Варианты палитры обновлены');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  document.querySelectorAll('.palette-variant-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const variantName = button.dataset.paletteVariant;
      if (!variantName) return;
      if (!paletteSuggestions) {
        try {
          await fetchPaletteSuggestions(activePaletteSeedRole, activePaletteSeedColor);
        } catch (error) {
          showToast(error.message, true);
          return;
        }
      }
      applySuggestedPalette(variantName);
    });
  });

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
        const path = item;
        const name = path.split('/').pop() || 'ref';
        return {
          path,
          name,
          url: `/projects/${projectSlug}/refs/${encodeURIComponent(name)}`,
        };
      }

      if (item && typeof item === 'object') {
        const path =
          typeof item.path === 'string' && item.path.startsWith('uploads/refs/')
            ? item.path
            : null;
        if (!path) return null;
        const name = path.split('/').pop() || 'ref';
        const url =
          item.url || `/projects/${projectSlug}/refs/${encodeURIComponent(name)}`;
        return { path, name, url };
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
        tokens.references = tokens.references || {};
        tokens.references.style_images = [];
        refList.innerHTML = '<div class="refs-empty">Референсы пока не загружены</div>';
        return;
      }

      tokens.references = tokens.references || {};
      tokens.references.style_images = refs
        .map((ref) => String(ref.path || '').trim())
        .filter(Boolean);

      refList.innerHTML = refs.map((ref) => {
        const safePath = String(ref.path || '').replace(/"/g, '&quot;');
        return `
        <div class="ref-card">
          <a href="${ref.url}" target="_blank" rel="noopener" class="ref-card__preview">
            <img src="${ref.url}" alt="${ref.name}" class="ref-card__image" />
          </a>
          <button type="button" class="ref-delete" data-ref-path="${safePath}">Удалить</button>
        </div>
      `;
      }).join('');

      refList.querySelectorAll('.ref-delete').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const relPath = btn.getAttribute('data-ref-path');
          if (!relPath) return;

          try {
            const response = await fetch(`/projects/${projectSlug}/delete-ref`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: relPath }),
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

      markStepTouched(4);
      refreshStepProgression();
    } catch (error) {
      console.error('[refs] refresh failed', error);
      refList.innerHTML = '<div class="refs-empty">Не удалось загрузить референсы</div>';
    }
  }

  hydrateForm();
  initAssetTabs();
  refreshStepProgression();
  updateFigmaExportUi({ brand_id: getCurrentBrandId() });
  refreshRefs();

  document.querySelector('[data-progress-step="4"] .editor-card__head')?.addEventListener('click', () => {
    markStepTouched(4);
    refreshStepProgression();
  });

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
  let activeGenerationJobId = null;
  let cancelRequested = false;

  document
   .querySelectorAll('[data-close-generation]')
   .forEach((el) => el.addEventListener('click', closeGenerationModal));

  byId('generation-modal-close-btn')?.addEventListener('click', closeGenerationModal);

  async function requestCancelGeneration() {
    if (!activeGenerationJobId) {
      closeGenerationModal();
      return;
    }
    if (cancelRequested) return;
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
      setTopStatus('Прерывание генерации...', 'warning');
      generationLogLines.push('Запрошено прерывание генерации пользователем');
      renderGenerationLog(generationLogLines);
    } catch (error) {
      cancelRequested = false;
      if (generationCancelBtn) {
        generationCancelBtn.disabled = false;
        generationCancelBtn.textContent = 'Прервать генерацию';
      }
      showToast(error.message || 'Не удалось прервать генерацию', true);
    }
  }

  generationCancelBtn?.addEventListener('click', requestCancelGeneration);

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
      lower.includes('traceback') ||
      lower.includes('не ответил в течение') ||
      lower.includes('генерация остановлена') ||
      lower.includes('завершился с ошибкой') ||
      lower.includes('ошибка у провайдера')
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
    cancelRequested = false;
    activeGenerationJobId = null;
    if (generationCancelBtn) {
      generationCancelBtn.disabled = false;
      generationCancelBtn.textContent = 'Прервать генерацию';
      generationCancelBtn.hidden = false;
    }

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

    if (finalState === 'cancelled') {
      setTopStatus('Генерация прервана', 'warning');
      setResultLinkEnabled(false);
      if (generationCancelBtn) generationCancelBtn.hidden = true;
    } else if (finalState === 'failed') {
      setTopStatus('Ошибка генерации', 'error');
      setResultLinkEnabled(false);
      if (generationCancelBtn) generationCancelBtn.hidden = true;
    } else if (finalState === 'completed_with_errors') {
      setTopStatus('Завершено с ошибками', 'warning');
      setResultLinkEnabled(true, resolvedResultUrl);
      if (generationCancelBtn) generationCancelBtn.hidden = true;
    } else if (finalState === 'completed') {
      setTopStatus('Завершено', 'success');
      setResultLinkEnabled(true, resolvedResultUrl);
      if (generationCancelBtn) generationCancelBtn.hidden = true;
    } else {
      setTopStatus(job.status_text || 'Выполняется');
      setResultLinkEnabled(false);
      if (generationCancelBtn) generationCancelBtn.hidden = false;
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
                : state === 'cancelled'
                  ? 'Генерация прервана'
                : 'Идёт генерация...';
      }

      if (state === 'completed' || state === 'completed_with_errors' || state === 'failed' || state === 'cancelled') {
        return job;
      }

      await sleep(1000);
    }

    throw new Error('Не удалось получить актуальный статус генерации (таймаут опроса)');
  }

  byId('save')?.addEventListener('click', async () => {
    try {
      await saveProject();
      showToast('Проект сохранён');
    } catch (error) {
      showToast(error.message, true);
    }
  });

  const editorForm = byId('project-editor-form');
  editorForm?.addEventListener('input', (event) => {
    const step = event.target?.closest?.('[data-progress-step]')?.getAttribute?.('data-progress-step');
    if (step) markStepTouched(step);
    refreshStepProgression();
  });
  editorForm?.addEventListener('change', (event) => {
    const step = event.target?.closest?.('[data-progress-step]')?.getAttribute?.('data-progress-step');
    if (step) markStepTouched(step);
    refreshStepProgression();
  });

  ['gen.logos_count', 'gen.icons_count', 'gen.patterns_count', 'gen.illustrations_count'].forEach((fid) => {
    const node = resolveGenCountInput(fid);
    node?.addEventListener('input', updateGenerationSummary);
    node?.addEventListener('change', updateGenerationSummary);
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
        logos_count: syncCountInput('gen.logos_count', 4),
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
      activeGenerationJobId = data.job_id;
      cancelRequested = false;
      if (generationCancelBtn) {
        generationCancelBtn.disabled = false;
        generationCancelBtn.textContent = 'Прервать генерацию';
        generationCancelBtn.hidden = false;
      }

      generationLogLines.push(`Задача создана: ${data.job_id}`);
      renderGenerationLog(generationLogLines);

      const job = await pollGenerationJob(data.job_id, status);

      if (job.style_id && byId('style_id')) {
        hasGeneratedStyleId = true;
        refreshStyleIdInputState();
        byId('style_id').value = job.style_id;
      }

      showToast(
        job.status === 'completed'
          ? 'Генерация завершена'
          : job.status === 'cancelled'
            ? 'Генерация прервана'
          : job.status === 'failed'
            ? 'Ошибка генерации'
            : 'Генерация завершена с замечаниями',
        job.status === 'failed'
      );
    } catch (error) {
      const message = String(error?.message || '');
      const isStatusTimeout =
        message.includes('таймаут опроса') || message.includes('Превышено время ожидания статуса');

      setTopStatus(
        isStatusTimeout ? 'Статус генерации временно недоступен' : 'Ошибка генерации',
        isStatusTimeout ? 'warning' : 'error',
      );
      generationLogLines.push(`Ошибка: ${error.message}`);
      renderGenerationLog(generationLogLines);
      setResultLinkEnabled(false);
      if (generationCancelBtn) {
        generationCancelBtn.hidden = true;
        generationCancelBtn.disabled = true;
      }
      if (isStatusTimeout) {
        generationLogLines.push(
          'Подсказка: откройте Историю генераций, чтобы посмотреть финальный статус и причину ошибки.',
        );
        renderGenerationLog(generationLogLines);
      }
      // После потери статуса не даём отправить "cancel", чтобы не перезаписать первопричину
      // ошибкой "прервана пользователем" в истории.
      activeGenerationJobId = null;
      cancelRequested = false;

      if (status) {
        status.textContent = isStatusTimeout
          ? 'Статус генерации временно недоступен'
          : 'Ошибка генерации';
      }
      showToast(error.message, true);
      console.error('generation failed', error);
    }
  });

});
