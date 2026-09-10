(() => {
  'use strict';

  const DATA = window.COOLPC_DATA || { meta: {}, products: [] };
  const products = Array.isArray(DATA.products) ? DATA.products : [];
  const categoryNames = DATA.meta.category_names || {};
  const categoryCounts = DATA.meta.category_counts || {};
  const categoryOrder = Array.isArray(DATA.meta.category_order) && DATA.meta.category_order.length
    ? DATA.meta.category_order.map(String)
    : [...new Set(products.map(p => String(p.category_id)))].sort((a, b) => Number(a) - Number(b));
  const money = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
  const $ = (s) => document.querySelector(s);
  const ACTIVE_CATEGORY_KEY = 'pc-build-planner-active-category';
  const SCROLL_POSITIONS_KEY = 'pc-build-planner-category-scroll-positions';
  const BUILD_KEY = 'pc-build-planner-build';
  const BUILD_SCHEMA_VERSION = 2;
  const MULTI_SELECT_CATEGORIES = new Set(['7', '8']);

  let activeCategory = loadActiveCategory();
  let scrollPositions = loadScrollPositions();
  let scrollSaveTimer = null;
  let build = loadBuild();

  function loadActiveCategory() {
    const fallback = categoryOrder.find(id => products.some(p => String(p.category_id) === id)) || categoryOrder[0] || '';
    try {
      const saved = localStorage.getItem(ACTIVE_CATEGORY_KEY);
      return saved && categoryOrder.includes(saved) ? saved : fallback;
    } catch {
      return fallback;
    }
  }

  function saveActiveCategory() {
    try { localStorage.setItem(ACTIVE_CATEGORY_KEY, activeCategory); } catch {}
  }

  function loadScrollPositions() {
    try {
      const saved = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY));
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  }

  function saveScrollPositions() {
    try { localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(scrollPositions)); } catch {}
  }

  function productKey(p) {
    if (p?.public_id) return `${p.category_id ?? ''}:${p.public_id}`;
    return `${p?.category_id ?? ''}:${p?.source_value ?? ''}:${p?.raw_text ?? ''}:${p?.name ?? ''}`;
  }

  function refreshProduct(savedProduct, categoryId) {
    if (!savedProduct || typeof savedProduct !== 'object' || Array.isArray(savedProduct)) return null;
    const id = String(savedProduct.category_id ?? categoryId ?? '');
    return products.find(p =>
      String(p.category_id) === id
      && (
            (savedProduct.public_id && p.public_id === savedProduct.public_id)
            || (savedProduct.source_value && p.source_value === savedProduct.source_value)
            || productKey(p) === productKey(savedProduct)
      )
    ) || savedProduct;
  }

  function normalizeEntry(rawEntry, categoryId) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
    const product = rawEntry.product && typeof rawEntry.product === 'object' && !Array.isArray(rawEntry.product)
      ? rawEntry.product
      : rawEntry;
    const refreshed = refreshProduct(product, categoryId);
    if (!refreshed) return null;
    const qtyRaw = rawEntry.product ? Number(rawEntry.qty) : 1;
    const qty = Number.isInteger(qtyRaw) && qtyRaw > 0 ? Math.min(qtyRaw, 999) : 1;
    return { product: refreshed, qty };
  }

  function normalizeBuild(rawBuild) {
    const normalized = {};
    if (!rawBuild || typeof rawBuild !== 'object' || Array.isArray(rawBuild)) return normalized;

    for (const [savedId, rawValue] of Object.entries(rawBuild)) {
      const id = String(savedId);
      if (!categoryOrder.includes(id)) continue;

      const rawEntries = Array.isArray(rawValue) ? rawValue : [rawValue];
      const entries = rawEntries.map(value => normalizeEntry(value, id)).filter(Boolean);
      if (!entries.length) continue;

      const multi = MULTI_SELECT_CATEGORIES.has(id);
      const merged = [];
      for (const entry of entries) {
        const key = productKey(entry.product);
        const existing = merged.find(item => productKey(item.product) === key);
        if (existing) {
          existing.qty = multi ? Math.min(999, existing.qty + entry.qty) : 1;
        } else {
          merged.push({ product: entry.product, qty: multi ? entry.qty : 1 });
        }
      }
      // For normal component categories, entry 0 is the active build choice and
      // later entries are comparison candidates. Storage categories remain true
      // multi-select parts where every entry contributes to the configured build.
      normalized[id] = merged;
    }
    return normalized;
  }

  function loadBuild() {
    try {
      const saved = JSON.parse(localStorage.getItem(BUILD_KEY)) || {};
      const normalized = normalizeBuild(saved);
      const serialized = JSON.stringify(normalized);
      if (serialized !== JSON.stringify(saved)) localStorage.setItem(BUILD_KEY, serialized);
      return normalized;
    } catch {
      return {};
    }
  }

  function saveBuild() {
    try { localStorage.setItem(BUILD_KEY, JSON.stringify(build)); } catch {}
  }

  function entriesForCategory(id) {
    const entries = build[String(id)];
    return Array.isArray(entries) ? entries : [];
  }

  function selectedProduct(id) {
    return entriesForCategory(id)[0]?.product || null;
  }

  function selectedQuantity(id, product) {
    const key = productKey(product);
    const entry = entriesForCategory(id).find(item => productKey(item.product) === key);
    return entry ? entry.qty : 0;
  }

  function isActiveProduct(id, product) {
    const categoryId = String(id);
    if (MULTI_SELECT_CATEGORIES.has(categoryId)) return selectedQuantity(categoryId, product) > 0;
    const active = selectedProduct(categoryId);
    return Boolean(active && productKey(active) === productKey(product));
  }

  function flattenedBuildEntries({ configuredOnly = false } = {}) {
    const rows = [];
    for (const id of categoryOrder) {
      const multi = MULTI_SELECT_CATEGORIES.has(id);
      entriesForCategory(id).forEach((entry, index) => {
        const candidate = !multi && index > 0;
        if (configuredOnly && candidate) return;
        rows.push({ id, product: entry.product, qty: multi ? entry.qty : 1, candidate, active: !candidate });
      });
    }
    return rows;
  }

  function addProduct(product) {
    const id = String(product?.category_id ?? '');
    if (!id) return;
    const entries = entriesForCategory(id);
    const key = productKey(product);
    const existing = entries.find(item => productKey(item.product) === key);

    if (!MULTI_SELECT_CATEGORIES.has(id)) {
      if (!existing) build[id] = [...entries, { product, qty: 1 }];
      return;
    }

    if (existing) existing.qty = Math.min(999, existing.qty + 1);
    else build[id] = [...entries, { product, qty: 1 }];
  }

  function setActiveProduct(id, key) {
    const categoryId = String(id);
    if (MULTI_SELECT_CATEGORIES.has(categoryId)) return;
    const entries = entriesForCategory(categoryId);
    const index = entries.findIndex(item => productKey(item.product) === key);
    if (index <= 0) return;
    build[categoryId] = [entries[index], ...entries.slice(0, index), ...entries.slice(index + 1)];
  }

  function removeProduct(id, key) {
    const categoryId = String(id);
    const entries = entriesForCategory(categoryId).filter(item => productKey(item.product) !== key);
    if (entries.length) build[categoryId] = entries;
    else delete build[categoryId];
  }

  function changeQuantity(id, key, delta) {
    const categoryId = String(id);
    if (!MULTI_SELECT_CATEGORIES.has(categoryId)) return;
    const entry = entriesForCategory(categoryId).find(item => productKey(item.product) === key);
    if (!entry) return;
    entry.qty = Math.max(1, Math.min(999, entry.qty + delta));
  }

  function norm(s) { return String(s ?? '').toLocaleLowerCase('zh-Hant'); }
  function categoryName(id) { return categoryNames[id] || `類別 ${id}`; }
  function categoryCount(id) {
    if (categoryCounts[id] != null) return Number(categoryCounts[id]);
    return products.filter(p => String(p.category_id) === id).length;
  }
  function specsOf(p) {
    return p && p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs) ? p.specs : {};
  }

  function hasKnownValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function hasKnownList(value) {
    return Array.isArray(value) && value.length > 0;
  }

  function compareEqual(result, active, left, right, leftLabel, rightLabel) {
    if (!active) return;
    result.checks += 1;
    if (!hasKnownValue(left) || !hasKnownValue(right)) {
      result.unknownReasons.push(`${leftLabel}/${rightLabel}相容性資料不足`);
      return;
    }
    if (left !== right) result.reasons.push(`${leftLabel} ${left} ≠ ${rightLabel} ${right}`);
  }

  function compareSocketList(result, active, socket, supported, itemLabel) {
    if (!active) return;
    result.checks += 1;
    if (!hasKnownValue(socket) || !hasKnownList(supported)) {
      result.unknownReasons.push(`${itemLabel}腳位支援資料不足`);
      return;
    }
    if (!supported.includes(socket)) result.reasons.push(`${itemLabel}未列支援 ${socket}`);
  }

  function compareNumberLimit(result, active, value, limit, itemLabel, limitLabel) {
    if (!active) return;
    result.checks += 1;
    const itemValue = Number(value);
    const limitValue = Number(limit);
    if (!Number.isFinite(itemValue) || !Number.isFinite(limitValue)) {
      result.unknownReasons.push(`${itemLabel}/${limitLabel}尺寸資料不足`);
      return;
    }
    if (itemValue > limitValue) result.reasons.push(`${itemLabel} ${value}mm > ${limitLabel} ${limit}mm`);
  }

  function compareSupportList(result, active, value, supported, itemLabel, valueLabel) {
    if (!active) return;
    result.checks += 1;
    if (!hasKnownValue(value) || !hasKnownList(supported)) {
      result.unknownReasons.push(`${itemLabel}${valueLabel}支援資料不足`);
      return;
    }
    if (!supported.includes(value)) result.reasons.push(`${itemLabel}未列支援 ${value} ${valueLabel}`);
  }

  function compareRadiatorSupport(result, active, size, supported) {
    if (!active) return;
    result.checks += 1;
    const radiatorSize = Number(size);
    if (!Number.isFinite(radiatorSize) || !hasKnownList(supported)) {
      result.unknownReasons.push('水冷/機殼冷排支援資料不足');
      return;
    }
    if (!supported.includes(radiatorSize)) result.reasons.push(`機殼未列支援 ${size}mm 冷排`);
  }

  function compatibilityFor(product) {
    const id = String(product?.category_id ?? '');
    const s = specsOf(product);
    const result = { checks: 0, reasons: [], unknownReasons: [] };

    const cpu = selectedProduct('4');
    const mb = selectedProduct('5');
    const ram = selectedProduct('6');
    const cooler = selectedProduct('10');
    const aio = selectedProduct('11');
    const gpu = selectedProduct('12');
    const pcCase = selectedProduct('14');

    const cpuSpecs = specsOf(cpu);
    const mbSpecs = specsOf(mb);
    const ramSpecs = specsOf(ram);
    const coolerSpecs = specsOf(cooler);
    const aioSpecs = specsOf(aio);
    const gpuSpecs = specsOf(gpu);
    const caseSpecs = specsOf(pcCase);

    if (id === '4') {
      compareEqual(result, Boolean(mb), s.socket, mbSpecs.socket, 'CPU', '主機板');
      compareSocketList(result, Boolean(cooler), s.socket, coolerSpecs.sockets, '塔散');
      compareSocketList(result, Boolean(aio), s.socket, aioSpecs.sockets, '水冷');
    }
    if (id === '5') {
      compareEqual(result, Boolean(cpu), s.socket, cpuSpecs.socket, '主機板', 'CPU');
      compareEqual(result, Boolean(ram), s.memory_type, ramSpecs.memory_type, '主機板', '記憶體');
      compareSupportList(result, Boolean(pcCase), s.form_factor, caseSpecs.motherboard_support, '機殼', '主機板');
    }
    if (id === '6') compareEqual(result, Boolean(mb), s.memory_type, mbSpecs.memory_type, '記憶體', '主機板');
    if (id === '10') {
      compareSocketList(result, Boolean(cpu), cpuSpecs.socket, s.sockets, '塔散');
      compareNumberLimit(result, Boolean(pcCase), s.cooler_height_mm, caseSpecs.max_cpu_cooler_height_mm, '塔散', '機殼限高');
    }
    if (id === '11') {
      compareSocketList(result, Boolean(cpu), cpuSpecs.socket, s.sockets, '水冷');
      compareRadiatorSupport(result, Boolean(pcCase), s.radiator_size_mm, caseSpecs.radiator_support_mm);
    }
    if (id === '12') {
      compareNumberLimit(result, Boolean(pcCase), s.length_mm, caseSpecs.max_gpu_length_mm, '顯卡', '機殼限長');
    }
    if (id === '14') {
      compareNumberLimit(result, Boolean(gpu), gpuSpecs.length_mm, s.max_gpu_length_mm, '顯卡', '機殼限長');
      compareSupportList(result, Boolean(mb), mbSpecs.form_factor, s.motherboard_support, '機殼', '主機板');
      compareNumberLimit(result, Boolean(cooler), coolerSpecs.cooler_height_mm, s.max_cpu_cooler_height_mm, '塔散', '機殼限高');
      compareRadiatorSupport(result, Boolean(aio), aioSpecs.radiator_size_mm, s.radiator_support_mm);
    }

    const state = result.reasons.length ? 'incompatible' : result.unknownReasons.length ? 'unknown' : 'compatible';
    return { ...result, state, compatible: state === 'compatible' };
  }

  function specLabels(product) {
    const id = String(product?.category_id ?? '');
    const s = specsOf(product);
    const labels = [];

    if (id === '4') {
      if (s.socket) labels.push(s.socket);
      if (s.cores) labels.push(`${s.cores}C${s.threads ? `${s.threads}T` : ''}`);
    } else if (id === '5') {
      if (s.chipset) labels.push(s.chipset);
      if (s.socket) labels.push(s.socket);
      if (s.form_factor) labels.push(s.form_factor);
      if (s.memory_type) labels.push(s.memory_type);
      if (s.wifi) labels.push('Wi-Fi');
      const storage = s.motherboard_storage;
      if (storage && storage.state === 'known') {
        if (Number.isInteger(storage.m2_slot_count) && storage.m2_slot_count >= 0) labels.push(`原廠 M.2 ×${storage.m2_slot_count}`);
        if (Number.isInteger(storage.sata_port_count) && storage.sata_port_count >= 0) labels.push(`原廠 SATA ×${storage.sata_port_count}`);
      }
    } else if (id === '6') {
      if (s.memory_type) labels.push(s.memory_type);
      if (s.capacity_gb) labels.push(`${s.capacity_gb}GB`);
      if (s.module_count && s.module_capacity_gb) labels.push(`${s.module_capacity_gb}GB×${s.module_count}`);
      if (s.speed_mts) labels.push(`${s.speed_mts} MT/s`);
      if (s.cl) labels.push(`CL${s.cl}`);
    } else if (id === '7') {
      const capacity = Number(s.capacity_gb);
      if (Number.isFinite(capacity) && capacity > 0) labels.push(capacity >= 1000 && capacity % 1000 === 0 ? `${capacity / 1000}TB` : `${capacity}GB`);
      if (s.storage_form_factor === '2.5-inch') labels.push('2.5吋');
      else if (s.storage_form_factor) labels.push(s.storage_form_factor);
      if (s.interface === 'PCIe' && s.pcie_generation) labels.push(`PCIe Gen${s.pcie_generation}`);
      else if (s.interface) labels.push(s.interface);
      if (s.m2_size) labels.push(`M.2 ${s.m2_size}`);
      if (s.nand_type) labels.push(s.nand_type);
      if (s.sequential_read_mbps) labels.push(`讀 ${s.sequential_read_mbps} MB/s`);
      if (s.sequential_write_mbps) labels.push(`寫 ${s.sequential_write_mbps} MB/s`);
      if (s.dram_cache) labels.push('DRAM');
    } else if (id === '8') {
      const capacity = Number(s.capacity_gb);
      const classes = { desktop: '傳統碟', surveillance: '監控', nas: 'NAS', enterprise: '企業', laptop: '筆電' };
      if (Number.isFinite(capacity) && capacity > 0) labels.push(capacity >= 1000 && capacity % 1000 === 0 ? `${capacity / 1000}TB` : `${capacity}GB`);
      if (s.storage_form_factor === '3.5-inch') labels.push('3.5吋');
      else if (s.storage_form_factor === '2.5-inch') labels.push('2.5吋');
      else if (s.storage_form_factor) labels.push(s.storage_form_factor);
      if (s.interface) labels.push(s.interface);
      if (s.drive_class) labels.push(classes[s.drive_class] || s.drive_class);
      if (s.rpm) labels.push(`${s.rpm} RPM`);
      if (s.cache_mb) labels.push(`${s.cache_mb}MB 快取`);
    } else if (id === '10') {
      if (s.cooler_height_mm) labels.push(`高 ${s.cooler_height_mm}mm`);
      if (s.fan_size_mm) labels.push(`${s.fan_size_mm}mm 扇`);
      if (Array.isArray(s.sockets) && s.sockets.length) labels.push(s.sockets.join('/'));
    } else if (id === '11') {
      if (s.radiator_size_mm) labels.push(`${s.radiator_size_mm}mm 冷排`);
      if (s.fan_count) labels.push(`${s.fan_count} 扇`);
      if (Array.isArray(s.sockets) && s.sockets.length) labels.push(s.sockets.join('/'));
    } else if (id === '12') {
      if (s.length_mm) labels.push(`長 ${s.length_mm}mm`);
    } else if (id === '14') {
      if (Array.isArray(s.motherboard_support) && s.motherboard_support.length) labels.push(`MB ${s.motherboard_support.join('/')}`);
      if (s.max_gpu_length_mm) labels.push(`GPU ≤ ${s.max_gpu_length_mm}mm`);
      if (s.max_cpu_cooler_height_mm) labels.push(`塔散 ≤ ${s.max_cpu_cooler_height_mm}mm`);
      if (Array.isArray(s.radiator_support_mm) && s.radiator_support_mm.length) labels.push(`水冷 ${[...s.radiator_support_mm].sort((a, b) => b - a).join('/')}`);
      if (s.front_usb_c_pd_w) labels.push(`Type-C PD ${s.front_usb_c_pd_w}W`);
      else if (s.front_usb_c) labels.push('Type-C');
      if (s.included_fans) labels.push(`內建 ${s.included_fans} 扇`);
      if (s.max_fans) labels.push(`最多 ${s.max_fans} 扇`);
    } else if (id === '15') {
      const efficiency = { bronze: '銅牌', silver: '銀牌', gold: '金牌', platinum: '白金', titanium: '鈦金' };
      const modularity = { full: '全模組', semi: '半模組', non: '直出線' };
      if (s.wattage_w) labels.push(`${s.wattage_w}W`);
      if (s.efficiency_tier) labels.push(efficiency[s.efficiency_tier] || s.efficiency_tier);
      if (s.modularity) labels.push(modularity[s.modularity] || s.modularity);
      if (s.atx_version) labels.push(`ATX ${s.atx_version}`);
      if (s.pcie_power_version) labels.push(`PCIe ${s.pcie_power_version}`);
      if (s.psu_form_factor) labels.push(s.psu_form_factor);
      if (s.requires_220v) labels.push('限 220V');
    }
    return labels;
  }

  function renderSpecChips(product) {
    const labels = specLabels(product);
    if (!labels.length) return '';
    return `<div class="spec-chips">${labels.map(label => `<span class="spec-chip">${escapeHtml(label)}</span>`).join('')}</div>`;
  }

  function tableWrapUsesOwnScroll() {
    const el = $('.table-wrap');
    return Boolean(el && el.scrollHeight > el.clientHeight + 1);
  }

  function getCurrentCatalogScroll() {
    const el = $('.table-wrap');
    if (!el) return 0;
    if (tableWrapUsesOwnScroll()) return Math.max(0, el.scrollTop);
    const tableTop = window.scrollY + el.getBoundingClientRect().top;
    return Math.max(0, window.scrollY - tableTop);
  }

  function saveActiveScrollPosition() {
    if (!activeCategory) return;
    scrollPositions[activeCategory] = Math.round(getCurrentCatalogScroll());
    saveScrollPositions();
  }

  function queueScrollPositionSave() {
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(saveActiveScrollPosition, 120);
  }

  function restoreCategoryScroll(id, { initial = false } = {}) {
    const el = $('.table-wrap');
    if (!el) return;
    const saved = Number(scrollPositions[id]);
    const position = Number.isFinite(saved) && saved > 0 ? saved : 0;
    requestAnimationFrame(() => {
      if (tableWrapUsesOwnScroll()) {
        el.scrollTop = position;
        return;
      }
      if (initial && position === 0) return;
      const tableTop = window.scrollY + el.getBoundingClientRect().top;
      window.scrollTo({ top: tableTop + position, behavior: 'auto' });
    });
  }

  function renderMeta() {
    const m = DATA.meta || {};
    $('#meta').textContent = products.length ? `${products.length.toLocaleString()} 項 · 更新 ${m.scraped_at || '未知'}` : '目前沒有商品資料。';
    const compatToggle = $('.compat-toggle');
    if (compatToggle) compatToggle.hidden = Number(m.specs_version || 0) < 1;
  }

  function setActiveCategory(id) {
    const nextCategory = String(id);
    if (!categoryOrder.includes(nextCategory) || nextCategory === activeCategory) return;
    saveActiveScrollPosition();
    activeCategory = nextCategory;
    saveActiveCategory();
    clearFilterValues(false);
    renderAll();
    restoreCategoryScroll(activeCategory);
  }

  function renderCategories() {
    const host = $('#categories');
    $('#categoryTotal').textContent = `共 ${categoryOrder.length} 類`;
    host.innerHTML = categoryOrder.map(id => {
      const active = id === activeCategory;
      return `<button class="category-item${active ? ' active' : ''}" data-category="${escapeAttr(id)}" type="button" title="${escapeAttr(categoryName(id))}">
        <span class="category-index">${escapeHtml(id)}</span>
        <span class="category-label">${escapeHtml(categoryName(id))}</span>
        <span class="category-count">${categoryCount(id).toLocaleString()}</span>
      </button>`;
    }).join('');
    host.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => setActiveCategory(button.dataset.category)));
    const select = $('#categorySelect');
    select.innerHTML = categoryOrder.map(id => `<option value="${escapeAttr(id)}">${escapeHtml(`${id} ${categoryName(id)} (${categoryCount(id).toLocaleString()})`)}</option>`).join('');
    select.value = activeCategory;
  }

  function renderCatalogHeader() {
    const name = categoryName(activeCategory);
    $('#activeCategoryName').textContent = name;
    $('#catalogTitle').textContent = name;
  }

  function optionsFor(field) {
    return [...new Set(products.filter(p => String(p.category_id) === activeCategory).map(p => p[field]).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
  }

  function fillSelect(selector, field, label) {
    const el = $(selector);
    const current = el.value;
    el.innerHTML = `<option value="">全部${label}</option>` + optionsFor(field).map(v => `<option>${escapeHtml(v)}</option>`).join('');
    if ([...el.options].some(o => o.value === current)) el.value = current;
  }

  function selectedKeysForCategory(id) {
    return new Set(entriesForCategory(id).map(entry => productKey(entry.product)));
  }

  function filtered() {
    const q = norm($('#search').value).trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    const min = Number($('#minPrice').value || 0);
    const max = Number($('#maxPrice').value || 0);
    const brand = $('#brandFilter').value;
    const sub = $('#subFilter').value;
    const compatibleOnly = Boolean($('#compatibleOnly')?.checked);
    const selectedKeys = selectedKeysForCategory(activeCategory);

    let list = products.filter(p => String(p.category_id) === activeCategory);
    list = list.filter(p => {
      const hay = norm(`${p.brand} ${p.name} ${p.subcategory} ${p.raw_text || ''} ${JSON.stringify(specsOf(p))}`);
      return tokens.every(t => hay.includes(t))
        && (!min || p.price >= min)
        && (!max || p.price <= max)
        && (!brand || p.brand === brand)
        && (!sub || p.subcategory === sub);
    });
    if (compatibleOnly) list = list.filter(p => compatibilityFor(p).state === 'compatible' || selectedKeys.has(productKey(p)));

    switch ($('#sort').value) {
      case 'price-asc': list.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, 'zh-Hant')); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'zh-Hant')); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')); break;
    }
    return list;
  }

  function renderRows() {
    const list = filtered();
    $('#resultCount').textContent = `${list.length.toLocaleString()} 項`;
    $('#empty').hidden = list.length !== 0;
    const multi = MULTI_SELECT_CATEGORIES.has(activeCategory);

    $('#rows').innerHTML = list.map(p => {
      const qty = selectedQuantity(activeCategory, p);
      const selected = qty > 0;
      const active = selected && isActiveProduct(activeCategory, p);
      const compatibility = compatibilityFor(p);
      const conflict = compatibility.state === 'incompatible';
      const unknown = compatibility.state === 'unknown';
      const classes = [selected ? 'selected' : '', active && !multi ? 'active-choice' : '', selected && !active ? 'candidate-choice' : '', conflict ? 'incompatible' : '', unknown ? 'compat-unknown' : ''].filter(Boolean).join(' ');
      const compatibilityBadge = conflict
        ? `<span class="compat-badge" title="${escapeAttr(compatibility.reasons.join('；'))}">不相容</span>`
        : unknown
          ? `<span class="compat-unknown-badge" title="${escapeAttr(compatibility.unknownReasons.join('；'))}">資料不足</span>`
          : '';
      const buttonText = multi
        ? (selected ? `+1 · 已選 ×${qty}` : '+ 加入')
        : (active ? '★ 目前使用' : selected ? '設為主選' : '+ 加入候選');
      return `<tr class="${classes}" data-key="${escapeAttr(productKey(p))}">
        <td class="brand">${escapeHtml(p.brand || '—')}</td>
        <td class="name">
          <div class="name-line"><strong>${escapeHtml(p.name)}</strong>${compatibilityBadge}</div>
          ${renderSpecChips(p)}
          ${p.raw_text ? `<div class="raw">${escapeHtml(p.raw_text)}</div>` : ''}
        </td>
        <td class="sub">${escapeHtml(p.subcategory || '其他')}</td>
        <td class="price">${money.format(p.price)}</td>
        <td><button class="row-add${selected ? ' is-selected' : ''}${active && !multi ? ' is-active' : ''}" type="button" aria-pressed="${selected ? 'true' : 'false'}">${escapeHtml(buttonText)}</button></td>
      </tr>`;
    }).join('');

    $('#rows').querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const p = list.find(x => productKey(x) === row.dataset.key);
        if (!p) return;
        const multi = MULTI_SELECT_CATEGORIES.has(activeCategory);
        if (!multi && selectedQuantity(activeCategory, p) > 0) setActiveProduct(activeCategory, productKey(p));
        else addProduct(p);
        saveBuild();
        renderRows();
        renderBuild();
      });
    });
  }

  function renderBuild() {
    const entries = flattenedBuildEntries();
    const configuredEntries = flattenedBuildEntries({ configuredOnly: true });
    const unitCount = configuredEntries.reduce((sum, entry) => sum + entry.qty, 0);
    const candidateCount = entries.length - configuredEntries.length;
    $('#buildCount').textContent = `(${entries.length})`;
    const configuredLabel = configuredEntries.length === unitCount ? `${unitCount} 項` : `${configuredEntries.length} 項 · ${unitCount} 件`;
    $('#totalItems').textContent = candidateCount ? `${configuredLabel} · ${candidateCount} 候選` : configuredLabel;

    $('#buildItems').innerHTML = entries.length ? entries.map(({ id, product: p, qty, candidate, active }) => {
      const key = productKey(p);
      const compatibility = compatibilityFor(p);
      const conflict = compatibility.state === 'incompatible';
      const unknown = compatibility.state === 'unknown';
      const multi = MULTI_SELECT_CATEGORIES.has(id);
      const lineTotal = Number(p.price || 0) * qty;
      const title = conflict
        ? `切到 ${categoryName(id)}｜衝突：${compatibility.reasons.join('；')}`
        : unknown
          ? `切到 ${categoryName(id)}｜相容性資料不足：${compatibility.unknownReasons.join('；')}`
          : `切到 ${categoryName(id)}`;
      const selectionBadge = multi
        ? '<em class="build-multi-badge">可多選</em>'
        : active
          ? '<em class="build-multi-badge">目前主選</em>'
          : '<em class="build-multi-badge">候選</em>';
      return `
      <div class="build-item${candidate ? ' is-candidate' : ''}${conflict ? ' has-conflict' : ''}${unknown ? ' has-compat-unknown' : ''}" data-jump-category="${escapeAttr(id)}" role="button" tabindex="0" title="${escapeAttr(title)}">
        <div class="build-item-top">
          <div class="build-copy">
            <div class="build-cat">
              <span>${escapeHtml(id)}</span>${escapeHtml(categoryName(id))}
              ${selectionBadge}
              ${conflict ? '<em class="build-conflict">衝突</em>' : ''}
              ${unknown ? '<em class="build-compat-unknown">資料不足</em>' : ''}
            </div>
            <div class="build-name">${escapeHtml(p.name)}</div>
            ${multi ? `<div class="build-qty" aria-label="數量">
              <button type="button" data-qty-action="minus" data-build-category="${escapeAttr(id)}" data-build-key="${escapeAttr(key)}" ${qty <= 1 ? 'disabled' : ''} aria-label="減少數量">−</button>
              <span>×${qty}</span>
              <button type="button" data-qty-action="plus" data-build-category="${escapeAttr(id)}" data-build-key="${escapeAttr(key)}" aria-label="增加數量">+</button>
            </div>` : candidate ? `<button class="ghost build-set-active" type="button" data-set-active-category="${escapeAttr(id)}" data-set-active-key="${escapeAttr(key)}">設為主選</button>` : ''}
          </div>
          <div class="build-side">
            <div class="build-price">${money.format(lineTotal)}</div>
            <button class="remove" data-remove-category="${escapeAttr(id)}" data-remove-key="${escapeAttr(key)}" type="button" title="移除">×</button>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="empty build-empty">尚未選擇商品。</div>';

    const total = configuredEntries.reduce((sum, entry) => sum + Number(entry.product.price || 0) * entry.qty, 0);
    $('#totalPrice').textContent = money.format(total);

    document.querySelectorAll('[data-remove-key]').forEach(button => {
      button.onclick = (event) => {
        event.stopPropagation();
        removeProduct(button.dataset.removeCategory, button.dataset.removeKey);
        saveBuild();
        renderRows();
        renderBuild();
      };
    });

    document.querySelectorAll('[data-set-active-key]').forEach(button => {
      button.onclick = (event) => {
        event.stopPropagation();
        setActiveProduct(button.dataset.setActiveCategory, button.dataset.setActiveKey);
        saveBuild();
        renderRows();
        renderBuild();
      };
    });

    document.querySelectorAll('[data-qty-action]').forEach(button => {
      button.onclick = (event) => {
        event.stopPropagation();
        const delta = button.dataset.qtyAction === 'plus' ? 1 : -1;
        changeQuantity(button.dataset.buildCategory, button.dataset.buildKey, delta);
        saveBuild();
        renderRows();
        renderBuild();
      };
    });

    document.querySelectorAll('[data-jump-category]').forEach(item => {
      const jump = () => setActiveCategory(item.dataset.jumpCategory);
      item.addEventListener('click', event => {
        if (event.target.closest('[data-remove-key], [data-qty-action], [data-set-active-key]')) return;
        jump();
      });
      item.addEventListener('keydown', event => {
        if (event.target.closest('[data-remove-key], [data-qty-action], [data-set-active-key]')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        jump();
      });
    });
  }

  function clearFilterValues(includeSearch = true) {
    if (includeSearch) $('#search').value = '';
    $('#minPrice').value = '';
    $('#maxPrice').value = '';
    $('#brandFilter').value = '';
    $('#subFilter').value = '';
    $('#sort').value = 'source';
  }

  function renderAll() {
    renderCategories();
    renderCatalogHeader();
    fillSelect('#brandFilter', 'brand', '品牌');
    fillSelect('#subFilter', 'subcategory', '子分類');
    renderRows();
    renderBuild();
  }

  function exportBuildPayload() {
    const categories = {};
    for (const id of categoryOrder) {
      const entries = entriesForCategory(id);
      if (!entries.length) continue;
      categories[id] = entries.map(entry => ({ qty: entry.qty, product: entry.product }));
    }
    return {
      schema_version: BUILD_SCHEMA_VERSION,
      selection_model: 'active-first-candidates',
      multi_select_categories: [...MULTI_SELECT_CATEGORIES],
      exported_at: new Date().toISOString(),
      build: categories,
    };
  }

  function buildText() {
    const lines = ['PC Build Planner 配單'];
    let total = 0;
    for (const { id, product: p, qty, candidate } of flattenedBuildEntries()) {
      const lineTotal = Number(p.price || 0) * qty;
      if (!candidate) total += lineTotal;
      const qtyText = qty > 1 ? ` ×${qty}` : '';
      const candidateText = candidate ? '（候選）' : '';
      lines.push(`${id} ${categoryName(id)}${candidateText}: ${p.name}${qtyText} — ${money.format(lineTotal)}`);
    }
    lines.push(`合計：${money.format(total)}`);
    return lines.join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(exportBuildPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pc-build-planner-build.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  ['#search', '#minPrice', '#maxPrice'].forEach(s => $(s).addEventListener('input', renderRows));
  ['#brandFilter', '#subFilter', '#sort'].forEach(s => $(s).addEventListener('change', renderRows));
  $('#categorySelect').addEventListener('change', e => setActiveCategory(e.target.value));
  $('#compatibleOnly')?.addEventListener('change', renderRows);
  $('.table-wrap').addEventListener('scroll', queueScrollPositionSave, { passive: true });
  window.addEventListener('scroll', queueScrollPositionSave, { passive: true });
  window.addEventListener('beforeunload', saveActiveScrollPosition);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveActiveScrollPosition(); });
  $('#resetFilters').onclick = () => { clearFilterValues(true); renderRows(); };
  $('#clearBuild').onclick = () => { build = {}; saveBuild(); renderRows(); renderBuild(); };
  $('#copyBuild').onclick = async () => {
    await copyText(buildText());
    $('#copyBuild').textContent = '已複製';
    setTimeout(() => { $('#copyBuild').textContent = '複製文字'; }, 900);
  };
  $('#exportBuild').onclick = exportJson;

  window.COOLPC_BUILD_V2 = Object.freeze({
    schemaVersion: BUILD_SCHEMA_VERSION,
    multiSelectCategories: [...MULTI_SELECT_CATEGORIES],
    candidateSelection: 'active-first',
    compatibility: 'tri-state-strict',
  });

  renderMeta();
  renderAll();
  restoreCategoryScroll(activeCategory, { initial: true });
})();
