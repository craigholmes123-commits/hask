// 茶馆 Teahouse: comprehensible input. Graded tales you can mostly understand,
// a stream of sentences one new word beyond what you know, and where to find more.
import { byHanzi, ensureKeys, loadSentences, loadStories, words } from "../data.js";
import { coverage, fit, isFamiliar, pickIPlusOne, recommend } from "../ci.js";
import { QI, REALMS, finishTale, taleRecord } from "../game.js";
import { esc, tokenHTML } from "../pinyin.js";
import { canSpeakSentences, speak, stopSpeaking } from "../speech.js";
import { bumpDay, isPinned, pinWord, setSetting, state } from "../state.js";
import { h, icon, openSheet, plural, toast } from "../ui.js";
import { openWord, sentenceBlock } from "./common.js";
import { gainQi, showUnlocks } from "./rewards.js";

// ---------- shared ----------
let playRun = 0; // bumping it stops "listen to it all"
let refresher = null; // re-draws Chinese text when the script switch changes
let keyHandler = null;

function setKeys(fn) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener("keydown", fn);
}

/** Leaving a Teahouse screen: stop reading aloud and release the keyboard. */
export function stopTeahouse() {
  playRun += 1;
  refresher = null;
  setKeys(null);
}

/** The 汉字/pīnyīn switch changed while reading: redraw the text in place. */
export function refreshTeahouse() {
  if (refresher) refresher();
  return !!refresher;
}

function levelLabel(lv) {
  const r = REALMS[lv];
  return r ? `<span lang="zh-CN">${r.zh}</span> · ${esc(r.scripture)}` : "";
}

const finished = (id) => (taleRecord(id)?.n || 0) > 0;

/** Fit label: a tale written for your realm isn't "hard", it's what you're here to learn. */
function fitFor(story, cov) {
  const f = fit(cov.pct);
  if (f.id === "hard" && story.level <= state.game.realm) return { id: "realm", label: "Made for your realm" };
  return f;
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

/** Chinese text as tappable words; words you haven't studied get the "new" mark. */
function tokensHTML(tokens, names) {
  const m = state.settings.script;
  return tokens
    .map((tok, i) => {
      const isNew = tok.k && tok.k !== "#" && !names.has(tok.t) && (tok.k.startsWith("g:") || !isFamiliar(state.cards[tok.k]));
      const html = tokenHTML(tok.t, tok.p, tok.p ? m : "hanzi");
      return html.replace('<span class="tok">', `<span class="tok${isNew ? " new" : ""}${tok.k && tok.k !== "#" ? " tap" : ""}" data-i="${i}">`);
    })
    .join("");
}

/** A line of Chinese that redraws itself and opens words when tapped. */
function zhLine(tag, tokens, story) {
  const names = new Set(story ? story.words.filter((w) => w.name).map((w) => w.w) : []);
  const el = h(tag, { lang: "zh-CN" });
  el.classList.add("sent-zh", "ci-tokens");
  el._draw = () => (el.innerHTML = tokensHTML(tokens, names));
  el._draw();
  el.addEventListener("click", (e) => {
    const t = e.target.closest(".tok");
    if (!t || !el.contains(t)) return;
    e.stopPropagation();
    lookUp(tokens[Number(t.dataset.i)], story);
  });
  return el;
}

async function lookUp(tok, story) {
  if (!tok || !tok.k || tok.k === "#") return;
  if (tok.k.startsWith("g:")) {
    const sw = story && story.words.find((w) => w.w === tok.t);
    if (sw) storyWordSheet(sw);
    return;
  }
  if (!words.has(tok.k)) await ensureKeys([tok.k]).catch(() => {});
  const w = words.get(tok.k);
  if (w) openWord(w);
}

function storyWordSheet(sw) {
  const box = h("div.word-sheet.story-word");
  box.innerHTML = `
    <div class="ws-head">
      <div class="tianzige ${[...sw.w].length > 2 ? "long" : ""}" lang="zh-CN">${esc(sw.w)}</div>
      <div class="ws-title"><div class="ws-py">${esc(sw.p)}</div>
        <div class="ws-tags"><span class="tag">${sw.name ? "Name" : "Word from this tale"}</span></div></div>
    </div>
    <p class="ws-gloss">${esc(sw.g)}</p>
    <p class="muted small">${sw.name ? "A name in this story." : "Not on the HSK lists, or used here in a special sense. Taught with the story."}</p>`;
  openSheet(box, { label: `${sw.w} ${sw.p}` });
}

function textOf(tokens) {
  return tokens.map((t) => t.t).join("");
}

function sentenceHint() {
  return h("p.notice", {
    html: `${icon("info")} Words play from built-in recordings, but reading whole sentences aloud needs a Mandarin voice on this device. See Sect Hall → Audio.`,
  });
}

// ---------- the Teahouse ----------
export async function renderTeahouse(root) {
  stopTeahouse();
  root.innerHTML = "";
  const page = h("section.page.teahouse");
  root.append(page);
  page.append(
    h("header.page-head", {
      html: `<p class="eyebrow">茶馆 · Teahouse</p><h1><span lang="zh-CN" class="h1-zh calli">茶馆</span> Teahouse</h1>
      <p class="lede">Comprehensible input: tales and sentences you can <em>mostly</em> understand. Read and listen for the meaning rather than to drill. Plenty of easy input is how your mind picks up Chinese naturally.</p>`,
    }),
  );
  let stories;
  try {
    stories = await loadStories();
  } catch {
    page.append(h("p.notice", { html: `${icon("info")} Couldn't load the tales. Check your connection and try again.` }));
    return;
  }
  const g = state.game;
  const rec = recommend(stories, state.cards, g.realm, finished);
  if (rec) page.append(featured(rec));
  else
    page.append(
      h("section.card.ci-featured", {
        html: `<p class="eyebrow">说书人 · The storyteller</p><h2>You have heard every tale</h2><p>Reread a favourite. Second and third readings are where words really stick, and every tale pays Qi again each day.</p>`,
      }),
    );

  page.append(
    h("a.card.ci-link", {
      href: "#chatter",
      html: `<span class="ci-link-ic" lang="zh-CN">闲</span><span class="ci-link-text"><b><span lang="zh-CN">闲谈</span> Teahouse chatter</b><span>Single sentences from real Chinese, each with just one word you haven't learned yet.</span></span>${icon("right", "chev")}`,
    }),
  );

  const levels = [...new Set(stories.map((s) => s.level))].sort((a, b) => a - b);
  for (const lv of levels) {
    const sec = h("section.tale-group");
    sec.append(h("h2.section-title", { html: levelLabel(lv) }));
    const list = h("div.tale-list");
    for (const s of stories.filter((x) => x.level === lv)) list.append(taleRow(s));
    sec.append(list);
    page.append(sec);
  }
  page.append(howTo(), beyond());
}

function featured(s) {
  const cov = coverage(s, state.cards);
  const f = fitFor(s, cov);
  const box = h("section.card.ci-featured");
  box.innerHTML = `
    <p class="eyebrow">说书人 · The storyteller suggests</p>
    <h2><span class="calli" lang="zh-CN">${esc(s.title)}</span> <span class="ci-en">${esc(s.en)}</span></h2>
    <p class="ci-sub">${s.series ? `<span lang="zh-CN">${esc(s.series.zh)}</span> ${esc(s.series.en)}, part ${s.series.part} · ` : ""}${levelLabel(s.level)} · ${plural(s.sentences.length, "sentence")}</p>
    <p>${esc(s.blurb)}</p>
    <div class="fit-line fit-${f.id}"><span class="fit-bar"><i style="width:${pct(cov.pct)}"></i></span><span><b>${pct(cov.pct)}</b> of its words known · ${f.label}</span></div>`;
  box.append(h("a.btn.primary.big", { href: "#tale-" + s.id, html: `${icon("sound")} <span>Hear the tale</span>` }));
  return box;
}

function taleRow(s) {
  const cov = coverage(s, state.cards);
  const f = fitFor(s, cov);
  const rec = taleRecord(s.id);
  return h("a.tale-row", {
    href: "#tale-" + s.id,
    html: `<span class="tr-main"><span class="tr-title"><b class="calli" lang="zh-CN">${esc(s.title)}</b> <span>${esc(s.en)}</span></span>
      <span class="tr-meta">${s.series ? `<span lang="zh-CN">${esc(s.series.zh)}</span> ${s.series.part} · ` : ""}${plural(s.sentences.length, "sentence")}${rec ? ` · read ${rec.n}×` : ""}</span>
      <span class="fit-line small fit-${f.id}"><span class="fit-bar"><i style="width:${pct(cov.pct)}"></i></span><span>${pct(cov.pct)} known</span></span></span>
      ${rec ? `<span class="seal" title="Finished" lang="zh-CN">读</span>` : ""}${icon("right", "chev")}`,
  });
}

function howTo() {
  const box = h("section.card.prose.ci-how");
  box.innerHTML = `<h2 class="section-title">How to listen in the teahouse</h2>
    <ol>
      <li><b>Pick tales you mostly understand.</b> Around 85% known words is right; the bar on each tale shows yours.</li>
      <li><b>Listen first, then read.</b> Play the whole tale and catch what you can, then read along with the sound.</li>
      <li><b>Don't stop at every word.</b> Guess from context. Tap a word only when the sentence makes no sense without it.</li>
      <li><b>Hide the English.</b> Tap the grey bar under a sentence only after you have tried.</li>
      <li><b>Reread tomorrow.</b> A second reading feels easier, and that ease is the learning.</li>
    </ol>`;
  return box;
}

const OUTSIDE = [
  ["Beginner", [
    ["Lazy Chinese", "https://www.lazychinese.com/", "Slow, simple stories told for learners as a podcast and on YouTube, with free transcripts."],
    ["Mandarin Click", "https://www.youtube.com/results?search_query=Mandarin+Click+chinese+stories", "Picture-supported graded stories on YouTube, from absolute beginner up."],
    ["BlaBla Chinese", "https://www.youtube.com/results?search_query=BlaBla+Chinese", "YouTube playlists sorted into super-beginner, beginner and intermediate."],
    ["小猪佩奇 Peppa Pig", "https://www.youtube.com/results?search_query=%E5%B0%8F%E7%8C%AA%E4%BD%A9%E5%A5%87", "Short cartoon episodes in simple, everyday Mandarin."],
  ]],
  ["Intermediate", [
    ["Mandarin Companion", "https://mandarincompanion.com/", "Graded readers: classic novels retold in a few hundred characters."],
    ["Xiaogua Chinese", "https://www.youtube.com/results?search_query=Xiaogua+Chinese", "Stories, podcasts and travel videos with a large free back catalogue."],
    ["Mandarin Corner", "https://www.youtube.com/results?search_query=Mandarin+Corner", "Real conversations and street interviews with subtitles, once tales feel easy."],
  ]],
];

function beyond() {
  const box = h("section.card.ci-beyond");
  box.innerHTML = `<h2 class="section-title"><span lang="zh-CN">茶馆之外</span> Beyond the teahouse</h2>
    <p class="muted small">The more you hear, the faster it goes. These free and paid sources are popular with learners. They are not part of Hask and open in a new tab.</p>
    ${OUTSIDE.map(
      ([lv, list]) => `<h3>${lv}</h3><ul class="ci-outside">${list
        .map(([name, url, desc]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer"><b>${esc(name)}</b></a> <span>${esc(desc)}</span></li>`)
        .join("")}</ul>`,
    ).join("")}`;
  return box;
}

// ---------- a tale ----------
export async function renderTale(root, id) {
  stopTeahouse();
  const stories = await loadStories();
  const story = stories.find((s) => s.id === id);
  if (!story) {
    location.hash = "teahouse";
    return;
  }
  const keys = new Set();
  for (const list of [...story.sentences.map((s) => s.tokens), ...story.questions.flatMap((q) => [q.tokens, ...q.options])]) {
    for (const t of list) if (t.k && t.k !== "#" && !t.k.startsWith("g:")) keys.add(t.k);
  }
  for (const w of story.words) if (w.k) keys.add(w.k);
  await ensureKeys([...keys]).catch(() => {});

  root.innerHTML = "";
  const page = h("article.page.tale");
  root.append(page);
  const applyToggles = () => {
    page.classList.toggle("show-trans", !!state.settings.ciTrans);
    page.classList.toggle("mark-new", state.settings.ciMark !== false);
  };
  applyToggles();

  const cov = coverage(story, state.cards);
  const f = fitFor(story, cov);
  page.append(
    h("a.back", { href: "#teahouse", html: `${icon("left")} Teahouse` }),
    h("header.tale-head", {
      html: `<p class="eyebrow">${story.series ? `<span lang="zh-CN">${esc(story.series.zh)}</span> · Part ${story.series.part} · ` : ""}${levelLabel(story.level)}</p>
        <h1><span class="calli" lang="zh-CN">${esc(story.title)}</span></h1>
        <p class="tale-en">${esc(story.en)}</p>
        <div class="fit-line fit-${f.id}"><span class="fit-bar"><i style="width:${pct(cov.pct)}"></i></span><span><b>${pct(cov.pct)}</b> of its words known · ${f.label}</span></div>`,
    }),
  );

  // words taught before the story
  if (story.words.some((w) => !w.name) || story.words.length) {
    const box = h("section.card.tale-words");
    box.append(h("h2.section-title", "Words to know"), h("p.muted.small", "Met in this tale. Tap one for more."));
    const chips = h("div.tw-chips");
    for (const sw of story.words) {
      chips.append(
        h("button.tw-chip", {
          type: "button",
          html: `<span class="hz" lang="zh-CN">${esc(sw.w)}</span><span class="py">${esc(sw.p)}</span><span class="tw-g">${esc(sw.g.split(/[;,(]/)[0].trim())}</span>`,
          onclick: () => (sw.k && words.get(sw.k) ? openWord(words.get(sw.k)) : storyWordSheet(sw)),
        }),
      );
    }
    box.append(chips);
    page.append(box);
  }

  // toolbar
  const LISTEN = `${icon("sound")} <span>Listen</span>`;
  const listen = h("button.btn.primary.small.tale-listen", { type: "button", "aria-label": "Listen to the whole tale", html: LISTEN });
  const trans = h("button.btn.ghost.small.toggle", { type: "button", "aria-pressed": String(!!state.settings.ciTrans), html: `<span lang="zh-CN">译</span> English` });
  const mark = h("button.btn.ghost.small.toggle", { type: "button", "aria-pressed": String(state.settings.ciMark !== false), html: `<span class="mark-demo" lang="zh-CN">新</span> New` });
  trans.title = "Show every English translation";
  mark.title = "Underline words you haven't studied yet";
  trans.addEventListener("click", () => {
    setSetting("ciTrans", !state.settings.ciTrans);
    trans.setAttribute("aria-pressed", String(!!state.settings.ciTrans));
    applyToggles();
  });
  mark.addEventListener("click", () => {
    setSetting("ciMark", state.settings.ciMark === false);
    mark.setAttribute("aria-pressed", String(state.settings.ciMark !== false));
    applyToggles();
  });
  page.append(h("div.tale-tools", listen, h("div.tale-toggles", trans, mark)));
  if (!canSpeakSentences()) page.append(sentenceHint());

  // the text, on a scroll
  const scroll = h("div.tale-scroll.paper");
  const lines = [];
  story.paras.forEach((para) => {
    const p = h("div.tale-para");
    for (const sent of para) {
      const idx = lines.length;
      const line = h("div.tale-line");
      const play = h("button.icon-btn.sound.tl-play", { type: "button", "aria-label": "Play sentence", html: icon("sound") });
      play.addEventListener("click", () => playFrom(idx, true));
      const en = h("p.sent-en.veiled", { tabindex: "0", role: "button", "aria-label": "Show translation", text: sent.en });
      const reveal = () => en.classList.remove("veiled");
      en.addEventListener("click", reveal);
      en.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && reveal());
      line.append(play, h("div.tl-text", zhLine("p.tl-zh", sent.tokens, story), en));
      p.append(line);
      lines.push({ el: line, text: textOf(sent.tokens) });
    }
    scroll.append(p);
  });
  page.append(scroll);

  async function playFrom(start, single = false) {
    if (!canSpeakSentences()) {
      toast("Reading sentences aloud needs a Mandarin voice on this device. See Sect Hall → Audio.");
      return;
    }
    const run = ++playRun;
    stopSpeaking();
    if (!single) listen.innerHTML = `${icon("close")} <span>Stop</span>`;
    for (let i = start; i < lines.length; i++) {
      if (run !== playRun || !page.isConnected) break;
      const ln = lines[i];
      lines.forEach((l) => l.el.classList.remove("speaking"));
      ln.el.classList.add("speaking");
      if (!single) ln.el.scrollIntoView({ block: "center", behavior: "smooth" });
      const ok = await speak(ln.text);
      if (run !== playRun) break;
      if (!ok) {
        toast("Couldn't read this aloud. See Sect Hall → Audio.");
        break;
      }
      if (single) break;
      await new Promise((r) => setTimeout(r, 450));
    }
    if (run === playRun) {
      lines.forEach((l) => l.el.classList.remove("speaking"));
      listen.innerHTML = LISTEN;
      if (!single) playRun += 1;
    }
  }
  let playingAll = false;
  listen.addEventListener("click", () => {
    if (playingAll) {
      playingAll = false;
      playRun += 1;
      stopSpeaking();
      lines.forEach((l) => l.el.classList.remove("speaking"));
      listen.innerHTML = LISTEN;
      return;
    }
    playingAll = true;
    playFrom(0).finally(() => (playingAll = false));
  });

  // the storyteller's questions, then the reward
  const quiz = h("section.card.tale-quiz");
  quiz.append(h("h2.section-title", { html: `<span lang="zh-CN">说书人问</span> The storyteller asks` }), h("p.muted.small", "Answer to finish the tale and gather its Qi."));
  let answered = 0;
  let correct = 0;
  story.questions.forEach((q, qi) => {
    const box = h("div.tq");
    const tf = q.options.length === 2 && textOf(q.options[0]) === "对" && textOf(q.options[1]) === "不对";
    box.append(h("p.tq-n", tf ? `${qi + 1}. 对不对？ True or false?` : `${qi + 1}.`));
    box.append(zhLine("p.tq-zh", q.tokens, story));
    const en = h("p.sent-en.veiled", { tabindex: "0", role: "button", "aria-label": "Show the question in English", text: q.en });
    en.addEventListener("click", () => en.classList.remove("veiled"));
    box.append(en);
    const opts = h("div.options.tq-opts");
    let done = false;
    const btns = q.options.map((o, oi) => {
      const b = h("button.option", { type: "button" });
      b.append(h("kbd", String(oi + 1)));
      const z = zhLine("span.tq-opt", o, story);
      b.append(z);
      b.addEventListener("click", (e) => {
        if (e.target.closest(".tok") && done) return; // after answering, taps look words up
        if (done) return;
        e.stopPropagation();
        done = true;
        const right = oi === q.answer;
        btns.forEach((x, n) => {
          x.classList.add("answered");
          if (n === q.answer) x.classList.add("is-right");
          else if (n === oi) x.classList.add("is-wrong");
        });
        en.classList.remove("veiled");
        answered += 1;
        if (right) correct += 1;
        if (answered === story.questions.length) complete(b);
      }, true);
      opts.append(b);
      return b;
    });
    box.append(opts);
    quiz.append(box);
  });
  page.append(quiz);
  const endBox = h("div.tale-end");
  page.append(endBox);

  function complete(anchor) {
    playRun += 1;
    const res = finishTale(story.id, { sentences: story.sentences.length, correct });
    bumpDay("ci", story.sentences.length);
    let qi = 0;
    if (res.qiBase) qi = gainQi(res.qiBase, anchor, { source: "tale" }).gained;
    const unknown = coverage(story, state.cards).unknown.filter((u) => !u.k.startsWith("g:") && words.has(u.k));
    const fresh = unknown.filter((u) => !isPinned(u.k)).slice(0, 10);
    const card = h("section.card.summary.tale-done");
    card.innerHTML = `<p class="eyebrow">听完了 · Tale finished</p>
      <h2><span class="calli" lang="zh-CN">${esc(story.title)}</span> ${esc(story.en)}</h2>
      <div class="stats">
        <div><b>${correct}/${story.questions.length}</b><span>answers right</span></div>
        <div><b>${qi ? "+" + qi : "–"}</b><span>${qi ? "灵气 Qi" : "Qi already gathered today"}</span></div>
        ${res.stones ? `<div><b>+${res.stones}</b><span>灵石 first reading</span></div>` : ""}
      </div>`;
    if (fresh.length) {
      const learn = h("div.tale-learn");
      learn.append(
        h("p", {
          html: `<b>${plural(unknown.length, "word")}</b> in this tale ${unknown.length === 1 ? "is" : "are"} new to you. Start with ${fresh.length === 1 ? "this one" : `these ${fresh.length}`}: <span lang="zh-CN">${fresh.map((u) => esc(u.t)).join("、")}</span>`,
        }),
      );
      const add = h("button.btn.small", { type: "button", text: fresh.length === 1 ? "Learn it next" : `Learn these ${fresh.length} next` });
      add.addEventListener("click", () => {
        let n = 0;
        for (const u of fresh) if (pinWord(u.k)) n += 1;
        add.disabled = true;
        add.textContent = "Added to your next sessions";
        toast(`${plural(n, "word")} will come first in your next cultivation sessions.`);
      });
      learn.append(add);
      card.append(learn);
    }
    const next = recommend(stories, state.cards, state.game.realm, finished);
    if (next && next.id !== story.id) card.append(h("p.tale-next", { html: `Up next: <b class="calli" lang="zh-CN">${esc(next.title)}</b> ${esc(next.en)}` }));
    const actions = h("div.actions");
    actions.append(h("a.btn.ghost", { href: "#teahouse", text: "Teahouse" }));
    if (next && next.id !== story.id) actions.append(h("a.btn.primary", { href: "#tale-" + next.id, html: `Next tale ${icon("right")}` }));
    card.append(actions);
    endBox.append(card);
    setTimeout(() => card.isConnected && card.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
    setTimeout(() => page.isConnected && showUnlocks(), 900);
  }

  refresher = () => {
    const top = (document.querySelector(".tale-tools")?.getBoundingClientRect().bottom || 0) + 4;
    const anchor = lines.map((l) => l.el).find((el) => el.getBoundingClientRect().bottom > top);
    const before = anchor && anchor.getBoundingClientRect().top;
    page.querySelectorAll(".ci-tokens").forEach((el) => el._draw && el._draw());
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
  };
  setKeys((e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key.toLowerCase() === "t") trans.click();
    else if (e.key.toLowerCase() === "n") mark.click();
    else if (e.key === " " && !e.target.closest("button")) {
      e.preventDefault();
      listen.click();
    }
  });
}

// ---------- chatter: i+1 sentences ----------
export async function renderChatter(root) {
  stopTeahouse();
  root.innerHTML = "";
  const page = h("section.page.chatter");
  root.append(page);
  page.append(
    h("a.back", { href: "#teahouse", html: `${icon("left")} Teahouse` }),
    h("header.page-head", {
      html: `<p class="eyebrow">闲谈 · Teahouse chatter</p><h1><span lang="zh-CN" class="h1-zh calli">闲谈</span> Chatter</h1>
      <p class="lede">Sentences overheard at the next table. Each has <b>one word</b> you haven't learned yet; the rest you know. Work out the new word from the others before you tap it.</p>`,
    }),
  );
  const stage = h("div.chatter-stage");
  page.append(stage);
  stage.append(h("p.muted", "Listening in…"));
  let all;
  try {
    all = await loadSentences();
  } catch {
    stage.innerHTML = "";
    stage.append(h("p.notice", { html: `${icon("info")} Couldn't load the sentences. Check your connection.` }));
    return;
  }
  const familiarKeys = Object.entries(state.cards)
    .filter(([, c]) => isFamiliar(c))
    .map(([k]) => k);
  await ensureKeys(familiarKeys).catch(() => {});
  const known = new Set(familiarKeys.map((k) => words.get(k)?.w).filter(Boolean));
  const items = pickIPlusOne(all, known, { limit: 30 });
  stage.innerHTML = "";
  if (items.filter((x) => x.word).length < 3) {
    stage.append(
      h("section.card", {
        html: `<h2>The tables are quiet</h2><p>Chatter needs words you already know: it looks for sentences where you know everything but one word. Cultivate a few sessions first (around 30 words), or start with the tales.</p>`,
      }),
      h("div.actions", h("a.btn.ghost", { href: "#teahouse", text: "Back to the tales" }), h("a.btn.primary", { href: "#cave", text: "Go cultivate" })),
    );
    return;
  }
  if (!canSpeakSentences()) page.insertBefore(sentenceHint(), stage);
  let i = 0;
  const readDone = new Set();
  function show() {
    stage.innerHTML = "";
    const it = items[i];
    stage.append(h("p.chatter-count", `${i + 1} / ${items.length}`));
    const card = h("div.card.paper.chatter-card");
    card.append(sentenceBlock(it.s, { highlight: it.word, showEnglish: !!state.settings.ciTrans }));
    if (it.word) {
      const w = (byHanzi.get(it.word) || [])[0];
      const row = h("div.chatter-new");
      row.append(h("span.muted.small", { html: `New word: <b lang="zh-CN">${esc(it.word)}</b>` }));
      if (w) {
        row.append(h("button.btn.ghost.small", { type: "button", text: "Look it up", onclick: () => openWord(w) }));
        const pin = h("button.btn.ghost.small", { type: "button", text: isPinned(w.k) ? "Learning next ✓" : "Learn next" });
        pin.addEventListener("click", () => {
          if (pinWord(w.k)) toast(`${w.w} will come first in your next session.`);
          pin.textContent = "Learning next ✓";
          pin.disabled = true;
        });
        pin.disabled = isPinned(w.k);
        row.append(pin);
      }
      card.append(row);
    } else {
      card.append(h("p.muted.small.center", "You know every word here. Read it at speaking pace."));
    }
    stage.append(card);
    const prev = h("button.btn.ghost", { type: "button", html: `${icon("left")} Back`, disabled: i === 0 });
    const next = h("button.btn.primary", { type: "button", html: i + 1 < items.length ? `Next ${icon("right")}` : "Finish" });
    prev.addEventListener("click", () => {
      i = Math.max(0, i - 1);
      show();
    });
    next.addEventListener("click", () => {
      if (!readDone.has(i)) {
        readDone.add(i);
        gainQi(QI.read, next, { source: "tale" });
        bumpDay("ci");
      }
      if (i + 1 >= items.length) {
        location.hash = "teahouse";
        return;
      }
      i += 1;
      show();
    });
    stage.append(h("div.actions", prev, next));
    if (state.settings.autoplay && canSpeakSentences()) card.querySelector(".sentence .sound")?.click();
    setKeys((e) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next.click();
      else if (e.key === "ArrowLeft") prev.click();
      else if (e.key.toLowerCase() === "t") card.querySelector(".sent-en")?.click();
      else if (e.key.toLowerCase() === "r") card.querySelector(".sentence .sound")?.click();
    });
  }
  refresher = show;
  show();
}
