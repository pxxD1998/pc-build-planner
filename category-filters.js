(() => {
  'use strict';

  const DATA = window.COOLPC_DATA || { products: [] };
  const products = Array.isArray(DATA.products) ? DATA.products : [];
  const toolbar = document.querySelector('.toolbar');
  const rows = document.querySelector('#rows');
  const resultCount = document.querySelector('#resultCount');
  const empty = document.querySelector('#empty');
  const categorySelect = document.querySelector('#categorySelect');
  const resetFilters = document.querySelector('#resetFilters');

  if (!toolbar || !rows || !resultCount || !empty || !categorySelect) return;
  if (document.querySelector('#categorySpecificFilters')) return;

  const DRIVE_CLASSES = { desktop: '傳統碟', surveillance: '監控', nas: 'NAS', enterprise: '企業', laptop: '筆電' };
  const FORM_FACTORS = { '2.5-inch': '2.5 吋', '3.5-inch': '3.5 吋' };

  const CONFIG = {
    '4': [
      { key: 'socket', label: '腳位', path: 'socket', type: 'select' },
      { key: 'cores', label: '核心數', path: 'cores', type: 'select-number', suffix: ' 核' },
      { key: 'threads', label: '執行緒', path: 'threads', type: 'select-number', suffix: ' 執行緒' },
    ],
    '5': [
      { key: 'chipset', label: '晶片組', path: 'chipset', type: 'select' },
      { key: 'socket', label: '腳位', path: 'socket', type: 'select' },
      { key: 'formFactor', label: '尺寸', path: 'form_factor', type: 'select' },
      { key: 'memoryType', label: '記憶體', path: 'memory_type', type: 'select' },
      { key: 'wifi', label: 'Wi-Fi', path: 'wifi', type: 'boolean', trueLabel: '只看有 Wi-Fi' },
      { key: 'm2Slots', label: 'M.2 至少', path: 'motherboard_storage.m2_slot_count', type: 'number', mode: 'min', placeholder: '例如 3' },
      { key: 'sataPorts', label: 'SATA 至少', path: 'motherboard_storage.sata_port_count', type: 'number', mode: 'min', placeholder: '例如 4' },
    ],
    '6': [
      { key: 'memoryType', label: '世代', path: 'memory_type', type: 'select' },
      { key: 'capacity', label: '套裝容量', path: 'capacity_gb', type: 'select-number', format: 'capacity' },
      { key: 'modules', label: '條數', path: 'module_count', type: 'select-number', suffix: ' 條' },
      { key: 'speed', label: '頻率', path: 'speed_mts', type: 'select-number', suffix: ' MT/s' },
      { key: 'cl', label: 'CL', path: 'cl', type: 'select-number', prefix: 'CL' },
    ],
    '7': [
      { key: 'capacity', label: '容量', path: 'capacity_gb', type: 'select-number', format: 'capacity' },
      { key: 'formFactor', label: '規格', path: 'storage_form_factor', type: 'select', format: 'formFactor' },
      { key: 'interface', label: '介面', path: 'interface', type: 'select' },
      { key: 'pcieGen', label: 'PCIe 世代', path: 'pcie_generation', type: 'select-number', prefix: 'Gen ' },
      { key: 'm2Size', label: 'M.2 尺寸', path: 'm2_size', type: 'select' },
      { key: 'nand', label: 'NAND', path: 'nand_type', type: 'select' },
      { key: 'dram', label: 'DRAM', path: 'dram_cache', type: 'boolean', trueLabel: '只看有 DRAM' },
      { key: 'read', label: '讀取至少', path: 'sequential_read_mbps', type: 'number', mode: 'min', placeholder: 'MB/s' },
    ],
    '8': [
      { key: 'capacity', label: '容量', path: 'capacity_gb', type: 'select-number', format: 'capacity' },
      { key: 'formFactor', label: '尺寸', path: 'storage_form_factor', type: 'select', format: 'formFactor' },
      { key: 'driveClass', label: '用途', path: 'drive_class', type: 'select', format: 'driveClass' },
      { key: 'rpm', label: '轉速', path: 'rpm', type: 'select-number', suffix: ' RPM' },
      { key: 'cache', label: '快取', path: 'cache_mb', type: 'select-number', suffix: ' MB' },
    ],
    '10': [
      { key: 'socket', label: '支援腳位', path: 'sockets', type: 'array-select' },
      { key: 'fanSize', label: '風扇', path: 'fan_size_mm', type: 'select-number', suffix: ' mm' },
      { key: 'height', label: '高度上限', path: 'cooler_height_mm', type: 'number', mode: 'max', placeholder: '例如 160 mm' },
    ],
    '11': [
      { key: 'radiator', label: '冷排', path: 'radiator_size_mm', type: 'select-number', suffix: ' mm' },
      { key: 'fans', label: '風扇數', path: 'fan_count', type: 'select-number', suffix: ' 扇' },
      { key: 'socket', label: '支援腳位', path: 'sockets', type: 'array-select' },
    ],
    '12': [
      { key: 'length', label: '卡長上限', path: 'length_mm', type: 'number', mode: 'max', placeholder: '例如 330 mm' },
    ],
    '14': [
      { key: 'motherboard', label: '主機板', path: 'motherboard_support', type: 'array-select' },
      { key: 'radiator', label: '水冷支援', path: 'radiator_support_mm', type: 'array-select-number', suffix: ' mm' },
      { key: 'gpuLength', label: 'GPU 空間至少', path: 'max_gpu_length_mm', type: 'number', mode: 'min', placeholder: '例如 340 mm' },
      { key: 'coolerHeight', label: '塔散空間至少', path: 'max_cpu_cooler_height_mm', type: 'number', mode: 'min', placeholder: '例如 165 mm' },
      { key: 'frontUsbC', label: '前置 Type-C', path: 'front_usb_c', type: 'boolean', trueLabel: '只看有 Type-C' },
      { key: 'pd', label: 'PD 至少', path: 'front_usb_c_pd_w', type: 'number', mode: 'min', placeholder: '例如 45 W' },
      { key: 'fans', label: '內建風扇至少', path: 'included_fans', type: 'number', mode: 'min', placeholder: '例如 3' },
    ],
  };

  function specsOf(product) {
    return product && product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)
      ? product.specs
      : {};
  }

  function getPath(product, path) {
    const parts = String(path).split('.');
    let value = specsOf(product);
    for (const part of parts) {
      if (value == null || typeof value !== 'object') return undefined;
      value = value[part];
    }
    return value;
  }

  function productKey(product) {
    if (product?.public_id) return `${product.category_id ?? ''}:${product.public_id}`;
    return `${product?.category_id ?? ''}:${product?.source_value ?? ''}:${product?.raw_text ?? ''}:${product?.name ?? ''}`;
  }

  const productByKey = new Map(products.map(product => [productKey(product), product]));

  function formatCapacity(value) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1000 && n % 1000 === 0) return `${n / 1000}TB`;
    return `${value}GB`;
  }

  function formatValue(value, field) {
    if (field.format === 'capacity') return formatCapacity(value);
    if (field.format === 'driveClass') return DRIVE_CLASSES[value] || String(value);
    if (field.format === 'formFactor') return FORM_FACTORS[value] || String(value);
    return `${field.prefix || ''}${value}${field.suffix || ''}`;
  }

  function categoryProducts(categoryId) {
    return products.filter(product => String(product.category_id) === String(categoryId));
  }

  function valuesFor(categoryId, field) {
    const values = [];
    for (const product of categoryProducts(categoryId)) {
      const raw = getPath(product, field.path);
      if (field.type === 'array-select' || field.type === 'array-select-number') {
        if (Array.isArray(raw)) values.push(...raw.filter(v => v !== undefined && v !== null && v !== ''));
      } else if (raw !== undefined && raw !== null && raw !== '' && field.type !== 'boolean') {
        values.push(raw);
      }
    }
    const unique = [...new Set(values.map(value => typeof value === 'number' ? value : String(value)))];
    if (field.type.includes('number') || unique.every(value => Number.isFinite(Number(value)))) {
      return unique.sort((a, b) => Number(a) - Number(b));
    }
    return unique.sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
  }

  function fieldHasData(categoryId, field) {
    const list = categoryProducts(categoryId);
    if (field.type === 'boolean') return list.some(product => getPath(product, field.path) === true);
    if (field.type === 'number') return list.some(product => Number.isFinite(Number(getPath(product, field.path))));
    return valuesFor(categoryId, field).length > 0;
  }

  const panel = document.createElement('div');
  panel.id = 'categorySpecificFilters';
  panel.className = 'category-specific-filters';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="csf-heading">
      <span class="csf-badge" id="csfBadge">SPEC</span>
      <strong>專屬篩選</strong>
      <span class="csf-active-count" id="csfActiveCount">未套用</span>
    </div>
    <div class="csf-controls" id="csfControls"></div>
    <button class="csf-clear" id="csfClear" type="button" hidden>清除</button>
  `;
  toolbar.insertAdjacentElement('afterend', panel);

  const controlsHost = panel.querySelector('#csfControls');
  const badge = panel.querySelector('#csfBadge');
  const clearButton = panel.querySelector('#csfClear');
  const activeCount = panel.querySelector('#csfActiveCount');

  let renderedCategory = null;
  let activeFields = [];

  function controlId(field) {
    return `csf-${field.key}`;
  }

  function buildControl(categoryId, field) {
    const wrap = document.createElement('label');
    wrap.className = 'csf-field';
    wrap.htmlFor = controlId(field);

    const label = document.createElement('span');
    label.className = 'csf-label';
    label.textContent = field.label;
    wrap.appendChild(label);

    let control;
    if (field.type === 'number') {
      control = document.createElement('input');
      control.type = 'number';
      control.min = '0';
      control.step = '1';
      control.placeholder = field.placeholder || '';
      control.inputMode = 'numeric';
    } else {
      control = document.createElement('select');
      control.innerHTML = '<option value="">不限</option>';
      if (field.type === 'boolean') {
        const option = document.createElement('option');
        option.value = 'true';
        option.textContent = field.trueLabel || '只看有';
        control.appendChild(option);
      } else {
        for (const value of valuesFor(categoryId, field)) {
          const option = document.createElement('option');
          option.value = String(value);
          option.textContent = formatValue(value, field);
          control.appendChild(option);
        }
      }
    }

    control.id = controlId(field);
    control.dataset.csfKey = field.key;
    control.addEventListener(field.type === 'number' ? 'input' : 'change', queueApply);
    wrap.appendChild(control);
    return wrap;
  }

  function categoryLabel() {
    const text = document.querySelector('#activeCategoryName')?.textContent?.trim() || '';
    if (!text) return 'SPEC';
    if (text.includes('CPU') || text.includes('處理器')) return 'CPU';
    if (text.includes('主機板')) return 'MB';
    if (text.includes('記憶體')) return 'RAM';
    if (text.includes('SSD') || text.includes('固態')) return 'SSD';
    if (text.includes('HDD') || text.includes('硬碟')) return 'HDD';
    if (text.includes('水冷')) return 'AIO';
    if (text.includes('散熱')) return 'COOLER';
    if (text.includes('顯示卡') || text.includes('顯卡')) return 'GPU';
    if (text.includes('機殼')) return 'CASE';
    return 'SPEC';
  }

  function rebuildForCategory(categoryId) {
    renderedCategory = String(categoryId);
    const config = CONFIG[renderedCategory] || [];
    activeFields = config.filter(field => fieldHasData(renderedCategory, field));
    controlsHost.innerHTML = '';

    if (!activeFields.length) {
      panel.hidden = true;
      return;
    }

    for (const field of activeFields) controlsHost.appendChild(buildControl(renderedCategory, field));
    badge.textContent = categoryLabel();
    panel.hidden = false;
    updateActiveState();
  }

  function controlValue(field) {
    const control = document.querySelector(`#${controlId(field)}`);
    return control ? control.value : '';
  }

  function hasActiveFilters() {
    return activeFields.some(field => String(controlValue(field)).trim() !== '');
  }

  function updateActiveState() {
    let any = false;
    for (const field of activeFields) {
      const control = document.querySelector(`#${controlId(field)}`);
      if (!control) continue;
      const active = String(control.value).trim() !== '';
      control.classList.toggle('is-active', active);
      control.closest('.csf-field')?.classList.toggle('is-active', active);
      any ||= active;
    }
    const count = activeFields.reduce((sum, field) => sum + (String(controlValue(field)).trim() !== '' ? 1 : 0), 0);
    clearButton.hidden = !any;
    if (activeCount) {
      activeCount.textContent = any ? `已套用 ${count}` : '未套用';
      activeCount.classList.toggle('is-active', any);
    }
    panel.classList.toggle('has-active', any);
  }

  function matchesField(product, field) {
    const filterValue = controlValue(field);
    if (!filterValue) return true;

    const raw = getPath(product, field.path);
    if (field.type === 'boolean') return filterValue !== 'true' || raw === true;

    if (field.type === 'number') {
      const actual = Number(raw);
      const wanted = Number(filterValue);
      if (!Number.isFinite(actual) || !Number.isFinite(wanted)) return false;
      return field.mode === 'max' ? actual <= wanted : actual >= wanted;
    }

    if (field.type === 'array-select' || field.type === 'array-select-number') {
      return Array.isArray(raw) && raw.map(String).includes(String(filterValue));
    }

    if (field.type === 'select-number') return Number(raw) === Number(filterValue);
    return String(raw ?? '') === String(filterValue);
  }

  function syncCategory() {
    const categoryId = String(categorySelect.value || '');
    if (categoryId !== renderedCategory) rebuildForCategory(categoryId);
    return categoryId;
  }

  function applyFilters() {
    const categoryId = syncCategory();
    updateActiveState();
    if (!activeFields.length) return;

    let visible = 0;
    rows.querySelectorAll('tr[data-key]').forEach(row => {
      const product = productByKey.get(row.dataset.key);
      const matches = Boolean(product) && activeFields.every(field => matchesField(product, field));
      row.classList.toggle('category-specific-filtered-out', !matches);
      if (matches && !row.hidden) visible += 1;
    });

    resultCount.textContent = `${visible.toLocaleString()} 項`;
    empty.hidden = visible !== 0;
  }

  let applyQueued = false;
  function queueApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(() => {
      applyQueued = false;
      applyFilters();
    });
  }

  function clearSpecificFilters() {
    for (const field of activeFields) {
      const control = document.querySelector(`#${controlId(field)}`);
      if (control) control.value = '';
    }
    queueApply();
  }

  clearButton.addEventListener('click', clearSpecificFilters);
  resetFilters?.addEventListener('click', clearSpecificFilters);
  categorySelect.addEventListener('change', queueApply);
  new MutationObserver(queueApply).observe(rows, { childList: true });

  rebuildForCategory(categorySelect.value);
  applyFilters();
})();