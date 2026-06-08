// BrandKit Importer (Provider-aware)
// - Provider mode: recraft | seedream | flux | nano_banana | gpt5_image | alice_ai_art | both (All)
// - Fetches manifest from KYBBY and imports images into grouped frames

const PROVIDER_SLUGS = ['recraft', 'seedream', 'flux', 'nano_banana', 'gpt5_image', 'alice_ai_art'];

const PROVIDER_LABELS = {
  recraft: 'Recraft',
  seedream: 'Seedream',
  flux: 'Flux',
  nano_banana: 'Nano Banana',
  gpt5_image: 'GPT-5 Image',
  alice_ai_art: 'Alice AI ART',
};

// KYBBY design tokens (aligned with frontend/src/styles/foundation.css + mockups-figma.css)
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

const COLORS = {
  pageBg: hexToRgb('#010101'),
  surface: hexToRgb('#22292b'),
  surfaceRaised: hexToRgb('#2a3234'),
  border: hexToRgb('#797979'),
  text: hexToRgb('#ffffff'),
  textSoft: hexToRgb('#f4f2fb'),
  textMuted: hexToRgb('#99a1af'),
  accent: hexToRgb('#00aeff'),
  error: hexToRgb('#fca5a5'),
  cellBg: hexToRgb('#f4f2fb'),
};

// ui.html is linked in manifest.json — Figma injects it as __html__
var uiHtml = typeof __html__ !== 'undefined' ? __html__ : '';
if (!uiHtml || !String(uiHtml).trim()) {
  uiHtml = [
    '<body style="margin:0;font:12px/1.5 Roboto,system-ui,sans-serif;background:#010101;color:#fff;padding:12px">',
    '<p style="color:#00aeff;font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:11px">KYBBY</p>',
    '<p><strong>Импорт бренд-комплекта:</strong> не найден ui.html рядом с manifest.json.</p>',
    '<p style="color:#99a1af">Переимпортируйте плагин: распакуйте архив заново и выберите manifest.json из папки,',
    ' где лежат <code>code.js</code> и <code>ui.html</code>.</p>',
    '</body>'
  ].join('');
}
figma.showUI(uiHtml, { width: 380, height: 520 });

const STORAGE_KEY = 'brandkit_importer_settings';
const DEFAULT_SETTINGS = {
  brandId: '',
  provider: 'both',
  baseUrl: 'https://kybby-app.amvera.io'
};

function stripTrailingSlash(url) {
  return (url || '').replace(/\/+$/, '');
}

function safeUpper(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function providerLabel(p) {
  if (p === 'both') return 'Все';
  return PROVIDER_LABELS[p] || safeUpper(String(p).replace(/_/g, ' '));
}

function providerManifestFile(provider) {
  if (provider === 'both' || PROVIDER_SLUGS.indexOf(provider) === -1) {
    return 'figma_plugin_manifest.json';
  }
  return 'figma_plugin_manifest_' + provider + '.json';
}

async function initUI() {
  const stored = (await figma.clientStorage.getAsync(STORAGE_KEY)) || {};
  const settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  settings.baseUrl = stripTrailingSlash(settings.baseUrl);
  // Send both formats (settings object + legacy flat fields) for UI compatibility
  figma.ui.postMessage({
    type: 'init',
    settings,
    lastBrandId: settings.brandId,
    lastProvider: settings.provider,
    lastBaseUrl: settings.baseUrl
  });
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} при загрузке ${url}${txt ? `\n${txt}` : ''}`);
  }
  return res.json();
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} при скачивании ${url}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} при скачивании ${url}`);
  return res.text();
}

function isSvgItem(it) {
  const u = String((it && it.url) || '').toLowerCase();
  const n = String((it && it.name) || '').toLowerCase();
  return u.endsWith('.svg') || n.endsWith('.svg');
}

function safeRescale(node, scale) {
  if (!node || !scale || scale === 1) return;
  try {
    node.rescale(scale);
    return;
  } catch (e) { }
  try {
    // Some node types may support resize
    node.resize(node.width * scale, node.height * scale);
  } catch (e) { }
}

async function ensureInterFonts() {
  // Inter is available in Figma by default
  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' }).catch(async () => {
    // fallback
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' }).catch(() => { });
  });
}

function createSection(title) {
  const frame = figma.createFrame();
  frame.name = title;
  frame.fills = [{ type: 'SOLID', color: COLORS.surface }];
  frame.strokes = [{ type: 'SOLID', color: COLORS.border }];
  frame.strokeWeight = 1;
  frame.cornerRadius = 12;
  frame.clipsContent = false;
  return frame;
}

function createTextNode(text, fontSize = 16, isTitle = false, tone = 'text') {
  const toneMap = {
    text: COLORS.text,
    soft: COLORS.textSoft,
    muted: COLORS.textMuted,
    accent: COLORS.accent,
    error: COLORS.error,
  };
  const t = figma.createText();
  t.characters = text;
  t.fontSize = fontSize;
  if (isTitle) {
    t.fontName = { family: 'Inter', style: 'Medium' };
  } else {
    t.fontName = { family: 'Inter', style: 'Regular' };
  }
  t.fills = [{ type: 'SOLID', color: toneMap[tone] || COLORS.text }];
  return t;
}

function maxRootY(page) {
  const roots = page.children.filter(n => {
    if (n.type !== 'FRAME') return false;
    const name = String(n.name || '');
    return name.startsWith('Бренд-кит / ') || name.startsWith('BrandKit / ');
  });
  let maxY = 0;
  for (const n of roots) {
    maxY = Math.max(maxY, n.y + n.height);
  }
  return maxY;
}

function groupByProvider(items) {
  const groups = { unknown: [] };
  for (var i = 0; i < PROVIDER_SLUGS.length; i++) {
    groups[PROVIDER_SLUGS[i]] = [];
  }
  for (const it of items || []) {
    const p = (it && it.provider) ? String(it.provider).toLowerCase() : 'unknown';
    if (groups[p]) groups[p].push(it);
    else groups.unknown.push(it);
  }
  return groups;
}

async function placeAssetsGrid(parentFrame, items, opts) {
  const {
    cellW,
    cellH,
    gap,
    perRow,
    title
  } = opts;

  // Title
  const header = createTextNode(title, 14, true);
  header.x = 16;
  header.y = 12;
  parentFrame.appendChild(header);

  let x0 = 16;
  let y0 = 40;

  let col = 0;
  let row = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    // Progress ping
    figma.ui.postMessage({ type: 'progress', text: `${title}: загрузка ${it.name || it.url}` });

    // Build a cell container to avoid overlaps and keep consistent layout
    const cell = figma.createFrame();
    cell.name = it.name || `asset-${i + 1}`;
    cell.fills = [{ type: 'SOLID', color: COLORS.cellBg }];
    cell.strokes = [];
    cell.strokeWeight = 0;
    cell.cornerRadius = 8;
    cell.clipsContent = false;
    cell.resize(cellW, cellH);
    cell.x = x0 + col * (cellW + gap);
    cell.y = y0 + row * (cellH + gap);
    parentFrame.appendChild(cell);

    if (isSvgItem(it)) {
      // SVG → import as vector nodes (works cross-platform)
      let node;
      try {
        const svgText = await fetchText(it.url);
        node = figma.createNodeFromSvg(svgText);
      } catch (e) {
        console.warn('[BrandKit] SVG import failed:', it.url, e);
        const warn = createTextNode('Ошибка SVG', 12, false, 'error');
        warn.x = 8;
        warn.y = 8;
        cell.appendChild(warn);
        node = null;
      }
      if (node) {
        node.name = it.name || `svg-${i + 1}`;
        cell.appendChild(node);

        // Scale to fit the cell (with padding)
        const padInner = 12;
        const availW = Math.max(1, cellW - padInner * 2);
        const availH = Math.max(1, cellH - padInner * 2);
        const scale = Math.min(availW / Math.max(1, node.width), availH / Math.max(1, node.height), 1);
        safeRescale(node, scale);

        // Center
        node.x = Math.round((cellW - node.width) / 2);
        node.y = Math.round((cellH - node.height) / 2);
      }
    } else {
      // Raster (PNG/JPG) → createImage + rectangle fill
      let image = null;
      let rasterBytes = null;
      let handledAsSvg = false;
      try {
        rasterBytes = await fetchBytes(it.url);
        image = figma.createImage(rasterBytes);
      } catch (e) {
        console.warn('[BrandKit] Raster import failed:', it.url, e);

        // Try to salvage: sometimes Recraft returns SVG but we saved/serve it as .png (Windows then breaks).
        if (rasterBytes) {
          try {
            const txt = new TextDecoder('utf-8', { fatal: false }).decode(rasterBytes);
            const head = txt.trim().slice(0, 200).toLowerCase();
            if (head.includes('<svg')) {
              const node = figma.createNodeFromSvg(txt);
              node.name = it.name || `svg-from-bytes-${i + 1}`;
              cell.appendChild(node);

              const padInner = 12;
              const availW = Math.max(1, cellW - padInner * 2);
              const availH = Math.max(1, cellH - padInner * 2);
              const scale = Math.min(availW / Math.max(1, node.width), availH / Math.max(1, node.height), 1);
              safeRescale(node, scale);
              node.x = Math.round((cellW - node.width) / 2);
              node.y = Math.round((cellH - node.height) / 2);

              handledAsSvg = true;
            }
          } catch (e2) {
            // ignore
          }
        }

        if (!handledAsSvg) {
          const warn = createTextNode('Ошибка изображения', 12, false, 'error');
          warn.x = 8;
          warn.y = 8;
          cell.appendChild(warn);
        }
      }

      if (handledAsSvg) {
        // Already placed SVG fallback
      } else {
        const r = figma.createRectangle();
        r.name = it.name || `asset-${i + 1}`;
        r.resize(cellW, cellH);
        r.x = 0;
        r.y = 0;

        if (image) {
          // Seamless patterns are tileable in Figma, but TILE uses native px size —
          // a 1024×1024 tile in a 320×320 frame shows only a cropped corner.
          // FIT shows the full pattern like the KYBBY results page; switch to Tile in Figma if needed.
          const scaleMode = 'FIT';
          r.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode }];
        } else {
          r.fills = [];
          r.strokes = [{ type: 'SOLID', color: { r: 0.8, g: 0.2, b: 0.2 } }];
          r.strokeWeight = 2;
        }

        cell.appendChild(r);
      }
    }

    col++;
    if (col >= perRow) {
      col = 0;
      row++;
    }
  }

  // Resize frame to wrap content (roughly)
  const rows = items.length === 0 ? 1 : (Math.ceil(items.length / perRow));
  const contentW = Math.max(320, 16 + perRow * cellW + (perRow - 1) * gap + 16);
  const contentH = 40 + rows * cellH + (rows - 1) * gap + 16;
  parentFrame.resize(contentW, contentH);
}

async function importBrandKit({ brandId, provider, baseUrl }) {
  brandId = (brandId || '').trim();
  provider = (provider || 'both').toLowerCase();
  baseUrl = stripTrailingSlash(baseUrl || DEFAULT_SETTINGS.baseUrl);

  if (!brandId) throw new Error('ID бренда не указан');

  const manifestFile = providerManifestFile(provider);

  const manifestUrl = `${baseUrl}/assets/${encodeURIComponent(brandId)}/${manifestFile}`;

  figma.ui.postMessage({ type: 'progress', text: `Загрузка манифеста: ${manifestFile}` });

  let manifest;
  try {
    manifest = await fetchJSON(manifestUrl);
  } catch (e) {
    // Fallback: if provider-specific manifest is missing, fallback to combined
    if (provider !== 'both') {
      const fallbackUrl = `${baseUrl}/assets/${encodeURIComponent(brandId)}/figma_plugin_manifest.json`;
      figma.ui.postMessage({ type: 'progress', text: 'Переход на общий манифест' });
      manifest = await fetchJSON(fallbackUrl);
    } else {
      throw e;
    }
  }

  await ensureInterFonts();

  // Page strategy: use existing "Бренд-кит" page if present, else create one.
  let page = figma.root.children.find(p => p.type === 'PAGE' && (p.name === 'Бренд-кит' || p.name === 'BrandKit'));
  if (!page) {
    try {
      page = figma.createPage();
      page.name = 'Бренд-кит';
    } catch (e) {
      page = figma.currentPage;
      figma.ui.postMessage({ type: 'progress', text: 'Не удалось создать страницу «Бренд-кит»; использую текущую.' });
    }
  }

  await figma.setCurrentPageAsync(page);

  // Root frame
  const root = figma.createFrame();
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  root.name = `Бренд-кит / ${brandId} (${providerLabel(provider)})`;
  root.fills = [{ type: 'SOLID', color: COLORS.pageBg }];
  root.strokes = [{ type: 'SOLID', color: COLORS.border }];
  root.strokeWeight = 1;
  root.cornerRadius = 16;
  root.clipsContent = false;

  // Place below previous BrandKit roots
  root.x = 0;
  root.y = maxRootY(page) + 120;
  root.resize(1400, 1000);
  page.appendChild(root);

  // Layout constants
  const pad = 24;
  let cursorY = pad;

  // Title
  const title = createTextNode(`Бренд-кит: ${brandId}`, 24, true);
  title.x = pad;
  title.y = cursorY;
  root.appendChild(title);

  cursorY += 42;

  // Docs section
  const docs = createSection('Сведения');
  docs.x = pad;
  docs.y = cursorY;
  docs.resize(1352, 140);
  root.appendChild(docs);

  const docsTitle = createTextNode('Сведения', 16, true);
  docsTitle.x = 16;
  docsTitle.y = 12;
  docs.appendChild(docsTitle);

  const metaText = createTextNode(
    `Провайдер: ${providerLabel(provider)}\n` +
    `Манифест: ${manifestFile}\n` +
    `Адрес сервера: ${baseUrl}\n` +
    `Импорт: ${ts}`,
    12,
    false,
    'muted'
  );
  metaText.x = 16;
  metaText.y = 44;
  docs.appendChild(metaText);

  cursorY += docs.height + 24;

  // Sections (order matches brand kit: logos → icons → patterns → illustrations)
  const sections = [
    { key: 'logos', title: 'Логотипы', cellW: 240, cellH: 240, perRow: 4, gap: 24 },
    { key: 'icons', title: 'Иконки', cellW: 120, cellH: 120, perRow: 8, gap: 16 },
    { key: 'patterns', title: 'Паттерны', cellW: 320, cellH: 320, perRow: 3, gap: 24 },
    { key: 'illustrations', title: 'Иллюстрации', cellW: 520, cellH: 340, perRow: 2, gap: 24 }
  ];

  for (const sec of sections) {
    const secFrame = createSection(sec.title);
    secFrame.x = pad;
    secFrame.y = cursorY;
    secFrame.resize(1352, 400);
    root.appendChild(secFrame);

    // Group by provider (combined manifest) and filter per mode
    const items = Array.isArray(manifest[sec.key]) ? manifest[sec.key] : [];
    const groups = groupByProvider(items);

    let providersToRender;
    if (provider === 'both') providersToRender = PROVIDER_SLUGS.slice();
    else providersToRender = [provider];

    // If manifest is provider-specific and doesn't include provider field, treat as unknown
    if (!items.some(it => it && it.provider)) {
      // Put everything into the selected provider bucket
      groups[providersToRender[0]] = items;
    }

    let innerY = 16;
    let maxInnerW = 0;
    let totalInnerH = 0;

    for (const p of providersToRender) {
      const groupItems = (groups[p] || []).filter(it => !!it && !!it.url);
      const groupFrame = figma.createFrame();
      groupFrame.name = providerLabel(p);
      groupFrame.fills = [{ type: 'SOLID', color: COLORS.surfaceRaised }];
      groupFrame.strokes = [{ type: 'SOLID', color: COLORS.border }];
      groupFrame.strokeWeight = 1;
      groupFrame.cornerRadius = 12;
      groupFrame.clipsContent = false;
      groupFrame.x = 16;
      groupFrame.y = innerY;
      secFrame.appendChild(groupFrame);

      await placeAssetsGrid(groupFrame, groupItems, {
        cellW: sec.cellW,
        cellH: sec.cellH,
        gap: sec.gap,
        perRow: sec.perRow,
        title: `${sec.title} / ${providerLabel(p)} (${groupItems.length})`
      });

      innerY += groupFrame.height + 16;
      maxInnerW = Math.max(maxInnerW, groupFrame.width);
      totalInnerH = innerY;
    }

    // Resize section to wrap inner frames
    const newH = Math.max(180, totalInnerH + 16);
    secFrame.resize(Math.max(600, maxInnerW + 32), newH);

    cursorY += secFrame.height + 24;
  }

  // Resize root to wrap all sections
  root.resize(1400, cursorY + pad);

  figma.viewport.scrollAndZoomIntoView([root]);

  // Persist settings
  await figma.clientStorage.setAsync(STORAGE_KEY, { brandId, provider, baseUrl });

  figma.ui.postMessage({ type: 'done', text: `Импортировано: ${brandId} (${providerLabel(provider)})` });
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'import') {
      figma.ui.postMessage({ type: 'progress', text: 'Запуск импорта…' });
      // UI may send payload fields at the root level
      await importBrandKit(msg.payload || msg);
    } else if (msg.type === 'close') {
      figma.closePlugin();
    }
  } catch (err) {
    figma.ui.postMessage({ type: 'error', text: err && err.message ? err.message : String(err) });
  }
};

initUI().catch((err) => {
  const text = err && err.message ? err.message : String(err);
  figma.ui.postMessage({ type: 'error', text: `Ошибка инициализации: ${text}` });
  figma.notify(`Ошибка инициализации плагина KYBBY: ${text}`);
});
