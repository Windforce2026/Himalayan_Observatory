/* ==========================================================================
   HIMALAYAN OBSERVATORY — Cinematic Launch Sequence Engine
   ==========================================================================
   Vanilla ES6 · no dependencies · requestAnimationFrame driven (60 fps)

   Sections
   01. Configuration & constants
   02. Utilities
   03. DOM references
   04. Space engine (stars · dust · falling celestial bodies · shooting
       stars · bursts · camera zoom)
   05. Mission sequence controller (percentage + messages)
   06. HUD updaters (UTC clock · mission status · engine gauge)
   07. Mission-ready completion sequence
   08. Boot
   ========================================================================== */

(() => {
  'use strict';

  /* ==================================================================
     01. CONFIGURATION & CONSTANTS
     ================================================================== */

  // Color palette mirrored from loader.css
  const COLORS = {
    white:    '#FFFFFF',
    grey:     '#A0AEC0',
    blue:     '#00D4FF',
    purple:   '#7A5CFF',
  };

  // One mission phase per loading message.
  // `to` is the target percentage, `dur` the duration (ms) of that phase.
  // Durations are kept tight so the full sequence runs in ~3.3s.
  const PHASES = [
    { msg: 'Initializing Observatory…',          to: 8,   dur: 300 },
    { msg: 'Connecting Telescope Array…',        to: 18,  dur: 320 },
    { msg: 'Loading Star Database…',             to: 30,  dur: 330 },
    { msg: 'Mapping Constellations…',            to: 42,  dur: 340 },
    { msg: 'Calculating Planet Positions…',      to: 55,  dur: 340 },
    { msg: 'Synchronizing Satellites…',          to: 68,  dur: 350 },
    { msg: 'Preparing Night Sky…',               to: 80,  dur: 350 },
    { msg: 'Generating Milky Way…',              to: 90,  dur: 360 },
    { msg: 'Calibrating Optical Systems…',       to: 99,  dur: 360 },
    { msg: 'Mission Ready',                      to: 100, dur: 250 },
  ];

  const MISSION_STATUS_BY_PCT = [
    [4,   'STANDBY'],
    [30,  'INITIATING'],
    [70,  'IN PROGRESS'],
    [97,  'FINALIZING'],
    [100, 'READY'],
  ];

  // Seconds between shooting-star spawns
  const SHOOTING_STAR_MIN = 2.2;
  const SHOOTING_STAR_MAX = 6.5;

  /* ==================================================================
     02. UTILITIES
     ================================================================== */

  const $ = (sel) => document.querySelector(sel);

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp  = (a, b, t) => a + (b - a) * t;
  const rand  = (min, max) => min + Math.random() * (max - min);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic  = (t) => t * t * t;
  const pad2  = (n) => String(n).padStart(2, '0');

  // Respect user motion preference once at boot
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Single shared mutable state for the whole sequence
  const state = {
    progress: 0,        // 0 .. 100 float
    done: false,        // mission finished
    readyShown: false,  // MISSION READY overlay mounted
    readyAt: 0,         // timestamp (s) when MISSION READY appeared
    zoomStart: 0,       // timestamp (s) when the camera zoom began
    zooming: false,     // camera-zoom transition active
    running: true,      // animation loops active
  };

  /* ==================================================================
     03. DOM REFERENCES
     ================================================================== */

  const dom = {
    loader:         $('#loader'),
    site:           $('#site'),
    canvas:         $('#space'),
    ctx:            $('#space').getContext('2d'),
    flash:          $('#flash'),
    missionMsg:     $('#missionMsg'),
    progressPct:    $('#progressPct'),
    progressBar:    $('#progressBar'),
    progressFill:   $('#progressFill'),
    systemStatus:   $('#systemStatus'),
    utcTime:        $('#utcTime'),
    missionStatus:  $('#missionStatus'),
    engineGauge:    $('#engineGauge'),
    enginePct:      $('#enginePct'),
    telemetry:      $('.telemetry'),
    stage:          $('.stage'),
  };

  /* ==================================================================
     04. SPACE ENGINE
     Renders the deep-space scene on a single canvas:
       · twinkling stars
       · drifting dust motes
       · shooting stars
       · falling 3D celestial objects (planets, ringed planets, moons,
         sparkle stars, wireframe telescopes)
       · star-burst + camera-zoom finale
     All data structures are plain arrays for fast iteration at 60 fps.
     ================================================================== */

  const Space = (() => {
    const canvas = dom.canvas;
    const ctx    = dom.ctx;
    const dpr    = Math.min(window.devicePixelRatio || 1, 2);

    let w = 0, h = 0, cx = 0, cy = 0;
    let stars = [];
    let dust  = [];
    let shooting = [];
    let burst = [];
    let celestials = [];

    // Proportional scale so celestial bodies stay prominent on large screens
    // (1.0 on phones, up to 2.0 on large/ultrawide monitors).
    let celSize = 1;

    /* --- palette schemes for planets --------------------------------- */
    const SCHEMES = [
      { base: '#2E6BFF', rim: '#0A2E8F', light: '#BFE9FF' },
      { base: '#7A5CFF', rim: '#3A1FB0', light: '#CFC2FF' },
      { base: '#0F9BB0', rim: '#04505E', light: '#9BE8F5' },
      { base: '#8A2BE2', rim: '#470A78', light: '#E0C4FF' },
      { base: '#4C7CFF', rim: '#142C80', light: '#B3D7FF' },
    ];

    /* --- resize ------------------------------------------------------ */
    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      cx = w / 2;
      cy = h / 2;
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      celSize = clamp(Math.min(w, h) / 667, 1, 2);
      buildStars();
      buildDust();
      buildCelestials();
    }

    /* --- star field -------------------------------------------------- */
    function buildStars() {
      // Density-aware count — richer on large screens, capped for performance
      const count = Math.round(clamp((w * h) / 1700, 260, 1100));
      stars = new Array(count);
      for (let i = 0; i < count; i++) {
        stars[i] = makeStar();
      }
    }

    function makeStar() {
      const palette = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#C8F6FF', '#D8CFFF'];
      return {
        x:      rand(0, w),
        y:      rand(0, h),
        r:      rand(0.3, 1.35),
        baseA:  rand(0.25, 1),
        twSpeed: rand(0.6, 2.6),
        twPhase: rand(0, Math.PI * 2),
        color:  palette[(Math.random() * palette.length) | 0],
      };
    }

    /* --- drifting dust particles -------------------------------------- */
    function buildDust() {
      const count = Math.round(clamp((w * h) / 24000, 18, 60));
      dust = new Array(count);
      for (let i = 0; i < count; i++) {
        dust[i] = {
          x:    rand(0, w),
          y:    rand(0, h),
          r:    rand(0.6, 2.2),
          vy:   rand(-12, -3),      // slow upward drift
          sway: rand(0.5, 2.2),     // horizontal oscillation
          phase: rand(0, Math.PI * 2),
          a:    rand(0.08, 0.3),
        };
      }
    }

    /* --- falling 3D celestial objects ---------------------------------
       A fixed pool that continuously falls from the top of the frame and
       respawns at the top once it exits the bottom — a steady meteor-like
       stream of planets, moons, ringed worlds, sparkle stars and
       wireframe telescopes. `z` gives depth: closer objects are bigger,
       faster and drawn on top. */
    function makeCelestial(spawnOffscreen) {
      const roll = Math.random();
      let type, baseR;
      if (roll < 0.22)      { type = 'planet';    baseR = rand(12, 26); }
      else if (roll < 0.38) { type = 'ringed';    baseR = rand(8, 17); }
      else if (roll < 0.56) { type = 'moon';      baseR = rand(6, 13); }
      else if (roll < 0.74) { type = 'star';      baseR = rand(5, 10); }
      else                  { type = 'scope';     baseR = rand(17, 27); }

      const z = rand(0.5, 1);
      return {
        type,
        x:      rand(0, w),
        y:      spawnOffscreen ? rand(-320, -40) : rand(0, h),
        z,
        r:      baseR * (0.55 + z * 0.75) * celSize,
        vy:     rand(16, 62) * (1.35 - z * 0.6) * (0.6 + celSize * 0.4), // falling speed (px / s)
        drift:  rand(0.25, 1.1),                   // horizontal sway speed
        phase:  rand(0, Math.PI * 2),
        rot:    rand(0, Math.PI * 2),
        rotSpeed: rand(-0.5, 0.5),                 // tumble while falling
        seed:   rand(0, Math.PI * 2),
        ringTilt: rand(0.15, 0.85),
        scheme: SCHEMES[(Math.random() * SCHEMES.length) | 0],
        a:      rand(0.5, 0.95),
      };
    }

    function buildCelestials() {
      // Density-aware pool — denser on large screens so the desktop
      // background feels as rich as the mobile one.
      const count = Math.round(clamp((w * h) / 70000, 6, 22));
      celestials = new Array(count);
      for (let i = 0; i < count; i++) {
        celestials[i] = makeCelestial(i > 4);
      }
    }

    /* --- shared sphere with a 3D-lit gradient -------------------------- */
    function drawSphere(px, py, r, scheme, alpha) {
      const g = ctx.createRadialGradient(
        px - r * 0.38, py - r * 0.42, r * 0.08,
        px, py, r * 1.02
      );
      g.addColorStop(0, scheme.light);
      g.addColorStop(0.45, scheme.base);
      g.addColorStop(1, scheme.rim);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawPlanet(o, t, px, py, r) {
      // soft atmosphere halo
      const halo = ctx.createRadialGradient(px, py, r * 0.55, px, py, r * 1.4);
      halo.addColorStop(0, o.scheme.base);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = o.a * 0.32;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.4, 0, Math.PI * 2);
      ctx.fill();

      drawSphere(px, py, r, o.scheme, o.a);

      // drifting cloud bands clipped to the sphere (fake rotation)
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = o.a * 0.5;
      for (let i = 0; i < 3; i++) {
        const off = Math.sin(t * 0.6 + o.seed + i * 1.9) * r * 0.28;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(4,14,48,0.34)';
        ctx.beginPath();
        ctx.ellipse(px, py + (i - 1) * r * 0.42 + off, r * 1.08, r * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawRinged(o, t, px, py, r) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(o.rot);

      // back half of the ring (drawn before the sphere → hidden mid-body)
      ctx.strokeStyle = `rgba(150,190,255,${0.32 * o.a})`;
      ctx.lineWidth = Math.max(1.5, r * 0.16);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.8, r * 0.52, o.ringTilt, 0, Math.PI);
      ctx.stroke();

      drawSphere(0, 0, r, o.scheme, o.a);

      // front half of the ring (drawn over the sphere)
      ctx.strokeStyle = `rgba(170,205,255,${0.72 * o.a})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.8, r * 0.52, o.ringTilt, Math.PI, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    function drawMoon(o, px, py, r) {
      drawSphere(px, py, r, {
        light: '#EFF3FA', base: '#C2CBD9', rim: '#5A6474',
      }, o.a);

      // craters
      ctx.globalAlpha = o.a * 0.55;
      ctx.fillStyle = 'rgba(38,48,70,0.35)';
      ctx.beginPath(); ctx.arc(px - r * 0.38, py - r * 0.22, r * 0.24, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + r * 0.3, py + r * 0.34, r * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + r * 0.08, py - r * 0.44, r * 0.12, 0, Math.PI * 2); ctx.fill();
    }

    function drawSparkleStar(o, t, px, py, r) {
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + o.seed);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(o.rot);

      ctx.strokeStyle = `rgba(255,255,255,${0.75 * tw * o.a})`;
      ctx.lineWidth = Math.max(1, r * 0.14);
      ctx.lineCap = 'round';
      const s = r * 1.7;
      ctx.beginPath();
      ctx.moveTo(0, -s); ctx.lineTo(0, s);
      ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
      ctx.stroke();

      ctx.strokeStyle = `rgba(0,212,255,${0.4 * tw * o.a})`;
      const d = s * 0.55;
      ctx.beginPath();
      ctx.moveTo(-d, -d); ctx.lineTo(d, d);
      ctx.moveTo(-d, d); ctx.lineTo(d, -d);
      ctx.stroke();
      ctx.restore();
    }

    function drawTelescope(o, px, py, r) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(o.rot);

      ctx.strokeStyle = `rgba(0,212,255,${0.5 * o.a})`;
      ctx.lineCap = 'round';
      ctx.fillStyle = `rgba(0,212,255,${0.08 * o.a})`;

      // tripod legs
      ctx.lineWidth = Math.max(1, r * 0.045);
      for (let i = 0; i < 3; i++) {
        const la = -Math.PI / 2 + (i - 1) * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * r * 0.85, Math.sin(la) * r * 0.85);
        ctx.stroke();
      }

      // mount hub
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();

      // main tube pointing up-left
      const ang = -0.85;
      const ex = Math.cos(ang) * r * 1.3;
      const ey = Math.sin(ang) * r * 1.3;
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // lens cell at the far end
      ctx.lineWidth = Math.max(1, r * 0.045);
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fill();

      // finder scope
      ctx.beginPath();
      ctx.moveTo(ex * 0.45, ey * 0.45);
      ctx.lineTo(ex * 1.05, ey * 1.05 + r * 0.28);
      ctx.stroke();

      ctx.restore();
    }

    function drawCelestial(o, t) {
      const { x, y, r, scheme } = o;
      switch (o.type) {
        case 'planet': drawPlanet(o, t, x, y, r); break;
        case 'ringed': drawRinged(o, t, x, y, r); break;
        case 'moon':   drawMoon(o, x, y, r); break;
        case 'star':   drawSparkleStar(o, t, x, y, r); break;
        case 'scope':  drawTelescope(o, x, y, r); break;
        default:       drawSphere(x, y, r, scheme, o.a);
      }
    }

    /* --- shooting star ------------------------------------------------ */
    function spawnShootingStar() {
      const angle = rand(0.15, 0.6) * Math.PI;           // mostly horizontal
      const speed = rand(420, 720);                      // px / s
      shooting.push({
        x:      rand(w * 0.1, w * 0.9),
        y:      rand(h * 0.05, h * 0.5),
        vx:     Math.cos(angle) * speed,
        vy:     Math.sin(angle) * speed,
        life:   0,
        max:    rand(0.8, 1.6),                          // seconds
        len:    rand(90, 170),
      });
    }

    /* --- star-burst at MISSION READY ---------------------------------- */
    function burstStars() {
      for (let i = 0; i < 44; i++) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(90, 420);
        burst.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          max: rand(0.8, 2),
          r: rand(1, 2.6),
          color: Math.random() < 0.6 ? COLORS.blue : COLORS.purple,
        });
      }
    }

    /* --- single frame -------------------------------------------------- */
    function draw(t, dt) {
      ctx.clearRect(0, 0, w, h);

      // Camera zoom: stars fly outward from the center toward the viewer
      const zoom = state.zooming
        ? 1 + 8 * easeInCubic(clamp((t - state.zoomStart) / 1.4, 0, 1))
        : 1;

      // Stars — twinkle via sine, fly outward during zoom
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const tw = 0.55 + 0.45 * Math.sin(t * s.twSpeed + s.twPhase);
        let a = s.baseA * tw;

        if (zoom > 1) {
          const px = cx + (s.x - cx) * zoom;
          const py = cy + (s.y - cy) * zoom;
          if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;
          a *= clamp(1.4 - (zoom - 1) * 0.06, 0, 1.4);
          ctx.globalAlpha = a;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(px, py, s.r * (0.7 + zoom * 0.06), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Dust — slow upward drift with horizontal sway
      for (let i = 0; i < dust.length; i++) {
        const p = dust[i];
        p.y += p.vy * dt;
        p.x += Math.sin(t * p.sway + p.phase) * 6 * dt;
        if (p.y < -6) { p.y = h + 6; p.x = rand(0, w); }
        ctx.globalAlpha = p.a;
        ctx.fillStyle = '#BFF3FF';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Falling celestial objects — 3D-looking bodies drift downward and
      // tumble; they respawn at the top once they exit the bottom.
      for (let i = 0; i < celestials.length; i++) {
        const o = celestials[i];
        o.y += o.vy * dt;
        o.x += Math.sin(t * o.drift + o.phase) * 12 * dt;
        o.rot += o.rotSpeed * dt;
        if (o.y - o.r > h + 60) {
          Object.assign(o, makeCelestial(true));
        }
      }
      celestials.sort((a, b) => a.z - b.z); // far → near

      for (let i = 0; i < celestials.length; i++) {
        const o = celestials[i];
        const pad = o.r * 2.4;
        if (o.y + pad < -40 || o.y - pad > h + 40) continue;
        if (o.x + pad < -40 || o.x - pad > w + 40) continue;
        drawCelestial(o, t);
      }

      // Shooting stars — gradient streak, fade over life
      for (let i = shooting.length - 1; i >= 0; i--) {
        const m = shooting[i];
        m.life += dt;
        if (m.life >= m.max) { shooting.splice(i, 1); continue; }
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        const fade = 1 - m.life / m.max;
        const nx = m.vx / Math.hypot(m.vx, m.vy);
        const ny = m.vy / Math.hypot(m.vx, m.vy);
        const tailX = m.x - nx * m.len;
        const tailY = m.y - ny * m.len;

        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        grad.addColorStop(1, `rgba(0,212,255,0)`);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      // Star-burst particles from MISSION READY
      for (let i = burst.length - 1; i >= 0; i--) {
        const p = burst[i];
        p.life += dt;
        if (p.life >= p.max) { burst.splice(i, 1); continue; }
        const fade = 1 - p.life / p.max;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = fade;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    /* --- loop ---------------------------------------------------------- */
    let last = performance.now();
    let spawnTimer = SHOOTING_STAR_MIN;

    function loop(now) {
      if (!state.running) return;
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;

      // Occasional shooting stars (skipped once we begin zooming)
      spawnTimer -= dt;
      if (!state.zooming && spawnTimer <= 0) {
        spawnShootingStar();
        spawnTimer = rand(SHOOTING_STAR_MIN, SHOOTING_STAR_MAX);
      }

      draw(now / 1000, dt);
      requestAnimationFrame(loop);
    }

    /* --- static render for reduced-motion ------------------------------ */
    function renderOnce() {
      draw(0, 0);
    }

    return { resize, loop, renderOnce, burstStars };
  })();

  /* ==================================================================
     05. MISSION SEQUENCE CONTROLLER
     Drives the percentage + message flow, eased per phase.
     ================================================================== */

  const Mission = (() => {
    let phase = 0;
    let phaseFrom = 0;
    let phaseElapsed = 0;
    let lastMsg = null;

    function currentPhase() { return PHASES[phase]; }

    function start() {
      phase = 0;
      phaseFrom = 0;
      phaseElapsed = 0;
      state.progress = 0;
      swapMessage(PHASES[0].msg);
    }

    /* Smooth fade between mission messages */
    function swapMessage(msg) {
      if (msg === lastMsg) return;
      lastMsg = msg;
      const el = dom.missionMsg;
      el.classList.add('is-hidden');
      setTimeout(() => {
        el.textContent = msg;
        el.classList.remove('is-hidden');
      }, 280);
    }

    /* Advance one step; returns true when the mission is complete */
    function update(dt) {
      if (state.done) return true;

      const p = currentPhase();
      phaseElapsed += dt * 1000; // dt arrives in seconds, durations are in ms
      const t = clamp(phaseElapsed / p.dur, 0, 1);
      state.progress = lerp(phaseFrom, p.to, easeOutCubic(t));

      if (phaseElapsed < p.dur) return false;

      if (phase < PHASES.length - 1) {
        phaseFrom = state.progress;
        phase++;
        phaseElapsed = 0;
        swapMessage(PHASES[phase].msg);
        return false;
      }

      state.progress = 100;
      state.done = true;
      return true;
    }

    return { start, update, swapMessage };
  })();

  /* ==================================================================
     06. HUD UPDATERS
     ================================================================== */

  /* Live UTC clock, synced every second */
  const Clock = (() => {
    function tick() {
      const d = new Date();
      dom.utcTime.textContent =
        `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
    }
    function start() {
      tick();
      setInterval(tick, 1000);
    }
    return { start };
  })();

  /* Reflects the current loading percentage across all HUD surfaces.
     DOM writes are gated so we only touch nodes when values actually move. */
  let lastRounded = -1;
  let lastWidth = -1;

  function updateHUD(pct) {
    const rounded = Math.round(pct);

    if (rounded !== lastRounded) {
      lastRounded = rounded;

      // Big center percentage (firstChild is the text node before the % sign)
      dom.progressPct.firstChild.textContent = String(rounded);
      dom.enginePct.textContent = rounded + '%';
      dom.progressBar.setAttribute('aria-valuenow', String(rounded));

      // Mission status label from thresholds
      let label = MISSION_STATUS_BY_PCT[MISSION_STATUS_BY_PCT.length - 1][1];
      for (const [threshold, text] of MISSION_STATUS_BY_PCT) {
        if (rounded <= threshold) { label = text; break; }
      }
      if (dom.missionStatus.textContent !== label) dom.missionStatus.textContent = label;
    }

    // Fractional width drives the smooth CSS-transitioned bars
    if (Math.abs(pct - lastWidth) >= 0.05) {
      lastWidth = pct;
      dom.progressFill.style.width = pct + '%';
      dom.engineGauge.style.width = pct + '%';
    }
  }

  /* ==================================================================
     07. MISSION-READY COMPLETION SEQUENCE
     100% → MISSION READY overlay → camera zoom → white flash → site.
     ================================================================== */

  const Completion = (() => {
    let fired = false;

    /* Build + reveal the MISSION READY overlay */
    function showReady() {
      state.readyAt = performance.now() / 1000;
      Space.burstStars();
      dom.loader.setAttribute('aria-busy', 'false');

      // Retire the telemetry block: drop the entrance animation's fill so the
      // inline styles below can fade it out, then remove it from layout.
      dom.telemetry.style.animation = 'none';
      dom.telemetry.style.transition = 'opacity .6s ease, transform .6s ease';
      dom.telemetry.style.opacity = '0';
      dom.telemetry.style.transform = 'translateY(10px)';
      setTimeout(() => { dom.telemetry.style.display = 'none'; }, 700);

      dom.systemStatus.textContent = 'READY';

      const overlay = document.createElement('div');
      overlay.className = 'mission-ready';
      overlay.setAttribute('role', 'group');
      overlay.setAttribute('aria-label', 'Mission ready');

      overlay.innerHTML = `
        <h2 class="mission-ready__title">MISSION READY</h2>
        <p class="mission-ready__welcome">Welcome to Himalayan Observatory</p>
        <button class="mission-ready__enter" type="button">Enter Observatory</button>
      `;

      dom.stage.appendChild(overlay);
      overlay.querySelector('.mission-ready__enter').addEventListener('click', enter);

      // Auto-enter after a short cinematic beat
      const delay = REDUCED_MOTION ? 500 : 1400;
      setTimeout(enter, delay);
    }

    /* The final transition into the homepage */
    function enter() {
      if (fired) return;
      fired = true;

      if (REDUCED_MOTION) {
        reveal();
        return;
      }

      state.zooming = true;
      state.zoomStart = performance.now() / 1000;
      dom.loader.classList.add('is-zooming');

      setTimeout(() => dom.flash.classList.add('is-lit'), 700);
      setTimeout(reveal, 1000);
    }

    function reveal() {
      dom.site.classList.add('is-visible');
      dom.site.setAttribute('aria-hidden', 'false');
      dom.loader.setAttribute('aria-hidden', 'true');
      state.running = false;

      dom.flash.classList.remove('is-lit');
      dom.flash.classList.add('is-fading');

      // Remove the loader from the stack once the site has mostly faded in
      setTimeout(() => dom.loader.classList.add('is-gone'), REDUCED_MOTION ? 0 : 600);

      // Hand over to the command-interface script (js/main.js)
      window.dispatchEvent(new CustomEvent('MISSION-READY'));

      // Move keyboard focus into the newly revealed homepage
      const title = dom.site.querySelector('h1');
      if (title) {
        title.setAttribute('tabindex', '-1');
        title.focus();
      }
    }

    return { showReady };
  })();

  /* ==================================================================
     10. BOOT
     ================================================================== */

  function boot() {
    // Canvas sizing + resize handling
    Space.resize();
    window.addEventListener('resize', Space.resize, { passive: true });

    // HUD clock
    Clock.start();

    // Start the mission
    Mission.start();
    updateHUD(0);

    // Kick off the animation loop (or a static frame for reduced motion)
    if (REDUCED_MOTION) {
      Space.renderOnce();
      setInterval(() => {
        if (Mission.update(0.12) && !state.readyShown) {
          state.readyShown = true;
          Completion.showReady();
        }
        updateHUD(state.progress);
      }, 120);
    } else {
      let last = performance.now();
      const frame = (now) => {
        if (!state.running) return;
        const dt = clamp((now - last) / 1000, 0, 0.05);
        last = now;

        // Mission + HUD update
        if (Mission.update(dt) && !state.readyShown) {
          state.readyShown = true;
          Completion.showReady();
        }
        updateHUD(state.progress);

        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      Space.loop();
    }
  }

  boot();
})();
