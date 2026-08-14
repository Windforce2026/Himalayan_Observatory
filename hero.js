/* ============================================================
   HIMALAYAN OBSERVATORY — HERO
   Layered cinematic sky: canvas star field, Milky Way, shooting
   stars, dust; mouse + scroll parallax; GSAP intro; counters;
   optional Three.js nebula glow (graceful fallback).
   ============================================================ */
(function () {
  "use strict";

  var REDUCED = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var NO_GSAP = !window.gsap;
  if (NO_GSAP) document.body.classList.add("no-gsap");

  var hero = document.getElementById("hero");
  if (!hero) return;

  /* ---------- state ---------- */
  var W = 0, H = 0, DPR = 1;
  var smx = 0, smy = 0, tmx = 0, tmy = 0, mouseOn = false;
  var scrollP = 0;                    // 0..1 progress through the hero
  var started = false;                // intro done -> meteors begin
  var t0 = performance.now();
  var raf = null;
  var tLastMove = 0, tLastMeteor = 0;

  var starsEl = document.getElementById("stars");
  var milkyEl = document.getElementById("milky");
  var fxEl = document.getElementById("fx");
  var mountEl = document.getElementById("mountains");
  var contentEl = document.getElementById("content");
  var scrollEl = document.querySelector(".scrollcue");

  var animEnabled = window.gsap && !REDUCED;   // can we build keyframe animations

  /* ---------- util ---------- */
  function wrap(v, n) { return ((v % n) + n) % n; }
  function size(el, ctx) {
    el.width = Math.round(W * DPR); el.height = Math.round(H * DPR);
    el.style.width = W + "px"; el.style.height = H + "px";
    if (ctx) ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function glowSprite(radius, color) {
    var c = document.createElement("canvas");
    var r = radius + 8;
    c.width = c.height = radius * 2 + 16;
    var g = c.getContext("2d");
    var grad = g.createRadialGradient(r, r, 0, r, r, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
    return c;
  }

  /* ---------- Layer 2 : star field ---------- */
  var stars = [], starCtx = null;
  function buildStars() {
    var count = Math.min(3800, Math.round((W * H) / 1500) || 600);
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.25 + 0.2,
        spd: 0.5 + Math.random() * 2.2, ph: Math.random() * 6.2832,
        t: Math.random()
      });
    }
    starCtx = starsEl.getContext("2d");
    size(starsEl, starCtx);
  }
  function drawStars(t) {
    var ctx = starCtx, w = W, h = H;
    ctx.clearRect(0, 0, w, h);
    var ox = mouseOn ? smx * -30 : 0;
    var oy = mouseOn ? smy * -20 : 0;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = Math.min(1, 0.6 + 0.4 * Math.sin(t * 1.7 + s.ph));
      var col = s.t < 0.72 ? "222,240,255" : (s.t < 0.9 ? "184,170,255" : "255,222,168");
      var sx = wrap(s.x + ox, w), sy = wrap(s.y + oy, h);
      ctx.fillStyle = "rgba(" + col + "," + tw.toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, 6.2832); ctx.fill();
    }
  }

  /* ---------- Layer 3 : Milky Way ---------- */
  var milkyCtx = null, glowTeal, glowViolet, glowAmber, milkyDust = [], bandPos = 0;
  function buildMilky() {
    milkyCtx = milkyEl.getContext("2d");
    size(milkyEl, milkyCtx);
    glowTeal = glowSprite(40, "rgba(140,190,255,0.5)");
    glowViolet = glowSprite(46, "rgba(170,140,255,0.4)");
    glowAmber = glowSprite(30, "rgba(255,225,180,0.42)");
    milkyDust = [];
    for (var i = 0; i < 280; i++) {
      milkyDust.push({ x: Math.random() * W, y: Math.random() * H * 0.5 });
    }
  }
  function drawMilky(ts) {
    if (!milkyCtx) return;
    var ctx = milkyCtx, w = W, h = H;
    ctx.clearRect(0, 0, w, h);
    var bandY = h * 0.14, bandH = h * 0.36;
    bandPos += 0.35;
    var drift = mouseOn ? smx * -16 : 0;
    for (var i = 0; i < 44; i++) {
      var cx = wrap(i * 61 + bandPos + drift, w + 240) - 120;
      var cy = bandY + Math.sin(i * 0.6 + ts * 0.02) * bandH * 0.5;
      var size = 28 + (i % 6) * 18;
      var sprite = i % 3 === 0 ? glowAmber : (i % 3 === 1 ? glowTeal : glowViolet);
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(i * 1.7);
      ctx.drawImage(sprite, cx - size, cy - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < milkyDust.length; i++) {
      var d = milkyDust[i];
      var dx = wrap(d.x + drift, w);
      var a = 0.13 + Math.sin(ts * 0.5 + d.x) * 0.09;
      ctx.fillStyle = "rgba(220,235,255," + Math.max(0, a).toFixed(3) + ")";
      ctx.fillRect(dx, d.y, 1.7, 1.7);
    }
  }

  /* ---------- FX layer : dust motes + shooting stars ---------- */
  var fxCtx = null, dust = [], meteors = [];
  function buildFx() {
    fxCtx = fxEl.getContext("2d");
    size(fxEl, fxCtx);
    dust = [];
    for (var i = 0; i < 48; i++) {
      dust.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.4, vy: 0.07 + Math.random() * 0.2, ph: Math.random() * 6.3, sp: 0.004 + Math.random() * 0.012 });
    }
  }
  function drawFx(ms) {
    if (!fxCtx) return;
    var ctx = fxCtx, w = W, h = H;
    ctx.clearRect(0, 0, w, h);
    var ts = ms / 1000;
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      p.y -= p.vy; p.x += Math.sin(ts * p.sp + p.ph) * 0.22;
      if (p.y < -4) p.y = h + 4;
      if (p.x > w + 4) p.x = -4; else if (p.x < -4) p.x = w + 4;
      var a = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(ts * 2 + p.ph));
      ctx.fillStyle = "rgba(200,225,255," + a.toFixed(3) + ")";
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    for (i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.x += m.vx; m.y += m.vy; m.life++;
      var grd = ctx.createLinearGradient(m.x, m.y, m.x + m.vx * 10, m.y + m.vy * 10);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(1, "rgba(140,210,255,0)");
      ctx.strokeStyle = grd; ctx.lineWidth = 1.6; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x + m.vx * 22, m.y + m.vy * 22);
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.4, 0, 6.2832); ctx.fill();
      if (m.life > 48 || m.x < -80 || m.y > h + 40) meteors.splice(i, 1);
    }
  }
  function maybeSpawnMeteor(ms) {
    if (!started || REDUCED) return;
    if (ms - tLastMeteor < 2600 + Math.random() * 2200) return;
    tLastMeteor = ms;
    meteors.push({
      x: Math.random() * W * 0.8 + W * 0.05, y: Math.random() * H * 0.4 - 20,
      vx: -3.2 - Math.random() * 2.6, vy: 2.0 + Math.random() * 1.6, life: 0
    });
  }

  /* ---------- Constellation overlay ---------- */
  function buildConstellations() {
    var sky = document.getElementById("constellations");
    if (!sky) return;
    var html = "";
    for (var g = 0; g < 5; g++) {
      var pts = [], i, k;
      var n = 4 + (g % 3);
      var cx = Math.random() * 0.8 + 0.05, cy = Math.random() * 0.28 + 0.06;
      for (i = 0; i < n; i++) {
        pts.push([(cx + (Math.random() - 0.5) * 0.18) * 100, (cy + (Math.random() - 0.5) * 0.12) * 100]);
      }
      var lines = "";
      for (k = 0; k < pts.length - 1; k++) {
        lines += '<line x1="' + pts[k][0].toFixed(1) + '" y1="' + pts[k][1].toFixed(1) +
          '" x2="' + pts[k + 1][0].toFixed(1) + '" y2="' + pts[k + 1][1].toFixed(1) +
          '" stroke="#9fc6ff" stroke-opacity="0.5" stroke-width="0.6"/>';
      }
      var dots = pts.map(function (p2) {
        return '<circle cx="' + p2[0].toFixed(1) + '" cy="' + p2[1].toFixed(1) + '" r="1.1" fill="#e7f0ff"/>';
      }).join("");
      html += '<svg class="con" viewBox="0 0 100 100" preserveAspectRatio="none" style="animation-delay:' +
        (g * 1.7) + 's">' + lines + dots + '</svg>';
    }
    sky.innerHTML = html;
  }

  /* ---------- Satellite pass ---------- */
  function scheduleSatellite() {
    if (!animEnabled) return;
    var el = document.getElementById("satellite");
    if (!el) return;
    function pass() {
      gsap.timeline({ onComplete: scheduleSatellite })
        .set(el, { left: "-14%", top: (10 + Math.random() * 18) + "%", opacity: 0 })
        .to(el, { opacity: 0.85, duration: 0.6 })
        .to(el, { left: "114%", duration: 32 + Math.random() * 20, ease: "none" })
        .to(el, { opacity: 0, duration: 0.7 });
    }
    gsap.delayedCall(7 + Math.random() * 9, pass);
  }

  /* ---------- Magnetic buttons ---------- */
  function magnetic() {
    if (REDUCED) return;
    document.querySelectorAll(".btn").forEach(function (el) {
      var str = 26;
      el.addEventListener("mousemove", function (e) {
        var r = el.getBoundingClientRect();
        var dx = ((e.clientX - r.left - r.width / 2) / r.width) * str;
        var dy = ((e.clientY - r.top - r.height / 2) / r.height) * str;
        if (window.gsap) gsap.to(el, { x: dx, y: dy, duration: 0.4, ease: "power3.out" });
        else el.style.transform = "translate(" + dx + "px," + dy + "px)";
      });
      el.addEventListener("mouseleave", function () {
        if (window.gsap) gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1,0.5)" });
        else el.style.transform = "";
      });
    });
  }

  /* ---------- Live card animated values ---------- */
  function animateLive() {
    function setEl(sel, to, dec) {
      var el = document.querySelector(sel);
      if (!el || !animEnabled) {
        if (el) el.textContent = dec ? to.toFixed(dec) : String(to);
        return;
      }
      var obj = { v: 0 };
      gsap.to(obj, { v: to, duration: 1.8, ease: "power2.out", onUpdate: function () {
        el.textContent = dec ? obj.v.toFixed(dec) : Math.round(obj.v);
      } });
    }
    setEl('[data-live="moon"]', 92, 0);
    setEl('[data-live="seeing"]', 4.5, 1);
    setEl('[data-live="temp"]', -8, 0);
    setEl('[data-live="alt"]', 3650, 0);
    setEl('[data-live="astro"]', 98, 0);
    if (animEnabled) {
      gsap.to("#astroFill", { width: "98%", duration: 1.8, ease: "power2.out" });
    } else {
      var f = document.getElementById("astroFill"); if (f) f.style.width = "98%";
    }
  }

  /* ---------- Stats counters ---------- */
  function animateStats() {
    document.querySelectorAll(".stat__value").forEach(function (el) {
      var to = parseFloat(el.getAttribute("data-count") || "0");
      if (!animEnabled) { el.textContent = String(to); return; }
      gsap.fromTo(el, { textContent: 0 }, {
        textContent: to, duration: 2.2, ease: "power1.out", snap: { textContent: 1 }
      });
    });
  }

  /* ---------- Headline letter split ---------- */
  function splitHeadline() {
    document.querySelectorAll("#title .w").forEach(function (w) {
      if (w.querySelector(".l")) return;
      var txt = w.textContent;
      w.textContent = "";
      txt.split("").forEach(function (ch) {
        var s = document.createElement("span");
        s.className = "l";
        s.textContent = ch === " " ? "\u00A0" : ch;
        w.appendChild(s);
      });
    });
  }

  /* ---------- Static / reduced-motion reveal ---------- */
  function showStatic() {
    document.querySelectorAll("[data-reveal]").forEach(function (el) { el.style.opacity = 1; });
    document.querySelectorAll(".w").forEach(function (w) { w.style.transform = "none"; });
    document.body.classList.add("ready");
    started = true;
  }

  /* ---------- Intro timeline ---------- */
  function intro() {
    if (!animEnabled) { showStatic(); animateLive(); animateStats(); return; }
    splitHeadline();
    var tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: function () {
      document.body.classList.add("ready");
      started = true;
      animateLive();
      animateStats();
    } });
    tl.fromTo(".hero__space", { opacity: 0 }, { opacity: 1, duration: 1.4 }, 0)
      .fromTo(starsEl, { opacity: 0 }, { opacity: 1, duration: 1.6 }, 0)
      .to(milkyEl, { opacity: 1, duration: 2.0 }, 1.0)
      .to(fxEl, { opacity: 1, duration: 1.4 }, 1.4)
      .fromTo(".nebula", { opacity: 0 }, { opacity: 1, duration: 2.4, stagger: 0.3 }, 0)
      .to(".hero__golden", { opacity: 1, duration: 2.2 }, 0.6)
      .to(".brand", { opacity: 1, duration: 0.9 }, 0.7)
      .from(".eyebrow", { y: 18, autoAlpha: 0, duration: 0.7 }, 1.1)
      .from("#title .l", { yPercent: 130, rotateX: -50, autoAlpha: 0, duration: 0.7, stagger: 0.02 }, 1.4)
      .from("#dome .dome__telescope", { rotate: -34, duration: 2.6, ease: "power2.inOut" }, 1.8)
      .to(".dome__beam", { opacity: 1, duration: 1.6 }, 2.6)
      .to(".dome__slit", { opacity: 1, duration: 1 }, 2.2)
      .from("#lede", { autoAlpha: 0, y: 22, duration: 0.9 }, 2.2)
      .from(".cta .btn", { autoAlpha: 0, y: 34, scale: 0.96, duration: 0.9, stagger: 0.14 }, 2.35)
      .from("#livecard", { autoAlpha: 0, x: 60, duration: 1.1 }, 2.7)
      .from("#stats .stat", { autoAlpha: 0, y: 24, duration: 0.9, stagger: 0.1 }, 2.8)
      .from(".scrollcue", { autoAlpha: 0, y: 16, duration: 0.8 }, 3.2);
  }

  /* ---------- Main render loop ---------- */
  function loop() {
    var now = performance.now();
    var t = (now - t0) / 1000;
    if (mouseOn) { smx += (tmx - smx) * 0.06; smy += (tmy - smy) * 0.06; }
    else { smx *= 0.9; smy *= 0.9; }

    drawStars(t);
    maybeSpawnMeteor(now);
    drawFx(now);
    drawMilky(t);

    var mx = mouseOn ? smx : 0, my = mouseOn ? smy : 0;
    if (mountEl) mountEl.style.transform = "translate3d(" + (mx * -18) + "px," + (scrollP * -70 + my * -12) + "px,0)";
    if (contentEl) contentEl.style.transform = "translate3d(" + (mx * 10) + "px," + (scrollP * -96 + my * 8) + "px,0)";
    if (scrollEl) scrollEl.style.opacity = Math.max(0, 1 - scrollP * 2.6);

    raf = requestAnimationFrame(loop);
  }

  /* ---------- static paint (reduced motion) ---------- */
  function loopOnce() {
    drawStars(0); drawFx(0); drawMilky(0);
  }

  /* ---------- pointer events ---------- */
  function onPointer(e) {
    if (REDUCED || !W || !H) return;
    var x = e.touches ? e.touches[0].clientX : e.clientX;
    var y = e.touches ? e.touches[0].clientY : e.clientY;
    tmx = (x / W) * 2 - 1; tmy = (y / H) * 2 - 1;
    mouseOn = true;
  }
  function offPointer() { mouseOn = false; }

  document.addEventListener("mousemove", onPointer, { passive: true });
  document.addEventListener("touchmove", onPointer, { passive: true });
  document.addEventListener("mouseleave", offPointer);

  window.addEventListener("scroll", function () {
    if (REDUCED) return;
    var vh = hero.clientHeight || 1;
    scrollP = Math.min(1, window.scrollY / vh);
  }, { passive: true });

  window.addEventListener("resize", resize, { passive: true });

  /* ---------- Three.js nebular dust (optional) ---------- */
  function initThree() {
    if (REDUCED || !window.THREE) return;
    try {
      var canvas = document.createElement("canvas");
      canvas.className = "layer layer--three";
      canvas.style.zIndex = "-6";
      canvas.style.opacity = "1";
      milkyEl.parentNode.insertBefore(canvas, milkyEl);
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
      renderer.setClearColor(0x000000, 0);
      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(55, W / (H || 1), 0.1, 100);
      camera.position.z = 46;
      var geo = new THREE.BufferGeometry();
      var count = 1300, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
      var c = new THREE.Color();
      for (var i = 0; i < count; i++) {
        var th = Math.random() * 6.2832, r = 30 + Math.random() * 15;
        pos[i * 3] = Math.cos(th) * r;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
        pos[i * 3 + 2] = Math.sin(th) * r * 1.7;
        var pick = Math.random();
        if (pick < 0.5) c.setRGB(0.5, 0.7, 1); else if (pick < 0.8) c.setRGB(0.6, 0.5, 0.95); else c.setRGB(0.95, 0.75, 0.9);
        var a = 0.25 + Math.random() * 0.5;
        col[i * 3] = c.r * a; col[i * 3 + 1] = c.g * a; col[i * 3 + 2] = c.b * a;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      var mat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
      var points = new THREE.Points(geo, mat);
      var group = new THREE.Group();
      group.rotation.x = 0.28;
      group.add(points);
      scene.add(group);
      (function render3() {
        if (W && H) renderer.setSize(W, H, false);
        group.rotation.y += 0.0006;
        renderer.render(scene, camera);
        requestAnimationFrame(render3);
      })();
    } catch (e) { /* Three.js unavailable — background layers already cover it */ }
  }

  /* ---------- init ---------- */
  function resize() {
    W = hero.clientWidth; H = hero.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    buildStars(); buildMilky(); buildFx();
  }
  function init() {
    resize();
    buildConstellations();
    magnetic();
    scheduleSatellite();
    initThree();
    if (!REDUCED) raf = requestAnimationFrame(loop);
    else loopOnce();
    intro();
  }

  document.addEventListener("visibilitychange", function () {
    t0 = performance.now();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();