/* ==========================================================================
   HIMALAYAN OBSERVATORY — Command Interface Navigation
   ==========================================================================
   Vanilla ES6 · no dependencies · rAF-throttled scroll handler

   Sections
   01. Configuration & utilities
   02. DOM references
   03. Scroll behaviour (glass · compact · info bar)
   04. Search overlay
   05. Notification panel
   06. Mobile menu overlay
   07. Active-link tracking (IntersectionObserver + click)
   08. Keyboard support (menu arrows · focus trap · Escape)
   09. Boot
   ========================================================================== */

(() => {
  'use strict';

  /* ==================================================================
     01. CONFIGURATION & UTILITIES
     ================================================================== */

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ==================================================================
     02. DOM REFERENCES
     ================================================================== */

  const dom = {
    topbar:    $('#topbar'),
    nav:       $('#navbar'),
    page:      $('#page'),
    burger:    $('#burger'),
    mobileMenu: $('#mobileMenu'),
    mobileNav: $('#mobileNav'),
    searchBtn: $('#searchBtn'),
    searchOverlay: $('#searchOverlay'),
    searchForm: $('#searchForm'),
    searchInput: $('#searchInput'),
    searchClose: $('#searchClose'),
    searchSuggest: $('#searchSuggest'),
    searchHint:  $('#searchHint'),
    bellBtn:   $('#bellBtn'),
    bellBadge: $('#bellBadge'),
    notifPanel: $('#notifPanel'),
    notifList: $('#notifList'),
    notifClear: $('#notifClear'),
    menu:      $('#menu'),
    menuLinks: $$('.menu__link'),
    mobileLinks: $$('.mobile-menu__link'),
    fabStack:  $('#fabStack'),
    fabTop:    $('#fabTop'),
  };

  // Links on both surfaces, keyed by their hash target
  const ALL_LINKS = [...dom.menuLinks, ...dom.mobileLinks];

  /* ==================================================================
     03. SCROLL BEHAVIOUR
     · glass background after a few pixels
     · info bar slides away once you start reading
     · compact while scrolling down, expands while scrolling up
     ================================================================== */

  const Scroll = (() => {
    let lastY = 0;
    let ticking = false;

    // On index.html the homepage lives inside the fixed `#site` scroll
    // container; on the standalone navbar.html the window scrolls instead.
    const scrollEl = (() => {
      const site = document.getElementById('site');
      return site && site.classList.contains('site') ? site : window;
    })();

    function getY() {
      return scrollEl === window ? window.scrollY : scrollEl.scrollTop;
    }

    // Layered parallax on the Himalayan backdrop: the Milky Way and the
    // mountain ranges lag behind the page at different speeds (capped so
    // the silhouettes never expose the edge of the container).
    const backdrop = {
      milkyway: $('.site-space__milkyway'),
      ranges: $$('.site-space__range'),
    };
    const RANGE_SPEEDS = [0.1, 0.05, 0.02];
    const RANGE_CAPS  = [36, 24, 14];

    function applyParallax(y) {
      if (backdrop.milkyway) {
        backdrop.milkyway.style.setProperty('--mw-y', `${Math.min(y * 0.05, 90)}px`);
      }
      backdrop.ranges.forEach((el, i) => {
        const ty = Math.min(y * RANGE_SPEEDS[i], RANGE_CAPS[i]);
        el.style.transform = `translate3d(0, ${ty}px, 0)`;
      });
    }

    function onScroll() {
      const y = getY();
      applyParallax(y);

      // Glassmorphism once the page is scrolled
      dom.nav.classList.toggle('is-glass', y > 12);

      // Hide the thin info bar once content scrolls under the header
      dom.topbar.classList.toggle('is-hidden', y > 64);

      // Compact on scroll-down, expand on scroll-up, reset at the top
      if (y < 12) {
        dom.nav.classList.remove('is-compact');
      } else if (y > lastY + 2) {
        dom.nav.classList.add('is-compact');
      } else if (y < lastY - 2) {
        dom.nav.classList.remove('is-compact');
      }

      // Reveal the back-to-top FAB once you're down the page
      if (dom.fabStack) {
        dom.fabStack.classList.toggle('is-scrolled', y > 320);
      }

      lastY = y;
      ticking = false;
    }

    function request() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    }

    function init() {
      onScroll();
      scrollEl.addEventListener('scroll', request, { passive: true });

      // Smoothly glide back to the top of the site scroll container
      if (dom.fabTop) {
        dom.fabTop.addEventListener('click', () => {
          scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

      // Release the entrance animation once it finishes so the CSS
      // `.is-hidden` transform (slide-up) can take effect on scroll.
      dom.topbar.addEventListener('animationend', () => {
        dom.topbar.style.animation = 'none';
      });
    }

    return { init };
  })();

  /* ==================================================================
     04. SEARCH OVERLAY
     ================================================================== */

  const Search = (() => {
    let lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      dom.searchOverlay.classList.add('is-open');
      dom.searchOverlay.setAttribute('aria-hidden', 'false');
      dom.searchSuggest.setAttribute('aria-hidden', 'false');
      lockBody(true);
      setTimeout(() => dom.searchInput.focus(), 80);
    }

    function close() {
      dom.searchOverlay.classList.remove('is-open');
      dom.searchOverlay.setAttribute('aria-hidden', 'true');
      lockBody(false);
      dom.searchInput.value = '';
      dom.searchHint.textContent = 'Press Esc to close';
      if (lastFocused) lastFocused.focus();
    }

    function init() {
      dom.searchBtn.addEventListener('click', open);
      dom.searchClose.addEventListener('click', close);

      // Click the dimmed backdrop to close
      $('.search-overlay__bg').addEventListener('click', close);

      // Popular-search chips fill the input
      $$('.chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          dom.searchInput.value = chip.textContent.trim();
          dom.searchInput.focus();
        });
      });

      dom.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!dom.searchInput.value.trim()) return;

        // Simulate a scan, then dismiss with feedback
        dom.searchHint.textContent = 'Scanning deep space…';
        dom.searchInput.disabled = true;
        setTimeout(() => {
          dom.searchInput.disabled = false;
          close();
        }, 900);
      });
    }

    return { open, close, init, isOpen() { return dom.searchOverlay.classList.contains('is-open'); } };
  })();

  /* ==================================================================
     05. NOTIFICATION PANEL
     ================================================================== */

  const Notif = (() => {
    let open = false;

    function toggle() {
      open ? close() : openPanel();
    }

    function openPanel() {
      open = true;
      dom.notifPanel.classList.add('is-open');
      dom.notifPanel.setAttribute('aria-hidden', 'false');
      dom.bellBtn.setAttribute('aria-expanded', 'true');
      dom.bellBtn.classList.add('has-bell-ring');

      // Alerts are considered "read" once the panel is opened
      dom.bellBadge.style.display = 'none';
      $$('.notif__item--new').forEach((item) => item.classList.remove('notif__item--new'));
    }

    function close() {
      open = false;
      dom.notifPanel.classList.remove('is-open');
      dom.notifPanel.setAttribute('aria-hidden', 'true');
      dom.bellBtn.setAttribute('aria-expanded', 'false');
    }

    function clearAll() {
      dom.notifList.style.transition = 'opacity 0.3s ease';
      dom.notifList.style.opacity = '0';
      setTimeout(() => { dom.notifList.innerHTML = ''; }, 320);
    }

    function init() {
      dom.bellBtn.addEventListener('click', toggle);
      dom.notifClear.addEventListener('click', clearAll);
      dom.notifClear.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clearAll(); }
      });

      // Close when clicking outside the panel
      document.addEventListener('click', (e) => {
        if (!open) return;
        if (!dom.notifPanel.contains(e.target) && !dom.bellBtn.contains(e.target)) {
          close();
        }
      });
    }

    return { toggle, close, init, isOpen() { return open; } };
  })();

  /* ==================================================================
     06. MOBILE MENU OVERLAY
     ================================================================== */

  const MobileMenu = (() => {
    let open = false;
    let lastFocused = null;

    function toggle() {
      open ? close() : openPanel();
    }

    function openPanel() {
      open = true;
      lastFocused = document.activeElement;

      dom.mobileMenu.classList.add('is-open');
      dom.mobileMenu.setAttribute('aria-hidden', 'false');
      dom.burger.classList.add('is-open');
      dom.burger.setAttribute('aria-expanded', 'true');
      dom.burger.setAttribute('aria-label', 'Close menu');
      lockBody(true);

      setTimeout(() => dom.mobileNav.querySelector('a').focus(), 120);
    }

    function close() {
      open = false;

      dom.mobileMenu.classList.remove('is-open');
      dom.mobileMenu.setAttribute('aria-hidden', 'true');
      dom.burger.classList.remove('is-open');
      dom.burger.setAttribute('aria-expanded', 'false');
      dom.burger.setAttribute('aria-label', 'Open menu');
      lockBody(false);

      if (lastFocused) lastFocused.focus();
    }

    function init() {
      dom.burger.addEventListener('click', toggle);

      // Navigating to a section dismisses the menu
      dom.mobileLinks.forEach((link) => {
        link.addEventListener('click', () => {
          if (open) close();
        });
      });
    }

    return { toggle, close, init, isOpen() { return open; } };
  })();

  /* ==================================================================
     07. ACTIVE-LINK TRACKING
     Highlights the menu entry for the section currently in view.
     ================================================================== */

  const Active = (() => {
    let observer = null;

    function setActive(id) {
      ALL_LINKS.forEach((link) => {
        const isTarget = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', isTarget);
        if (isTarget) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }

    function init() {
      // A band across the middle of the viewport decides which section "wins"
      observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      }, { rootMargin: '-30% 0px -55% 0px', threshold: [0.05, 0.3, 0.6] });

      $$('.page section[id], .hero').forEach((section) => observer.observe(section));
    }

    return { init };
  })();

  /* ==================================================================
     08. KEYBOARD SUPPORT
     ================================================================== */

  /* Left / Right arrows navigate the desktop menu */
  function wireMenuArrows() {
    dom.menu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();

      const current = document.activeElement;
      const index = dom.menuLinks.indexOf(current);
      if (index === -1) return;

      const next = e.key === 'ArrowRight'
        ? (index + 1) % dom.menuLinks.length
        : (index - 1 + dom.menuLinks.length) % dom.menuLinks.length;

      dom.menuLinks[next].focus();
    });
  }

  /* Minimal focus trap so Tab cannot escape an open overlay */
  function trapFocus(container) {
    const focusables = container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  /* Global Escape handling + body scroll lock */
  let lockCount = 0;
  function lockBody(lock) {
    lockCount += lock ? 1 : -1;
    document.body.classList.toggle('is-locked', lockCount > 0);
  }

  function wireGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      // Close the topmost overlay first
      if (Search.isOpen()) Search.close();
      else if (MobileMenu.isOpen()) MobileMenu.close();
      else if (Notif.isOpen()) Notif.close();
    });
  }

  /* ==================================================================
     09. ACTIVATE / BOOT
     The command interface is wired up once its host is revealed.
     · index.html  → waits for the loader's MISSION-READY event
     · navbar.html → activates immediately on parse
     ================================================================== */

  let activated = false;

  function activate() {
    if (activated) return;
    activated = true;

    if (document.body.classList.contains('is-booting')) {
      document.body.classList.remove('is-booting');
    }

    // Kick off the hero entrance animations
    if (dom.page) dom.page.classList.add('is-active');

    Scroll.init();
    Search.init();
    Notif.init();
    MobileMenu.init();
    Active.init();
    wireMenuArrows();
    wireGlobalKeys();
    trapFocus(dom.searchOverlay);
    trapFocus(dom.mobileMenu);

    // Gentle bell ring shortly after load to draw the eye
    setTimeout(() => dom.bellBtn.classList.add('has-bell-ring'), 2600);
    setTimeout(() => dom.bellBtn.classList.remove('has-bell-ring'), 3800);
  }

  // If the loader is present, let it decide when the site is revealed.
  // A generous fallback guarantees the interface can never be trapped.
  if (document.getElementById('loader')) {
    window.addEventListener('MISSION-READY', activate, { once: true });
    setTimeout(() => {
      const loader = document.getElementById('loader');
      const site = document.getElementById('site');
      if (loader) {
        loader.classList.add('is-gone');
        loader.setAttribute('aria-hidden', 'true');
      }
      if (site) {
        site.classList.add('is-visible');
        site.setAttribute('aria-hidden', 'false');
      }
      activate();
    }, 15000);
  } else {
    activate();
  }
})();
