// Study session: introduce new words, quiz them, review what's due.
import { deckById, deckWords, ensureKeys, loadChars, loadSentences, words } from "../data.js";
import { esc, hanziHTML, pinyinHTML, toneVariants } from "../pinyin.js";
import { canPlayWord } from "../speech.js";
import { prefetch } from "../audio.js";
import {
  AGAIN, EASY, GOOD, HARD, LEARNING, NEW, RELEARNING, grade, introduce, isDue, markKnown, previewLabel,
} from "../srs.js";
import { getCard, logActivity, newAllowance, putCard, state, streak } from "../state.js";
import { h, icon, shuffle } from "../ui.js";
import { faceHTML, openWord, optionHTML, playWord, sentenceBlock, soundButton } from "./common.js";

let session = null;
let keyHandler = null;

export function hasSession() {
  return !!session && !session.finished;
}

/** What a normal session would contain right now (for the Today screen). */
export async function planCounts() {
  const now = Date.now();
  const due = Object.entries(state.cards).filter(([, c]) => isDue(c, now)).length;
  const remainingNew = newAllowance();
  let available = 0;
  try {
    const list = await deckWords(state.settings.deck, state.settings.order);
    available = list.filter((w) => !getCard(w.k) || getCard(w.k).s === NEW).length;
  } catch {
    /* offline and not cached */
  }
  return { due, newToday: Math.min(remainingNew, available), available, remainingNew };
}

/** Build a regular SRS session (due reviews + new words from the active deck). */
export async function buildSession() {
  const now = Date.now();
  const size = state.settings.sessionSize;
  const dueKeys = Object.entries(state.cards)
    .filter(([, c]) => isDue(c, now))
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);
  await ensureKeys(dueKeys);
  const reviews = dueKeys.map((k) => words.get(k)).filter(Boolean).slice(0, size);

  const remainingNew = newAllowance();
  const newCount = Math.min(remainingNew, Math.max(0, size - reviews.length), 10);
  const deckList = await deckWords(state.settings.deck, state.settings.order);
  const fresh = deckList.filter((w) => !getCard(w.k) || getCard(w.k).s === NEW).slice(0, newCount);

  // interleave: a couple of reviews, then a new word
  const queue = [];
  const r = reviews.map((w) => ({ type: "quiz", word: w }));
  const n = fresh.map((w) => ({ type: "intro", word: w }));
  while (r.length || n.length) {
    if (n.length) queue.push(n.shift());
    for (let i = 0; i < 2 && r.length; i++) queue.push(r.shift());
  }
  return newSession(queue, { title: deckById(state.settings.deck).name });
}

/** Extra practice on a chosen list (does not change the schedule). */
export function buildPracticeSession(list, title) {
  const queue = shuffle(list).map((w) => ({ type: "quiz", word: w }));
  return newSession(queue, { title, practice: true });
}

function newSession(queue, { title, practice = false }) {
  session = {
    queue,
    title,
    practice,
    total: queue.length + queue.filter((q) => q.type === "intro").length,
    done: 0,
    seen: new Map(), // key -> appearances
    results: new Map(), // key -> {word, wrong}
    newLearned: 0,
    reviewed: 0,
    correct: 0,
    started: Date.now(),
    finished: false,
  };
  // warm caches used by intro cards, and the recordings for the first words
  prefetch(queue.map((q) => q.word));
  loadSentences().catch(() => {});
  loadChars().catch(() => {});
  return session;
}

export function endSession() {
  session = null;
}

// ---------- rendering ----------
export function renderStudy(root, { onExit }) {
  root.innerHTML = "";
  const wrap = h("div.study");
  root.append(wrap);
  if (!session) {
    wrap.append(h("p.muted", "Preparing your session…"));
    buildSession()
      .then(() => renderStudy(root, { onExit }))
      .catch((e) => {
        wrap.innerHTML = "";
        wrap.append(h("p", `Couldn't load the word list: ${e.message}. Check your connection and try again.`));
      });
    return;
  }
  if (!session.queue.length || session.finished) {
    showSummary(wrap, onExit);
    return;
  }
  const top = h("div.study-top");
  const closeBtn = h("button.icon-btn", { type: "button", "aria-label": "End session", html: icon("close"), onclick: () => finish(wrap, onExit) });
  const bar = h("div.progress", h("div.progress-fill", { style: { width: `${progressPct()}%` } }));
  const count = h("span.study-count", `${session.done}/${Math.max(session.total, session.done + session.queue.length)}`);
  top.append(closeBtn, bar, count);
  wrap.append(top);

  const stage = h("div.stage");
  wrap.append(stage);
  window.scrollTo({ top: 0 });
  const item = session.queue[0];
  item.shownAt = Date.now();
  if (item.type === "intro") renderIntro(stage, item, () => next(root, onExit));
  else renderQuiz(stage, item, () => next(root, onExit));
}

function progressPct() {
  const total = Math.max(session.total, session.done + session.queue.length);
  return total ? Math.round((session.done / total) * 100) : 0;
}

function next(root, onExit) {
  session.queue.shift();
  session.done += 1;
  renderStudy(root, { onExit });
}

function reinsert(item, offset) {
  const count = session.seen.get(item.word.k) || 0;
  if (count >= 5) return;
  const pos = Math.min(session.queue.length, offset);
  session.queue.splice(pos, 0, { type: "quiz", word: item.word });
  session.total += 1;
}

function setKeys(fn) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener("keydown", fn);
}
export function stopKeys() {
  setKeys(null);
}

// ---------- intro ----------
function renderIntro(stage, item, done) {
  const { word } = item;
  const card = h("article.intro");
  card.innerHTML = `
    <p class="eyebrow">New word${word.r ? ` · Top ${word.r}` : ""}${word.l ? ` · HSK ${word.l === "7-9" ? "7–9" : word.l}` : ""}</p>
    <div class="tianzige ${[...word.w].length > 2 ? "long" : ""}" lang="zh-CN">${hanziHTML(word)}</div>
    <div class="intro-py">${pinyinHTML(word)}</div>
    <p class="intro-gloss">${esc(word.g)}</p>`;
  const audio = h("div.row.center", soundButton(word), soundButton(word, { slow: true }));
  card.append(audio);
  const extra = h("div.intro-extra");
  card.append(extra);
  stage.append(card);

  // character hints + one example, when available
  loadChars()
    .then((chars) => {
      const unique = [...new Set(word.w)];
      if (unique.length === 1) {
        // one character: show how it is built
        const c = chars[unique[0]];
        const e = c?.e;
        let text = "";
        if (e?.t === "s" && e.m && e.f) {
          const mg = (chars[e.m]?.g?.[0] || e.h || "").replace(/^[^:]+:\s*/, "").split(";")[0];
          text = `<span class="hint-char"><b lang="zh-CN">${esc(e.m)}</b> ${esc(mg || "meaning")}</span><span class="plus">+</span><span class="hint-char"><b lang="zh-CN">${esc(e.f)}</b> sound ${esc(chars[e.f]?.p?.[0] || "")}</span>`;
        } else if (e?.h) {
          text = `<span class="hint-char">${esc(e.h)}</span>`;
        }
        if (text) extra.prepend(h("p.hint", { html: text }));
        return;
      }
      const parts = unique
        .map((ch) => {
          const c = chars[ch];
          if (!c) return null;
          const g = (c.g?.[0] || "").replace(/^[^:]+:\s*/, "").split(";")[0];
          return `<span class="hint-char"><b lang="zh-CN">${esc(ch)}</b> ${esc(g)}</span>`;
        })
        .filter(Boolean);
      if (parts.length > 1) extra.prepend(h("p.hint", { html: parts.join('<span class="plus">+</span>') }));
    })
    .catch(() => {});
  if (word.e?.length) {
    loadSentences()
      .then((all) => {
        const s = all[word.e[0]];
        if (s) extra.append(sentenceBlock(s, { highlight: word.w, showEnglish: false }));
      })
      .catch(() => {});
  }

  const actions = h("div.actions");
  const knowBtn = h("button.btn.ghost", { type: "button", text: "I already know it" });
  const gotBtn = h("button.btn.primary", { type: "button", html: `Got it ${icon("right")}` });
  actions.append(knowBtn, gotBtn);
  stage.append(actions);

  const proceed = (known) => {
    setKeys(null);
    const cur = getCard(word.k) || {};
    if (!session.practice) {
      if (known) putCard(word.k, markKnown(cur));
      else putCard(word.k, introduce(cur));
      logActivity({ isNew: true, ms: Date.now() - item.shownAt });
    }
    session.newLearned += 1;
    if (!known) {
      // quiz this word again a couple of cards from now
      session.seen.set(word.k, 0);
      session.queue.splice(Math.min(session.queue.length, 3), 0, { type: "quiz", word });
    } else session.total -= 1;
    done();
  };
  knowBtn.addEventListener("click", () => proceed(true));
  gotBtn.addEventListener("click", () => proceed(false));
  setKeys((e) => {
    if (e.target.closest("input,textarea,select")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      proceed(false);
    } else if (e.key.toLowerCase() === "k") proceed(true);
    else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
  });
  gotBtn.focus({ preventScroll: true });
  if (state.settings.autoplay) playWord(word);
}

// ---------- quiz ----------
function chooseType(word, card) {
  const style = state.settings.answerStyle;
  if (style === "flip") return "flip";
  const speech = canPlayWord(word);
  const toneable = word.t && /[1-4]/.test(word.t) && [...word.w].length <= 4;
  if (!card || card.s === NEW || card.s === LEARNING) {
    if (!card || card.step === 0) return "meaning";
    return speech ? "listen" : "reverse";
  }
  if (card.s === RELEARNING) return "meaning";
  const rot = ["meaning", "reverse", speech ? "listen" : "meaning", toneable ? "tone" : "reverse"];
  let q = rot[card.reps % rot.length];
  if (style === "mixed" && card.ivl >= 7 && card.reps % 3 === 0) q = "flip";
  return q;
}

function poolFor(word) {
  const same = [];
  const near = [];
  for (const w of words.values()) {
    if (w.k === word.k || w.w === word.w) continue;
    if ((word.l && w.l === word.l) || (!word.l && w.r)) same.push(w);
    else near.push(w);
  }
  return same.length >= 12 ? same : same.concat(near);
}

function distractors(word, kind, n = 3) {
  const pool = poolFor(word);
  const len = [...word.w].length;
  const gl = (g) => g.toLowerCase().split(";")[0].trim();
  const target = gl(word.g);
  const ok = pool.filter((w) => gl(w.g) !== target && w.p !== word.p);
  let candidates = ok;
  if (kind === "reverse") {
    const sameLen = ok.filter((w) => [...w.w].length === len);
    if (sameLen.length >= n) candidates = sameLen;
  }
  const picked = [];
  const glosses = new Set([target]);
  for (const w of shuffle(candidates)) {
    if (glosses.has(gl(w.g))) continue;
    glosses.add(gl(w.g));
    picked.push(w);
    if (picked.length >= n) break;
  }
  return picked;
}

function renderQuiz(stage, item, done) {
  const { word } = item;
  const card = getCard(word.k);
  session.seen.set(word.k, (session.seen.get(word.k) || 0) + 1);
  const type = item.qtype || chooseType(word, card);
  item.qtype = type;
  if (type === "flip") return renderFlip(stage, item, done);

  const prompt = h("div.prompt");
  let options = [];
  let correctIndex = 0;
  const m = state.settings.script;

  if (type === "meaning") {
    prompt.innerHTML = `<p class="eyebrow">What does this mean?</p><div class="prompt-face">${faceHTML(word, { size: "xl" })}</div>`;
    prompt.append(h("div.row.center", soundButton(word)));
    const others = distractors(word, "meaning");
    options = shuffle([word, ...others]);
    correctIndex = options.indexOf(word);
  } else if (type === "listen") {
    prompt.innerHTML = `<p class="eyebrow">Listen. What did you hear?</p>`;
    const big = h("button.listen-btn", { type: "button", "aria-label": "Play again", html: icon("sound") });
    big.addEventListener("click", () => playWord(word, { explicit: true }));
    prompt.append(big, h("div.row.center", soundButton(word, { slow: true })));
    const others = distractors(word, "meaning");
    options = shuffle([word, ...others]);
    correctIndex = options.indexOf(word);
    setTimeout(() => playWord(word), 250);
  } else if (type === "reverse") {
    prompt.innerHTML = `<p class="eyebrow">Which word means…</p><p class="prompt-en">${esc(word.g)}</p>`;
    const others = distractors(word, "reverse");
    options = shuffle([word, ...others]);
    correctIndex = options.indexOf(word);
  } else if (type === "tone") {
    prompt.innerHTML = `<p class="eyebrow">Pick the right tones</p>
      ${m === "pinyin" ? "" : `<div class="prompt-face"><span class="hz xl notone" lang="zh-CN">${esc(word.w)}</span></div>`}
      <p class="prompt-en small">${esc(word.g)}</p>`;
    prompt.append(h("div.row.center", soundButton(word), soundButton(word, { slow: true })));
    const correct = word.p.split(" / ")[0];
    const variants = toneVariants(word, 3);
    options = shuffle([correct, ...variants]);
    correctIndex = options.indexOf(correct);
  }
  stage.append(prompt);

  const grid = h("div.options", { role: "group", "aria-label": "Answers" });
  const buttons = options.map((opt, i) => {
    const b = h("button.option", { type: "button" });
    let label;
    if (type === "tone") label = `<span class="py big">${esc(opt)}</span>`;
    else if (type === "reverse") label = optionHTML(opt);
    else label = `<span class="opt-en">${esc(opt.g)}</span>`;
    b.innerHTML = `<kbd>${i + 1}</kbd>${label}`;
    b.addEventListener("click", () => answer(i));
    grid.append(b);
    return b;
  });
  stage.append(grid);
  const feedback = h("div.feedback");
  stage.append(feedback);

  let answered = false;
  function answer(i) {
    if (answered) return;
    answered = true;
    const right = i === correctIndex;
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (j === correctIndex) b.classList.add("is-right");
      else if (j === i) b.classList.add("is-wrong");
    });
    record(item, right ? GOOD : AGAIN, right);
    showReveal(feedback, word, right, done, type);
  }

  setKeys((e) => {
    if (e.target.closest("input,textarea,select")) return;
    const n = Number(e.key);
    if (!answered && n >= 1 && n <= options.length) answer(n - 1);
    else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
  });
  if (state.settings.autoplay && type === "meaning" && m !== "hanzi") playWord(word);
}

function record(item, rating, right) {
  const { word } = item;
  const ms = Date.now() - item.shownAt;
  const res = session.results.get(word.k) || { word, wrong: 0 };
  if (!right) res.wrong += 1;
  session.results.set(word.k, res);
  if (right) session.correct += 1;
  session.reviewed += 1;
  if (session.practice) {
    if (!right) reinsert(item, 3);
    return;
  }
  const before = getCard(word.k) || {};
  const after = grade(before, rating);
  putCard(word.k, after);
  logActivity({ correct: right, ms });
  if (after.s === LEARNING || after.s === RELEARNING) reinsert(item, right ? 5 : 3);
}

function showReveal(feedback, word, right, done, type) {
  requestAnimationFrame(() => feedback.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  feedback.innerHTML = "";
  feedback.className = `feedback show ${right ? "good" : "bad"}`;
  const head = h("div.fb-head", {
    html: `${icon(right ? "check" : "cross")} <span>${right ? pick(["Correct", "Nice", "Right", "Yes"]) : "Not quite"}</span>`,
  });
  const body = h("div.fb-body");
  body.innerHTML = `<div class="fb-face">${faceHTML(word, { reveal: true })}</div><p class="fb-gloss">${esc(word.g)}</p>`;
  const tools = h("div.row", soundButton(word), h("button.btn.link", { type: "button", text: "Details", onclick: () => openWord(word) }));
  body.append(tools);
  const cont = h("button.btn.primary.wide", { type: "button", html: `Continue ${icon("right")}` });
  feedback.append(head, body, cont);
  cont.addEventListener("click", go);
  cont.focus({ preventScroll: true });
  let timer = null;
  function go() {
    clearTimeout(timer);
    setKeys(null);
    done();
  }
  setKeys((e) => {
    if (e.target.closest("input,textarea,select")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    } else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
  });
  if (state.settings.autoplay && (type !== "meaning" || state.settings.script === "hanzi")) playWord(word);
  if (right) {
    feedback.classList.add("auto");
    timer = setTimeout(go, 1800);
    const stop = () => {
      clearTimeout(timer);
      feedback.classList.remove("auto");
    };
    feedback.addEventListener("pointerdown", stop, { once: true });
  }
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- self-graded flashcard ----------
function renderFlip(stage, item, done) {
  const { word } = item;
  const card = getCard(word.k) || {};
  const prompt = h("div.prompt");
  prompt.innerHTML = `<p class="eyebrow">Do you remember this?</p><div class="prompt-face">${faceHTML(word, { size: "xl" })}</div>`;
  prompt.append(h("div.row.center", soundButton(word)));
  stage.append(prompt);
  const showBtn = h("button.btn.primary.wide", { type: "button", text: "Show answer" });
  const area = h("div.flip-area", showBtn);
  stage.append(area);
  let shown = false;
  function show() {
    if (shown) return;
    shown = true;
    area.innerHTML = "";
    const body = h("div.feedback.show.neutral");
    body.innerHTML = `<div class="fb-face">${faceHTML(word, { reveal: true })}</div><p class="fb-gloss">${esc(word.g)}</p>`;
    body.append(h("div.row", soundButton(word), h("button.btn.link", { type: "button", text: "Details", onclick: () => openWord(word) })));
    const rates = h("div.rate-row");
    const defs = [
      [AGAIN, "Again", "again"],
      [HARD, "Hard", "hard"],
      [GOOD, "Good", "good"],
      [EASY, "Easy", "easy"],
    ];
    for (const [r, label, cls] of defs) {
      const when = session.practice ? "" : previewLabel(card, r);
      const b = h(`button.rate.${cls}`, { type: "button", html: `<kbd>${r}</kbd><b>${label}</b>${when ? `<small>${when}</small>` : ""}` });
      b.addEventListener("click", () => rate(r));
      rates.append(b);
    }
    area.append(body, rates);
    rates.querySelector(".good").focus({ preventScroll: true });
    if (state.settings.autoplay) playWord(word);
  }
  function rate(r) {
    setKeys(null);
    record(item, r, r !== AGAIN);
    done();
  }
  showBtn.addEventListener("click", show);
  showBtn.focus({ preventScroll: true });
  setKeys((e) => {
    if (e.target.closest("input,textarea,select")) return;
    if (!shown && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      show();
    } else if (shown && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
    else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
  });
}

// ---------- end ----------
function finish(wrap, onExit) {
  if (session && (session.reviewed || session.newLearned)) {
    session.finished = true;
    session.queue = [];
    showSummary(wrap, onExit);
  } else {
    session = null;
    setKeys(null);
    onExit();
  }
}

function showSummary(wrap, onExit) {
  setKeys(null);
  session.finished = true;
  wrap.innerHTML = "";
  const mins = Math.max(1, Math.round((Date.now() - session.started) / 60000));
  const acc = session.reviewed ? Math.round((session.correct / session.reviewed) * 100) : null;
  const s = streak();
  const box = h("div.summary");
  box.innerHTML = `
    <div class="summary-seal" aria-hidden="true">${session.practice ? "练" : "好"}</div>
    <h2>${session.practice ? "Practice done" : "Session complete"}</h2>
    <div class="stats">
      ${session.practice ? "" : `<div><b>${session.newLearned}</b><span>new words</span></div>`}
      <div><b>${session.reviewed}</b><span>answers</span></div>
      <div><b>${acc === null ? "–" : acc + "%"}</b><span>correct</span></div>
      <div><b>${mins}</b><span>${mins === 1 ? "minute" : "minutes"}</span></div>
    </div>
    ${!session.practice && s > 0 ? `<p class="streak-line">${icon("flame")} ${s}-day streak</p>` : ""}`;
  const missed = [...session.results.values()].filter((r) => r.wrong > 0).map((r) => r.word);
  if (missed.length) {
    box.append(h("h3", "Worth another look"));
    const chips = h("div.chips");
    for (const w of missed.slice(0, 16)) {
      chips.append(
        h("button.chip", {
          type: "button",
          onclick: () => openWord(w),
          html: `<span class="hz" lang="zh-CN">${hanziHTML(w)}</span> <span class="chip-g">${esc(w.g.split(";")[0])}</span>`,
        }),
      );
    }
    box.append(chips);
  }
  const actions = h("div.actions");
  const again = h("button.btn.ghost", { type: "button", text: session.practice ? "Practice again" : "Another session" });
  const home = h("button.btn.primary", { type: "button", text: "Done" });
  again.addEventListener("click", async () => {
    if (session.practice) {
      const list = [...session.results.values()].map((r) => r.word);
      buildPracticeSession(list, session.title);
    } else {
      session = null;
      await buildSession();
    }
    renderStudy(wrap.parentElement, { onExit });
  });
  home.addEventListener("click", () => {
    session = null;
    onExit();
  });
  actions.append(again, home);
  box.append(actions);
  wrap.append(box);
  home.focus({ preventScroll: true });
}
