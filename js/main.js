// App shell: header with the 汉字/pīnyīn switch, navigation, hash routing.
import { deckById, loadFile, loadMeta } from "./data.js";
import { initCloud, loadState, onChange, setSetting, state } from "./state.js";
import { initClaudeVoice, stopSpeaking } from "./speech.js";
import { anySheetOpen, closeTopSheet, h, icon } from "./ui.js";
import { renderDeck, renderWords } from "./views/words.js";
import { renderGuide } from "./views/guide.js";
import { renderListen, renderPractice, renderRead, renderSpeed, renderTones, startTricky, stopDrillKeys } from "./views/practice.js";
import { renderPrefs } from "./views/prefs.js";
import { endSession, hasSession, renderStudy, stopKeys } from "./views/study.js";
import { renderToday } from "./views/today.js";

const NAV = [
  ["today", "today", "Today"],
  ["words", "words", "Words"],
  ["practice", "practice", "Practice"],
  ["guide", "guide", "Guide"],
  ["prefs", "prefs", "Prefs"],
];

const SCRIPT_MODES = [
  ["both", "汉字 + pīnyīn", "汉+pīn"],
  ["hanzi", "汉字", "汉字"],
  ["pinyin", "pīnyīn", "pīn"],
];

let main;
let navEl;
let scriptEl;

function currentRoute() {
  const r = location.hash.replace(/^#/, "");
  return r || "today";
}

export function nav(route) {
  if (currentRoute() === route) render();
  else location.hash = route;
}

function applyTheme() {
  const root = document.documentElement;
  const t = state.settings.theme;
  if (t === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  root.classList.toggle("no-tones", !state.settings.toneColors);
  root.dataset.script = state.settings.script;
}

function buildShell() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const header = h("header.topbar");
  const brand = h("a.brand", { href: "#today", "aria-label": "Hask, today", html: `<span class="brand-mark" lang="zh-CN">学</span><span class="brand-name">Hask</span>` });
  scriptEl = h("div.script-switch", { role: "radiogroup", "aria-label": "Show Chinese as" });
  for (const [mode, long, short] of SCRIPT_MODES) {
    const b = h("button", {
      type: "button",
      role: "radio",
      "data-mode": mode,
      html: `<span class="long" lang="zh-CN">${long}</span><span class="short" lang="zh-CN">${short}</span>`,
    });
    b.setAttribute("aria-label", mode === "both" ? "Characters and pinyin" : mode === "hanzi" ? "Characters only" : "Pinyin only");
    b.addEventListener("click", () => setSetting("script", mode));
    scriptEl.append(b);
  }
  const sync = h("span.sync-dot", { title: "", "aria-hidden": "true" });
  header.append(brand, scriptEl, sync);

  navEl = h("nav.tabbar", { "aria-label": "Main" });
  for (const [route, ic, label] of NAV) {
    navEl.append(h("a.tab", { href: "#" + route, "data-route": route, html: `${icon(ic)}<span>${label}</span>` }));
  }
  main = h("main#view", { tabindex: "-1" });
  app.append(header, navEl, main);
  updateScriptSwitch();
}

function updateScriptSwitch() {
  scriptEl?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.settings.script)));
}

function updateNav(route) {
  const base = route.startsWith("deck-") ? "words" : route.startsWith("drill-") ? "practice" : route;
  navEl.querySelectorAll(".tab").forEach((a) => {
    if (a.dataset.route === base) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.body.dataset.route = route.startsWith("drill-") || route === "study" ? "focus" : base;
}

let renderToken = 0;
async function render() {
  const route = currentRoute();
  const token = ++renderToken;
  stopKeys();
  stopDrillKeys();
  if (route !== "study" && hasSession()) {
    /* leaving mid-session keeps it for later */
  }
  updateNav(route);
  const back = () => nav("today");
  const toPractice = () => nav("practice");
  try {
    if (route === "today") await renderToday(main, nav);
    else if (route === "words") await renderWords(main, nav);
    else if (route.startsWith("deck-")) await renderDeck(main, route.slice(5), nav);
    else if (route === "practice") await renderPractice(main, nav);
    else if (route === "guide") await renderGuide(main);
    else if (route === "prefs") await renderPrefs(main);
    else if (route === "study") renderStudy(main, { onExit: back });
    else if (route === "drill-tones") await renderTones(main, toPractice);
    else if (route === "drill-listen") await renderListen(main, toPractice);
    else if (route === "drill-speed") await renderSpeed(main, toPractice);
    else if (route === "drill-read") await renderRead(main, toPractice);
    else if (route === "drill-tricky") await startTricky(nav);
    else {
      history.replaceState(null, "", "#today");
      await renderToday(main, nav);
    }
  } catch (e) {
    console.error(e);
    if (token === renderToken) {
      main.innerHTML = "";
      main.append(h("div.page", h("h1", "Something went wrong"), h("p", e.message || String(e)), h("a.btn.primary", { href: "#today", text: "Back to Today" })));
    }
  }
  if (token === renderToken && !["study"].includes(route) && !route.startsWith("drill-")) {
    window.scrollTo({ top: 0 });
  }
}

function onKey(e) {
  if (e.key === "Escape" && anySheetOpen()) {
    closeTopSheet();
    e.preventDefault();
  }
}

function boot() {
  loadState();
  applyTheme();
  buildShell();
  window.addEventListener("hashchange", () => {
    stopSpeaking();
    if (currentRoute() !== "study" && hasSession() === false) endSession();
    render();
  });
  document.addEventListener("keydown", onKey);

  onChange((ev) => {
    if (ev.type === "settings") {
      applyTheme();
      updateScriptSwitch();
      const route = currentRoute();
      // re-render content that depends on how Chinese is shown
      if (["script", "toneColors"].includes(ev.key)) {
        if (route === "study" || route.startsWith("drill-")) refreshFaces();
        else render();
      } else if (ev.key === "deck" && route === "words") render();
    } else if (ev.type === "sync") {
      const dot = document.querySelector(".sync-dot");
      if (dot) {
        dot.dataset.status = state.sync.status;
        dot.title = state.sync.status === "synced" ? "Progress synced" : state.sync.status === "syncing" ? "Syncing…" : "";
      }
    } else if (ev.type === "sync-pulled" || ev.type === "import" || ev.type === "reset") {
      applyTheme();
      updateScriptSwitch();
      const route = currentRoute();
      if (route !== "study" && !route.startsWith("drill-")) render();
    }
  });

  render();
  // warm the most used data
  loadMeta().catch(() => {});
  loadFile("top").catch(() => {});
  const d = deckById(state.settings.deck);
  if (d.kind === "hsk") loadFile("hsk" + d.level).catch(() => {});
  initCloud();
  initClaudeVoice();
  registerServiceWorker();
}

/** Inside a running drill or session the script switch should not reset progress: swap faces in place. */
function refreshFaces() {
  document.documentElement.dataset.script = state.settings.script;
  const route = currentRoute();
  if (route === "study") renderStudy(main, { onExit: () => nav("today") });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.claude || window.top !== window) return; // artifact viewer: not supported
  if (!/^https:$|^http:$/.test(location.protocol)) return;
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
