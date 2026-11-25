// Shared view pieces: word faces in each script mode, rows, the word sheet.
import { family, freqLabel, levelName, loadChars, loadSentences, posLabel, byHanzi, words } from "../data.js";
import { esc, hanziHTML, pinyinHTML, rubyHTML, tokenHTML } from "../pinyin.js";
import { canSpeakMandarin, speak } from "../speech.js";
import { formatSpan, isDue, markKnown, status } from "../srs.js";
import { getCard, putCard, resetCard, state } from "../state.js";
import { h, icon, openSheet, toast } from "../ui.js";

export const STATUS_TEXT = { new: "New", learning: "Learning", review: "Reviewing", known: "Known" };

export function mode() {
  return state.settings.script;
}

/**
 * The Chinese side of a word in the current script mode.
 * reveal=true shows both scripts regardless (after answering).
 */
export function faceHTML(word, { reveal = false, ruby = false, size = "" } = {}) {
  const m = reveal ? "both" : mode();
  const hz = `<span class="hz ${size}" lang="zh-CN">${ruby && m === "both" ? rubyHTML(word) : hanziHTML(word)}</span>`;
  const py = `<span class="py ${size}">${pinyinHTML(word)}</span>`;
  if (m === "hanzi") return `<span class="face">${hz}</span>`;
  if (m === "pinyin") return `<span class="face face-py">${py}</span>`;
  if (ruby) return `<span class="face">${hz}</span>`;
  return `<span class="face">${hz}${py}</span>`;
}

/** Compact one-line label for buttons/options in the current mode. */
export function optionHTML(word) {
  const m = mode();
  if (m === "hanzi") return `<span class="hz" lang="zh-CN">${hanziHTML(word)}</span>`;
  if (m === "pinyin") return `<span class="py">${pinyinHTML(word)}</span>`;
  return `<span class="hz" lang="zh-CN">${hanziHTML(word)}</span><span class="py small">${pinyinHTML(word)}</span>`;
}

export function sealHTML(card) {
  const st = status(card);
  if (st === "known") return `<span class="seal" title="Known">熟</span>`;
  if (st === "new") return `<span class="dot dot-new" title="New"></span>`;
  if (st === "learning") return `<span class="dot dot-learning" title="Learning"></span>`;
  return `<span class="dot dot-review" title="Reviewing"></span>`;
}

/** Speak a word. Autoplay stays silent without a voice; a tap (explicit) explains why nothing plays. */
export function playWord(word, opts = {}) {
  if (!canSpeakMandarin()) {
    if (opts.explicit) toast("No Mandarin voice found on this device. See Prefs → Audio.");
    return Promise.resolve(false);
  }
  return speak(word.w, opts);
}

export function soundButton(word, { slow = false, label } = {}) {
  return h("button.icon-btn.sound", {
    type: "button",
    "aria-label": label || (slow ? `Play ${word.w} slowly` : `Play ${word.w}`),
    title: slow ? "Play slowly" : "Play",
    html: icon(slow ? "slow" : "sound"),
    onclick: (e) => {
      e.stopPropagation();
      playWord(word, { slow, explicit: true });
    },
  });
}

export function wordRow(word) {
  const card = getCard(word.k);
  const row = h("button.word-row", { type: "button", onclick: () => openWord(word) });
  row.innerHTML = `
    <span class="wr-state">${sealHTML(card)}</span>
    <span class="wr-face">${faceHTML(word)}</span>
    <span class="wr-gloss">${esc(word.g)}</span>`;
  const btn = soundButton(word);
  btn.classList.add("wr-sound");
  row.append(btn);
  return row;
}

// ---------- sentences ----------
export function sentenceHTML(sent, { highlight = null, m = mode() } = {}) {
  return sent.tokens
    .map((tk) => {
      const hit = highlight && tk.t === highlight;
      const inner = tokenHTML(tk.t, tk.p, tk.p ? m : "hanzi");
      return hit ? `<mark>${inner}</mark>` : inner;
    })
    .join("");
}

export function sentenceBlock(sent, { highlight, showEnglish = true } = {}) {
  const text = sent.tokens.map((t) => t.t).join("");
  const el = h("div.sentence");
  const zh = h("p.sent-zh", { lang: "zh-CN", html: sentenceHTML(sent, { highlight }) });
  const play = h("button.icon-btn.sound", {
    type: "button",
    "aria-label": "Play sentence",
    html: icon("sound"),
    onclick: () => (canSpeakMandarin() ? speak(text) : toast("No Mandarin voice found on this device.")),
  });
  const en = h("p.sent-en", sent.en);
  if (!showEnglish) {
    en.classList.add("veiled");
    en.tabIndex = 0;
    en.setAttribute("role", "button");
    en.setAttribute("aria-label", "Show translation");
    const reveal = () => en.classList.remove("veiled");
    en.addEventListener("click", reveal);
    en.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && reveal());
  }
  el.append(h("div.sent-line", play, zh), en);
  // tap a word to look it up
  zh.addEventListener("click", (e) => {
    const tok = e.target.closest(".tok");
    if (!tok) return;
    const idx = [...zh.querySelectorAll(".tok")].indexOf(tok);
    const token = sent.tokens.filter((t) => t.t)[idx];
    const found = token && byHanzi.get(token.t);
    if (found && found.length) openWord(found[0]);
  });
  return el;
}

// ---------- word sheet ----------
let currentSheet = null;

export function openWord(word) {
  if (currentSheet) currentSheet.close();
  const content = h("div.word-sheet");
  currentSheet = openSheet(content, { label: `${word.w} ${word.p}`, onClose: () => (currentSheet = null) });
  renderWordSheet(content, word);
  if (state.settings.autoplay) playWord(word);
}

function renderWordSheet(root, word) {
  const card = getCard(word.k);
  const st = status(card);
  root.innerHTML = "";

  const head = h("div.ws-head");
  head.innerHTML = `
    <div class="tianzige ${[...word.w].length > 2 ? "long" : ""}" lang="zh-CN">${hanziHTML(word)}</div>
    <div class="ws-title">
      <div class="ws-py">${pinyinHTML(word)}</div>
      <div class="ws-tags">
        ${word.l ? `<span class="tag tag-level">${levelName(word)}</span>` : `<span class="tag">Top ${word.r}</span>`}
        ${word.r && word.l ? `<span class="tag">Top ${word.r}</span>` : ""}
        ${word.o ? `<span class="tag">${esc(posLabel(word.o))}</span>` : ""}
        <span class="tag">${freqLabel(word.q)}</span>
      </div>
    </div>`;
  const audio = h("div.ws-audio", soundButton(word), soundButton(word, { slow: true }));
  head.append(audio);
  root.append(head);

  root.append(h("p.ws-gloss", word.g));
  if (word.d.length > 1 || word.d[0] !== word.g) {
    const ol = h("ol.ws-defs");
    for (const d of word.d.slice(0, 8)) ol.append(h("li", d));
    root.append(ol);
  }
  const extras = [];
  if (word.c && word.c.length) {
    extras.push(
      h("div.ws-extra", {
        html: `<span class="label">Measure word</span> <span lang="zh-CN">${word.c.map(esc).join("、")}</span>`,
      }),
    );
  }
  if (word.x && word.x.length) {
    extras.push(
      h("div.ws-extra", {
        html: `<span class="label">More uses taught at</span> ${word.x.map((x) => `HSK ${esc(x)}`).join(", ")}`,
      }),
    );
  }
  if (extras.length) root.append(h("div.ws-extras", extras));

  // progress
  const prog = h("div.ws-progress");
  const label =
    st === "new"
      ? "Not studied yet"
      : st === "learning"
        ? "Learning now"
        : `${STATUS_TEXT[st]} · next review ${isDue(card) ? "today" : "in " + formatSpan(card.due - Date.now())}`;
  prog.append(h("span.ws-status", { html: `${sealHTML(card)} ${esc(label)}` }));
  const actions = h("div.ws-actions");
  if (st !== "known") {
    actions.append(
      h("button.btn.ghost.small", {
        type: "button",
        onclick: () => {
          putCard(word.k, markKnown(card || {}));
          toast(`Marked ${word.w} as known`);
          renderWordSheet(root, word);
        },
        text: "I know this",
      }),
    );
  }
  if (st !== "new") {
    actions.append(
      h("button.btn.ghost.small", {
        type: "button",
        onclick: () => {
          resetCard(word.k);
          toast(`${word.w} is new again`);
          renderWordSheet(root, word);
        },
        text: "Start over",
      }),
    );
  }
  prog.append(actions);
  root.append(prog);

  // characters, family, examples load lazily
  const charsBox = h("section.ws-section", h("h3", "Characters"), h("div.ws-chars", h("p.muted", "Loading…")));
  const famBox = h("section.ws-section");
  const exBox = h("section.ws-section");
  root.append(charsBox, famBox, exBox);

  loadChars()
    .then((chars) => {
      const list = charsBox.querySelector(".ws-chars");
      list.innerHTML = "";
      for (const ch of new Set(word.w)) {
        const info = chars[ch];
        if (!info) continue;
        list.append(charCard(ch, info));
      }
      if (!list.childElementCount) charsBox.remove();
    })
    .catch(() => charsBox.remove());

  const fam = family(word, 12);
  if (fam.length) {
    famBox.append(h("h3", "Words that share a character"));
    const wrap = h("div.chips");
    for (const { w } of fam) {
      wrap.append(
        h("button.chip", {
          type: "button",
          onclick: () => openWord(w),
          html: `<span class="hz" lang="zh-CN">${hanziHTML(w)}</span> <span class="chip-g">${esc(shortGloss(w.g))}</span>`,
        }),
      );
    }
    famBox.append(wrap);
  } else famBox.remove();

  if (word.e && word.e.length) {
    exBox.append(h("h3", "Examples"), h("p.muted", "Loading…"));
    loadSentences()
      .then((all) => {
        exBox.querySelector(".muted")?.remove();
        for (const i of word.e) {
          const s = all[i];
          if (s) exBox.append(sentenceBlock(s, { highlight: word.w }));
        }
        exBox.append(h("p.credit", { html: `Sentences from <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a> (CC BY 2.0 FR)` }));
      })
      .catch(() => exBox.remove());
  } else exBox.remove();
}

function shortGloss(g) {
  const first = g.split(";")[0];
  return first.length > 22 ? first.slice(0, 21) + "…" : first;
}

const ETY = { s: "Sound + meaning", i: "Meaning compound", p: "Picture" };

function charCard(ch, info) {
  const el = h("div.char-card");
  const tone = info.p && info.p[0] ? toneClass(info.p[0]) : "t5";
  let how = "";
  if (info.e) {
    if (info.e.t === "s" && info.e.m && info.e.f) {
      how = `<b>${esc(info.e.m)}</b> gives the meaning${info.e.h ? ` (${esc(info.e.h)})` : ""}, <b>${esc(info.e.f)}</b> gives the sound`;
    } else if (info.e.h) {
      how = esc(info.e.h);
    }
  }
  el.innerHTML = `
    <div class="char-big ${tone}" lang="zh-CN">${esc(ch)}</div>
    <div class="char-info">
      <div class="char-py">${(info.p || []).slice(0, 3).map(esc).join(" · ")}${info.l ? ` <span class="tag small">HSK ${esc(info.l === "7-9" ? "7–9" : info.l)} char</span>` : ""}</div>
      <div class="char-g">${esc((info.g || []).slice(0, 2).join(" / "))}</div>
      ${how ? `<div class="char-how"><span class="label">${ETY[info.e?.t] || "How it's built"}</span> ${how}</div>` : ""}
      ${info.k && info.k.length > 1 ? `<div class="char-parts" lang="zh-CN">${info.k.map(esc).join(" + ")}</div>` : ""}
    </div>`;
  return el;
}

function toneClass(py) {
  const n = py.normalize("NFD");
  if (n.includes("̄")) return "t1";
  if (n.includes("́")) return "t2";
  if (n.includes("̌")) return "t3";
  if (n.includes("̀")) return "t4";
  return "t5";
}

export function wordsLoadedCount() {
  return words.size;
}
