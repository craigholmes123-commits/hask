// Practice drills: tones, listening, speed round, sentence reading, tricky words.
import { deckWords, ensureKeys, loadSentences, words } from "../data.js";
import { TONE_SIGNS, esc, hanziHTML, pinyinHTML, syllables } from "../pinyin.js";
import { canSpeakSentences } from "../speech.js";
import { status } from "../srs.js";
import { getCard, logTone, setBest, state } from "../state.js";
import { h, icon, plural, sample, shuffle, toast, toneContour } from "../ui.js";
import { faceHTML, openWord, optionHTML, playWord, sentenceBlock, soundButton } from "./common.js";
import { buildPracticeSession } from "./study.js";

/** Words the learner has started; falls back to the first words of the current deck. */
export async function practicePool(min = 12) {
  const keys = Object.entries(state.cards)
    .filter(([, c]) => status(c) !== "new")
    .map(([k]) => k);
  await ensureKeys(keys);
  let pool = keys.map((k) => words.get(k)).filter(Boolean);
  let source = "studied";
  if (pool.length < min) {
    const deck = await deckWords(state.settings.deck, state.settings.order);
    const extra = deck.filter((w) => !pool.includes(w)).slice(0, Math.max(40, min) - pool.length);
    pool = pool.concat(extra);
    source = pool.length === extra.length ? "deck" : "mixed";
  }
  return { pool, source };
}

const DRILLS = [
  ["drill-tones", "tone", "Tone trainer", "Hear a word and pick each syllable's tone. Train your ear on tone pairs, the way words are really spoken."],
  ["drill-listen", "ear", "Listening", "Hear a word, find it among four. Builds the ear-to-meaning link conversations need."],
  ["drill-read", "book", "Sentences", "Real sentences made of words you've studied, with audio and a hidden translation."],
  ["drill-speed", "bolt", "Speed round", "60 seconds of quick recognition. Fast recall frees your attention for listening."],
  ["drill-tricky", "knot", "Tricky words", "The words you've missed most, in one focused round. Doesn't change your schedule."],
];

export async function renderPractice(root, nav) {
  root.innerHTML = "";
  const page = h("section.page.practice");
  root.append(page);
  const { pool, source } = await practicePool();
  page.append(
    h("header.page-head", {
      html: `<p class="eyebrow">Extra practice</p><h1><span lang="zh-CN" class="h1-zh">练习</span> Practice</h1>
      <p class="lede">${
        source === "studied"
          ? `Drills use the ${plural(pool.length, "word")} you've started.`
          : `Drills use the first words of your current deck until you've studied a dozen or so.`
      } None of these change your review schedule.</p>`,
    }),
  );
  const list = h("div.drill-list");
  for (const [route, ic, title, desc] of DRILLS) {
    const best = state.best[route];
    list.append(
      h("a.drill", {
        href: "#" + route,
        html: `<span class="drill-ic">${icon(ic)}</span><span class="drill-text"><b>${title}</b><span>${desc}</span></span>${
          best ? `<span class="tag">Best ${best}</span>` : ""
        }${icon("right", "chev")}`,
      }),
    );
  }
  page.append(list);
  if (!canSpeakSentences()) {
    page.append(
      h("p.notice", {
        html: `${icon("info")} Words play from built-in recordings, but whole sentences need a Mandarin voice on this device. See Prefs → Audio for how to add one.`,
      }),
    );
  }
  const tones = Object.entries(state.tones);
  if (tones.length) page.append(toneStats());
}

function toneStats() {
  const box = h("section.card.tone-stats");
  box.innerHTML = `<h2 class="section-title">Your tones</h2><p class="muted small">Accuracy in the Tone trainer, per tone.</p>`;
  const per = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0], 5: [0, 0] };
  for (const [pattern, [r, t]] of Object.entries(state.tones)) {
    for (const ch of pattern) {
      if (per[ch]) {
        per[ch][0] += r / pattern.length;
        per[ch][1] += t / pattern.length;
      }
    }
  }
  const grid = h("div.tone-grid");
  for (const t of [1, 2, 3, 4, 5]) {
    const [r, n] = per[t];
    const pct = n ? Math.round((r / n) * 100) : null;
    grid.append(
      h("div.tone-cell", {
        html: `<span class="tone-mark t${t}">${TONE_SIGNS[t]}</span><b>${pct === null ? "–" : pct + "%"}</b><span>${t === 5 ? "neutral" : "tone " + t}</span>`,
      }),
    );
  }
  box.append(grid);
  return box;
}

function drillShell(root, title, onExit) {
  root.innerHTML = "";
  const wrap = h("div.study.drill-page");
  const top = h("div.study-top");
  const close = h("button.icon-btn", { type: "button", "aria-label": "Back to practice", html: icon("close"), onclick: onExit });
  const bar = h("div.progress", h("div.progress-fill"));
  const count = h("span.study-count", "");
  top.append(close, bar, count);
  const stage = h("div.stage");
  wrap.append(top, h("h2.drill-title", title), stage);
  root.append(wrap);
  return {
    stage,
    progress(done, total) {
      bar.firstChild.style.width = `${Math.round((done / total) * 100)}%`;
      count.textContent = `${done}/${total}`;
    },
    setCount(text) {
      count.textContent = text;
    },
    bar,
  };
}

let keyHandler = null;
function setKeys(fn) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener("keydown", fn);
}
export function stopDrillKeys() {
  setKeys(null);
}

function endScreen(stage, { title, score, total, best, again, onExit, missed = [] }) {
  setKeys(null);
  stage.innerHTML = "";
  const box = h("div.summary");
  box.innerHTML = `<div class="summary-seal" aria-hidden="true">练</div><h2>${esc(title)}</h2>
    <div class="stats"><div><b>${score}${total ? "/" + total : ""}</b><span>${total ? "correct" : "correct answers"}</span></div></div>
    ${best ? `<p class="streak-line">New best score</p>` : ""}`;
  if (missed.length) {
    box.append(h("h3", "Missed"));
    const chips = h("div.chips");
    for (const w of missed) {
      chips.append(h("button.chip", { type: "button", onclick: () => openWord(w), html: `<span class="hz" lang="zh-CN">${hanziHTML(w)}</span> <span class="chip-g">${esc(w.g.split(";")[0])}</span>` }));
    }
    box.append(chips);
  }
  const actions = h("div.actions", h("button.btn.ghost", { type: "button", text: "Back", onclick: onExit }), h("button.btn.primary", { type: "button", text: "Go again", onclick: again }));
  box.append(actions);
  stage.append(box);
  actions.lastChild.focus({ preventScroll: true });
}

// ---------- tone trainer ----------
export async function renderTones(root, onExit) {
  const { pool } = await practicePool(20);
  const cands = pool.filter((w) => {
    const syl = syllables(w).filter((s) => s.s !== "r");
    return syl.length >= 1 && syl.length <= 2 && !w.p.includes("/");
  });
  const two = cands.filter((w) => syllables(w).filter((s) => s.s !== "r").length === 2);
  const round = sample(two.length >= 6 ? two.concat(sample(cands, 3)) : cands, 10);
  const shell = drillShell(root, "Tone trainer", onExit);
  let i = 0;
  let score = 0;
  const missed = [];
  let showChars = false;

  function question() {
    if (i >= round.length) {
      const best = setBest("drill-tones", score);
      endScreen(shell.stage, { title: "Tone trainer", score, total: round.length, best, missed, again: () => renderTones(root, onExit), onExit });
      return;
    }
    shell.progress(i, round.length);
    window.scrollTo({ top: 0 });
    const word = round[i];
    const syl = syllables(word).filter((s) => s.s !== "r");
    const picks = new Array(syl.length).fill(0);
    const stage = shell.stage;
    stage.innerHTML = "";
    const prompt = h("div.prompt");
    const big = h("button.listen-btn", { type: "button", "aria-label": "Play the word", html: icon("sound"), onclick: () => playWord(word, { explicit: true }) });
    const charLine = h("div.prompt-face", { html: showChars ? `<span class="hz xl notone" lang="zh-CN">${esc(word.w)}</span>` : "" });
    const toggle = h("label.switch-line", { html: `<input type="checkbox" id="tone-show-chars" ${showChars ? "checked" : ""}> Show characters` });
    toggle.querySelector("input").addEventListener("change", (e) => {
      showChars = e.target.checked;
      charLine.innerHTML = showChars ? `<span class="hz xl notone" lang="zh-CN">${esc(word.w)}</span>` : "";
    });
    prompt.append(h("p.eyebrow", `Syllable${syl.length > 1 ? "s" : ""}: ${syl.length}`), big, h("div.row.center", soundButton(word, { slow: true })), charLine, toggle);
    stage.append(prompt);
    const pickers = h("div.tone-pickers");
    syl.forEach((s, si) => {
      const row = h("div.tone-row", { role: "radiogroup", "aria-label": `Syllable ${si + 1}` });
      row.append(h("span.tone-idx", String(si + 1)));
      for (const t of [1, 2, 3, 4, 5]) {
        const b = h(`button.tone-btn.t${t}`, { type: "button", role: "radio", "aria-checked": "false", "aria-label": t === 5 ? "neutral tone" : `tone ${t}`, html: `${toneContour(t)}<small>${t === 5 ? "neutral" : t}</small>` });
        b.addEventListener("click", () => choose(si, t));
        row.append(b);
      }
      pickers.append(row);
    });
    stage.append(pickers);
    const fb = h("div.feedback");
    stage.append(fb);
    let done = false;
    let active = 0;
    function choose(si, t) {
      if (done) return;
      picks[si] = t;
      const row = pickers.children[si];
      row.querySelectorAll(".tone-btn").forEach((b, k) => b.setAttribute("aria-checked", String(k + 1 === t)));
      active = Math.min(syl.length - 1, si + 1);
      if (picks.every(Boolean)) check();
    }
    function check() {
      done = true;
      const right = syl.every((s, k) => s.t === picks[k] || (s.t === 5 && picks[k] === 5));
      const pattern = syl.map((s) => s.t).join("");
      logTone(pattern, right);
      if (right) score += 1;
      else missed.push(word);
      pickers.querySelectorAll(".tone-row").forEach((row, k) => {
        row.querySelectorAll(".tone-btn").forEach((b, n) => {
          b.disabled = true;
          if (n + 1 === syl[k].t) b.classList.add("is-right");
          else if (n + 1 === picks[k]) b.classList.add("is-wrong");
        });
      });
      fb.className = `feedback show ${right ? "good" : "bad"}`;
      requestAnimationFrame(() => fb.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      fb.innerHTML = `<div class="fb-head">${icon(right ? "check" : "cross")} <span>${right ? "Correct" : "Listen again"}</span></div>
        <div class="fb-body"><div class="fb-face">${faceHTML(word, { reveal: true })}</div><p class="fb-gloss">${esc(word.g)}</p></div>`;
      const cont = h("button.btn.primary.wide", { type: "button", html: `Next ${icon("right")}`, onclick: nextQ });
      fb.append(cont);
      cont.focus({ preventScroll: true });
      playWord(word);
    }
    function nextQ() {
      i += 1;
      question();
    }
    setKeys((e) => {
      if (e.target.closest("input,textarea,select")) return;
      if (done && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextQ();
      } else if (!done && /^[0-5]$/.test(e.key)) choose(active, e.key === "0" ? 5 : Number(e.key) || 5);
      else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
    });
    setTimeout(() => playWord(word), 200);
  }
  if (!round.length) {
    shell.stage.append(h("p.muted", "Study a few words first, then come back to train your ear."));
    return;
  }
  question();
}

// ---------- listening ----------
export async function renderListen(root, onExit) {
  const { pool } = await practicePool(12);
  const round = sample(pool, Math.min(10, pool.length));
  const shell = drillShell(root, "Listening", onExit);
  let i = 0;
  let score = 0;
  const missed = [];
  function question() {
    if (i >= round.length) {
      const best = setBest("drill-listen", score);
      endScreen(shell.stage, { title: "Listening", score, total: round.length, best, missed, again: () => renderListen(root, onExit), onExit });
      return;
    }
    shell.progress(i, round.length);
    window.scrollTo({ top: 0 });
    const word = round[i];
    const stage = shell.stage;
    stage.innerHTML = "";
    const prompt = h("div.prompt");
    const big = h("button.listen-btn", { type: "button", "aria-label": "Play again", html: icon("sound"), onclick: () => playWord(word, { explicit: true }) });
    prompt.append(h("p.eyebrow", "Which word did you hear?"), big, h("div.row.center", soundButton(word, { slow: true })));
    stage.append(prompt);
    const len = [...word.w].length;
    const others = sample(
      pool.filter((w) => w.k !== word.k && w.w !== word.w && w.p !== word.p && ([...w.w].length === len || pool.length < 20)),
      3,
    );
    const opts = shuffle([word, ...others]);
    const grid = h("div.options");
    let done = false;
    const btns = opts.map((w, k) => {
      const b = h("button.option", { type: "button", html: `<kbd>${k + 1}</kbd>${optionHTML(w)}` });
      b.addEventListener("click", () => answer(k));
      grid.append(b);
      return b;
    });
    stage.append(grid);
    const fb = h("div.feedback");
    stage.append(fb);
    function answer(k) {
      if (done) return;
      done = true;
      const right = opts[k] === word;
      if (right) score += 1;
      else missed.push(word);
      btns.forEach((b, n) => {
        b.disabled = true;
        if (opts[n] === word) b.classList.add("is-right");
        else if (n === k) b.classList.add("is-wrong");
      });
      fb.className = `feedback show ${right ? "good" : "bad"}`;
      requestAnimationFrame(() => fb.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      fb.innerHTML = `<div class="fb-head">${icon(right ? "check" : "cross")} <span>${right ? "Correct" : "Not quite"}</span></div>
        <div class="fb-body"><div class="fb-face">${faceHTML(word, { reveal: true })}</div><p class="fb-gloss">${esc(word.g)}</p></div>`;
      const cont = h("button.btn.primary.wide", { type: "button", html: `Next ${icon("right")}`, onclick: nextQ });
      fb.append(cont);
      cont.focus({ preventScroll: true });
    }
    function nextQ() {
      i += 1;
      question();
    }
    setKeys((e) => {
      if (e.target.closest("input,textarea,select")) return;
      const n = Number(e.key);
      if (!done && n >= 1 && n <= opts.length) answer(n - 1);
      else if (done && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextQ();
      } else if (e.key.toLowerCase() === "r") playWord(word, { explicit: true });
    });
    setTimeout(() => playWord(word), 200);
  }
  if (round.length < 4) {
    shell.stage.append(h("p.muted", "Study a few words first, then come back for listening practice."));
    return;
  }
  question();
}

// ---------- speed round ----------
export async function renderSpeed(root, onExit) {
  const { pool } = await practicePool(12);
  const shell = drillShell(root, "Speed round", onExit);
  if (pool.length < 4) {
    shell.stage.append(h("p.muted", "Study a few words first."));
    return;
  }
  const stage = shell.stage;
  stage.innerHTML = "";
  const intro = h("div.prompt", {
    html: `<p class="eyebrow">60 seconds</p><p class="prompt-en">Pick the meaning as fast as you can.</p><p class="muted small">Keys 1–4 work too.</p>`,
  });
  const go = h("button.btn.primary.big", { type: "button", html: `${icon("bolt")} Start` });
  stage.append(intro, h("div.row.center", go));
  go.focus({ preventScroll: true });
  go.addEventListener("click", start);

  function start() {
    let score = 0;
    let wrong = 0;
    const missed = new Set();
    const ends = Date.now() + 60000;
    let ticker = null;
    function tick() {
      const left = Math.max(0, ends - Date.now());
      shell.bar.firstChild.style.width = `${(left / 60000) * 100}%`;
      shell.setCount(`${Math.ceil(left / 1000)}s · ${score}`);
      if (left <= 0) {
        clearInterval(ticker);
        const best = setBest("drill-speed", score);
        endScreen(stage, { title: "Speed round", score, total: 0, best, missed: [...missed].slice(0, 12), again: () => renderSpeed(root, onExit), onExit });
      }
    }
    ticker = setInterval(tick, 200);
    tick();
    function question() {
      if (Date.now() >= ends) return;
      const word = pool[Math.floor(Math.random() * pool.length)];
      const others = sample(pool.filter((w) => w.k !== word.k && w.g !== word.g), 3);
      const opts = shuffle([word, ...others]);
      stage.innerHTML = "";
      stage.append(h("div.prompt", { html: `<div class="prompt-face">${faceHTML(word, { size: "xl" })}</div>` }));
      const grid = h("div.options");
      let locked = false;
      const btns = opts.map((w, k) => {
        const b = h("button.option", { type: "button", html: `<kbd>${k + 1}</kbd><span class="opt-en">${esc(w.g)}</span>` });
        b.addEventListener("click", () => answer(k));
        grid.append(b);
        return b;
      });
      stage.append(grid);
      function answer(k) {
        if (locked || Date.now() >= ends) return;
        locked = true;
        const right = opts[k] === word;
        if (right) score += 1;
        else {
          wrong += 1;
          missed.add(word);
        }
        btns[k].classList.add(right ? "is-right" : "is-wrong");
        if (!right) btns[opts.indexOf(word)].classList.add("is-right");
        setTimeout(question, right ? 180 : 700);
      }
      setKeys((e) => {
        const n = Number(e.key);
        if (n >= 1 && n <= 4) answer(n - 1);
      });
    }
    question();
  }
}

// ---------- sentences ----------
export async function renderRead(root, onExit) {
  const shell = drillShell(root, "Sentences", onExit);
  const stage = shell.stage;
  stage.append(h("p.muted", "Loading sentences…"));
  let all;
  try {
    all = await loadSentences();
  } catch {
    stage.innerHTML = "";
    stage.append(h("p", "Couldn't load the sentences. Check your connection."));
    return;
  }
  const { pool, source } = await practicePool(30);
  const known = new Set(pool.map((w) => w.w));
  // score sentences by how many of their words are already studied
  const scored = [];
  for (const s of all) {
    const toks = s.tokens.filter((t) => t.p);
    if (toks.length < 2) continue;
    const unknown = toks.filter((t) => !known.has(t.t)).length;
    if (source !== "studied" ? s.h === 1 && unknown <= 1 : unknown === 0 || (unknown === 1 && toks.length >= 4)) {
      scored.push([unknown, toks.length, s]);
    }
  }
  let list = shuffle(scored).sort((a, b) => a[0] - b[0]).slice(0, 30).map((x) => x[2]);
  if (list.length < 5) list = shuffle(all.filter((s) => s.h === 1)).slice(0, 20);
  list = shuffle(list);
  let i = 0;
  function show() {
    shell.progress(i + 1, list.length);
    stage.innerHTML = "";
    const s = list[i];
    stage.append(h("p.eyebrow.center", "Read it, play it, then check the meaning"));
    stage.append(sentenceBlock(s, { showEnglish: false }));
    stage.append(h("p.muted.small.center", "Tap a word to look it up. Tap the grey bar to see the translation."));
    const actions = h("div.actions");
    const prev = h("button.btn.ghost", { type: "button", html: `${icon("left")} Back`, disabled: i === 0 });
    const nextBtn = h("button.btn.primary", { type: "button", html: i + 1 < list.length ? `Next ${icon("right")}` : "Finish" });
    prev.addEventListener("click", () => {
      i = Math.max(0, i - 1);
      show();
    });
    nextBtn.addEventListener("click", () => {
      if (i + 1 >= list.length) return onExit();
      i += 1;
      show();
    });
    actions.append(prev, nextBtn);
    stage.append(actions);
    if (state.settings.autoplay && canSpeakSentences()) stage.querySelector(".sentence .sound")?.click();
    setKeys((e) => {
      if (e.key === "ArrowRight" || e.key === "Enter") nextBtn.click();
      else if (e.key === "ArrowLeft") prev.click();
      else if (e.key.toLowerCase() === "t") stage.querySelector(".sent-en")?.click();
      else if (e.key.toLowerCase() === "r") stage.querySelector(".sentence .sound")?.click();
    });
  }
  show();
}

// ---------- tricky words ----------
export async function startTricky(nav) {
  const keys = Object.entries(state.cards)
    .filter(([, c]) => (c.lapses || 0) >= 1 || (c.s === 1 && (c.reps || 0) >= 3) || c.s === 3)
    .sort((a, b) => (b[1].lapses || 0) - (a[1].lapses || 0))
    .slice(0, 20)
    .map(([k]) => k);
  await ensureKeys(keys);
  const list = keys.map((k) => words.get(k)).filter(Boolean);
  if (list.length < 3) {
    toast("No tricky words yet. Words you get wrong will collect here.");
    nav("practice");
    return;
  }
  buildPracticeSession(list, "Tricky words");
  nav("study");
}
