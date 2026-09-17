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
  const row = document.createElement('div');
  row.className = 'ssd-capacity-row';
  row.hidden = true;

  const select = document.createElement('select');
  select.id = 'capacityFilter';
  select.setAttribute('aria-label', 'SSD 容量');
  select.title = '依 SSD 容量篩選';
  select.innerHTML = '<option value="">全部容量</option>' + capacities.map(capacity => {
    const count = capacityCounts.get(capacity) || 0;
    return `<option value="${capacity}">${formatCapacity(capacity)} · ${count} 項</option>`;
  }).join('');

  row.innerHTML = '<div class="ssd-capacity-label"><span>SSD</span><strong>容量</strong></div><div class="ssd-capacity-control"></div><div class="ssd-capacity-hint">先選容量，再用上方排序找最低價</div>';
  row.querySelector('.ssd-capacity-control').appendChild(select);
  toolbar.insertAdjacentElement('afterend', row);

  const style = document.createElement('style');
  style.textContent = `
    .ssd-capacity-filtered-out{display:none!important}
    .ssd-capacity-row[hidden]{display:none!important}
    .ssd-capacity-row{
      display:flex;align-items:center;gap:10px;min-width:0;padding:9px 12px 10px;
      border-bottom:1px solid var(--line,#26313c);
      background:linear-gradient(180deg,#10161c,#0e141a)
    }
    .ssd-capacity-label{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#aab6c2;font-size:11px}
    .ssd-capacity-label span{padding:3px 6px;border:1px solid rgba(99,199,245,.28);border-radius:5px;background:rgba(99,199,245,.08);color:var(--accent,#63c7f5);font-size:9px;font-weight:900;letter-spacing:.08em}
    .ssd-capacity-label strong{font-weight:800}
    .ssd-capacity-control{width:190px;flex:0 0 auto}
    #capacityFilter{height:34px;padding:6px 30px 6px 10px;border-color:#30404f;background:#0c1218;color:#d6e0e9;font-size:11px;font-weight:750;transition:border-color .12s ease,background .12s ease,box-shadow .12s ease,color .12s ease}
    #capacityFilter:hover{border-color:#425769;background:#101820}
    #capacityFilter.is-active{border-color:rgba(99,199,245,.58);background:rgba(99,199,245,.09);color:#eefaff;box-shadow:inset 0 0 0 1px rgba(99,199,245,.05)}
    .ssd-capacity-hint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#687787;font-size:10px}
    @media(max-width:650px){
      .ssd-capacity-row{gap:8px;padding:8px 10px 9px;flex-wrap:wrap}
      .ssd-capacity-control{width:auto;flex:1 1 150px}
      .ssd-capacity-hint{flex-basis:100%;padding-left:1px;font-size:9px}
    }
  `;
  document.head.appendChild(style);

  function isSsdCategory() {
    return categorySelect.value === SSD_CATEGORY_ID;
  }

  function syncControl() {
    const visible = isSsdCategory();
    row.hidden = !visible;
    if (!visible) select.value = '';
    select.classList.toggle('is-active', Boolean(select.value));
  }

  function applyCapacityFilter() {
    syncControl();
    if (!isSsdCategory()) return;

    const selectedCapacity = Number(select.value || 0);
    let visible = 0;

    rows.querySelectorAll('tr[data-key]').forEach(tableRow => {
      const product = productByKey.get(tableRow.dataset.key);
      const matchesCapacity = !selectedCapacity || capacityOf(product) === selectedCapacity;
      tableRow.classList.toggle('ssd-capacity-filtered-out', !matchesCapacity);
      if (matchesCapacity && !tableRow.hidden) visible += 1;
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
