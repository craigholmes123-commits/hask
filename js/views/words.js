// Words: deck list, search, and the word list of one deck.
import { DECKS, LEVELS, deckById, deckWords, isFileLoaded, loadAllLevels, loadFile, loadMeta, search } from "../data.js";
import { esc } from "../pinyin.js";
import { status } from "../srs.js";
import { getCard, setSetting, state } from "../state.js";
import { h, icon, toast } from "../ui.js";
import { openWord, wordRow } from "./common.js";
import { deckStats, statsBar } from "./today.js";

let lastQuery = "";

export async function renderWords(root, nav) {
  root.innerHTML = "";
  const page = h("section.page.words");
  root.append(page);
  page.append(
    h("header.page-head", {
      html: `<p class="eyebrow">HSK 3.0 · 2025 syllabus</p><h1><span lang="zh-CN" class="h1-zh">词汇</span> Words</h1>`,
    }),
  );

  const searchBox = h("div.search");
  const input = h("input#word-search", {
    type: "search",
    placeholder: "Search 你好, nihao, ni3hao3 or hello",
    autocomplete: "off",
    spellcheck: false,
    "aria-label": "Search words",
    value: lastQuery,
  });
  searchBox.innerHTML = icon("search");
  searchBox.append(input);
  page.append(searchBox);
  const results = h("div.results");
  page.append(results);
  const decksBox = h("div.decks");
  page.append(decksBox);

  let timer = null;
  const run = async () => {
    lastQuery = input.value;
    const q = input.value.trim();
    if (!q) {
      results.innerHTML = "";
      decksBox.hidden = false;
      return;
    }
    decksBox.hidden = true;
    if (!LEVELS.slice(0, 4).every((l) => isFileLoaded("hsk" + l))) {
      results.innerHTML = '<p class="muted pad">Loading word lists…</p>';
      await Promise.all(["top", "hsk1", "hsk2", "hsk3", "hsk4"].map((f) => loadFile(f).catch(() => {})));
      if (input.value.trim() !== q) return;
    }
    const all = LEVELS.every((l) => isFileLoaded("hsk" + l));
    const found = search(q, 80);
    results.innerHTML = "";
    const list = h("div.word-list");
    for (const w of found) list.append(wordRow(w));
    if (!found.length) results.append(h("p.muted.pad", `No match for “${q}” in the loaded levels.`));
    results.append(list);
    if (!all) {
      const more = h("button.btn.ghost.small", {
        type: "button",
        text: "Search all levels (HSK 1–9)",
        onclick: async () => {
          more.disabled = true;
          more.textContent = "Loading all 11,000 words…";
          try {
            await loadAllLevels();
            run();
          } catch {
            toast("Couldn't load every level. Check your connection.");
            more.disabled = false;
          }
        },
      });
      results.append(h("div.pad", more));
    }
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  if (lastQuery) run();

  const meta = await loadMeta().catch(() => null);
  const groups = [
    ["Most common words", "Ranked by how often they occur in conversation (film and TV subtitles) and everyday writing.", DECKS.filter((d) => d.kind === "top")],
    [
      "HSK 3.0 levels",
      `From the official HSK syllabus (中外语言交流合作中心, Nov 2025), used for exams since July 2026. ${meta ? meta.cumulative["6"].toLocaleString() + " words by HSK 6, " + meta.cumulative["7-9"].toLocaleString() + " by HSK 9." : ""}`,
      DECKS.filter((d) => d.kind === "hsk"),
    ],
  ];
  for (const [title, sub, decks] of groups) {
    const sec = h("section.deck-group");
    sec.innerHTML = `<h2 class="section-title">${esc(title)}</h2><p class="muted small">${esc(sub)}</p>`;
    const grid = h("div.deck-grid");
    for (const d of decks) {
      const cardEl = h("a.deck-card", { href: "#deck-" + d.id });
      const count = d.kind === "top" ? d.n : meta ? meta.counts[d.level] : "";
      cardEl.innerHTML = `
        <span class="deck-hz" lang="zh-CN">${esc(d.hz)}</span>
        <span class="dc-name">${esc(d.name)} ${state.settings.deck === d.id ? '<span class="tag tag-active">Studying</span>' : ""}</span>
        <span class="dc-sub">${count ? count.toLocaleString() + (d.kind === "hsk" && d.level !== "1" ? " new words" : " words") : ""}</span>
        <span class="dc-bar"></span>`;
      grid.append(cardEl);
      deckStats(d.id)
        .then((s) => {
          cardEl.querySelector(".dc-bar").innerHTML = statsBar(s) + `<span class="dc-pct">${s.started ? s.pct + "%" : ""}</span>`;
        })
        .catch(() => {});
    }
    sec.append(grid);
    decksBox.append(sec);
  }
}

const FILTERS = [
  ["all", "All"],
  ["new", "New"],
  ["learning", "In progress"],
  ["known", "Known"],
];

export async function renderDeck(root, deckId, nav) {
  const deck = deckById(deckId);
  root.innerHTML = "";
  const page = h("section.page.deck");
  root.append(page);
  const meta = await loadMeta().catch(() => null);
  const cov = meta?.coverage?.[deck.id];
  page.append(
    h("a.back", { href: "#words", html: `${icon("left")} Words` }),
    h("header.page-head", {
      html: `<p class="eyebrow">${deck.kind === "top" ? "Most common words" : "HSK 3.0 · official syllabus"}</p>
        <h1><span lang="zh-CN" class="h1-zh">${esc(deck.hz)}</span> ${esc(deck.name)}</h1>
        <p class="lede">${esc(deck.blurb)}.${cov ? ` ${deck.kind === "top" ? "These words" : "All words up to this level"} make up about <b>${Math.round(cov)}%</b> of the words in everyday Chinese text.` : ""}</p>`,
    }),
  );
  const studyBtn = h("button.btn", { type: "button" });
  const setStudy = () => {
    const active = state.settings.deck === deck.id;
    studyBtn.className = `btn ${active ? "ghost" : "primary"}`;
    studyBtn.innerHTML = active ? `${icon("check")} Studying this deck` : `Study this deck`;
  };
  setStudy();
  studyBtn.addEventListener("click", () => {
    setSetting("deck", deck.id);
    setStudy();
    toast(`New words will now come from ${deck.name}`);
  });
  const statBox = h("div.card.deck-progress");
  page.append(h("div.row.wrap", studyBtn, h("a.btn.ghost", { href: "#study", text: "Start a session" })), statBox);

  const controls = h("div.list-controls");
  const chips = h("div.seg", { role: "tablist", "aria-label": "Filter words" });
  let filter = "all";
  for (const [id, label] of FILTERS) {
    const b = h("button", { type: "button", role: "tab", "aria-selected": String(id === filter), text: label });
    b.addEventListener("click", () => {
      filter = id;
      chips.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      draw();
    });
    chips.append(b);
  }
  const sort = h("select#deck-sort", { "aria-label": "Sort order" });
  sort.innerHTML = `<option value="frequency">Most common first</option><option value="official">Syllabus order</option>`;
  sort.value = deck.kind === "top" ? "frequency" : state.settings.order;
  if (deck.kind === "top") sort.innerHTML = `<option value="frequency">By rank</option>`;
  controls.append(chips, sort);
  page.append(controls);
  const listBox = h("div.word-list");
  page.append(listBox);
  const moreBox = h("div.pad.center");
  page.append(moreBox);

  let list = [];
  try {
    list = await deckWords(deck.id, sort.value);
  } catch (e) {
    listBox.append(h("p.muted.pad", `Couldn't load ${deck.name}: ${e.message}`));
    return;
  }
  sort.addEventListener("change", async () => {
    list = await deckWords(deck.id, sort.value);
    draw();
  });

  const s = await deckStats(deck.id);
  statBox.innerHTML = `${statsBar(s)}<div class="legend">
      <span><i class="sw sw-known"></i>${s.known} known</span>
      <span><i class="sw sw-review"></i>${s.review + s.learning} in progress</span>
      <span><i class="sw sw-new"></i>${s.new} new</span>
      <span class="legend-total">${s.total.toLocaleString()} words</span></div>`;

  let shown = 0;
  function draw() {
    listBox.innerHTML = "";
    shown = 0;
    more();
  }
  function filtered() {
    if (filter === "all") return list;
    return list.filter((w) => {
      const st = status(getCard(w.k));
      if (filter === "learning") return st === "learning" || st === "review";
      return st === filter;
    });
  }
  function more() {
    const items = filtered();
    const next = items.slice(shown, shown + 150);
    for (const w of next) {
      const row = wordRow(w);
      if (deck.kind === "top") {
        row.prepend(h("span.rank", String(w.r)));
        row.classList.add("has-rank");
      }
      listBox.append(row);
    }
    shown += next.length;
    moreBox.innerHTML = "";
    if (!items.length) listBox.append(h("p.muted.pad", "No words here yet."));
    if (shown < items.length) {
      moreBox.append(h("button.btn.ghost", { type: "button", text: `Show more (${(items.length - shown).toLocaleString()} left)`, onclick: more }));
    }
  }
  draw();
}

export { openWord, loadFile };
