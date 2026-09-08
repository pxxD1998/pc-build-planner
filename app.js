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
    try {
      localStorage.setItem(ACTIVE_CATEGORY_KEY, activeCategory);
    } catch {}
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
    try {
      localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(scrollPositions));
    } catch {}
  }

  function productKey(p) {
    if (p?.public_id) return `${p.category_id ?? ''}:${p.public_id}`;
    return `${p?.category_id ?? ''}:${p?.source_value ?? ''}:${p?.raw_text ?? ''}:${p?.name ?? ''}`;
  }

  function loadBuild() {
    try {
      const saved = JSON.parse(localStorage.getItem('pc-build-planner-build')) || {};
      const refreshed = {};

      for (const [savedId, savedProduct] of Object.entries(saved)) {
        if (!savedProduct || typeof savedProduct !== 'object') continue;
        const id = String(savedProduct.category_id ?? savedId);
        const current = products.find(p =>
          String(p.category_id) === id
          && (
            (savedProduct.public_id && p.public_id === savedProduct.public_id)
            || (savedProduct.source_value && p.source_value === savedProduct.source_value)
            || productKey(p) === productKey(savedProduct)
          )
        );
        refreshed[id] = current || savedProduct;
      }
      return refreshed;
    } catch {
      return {};
    }
  }

  function saveBuild() {
    try {
      localStorage.setItem('pc-build-planner-build', JSON.stringify(build));
    } catch {}
  }

  function norm(s) {
    return String(s ?? '').toLocaleLowerCase('zh-Hant');
  }

  function categoryName(id) {
    return categoryNames[id] || `類別 ${id}`;
  }

  function categoryCount(id) {
    if (categoryCounts[id] != null) return Number(categoryCounts[id]);
    return products.filter(p => String(p.category_id) === id).length;
  }

  function specsOf(p) {
    return p && p.specs && typeof p.specs === 'object' && !Array.isArray(p.specs)
      ? p.specs
      : {};
  }

  function compareEqual(reasons, left, right, leftLabel, rightLabel) {
    if (left && right && left !== right) {
      reasons.push(`${leftLabel} ${left} ≠ ${rightLabel} ${right}`);
    }
  }

  function compareSocketList(reasons, socket, supported, itemLabel) {
    if (!socket || !Array.isArray(supported) || !supported.length) return;
    if (!supported.includes(socket)) {
      reasons.push(`${itemLabel}未列支援 ${socket}`);
    }
  }

  function compatibilityFor(product) {
    const id = String(product?.category_id ?? '');
    const s = specsOf(product);
    const reasons = [];

    const cpu = build['4'];
    const mb = build['5'];
    const ram = build['6'];
    const cooler = build['10'];
    const aio = build['11'];
    const gpu = build['12'];
    const pcCase = build['14'];

    const cpuSpecs = specsOf(cpu);
    const mbSpecs = specsOf(mb);
    const ramSpecs = specsOf(ram);
    const coolerSpecs = specsOf(cooler);
    const aioSpecs = specsOf(aio);
    const gpuSpecs = specsOf(gpu);
    const caseSpecs = specsOf(pcCase);

    if (id === '4') {
      compareEqual(reasons, s.socket, mbSpecs.socket, 'CPU', '主機板');
      compareSocketList(reasons, s.socket, coolerSpecs.sockets, '塔散');
      compareSocketList(reasons, s.socket, aioSpecs.sockets, '水冷');
    }

    if (id === '5') {
      compareEqual(reasons, s.socket, cpuSpecs.socket, '主機板', 'CPU');
      compareEqual(reasons, s.memory_type, ramSpecs.memory_type, '主機板', '記憶體');

      if (
        s.form_factor
        && Array.isArray(caseSpecs.motherboard_support)
        && caseSpecs.motherboard_support.length
        && !caseSpecs.motherboard_support.includes(s.form_factor)
      ) {
        reasons.push(`機殼未列支援 ${s.form_factor} 主機板`);
      }
    }

    if (id === '6') {
      compareEqual(reasons, s.memory_type, mbSpecs.memory_type, '記憶體', '主機板');
    }

    if (id === '10') {
      compareSocketList(reasons, cpuSpecs.socket, s.sockets, '塔散');
      if (
        Number.isFinite(Number(s.cooler_height_mm))
        && Number.isFinite(Number(caseSpecs.max_cpu_cooler_height_mm))
        && Number(s.cooler_height_mm) > Number(caseSpecs.max_cpu_cooler_height_mm)
      ) {
        reasons.push(`塔散 ${s.cooler_height_mm}mm > 機殼限高 ${caseSpecs.max_cpu_cooler_height_mm}mm`);
      }
    }

    if (id === '11') {
      compareSocketList(reasons, cpuSpecs.socket, s.sockets, '水冷');
      if (
        s.radiator_size_mm
        && Array.isArray(caseSpecs.radiator_support_mm)
        && caseSpecs.radiator_support_mm.length
        && !caseSpecs.radiator_support_mm.includes(Number(s.radiator_size_mm))
      ) {
        reasons.push(`機殼未列支援 ${s.radiator_size_mm}mm 冷排`);
      }
    }

    if (id === '12') {
      if (
        Number.isFinite(Number(s.length_mm))
        && Number.isFinite(Number(caseSpecs.max_gpu_length_mm))
        && Number(s.length_mm) > Number(caseSpecs.max_gpu_length_mm)
      ) {
        reasons.push(`顯卡 ${s.length_mm}mm > 機殼限長 ${caseSpecs.max_gpu_length_mm}mm`);
      }
    }

    if (id === '14') {
      if (
        Number.isFinite(Number(gpuSpecs.length_mm))
        && Number.isFinite(Number(s.max_gpu_length_mm))
        && Number(gpuSpecs.length_mm) > Number(s.max_gpu_length_mm)
      ) {
        reasons.push(`顯卡 ${gpuSpecs.length_mm}mm > 機殼限長 ${s.max_gpu_length_mm}mm`);
      }

      if (
        mbSpecs.form_factor
        && Array.isArray(s.motherboard_support)
        && s.motherboard_support.length
        && !s.motherboard_support.includes(mbSpecs.form_factor)
      ) {
        reasons.push(`機殼未列支援 ${mbSpecs.form_factor} 主機板`);
      }

      if (
        Number.isFinite(Number(coolerSpecs.cooler_height_mm))
        && Number.isFinite(Number(s.max_cpu_cooler_height_mm))
        && Number(coolerSpecs.cooler_height_mm) > Number(s.max_cpu_cooler_height_mm)
      ) {
        reasons.push(`塔散 ${coolerSpecs.cooler_height_mm}mm > 機殼限高 ${s.max_cpu_cooler_height_mm}mm`);
      }

      if (
        aioSpecs.radiator_size_mm
        && Array.isArray(s.radiator_support_mm)
        && s.radiator_support_mm.length
        && !s.radiator_support_mm.includes(Number(aioSpecs.radiator_size_mm))
      ) {
        reasons.push(`機殼未列支援 ${aioSpecs.radiator_size_mm}mm 冷排`);
      }
    }

    return { compatible: reasons.length === 0, reasons };
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
    } else if (id === '6') {
      if (s.memory_type) labels.push(s.memory_type);
      if (s.capacity_gb) labels.push(`${s.capacity_gb}GB`);
      if (s.module_count && s.module_capacity_gb) labels.push(`${s.module_capacity_gb}GB×${s.module_count}`);
      if (s.speed_mts) labels.push(`${s.speed_mts} MT/s`);
      if (s.cl) labels.push(`CL${s.cl}`);
    } else if (id === '7') {
      const capacity = Number(s.capacity_gb);
      if (Number.isFinite(capacity) && capacity > 0) {
        labels.push(capacity >= 1000 && capacity % 1000 === 0 ? `${capacity / 1000}TB` : `${capacity}GB`);
      }
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
      const driveClassLabels = {
        desktop: '傳統碟',
        surveillance: '監控',
        nas: 'NAS',
        enterprise: '企業',
        laptop: '筆電',
      };
      if (Number.isFinite(capacity) && capacity > 0) {
        labels.push(capacity >= 1000 && capacity % 1000 === 0 ? `${capacity / 1000}TB` : `${capacity}GB`);
      }
      if (s.storage_form_factor === '3.5-inch') labels.push('3.5吋');
      else if (s.storage_form_factor === '2.5-inch') labels.push('2.5吋');
      else if (s.storage_form_factor) labels.push(s.storage_form_factor);
      if (s.interface) labels.push(s.interface);
      if (s.drive_class) labels.push(driveClassLabels[s.drive_class] || s.drive_class);
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
      if (Array.isArray(s.motherboard_support) && s.motherboard_support.length) {
        labels.push(`MB ${s.motherboard_support.join('/')}`);
      }
      if (s.max_gpu_length_mm) labels.push(`GPU ≤ ${s.max_gpu_length_mm}mm`);
      if (s.max_cpu_cooler_height_mm) labels.push(`塔散 ≤ ${s.max_cpu_cooler_height_mm}mm`);
      if (Array.isArray(s.radiator_support_mm) && s.radiator_support_mm.length) {
        labels.push(`水冷 ${[...s.radiator_support_mm].sort((a, b) => b - a).join('/')}`);
      }
      if (s.front_usb_c_pd_w) labels.push(`Type-C PD ${s.front_usb_c_pd_w}W`);
      else if (s.front_usb_c) labels.push('Type-C');
      if (s.included_fans) labels.push(`內建 ${s.included_fans} 扇`);
      if (s.max_fans) labels.push(`最多 ${s.max_fans} 扇`);
    } else if (id === '15') {
      const efficiencyLabels = {
        bronze: '銅牌',
        silver: '銀牌',
        gold: '金牌',
        platinum: '白金',
        titanium: '鈦金',
      };
      const modularityLabels = {
        full: '全模組',
        semi: '半模組',
        non: '直出線',
      };
      if (s.wattage_w) labels.push(`${s.wattage_w}W`);
      if (s.efficiency_tier) labels.push(efficiencyLabels[s.efficiency_tier] || s.efficiency_tier);
      if (s.modularity) labels.push(modularityLabels[s.modularity] || s.modularity);
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
    return `<div class="spec-chips">${labels.map(label =>
      `<span class="spec-chip">${escapeHtml(label)}</span>`
    ).join('')}</div>`;
  }

  function tableWrapUsesOwnScroll() {
    const el = $('.table-wrap');
    return Boolean(el && el.scrollHeight > el.clientHeight + 1);
  }

  function getCurrentCatalogScroll() {
    const el = $('.table-wrap');
    if (!el) return 0;

    if (tableWrapUsesOwnScroll()) {
      return Math.max(0, el.scrollTop);
    }

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
    $('#meta').textContent = products.length
      ? `${products.length.toLocaleString()} 項 · 更新 ${m.scraped_at || '未知'}`
      : '目前沒有商品資料。';

    const compatToggle = $('.compat-toggle');
    if (compatToggle) {
      compatToggle.hidden = Number(m.specs_version || 0) < 1;
    }
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

    host.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', () => setActiveCategory(button.dataset.category));
    });

    const select = $('#categorySelect');
    select.innerHTML = categoryOrder.map(id =>
      `<option value="${escapeAttr(id)}">${escapeHtml(`${id} ${categoryName(id)} (${categoryCount(id).toLocaleString()})`)}</option>`
    ).join('');
    select.value = activeCategory;
  }

  function renderCatalogHeader() {
    const name = categoryName(activeCategory);
    $('#activeCategoryName').textContent = name;
    $('#catalogTitle').textContent = name;
  }

  function optionsFor(field) {
    return [...new Set(products
      .filter(p => String(p.category_id) === activeCategory)
      .map(p => p[field])
      .filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
  }

  function fillSelect(selector, field, label) {
    const el = $(selector);
    const current = el.value;
    el.innerHTML = `<option value="">全部${label}</option>` + optionsFor(field)
      .map(v => `<option>${escapeHtml(v)}</option>`)
      .join('');
    if ([...el.options].some(o => o.value === current)) el.value = current;
  }

  function filtered() {
    const q = norm($('#search').value).trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    const min = Number($('#minPrice').value || 0);
    const max = Number($('#maxPrice').value || 0);
    const brand = $('#brandFilter').value;
    const sub = $('#subFilter').value;
    const compatibleOnly = Boolean($('#compatibleOnly')?.checked);
    const selectedKey = build[activeCategory] ? productKey(build[activeCategory]) : '';

    let list = products.filter(p => String(p.category_id) === activeCategory);
    list = list.filter(p => {
      const hay = norm(`${p.brand} ${p.name} ${p.subcategory} ${p.raw_text || ''} ${JSON.stringify(specsOf(p))}`);
      return tokens.every(t => hay.includes(t))
        && (!min || p.price >= min)
        && (!max || p.price <= max)
        && (!brand || p.brand === brand)
        && (!sub || p.subcategory === sub);
    });

    if (compatibleOnly) {
      list = list.filter(p => compatibilityFor(p).compatible || productKey(p) === selectedKey);
    }

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
    const selectedKey = build[activeCategory] ? productKey(build[activeCategory]) : '';

    $('#rows').innerHTML = list.map(p => {
      const selected = productKey(p) === selectedKey;
      const compatibility = compatibilityFor(p);
      const conflict = !compatibility.compatible;
      const classes = [selected ? 'selected' : '', conflict ? 'incompatible' : ''].filter(Boolean).join(' ');
      const conflictBadge = conflict
        ? `<span class="compat-badge" title="${escapeAttr(compatibility.reasons.join('；'))}">不相容</span>`
        : '';

      return `<tr class="${classes}" data-key="${escapeAttr(productKey(p))}">
        <td class="brand">${escapeHtml(p.brand || '—')}</td>
        <td class="name">
          <div class="name-line"><strong>${escapeHtml(p.name)}</strong>${conflictBadge}</div>
          ${renderSpecChips(p)}
          ${p.raw_text ? `<div class="raw">${escapeHtml(p.raw_text)}</div>` : ''}
        </td>
        <td class="sub">${escapeHtml(p.subcategory || '其他')}</td>
        <td class="price">${money.format(p.price)}</td>
        <td><button class="row-add${selected ? ' is-selected' : ''}" type="button" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓ 已選' : '選擇'}</button></td>
      </tr>`;
    }).join('');

    $('#rows').querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const p = list.find(x => productKey(x) === row.dataset.key);
        if (!p) return;
        build[String(p.category_id)] = p;
        saveBuild();
        renderRows();
        renderBuild();
      });
    });
  }

  function renderBuild() {
    const entries = categoryOrder.map(id => [id, build[id]]).filter(([, p]) => p);
    $('#buildCount').textContent = `(${entries.length})`;
    $('#totalItems').textContent = `${entries.length} 項`;

    $('#buildItems').innerHTML = entries.length ? entries.map(([id, p]) => {
      const compatibility = compatibilityFor(p);
      const conflict = !compatibility.compatible;
      const title = conflict
        ? `切到 ${categoryName(id)}｜衝突：${compatibility.reasons.join('；')}`
        : `切到 ${categoryName(id)}`;

      return `
      <div class="build-item${conflict ? ' has-conflict' : ''}" data-jump-category="${escapeAttr(id)}" role="button" tabindex="0" title="${escapeAttr(title)}">
        <div class="build-item-top">
          <div class="build-copy">
            <div class="build-cat">
              <span>${escapeHtml(id)}</span>${escapeHtml(categoryName(id))}
              ${conflict ? '<em class="build-conflict">衝突</em>' : ''}
            </div>
            <div class="build-name">${escapeHtml(p.name)}</div>
          </div>
          <div class="build-side">
            <div class="build-price">${money.format(p.price)}</div>
            <button class="remove" data-remove="${escapeAttr(id)}" type="button" title="移除">×</button>
          </div>
        </div>
      </div>`;
    }).join('') : '<div class="empty build-empty">尚未選擇商品。</div>';

    const total = entries.reduce((sum, [, p]) => sum + Number(p.price || 0), 0);
    $('#totalPrice').textContent = money.format(total);

    document.querySelectorAll('[data-remove]').forEach(button => {
      button.onclick = (event) => {
        event.stopPropagation();
        delete build[button.dataset.remove];
        saveBuild();
        renderRows();
        renderBuild();
      };
    });

    document.querySelectorAll('[data-jump-category]').forEach(item => {
      const jumpToCategory = () => setActiveCategory(item.dataset.jumpCategory);

      item.addEventListener('click', event => {
        if (event.target.closest('[data-remove]')) return;
        jumpToCategory();
      });

      item.addEventListener('keydown', event => {
        if (event.target.closest('[data-remove]')) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        jumpToCategory();
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

  function buildText() {
    const lines = ['CoolPC Mirror 配單'];
    let total = 0;
    for (const id of categoryOrder) {
      const p = build[id];
      if (!p) continue;
      total += Number(p.price || 0);
      lines.push(`${id} ${categoryName(id)}: ${p.name} — ${money.format(p.price)}`);
    }
    lines.push(`合計：${money.format(total)}`);
    return lines.join('\n');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), build }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'coolpc-build.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function escapeAttr(s) {
    return escapeHtml(s);
  }

  ['#search', '#minPrice', '#maxPrice'].forEach(s => $(s).addEventListener('input', renderRows));
  ['#brandFilter', '#subFilter', '#sort'].forEach(s => $(s).addEventListener('change', renderRows));
  $('#categorySelect').addEventListener('change', e => setActiveCategory(e.target.value));
  $('#compatibleOnly')?.addEventListener('change', renderRows);
  $('.table-wrap').addEventListener('scroll', queueScrollPositionSave, { passive: true });
  window.addEventListener('scroll', queueScrollPositionSave, { passive: true });
  window.addEventListener('beforeunload', saveActiveScrollPosition);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveActiveScrollPosition();
  });
  $('#resetFilters').onclick = () => { clearFilterValues(true); renderRows(); };
  $('#clearBuild').onclick = () => { build = {}; saveBuild(); renderRows(); renderBuild(); };
  $('#copyBuild').onclick = async () => {
    await copyText(buildText());
    $('#copyBuild').textContent = '已複製';
    setTimeout(() => { $('#copyBuild').textContent = '複製文字'; }, 900);
  };
  $('#exportBuild').onclick = exportJson;

  renderMeta();
  renderAll();
  restoreCategoryScroll(activeCategory, { initial: true });
})();