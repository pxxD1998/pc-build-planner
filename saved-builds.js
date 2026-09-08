(() => {
  'use strict';

  const namespace = document.title === 'PC Build Planner' ? 'pc-build-planner' : 'coolpc-mirror';
  const BUILD_KEY = `${namespace}-build`;
  const SAVED_BUILDS_KEY = `${namespace}-saved-builds-v1`;
  const money = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
  const $ = (selector) => document.querySelector(selector);

  function readCurrentBuild() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BUILD_KEY));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function readSavedBuilds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SAVED_BUILDS_KEY));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(snapshot =>
        snapshot
        && typeof snapshot === 'object'
        && typeof snapshot.id === 'string'
        && snapshot.build
        && typeof snapshot.build === 'object'
        && !Array.isArray(snapshot.build)
      );
    } catch {
      return [];
    }
  }

  function writeSavedBuilds(savedBuilds) {
    try {
      localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(savedBuilds));
      return true;
    } catch {
      alert('暫存配單失敗：瀏覽器儲存空間可能已滿或不可用。');
      return false;
    }
  }

  function currentEntries() {
    return Object.values(readCurrentBuild()).filter(item => item && typeof item === 'object');
  }

  function buildSummary(savedBuild) {
    const entries = Object.values(savedBuild || {}).filter(item => item && typeof item === 'object');
    return {
      count: entries.length,
      total: entries.reduce((sum, item) => sum + Number(item.price || 0), 0),
    };
  }

  function formatTimestamp(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '時間未知';
    const pad = number => String(number).padStart(2, '0');
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function makeSnapshotId() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function defaultSnapshotName(savedAt) {
    return `配單 ${formatTimestamp(savedAt)}`;
  }

  function flashButton(button, text) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = text;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = original;
      updateCurrentBuildButtons();
    }, 900);
  }

  function saveCurrentBuildSnapshot() {
    const build = readCurrentBuild();
    const summary = buildSummary(build);
    if (!summary.count) {
      alert('目前配單是空的，沒有可暫存的內容。');
      return;
    }

    const savedAt = new Date().toISOString();
    const snapshot = {
      id: makeSnapshotId(),
      name: defaultSnapshotName(savedAt),
      saved_at: savedAt,
      build: JSON.parse(JSON.stringify(build)),
    };

    const savedBuilds = readSavedBuilds();
    savedBuilds.unshift(snapshot);
    if (!writeSavedBuilds(savedBuilds)) return;

    renderSavedBuilds();
    flashButton($('#saveBuildSnapshot'), '已暫存');
  }

  function startNewBuild() {
    if (currentEntries().length) {
      const confirmed = confirm('開新配單會清空「目前配單」，已暫存的配單不受影響。確定要繼續嗎？');
      if (!confirmed) return;
    }

    try {
      localStorage.removeItem(BUILD_KEY);
    } catch {}
    location.reload();
  }

  function loadSavedBuild(snapshot) {
    if (!snapshot?.build) return;
    if (currentEntries().length) {
      const confirmed = confirm('載入暫存配單會取代「目前配單」。若目前配單尚未暫存，變更會消失。確定載入嗎？');
      if (!confirmed) return;
    }

    try {
      localStorage.setItem(BUILD_KEY, JSON.stringify(snapshot.build));
    } catch {
      alert('載入配單失敗：瀏覽器儲存空間不可用。');
      return;
    }
    location.reload();
  }

  function renameSavedBuild(snapshotId) {
    const savedBuilds = readSavedBuilds();
    const snapshot = savedBuilds.find(item => item.id === snapshotId);
    if (!snapshot) return;

    const nextName = prompt('配單名稱', snapshot.name || '未命名配單');
    if (nextName == null) return;
    const trimmed = nextName.trim();
    if (!trimmed) return;

    snapshot.name = trimmed.slice(0, 80);
    if (writeSavedBuilds(savedBuilds)) renderSavedBuilds();
  }

  function deleteSavedBuild(snapshotId) {
    const savedBuilds = readSavedBuilds();
    const snapshot = savedBuilds.find(item => item.id === snapshotId);
    if (!snapshot) return;
    if (!confirm(`刪除「${snapshot.name || '未命名配單'}」？`)) return;

    const next = savedBuilds.filter(item => item.id !== snapshotId);
    if (writeSavedBuilds(next)) renderSavedBuilds();
  }

  function makeActionButton(label, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener('click', handler);
    return button;
  }

  function renderSavedBuilds() {
    const host = $('#savedBuildItems');
    const count = $('#savedBuildCount');
    if (!host || !count) return;

    const savedBuilds = readSavedBuilds();
    count.textContent = `(${savedBuilds.length})`;
    host.replaceChildren();

    if (!savedBuilds.length) {
      const empty = document.createElement('div');
      empty.className = 'saved-build-empty';
      empty.textContent = '尚未暫存任何配單。';
      host.appendChild(empty);
      return;
    }

    for (const snapshot of savedBuilds) {
      const summary = buildSummary(snapshot.build);
      const card = document.createElement('article');
      card.className = 'saved-build-card';

      const copy = document.createElement('div');
      copy.className = 'saved-build-copy';

      const name = document.createElement('strong');
      name.className = 'saved-build-name';
      name.textContent = snapshot.name || '未命名配單';

      const meta = document.createElement('div');
      meta.className = 'saved-build-meta';
      meta.textContent = `${summary.count} 項 · ${money.format(summary.total)} · ${formatTimestamp(snapshot.saved_at)}`;

      copy.append(name, meta);

      const actions = document.createElement('div');
      actions.className = 'saved-build-card-actions';
      actions.append(
        makeActionButton('載入', 'saved-build-load', () => loadSavedBuild(snapshot)),
        makeActionButton('改名', 'ghost', () => renameSavedBuild(snapshot.id)),
        makeActionButton('刪除', 'ghost danger', () => deleteSavedBuild(snapshot.id)),
      );

      card.append(copy, actions);
      host.appendChild(card);
    }
  }

  function updateCurrentBuildButtons() {
    const hasItems = currentEntries().length > 0;
    const saveButton = $('#saveBuildSnapshot');
    const newButton = $('#newBuild');
    if (saveButton) saveButton.disabled = !hasItems;
    if (newButton) newButton.disabled = !hasItems;
  }

  $('#saveBuildSnapshot')?.addEventListener('click', saveCurrentBuildSnapshot);
  $('#newBuild')?.addEventListener('click', startNewBuild);

  const buildItems = $('#buildItems');
  if (buildItems) {
    new MutationObserver(updateCurrentBuildButtons).observe(buildItems, { childList: true, subtree: true });
  }

  renderSavedBuilds();
  updateCurrentBuildButtons();
})();
