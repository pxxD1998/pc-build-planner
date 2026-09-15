(() => {
  'use strict';

  const button = document.querySelector('#backToCatalogTop');
  const tableWrap = document.querySelector('.table-wrap');
  const catalog = document.querySelector('.catalog');
  const topbar = document.querySelector('.topbar');
  const SHOW_AFTER = 360;

  if (!button || !tableWrap || !catalog) return;

  let ticking = false;

  function tableWrapUsesOwnScroll() {
    return tableWrap.scrollHeight > tableWrap.clientHeight + 1;
  }

  function currentCatalogScroll() {
    if (tableWrapUsesOwnScroll()) return Math.max(0, tableWrap.scrollTop);

    const tableTop = window.scrollY + tableWrap.getBoundingClientRect().top;
    return Math.max(0, window.scrollY - tableTop);
  }

  function setVisible(visible) {
    button.classList.toggle('visible', visible);
    button.setAttribute('aria-hidden', visible ? 'false' : 'true');
    button.tabIndex = visible ? 0 : -1;
  }

  function updateVisibility() {
    ticking = false;
    setVisible(currentCatalogScroll() > SHOW_AFTER);
  }

  function queueVisibilityUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateVisibility);
  }

  function scrollToCatalogTop() {
    if (tableWrapUsesOwnScroll()) {
      tableWrap.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
    const catalogTop = window.scrollY + catalog.getBoundingClientRect().top;
    window.scrollTo({
      top: Math.max(0, catalogTop - topbarHeight - 8),
      behavior: 'smooth'
    });
  }

  button.addEventListener('click', scrollToCatalogTop);
  tableWrap.addEventListener('scroll', queueVisibilityUpdate, { passive: true });
  window.addEventListener('scroll', queueVisibilityUpdate, { passive: true });
  window.addEventListener('resize', queueVisibilityUpdate, { passive: true });

  updateVisibility();
})();
