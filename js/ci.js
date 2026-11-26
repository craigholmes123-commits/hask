// Comprehensible input: how much of a text you already know, which tale to
// read next, and which sentences sit one word beyond what you know (i+1).
// Pure functions: everything they need is passed in.
import { NEW } from "./srs.js";

const NUMERAL = /^[零〇一二两三四五六七八九十百千万]+$/;

/** A word counts as familiar once it has been introduced in a session. */
export function isFamiliar(card) {
  return !!card && card.s !== NEW;
}

/**
 * Share of a story's words you know. Punctuation, numbers and names don't count.
 * Returns { total, known, pct, unknown: [{k, t}] } with each unknown word once.
 */
export function coverage(story, cards) {
  const names = new Set(story.words.filter((w) => w.name).map((w) => w.w));
  let total = 0;
  let known = 0;
  const unknown = new Map();
  for (const s of story.sentences) {
    for (const tok of s.tokens) {
      if (!tok.k || tok.k === "#" || names.has(tok.t)) continue;
      total += 1;
      if (!tok.k.startsWith("g:") && isFamiliar(cards[tok.k])) known += 1;
      else if (!unknown.has(tok.k)) unknown.set(tok.k, { k: tok.k, t: tok.t });
    }
  }
  return { total, known, pct: total ? known / total : 0, unknown: [...unknown.values()] };
}

/** How a story will feel at this coverage. */
export function fit(pct) {
  if (pct >= 0.95) return { id: "easy", label: "Easy read" };
  if (pct >= 0.85) return { id: "right", label: "Just right" };
  if (pct >= 0.7) return { id: "stretch", label: "A stretch" };
  return { id: "hard", label: "Hard for now" };
}

/** Is a story open to read next? A serial's later parts wait for the earlier ones. */
export function isOpen(story, stories, finished) {
  if (!story.series || story.series.part === 1) return true;
  const prev = stories.find((s) => s.series && s.series.zh === story.series.zh && s.series.part === story.series.part - 1);
  return !prev || finished(prev.id);
}

/**
 * The tale to suggest: an unfinished, open one at or below your realm (one
 * realm above if nothing else is left) that you understand best.
 */
export function recommend(stories, cards, realm, finished) {
  const open = stories.filter((s) => !finished(s.id) && isOpen(s, stories, finished));
  if (!open.length) return null;
  const near = open.filter((s) => s.level <= realm);
  const pool = near.length ? near : open.filter((s) => s.level <= realm + 1).length ? open.filter((s) => s.level <= realm + 1) : open;
  let best = null;
  for (const s of pool) {
    const pct = coverage(s, cards).pct;
    if (!best || pct > best.pct + 1e-9 || (Math.abs(pct - best.pct) < 1e-9 && s.level < best.s.level)) best = { s, pct };
  }
  return best.s;
}

/**
 * Sentences with exactly one word you don't know yet, easiest first; topped up
 * with fully known sentences when there are few. Each item: { s, word } where
 * word is the new word (or null).
 */
export function pickIPlusOne(sentences, knownWords, { limit = 30, rand = Math.random } = {}) {
  const one = [];
  const zero = [];
  for (const s of sentences) {
    const ws = s.tokens.filter((t) => t.p && !NUMERAL.test(t.t));
    if (ws.length < 3) continue;
    const unknown = new Set(ws.filter((t) => !knownWords.has(t.t)).map((t) => t.t));
    if (unknown.size === 1) one.push({ s, word: [...unknown][0] });
    else if (unknown.size === 0) zero.push({ s, word: null });
  }
  const byEase = (list) =>
    shuffle(list, rand).sort((a, b) => (a.s.h || 0) - (b.s.h || 0) || a.s.tokens.length - b.s.tokens.length);
  const picked = byEase(one).slice(0, limit);
  if (picked.length < Math.min(10, limit)) picked.push(...byEase(zero).slice(0, Math.min(10, limit) - picked.length));
  return shuffle(picked, rand);
}

function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
