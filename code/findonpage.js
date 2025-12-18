/* findonpage.js - self-contained Find on page widget */
(function (global) {
  'use strict';

  // ---------- Config & tiny utils ----------
  const cfg = {
    ids: {
      bar: 'find-on-page',
      activate: 'activate-find-on-page',
      input: 'find-on-page-input',
      up: 'find-on-page-up',
      down: 'find-on-page-down',
      close: 'find-on-page-close',
      count: 'find-on-page-count',
    },
    highlightClass: 'find-on-page-highlight',
    currentClass: 'find-on-page-highlight-current',
  };

  const el = (id) => document.getElementById(id);
  const isOpen = () => {
    const bar = el(cfg.ids.bar);
    return !!bar && bar.style.display === 'flex';
  };
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const debounce = (fn, wait) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  };
  const isPWA = () =>
    global.matchMedia?.('(display-mode: standalone)')?.matches ||
    !!global.navigator.standalone;

  // If global removeHighlights (site-search) exists, we’ll use it.
  // Otherwise, fall back to locally removing .highlight spans only.
  const maybeRemoveSearchHighlights = () => {
    if (typeof global.removeHighlights === 'function') {
      try { global.removeHighlights(); return; } catch {}
    }
    document.querySelectorAll('.highlight').forEach((node) => {
      node.outerHTML = node.innerHTML;
    });
  };

  // ---------- State ----------
  let searchResults = [];
  let currentResultIndex = -1;

  // ---------- Layout helpers ----------
  function updateFindOnPagePosition() {
    const bar = el(cfg.ids.bar);
    if (!bar) return;
    if (global.visualViewport) {
      const { innerHeight } = global;
      const { height: vvHeight, offsetTop } = global.visualViewport;
      let kbHeight = innerHeight - (vvHeight + offsetTop);
      if (kbHeight < 0) kbHeight = 0;
      bar.style.bottom = kbHeight + 'px';
    } else {
      bar.style.bottom = '0';
    }
    if (isPWA()) bar.style.paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + 50px)';
  }

  // ---------- Highlighting ----------
  function clearHighlights() {
    document.querySelectorAll('.' + cfg.highlightClass).forEach((node) => {
      node.outerHTML = node.innerHTML;
    });
    searchResults = [];
    currentResultIndex = -1;
    updateSearchCount();
  }

  function updateSearchCount() {
    const countEl = el(cfg.ids.count);
    if (!countEl) return;
    if (searchResults.length > 0) {
      countEl.textContent = `${currentResultIndex + 1} of ${searchResults.length}`;
    } else {
      countEl.textContent = '0 of 0';
    }
  }

  function updateCurrentResultHighlight() {
    document.querySelectorAll('.' + cfg.currentClass).forEach((node) => {
      node.classList.remove(cfg.currentClass);
    });
    if (currentResultIndex >= 0 && currentResultIndex < searchResults.length) {
      searchResults[currentResultIndex].classList.add(cfg.currentClass);
    }
  }

  const isKeyboardOpen = () =>
    global.visualViewport && (global.innerHeight - global.visualViewport.height > 100);

  const isElementVisible = (node) =>
    !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);

  function scrollToCurrentResult() {
    if (currentResultIndex < 0 || currentResultIndex >= searchResults.length) return;
    const result = searchResults[currentResultIndex];
    const rect = result.getBoundingClientRect();
    const viewportH = global.visualViewport ? global.visualViewport.height : global.innerHeight;
    const scrollY = global.scrollY + rect.top - viewportH / 2 + rect.height / 2;
    global.scrollTo({ top: scrollY, behavior: isPWA() ? 'auto' : 'smooth' });
    updateCurrentResultHighlight();
  }

  function moveToNextResult() {
    if (!searchResults.length) return;
    currentResultIndex = (currentResultIndex + 1) % searchResults.length;
    scrollToCurrentResult();
    updateSearchCount();
    if (isKeyboardOpen()) el(cfg.ids.input)?.focus();
  }

  function moveToPreviousResult() {
    if (!searchResults.length) return;
    currentResultIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    scrollToCurrentResult();
    updateSearchCount();
    if (isKeyboardOpen()) el(cfg.ids.input)?.focus();
  }

  function performSearch() {
    clearHighlights();
    const input = el(cfg.ids.input);
    if (!input) return;
    const raw = (input.value || '').toLowerCase();
    if (!raw.length) return;

    const rx = new RegExp(escapeRegExp(raw), 'gi');
    const isInWidget = (el) => !!el && (el.closest?.('#' + cfg.ids.bar) || el.closest?.('#' + cfg.ids.activate));

    function highlightMatches(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const pe = node.parentElement;
        if (!pe || isInWidget(pe) || !isElementVisible(pe)) return;
        const text = node.textContent;
        const matches = text.match(rx);
        if (matches) {
          const frag = document.createDocumentFragment();
          let lastIndex = 0;
          for (let i = 0; i < matches.length; i++) {
            const m = matches[i];
            const index = text.indexOf(m, lastIndex);
            if (index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, index)));
            const span = document.createElement('span');
            span.className = cfg.highlightClass;
            span.textContent = m;
            frag.appendChild(span);
            searchResults.push(span);
            lastIndex = index + m.length;
          }
          if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
          node.parentNode.replaceChild(frag, node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (isInWidget(node)) return;
        const tn = node.tagName.toLowerCase();
        if (!isElementVisible(node)) return;
        if (['script','style','iframe','canvas','svg'].includes(tn) ||
        node.hasAttribute('contenteditable') || node.inert ||
        node.getAttribute('aria-hidden') === 'true') return;
        // Clone list because we mutate the DOM
        Array.from(node.childNodes).forEach(highlightMatches);
      }
    }

    highlightMatches(document.body);

    if (searchResults.length) {
      currentResultIndex = 0;
      scrollToCurrentResult();
    }
    updateSearchCount();
  }

  // ---------- Show/Hide ----------
  function show() {
    maybeRemoveSearchHighlights(); // clear site-search highlights (if present)
    const bar = el(cfg.ids.bar);
    const activator = el(cfg.ids.activate);
    if (bar) bar.style.display = 'flex';
    if (activator) activator.style.display = 'none';
    document.body.classList.add('find-on-page-active');

    const input = el(cfg.ids.input);
    if (input) {
      input.focus();
      if (input.value.trim() !== '') performSearch();
    }
    updateFindOnPagePosition();
  }

  function hide() {
    const bar = el(cfg.ids.bar);
    const activator = el(cfg.ids.activate);
    if (bar) bar.style.display = 'none';
    if (activator) activator.style.display = 'flex';
    document.body.classList.remove('find-on-page-active');
    clearHighlights();
  }

  // ---------- Wiring ----------
  function attachListeners() {
    const activator = el(cfg.ids.activate);
    const input = el(cfg.ids.input);
    const up = el(cfg.ids.up);
    const down = el(cfg.ids.down);
    const closeBtn = el(cfg.ids.close);

    if (activator) activator.addEventListener('click', show);

    if (input) {
      input.addEventListener('input', debounce(performSearch, 300));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? moveToPreviousResult() : moveToNextResult(); }
        else if (e.key === 'Escape') { e.preventDefault(); hide(); }
      });
    }

    if (up) up.addEventListener('click', moveToPreviousResult);
    if (down) down.addEventListener('click', moveToNextResult);
    if (closeBtn) closeBtn.addEventListener('click', hide);

    if (activator && global.visualViewport) {
      global.visualViewport.addEventListener('resize', updateFindOnPagePosition);
      global.visualViewport.addEventListener('scroll', updateFindOnPagePosition);
      global.addEventListener('focusin', updateFindOnPagePosition);
      global.addEventListener('focusout', () => setTimeout(updateFindOnPagePosition, 50));
      global.addEventListener('scroll', updateFindOnPagePosition);
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        e.preventDefault();
        hide();
      }
    });
  }

  function init(options) {
    if (options && options.ids) Object.assign(cfg.ids, options.ids);
    if (options && options.highlightClass) cfg.highlightClass = options.highlightClass;
    if (options && options.currentClass) cfg.currentClass = options.currentClass;
    attachListeners();
  }

  // Auto-init if elements exist
  document.addEventListener('DOMContentLoaded', () => {
    const bar = el(cfg.ids.bar) || el(cfg.ids.activate);
    if (bar) init();
  });
})(window);
