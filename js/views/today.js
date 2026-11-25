// Today: the daily session, learning path, recent activity.
import { DECKS, deckById, deckWords, isFileLoaded, levelOfKey, loadFile, loadMeta } from "../data.js";
import { esc } from "../pinyin.js";
import { NEW, dayKey, status } from "../srs.js";
import { addBonusNew, getCard, setSetting, state, streak, today } from "../state.js";
import { h, icon, plural } from "../ui.js";
import { planCounts } from "./study.js";

export const PATH = ["top100", "hsk1", "top200", "hsk2", "top300", "hsk3", "hsk4", "hsk5", "hsk6", "hsk7-9"];

const TIPS = [
  ["Review before you add", "Due reviews come first in every session. Clearing them keeps new words from piling up."],
  ["Say it out loud", "Repeat each new word after the audio, copying the tone melody. Speaking it makes it stick far better than reading silently."],
  ["Learn words, not just characters", "学 means study, but 学生 (student) and 学校 (school) are what you'll actually hear. The app teaches whole words and shows the characters inside them."],
  ["Use the characters' parts", "Most characters are a meaning part plus a sound part: 妈 is 女 (woman) + 马 (mǎ). Open any word to see how its characters are built."],
  ["Hide the pinyin early", "Once a word feels familiar, switch the top toggle to 汉字 so you read the characters, not the romanisation."],
  ["Short and daily beats long and rare", "Fifteen minutes every day does more than two hours on a Sunday. The streak counter is there to help."],
  ["Tones come in pairs", "Practise two-syllable words in the Tone trainer. Most words are two syllables, and tones change shape next to each other."],
  ["Listen before you read", "Try the Listening drill with your eyes closed. Recognising a word by ear is the skill conversations need most."],
  ["Read sentences, not lists", "The Sentences drill only shows sentences built from words you've studied, so each one is readable."],
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

export async function renderToday(root, nav) {
  root.innerHTML = "";
  const page = h("section.page.today");
  root.append(page);

  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const st = streak();
  const td = today();
  const greet = h("header.page-head");
  greet.innerHTML = `
    <p class="eyebrow">${esc(date)}</p>
    <h1><span lang="zh-CN" class="h1-zh">今天</span> Today</h1>
    <div class="head-meta">
      <span class="pill ${st ? "pill-fire" : ""}">${icon("flame")} ${st ? plural(st, "day") + " streak" : "Start a streak today"}</span>
      <span class="pill">${td.n} new · ${td.r} answers today</span>
    </div>`;
  page.append(greet);

  // session card
  const hero = h("div.session-card");
  hero.innerHTML = `<div class="sc-counts"><div><b>…</b><span>reviews due</span></div><div><b>…</b><span>new words</span></div></div>`;
  const startBtn = h("button.btn.primary.big", { type: "button", html: `${icon("play")} Start session`, onclick: () => nav("study") });
  const deck = deckById(state.settings.deck);
  const deckLine = h("p.sc-deck", {
    html: `Learning from <b>${esc(deck.name)}</b> · <a href="#words">change</a>`,
  });
  hero.append(startBtn, deckLine);
  page.append(hero);

  const deckBox = h("div.card.deck-progress");
  page.append(deckBox);

  const pathBox = h("section.card.path");
  page.append(pathBox);

  const grid = h("div.split");
  const week = h("section.card.week");
  const tipBox = h("section.card.tip");
  grid.append(week, tipBox);
  page.append(grid);

  const quick = h("section.quick");
  quick.innerHTML = `<h2 class="section-title">Quick practice</h2>`;
  const tiles = h("div.tiles");
  for (const [route, ic, title, sub] of [
    ["drill-tones", "tone", "Tone trainer", "Hear it, pick the tones"],
    ["drill-listen", "ear", "Listening", "Which word did you hear?"],
    ["drill-read", "book", "Sentences", "Read with words you know"],
    ["drill-speed", "bolt", "Speed round", "60 seconds, how many?"],
  ]) {
    tiles.append(h("a.tile", { href: "#" + route, html: `${icon(ic)}<b>${title}</b><span>${sub}</span>` }));
  }
  quick.append(tiles);
  page.append(quick);

  // fill async parts
  const [tip, tipText] = tipOfDay();
  tipBox.innerHTML = `<p class="eyebrow">Learn faster</p><h3>${esc(tip)}</h3><p>${esc(tipText)}</p><a class="more" href="#guide">More in the guide ${icon("right")}</a>`;
  renderWeek(week);

  try {
    const counts = await planCounts();
    const nums = hero.querySelectorAll(".sc-counts b");
    nums[0].textContent = counts.due;
    nums[1].textContent = counts.newToday;
    if (!counts.due && !counts.newToday) {
      startBtn.innerHTML = `${icon("check")} All done for today`;
      startBtn.classList.remove("primary");
      startBtn.classList.add("ghost");
      startBtn.onclick = () => nav("practice");
      const note =
        counts.available === 0
          ? `You've started every word in ${esc(deck.name)}. Pick the next deck below.`
          : `You've reached today's goal of ${td.n} new words. Come back tomorrow, or change the daily goal in Prefs.`;
      hero.append(h("p.sc-note", { html: note }));
      const extra = h("button.btn.ghost.small", {
        type: "button",
        text: "Learn 5 more anyway",
        onclick: () => {
          addBonusNew(5);
          nav("study");
        },
      });
      if (counts.available > 0) hero.append(extra);
    }
  } catch (e) {
    hero.querySelectorAll(".sc-counts b").forEach((b) => (b.textContent = "–"));
    hero.append(h("p.sc-note", `Couldn't load the word list (${e.message}).`));
  }

  const ds = await deckStats(deck.id);
  deckBox.innerHTML = `
    <div class="dp-head">
      <span class="deck-hz" lang="zh-CN">${esc(deck.hz)}</span>
      <div><h3>${esc(deck.name)}</h3><p class="muted">${esc(deck.blurb)}</p></div>
      <span class="dp-pct">${ds.pct}%</span>
    </div>
    ${statsBar(ds)}
    <div class="legend">
      <span><i class="sw sw-known"></i>${ds.known} known</span>
      <span><i class="sw sw-review"></i>${ds.review + ds.learning} in progress</span>
      <span><i class="sw sw-new"></i>${ds.new} new</span>
    </div>`;

  await renderPath(pathBox, nav);
}

async function renderPath(box, nav) {
  box.innerHTML = `<h2 class="section-title">Your path</h2><p class="muted small">Common words first, then each HSK 3.0 level. Tap a step to study it.</p>`;
  const ol = h("ol.path-list");
  box.append(ol);
  const active = state.settings.deck;
  for (const id of PATH) {
    const d = deckById(id);
    const s = await deckStats(id).catch(() => ({ pct: 0, total: 0 }));
    const li = h("li", { class: `path-step ${id === active ? "is-active" : ""} ${s.pct === 100 ? "is-done" : ""}` });
    const btn = h("button", {
      type: "button",
      html: `<span class="ps-dot">${s.pct === 100 ? icon("check") : ""}</span>
        <span class="ps-name">${esc(d.name)}</span>
        <span class="ps-pct">${s.pct}%</span>`,
      onclick: () => {
        setSetting("deck", id);
        nav("today");
      },
    });
    btn.setAttribute("aria-label", `${d.name}, ${s.pct}% started${id === active ? ", current deck" : ""}`);
    li.append(btn);
    ol.append(li);
  }
}

function renderWeek(box) {
  const days = [];
  const d = new Date();
  d.setHours(d.getHours() - 4);
  for (let i = 6; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    days.push({ k, label: x.toLocaleDateString(undefined, { weekday: "narrow" }), v: state.days[k] });
  }
  const max = Math.max(10, ...days.map((x) => (x.v ? x.v.r + x.v.n : 0)));
  const total = days.reduce((a, x) => a + (x.v ? x.v.r : 0), 0);
  box.innerHTML = `<p class="eyebrow">This week</p><h3>${plural(total, "answer")}</h3>`;
  const chart = h("div.week-chart", { role: "img", "aria-label": "Answers per day over the last seven days" });
  for (const x of days) {
    const n = x.v ? x.v.r + x.v.n : 0;
    const col = h("div.wk-col");
    col.innerHTML = `<div class="wk-bar-wrap"><div class="wk-bar ${x.k === dayKey() ? "is-today" : ""}" style="height:${Math.round((n / max) * 100)}%"></div></div>
      ${n ? `<span class="wk-seal" title="${n} answers">印</span>` : `<span class="wk-empty"></span>`}
      <span class="wk-day">${esc(x.label)}</span>`;
    chart.append(col);
  }
  box.append(chart);
}

export { DECKS, isFileLoaded, loadFile, NEW };
