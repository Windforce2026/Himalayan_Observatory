/* ==========================================================================
   HIMALAYAN OBSERVATORY — Homepage Sections
   ==========================================================================
   Vanilla ES6 · no dependencies · IntersectionObserver + rAF throttling

   Modules
   01. Scroll reveal (fades sections up as they enter the viewport)
   02. Sky journey rail (arrow buttons · drag-to-scrub · progress)
   03. Live Sky meters (fill animation when the panel is in view)
   04. Astrophotography lightbox
   05. Final CTA cinematic zoom (slow drift on the closing scene)
   06. Calendar (renders the current month, highlights event days)
   07. Footer newsletter (non-networked confirmation)

   Data note: Live-sky and event values are client-editable placeholders.
   Connect a weather/astronomy API by replacing the values flagged
   "PLACEHOLDER" in index.html.
   ========================================================================== */

(() => {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ==================================================================
     01. SCROLL REVEAL
     Elements `.reveal` inside `.js-reveal` scopes fade up as they enter
     the viewport. The scope class is added from JS so content remains
     visible if scripts never run.
     ================================================================== */
  const Reveal = (() => {
    function init() {
      const scopes = $$('.section, .final-cta');
      scopes.forEach((el) => el.classList.add('js-reveal'));

      const items = $$('.section .reveal, .final-cta .reveal');

      if (!('IntersectionObserver' in window) || REDUCED) {
        items.forEach((el) => el.classList.add('is-inview'));
        return;
      }

      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-inview');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });

      items.forEach((el) => io.observe(el));
    }
    return { init };
  })();

  /* ==================================================================
     02. SKY JOURNEY RAIL
     Transform-based carousel with arrow buttons, pointer drag and a
     progress fill. Cards snap on a whole-card basis.
     ================================================================== */
  const SkyJourney = (() => {
    const rail = $('.skyjourney__rail');
    if (!rail) return { init() {} };

    const cards   = $$('.sky-dest', rail);
    const prev    = $('.skyjourney__btn--prev');
    const next    = $('.skyjourney__btn--next');
    const fill    = $('.skyjourney__progress-fill');
    const GAP     = 24;

    let index = 0;
    let drag = null;
    let lastDx = 0;

    function cardWidth(i) {
      return cards[i].getBoundingClientRect().width;
    }

    function offsetAt(i) {
      let o = 0;
      for (let j = 0; j < i; j++) o += cardWidth(j) + GAP;
      return o;
    }

    function snap() {
      rail.style.transform = `translate3d(${-offsetAt(index)}px, 0, 0)`;
      if (prev) prev.disabled = index === 0;
      if (next) next.disabled = index >= cards.length - 1;
      if (fill) fill.style.width = `${((index + 1) / cards.length) * 100}%`;
    }

    function step(dir) {
      index = Math.max(0, Math.min(cards.length - 1, index + dir));
      snap();
    }

    function init() {
      if (prev) prev.addEventListener('click', () => step(-1));
      if (next) next.addEventListener('click', () => step(1));

      rail.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      });

      const onDown = (e) => {
        if (REDUCED) return;
        drag = { x: e.clientX, base: offsetAt(index) };
        lastDx = 0;
        rail.classList.add('is-dragging');
      };

      const onMove = (e) => {
        if (!drag) return;
        lastDx = e.clientX - drag.x;
        rail.style.transform = `translate3d(${-drag.base + lastDx}px, 0, 0)`;
      };

      const onUp = () => {
        if (!drag) return;
        rail.classList.remove('is-dragging');
        if (Math.abs(lastDx) > 60) step(lastDx < 0 ? 1 : -1);
        else snap();
        drag = null;
      };

      if (window.PointerEvent) {
        rail.addEventListener('pointerdown', onDown);
        rail.addEventListener('pointermove', onMove);
        rail.addEventListener('pointerup', onUp);
        rail.addEventListener('pointercancel', onUp);
      } else {
        rail.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }

      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(snap, 120);
      });

      snap();
    }

    return { init };
  })();

  /* ==================================================================
     03. LIVE SKY METERS
     `data-fill` meters glide from 0 to their target once the panel is
     visible. Values are placeholders until an API is connected.
     ================================================================== */
  const LiveSky = (() => {
    function apply() {
      $$('.sky-live__meter-fill').forEach((m) => {
        const v = m.getAttribute('data-fill');
        if (v) m.style.width = `${v}%`;
      });
    }

    function init() {
      if (!$$('.sky-live__meter-fill').length) return;

      if (!('IntersectionObserver' in window) || REDUCED) { apply(); return; }

      const panel = $('.sky-live__panel');
      if (!panel) { apply(); return; }

      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            apply();
            io.disconnect();
          }
        });
      }, { threshold: 0.25 });

      io.observe(panel);
    }
    return { init };
  })();

  /* ==================================================================
     04. ASTROPHOTOGRAPHY LIGHTBOX
     Opens from `.gal-item` cards, reading title/description/art from
     data-attributes so each preview stays self-contained.
     ================================================================== */
  const Lightbox = (() => {
    let box = null;
    let lastFocused = null;
    let lockCount = 0;

    function lockBody(lock) {
      lockCount += lock ? 1 : -1;
      document.body.classList.toggle('is-locked', lockCount > 0);
    }

    function open(item) {
      lastFocused = document.activeElement;
      const art   = $('#lightboxArt');
      const title = $('#lightboxTitle');
      const desc  = $('#lightboxDesc');

      art.className = `lightbox__art gal-item__art--${item.dataset.art || 'milkyway'}`;
      title.textContent = item.dataset.title || '';
      desc.textContent  = item.dataset.desc || '';

      box.classList.add('is-open');
      box.setAttribute('aria-hidden', 'false');
      lockBody(true);

      const closeBtn = $('.lightbox__close', box);
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      if (!box || !box.classList.contains('is-open')) return;
      box.classList.remove('is-open');
      box.setAttribute('aria-hidden', 'true');
      lockBody(false);
      if (lastFocused) lastFocused.focus();
    }

    function init() {
      box = $('#lightbox');
      if (!box) return;

      const closeBtn = $('.lightbox__close', box);
      const bg       = $('.lightbox__bg', box);

      if (closeBtn) closeBtn.addEventListener('click', close);
      if (bg) bg.addEventListener('click', close);

      $$('.gal-item').forEach((item) => {
        item.addEventListener('click', () => open(item));
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(item);
          }
        });
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
    }

    return { init, close, isOpen() { return box && box.classList.contains('is-open'); } };
  })();

  /* ==================================================================
     05. FINAL CTA CINEMATIC ZOOM
     The closing scene slowly settles from a near approach as the section
     scrolls into view — a calm, camera-like drift.
     ================================================================== */
  const FinalZoom = (() => {
    function init() {
      const scene = $('.final-cta__scene');
      if (!scene || REDUCED) return;

      const site = $('.site');
      const scroller = site || window;
      let ticking = false;

      function update() {
        const r = scene.parentElement.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const p = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
        scene.style.transform = `scale(${(1.12 - 0.12 * p).toFixed(4)})`;
        ticking = false;
      }

      function request() {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(update);
        }
      }

      scroller.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request, { passive: true });
      request();
    }
    return { init };
  })();

  /* ==================================================================
     06. CALENDAR
     Renders the current month and highlights days that carry a
     matching `data-date` event in the events list. Stays in sync with
     the editable event cards automatically.
     ================================================================== */
  const Calendar = (() => {
    function init() {
      const grid = $('#calendarGrid');
      if (!grid) return;

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const today = now.getDate();

      const firstDow = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      const title = $('#calendarTitle');
      if (title) {
        title.textContent = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      }

      const eventDays = new Set();
      $$('.event').forEach((ev) => {
        const raw = ev.getAttribute('data-date');
        if (!raw) return;
        const [y, m, d] = raw.split('-').map(Number);
        if (y === year && m === month + 1) eventDays.add(d);
      });

      let html = '';
      for (let i = 0; i < firstDow; i++) {
        html += '<span class="calendar__day calendar__day--dim" aria-hidden="true"></span>';
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const cls = ['calendar__day'];
        if (eventDays.has(d)) cls.push('calendar__day--event');
        if (d === today) cls.push('calendar__day--today');
        html += `<span class="${cls.join(' ')}">${d}</span>`;
      }

      grid.insertAdjacentHTML('beforeend', html);
    }
    return { init };
  })();

  /* ==================================================================
     07. FOOTER NEWSLETTER
     No backend yet — confirms reception and clears the field.
     ================================================================== */
  const Newsletter = (() => {
    function init() {
      const form = $('.footer__newsletter');
      if (!form) return;

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $('.footer__newsletter-input', form);
        const note  = $('.footer__newsletter-note', form);
        if (!input || !input.value.trim()) return;

        input.value = '';
        if (note) {
          note.textContent = 'SIGNAL RECEIVED — WE\'LL SEND FORTHCOMING NIGHT-SKY ALERTS TO YOU.';
          note.style.color = 'var(--accent-blue)';
          setTimeout(() => { note.style.color = ''; }, 6000);
        }
      });
    }
    return { init };
  })();

  /* ==================================================================
     BOOT
     ================================================================== */
  function boot() {
    Reveal.init();
    SkyJourney.init();
    LiveSky.init();
    Lightbox.init();
    FinalZoom.init();
    Calendar.init();
    Newsletter.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();