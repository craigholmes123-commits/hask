// 宝库 Treasury: alchemy (pills), the cave's spirit-gathering array, treasures and titles.
import { ARRAY_MAX, PILLS, TITLES, TREASURES, arrayCost, bonuses, buyPill, pillPrice, setTitle, upgradeArray, usePill } from "../game.js";
import { esc } from "../pinyin.js";
import { state } from "../state.js";
import { h, icon, toast } from "../ui.js";
import { showUnlocks } from "./rewards.js";

export function renderTreasury(root) {
  root.innerHTML = "";
  const g = state.game;
  const page = h("section.page.treasury");
  root.append(page);
  const rerender = () => renderTreasury(root);
  page.append(
    h("header.page-head", {
      html: `<p class="eyebrow">宝库 · Treasury</p><h1><span class="calli h1-zh" lang="zh-CN">宝库</span> Treasury</h1>
      <p class="purse"><span class="res-ic stone" aria-hidden="true"></span><b>${g.stones.toLocaleString()}</b> <span lang="zh-CN">灵石</span> spirit stones</p>
      <p class="lede">Spirit stones come from sessions, missions, tribulations and Qi that overflows a bottleneck.</p>`,
    }),
  );

  // alchemy
  const alchemy = h("section.card.shop");
  alchemy.append(h("h2", { html: `<span lang="zh-CN">丹房</span> Alchemy room` }));
  const grid = h("div.shop-grid");
  for (const [id, p] of Object.entries(PILLS)) {
    const price = pillPrice(id);
    const have = g.pills[id] || 0;
    const card = h("div.shop-item");
    card.innerHTML = `<span class="pill-medal p-${id}" lang="zh-CN">${esc(p.zh[0])}</span>
      <div class="si-text"><b><span lang="zh-CN">${esc(p.zh)}</span> ${esc(p.name)}</b><span class="muted small">${esc(p.effect)}</span>
      <span class="small">Owned: ${have}</span></div>`;
    const buy = h("button.btn.small", { type: "button", html: `Buy · ${price} <span class="res-ic stone" aria-hidden="true"></span>`, disabled: g.stones < price });
    buy.addEventListener("click", () => {
      if (buyPill(id)) toast(`Bought ${p.zh} ${p.name}`);
      rerender();
    });
    const use = h("button.btn.small.ghost", { type: "button", text: "Use", disabled: !have || (id === "beast" && !g.beast) });
    use.addEventListener("click", () => {
      if (usePill(id)) toast(id === "qi" ? "Qi ×2 for your next 25 answers" : id === "heart" ? "+1 Dao Heart for your next tribulation" : "Your spirit beast grows stronger");
      rerender();
    });
    card.append(h("div.si-actions", buy, use));
    grid.append(card);
  }
  alchemy.append(grid);
  page.append(alchemy);

  // array
  const arr = h("section.card.array");
  const maxed = g.arrayLv >= ARRAY_MAX;
  arr.innerHTML = `<h2><span lang="zh-CN">聚灵阵</span> Spirit-Gathering Array</h2>
    <p class="muted">Carved into your cave floor, it draws more Qi from every answer: +10% per level.</p>
    <div class="array-lv">${Array.from({ length: ARRAY_MAX }, (_, i) => `<span class="${i < g.arrayLv ? "on" : ""}"></span>`).join("")}</div>
    <p>Level <b>${g.arrayLv}</b> of ${ARRAY_MAX} · total Qi bonus <b>+${Math.round(bonuses(g).qi * 100)}%</b> (with treasures and beast)</p>`;
  const up = h("button.btn.primary", { type: "button", html: maxed ? "Fully carved" : `Carve level ${g.arrayLv + 1} · ${arrayCost()} <span class="res-ic stone" aria-hidden="true"></span>`, disabled: maxed || g.stones < arrayCost() });
  up.addEventListener("click", () => {
    if (upgradeArray()) toast(`The array glows brighter: level ${state.game.arrayLv}`);
    rerender();
  });
  arr.append(up);
  page.append(arr);

  // treasures
  const tre = h("section.card");
  tre.append(h("h2", { html: `<span lang="zh-CN">法宝</span> Treasures` }), h("p.muted.small", "Earned through study. Their powers are always active."));
  const tg = h("div.treasure-grid");
  for (const t of TREASURES) {
    const owned = g.treasures.includes(t.id);
    tg.append(
      h("div", {
        class: `treasure ${owned ? "owned" : "locked"}`,
        html: `<span class="medal treasure" lang="zh-CN">${esc(t.zh[0])}</span><b><span lang="zh-CN">${esc(t.zh)}</span> ${esc(t.name)}</b>
          <span class="small">${owned ? esc(t.effect) : `${icon("info")} ${esc(t.how)}`}</span>`,
      }),
    );
  }
  tre.append(tg);
  page.append(tre);

  // titles
  const tit = h("section.card");
  tit.append(h("h2", { html: `<span lang="zh-CN">道号</span> Titles` }), h("p.muted.small", "Choose the title shown in your cave."));
  const list = h("div.title-list");
  for (const t of TITLES) {
    const owned = g.titles.includes(t.id);
    const row = h("button.title-row", { type: "button", disabled: !owned, "aria-pressed": String(g.title === t.id) });
    row.innerHTML = `<span class="medal title" lang="zh-CN">${esc(t.zh.slice(0, 2))}</span><span><b><span lang="zh-CN">${esc(t.zh)}</span> ${esc(t.name)}</b><span class="muted small">${esc(owned ? (g.title === t.id ? "Shown in your cave" : "Tap to use") : t.how)}</span></span>`;
    row.addEventListener("click", () => {
      setTitle(t.id);
      rerender();
    });
    list.append(row);
  }
  tit.append(list);
  page.append(tit);
  showUnlocks();
}
