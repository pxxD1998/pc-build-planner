(() => {
  'use strict';

  if (window.__PCBP_UI_REFRESH__) return;
  window.__PCBP_UI_REFRESH__ = true;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const body = document.body;
  const topbar = $('.topbar');
  const catalog = $('.catalog');
  const catalogHead = $('.catalog-head');
  const titleWrap = $('.catalog-title-wrap');
  const catalogTitle = $('#catalogTitle');
  const categorySelect = $('#categorySelect');
  const resultCount = $('#resultCount');
  const toolbar = $('.toolbar');
  const buildPanel = $('.build');
  const rows = $('#rows');

  if (!body || !topbar || !catalog || !toolbar) return;

  body.classList.add('ui-refresh-ready');

  function textCount(node) {
    if (!node) return '0';
    const match = String(node.textContent || '').match(/[\d,]+/);
    return match ? match[0] : '0';
  }

  function observeText(node, callback) {
    if (!node) return null;
    const observer = new MutationObserver(callback);
    observer.observe(node, { childList: true, characterData: true, subtree: true });
    return observer;
  }

  // ── Header search: reuse the real catalog search input, so all existing
  // filtering logic and event listeners remain intact.
  const search = $('#search');
  if (search && !$('.top-search-shell')) {
    const shell = document.createElement('label');
    shell.className = 'top-search-shell';
    shell.setAttribute('aria-label', '搜尋商品');

    const icon = document.createElement('span');
    icon.className = 'top-search-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⌕';

    const shortcut = document.createElement('kbd');
    shortcut.textContent = 'Ctrl K';

    shell.append(icon, search, shortcut);
    const meta = $('#meta');
    topbar.insertBefore(shell, meta || null);

    search.placeholder = '搜尋產品、型號、規格、品牌…（空格 = AND）';

    document.addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== 'k') return;
      event.preventDefault();
      search.focus();
      search.select();
    });
  }

  // ── Header utility buttons.
  if (!$('.topbar-tools')) {
    const tools = document.createElement('div');
    tools.className = 'topbar-tools';

    const buildButton = document.createElement('button');
    buildButton.type = 'button';
    buildButton.className = 'topbar-tool';
    buildButton.innerHTML = '<span class="tool-icon" aria-hidden="true">▣</span><span class="tool-label">目前配單</span><span class="tool-count" id="topBuildCount">0</span>';
    buildButton.addEventListener('click', () => buildPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' }));

    const savedButton = document.createElement('button');
    savedButton.type = 'button';
    savedButton.className = 'topbar-tool';
    savedButton.innerHTML = '<span class="tool-icon" aria-hidden="true">◇</span><span class="tool-label">暫存配單</span><span class="tool-count" id="topSavedCount">0</span>';
    savedButton.addEventListener('click', () => {
      const panel = $('#savedBuildsPanel');
      if (panel) panel.open = true;
      (panel || buildPanel)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    tools.append(buildButton, savedButton);

    const meta = $('#meta');
    if (meta) tools.append(meta);
    topbar.append(tools);

    const buildCount = $('#buildCount');
    const savedCount = $('#savedBuildCount');
    const syncCounts = () => {
      const topBuild = $('#topBuildCount');
      const topSaved = $('#topSavedCount');
      if (topBuild) topBuild.textContent = textCount(buildCount);
      if (topSaved) topSaved.textContent = textCount(savedCount);
    };
    syncCounts();
    observeText(buildCount, syncCounts);
    observeText(savedCount, syncCounts);
  }

  // ── Hero header.
  let countPill = null;
  let heroIcon = null;
  let subtitle = null;

  if (catalogHead && titleWrap && catalogTitle && !$('.catalog-hero-icon')) {
    heroIcon = document.createElement('div');
    heroIcon.className = 'catalog-hero-icon';
    heroIcon.setAttribute('aria-hidden', 'true');
    catalogHead.prepend(heroIcon);

    const titleLine = document.createElement('div');
    titleLine.className = 'catalog-title-line';
    catalogTitle.replaceWith(titleLine);
    titleLine.append(catalogTitle);

    countPill = document.createElement('span');
    countPill.className = 'catalog-count-pill';
    titleLine.append(countPill);

    subtitle = document.createElement('p');
    subtitle.className = 'catalog-subtitle';
    titleWrap.append(subtitle);
  } else {
    heroIcon = $('.catalog-hero-icon');
    countPill = $('.catalog-count-pill');
    subtitle = $('.catalog-subtitle');
  }

  const heroRules = [
    [/CPU|處理器/i, ['▦', '核心運算元件，依平台、用途與預算篩選合適型號。']],
    [/主機板|MB/i, ['▤', '依處理器平台、尺寸、擴充與儲存需求挑選主機板。']],
    [/記憶體|RAM/i, ['≡', '依容量、頻率與平台需求挑選記憶體。']],
    [/M\.2|SSD|固態/i, ['▰', '高速系統與資料儲存，依介面、容量與價格挑選。']],
    [/HDD|硬碟/i, ['◉', '大容量儲存，適合資料、備份與工作站儲存需求。']],
    [/VGA|顯示卡/i, ['◇', '依遊戲、創作、解析度與電源需求挑選顯示卡。']],
    [/散熱|水冷|風冷/i, ['✣', '依處理器功耗、機殼空間與噪音需求挑選散熱方案。']],
    [/CASE|機殼/i, ['▣', '依主機板尺寸、顯卡長度、散熱器與儲存空間挑選機殼。']],
    [/PSU|電源供應/i, ['ϟ', '依整機功耗、規範、效率與接頭需求挑選電源供應器。']],
    [/螢幕|顯示器/i, ['▭', '依解析度、更新率、尺寸與用途挑選顯示器。']]
  ];

  function syncHero() {
    const title = String(catalogTitle?.textContent || '').trim();
    const rule = heroRules.find(([pattern]) => pattern.test(title));
    if (heroIcon) heroIcon.textContent = rule?.[1]?.[0] || '◫';
    if (subtitle) subtitle.textContent = rule?.[1]?.[1] || '從目前分類篩選品牌、規格與價格，加入配單後再檢查相容性。';
    if (countPill) countPill.textContent = `${textCount(resultCount)} 項商品`;
  }

  syncHero();
  observeText(catalogTitle, syncHero);
  observeText(resultCount, syncHero);
  categorySelect?.addEventListener('change', () => queueMicrotask(syncHero));

  // ── Filter bar: compact the controls into the same structure as the mockup.
  if (!$('.price-range-group') && $('#minPrice') && $('#maxPrice')) {
    const priceGroup = document.createElement('div');
    priceGroup.className = 'price-range-group';
    priceGroup.append($('#minPrice'), $('#maxPrice'));

    const brand = $('#brandFilter');
    const sub = $('#subFilter');
    const sort = $('#sort');
    const compatible = $('.compat-toggle');
    const reset = $('#resetFilters');

    [brand, sub, priceGroup, sort, compatible, reset].forEach(control => {
      if (control) toolbar.append(control);
    });
  }

  // ── Result controls.
  const resultSummary = $('.result-summary');
  if (resultSummary && !$('.view-switch')) {
    const viewSwitch = document.createElement('div');
    viewSwitch.className = 'view-switch';
    viewSwitch.setAttribute('aria-label', '商品列表密度');

    const normal = document.createElement('button');
    normal.type = 'button';
    normal.textContent = '☷ 列表';

    const compact = document.createElement('button');
    compact.type = 'button';
    compact.textContent = '▤ 緊湊';

    let savedView = 'normal';
    try { savedView = localStorage.getItem('pc-build-planner-view-density') || 'normal'; } catch {}

    const applyView = view => {
      const isCompact = view === 'compact';
      body.classList.toggle('compact-catalog', isCompact);
      normal.classList.toggle('is-active', !isCompact);
      compact.classList.toggle('is-active', isCompact);
      normal.setAttribute('aria-pressed', String(!isCompact));
      compact.setAttribute('aria-pressed', String(isCompact));
      try { localStorage.setItem('pc-build-planner-view-density', isCompact ? 'compact' : 'normal'); } catch {}
    };

    normal.addEventListener('click', () => applyView('normal'));
    compact.addEventListener('click', () => applyView('compact'));
    viewSwitch.append(normal, compact);

    const backToTop = $('#backToCatalogTop');
    resultSummary.insertBefore(viewSwitch, backToTop || null);
    applyView(savedView);
  }

  // ── Table headings and brand tiles.
  const headers = $$('table thead th');
  ['品牌', '產品資訊', '規格 / 分類', '價格', '操作'].forEach((label, index) => {
    if (headers[index]) headers[index].textContent = label;
  });

  function brandInitials(label) {
    const cleaned = label.replace(/[^A-Za-z0-9\u4e00-\u9fff]+/g, ' ').trim();
    if (!cleaned) return 'PC';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const joined = parts.length > 1
      ? parts.slice(0, 2).map(part => part.slice(0, 1)).join('')
      : cleaned.slice(0, 2);
    return joined.toUpperCase();
  }

  function decorateRows() {
    if (!rows) return;
    $$('tr', rows).forEach(row => {
      const brandCell = $('td.brand', row);
      if (!brandCell || brandCell.dataset.uiDecorated === '1') return;

      const label = String(brandCell.textContent || '').trim() || '品牌';
      brandCell.dataset.uiDecorated = '1';
      brandCell.textContent = '';

      const wrap = document.createElement('div');
      wrap.className = 'product-brand-wrap';

      const mark = document.createElement('span');
      mark.className = 'product-brand-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = brandInitials(label);

      const text = document.createElement('span');
      text.className = 'product-brand-label';
      text.textContent = label;
      text.title = label;

      wrap.append(mark, text);
      brandCell.append(wrap);
    });
  }

  decorateRows();
  if (rows) {
    let rowDecorationQueued = false;
    const rowObserver = new MutationObserver(() => {
      if (rowDecorationQueued) return;
      rowDecorationQueued = true;
      requestAnimationFrame(() => {
        rowDecorationQueued = false;
        decorateRows();
      });
    });
    rowObserver.observe(rows, { childList: true, subtree: true });
  }

  // ── Upgrade the empty build state without touching build logic.
  const buildItems = $('#buildItems');
  function decorateBuildEmpty() {
    const empty = $('.build-empty', buildItems || document);
    if (!empty || empty.dataset.uiDecorated === '1') return;
    empty.dataset.uiDecorated = '1';

    const original = String(empty.textContent || '').trim();
    empty.textContent = '';

    const card = document.createElement('div');
    card.className = 'build-empty-card';

    const icon = document.createElement('div');
    icon.className = 'build-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '▱';

    const title = document.createElement('strong');
    title.textContent = original || '尚未選擇任何商品';

    const desc = document.createElement('span');
    desc.textContent = '從商品列表加入零件，這裡會即時整理目前配單。';

    const browse = document.createElement('button');
    browse.type = 'button';
    browse.textContent = '瀏覽目前分類 →';
    browse.addEventListener('click', () => {
      catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => $('#search')?.focus(), 280);
    });

    card.append(icon, title, desc, browse);
    empty.append(card);
  }

  decorateBuildEmpty();
  if (buildItems) {
    const buildObserver = new MutationObserver(() => queueMicrotask(decorateBuildEmpty));
    buildObserver.observe(buildItems, { childList: true, subtree: true });
  }
})();
