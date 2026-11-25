// App state: settings, per-word progress, daily activity.
// Saved to localStorage on this device; when the page runs inside a claude.ai
// artifact viewer with the `db` capability, also synced to the viewer's own
// private documents so progress follows them between phone and desktop.
import { dayKey, newCard } from "./srs.js";

const LS_KEY = "hask.v1";
const BUCKETS = 16;

export const DEFAULT_SETTINGS = {
  script: "both", // both | hanzi | pinyin
  toneColors: true,
  dailyNew: 10,
  sessionSize: 20,
  answerStyle: "mixed", // mixed | choice | flip
  order: "frequency", // frequency | official
  autoplay: true,
  rate: 0.8,
  voice: "",
  theme: "auto", // auto | light | dark
  deck: "top100",
  level: "beginner",
};

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  for (const fn of listeners) {
    try {
      fn(what);
    } catch (e) {
      console.error(e);
    }
  }
}

export const state = {
  settings: { ...DEFAULT_SETTINGS },
  settingsUpdated: 0,
  cards: {}, // key -> card
  days: {}, // YYYY-MM-DD -> {n: new words, r: reviews, c: correct, ms: time studied}
  tones: {}, // tone pattern ("3", "21") -> [right, total]
  best: {}, // drill -> best score
  resetAt: 0, // when progress was last erased (propagates to other devices)
  sync: { status: "local", at: 0 }, // local | syncing | synced | offline
};

// ---------- local persistence ----------
function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let saveTimer = null;
let localDirty = false;
function saveLocal() {
  localDirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeLocalNow, 250);
}
/**
 * Persist to localStorage. Another tab may have saved in the meantime, so its
 * newer cards are merged in first (unless `replace`, used by reset).
 */
function writeLocalNow({ force = false, replace = false } = {}) {
  clearTimeout(saveTimer);
  if (!localDirty && !force) return;
  localDirty = false;
  if (!replace) {
    const other = readLocal();
    if (other) mergeSnapshot(other);
  }
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        v: 1,
        settings: state.settings,
        settingsUpdated: state.settingsUpdated,
        cards: state.cards,
        days: state.days,
        tones: state.tones,
        best: state.best,
        resetAt: state.resetAt,
      }),
    );
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function loadState() {
  const saved = readLocal();
  if (saved) applySnapshot(saved);
}

function mergeSnapshot(saved) {
  applyReset(saved.resetAt);
  mergeCards(Object.fromEntries(Object.entries(saved.cards || {}).filter(([, c]) => (c.u || 0) >= (state.resetAt || 0))));
  mergeDays(saved.days || {});
  if ((saved.settingsUpdated || 0) > state.settingsUpdated) {
    state.settings = { ...DEFAULT_SETTINGS, ...saved.settings };
    state.settingsUpdated = saved.settingsUpdated;
  }
  for (const [k, v] of Object.entries(saved.tones || {})) {
    const cur = state.tones[k] || [0, 0];
    if (v[1] > cur[1]) state.tones[k] = [...v];
  }
  for (const [k, v] of Object.entries(saved.best || {})) state.best[k] = Math.max(state.best[k] || 0, v);
}

function applySnapshot(saved) {
  state.settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  state.settingsUpdated = saved.settingsUpdated || 0;
  state.cards = saved.cards || {};
  state.days = saved.days || {};
  state.tones = saved.tones || {};
  state.best = saved.best || {};
  state.resetAt = saved.resetAt || 0;
}

// ---------- settings ----------
export function setSetting(key, value) {
  if (state.settings[key] === value) return;
  state.settings[key] = value;
  state.settingsUpdated = Date.now();
  saveLocal();
  markDirty("meta");
  emit({ type: "settings", key });
}

// ---------- cards ----------
export function getCard(key) {
  return state.cards[key] || null;
}

export function putCard(key, card) {
  card.u = Date.now();
  state.cards[key] = card;
  saveLocal();
  markDirty(bucketOf(key));
  emit({ type: "card", key });
}

export function resetCard(key) {
  state.cards[key] = { ...newCard(), u: Date.now() };
  saveLocal();
  markDirty(bucketOf(key));
  emit({ type: "card", key });
}

// ---------- activity ----------
export function today() {
  const k = dayKey();
  if (!state.days[k]) state.days[k] = { n: 0, r: 0, c: 0, ms: 0 };
  return state.days[k];
}

/** New words still allowed today: the daily goal plus any one-off extra for today. */
export function newAllowance() {
  const d = today();
  return Math.max(0, state.settings.dailyNew + (d.b || 0) - d.n);
}

/** Allow a few extra new words today only. */
export function addBonusNew(n) {
  const d = today();
  d.b = (d.b || 0) + n;
  saveLocal();
  markDirty("meta");
}

export function logActivity({ isNew = false, correct = null, ms = 0 } = {}) {
  const d = today();
  if (isNew) d.n += 1;
  if (correct !== null) {
    d.r += 1;
    if (correct) d.c += 1;
  }
  d.ms += Math.min(ms, 60000);
  saveLocal();
  markDirty("meta");
}

export function logTone(pattern, right) {
  const t = state.tones[pattern] || [0, 0];
  t[1] += 1;
  if (right) t[0] += 1;
  state.tones[pattern] = t;
  saveLocal();
  markDirty("meta");
}

export function setBest(drill, score) {
  if ((state.best[drill] || 0) >= score) return false;
  state.best[drill] = score;
  saveLocal();
  markDirty("meta");
  return true;
}

/** Consecutive study days ending today (or yesterday if today has no activity yet). */
export function streak() {
  let count = 0;
  const d = new Date();
  d.setHours(d.getHours() - 4);
  const key = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const studied = (k) => {
    const v = state.days[k];
    return v && (v.r > 0 || v.n > 0);
  };
  if (!studied(key(d))) d.setDate(d.getDate() - 1);
  while (studied(key(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

// ---------- export / import ----------
export function exportJSON() {
  writeLocalNow({ force: true });
  return JSON.stringify({ app: "hask", v: 1, exported: new Date().toISOString(), ...readLocal() });
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !data.cards) throw new Error("This file has no saved progress in it.");
  mergeSnapshot(data);
  writeLocalNow({ force: true });
  markAllDirty();
  emit({ type: "import" });
}

export function resetAll() {
  state.cards = {};
  state.days = {};
  state.tones = {};
  state.best = {};
  state.resetAt = Date.now();
  writeLocalNow({ force: true, replace: true });
  markAllDirty();
  emit({ type: "reset" });
}

/** A reset on another device: forget everything older than it. */
function applyReset(at) {
  if (!at || at <= (state.resetAt || 0)) return;
  state.resetAt = at;
  for (const [k, c] of Object.entries(state.cards)) if ((c.u || 0) < at) delete state.cards[k];
  state.days = {};
  state.tones = {};
  state.best = {};
}

function mergeCards(incoming) {
  let changed = 0;
  for (const [k, c] of Object.entries(incoming)) {
    const cur = state.cards[k];
    if (!cur || (c.u || 0) > (cur.u || 0)) {
      state.cards[k] = c;
      changed++;
    }
  }
  return changed;
}

function mergeDays(incoming) {
  for (const [k, v] of Object.entries(incoming)) {
    const cur = state.days[k] || { n: 0, r: 0, c: 0, ms: 0 };
    state.days[k] = {
      n: Math.max(cur.n, v.n || 0),
      r: Math.max(cur.r, v.r || 0),
      c: Math.max(cur.c, v.c || 0),
      ms: Math.max(cur.ms, v.ms || 0),
      b: Math.max(cur.b || 0, v.b || 0),
    };
  }
}

// ---------- cloud sync (claude.ai artifact viewer only) ----------
function bucketOf(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return "cards-" + (h % BUCKETS).toString(16);
}

const cloud = { db: null, base: null, dirty: new Set(), timer: null, writing: false };

function markDirty(bucket) {
  if (!cloud.db) return;
  cloud.dirty.add(bucket);
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(flushCloud, 4000);
}
function markAllDirty() {
  if (!cloud.db) return;
  cloud.dirty.add("meta");
  for (let i = 0; i < BUCKETS; i++) cloud.dirty.add("cards-" + i.toString(16));
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(flushCloud, 1000);
}

function bucketBody(name) {
  if (name === "meta") {
    return {
      settings: state.settings,
      settingsUpdated: state.settingsUpdated,
      days: state.days,
      tones: state.tones,
      best: state.best,
      resetAt: state.resetAt,
    };
  }
  const cards = {};
  for (const [k, c] of Object.entries(state.cards)) if (bucketOf(k) === name) cards[k] = c;
  return { cards };
}

async function flushCloud() {
  if (!cloud.db || cloud.writing || !cloud.dirty.size) return;
  cloud.writing = true;
  setSync("syncing");
  try {
    while (cloud.dirty.size) {
      const name = cloud.dirty.values().next().value;
      cloud.dirty.delete(name);
      await cloud.db.doc(`${cloud.base}/${name}`).set(bucketBody(name));
    }
    setSync("synced");
  } catch (e) {
    console.warn("sync failed", e);
    setSync(e && e.code === "unavailable" ? "offline" : "local");
    if (e && (e.code === "unavailable" || e.code === "resource_exhausted")) {
      cloud.timer = setTimeout(flushCloud, 30000);
    } else {
      cloud.db = null; // e.g. a view-only viewer: stay local for this visit
    }
  } finally {
    cloud.writing = false;
  }
}

function setSync(status) {
  state.sync = { status, at: Date.now() };
  emit({ type: "sync" });
}

async function pullCloud() {
  if (!cloud.db) return;
  setSync("syncing");
  const names = ["meta", ...Array.from({ length: BUCKETS }, (_, i) => "cards-" + i.toString(16))];
  const timeout = new Promise((_, rej) => setTimeout(() => rej({ code: "timeout" }), 10000));
  try {
    const snaps = await Promise.race([
      Promise.all(names.map((n) => cloud.db.doc(`${cloud.base}/${n}`).get())),
      timeout,
    ]);
    let localNewer = false;
    snaps.forEach((snap, i) => {
      const name = names[i];
      if (!snap.exists) {
        localNewer = true;
        cloud.dirty.add(name);
        return;
      }
      const body = snap.data();
      if (name === "meta") {
        applyReset(body.resetAt);
        if ((state.resetAt || 0) > (body.resetAt || 0)) {
          cloud.dirty.add("meta");
          localNewer = true;
        }
        mergeDays(body.days || {});
        for (const [k, v] of Object.entries(body.tones || {})) {
          const cur = state.tones[k] || [0, 0];
          if (v[1] > cur[1]) state.tones[k] = [...v];
        }
        for (const [k, v] of Object.entries(body.best || {})) state.best[k] = Math.max(state.best[k] || 0, v);
        if ((body.settingsUpdated || 0) > state.settingsUpdated) {
          state.settings = { ...DEFAULT_SETTINGS, ...body.settings };
          state.settingsUpdated = body.settingsUpdated;
        } else if (state.settingsUpdated > (body.settingsUpdated || 0)) {
          cloud.dirty.add("meta");
          localNewer = true;
        }
      } else {
        const theirs = Object.fromEntries(
          Object.entries(body.cards || {}).filter(([, c]) => (c.u || 0) >= (state.resetAt || 0)),
        );
        mergeCards(JSON.parse(JSON.stringify(theirs)));
        for (const [k, c] of Object.entries(state.cards)) {
          if (bucketOf(k) === name && (!theirs[k] || (theirs[k].u || 0) < (c.u || 0))) {
            cloud.dirty.add(name);
            localNewer = true;
            break;
          }
        }
      }
    });
    writeLocalNow({ force: true });
    setSync("synced");
    emit({ type: "sync-pulled" });
    if (localNewer) flushCloud();
  } catch (e) {
    setSync("offline");
  }
}

export async function initCloud() {
  const claude = typeof window !== "undefined" ? window.claude : null;
  if (!claude || typeof claude.use !== "function") return;
  try {
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    cloud.db = db;
    cloud.base = `data/users/${uid}`;
    await pullCloud();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushCloud();
      else pullCloud();
    });
  } catch (e) {
    console.warn("cloud sync unavailable", e);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => writeLocalNow());
  // another tab saved: merge its progress so neither tab overwrites the other
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      mergeSnapshot(JSON.parse(e.newValue));
      emit({ type: "sync-pulled" });
    } catch {
      /* ignore malformed data */
    }
  });
}
