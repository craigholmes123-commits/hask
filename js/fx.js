// Visual effects: ink-wash mountains behind the app, floating Qi numbers,
// tribulation lightning, breakthrough banners and the dantian's qi motes.
const reduceMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- mountains ----------
let bgCanvas = null;
function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Layered ink-wash ridges, drawn once per resize (no animation). */
export function drawMountains() {
  if (!bgCanvas) {
    bgCanvas = document.createElement("canvas");
    bgCanvas.className = "ink-bg";
    bgCanvas.setAttribute("aria-hidden", "true");
    document.body.prepend(bgCanvas);
    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(drawMountains, 200);
    });
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  bgCanvas.width = Math.round(w * dpr);
  bgCanvas.height = Math.round(h * dpr);
  const c = bgCanvas.getContext("2d");
  c.scale(dpr, dpr);
  c.clearRect(0, 0, w, h);
  const layers = [
    { base: 0.5, amp: 0.16, alpha: 0.18, seed: 7 },
    { base: 0.62, amp: 0.13, alpha: 0.26, seed: 19 },
    { base: 0.74, amp: 0.1, alpha: 0.38, seed: 31 },
    { base: 0.86, amp: 0.07, alpha: 0.55, seed: 53 },
  ];
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ridge").trim() || "#2a3a33";
  for (const L of layers) {
    const r = rand(L.seed);
    // sum of a few sines with random phase = soft peaks
    const waves = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1) * (1.2 + r()), p: r() * Math.PI * 2, a: 1 / (i + 1.3) }));
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) {
      const u = x / w;
      let y = 0;
      for (const wv of waves) y += Math.sin(u * Math.PI * 2 * wv.f + wv.p) * wv.a;
      y = h * (L.base - L.amp * (0.5 + 0.5 * y) * 1.1);
      c.lineTo(x, y);
    }
    c.lineTo(w, h);
    c.closePath();
    const grad = c.createLinearGradient(0, h * (L.base - L.amp), 0, h);
    grad.addColorStop(0, hexA(ink, L.alpha));
    grad.addColorStop(1, hexA(ink, L.alpha * 0.25));
    c.fillStyle = grad;
    c.fill();
  }
}

function hexA(hex, a) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.replace(/./g, "$&$&") : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- floating numbers ----------
export function floatText(text, anchor, cls = "") {
  const el = document.createElement("div");
  el.className = `float-text ${cls}`;
  el.textContent = text;
  const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 3, width: 0 };
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1300);
}

// ---------- lightning ----------
export function lightning() {
  const flash = document.createElement("div");
  flash.className = "lightning";
  if (!reduceMotion()) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let x = w * (0.3 + Math.random() * 0.4);
    let pts = `${x},0`;
    for (let y = 0; y < h * 0.7; ) {
      y += 30 + Math.random() * 50;
      x += (Math.random() - 0.5) * 90;
      pts += ` ${x.toFixed(0)},${y.toFixed(0)}`;
    }
    flash.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" class="bolt-glow"/><polyline points="${pts}" class="bolt-core"/></svg>`;
  }
  document.body.append(flash);
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 450);
  setTimeout(() => flash.remove(), 700);
}

// ---------- banners ----------
export function banner(title, sub = "", tone = "jade") {
  const el = document.createElement("div");
  el.className = `banner banner-${tone}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<b></b><span></span>`;
  el.querySelector("b").textContent = title;
  el.querySelector("span").textContent = sub;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 400);
  }, 2600);
}

// ---------- dantian motes ----------
/** Motes of qi drifting inward around the dantian ring. Returns a stop function. */
export function qiMotes(canvas, intensity = 0.5) {
  const c = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const size = canvas.clientWidth || 240;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  c.scale(dpr, dpr);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--jade").trim() || "#5fcf9f";
  const n = Math.round(14 + 40 * intensity);
  const motes = Array.from({ length: n }, () => spawn(size, true));
  let raf = 0;
  let stopped = false;
  function frame() {
    if (stopped || !canvas.isConnected) return;
    c.clearRect(0, 0, size, size);
    for (const m of motes) {
      m.r -= m.v;
      m.a += m.w;
      if (m.r < size * 0.2) Object.assign(m, spawn(size));
      const x = size / 2 + Math.cos(m.a) * m.r;
      const y = size / 2 + Math.sin(m.a) * m.r;
      const fade = Math.min(1, (m.r - size * 0.2) / (size * 0.12));
      c.beginPath();
      c.fillStyle = hexA(color, 0.55 * fade);
      c.arc(x, y, m.s, 0, Math.PI * 2);
      c.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  if (reduceMotion()) {
    frame();
    cancelAnimationFrame(raf);
  } else frame();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}

function spawn(size, anywhere = false) {
  return {
    r: anywhere ? size * (0.22 + Math.random() * 0.28) : size * (0.42 + Math.random() * 0.08),
    a: Math.random() * Math.PI * 2,
    v: 0.12 + Math.random() * 0.25,
    w: 0.004 + Math.random() * 0.01,
    s: 0.8 + Math.random() * 1.8,
  };
}
