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

  function cpuFamilyOf(build) {
    const cpu = entriesOf(build, '4')[0]?.product || null;
    if (!cpu) return null;
    const name = String(cpu.name || '').toUpperCase();
    const match = name.match(/\b(?:RYZEN\s+[3579]|R[3579])\s*[- ]?([789]\d{3})[A-Z0-9-]*\b/);
    if (!match) return null;
    const series = `${match[1][0]}000`;
    return `amd_ryzen_${series}_desktop`;
  }

  function combinations(values, choose) {
    if (choose === 0) return [[]];
    if (choose < 0 || choose > values.length) return [];
    const result = [];
    function walk(start, picked) {
      if (picked.length === choose) {
        result.push([...picked]);
        return;
      }
      for (let index = start; index < values.length; index += 1) {
        picked.push(values[index]);
        walk(index + 1, picked);
        picked.pop();
      }
    }
    walk(0, []);
    return result;
  }

  function activeM2Slots(storage, build, m2Total) {
    const slots = Array.isArray(storage.m2_slots) ? storage.m2_slots : [];
    if (!m2Total || storage.conditional_m2_rules_present !== true) {
      return { slots, reason: null };
    }
    if (storage.conditional_m2_rules_unmodeled === true) {
      return { slots: null, reason: 'conditional_m2_rules_unmodeled' };
    }

    const rules = storage.conditional_m2_capacity_rules;
    if (rules == null) return { slots, reason: null };
    if (!Array.isArray(rules)) return { slots: null, reason: 'motherboard_storage_invalid' };

    const cpuFamily = cpuFamilyOf(build);
    if (!cpuFamily) return { slots: null, reason: 'cpu_family_required_for_m2_capacity' };

    const unavailable = new Set();
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
        return { slots: null, reason: 'motherboard_storage_invalid' };
      }
      if (rule.effect !== 'slot_unavailable' || !Array.isArray(rule.cpu_families)) {
        return { slots: null, reason: 'motherboard_storage_invalid' };
      }
      if (rule.cpu_families.includes(cpuFamily)) unavailable.add(String(rule.slot || '').toUpperCase());
    }
    return {
      slots: slots.filter(slot => !unavailable.has(String(slot?.slot || '').toUpperCase())),
      reason: null,
    };
  }

  function maxSataAfterM2Placement(slots, storage, requirements) {
    const sharingPresent = storage.sharing_rules_present === true;
    let rules = [];
    if (sharingPresent) {
      if (!Array.isArray(storage.storage_sharing_rules)) return { max: null, reason: 'sharing_rules_unmodeled' };
      rules = storage.storage_sharing_rules;
    }

    const sataCandidates = slots
      .map((slot, index) => (slot && slot.supports_sata === true ? index : null))
      .filter(index => index !== null);

    const sataPlacements = combinations(sataCandidates, requirements.m2Sata);
    let best = null;
    for (const sataChoice of sataPlacements) {
      const sataSet = new Set(sataChoice);
      const remaining = slots.map((_, index) => index).filter(index => !sataSet.has(index));
      for (const pcieChoice of combinations(remaining, requirements.m2Pcie)) {
        const occupied = new Set([...sataChoice, ...pcieChoice].map(index => String(slots[index]?.slot || '').toUpperCase()));
        const sataM2 = new Set(sataChoice.map(index => String(slots[index]?.slot || '').toUpperCase()));
        const disabledSata = new Set();

        for (const rule of rules) {
          if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return { max: null, reason: 'motherboard_storage_invalid' };
          const source = String(rule.when_slot_occupied || '').toUpperCase();
          if (!occupied.has(source)) continue;
          if (rule.trigger === 'sata_m2' && !sataM2.has(source)) continue;
          if (rule.trigger !== 'sata_m2' && rule.trigger !== 'any_m2') return { max: null, reason: 'motherboard_storage_invalid' };
          const target = String(rule.disables || '').toUpperCase();
          if (target.startsWith('SATA')) disabledSata.add(target);
        }

        const available = Math.max(0, nonNegativeInt(storage.sata_port_count) - disabledSata.size);
        best = best == null ? available : Math.max(best, available);
      }
    }
    return { max: best, reason: best == null ? 'm2_slot_allocation_unresolved' : null };
  }

  function accessoryCondition(storage, sataDemand) {
    if (!sataDemand || storage.storage_accessory_requirements_present !== true) {
      return { conditions: [], reason: null };
    }
    if (storage.storage_accessory_requirements_unmodeled === true) {
      return { conditions: null, reason: 'storage_accessory_requirement_unmodeled' };
    }
    if (!Array.isArray(storage.sata_accessory_rules) || storage.sata_accessory_rules.length !== 1) {
      return { conditions: null, reason: 'storage_accessory_requirement_unmodeled' };
    }
    const rule = storage.sata_accessory_rules[0];
    if (
      !rule
      || rule.effect !== 'sata_ports_available_if_accessory_installed'
      || nonNegativeInt(rule.ports_available) !== nonNegativeInt(storage.sata_port_count)
      || !String(rule.accessory || '').trim()
    ) {
      return { conditions: null, reason: 'storage_accessory_requirement_unmodeled' };
    }
    return {
      conditions: [{ type: 'install_accessory', accessory: String(rule.accessory).trim() }],
      reason: null,
    };
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

    const active = activeM2Slots(storage, build, m2Total);
    if (active.reason) {
      const status = active.reason === 'cpu_family_required_for_m2_capacity' ? 'CPU 系列條件需確認' : '條件式 M.2 規則需確認';
      return { state: 'unknown', status, reason: active.reason, requirements, storage };
    }
    const activeSlots = active.slots || [];

    if (m2Total > activeSlots.length) {
      return { state: 'short', status: '此 CPU 可用 M.2 槽位不足', reason: 'm2_slots_insufficient_for_cpu_family', requirements, storage };
    }

    const sataCapableM2 = activeSlots.filter(slot => slot && slot.supports_sata === true).length;
    if (requirements.m2Sata > sataCapableM2) {
      return { state: 'short', status: 'M.2 SATA 槽位不足', reason: 'm2_sata_slots_insufficient', requirements, storage };
    }

    if (sataDemand > sataCount) {
      if (storage.unmodeled_storage_connectors_present === true) {
        return { state: 'unknown', status: '額外儲存介面未建模', reason: 'unmodeled_connectors_may_add_capacity', requirements, storage };
      }
      return { state: 'short', status: 'SATA 埠不足', reason: 'sata_ports_insufficient', requirements, storage };
    }

    const accessory = accessoryCondition(storage, sataDemand);
    if (accessory.reason) {
      return { state: 'unknown', status: 'SATA 配件條件需確認', reason: accessory.reason, requirements, storage };
    }

    const placement = maxSataAfterM2Placement(activeSlots, storage, requirements);
    if (placement.reason) {
      const status = placement.reason === 'sharing_rules_unmodeled' ? '共享規則需確認' : 'M.2 槽位配置需確認';
      return { state: 'unknown', status, reason: placement.reason, requirements, storage };
    }

    if (sataDemand > placement.max) {
      return { state: 'short', status: 'M.2 / SATA 共享後不足', reason: 'sharing_rules_force_sata_shortage', requirements, storage };
    }

    const conditions = accessory.conditions || [];
    return {
      state: 'fit',
      status: conditions.length ? '已列連接埠足夠（需安裝配件）' : '已列連接埠足夠',
      reason: storage.sharing_rules_present === true ? 'modeled_placement_sufficient' : 'modeled_capacity_sufficient',
      requirements,
      storage,
      conditions,
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
    if (Array.isArray(storage.conditional_m2_capacity_rules) && storage.conditional_m2_capacity_rules.length) parts.push('M.2 數量依 CPU');
    if (Array.isArray(storage.sata_accessory_rules) && storage.sata_accessory_rules.length) parts.push('SATA 需原廠配件');
    return parts.join(' · ');
  }

  function conditionText(result) {
    const conditions = Array.isArray(result?.conditions) ? result.conditions : [];
    const parts = conditions
      .filter(condition => condition && condition.type === 'install_accessory' && condition.accessory)
      .map(condition => `安裝 ${condition.accessory}`);
    return parts.length ? parts.join(' · ') : '';
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
    const motherboardLines = [
      `<strong>配單需求：</strong>${escapeHtml(motherboardRequirementText(requirements))}`,
      `<strong>主機板原廠已列：</strong>${escapeHtml(motherboardCapacityText(motherboardResult.storage))}`,
    ];
    const condition = conditionText(motherboardResult);
    if (condition) motherboardLines.push(`<strong>必要條件：</strong>${escapeHtml(condition)}`);

    renderCard(
      motherboardCard,
      '主機板儲存連接',
      motherboardResult,
      motherboardLines,
      '依已驗證原廠規格做實際 M.2 槽位配置；CPU 條件、M.2/SATA 共享與原廠配件會保留。未建模或未涵蓋的事實仍視為未知，不當成 0。',
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
    cpuFamilyOf,
  });

  render();
})();
