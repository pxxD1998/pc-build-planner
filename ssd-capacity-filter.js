(() => {
  'use strict';

  const DATA = window.COOLPC_DATA || { products: [] };
  const products = Array.isArray(DATA.products) ? DATA.products : [];
  const SSD_CATEGORY_ID = '7';

  const toolbar = document.querySelector('.toolbar');
  const rows = document.querySelector('#rows');
  const resultCount = document.querySelector('#resultCount');
  const empty = document.querySelector('#empty');
  const categorySelect = document.querySelector('#categorySelect');
  const sort = document.querySelector('#sort');
  const resetFilters = document.querySelector('#resetFilters');

  if (!toolbar || !rows || !resultCount || !empty || !categorySelect) return;
  if (document.querySelector('#capacityFilter')) return;

  function specsOf(product) {
    return product && product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)
      ? product.specs
      : {};
  }

  function productKey(product) {
    if (product?.public_id) return `${product.category_id ?? ''}:${product.public_id}`;
    return `${product?.category_id ?? ''}:${product?.source_value ?? ''}:${product?.raw_text ?? ''}:${product?.name ?? ''}`;
  }

  function capacityOf(product) {
    const value = Number(specsOf(product).capacity_gb);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function formatCapacity(capacityGb) {
    if (capacityGb >= 1000 && capacityGb % 1000 === 0) return `${capacityGb / 1000}TB`;
    return `${capacityGb}GB`;
  }

  const productByKey = new Map(products.map(product => [productKey(product), product]));
  const ssdProducts = products.filter(product => String(product.category_id) === SSD_CATEGORY_ID);
  const capacityCounts = new Map();

  for (const product of ssdProducts) {
    const capacity = capacityOf(product);
    if (!capacity) continue;
    capacityCounts.set(capacity, (capacityCounts.get(capacity) || 0) + 1);
  }

  const capacities = [...capacityCounts.keys()].sort((a, b) => a - b);
  const select = document.createElement('select');
  select.id = 'capacityFilter';
  select.setAttribute('aria-label', 'SSD 容量');
  select.title = 'SSD 容量';
  select.innerHTML = '<option value="">全部容量</option>' + capacities.map(capacity => {
    const count = capacityCounts.get(capacity) || 0;
    return `<option value="${capacity}">${formatCapacity(capacity)} (${count})</option>`;
  }).join('');

  if (sort && sort.parentNode === toolbar) toolbar.insertBefore(select, sort);
  else toolbar.appendChild(select);

  const style = document.createElement('style');
  style.textContent = '.ssd-capacity-filtered-out{display:none!important;}';
  document.head.appendChild(style);

  function isSsdCategory() {
    return categorySelect.value === SSD_CATEGORY_ID;
  }

  function syncControl() {
    const visible = isSsdCategory();
    select.hidden = !visible;
    if (!visible) select.value = '';
  }

  function applyCapacityFilter() {
    syncControl();
    if (!isSsdCategory()) return;

    const selectedCapacity = Number(select.value || 0);
    let visible = 0;

    rows.querySelectorAll('tr[data-key]').forEach(row => {
      const product = productByKey.get(row.dataset.key);
      const matchesCapacity = !selectedCapacity || capacityOf(product) === selectedCapacity;
      row.classList.toggle('ssd-capacity-filtered-out', !matchesCapacity);
      if (matchesCapacity && !row.hidden) visible += 1;
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
      applyCapacityFilter();
    });
  }

  select.addEventListener('change', applyCapacityFilter);
  categorySelect.addEventListener('change', queueApply);
  resetFilters?.addEventListener('click', () => {
    select.value = '';
    queueApply();
  });

  new MutationObserver(queueApply).observe(rows, { childList: true });

  syncControl();
  applyCapacityFilter();
})();
