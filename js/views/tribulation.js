// 天劫 Heavenly Tribulation: the quiz that ends a realm.
import { deckWords, loadFile, words } from "../data.js";
import { FINAL_REALM, REALMS, finishTribulation, realm, tribulationOptions, tribulationReady, tribulationSetup } from "../game.js";
import { banner, lightning } from "../fx.js";
import { esc, hanziHTML, pinyinHTML } from "../pinyin.js";
import { REVIEW, RELEARNING } from "../srs.js";
import { canPlayWord } from "../speech.js";
import { state } from "../state.js";
import { h, icon, shuffle } from "../ui.js";
import { playWord } from "./common.js";
import { showUnlocks } from "./rewards.js";

let keyHandler = null;
function setKeys(fn) {
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener("keydown", fn);
}
export function stopTribulationKeys() {
  setKeys(null);
}

export async function renderTribulation(root, nav) {
  await loadFile("top").catch(() => {});
  root.innerHTML = "";
  const page = h("section.page.tribulation");
  root.append(page);
  const g = state.game;
  if (!tribulationReady()) {
    page.append(
      h("header.page-head", { html: `<p class="eyebrow">天劫 · Heavenly Tribulation</p><h1>The skies are calm</h1><p class="lede">Your cultivation isn't complete yet. Reach layer nine and comprehend the realm's scripture first.</p>` }),
      h("a.btn.primary", { href: "#cave", text: "Return to your cave" }),
    );
    return;
  }
  const r = realm(g.realm);
  const next = REALMS[g.realm + 1];
  const { bolts, hearts } = tribulationSetup();
  const pool = await tribulationPool(r);

  page.innerHTML = `
    <div class="storm" aria-hidden="true"><span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span></div>
    <header class="trib-head">
      <p class="eyebrow">天劫 · Heavenly Tribulation</p>
      <h1><span class="calli" lang="zh-CN">渡劫</span></h1>
      <p class="lede">${bolts} bolts of heavenly lightning will test what you have learned of ${esc(r.scripture)}. Each wrong answer is a strike against your Dao Heart. Survive them all to enter <b><span lang="zh-CN">${esc(next.zh)}</span> ${esc(next.name)}</b>.</p>
    </header>
    <div class="trib-stats">
      <div><span class="hearts">${heartIcons(hearts, hearts)}</span><span class="muted small">${hearts} Dao Hearts</span></div>
      <div><span class="bolts">${boltIcons(bolts, 0)}</span><span class="muted small">${bolts} bolts</span></div>
    </div>
    <p class="trib-seal"><span class="seal" lang="zh-CN" aria-hidden="true">封</span><span><b>Pinyin is sealed.</b> The lightning shows characters only, with no pinyin and no tone colours, so you must know the hanzi themselves. Each word's pinyin is revealed after you answer.</span></p>
    <p class="muted small center">Failing costs 30% of your gathered Qi. You can try again once you have gathered it back.</p>`;
  const begin = h("button.btn.tribulation-btn.big", { type: "button", html: `${icon("bolt")} <span>Begin the tribulation</span>` });
  const back = h("a.btn.ghost", { href: "#cave", text: "Not yet" });
  page.append(h("div.actions", back, begin));
  begin.focus({ preventScroll: true });
  begin.addEventListener("click", () => run(page, pool, bolts, hearts, nav));
}

async function tribulationPool(r) {
  // the realm's learned words first; fall back to the whole scripture
  let list = [];
  try {
    list = await deckWords(r.deck);
  } catch {
    list = [...words.values()];
  }
  const learned = list.filter((w) => {
    const c = state.cards[w.k];
    return c && (c.s === REVIEW || c.s === RELEARNING);
  });
  return learned.length >= 12 ? learned : list.slice(0, Math.max(40, learned.length));
}

/** Characters alone, in plain ink: no pinyin and no tone colours to lean on. */
function sealedHanzi(word, size = "") {
  return `<span class="hz ${size}" lang="zh-CN">${esc(word.w)}</span>`;
}

function heartIcons(left, total) {
  return Array.from({ length: total }, (_, i) => `<span class="heart ${i < left ? "" : "lost"}" aria-hidden="true">${icon("heart")}</span>`).join("");
}
function boltIcons(total, done) {
  return Array.from({ length: total }, (_, i) => `<span class="bolt-ic ${i < done ? "done" : ""}" aria-hidden="true">${icon("bolt")}</span>`).join("");
}

function run(page, pool, bolts, hearts, nav) {
  let left = hearts;
  let i = 0;
  const questions = shuffle(pool).slice(0, bolts);
  while (questions.length < bolts && pool.length) questions.push(pool[Math.floor(Math.random() * pool.length)]);

  function question() {
    if (left <= 0) return end(false);
    if (i >= questions.length) return end(true);
    window.scrollTo({ top: 0 });
    const word = questions[i];
    const kinds = ["meaning", "reverse"];
    if (canPlayWord(word)) kinds.push("listen");
    const kind = kinds[i % kinds.length];
    page.innerHTML = "";
    page.append(
      h("div.storm", { "aria-hidden": "true", html: `<span class="cloud c1"></span><span class="cloud c2"></span><span class="cloud c3"></span>` }),
      h("div.trib-bar", {
        html: `<span class="hearts" aria-label="${left} Dao Hearts left">${heartIcons(left, hearts)}</span><span class="bolts" aria-label="Bolt ${i + 1} of ${bolts}">${boltIcons(bolts, i)}</span>`,
      }),
    );
    const prompt = h("div.prompt.paper");
    const opts = tribulationOptions(pool, word, kind);
    const bolt = `第${i + 1}道天雷 · Bolt ${i + 1}`;
    if (kind === "meaning") {
      prompt.innerHTML = `<p class="eyebrow">${bolt}: what does this mean?</p><div class="prompt-face"><span class="face">${sealedHanzi(word, "xl")}</span></div>`;
    } else if (kind === "reverse") {
      prompt.innerHTML = `<p class="eyebrow">${bolt}: which characters mean…</p><p class="prompt-en">${esc(word.g)}</p>`;
    } else {
      prompt.innerHTML = `<p class="eyebrow">${bolt}: which characters did you hear?</p>`;
      const big = h("button.listen-btn", { type: "button", "aria-label": "Play again", html: icon("sound") });
      big.addEventListener("click", () => playWord(word, { explicit: true }));
      prompt.append(big);
      setTimeout(() => playWord(word), 200);
    }
    page.append(prompt);
    const grid = h("div.options");
    let done = false;
    const btns = opts.map((w, k) => {
      const b = h("button.option", {
        type: "button",
        html: `<kbd>${k + 1}</kbd>${kind === "meaning" ? `<span class="opt-en">${esc(w.g)}</span>` : sealedHanzi(w)}`,
      });
      b.addEventListener("click", () => answer(k));
      grid.append(b);
      return b;
    });
    page.append(grid);
    function answer(k) {
      if (done) return;
      done = true;
      const right = opts[k] === word;
      btns.forEach((b, n) => {
        b.disabled = true;
        if (opts[n] === word) b.classList.add("is-right");
        else if (n === k) b.classList.add("is-wrong");
      });
      // the seal lifts once the bolt has struck: add whatever the question didn't show
      const py = `<span class="py">${pinyinHTML(word)}</span>`;
      const hz = `<span class="hz" lang="zh-CN">${hanziHTML(word)}</span>`;
      const gloss = `<span class="tr-gloss">${esc(word.g)}</span>`;
      const reveal = kind === "meaning" ? py : kind === "reverse" ? hz + py : hz + py + gloss;
      prompt.append(h("div.trib-reveal", { html: reveal }));
      if (right) {
        prompt.classList.add("shielded");
      } else {
        left -= 1;
        lightning();
        page.querySelector(".hearts").innerHTML = heartIcons(left, hearts);
      }
      if (kind !== "listen" && state.settings.autoplay) playWord(word);
      i += 1;
      setTimeout(question, right ? 1200 : 2400);
    }
    setKeys((e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= opts.length) answer(n - 1);
    });
  }

  function end(success) {
    setKeys(null);
    const from = realm();
    const res = finishTribulation(success);
    page.innerHTML = "";
    const box = h("div.summary.trib-end", { class: `summary trib-end ${success ? "win" : "lose"}` });
    if (success) {
      const to = REALMS[res.realm];
      banner("飞升 Breakthrough!", `${to.zh} ${to.name}`, "gold");
      box.innerHTML = `<p class="eyebrow">渡劫成功 · Tribulation survived</p>
        <div class="ascend-glyph calli" lang="zh-CN">${esc(to.glyph)}</div>
        <h2><span lang="zh-CN">${esc(to.zh)}</span> ${esc(to.name)}</h2>
        <p>The lightning parts. Your dantian condenses into a new form.</p>
        <div class="stats"><div><b>+${res.stones}</b><span>spirit stones</span></div><div><b>${left}/${hearts}</b><span>Dao Hearts left</span></div></div>
        ${res.realm < FINAL_REALM ? `<p class="muted small">New words now come from <b>${esc(to.scripture)}</b>, the scripture of this realm.</p>` : `<p>You have mastered every scripture. You are an immortal of the written word.</p>`}`;
    } else {
      box.innerHTML = `<p class="eyebrow">渡劫失败 · The heavens prevailed</p>
        <div class="ascend-glyph calli fail" lang="zh-CN">劫</div>
        <h2>Your Dao Heart shattered</h2>
        <p>You lost 30% of your gathered Qi. Review the words of ${esc(from.scripture)}, gather your Qi again and return when you are ready.</p>`;
    }
    box.append(h("div.actions", h("a.btn.ghost", { href: "#treasury", text: "Treasury" }), h("a.btn.primary", { href: "#cave", text: "Return to your cave" })));
    page.append(box);
    if (success) setTimeout(() => page.isConnected && showUnlocks(), 600);
  }

  question();
}

