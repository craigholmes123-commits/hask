// Guide: how to learn faster, tones, pinyin, HSK 3.0 overview.
import { loadMeta } from "../data.js";
import { esc } from "../pinyin.js";
import { playRecording } from "../audio.js";
import { speak } from "../speech.js";
import { state } from "../state.js";
import { h, icon, toast, toneContour } from "../ui.js";

// Chao tone letters: pitch 1 (low) .. 5 (high)
const TONES = [
  { t: 1, name: "First tone", chao: "55", shape: "High and level, like holding a note.", hz: "妈", py: "mā", en: "mother" },
  { t: 2, name: "Second tone", chao: "35", shape: "Rising, like asking “huh?”", hz: "麻", py: "má", en: "hemp; numb" },
  { t: 3, name: "Third tone", chao: "214", shape: "Low dip. In speech it mostly stays low and creaky.", hz: "马", py: "mǎ", en: "horse" },
  { t: 4, name: "Fourth tone", chao: "51", shape: "Sharp fall, like a firm “No!”", hz: "骂", py: "mà", en: "to scold" },
  { t: 5, name: "Neutral tone", chao: "–", shape: "Short and light, pitch set by the syllable before.", hz: "吗", py: "ma", en: "(question particle)" },
];



const SOUNDS = [
  ["q", "qī 七", "ch in “cheese”, lips spread"],
  ["x", "xiè 谢", "between s and sh, tongue tip down"],
  ["j", "jiā 家", "j in “jeep”, tongue tip down"],
  ["zh · ch · sh", "zhè 这 · chī 吃 · shì 是", "like j, ch, sh with the tongue curled back"],
  ["r", "rè 热", "like the s in “measure”, tongue curled"],
  ["z", "zài 在", "ds in “kids”"],
  ["c", "cài 菜", "ts in “cats”, with a puff of air"],
  ["ü", "lǜ 绿 · nǚ 女", "say “ee” with rounded lips; written u after j, q, x, y (qù 去)"],
  ["e", "hē 喝", "uh, as in “duh”"],
  ["-i after z c s zh ch sh r", "sì 四 · shí 十", "a buzzing vowel, not “ee”"],
  ["ian", "tiān 天", "“yen”, not “ee-an”"],
  ["ui · iu", "duì 对 · liù 六", "“way” and “yo”: shortened ueí and iou"],
];

export async function renderGuide(root) {
  root.innerHTML = "";
  const meta = await loadMeta().catch(() => null);
  const cov = meta?.coverage || {};
  const page = h("article.page.guide");
  root.append(page);
  const daily = state.settings.dailyNew;
  const days = (n) => Math.ceil(n / daily);

  page.innerHTML = `
  <header class="page-head">
    <p class="eyebrow">Guide</p>
    <h1><span lang="zh-CN" class="h1-zh">指南</span> Learn faster</h1>
    <p class="lede">How the app works, the habits that speed learning up, and the sounds of Mandarin.</p>
  </header>

  <nav class="toc" aria-label="Guide sections">
    <a href="#guide" data-jump="g-loop">Daily loop</a>
    <a href="#guide" data-jump="g-habits">Habits</a>
    <a href="#guide" data-jump="g-tones">Tones</a>
    <a href="#guide" data-jump="g-pinyin">Pinyin</a>
    <a href="#guide" data-jump="g-switch">汉字 / pīnyīn</a>
    <a href="#guide" data-jump="g-hsk">HSK 3.0</a>
    <a href="#guide" data-jump="g-plan">Timeline</a>
  </nav>

  <section id="g-loop" class="card prose">
    <h2>The daily loop</h2>
    <p>Every session starts with the words that are due for review, then adds new words from the deck you're studying (${daily} a day right now).</p>
    <p>A new word is shown in full: characters, pinyin, sound and meaning. Say it out loud, then the app quizzes you on it a few cards later and again before the session ends.</p>
    <p>Each correct answer pushes the next review further out: roughly 10 minutes, 1 day, 3 days, a week, a month. A miss brings the word back sooner. Once a word's gap reaches three weeks it counts as known and gets the <span class="seal inline">熟</span> seal.</p>
  </section>

  <section id="g-habits" class="prose">
    <h2 class="section-title">Habits that make you learn faster</h2>
    <div class="habits">
      <div class="habit"><h3>Start with the most common words</h3><p>The Top 100 make up about <b>${Math.round(cov.top100 || 31)}%</b> of the words in everyday Chinese text and the Top 300 about <b>${Math.round(cov.top300 || 42)}%</b>. HSK 1–4 together (2,000 words) reach about <b>${Math.round(cov.hsk4 || 55)}%</b>. Within each HSK level the app teaches the most frequent words first.</p></div>
      <div class="habit"><h3>Little and often</h3><p>Fifteen to twenty minutes a day beats a long weekly session. Spaced reviews only work if you show up when they're due.</p></div>
      <div class="habit"><h3>Say every word out loud</h3><p>Play the audio, then copy it, tone melody included. Shadowing (speaking along with the audio) trains your mouth and your ear at once.</p></div>
      <div class="habit"><h3>Learn the tone with the word</h3><p>A word with the wrong tone is a different word. Learn the tone pattern as part of the word, and drill two-syllable pairs in the Tone trainer.</p></div>
      <div class="habit"><h3>Use the parts of each character</h3><p>About two in three HSK characters combine a meaning part and a sound part. 妈 mā is 女 “woman” + 马 mǎ for the sound. Every word page shows how its characters are built.</p></div>
      <div class="habit"><h3>Grow word families</h3><p>Know 学 and you're halfway to 学生 student, 学校 school, 同学 classmate. Word pages list the other words that share a character.</p></div>
      <div class="habit"><h3>Hide the pinyin early</h3><p>Pinyin is a crutch for reading. Once a word feels familiar, switch the top toggle to 汉字 so the pinyin only appears after you answer.</p></div>
      <div class="habit"><h3>Read real sentences</h3><p>The Sentences drill picks sentences built only from words you've studied, so you practise reading without a dictionary.</p></div>
      <div class="habit"><h3>Skip what you know</h3><p>Tap “I already know it” on a new word you've learned elsewhere. It goes straight to a monthly check instead of using up your daily slots.</p></div>
      <div class="habit"><h3>Welcome mistakes</h3><p>A missed review isn't a failure. Struggling to recall and then seeing the answer is what moves a word into long-term memory.</p></div>
    </div>
  </section>

  <section id="g-tones" class="card prose">
    <h2>Tones in two minutes</h2>
    <p>Mandarin has four tones plus a light neutral tone. The same syllable <i>ma</i> means five different things:</p>
    <div class="tone-table"></div>
    <h3>Tones that change in speech</h3>
    <ul class="rules">
      <li><b>Two 3rd tones in a row:</b> the first becomes a 2nd tone. 你好 is written nǐ hǎo but said <i>ní hǎo</i>.</li>
      <li><b>不 bù</b> becomes <b>bú</b> before a 4th tone: 不是 búshì, 不客气 bú kèqi.</li>
      <li><b>一 yī</b> becomes <b>yí</b> before a 4th tone (一个 yí ge, 一下 yíxià) and <b>yì</b> before the other tones (一起 yìqǐ). It stays yī when counting: 第一, 十一.</li>
    </ul>
    <p class="muted small">Like the HSK syllabus, the app writes the 一 and 不 changes but not the 3rd-tone change.</p>
    <p>Colours follow the tones everywhere in the app: <span class="t1">1st red</span>, <span class="t2">2nd orange</span>, <span class="t3">3rd green</span>, <span class="t4">4th blue</span>, <span class="t5">neutral grey</span>. Turn them off in Prefs if you'd rather not.</p>
  </section>

  <section id="g-pinyin" class="card prose">
    <h2>Pinyin that surprises English speakers</h2>
    <div class="table-wrap"><table class="sounds"><thead><tr><th>Spelling</th><th>Example</th><th>Sounds like</th></tr></thead><tbody></tbody></table></div>
  </section>

  <section id="g-switch" class="card prose">
    <h2>The 汉字 / pīnyīn switch</h2>
    <p>The switch at the top changes how Chinese is shown everywhere: word lists, questions and sentences. After you answer a question, both scripts always appear.</p>
    <ul class="rules">
      <li><b>汉字 + pīnyīn</b>: both together. Best for your first weeks.</li>
      <li><b>汉字</b>: characters only. Use it to test real reading once words feel familiar.</li>
      <li><b>pīnyīn</b>: pinyin only. Use it to focus on speaking and listening before tackling characters.</li>
    </ul>
  </section>

  <section id="g-hsk" class="card prose">
    <h2>HSK 3.0 at a glance</h2>
    <p>This app follows the <b>HSK examination syllabus</b> (《HSK考试大纲》) published by the Center for Language Education and Cooperation in November 2025 and used for HSK exams since July 2026. It has nine levels; levels 7, 8 and 9 share one advanced word list.</p>
    <div class="table-wrap"><table class="hsk-table"><thead><tr><th>Level</th><th class="num">New words</th><th class="num">Total</th><th class="num">New chars</th></tr></thead><tbody></tbody></table></div>
    <p class="muted small">Word lists, pinyin and parts of speech come straight from the syllabus PDF (revision of October 2026). English meanings are added from CC-CEDICT and HSKStory. Some words appear at more than one level with extra meanings; the app shows where.</p>
  </section>

  <section id="g-plan" class="card prose">
    <h2>A realistic timeline</h2>
    <p>At <b>${daily} new words a day</b> (change it in Prefs), with reviews taking about 10–15 minutes:</p>
    <div class="table-wrap"><table class="plan"><tbody>
      <tr><td>Top 100</td><td class="num">${days(100)} days</td></tr>
      <tr><td>HSK 1 · 300 words</td><td class="num">${days(300)} days</td></tr>
      <tr><td>HSK 2 · 500 words</td><td class="num">${days(500)} days</td></tr>
      <tr><td>HSK 3 · 1,000 words</td><td class="num">${days(1000)} days</td></tr>
      <tr><td>HSK 4 · 2,000 words</td><td class="num">${days(2000)} days</td></tr>
    </tbody></table></div>
    <p class="muted small">The Top lists overlap heavily with HSK 1–3, so studying both takes less time than the two added together.</p>
  </section>`;

  page.querySelectorAll("[data-jump]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      page.querySelector("#" + a.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );

  const tt = page.querySelector(".tone-table");
  for (const tone of TONES) {
    const row = h("div.tone-item");
    row.innerHTML = `<span class="ti-contour t${tone.t}">${toneContour(tone.t, { grid: true })}</span>
      <div class="ti-text"><b>${tone.name}</b> <span class="muted small">pitch ${tone.chao}</span><span>${esc(tone.shape)}</span></div>
      <div class="ti-word"><span class="hz t${tone.t}" lang="zh-CN">${tone.hz}</span><span class="py t${tone.t}">${tone.py}</span><span class="muted small">${esc(tone.en)}</span></div>`;
    const play = h("button.icon-btn.sound", { type: "button", "aria-label": `Play ${tone.py}`, html: icon("sound") });
    play.addEventListener("click", async () => {
      const ref = meta?.audio?.tones?.["ma" + tone.t];
      const ok = (ref && (await playRecording({ a: ref }))) || (await speak(tone.hz));
      if (!ok) toast("Couldn't play the sound. See Prefs → Audio.");
    });
    row.append(play);
    tt.append(row);
  }

  const sb = page.querySelector(".sounds tbody");
  for (const [sp, ex, like] of SOUNDS) {
    const tr = h("tr");
    tr.innerHTML = `<td><b>${esc(sp)}</b></td><td lang="zh-CN">${esc(ex)}</td><td>${esc(like)}</td>`;
    sb.append(tr);
  }

  const can = {
    1: "Greet people, give numbers, dates and times, handle simple shopping.",
    2: "Talk about daily routines, family, weather and directions.",
    3: "Get by in everyday life, at work, school and while travelling.",
    4: "Discuss a wide range of familiar topics in some detail.",
    5: "Follow films and the news, give a short talk.",
    6: "Read and discuss complex topics with ease.",
    "7-9": "Work and study in Chinese at an advanced, professional level.",
  };
  const hb = page.querySelector(".hsk-table tbody");
  if (meta) {
    for (const lv of ["1", "2", "3", "4", "5", "6", "7-9"]) {
      const tr = h("tr.lv");
      tr.innerHTML = `<td><a href="#deck-hsk${lv}">HSK ${lv === "7-9" ? "7–9" : lv}</a></td>
        <td class="num">${meta.counts[lv].toLocaleString()}</td>
        <td class="num">${meta.cumulative[lv].toLocaleString()}</td>
        <td class="num">${meta.char_counts?.[lv]?.toLocaleString() ?? ""}</td>`;
      const desc = h("tr.can", { html: `<td colspan="4">${can[lv]}</td>` });
      hb.append(tr, desc);
    }
  }
}
