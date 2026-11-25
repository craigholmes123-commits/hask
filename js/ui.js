// Small DOM helpers, icons, bottom sheet and toast.
export { esc } from "./pinyin.js";

/** h("button.primary#go", {onclick}, "Start") */
export function h(spec, attrs = {}, ...children) {
  const m = spec.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || "div");
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === ".") el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = {};
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function html(str) {
  const t = document.createElement("template");
  t.innerHTML = str.trim();
  return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content;
}

// 24×24 stroke icons
const PATHS = {
  sound: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  slow: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 12h5"/>',
  today: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.5l2.2 2 4.3-4.5"/>',
  words: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16" stroke-dasharray="2 2"/>',
  practice: '<path d="M4 15c2.5-6 5-6 7.5 0s5 6 8.5-2"/><circle cx="4" cy="15" r="1"/>',
  guide: '<path d="M5 4.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H5z"/><path d="M19 4.5h-2.5M19 4.5V17.5h-2.5"/>',
  prefs: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M7 7l10 10M17 7L7 17"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.6 3-5.4 3.5-9.3 2.4 1.6 3.5 3.6 3.5 5.6 1-.6 1.6-1.7 1.8-2.9 2.3 1.9 4.2 4.1 4.2 6.8 0 3.4-2.5 6-6.5 6z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8.5-11H12.5z"/>',
  ear: '<path d="M7 9a5 5 0 0 1 10 0c0 3.5-3.5 4.5-3.5 7.5a3 3 0 0 1-5.5 1.5"/><path d="M10 9.5a2 2 0 0 1 4 0"/>',
  book: '<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/>',
  tone: '<path d="M3.5 7h4M9 17l4-10M15 7l2.5 5 2.5-5M3.5 17h0"/>',
  knot: '<path d="M12 4l3 3-3 3-3-3zM12 14l3 3-3 3-3-3zM4 12l3-3 3 3-3 3zM14 12l3-3 3 3-3 3z"/>',
  sync: '<path d="M19 8a7.5 7.5 0 0 0-13.5 1M5 16a7.5 7.5 0 0 0 13.5-1"/><path d="M19 3.5V8h-4.5M5 20.5V16h4.5"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>',
};

export function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}

// Pitch contour of a tone on Chao's five-level scale (used in the guide and tone buttons).
const CONTOURS = {
  1: [[8, 5], [52, 5]],
  2: [[8, 21], [52, 5]],
  3: [[8, 29], [28, 37], [52, 21]],
  4: [[8, 5], [52, 37]],
};
export function toneContour(t, { grid = false } = {}) {
  const lines = grid ? [5, 13, 21, 29, 37].map((y) => `<line x1="4" x2="56" y1="${y}" y2="${y}" class="grid"/>`).join("") : "";
  const pts = CONTOURS[t];
  const mark = pts
    ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" class="tone-line"/>`
    : `<circle cx="30" cy="27" r="4.5" class="tone-dot"/>`;
  return `<svg viewBox="0 0 60 42" class="contour" aria-hidden="true">${lines}${mark}</svg>`;
}

// ---------- toast ----------
let toastEl = null;
let toastTimer = null;
export function toast(message, ms = 2600) {
  if (!toastEl) {
    toastEl = h("div.toast", { role: "status", "aria-live": "polite" });
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

// ---------- bottom sheet / dialog ----------
const sheets = [];
export function openSheet(content, { label = "Details", onClose } = {}) {
  const scrim = h("div.scrim");
  const panel = h("div.sheet", { role: "dialog", "aria-modal": "true", "aria-label": label, tabindex: "-1" });
  const closeBtn = h("button.icon-btn.sheet-close", { type: "button", "aria-label": "Close", html: icon("close") });
  const body = h("div.sheet-body");
  body.append(content);
  panel.append(h("div.sheet-grip"), closeBtn, body);
  scrim.append(panel);
  document.body.append(scrim);
  document.body.classList.add("has-sheet");
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => {
    scrim.classList.add("open");
    panel.focus({ preventScroll: true });
  });
  const entry = { scrim, close };
  sheets.push(entry);
  function close() {
    const i = sheets.indexOf(entry);
    if (i < 0) return;
    sheets.splice(i, 1);
    scrim.classList.remove("open");
    setTimeout(() => scrim.remove(), 220);
    if (!sheets.length) document.body.classList.remove("has-sheet");
    prevFocus?.focus?.({ preventScroll: true });
    onClose?.();
  }
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) close();
  });
  return { close, body, panel };
}

export function closeTopSheet() {
  const top = sheets[sheets.length - 1];
  if (top) {
    top.close();
    return true;
  }
  return false;
}

export function anySheetOpen() {
  return sheets.length > 0;
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n, rand = Math.random) {
  return shuffle(arr, rand).slice(0, n);
}

export function plural(n, one, many = one + "s") {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
