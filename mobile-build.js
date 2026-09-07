(() => {
  'use strict';

  const media = window.matchMedia('(max-width: 840px)');
  const buildPanel = document.querySelector('.build');
  const buildHead = buildPanel?.querySelector('.build-head');
  const buildCount = document.querySelector('#buildCount');
  const totalPrice = document.querySelector('#totalPrice');

  if (!buildPanel || !buildHead || !buildCount || !totalPrice) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'mobile-build-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const bar = document.createElement('button');
  bar.id = 'mobileBuildBar';
  bar.className = 'mobile-build-bar';
  bar.type = 'button';
  bar.setAttribute('aria-controls', 'currentBuildPanel');
  bar.setAttribute('aria-expanded', 'false');
  bar.innerHTML = `
    <span class="mobile-build-bar-copy">
      <span class="mobile-build-bar-title">
        目前配單
        <span class="mobile-build-bar-count">0 項</span>
        <span class="mobile-build-conflict">有衝突</span>
      </span>
      <span class="mobile-build-bar-sub">點一下查看或切換已選零件</span>
    </span>
    <span class="mobile-build-bar-total">$0</span>
    <span class="mobile-build-bar-chevron" aria-hidden="true">↑</span>
  `;

  const closeButton = document.createElement('button');
  closeButton.className = 'mobile-build-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '關閉目前配單');
  closeButton.textContent = '×';

  buildPanel.id = buildPanel.id || 'currentBuildPanel';
  buildHead.appendChild(closeButton);
  document.body.append(backdrop, bar);

  const countLabel = bar.querySelector('.mobile-build-bar-count');
  const totalLabel = bar.querySelector('.mobile-build-bar-total');

  function isOpen() {
    return document.body.classList.contains('mobile-build-open');
  }

  function updateSummary() {
    const match = buildCount.textContent.match(/\d+/);
    const count = match ? Number(match[0]) : 0;
    countLabel.textContent = `${count} 項`;
    totalLabel.textContent = totalPrice.textContent || '$0';
    bar.classList.toggle('has-conflict', Boolean(buildPanel.querySelector('.build-item.has-conflict')));
    bar.setAttribute('aria-label', `目前配單 ${count} 項，總計 ${totalPrice.textContent || '$0'}，點一下查看`);
  }

  function openSheet() {
    if (!media.matches || isOpen()) return;

    document.body.classList.add('mobile-build-open');
    bar.setAttribute('aria-expanded', 'true');
    buildPanel.setAttribute('role', 'dialog');
    buildPanel.setAttribute('aria-modal', 'true');
    buildPanel.setAttribute('aria-label', '目前配單');

    if (!history.state?.mobileBuildSheet) {
      history.pushState({ ...(history.state || {}), mobileBuildSheet: true }, '');
    }

    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  }

  function closeVisual({ restoreFocus = true } = {}) {
    if (!isOpen()) return;

    document.body.classList.remove('mobile-build-open');
    bar.setAttribute('aria-expanded', 'false');
    buildPanel.removeAttribute('role');
    buildPanel.removeAttribute('aria-modal');
    buildPanel.removeAttribute('aria-label');

    if (restoreFocus && media.matches) {
      requestAnimationFrame(() => bar.focus({ preventScroll: true }));
    }
  }

  function closeSheet({ restoreFocus = true } = {}) {
    if (!isOpen()) return;
    closeVisual({ restoreFocus });
    if (history.state?.mobileBuildSheet) history.back();
  }

  bar.addEventListener('click', openSheet);
  backdrop.addEventListener('click', () => closeSheet());
  closeButton.addEventListener('click', () => closeSheet());

  buildPanel.addEventListener('click', event => {
    const jumpItem = event.target.closest('[data-jump-category]');
    if (!jumpItem || event.target.closest('[data-remove]')) return;
    closeSheet({ restoreFocus: false });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      closeSheet();
    }
  });

  window.addEventListener('popstate', () => {
    if (isOpen()) closeVisual({ restoreFocus: false });
  });

  const handleViewportChange = () => {
    if (!media.matches && isOpen()) closeVisual({ restoreFocus: false });
  };

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleViewportChange);
  } else {
    media.addListener(handleViewportChange);
  }

  const observer = new MutationObserver(updateSummary);
  observer.observe(buildPanel, { childList: true, subtree: true, characterData: true });
  updateSummary();
})();
