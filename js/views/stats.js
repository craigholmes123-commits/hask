// Deck progress statistics and the elders' daily advice.
import { deckById, deckWords, levelOfKey, loadMeta } from "../data.js";
import { status } from "../srs.js";
import { getCard, state } from "../state.js";

const TIPS = [
  ["Review before you add", "Due reviews come first in every session. Clearing them keeps new words from piling up."],
  ["Say it out loud", "Repeat each new word after the audio, copying the tone melody. Speaking it makes it stick far better than reading silently."],
  ["Learn words, not just characters", "学 means study, but 学生 (student) and 学校 (school) are what you'll actually hear. The app teaches whole words and shows the characters inside them."],
  ["Use the characters' parts", "Most characters are a meaning part plus a sound part: 妈 is 女 (woman) + 马 (mǎ). Open any word to see how its characters are built."],
  ["Hide the pinyin early", "Once a word feels familiar, switch the top toggle to 汉字 so you read the characters, not the romanisation."],
  ["Short and daily beats long and rare", "Fifteen minutes every day does more than two hours on a Sunday. Your spirit beast agrees: it only grows on days you cultivate."],
  ["Tones come in pairs", "Practise two-syllable words in the Tone Trial. Most words are two syllables, and tones change shape next to each other."],
  ["Listen before you read", "Try the Listening Trial with your eyes closed. Recognising a word by ear is the skill conversations need most."],
  ["Read sentences, not lists", "The Reading Trial only shows sentences built from words you've studied, so each one is readable."],
  ["Don't fight the forgetting curve", "Getting a review wrong is useful: the word comes back sooner, which is how it moves into long-term memory."],
];

export function tipOfDay() {
  const n = Math.floor(Date.now() / 86400000);
  return TIPS[n % TIPS.length];
}

/** Progress for any deck without loading HSK level files: counts by key ranges. */
export async function deckStats(deckId) {
  const deck = deckById(deckId);
  const meta = await loadMeta().catch(() => null);
  const s = { total: 0, known: 0, learning: 0, review: 0, started: 0 };
  if (deck.kind === "top") {
    const list = await deckWords(deckId);
    s.total = list.length;
    for (const w of list) tally(s, getCard(w.k));
  } else {
    s.total = meta ? meta.counts[deck.level] : 0;
    for (const [k, c] of Object.entries(state.cards)) {
      if (levelOfKey(k) === deck.level) tally(s, c);
    }
  }
  s.new = Math.max(0, s.total - s.started);
  s.pct = s.total ? Math.round((s.started / s.total) * 100) : 0;
  return s;
}

function tally(s, card) {
  const st = status(card);
  if (st === "new") return;
  s.started += 1;
  s[st] += 1;
}

export function statsBar(s) {
  const pct = (n) => (s.total ? (n / s.total) * 100 : 0);
  return `<div class="stack-bar" role="img" aria-label="${s.known} known, ${s.review + s.learning} in progress, ${s.new} new">
    <span class="sb-known" style="width:${pct(s.known)}%"></span>
    <span class="sb-review" style="width:${pct(s.review)}%"></span>
    <span class="sb-learning" style="width:${pct(s.learning)}%"></span>
  </div>`;
}
