// Vocabulary data: decks, lazy loading, lookup and search.
import { pinyinKey } from "./pinyin.js";

export const LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"];

/** Official HSK 3.0 entry-id ranges per level (syllabus numbering 1–11,000). */
const ID_RANGES = [
  [1, 300, "1"],
  [301, 500, "2"],
  [501, 1000, "3"],
  [1001, 2000, "4"],
  [2001, 3600, "5"],
  [3601, 5400, "6"],
  [5401, 11000, "7-9"],
];

export const DECKS = [
  { id: "top100", kind: "top", n: 100, name: "Top 100", hz: "百", blurb: "The 100 words you'll meet most, in speech and in print" },
  { id: "top200", kind: "top", n: 200, name: "Top 200", hz: "二百", blurb: "Top 100 plus the next 100 most common words" },
  { id: "top300", kind: "top", n: 300, name: "Top 300", hz: "三百", blurb: "The 300 most common words: the core of everyday Chinese" },
  { id: "hsk1", kind: "hsk", level: "1", name: "HSK 1", hz: "一级", blurb: "Greetings, numbers, family, food, time" },
  { id: "hsk2", kind: "hsk", level: "2", name: "HSK 2", hz: "二级", blurb: "Daily routines, directions, weather, shopping" },
  { id: "hsk3", kind: "hsk", level: "3", name: "HSK 3", hz: "三级", blurb: "Work, school, health, opinions" },
  { id: "hsk4", kind: "hsk", level: "4", name: "HSK 4", hz: "四级", blurb: "Society, travel, feelings, plans" },
  { id: "hsk5", kind: "hsk", level: "5", name: "HSK 5", hz: "五级", blurb: "News, culture, abstract ideas" },
  { id: "hsk6", kind: "hsk", level: "6", name: "HSK 6", hz: "六级", blurb: "Professional and academic topics" },
  { id: "hsk7-9", kind: "hsk", level: "7-9", name: "HSK 7–9", hz: "七至九级", blurb: "Advanced band shared by levels 7, 8 and 9" },
];

export const POS = {
  名: "noun", 动: "verb", 形: "adjective", 副: "adverb", 代: "pronoun", 数: "numeral", 量: "measure word",
  介: "preposition", 连: "conjunction", 助: "particle", 叹: "interjection", 拟声: "onomatopoeia",
  前缀: "prefix", 后缀: "suffix", 数量: "number + measure word",
};

/** "名、（动、量）" -> "noun, (verb, measure word)"; bracketed parts are secondary uses. */
export function posLabel(o) {
  if (!o) return "";
  const out = [];
  const re = /（([^）]*)）|([^、（）]+)/g;
  let m;
  while ((m = re.exec(o))) {
    if (m[1]) out.push("(" + m[1].split("、").map((x) => POS[x] || x).join(", ") + ")");
    else out.push(POS[m[2]] || m[2]);
  }
  return out.join(", ");
}

export function deckById(id) {
  return DECKS.find((d) => d.id === id) || DECKS[0];
}

export function levelOfKey(key) {
  if (key.startsWith("c:")) return "top";
  const id = Number(key.slice(1));
  for (const [a, b, lv] of ID_RANGES) if (id >= a && id <= b) return lv;
  return null;
}

// ---------- loading ----------
const files = new Map(); // file name -> Promise<array>
export const words = new Map(); // key -> word
export const byHanzi = new Map(); // hanzi -> [word]
let meta = null;

function index(word) {
  if (words.has(word.k)) return words.get(word.k);
  words.set(word.k, word);
  const list = byHanzi.get(word.w) || [];
  list.push(word);
  byHanzi.set(word.w, list);
  return word;
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

/** Load one data file ("hsk1", "top"...) and index its words. */
export function loadFile(name) {
  if (!files.has(name)) {
    const p = fetchJSON(`data/${name}.json`).then((json) =>
      json.words.map((w) => {
        if (!w.k) w.k = "h" + w.i;
        const existing = words.get(w.k);
        if (existing) {
          if (w.r && !existing.r) existing.r = w.r;
          return existing;
        }
        return index(w);
      }),
    );
    p.catch(() => files.delete(name));
    files.set(name, p);
  }
  return files.get(name);
}

export function isFileLoaded(name) {
  return files.has(name);
}

export async function loadMeta() {
  if (!meta) meta = await fetchJSON("data/meta.json");
  return meta;
}

/** Words of a deck, in study order. */
export async function deckWords(deckId, order = "frequency") {
  const deck = deckById(deckId);
  if (deck.kind === "top") {
    const list = await loadFile("top");
    return list.filter((w) => w.r <= deck.n).sort((a, b) => a.r - b.r);
  }
  const list = await loadFile("hsk" + deck.level);
  const out = list.slice();
  if (order === "official") out.sort((a, b) => a.i - b.i);
  else out.sort((a, b) => b.q - a.q || a.i - b.i);
  return out;
}

/** Make sure the words behind these progress keys are loaded. */
export async function ensureKeys(keys) {
  const need = new Set();
  for (const k of keys) {
    if (words.has(k)) continue;
    const lv = levelOfKey(k);
    if (lv === "top") need.add("top");
    else if (lv) need.add("hsk" + lv);
  }
  await Promise.all([...need].map(loadFile));
}

export async function loadAllLevels() {
  await Promise.all(["top", ...LEVELS.map((l) => "hsk" + l)].map(loadFile));
}

// characters & sentences (lazy)
let charsP = null;
export function loadChars() {
  if (!charsP) {
    charsP = fetchJSON("data/chars.json");
    charsP.catch(() => (charsP = null));
  }
  return charsP;
}
let sentP = null;
export function loadSentences() {
  if (!sentP) {
    sentP = fetchJSON("data/sentences.json").then((j) =>
      j.s.map((s) => ({
        tokens: s.z.split("|").map((t, i) => ({ t, p: s.y.split("|")[i] || "" })),
        en: s.e,
        id: s.a,
        h: s.h,
      })),
    );
    sentP.catch(() => (sentP = null));
  }
  return sentP;
}

// ---------- graded stories (the Teahouse) ----------
function splitTokens(x) {
  const ys = x.y.split("|");
  const ks = x.k.split("|");
  return x.z.split("|").map((t, i) => ({ t, p: ys[i] || "", k: ks[i] || "" }));
}

let storiesP = null;
export function loadStories() {
  if (!storiesP) {
    storiesP = fetchJSON("data/stories.json").then((j) =>
      j.stories.map((s) => {
        const paras = s.p.map((para) => para.map((x) => ({ tokens: splitTokens(x), en: x.e })));
        return {
          id: s.id,
          title: s.t,
          en: s.en,
          level: s.lv,
          blurb: s.b,
          series: s.s ? { zh: s.s[0], en: s.s[1], part: s.s[2] } : null,
          words: s.w.map((w) => ({ w: w.w, p: w.p, g: w.g, k: w.k || null, name: !!w.n })),
          paras,
          sentences: paras.flat(),
          questions: s.q.map((q) => ({ tokens: splitTokens(q), en: q.e, options: q.o.map(splitTokens), answer: q.a })),
        };
      }),
    );
    storiesP.catch(() => (storiesP = null));
  }
  return storiesP;
}

// ---------- search ----------
const HAN = /[㐀-鿿]/;

/** Search loaded words by hanzi, pinyin (with or without tones/numbers) or English. */
export function search(query, limit = 60) {
  const q = query.trim();
  if (!q) return [];
  const results = [];
  if (HAN.test(q)) {
    for (const w of words.values()) {
      if (!w.w.includes(q)) continue;
      const score = w.w === q ? 0 : w.w.startsWith(q) ? 1 : 2;
      results.push([score, w.w.length, -w.q, w]);
    }
  } else {
    const pk = pinyinKey(q);
    const en = q.toLowerCase();
    const enRe = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    for (const w of words.values()) {
      const wk = (w._pk ||= pinyinKey(w.p));
      let score = null;
      if (pk && wk === pk) score = 0;
      else if (pk && pk.length >= 2 && wk.startsWith(pk)) score = 2;
      if (score === null || score > 1) {
        const g = w.g.toLowerCase();
        if (g === en || g.startsWith(en + ";") || g.startsWith("to " + en + ";") || g === "to " + en) score = 1;
        else if (enRe.test(w.g)) score = Math.min(score ?? 3, 3);
        else if (en.length > 3 && w.d.some((d) => enRe.test(d))) score = score ?? 4;
      }
      if (score !== null) results.push([score, w.w.length, -w.q, w]);
    }
  }
  results.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (seen.has(r[3].k)) continue;
    seen.add(r[3].k);
    out.push(r[3]);
    if (out.length >= limit) break;
  }
  return out;
}

/** Other words that share a character with this word, easiest first. */
export function family(word, limit = 12) {
  const out = [];
  const seen = new Set([word.k]);
  for (const ch of new Set(word.w)) {
    const list = [];
    for (const w of words.values()) {
      if (seen.has(w.k) || !w.w.includes(ch) || w.w === word.w) continue;
      list.push(w);
    }
    list.sort((a, b) => levelRank(a) - levelRank(b) || b.q - a.q);
    for (const w of list.slice(0, Math.ceil(limit / Math.max(1, new Set(word.w).size)))) {
      seen.add(w.k);
      out.push({ ch, w });
    }
  }
  return out.slice(0, limit);
}

export function levelRank(w) {
  if (!w.l) return 8;
  return w.l === "7-9" ? 7 : Number(w.l);
}

export function levelName(w) {
  if (!w.l) return "";
  return w.l === "7-9" ? "HSK 7–9" : `HSK ${w.l}`;
}

/** Frequency band from wordfreq Zipf value. */
export function freqLabel(q) {
  if (q >= 6) return "extremely common";
  if (q >= 5) return "very common";
  if (q >= 4) return "common";
  if (q >= 3) return "less common";
  return "rare";
}
