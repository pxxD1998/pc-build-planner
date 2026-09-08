(() => {
  'use strict';

  const namespace = document.title === 'PC Build Planner' ? 'pc-build-planner' : 'coolpc-mirror';
  const BUILD_KEY = `${namespace}-build`;
  const $ = selector => document.querySelector(selector);

  function specsOf(product) {
    return product && product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)
      ? product.specs
      : {};
  }

  function qtyOf(entry) {
    const value = Number(entry?.qty);
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  function entriesOf(build, categoryId) {
    const raw = build?.[String(categoryId)];
    if (!raw) return [];
    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .map(value => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        const product = value.product && typeof value.product === 'object' && !Array.isArray(value.product)
          ? value.product
          : value;
        return { product, qty: value.product ? qtyOf(value) : 1 };
      })
      .filter(Boolean);
  }

  function readBuild() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUILD_KEY));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function positiveInt(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : 0;
  }

  function storageRequirements(build) {
    const requirements = {
      m2: 0,
      ssd25: 0,
      hdd25: 0,
      hdd35: 0,
      unknown: 0,
    };

    for (const entry of entriesOf(build, '7')) {
      const specs = specsOf(entry.product);
      if (specs.storage_form_factor === 'M.2') requirements.m2 += entry.qty;
      else if (specs.storage_form_factor === '2.5-inch') requirements.ssd25 += entry.qty;
      else requirements.unknown += entry.qty;
    }

    for (const entry of entriesOf(build, '8')) {
      const specs = specsOf(entry.product);
      if (specs.storage_form_factor === '3.5-inch') requirements.hdd35 += entry.qty;
      else if (specs.storage_form_factor === '2.5-inch') requirements.hdd25 += entry.qty;
      else requirements.unknown += entry.qty;
    }

    return requirements;
  }

  function caseCapacities(caseProduct) {
    const specs = specsOf(caseProduct);
    return {
      bay35: positiveInt(specs.drive_bays_3_5),
      bay25: positiveInt(specs.drive_bays_2_5),
      combo: positiveInt(specs.drive_bays_combo_2_5_3_5),
      ssd: positiveInt(specs.ssd_mounts),
      hasBay35: positiveInt(specs.drive_bays_3_5) > 0,
      hasBay25: positiveInt(specs.drive_bays_2_5) > 0,
      hasCombo: positiveInt(specs.drive_bays_combo_2_5_3_5) > 0,
      hasSsd: positiveInt(specs.ssd_mounts) > 0,
    };
  }

  function listedCapacityCanFit(requirements, capacity) {
    let ssd25 = requirements.ssd25;
    let hdd25 = requirements.hdd25;
    let hdd35 = requirements.hdd35;

    const ssdMountUse = Math.min(ssd25, capacity.ssd);
    ssd25 -= ssdMountUse;

    let bay25 = capacity.bay25;
    const hdd25Use = Math.min(hdd25, bay25);
    hdd25 -= hdd25Use;
    bay25 -= hdd25Use;
    const ssd25Use = Math.min(ssd25, bay25);
    ssd25 -= ssd25Use;

    const hdd35Use = Math.min(hdd35, capacity.bay35);
    hdd35 -= hdd35Use;

    return ssd25 + hdd25 + hdd35 <= capacity.combo;
  }

  function evaluate(build) {
    const requirements = storageRequirements(build);
    const caseEntry = entriesOf(build, '14')[0];
    const caseProduct = caseEntry?.product || null;
    const caseDriveDemand = requirements.ssd25 + requirements.hdd25 + requirements.hdd35 + requirements.unknown;

    if (!caseProduct) {
      return { state: 'unknown', status: '未選機殼', requirements, capacity: null };
    }

    const capacity = caseCapacities(caseProduct);
    if (!caseDriveDemand) {
      return { state: 'neutral', status: '目前無機殼碟需求', requirements, capacity };
    }

    if (requirements.unknown) {
      return { state: 'unknown', status: '儲存裝置規格不足', requirements, capacity };
    }

    const hasAnyEvidence = capacity.hasBay35 || capacity.hasBay25 || capacity.hasCombo || capacity.hasSsd;
    if (!hasAnyEvidence) {
      return { state: 'unknown', status: '槽位資料不足', requirements, capacity };
    }

    const evidenceCoversDemand = (
      (!requirements.ssd25 || capacity.hasSsd || capacity.hasBay25 || capacity.hasCombo)
      && (!requirements.hdd25 || capacity.hasBay25 || capacity.hasCombo)
      && (!requirements.hdd35 || capacity.hasBay35 || capacity.hasCombo)
    );

    if (!evidenceCoversDemand) {
      return { state: 'unknown', status: '槽位資料不足', requirements, capacity };
    }

    const fit = listedCapacityCanFit(requirements, capacity);
    return {
      state: fit ? 'fit' : 'short',
      status: fit ? '已列規格足夠' : '已列槽位不足',
      requirements,
      capacity,
    };
  }

  function requirementText(requirements) {
    const parts = [];
    if (requirements.hdd35) parts.push(`3.5吋 HDD ×${requirements.hdd35}`);
    if (requirements.hdd25) parts.push(`2.5吋 HDD ×${requirements.hdd25}`);
    if (requirements.ssd25) parts.push(`2.5吋 SSD ×${requirements.ssd25}`);
    if (requirements.m2) parts.push(`M.2 ×${requirements.m2}（不佔機殼槽）`);
    if (requirements.unknown) parts.push(`尺寸未知 ×${requirements.unknown}`);
    return parts.length ? parts.join(' · ') : '無 SSD/HDD';
  }

  function capacityText(capacity) {
    if (!capacity) return '尚未選擇機殼';
    const parts = [];
    if (capacity.hasBay35) parts.push(`3.5吋 ×${capacity.bay35}`);
    if (capacity.hasBay25) parts.push(`2.5吋 ×${capacity.bay25}`);
    if (capacity.hasCombo) parts.push(`2.5/3.5共用 ×${capacity.combo}`);
    if (capacity.hasSsd) parts.push(`SSD mount ×${capacity.ssd}`);
    return parts.length ? parts.join(' · ') : 'CoolPC 商品列未提供明確槽位數';
  }

  function ensureCard() {
    let card = $('#storageFitCard');
    if (card) return card;
    const buildItems = $('#buildItems');
    const total = $('.total');
    if (!buildItems || !total || !total.parentNode) return null;

    card = document.createElement('section');
    card.id = 'storageFitCard';
    card.className = 'storage-fit-card';
    card.setAttribute('aria-live', 'polite');
    total.parentNode.insertBefore(card, total);
    return card;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
  }

  function render() {
    const card = ensureCard();
    if (!card) return;

    const result = evaluate(readBuild());
    card.className = `storage-fit-card${result.state === 'fit' ? ' is-fit' : result.state === 'short' ? ' is-short' : ''}`;
    card.innerHTML = `
      <div class="storage-fit-head">
        <div class="storage-fit-title">機殼儲存槽</div>
        <span class="storage-fit-status">${escapeHtml(result.status)}</span>
      </div>
      <div class="storage-fit-lines">
        <div><strong>配單需求：</strong>${escapeHtml(requirementText(result.requirements))}</div>
        <div><strong>機殼已列：</strong>${escapeHtml(capacityText(result.capacity))}</div>
      </div>
      <div class="storage-fit-note">僅依 CoolPC 商品列明示的 CASE 安裝位判斷；未列資料視為未知，不當成 0。主機板 SATA / M.2 埠數與共享通道尚未檢查。</div>
    `;
  }

  const buildItems = $('#buildItems');
  if (buildItems) {
    new MutationObserver(render).observe(buildItems, { childList: true, subtree: true });
  }
  window.addEventListener('storage', event => {
    if (event.key === BUILD_KEY) render();
  });

  render();
})();
