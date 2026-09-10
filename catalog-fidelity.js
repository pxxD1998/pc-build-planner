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
  function priceSeriesFor(p) {
    if (Array.isArray(p?.price_series)) return p.price_series;
    const series = priceAnnotationFor(p)?.price_series;
    return Array.isArray(series) ? series : [];
  }
  function groupFor(p) {
    const annotated = sourceAnnotationFor(p)?.group;
    return String(annotated || p?.subcategory || '其他').trim() || '其他';
  }

  const byKey = new Map(products.map(p => [keyFor(p), p]));
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function priceText(value) { return money.format(Number(value || 0)).replace(/^TWD\s*/, 'NT$'); }

  // Evidence-bounded reference-image registry. Rules are ordered specific ->
  // generic. These are reference/family images already accepted from CoolPC's
  // category overview, not exact retail-variant identity evidence. Adding a
  // rule is a data edit; catalog rendering logic stays generic.
  const REFERENCE_IMAGE_RULES = Object.freeze([
    { id: 'asus-prime-b860m-a-csm', category_id: '5', all: ['PRIME\\s+B860M-A-CSM'], url: 'https://coolpc.coolpc.com.tw/eval/5/asusb860macsm.jpg' },
    { id: 'umax-ddr5-notebook', category_id: '6', all: ['DDR5', 'UMAX', '\\bNB\\b'], url: 'https://coolpc.coolpc.com.tw/eval/6/umaxnbddr5.jpg' },
    { id: 'umax-ddr5-dual-heatspreader', category_id: '6', all: ['DDR5', 'UMAX', '(?:雙通|\\*2|×2)', '散熱片'], url: 'https://coolpc.coolpc.com.tw/eval/6/umaxddr5x2xmp.jpg' },
    { id: 'umax-ddr5', category_id: '6', all: ['DDR5', 'UMAX'], url: 'https://coolpc.coolpc.com.tw/eval/6/umaxddr5xmp.jpg' },
    { id: 'adata-lancerblade-ddr5', category_id: '6', all: ['DDR5', '(?:威剛|ADATA)', 'LancerBlade'], url: 'https://coolpc.coolpc.com.tw/eval/6/xpglancerbladed5s.jpg' },
    { id: 'adata-ddr5', category_id: '6', all: ['DDR5', '(?:威剛|ADATA)'], url: 'https://coolpc.coolpc.com.tw/eval/6/adatad5.jpg' },
    { id: 'kingston-fury-ddr5', category_id: '6', all: ['DDR5', '(?:金士頓|Kingston)', '(?:FURY|獸獵者)'], url: 'https://coolpc.coolpc.com.tw/eval/6/kingstond5fury.jpg' },
    { id: 'kingston-ddr5', category_id: '6', all: ['DDR5', '(?:金士頓|Kingston)'], url: 'https://coolpc.coolpc.com.tw/eval/6/kingstonddr5.jpg' },
    { id: 'klevv-ddr5', category_id: '6', all: ['DDR5', '(?:KLEVV|科賦)'], url: 'https://coolpc.coolpc.com.tw/eval/6/klevvddr5.jpg' },
    { id: 'micron-crucial-ddr5', category_id: '6', all: ['DDR5', '(?:美光|Micron|Crucial)'], url: 'https://coolpc.coolpc.com.tw/eval/6/micronddr5.jpg' },
  ]);

  function compileReferenceImageRules(value) {
    if (!Array.isArray(value)) return [];
    const compiled = [];
    for (const rule of value) {
      if (!rule || typeof rule !== 'object') continue;
      const categoryId = String(rule.category_id || '');
      const url = String(rule.url || '');
      const patterns = Array.isArray(rule.all) ? rule.all : [];
      if (!categoryId || !url || !patterns.length) continue;
      try {
        compiled.push({
          id: String(rule.id || ''),
          categoryId,
          url,
          tests: patterns.map(pattern => new RegExp(String(pattern), 'i')),
        });
      } catch (_) {
        // A malformed optional image rule must never break the catalog.
      }
    }
    return compiled;
  }

  const referenceImageRules = compileReferenceImageRules(REFERENCE_IMAGE_RULES);
  function referenceImageFor(p) {
    const categoryId = String(p?.category_id ?? '');
    const name = String(p?.name || '');
    const rule = referenceImageRules.find(candidate => (
      candidate.categoryId === categoryId && candidate.tests.every(test => test.test(name))
    ));
    return rule?.url || '';
  }

  function normalizedPriceSeries(change, series) {
    const observed = (Array.isArray(series) ? series : []).map(point => ({
      at: String(point?.at || ''),
      price: Number(point?.price),
    })).filter(point => point.at && Number.isFinite(point.price));
    if (observed.length >= 2 && new Set(observed.map(point => point.price)).size >= 2) {
      return observed.slice(-24);
    }
    const previous = Number(change?.previous_price), current = Number(change?.current_price);
    if (![previous, current].every(Number.isFinite) || previous === current) return [];
    return [
      { at: '', price: previous },
      { at: String(change?.changed_at || ''), price: current },
    ];
  }

  function priceSparklineHtml(change, series) {
    const points = normalizedPriceSeries(change, series);
    if (points.length < 2) return '';
    const prices = points.map(point => point.price);
    const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice;
    const times = points.map(point => Date.parse(point.at));
    const timed = times.every(Number.isFinite) && times[times.length - 1] > times[0];
    const minTime = timed ? times[0] : 0;
    const timeSpan = timed ? times[times.length - 1] - minTime : 0;
    const coords = points.map((point, index) => {
      const x = timed
        ? 4 + ((times[index] - minTime) / timeSpan) * 88
        : 4 + (index / Math.max(1, points.length - 1)) * 88;
      const y = range ? 4 + ((maxPrice - point.price) / range) * 22 : 15;
      return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), price: point.price };
    });
    const path = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ');
    const circles = coords.map((point, index) => `<circle class="price-history-point${index === coords.length - 1 ? ' is-current' : ''}" cx="${point.x}" cy="${point.y}" r="${index === coords.length - 1 ? 3 : 2}"></circle>`).join('');
    const aria = `價格歷史 ${points.length} 個實際 snapshot 節點，最低 ${priceText(minPrice)}，最高 ${priceText(maxPrice)}`;
    return `<svg class="price-history-sparkline" viewBox="0 0 96 30" role="img" aria-label="${escapeHtml(aria)}">
      <line class="price-history-baseline" x1="4" y1="28" x2="92" y2="28"></line>
      <path class="price-history-trend" d="${path}"></path>
      ${circles}
    </svg>`;
  }

  function priceChangeHtml(change, series) {
    if (!change || !['up', 'down'].includes(change.direction)) return '';
    const current = Number(change.current_price), previous = Number(change.previous_price), delta = Number(change.delta);
    if (![current, previous, delta].every(Number.isFinite) || !delta) return '';
    const down = change.direction === 'down';
    const label = down ? '降價' : '漲價', arrow = down ? '↓' : '↑';
    const pct = Number(change.delta_pct);
    const pctText = Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '';
    const date = String(change.changed_at || '').slice(0, 10);
    const points = normalizedPriceSeries(change, series);
    const pointText = points.length > 2 ? `${points.length} 節點` : '2 節點';
    return `<div class="price-history ${down ? 'is-down' : 'is-up'}" title="折線只使用已保存的真實 snapshot 價格節點；缺資料不補值、不做模糊配對">
      ${priceSparklineHtml(change, series)}
      <div class="price-history-copy">
        <div class="price-history-label">${label}</div>
        <div class="price-history-route">${escapeHtml(priceText(previous))} → ${escapeHtml(priceText(current))}</div>
        <div class="price-history-delta">${arrow} ${escapeHtml(priceText(Math.abs(delta)))}${pctText ? ` · ${escapeHtml(pctText)}` : ''}</div>
        ${date ? `<div class="price-history-date">${escapeHtml(date)}</div>` : ''}
        <div class="price-history-source">snapshot · ${escapeHtml(pointText)}</div>
      </div>
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

  function ensureReferenceImage(nameCell, p) {
    if (!nameCell || nameCell.querySelector('.catalog-product-media')) return;
    const imageUrl = referenceImageFor(p);
    if (!imageUrl) return;

    const media = document.createElement('div');
    media.className = 'catalog-product-media';
    const figure = document.createElement('figure');
    figure.className = 'product-reference-image';
    figure.title = '原價屋參考圖片';
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    figure.appendChild(image);

    const copy = document.createElement('div');
    copy.className = 'catalog-product-copy';
    while (nameCell.firstChild) copy.appendChild(nameCell.firstChild);
    media.append(figure, copy);
    nameCell.appendChild(media);

    image.addEventListener('error', () => {
      figure.remove();
      media.classList.add('image-unavailable');
    }, { once: true });
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
          ensureReferenceImage(nameCell, p);
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
          priceCell.innerHTML = `<div class="price-current">${escapeHtml(priceText(p.price))}</div>${priceChangeHtml(priceChangeFor(p), priceSeriesFor(p))}`;
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
