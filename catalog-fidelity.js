(() => {
  'use strict';

  const DATA = window.COOLPC_DATA || { products: [] };
  const SEMANTICS = window.COOLPC_CATALOG_SEMANTICS || { annotations: {} };
  const PRICE_HISTORY = window.COOLPC_PRICE_HISTORY || { annotations: {} };
  const annotations = SEMANTICS && typeof SEMANTICS.annotations === 'object' ? SEMANTICS.annotations : {};
  const priceAnnotations = PRICE_HISTORY && typeof PRICE_HISTORY.annotations === 'object' ? PRICE_HISTORY.annotations : {};
  const products = Array.isArray(DATA.products) ? DATA.products : [];
  const rowsHost = document.querySelector('#rows');
  if (!rowsHost || !products.length) return;

  const money = new Intl.NumberFormat('zh-TW', {
    style: 'currency', currency: 'TWD', currencyDisplay: 'code', maximumFractionDigits: 0,
  });

  function privateKey(p) { return `${p?.category_id ?? ''}:${p?.source_value ?? ''}:${p?.raw_text ?? ''}`; }
  function keyFor(p) { return p?.public_id ? `${p.category_id ?? ''}:${p.public_id}` : privateKey(p); }
  function sourceAnnotationFor(p) {
    if (!p || p.public_id) return null;
    const value = annotations[`${p.category_id ?? ''}:${p.source_value ?? ''}`];
    return value && typeof value === 'object' ? value : null;
  }
  function priceAnnotationFor(p) {
    if (!p || p.public_id) return null;
    const value = priceAnnotations[`${p.category_id ?? ''}:${p.source_value ?? ''}`];
    return value && typeof value === 'object' ? value : null;
  }
  function fallbackStatus(p) {
    if (!p || p.public_id) return null;
    const raw = String(p.raw_text || '');
    const price = raw.match(/\$\s*[\d,]+/);
    if (!price) return null;
    const tail = raw.slice((price.index || 0) + price[0].length).trim();
    if (!/[↘↓]/.test(tail)) return null;
    return { hot: false, price_changed: true, price_annotation: tail };
  }
  function statusFor(p) {
    const direct = p?.source_status;
    if (direct && typeof direct === 'object') return direct;
    return sourceAnnotationFor(p)?.source_status || fallbackStatus(p);
  }
  function beforeFor(p) {
    if (Array.isArray(p?.catalog_before)) return p.catalog_before;
    const before = sourceAnnotationFor(p)?.catalog_before;
    return Array.isArray(before) ? before : [];
  }
  function priceChangeFor(p) {
    const direct = p?.price_change;
    if (direct && typeof direct === 'object') return direct;
    return priceAnnotationFor(p)?.price_change || null;
  }
  function groupFor(p) {
    const annotated = sourceAnnotationFor(p)?.group;
    return String(annotated || p?.subcategory || '其他').trim() || '其他';
  }

  const byKey = new Map(products.map(p => [keyFor(p), p]));
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function priceText(value) { return money.format(Number(value || 0)).replace(/^TWD\s*/, 'NT$'); }

  function priceChangeHtml(change) {
    if (!change || !['up', 'down'].includes(change.direction)) return '';
    const current = Number(change.current_price), previous = Number(change.previous_price), delta = Number(change.delta);
    if (![current, previous, delta].every(Number.isFinite) || !delta) return '';
    const down = change.direction === 'down';
    const label = down ? '降價' : '漲價', arrow = down ? '↓' : '↑';
    const pct = Number(change.delta_pct);
    const pctText = Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '';
    const date = String(change.changed_at || '').slice(0, 10);
    return `<div class="price-history ${down ? 'is-down' : 'is-up'}" title="由 PC Build Planner 的歷史 snapshot 計算，並非原價屋狀態標籤">
      <div class="price-history-label">${label}</div>
      <div class="price-history-route">${escapeHtml(priceText(previous))} → ${escapeHtml(priceText(current))}</div>
      <div class="price-history-delta">${arrow} ${escapeHtml(priceText(Math.abs(delta)))}${pctText ? ` · ${escapeHtml(pctText)}` : ''}</div>
      ${date ? `<div class="price-history-date">${escapeHtml(date)}</div>` : ''}
      <div class="price-history-source">snapshot</div>
    </div>`;
  }

  function sourceStatusHtml(status) {
    if (!status || typeof status !== 'object') return '';
    const hot = status.hot === true, changed = status.price_changed === true;
    if (!hot && !changed) return '';
    let cls = 'changed', label = '原價屋：價格異動';
    if (hot && changed) { cls = 'hot-changed'; label = '原價屋：熱賣＋價格異動'; }
    else if (hot) { cls = 'hot'; label = '原價屋：熱賣'; }
    const annotation = changed && status.price_annotation ? ` · ${status.price_annotation}` : '';
    return `<span class="source-status ${cls}" title="原價屋來源狀態">${escapeHtml(label + annotation)}</span>`;
  }

  function semanticRows(before, colspan) {
    if (!Array.isArray(before) || !before.length) return [];
    return before.filter(node => node && node.type !== 'summary' && node.type !== 'group' && String(node.text || '').trim()).map(node => {
      const type = ['note', 'separator', 'header'].includes(node.type) ? node.type : 'note';
      return `<tr class="catalog-semantic-row is-${type}" aria-hidden="true"><td colspan="${colspan}">${escapeHtml(node.text)}</td></tr>`;
    });
  }

  let decorating = false;
  const observer = new MutationObserver(() => { if (!decorating) queueMicrotask(decorate); });
  function decorate() {
    if (decorating) return;
    decorating = true;
    observer.disconnect();
    try {
      rowsHost.querySelectorAll('.catalog-group-row, .catalog-semantic-row').forEach(row => row.remove());
      const sort = document.querySelector('#sort')?.value || 'source';
      const productRows = [...rowsHost.querySelectorAll('tr[data-key]')];
      let previousGroup = null;
      const colspan = 5;
      for (const row of productRows) {
        const p = byKey.get(row.dataset.key);
        if (!p) continue;
        row.classList.add('catalog-product-row');
        const nameCell = row.querySelector('td.name');
        if (nameCell) {
          const statusHtml = sourceStatusHtml(statusFor(p));
          if (statusHtml && !nameCell.querySelector('.source-status')) {
            const line = nameCell.querySelector('.name-line');
            if (line) line.insertAdjacentHTML('afterend', `<div class="source-status-line">${statusHtml}</div>`);
          }
          const chips = nameCell.querySelector('.spec-chips');
          if (chips && !chips.closest('.catalog-enrichment')) {
            const details = document.createElement('details');
            details.className = 'catalog-enrichment';
            const count = chips.querySelectorAll('.spec-chip').length;
            details.innerHTML = `<summary>補充規格${count ? ` · ${count}` : ''}</summary>`;
            chips.before(details); details.appendChild(chips);
          }
        }
        const priceCell = row.querySelector('td.price');
        if (priceCell && !priceCell.querySelector('.price-current')) {
          priceCell.innerHTML = `<div class="price-current">${escapeHtml(priceText(p.price))}</div>${priceChangeHtml(priceChangeFor(p))}`;
        }
        if (sort === 'source') {
          const group = groupFor(p);
          if (group !== previousGroup) {
            row.insertAdjacentHTML('beforebegin', `<tr class="catalog-group-row" aria-hidden="true"><td colspan="${colspan}"><span>${escapeHtml(group)}</span></td></tr>`);
            previousGroup = group;
          }
          const semantic = semanticRows(beforeFor(p), colspan);
          if (semantic.length) row.insertAdjacentHTML('beforebegin', semantic.join(''));
        }
      }
    } finally {
      observer.observe(rowsHost, { childList: true, subtree: true }); decorating = false;
    }
  }
  rowsHost.addEventListener('click', event => {
    if (event.target.closest('.catalog-enrichment, .price-history, .source-status')) event.stopPropagation();
  });
  observer.observe(rowsHost, { childList: true, subtree: true });
  decorate();
})();
