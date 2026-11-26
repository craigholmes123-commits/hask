// App shell: header (realm, spirit stones, 汉字/pīnyīn switch), the Qi line,
// navigation between the cultivator's places, and hash routing.
import { deckById, loadFile, loadMeta } from "./data.js";
import { claimableCount, qiNeed, realm, FINAL_REALM, tribulationReady } from "./game.js";
import { drawMountains } from "./fx.js";
import { initCloud, loadState, onChange, setSetting, state } from "./state.js";
import { initClaudeVoice, stopSpeaking } from "./speech.js";
import { anySheetOpen, closeTopSheet, h, icon } from "./ui.js";
import { renderCave } from "./views/cave.js";
import { renderDeck, renderWords } from "./views/words.js";
import { renderGuide } from "./views/guide.js";
import { renderListen, renderPractice, renderRead, renderSpeed, renderTones, startTricky, stopDrillKeys } from "./views/practice.js";
import { renderPrefs } from "./views/prefs.js";
import { renderSect } from "./views/sect.js";
import { endSession, hasSession, renderStudy, stopKeys } from "./views/study.js";
import { renderTreasury } from "./views/treasury.js";
import { renderTribulation, stopTribulationKeys } from "./views/tribulation.js";

const NAV = [
  ["cave", "cave", "洞府", "Cave"],
  ["library", "library", "藏经阁", "Library"],
  ["trials", "trials", "试炼", "Trials"],
  ["treasury", "treasury", "宝库", "Treasury"],
  ["sect", "sect", "宗门", "Sect"],
];

// old routes from before the cultivation update still work
const ALIASES = { today: "cave", words: "library", practice: "trials" };

const SCRIPT_MODES = [
  ["both", "汉字 + pīnyīn", "汉+pīn"],
  ["hanzi", "汉字", "汉字"],
  ["pinyin", "pīnyīn", "pīn"],
];

let main;
let navEl;
let scriptEl;
let statusEl;
let qiLine;

function currentRoute() {
  const r = location.hash.replace(/^#/, "") || "cave";
  return ALIASES[r] || r;
}

export function nav(route) {
  if (currentRoute() === route) render();
  else location.hash = route;
}

function applyDisplay() {
  const root = document.documentElement;
  root.classList.toggle("no-tones", !state.settings.toneColors);
  root.dataset.script = state.settings.script;
}

function buildShell() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  const header = h("header.topbar");
  const brand = h("a.brand", { href: "#cave", "aria-label": "Hask, your cave", html: `<span class="brand-mark" lang="zh-CN">学</span>` });
  statusEl = h("a.realm-chip", { href: "#cave" });
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
  qiLine = h("div.qi-line", { "aria-hidden": "true" }, h("i"));
  header.append(brand, statusEl, scriptEl, sync, qiLine);

  navEl = h("nav.tabbar", { "aria-label": "Main" });
  for (const [route, ic, zh, label] of NAV) {
    navEl.append(
      h("a.tab", { href: "#" + route, "data-route": route, html: `${icon(ic)}<span class="tab-zh" lang="zh-CN">${zh}</span><span class="tab-en">${label}</span><i class="tab-dot" hidden></i>` }),
    );
  }
  main = h("main#view", { tabindex: "-1" });
  app.append(header, navEl, main);
  updateScriptSwitch();
  updateStatus();
}

function updateScriptSwitch() {
  scriptEl?.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === state.settings.script)));
}

/** Realm chip, spirit stones and the Qi line under the header. */
function updateStatus() {
  const g = state.game;
  const r = realm(g.realm);
  const done = g.realm >= FINAL_REALM;
  const ready = tribulationReady();
  statusEl.innerHTML = `<span class="rc-realm" lang="zh-CN">${r.zh}${done ? "" : `<b>${g.stage}</b>`}</span><span class="rc-stones"><span class="res-ic stone" aria-hidden="true"></span>${g.stones.toLocaleString()}</span>`;
  statusEl.setAttribute("aria-label", `${r.name}${done ? "" : `, layer ${g.stage}`}, ${g.stones} spirit stones`);
  statusEl.classList.toggle("ready", ready);
  const frac = done ? 1 : Math.min(1, g.qi / qiNeed(g.realm, g.stage));
  qiLine.firstChild.style.width = `${(frac * 100).toFixed(1)}%`;
  qiLine.classList.toggle("ready", ready);
  const sectDot = navEl?.querySelector('[data-route="sect"] .tab-dot');
  if (sectDot) sectDot.hidden = claimableCount() === 0;
  const caveDot = navEl?.querySelector('[data-route="cave"] .tab-dot');
  if (caveDot) caveDot.hidden = !ready;
}

const SECTIONS = {
  library: "library",
  trials: "trials",
  treasury: "treasury",
  sect: "sect",
  guide: "sect",
  prefs: "sect",
  tribulation: "cave",
};

function updateNav(route) {
  const base = route.startsWith("deck-") ? "library" : route.startsWith("drill-") ? "trials" : SECTIONS[route] || "cave";
  navEl.querySelectorAll(".tab").forEach((a) => {
    if (a.dataset.route === base) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.body.dataset.route = route.startsWith("drill-") || route === "study" || route === "tribulation" ? "focus" : base;
}

let renderToken = 0;
async function render() {
  const route = currentRoute();
  const token = ++renderToken;
  stopKeys();
  stopDrillKeys();
  stopTribulationKeys();
  updateNav(route);
  const back = () => nav("cave");
  const toTrials = () => nav("trials");
  try {
    if (route === "cave") await renderCave(main, nav);
    else if (route === "library") await renderWords(main, nav);
    else if (route.startsWith("deck-")) await renderDeck(main, route.slice(5), nav);
    else if (route === "trials") await renderPractice(main, nav);
    else if (route === "treasury") renderTreasury(main);
    else if (route === "sect") renderSect(main);
    else if (route === "guide") await renderGuide(main);
    else if (route === "prefs") await renderPrefs(main);
    else if (route === "study") renderStudy(main, { onExit: back });
    else if (route === "tribulation") await renderTribulation(main, nav);
    else if (route === "drill-tones") await renderTones(main, toTrials);
    else if (route === "drill-listen") await renderListen(main, toTrials);
    else if (route === "drill-speed") await renderSpeed(main, toTrials);
    else if (route === "drill-read") await renderRead(main, toTrials);
    else if (route === "drill-tricky") await startTricky(nav);
    else {
      history.replaceState(null, "", "#cave");
      await renderCave(main, nav);
    }
  } catch (e) {
    console.error(e);
    if (token === renderToken) {
      main.innerHTML = "";
      main.append(h("div.page", h("h1", "Your Qi went astray"), h("p", e.message || String(e)), h("a.btn.primary", { href: "#cave", text: "Return to your cave" })));
    }
  }
  if (token === renderToken && route !== "study" && route !== "tribulation" && !route.startsWith("drill-")) {
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
  applyDisplay();
  drawMountains();
  buildShell();
  window.addEventListener("hashchange", () => {
    stopSpeaking();
    while (closeTopSheet()) {
      /* close any open sheet: it belonged to the page we're leaving */
    }
    if (currentRoute() !== "study" && hasSession() === false) endSession();
    render();
  });
  document.addEventListener("keydown", onKey);

  onChange((ev) => {
    if (ev.type === "game") {
      updateStatus();
    } else if (ev.type === "settings") {
      applyDisplay();
      updateScriptSwitch();
      const route = currentRoute();
      // re-render content that depends on how Chinese is shown
      if (["script", "toneColors"].includes(ev.key)) {
        if (route === "study" || route.startsWith("drill-")) refreshFaces();
        else if (route !== "tribulation") render();
      } else if (ev.key === "deck" && route === "library") render();
    } else if (ev.type === "sync") {
      const dot = document.querySelector(".sync-dot");
      if (dot) {
        dot.dataset.status = state.sync.status;
        dot.title = state.sync.status === "synced" ? "Progress synced" : state.sync.status === "syncing" ? "Syncing…" : "";
      }
    } else if (ev.type === "sync-pulled" || ev.type === "import" || ev.type === "reset") {
      applyDisplay();
      updateScriptSwitch();
      updateStatus();
      const route = currentRoute();
      if (route !== "study" && route !== "tribulation" && !route.startsWith("drill-")) render();
    }
  });

  render();
  // warm the most used data; the Top list is needed to measure Qi Refining comprehension
  loadMeta().catch(() => {});
  loadFile("top")
    .then(updateStatus)
    .catch(() => {});
  const d = deckById(state.settings.deck);
  if (d.kind === "hsk") loadFile("hsk" + d.level).catch(() => {});
  initCloud();
  initClaudeVoice();
  registerServiceWorker();
}

/** Inside a running session the script switch should not reset progress: re-render the same card. */
function refreshFaces() {
  document.documentElement.dataset.script = state.settings.script;
  if (currentRoute() === "study") renderStudy(main, { onExit: () => nav("cave") });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (window.claude || window.top !== window) return; // artifact viewer: not supported
  if (!/^https:$|^http:$/.test(location.protocol)) return;
  if (location.protocol === "http:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

boot();
