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

  function nonNegativeInt(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
  }

  function storageRequirements(build) {
    const requirements = {
      m2: 0,
      ssd25: 0,
      hdd25: 0,
      hdd35: 0,
      unknown: 0,
      m2Pcie: 0,
      m2Sata: 0,
      sataDevices: 0,
      motherboardUnknown: 0,
    };

    for (const entry of entriesOf(build, '7')) {
      const specs = specsOf(entry.product);
      if (specs.storage_form_factor === 'M.2') {
        requirements.m2 += entry.qty;
        if (specs.interface === 'PCIe') requirements.m2Pcie += entry.qty;
        else if (specs.interface === 'SATA') requirements.m2Sata += entry.qty;
        else requirements.motherboardUnknown += entry.qty;
      } else if (specs.storage_form_factor === '2.5-inch') {
        requirements.ssd25 += entry.qty;
        if (specs.interface === 'SATA') requirements.sataDevices += entry.qty;
        else requirements.motherboardUnknown += entry.qty;
      } else {
        requirements.unknown += entry.qty;
        requirements.motherboardUnknown += entry.qty;
      }
    }

    for (const entry of entriesOf(build, '8')) {
      const specs = specsOf(entry.product);
      if (specs.storage_form_factor === '3.5-inch') requirements.hdd35 += entry.qty;
      else if (specs.storage_form_factor === '2.5-inch') requirements.hdd25 += entry.qty;
      else requirements.unknown += entry.qty;

      if (specs.interface === 'SATA') requirements.sataDevices += entry.qty;
      else requirements.motherboardUnknown += entry.qty;
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

  function evaluateCase(build, requirements) {
    const caseEntry = entriesOf(build, '14')[0];
    const caseProduct = caseEntry?.product || null;
    const caseDriveDemand = requirements.ssd25 + requirements.hdd25 + requirements.hdd35 + requirements.unknown;

    if (!caseProduct) return { state: 'unknown', status: '未選機殼', requirements, capacity: null };

    const capacity = caseCapacities(caseProduct);
    if (!caseDriveDemand) return { state: 'neutral', status: '目前無機殼碟需求', requirements, capacity };
    if (requirements.unknown) return { state: 'unknown', status: '儲存裝置規格不足', requirements, capacity };

    const hasAnyEvidence = capacity.hasBay35 || capacity.hasBay25 || capacity.hasCombo || capacity.hasSsd;
    if (!hasAnyEvidence) return { state: 'unknown', status: '槽位資料不足', requirements, capacity };

    const evidenceCoversDemand = (
      (!requirements.ssd25 || capacity.hasSsd || capacity.hasBay25 || capacity.hasCombo)
      && (!requirements.hdd25 || capacity.hasBay25 || capacity.hasCombo)
      && (!requirements.hdd35 || capacity.hasBay35 || capacity.hasCombo)
    );
    if (!evidenceCoversDemand) return { state: 'unknown', status: '槽位資料不足', requirements, capacity };

    const fit = listedCapacityCanFit(requirements, capacity);
    return {
      state: fit ? 'fit' : 'short',
      status: fit ? '已列規格足夠' : '已列槽位不足',
      requirements,
      capacity,
    };
  }

  function motherboardStorageOf(product) {
    const storage = specsOf(product).motherboard_storage;
    return storage && typeof storage === 'object' && !Array.isArray(storage) ? storage : null;
  }

  function ruleCanReduceSata(rule, m2Total, m2Sata) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false;
    if (!String(rule.disables || '').toUpperCase().startsWith('SATA')) return false;
    if (rule.trigger === 'any_m2') return m2Total > 0;
    if (rule.trigger === 'sata_m2') return m2Sata > 0;
    return true;
  }

  function evaluateMotherboardStorage(build, requirements) {
    const boardEntry = entriesOf(build, '5')[0];
    const board = boardEntry?.product || null;
    if (!board) return { state: 'unknown', status: '未選主機板', reason: 'motherboard_not_selected', requirements, storage: null };
    if (requirements.motherboardUnknown) return { state: 'unknown', status: '儲存介面資料不足', reason: 'storage_requirements_unknown', requirements, storage: motherboardStorageOf(board) };

    const storage = motherboardStorageOf(board);
    if (!storage || storage.state !== 'known') {
      return { state: 'unknown', status: '原廠資料未涵蓋', reason: 'motherboard_storage_unknown', requirements, storage };
    }

    const m2Total = requirements.m2Pcie + requirements.m2Sata;
    const sataDemand = requirements.sataDevices;
    if (!m2Total && !sataDemand) return { state: 'neutral', status: '目前無儲存裝置需求', reason: 'no_storage_demand', requirements, storage };

    const m2Count = nonNegativeInt(storage.m2_slot_count);
    const sataCount = nonNegativeInt(storage.sata_port_count);
    const slots = Array.isArray(storage.m2_slots) ? storage.m2_slots : [];
    if (slots.length !== m2Count) return { state: 'unknown', status: '原廠資料結構異常', reason: 'motherboard_storage_invalid', requirements, storage };

    if (m2Total > m2Count) return { state: 'short', status: 'M.2 槽位不足', reason: 'm2_slots_insufficient', requirements, storage };

    const sataCapableM2 = slots.filter(slot => slot && slot.supports_sata === true).length;
    if (requirements.m2Sata > sataCapableM2) {
      return { state: 'short', status: 'M.2 SATA 槽位不足', reason: 'm2_sata_slots_insufficient', requirements, storage };
    }

    if (sataDemand > sataCount) {
      if (storage.unmodeled_storage_connectors_present === true) {
        return { state: 'unknown', status: '額外儲存介面未建模', reason: 'unmodeled_connectors_may_add_capacity', requirements, storage };
      }
      return { state: 'short', status: 'SATA 埠不足', reason: 'sata_ports_insufficient', requirements, storage };
    }

    if (m2Total && storage.conditional_m2_rules_present === true) {
      return { state: 'unknown', status: '條件式通道需確認', reason: 'conditional_m2_rules_unmodeled', requirements, storage };
    }

    if (m2Total && sataDemand && storage.sharing_rules_present === true) {
      if (!Array.isArray(storage.storage_sharing_rules)) {
        return { state: 'unknown', status: '共享規則需確認', reason: 'sharing_rules_unmodeled', requirements, storage };
      }
      if (storage.storage_sharing_rules.some(rule => ruleCanReduceSata(rule, m2Total, requirements.m2Sata))) {
        return { state: 'unknown', status: '共享規則需確認', reason: 'sharing_rule_may_disable_sata', requirements, storage };
      }
    }

    return { state: 'fit', status: '已列連接埠足夠', reason: 'modeled_capacity_sufficient', requirements, storage };
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

  function motherboardRequirementText(requirements) {
    const parts = [];
    if (requirements.m2Pcie) parts.push(`PCIe M.2 ×${requirements.m2Pcie}`);
    if (requirements.m2Sata) parts.push(`SATA M.2 ×${requirements.m2Sata}`);
    if (requirements.sataDevices) parts.push(`SATA 裝置 ×${requirements.sataDevices}`);
    if (requirements.motherboardUnknown) parts.push(`介面未知 ×${requirements.motherboardUnknown}`);
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

  function motherboardCapacityText(storage) {
    if (!storage || storage.state !== 'known') return '目前沒有已驗證的原廠儲存拓撲';
    const m2 = nonNegativeInt(storage.m2_slot_count);
    const sata = nonNegativeInt(storage.sata_port_count);
    const sataM2 = Array.isArray(storage.m2_slots) ? storage.m2_slots.filter(slot => slot && slot.supports_sata === true).length : 0;
    const parts = [`M.2 ×${m2}`, `SATA ×${sata}`];
    if (sataM2) parts.push(`可裝 SATA M.2 槽 ×${sataM2}`);
    return parts.join(' · ');
  }

  function ensureCard(id) {
    let card = $(`#${id}`);
    if (card) return card;
    const total = $('.total');
    if (!total || !total.parentNode) return null;
    card = document.createElement('section');
    card.id = id;
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

  function renderCard(card, title, result, lines, note) {
    card.className = `storage-fit-card${result.state === 'fit' ? ' is-fit' : result.state === 'short' ? ' is-short' : ''}`;
    card.innerHTML = `
      <div class="storage-fit-head">
        <div class="storage-fit-title">${escapeHtml(title)}</div>
        <span class="storage-fit-status">${escapeHtml(result.status)}</span>
      </div>
      <div class="storage-fit-lines">${lines.map(line => `<div>${line}</div>`).join('')}</div>
      <div class="storage-fit-note">${escapeHtml(note)}</div>
    `;
  }

  function render() {
    const caseCard = ensureCard('storageFitCard');
    const motherboardCard = ensureCard('motherboardStorageFitCard');
    if (!caseCard || !motherboardCard) return;

    const build = readBuild();
    const requirements = storageRequirements(build);
    const caseResult = evaluateCase(build, requirements);
    renderCard(
      caseCard,
      '機殼儲存槽',
      caseResult,
      [
        `<strong>配單需求：</strong>${escapeHtml(requirementText(requirements))}`,
        `<strong>機殼已列：</strong>${escapeHtml(capacityText(caseResult.capacity))}`,
      ],
      '僅依 CoolPC 商品列明示的 CASE 安裝位判斷；未列資料視為未知，不當成 0。',
    );

    const motherboardResult = evaluateMotherboardStorage(build, requirements);
    renderCard(
      motherboardCard,
      '主機板儲存連接',
      motherboardResult,
      [
        `<strong>配單需求：</strong>${escapeHtml(motherboardRequirementText(requirements))}`,
        `<strong>主機板原廠已列：</strong>${escapeHtml(motherboardCapacityText(motherboardResult.storage))}`,
      ],
      '依已驗證原廠規格判斷；目前僅部分主機板有資料。未涵蓋視為未知，不當成 0；共享或條件式通道無法安全下結論時不猜測。',
    );
  }

  const buildItems = $('#buildItems');
  if (buildItems) new MutationObserver(render).observe(buildItems, { childList: true, subtree: true });
  window.addEventListener('storage', event => {
    if (event.key === BUILD_KEY) render();
  });

  window.COOLPC_STORAGE_FIT = Object.freeze({
    storageRequirements,
    evaluateMotherboardStorage,
  });

  render();
})();
