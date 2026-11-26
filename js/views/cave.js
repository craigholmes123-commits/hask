// 洞府 Cave abode: the cultivator's home screen.
import { deckById, loadFile } from "../data.js";
import {
  BEASTS, BEAST_STAGES, CN_NUM, FINAL_REALM, PILLS, REALMS, beastStage, bonuses, claimMission, comprehended,
  gate, hatch, missionBoard, nextStep, qiNeed, realm, titleOf, usePill,
} from "../game.js";
import { qiMotes } from "../fx.js";
import { esc } from "../pinyin.js";
import { setSetting, state, streak } from "../state.js";
import { h, icon, openSheet, plural, toast } from "../ui.js";
import { showUnlocks } from "./rewards.js";
import { planCounts } from "./study.js";
import { tipOfDay } from "./stats.js";

export async function renderCave(root, nav) {
  await loadFile("top").catch(() => {}); // Qi Refining comprehension is measured on the Top 100
  root.innerHTML = "";
  const g = state.game;
  const r = realm(g.realm);
  const page = h("section.page.cave");
  root.append(page);
  const t = titleOf();
  const st = streak();
  const done = g.realm >= FINAL_REALM;

  page.append(
    h("header.cave-head", {
      html: `<p class="eyebrow"><span lang="zh-CN">${esc(t.zh)}</span> · ${esc(t.name)}${st ? ` · ${icon("flame")} ${plural(st, "day")}` : ""}</p>
        <h1 class="realm-title"><span class="calli" lang="zh-CN">${esc(r.zh)}${done ? "" : "期"}</span></h1>
        <p class="realm-sub">${done ? "You have ascended" : `${esc(r.name)} · Layer ${g.stage} of 9 <span lang="zh-CN" class="muted">第${CN_NUM[g.stage]}层</span>`}</p>`,
    }),
  );

  // dantian ring
  const need = done ? 1 : qiNeed(g.realm, g.stage);
  const frac = done ? 1 : Math.min(1, g.qi / need);
  const C = 2 * Math.PI * 88;
  const dantian = h("div.dantian");
  dantian.innerHTML = `
    <canvas class="motes" aria-hidden="true"></canvas>
    <svg class="ring" viewBox="0 0 200 200" aria-hidden="true">
      <circle class="track" cx="100" cy="100" r="88"/>
      <circle class="fill" cx="100" cy="100" r="88" stroke-dasharray="${(C * frac).toFixed(1)} ${C.toFixed(1)}"/>
    </svg>
    <div class="core">
      <span class="core-glyph calli" lang="zh-CN">${esc(r.glyph)}</span>
      <span class="core-qi">${done ? "∞" : `${Math.min(need, Math.floor(g.qi)).toLocaleString()} / ${need.toLocaleString()}`}</span>
      <span class="core-label"><span lang="zh-CN">灵气</span> Qi</span>
    </div>`;
  dantian.setAttribute("role", "img");
  dantian.setAttribute("aria-label", done ? "Qi: complete" : `Qi ${Math.floor(g.qi)} of ${need}`);
  page.append(dantian);
  requestAnimationFrame(() => qiMotes(dantian.querySelector(".motes"), 0.3 + frac * 0.7));

  // comprehension gauge (the bottleneck)
  const step = nextStep();
  if (!done) {
    const have = comprehended(g.realm);
    const needW = gate(g.realm, g.stage);
    const gauge = h("div.gauge");
    const msg =
      step.kind === "tribulation"
        ? "Your foundation is complete. The heavens are gathering their lightning."
        : step.kind === "words"
          ? `Bottleneck: learn ${needW - have} more ${needW - have === 1 ? "word" : "words"} from ${r.scripture} to ${g.stage < 9 ? `reach layer ${g.stage + 1}` : "face your tribulation"}.`
          : `Gather ${(need - Math.floor(g.qi)).toLocaleString()} more Qi. Every correct answer feeds your dantian.`;
    gauge.innerHTML = `
      <div class="g-label"><span><span lang="zh-CN">悟性</span> Comprehension</span><span>${Math.min(have, needW)} / ${needW} words</span></div>
      <div class="bar"><i style="width:${Math.min(100, (have / needW) * 100).toFixed(1)}%"></i></div>
      <p class="g-hint ${step.kind === "words" ? "warn" : ""}">${esc(msg)}</p>`;
    page.append(gauge);
  }

  // actions
  const actions = h("div.cave-actions");
  if (step.kind === "tribulation") {
    actions.append(
      h("a.btn.tribulation-btn.big", { href: "#tribulation", html: `${icon("bolt")} <span><span lang="zh-CN">渡劫</span> Face the Heavenly Tribulation</span>` }),
    );
  }
  const cult = h("button.btn.primary.big.cultivate", {
    type: "button",
    html: `<span class="cult-main"><span lang="zh-CN">修炼</span> Cultivate</span><span class="cult-sub">…</span>`,
    onclick: () => nav("study"),
  });
  actions.append(cult);
  if (r.deck && state.settings.deck !== r.deck) {
    const d = deckById(state.settings.deck);
    actions.append(
      h("p.g-hint", {
        html: `You're reading <b>${esc(d.name)}</b>, but ${esc(r.name)} is comprehended through <b>${esc(r.scripture)}</b>. <button type="button" class="btn link" id="use-realm-deck">Switch</button>`,
      }),
    );
  }
  page.append(actions);
  actions.querySelector("#use-realm-deck")?.addEventListener("click", () => {
    setSetting("deck", r.deck);
    toast(`Now cultivating ${r.scripture}`);
    nav("cave");
  });

  // resources
  const b = bonuses(g);
  const effects = [];
  if (g.qiBoost) effects.push(`<span class="chip-fx"><span lang="zh-CN">聚气丹</span> Qi ×2 · ${g.qiBoost} answers</span>`);
  if (g.heartBonus) effects.push(`<span class="chip-fx"><span lang="zh-CN">护心丹</span> +${g.heartBonus} Dao Heart</span>`);
  page.append(
    h("div.res-row", {
      html: `<a class="res" href="#treasury"><span class="res-ic stone" aria-hidden="true"></span><b>${g.stones.toLocaleString()}</b><span><span lang="zh-CN">灵石</span> Spirit stones</span></a>
        <a class="res" href="#treasury"><b>+${Math.round(b.qi * 100)}%</b><span><span lang="zh-CN">修为加成</span> Qi bonus</span></a>
        <a class="res" href="#treasury"><b>${g.treasures.length}</b><span><span lang="zh-CN">法宝</span> Treasures</span></a>
        ${effects.length ? `<div class="fx-row">${effects.join("")}</div>` : ""}`,
    }),
  );

  // beast + missions
  const split = h("div.split");
  split.append(beastCard(() => renderCave(root, nav)), missionsCard(() => renderCave(root, nav), nav));
  page.append(split);

  const [tip, tipText] = tipOfDay();
  page.append(
    h("section.card.tip", {
      html: `<p class="eyebrow"><span lang="zh-CN">长老箴言</span> · The elder's advice</p><h3>${esc(tip)}</h3><p>${esc(tipText)}</p><a class="more" href="#guide">More teachings ${icon("right")}</a>`,
    }),
  );
  page.append(realmPath());

  // async: session counts
  try {
    const c = await planCounts();
    const sub = cult.querySelector(".cult-sub");
    sub.textContent = c.due || c.newToday ? `${plural(c.due, "review")} · ${plural(c.newToday, "new word")}` : "All caught up today. Cultivate again to review.";
  } catch {
    cult.querySelector(".cult-sub").textContent = "";
  }
  showUnlocks();
}

// ---------- spirit beast ----------
function beastGlyph(b) {
  const s = beastStage(b);
  if (s <= 0) return `<span class="beast-medal egg" lang="zh-CN">蛋</span>`;
  return `<span class="beast-medal s${s}" lang="zh-CN">${esc(BEASTS[b.kind].glyph)}</span>`;
}

function beastCard(refresh) {
  const b = state.game.beast;
  const card = h("button.card.beast-card", { type: "button" });
  if (!b) {
    card.innerHTML = `<span class="beast-medal none" lang="zh-CN">？</span><div><p class="eyebrow">灵兽 Spirit beast</p><b>No companion yet</b><span class="muted small">Finish a cultivation session and a spirit egg may appear in your cave.</span></div>`;
    card.disabled = true;
    return card;
  }
  const s = beastStage(b);
  const next = BEAST_STAGES[Math.min(BEAST_STAGES.length - 1, Math.max(1, s + 1))];
  const name = b.kind ? `${BEASTS[b.kind].zh} ${BEASTS[b.kind].name}` : "灵蛋 Spirit Egg";
  const stageName = `${BEAST_STAGES[Math.max(0, s)].zh} ${BEAST_STAGES[Math.max(0, s)].name}`;
  const ready = !b.kind && b.growth >= BEAST_STAGES[1].at;
  const pct = s >= 3 ? 100 : Math.min(100, (b.growth / next.at) * 100);
  card.innerHTML = `${beastGlyph(b)}<div><p class="eyebrow">灵兽 Spirit beast</p><b lang="zh-CN">${esc(name)}</b>
    <span class="muted small">${ready ? "The egg is cracking. Tap to hatch it!" : b.kind ? `${esc(stageName)} · ${esc(BEASTS[b.kind].perk)}` : "Grows each day you cultivate"}</span>
    <div class="bar small"><i style="width:${pct.toFixed(0)}%"></i></div></div>`;
  card.addEventListener("click", () => openBeast(refresh));
  return card;
}

function openBeast(refresh) {
  const b = state.game.beast;
  const box = h("div.beast-sheet");
  const s = beastStage(b);
  const sheet = openSheet(box, { label: "Spirit beast" });
  if (!b.kind && b.growth >= BEAST_STAGES[1].at) {
    box.append(h("p.eyebrow", "灵蛋破壳 · The egg is hatching"), h("h2", "Choose your companion"));
    const grid = h("div.beast-choices");
    for (const [kind, info] of Object.entries(BEASTS)) {
      const btn = h("button.beast-choice", {
        type: "button",
        html: `<span class="beast-medal s1" lang="zh-CN">${esc(info.glyph)}</span><b lang="zh-CN">${esc(info.zh)}</b><span>${esc(info.name)}</span><small>${esc(info.perk)}</small>`,
      });
      btn.addEventListener("click", () => {
        hatch(kind);
        toast(`${info.zh} ${info.name} has hatched!`);
        sheet.close();
        refresh();
      });
      grid.append(btn);
    }
    box.append(grid);
    return;
  }
  const s0 = Math.max(0, s);
  const next = BEAST_STAGES[s0 + 1];
  box.innerHTML = `<div class="beast-hero">${beastGlyph(b)}</div>
    <p class="eyebrow center">${esc(BEAST_STAGES[s0].zh)} · ${esc(BEAST_STAGES[s0].name)}</p>
    <h2 class="center" lang="zh-CN">${b.kind ? `${esc(BEASTS[b.kind].zh)} ${esc(BEASTS[b.kind].name)}` : "灵蛋 Spirit Egg"}</h2>
    <p class="center muted">${b.kind ? esc(BEASTS[b.kind].perk) : "It hatches at 30 growth. Each day you complete a session it grows by 10."}</p>
    <div class="g-label"><span>Growth</span><span>${b.growth}${next ? ` / ${next.at}` : ""}</span></div>
    <div class="bar"><i style="width:${next ? Math.min(100, (b.growth / next.at) * 100).toFixed(0) : 100}%"></i></div>
    <p class="muted small">Grows +10 on each day you cultivate and +2 for every mission you complete.${next ? ` Next: ${esc(next.zh)} ${esc(next.name)}.` : " It has reached its divine form."}</p>`;
  const pills = state.game.pills.beast || 0;
  const feed = h("button.btn.primary", { type: "button", text: pills ? `Feed a ${PILLS.beast.zh} (${pills} left)` : `Buy ${PILLS.beast.zh} in the Treasury` });
  feed.addEventListener("click", () => {
    if (!state.game.pills.beast) {
      sheet.close();
      location.hash = "treasury";
      return;
    }
    usePill("beast");
    toast("Your companion devours the pill. +25 growth");
    sheet.close();
    refresh();
  });
  box.append(feed);
}

// ---------- missions ----------
function missionsCard(refresh, nav) {
  const card = h("section.card.missions-card");
  const board = missionBoard();
  card.append(h("p.eyebrow", "宗门任务 · Today's missions"));
  for (const m of board.daily) card.append(missionRow(m, refresh));
  card.append(h("a.more", { href: "#sect", html: `Weekly missions and the sect ${icon("right")}` }));
  return card;
}

export function missionRow(m, refresh) {
  const row = h("div.mission", { class: `mission ${m.claimed ? "is-claimed" : m.have >= m.goal ? "is-ready" : ""}` });
  row.innerHTML = `<span class="m-zh" lang="zh-CN">${esc(m.zh)}</span>
    <div class="m-body"><span class="m-text">${esc(m.text)}</span>
      <div class="bar small"><i style="width:${((m.have / m.goal) * 100).toFixed(0)}%"></i></div></div>`;
  if (m.claimed) row.append(h("span.m-state", { html: `${icon("check")}` }));
  else if (m.have >= m.goal) {
    const btn = h("button.btn.small.claim", { type: "button", html: `+${m.reward} <span class="res-ic stone" aria-hidden="true"></span>` });
    btn.setAttribute("aria-label", `Claim ${m.reward} spirit stones`);
    btn.addEventListener("click", () => {
      const got = claimMission(m);
      toast(`Mission complete: +${got} spirit stones`);
      refresh();
    });
    row.append(btn);
  } else row.append(h("span.m-state.muted.small", `${m.have}/${m.goal}`));
  return row;
}

// ---------- path of realms ----------
function realmPath() {
  const g = state.game;
  const box = h("section.card.realm-path");
  box.append(h("h2.section-title", { html: `<span lang="zh-CN">修仙之路</span> The path to immortality` }));
  const ol = h("ol.realms");
  REALMS.forEach((r, i) => {
    const status = i < g.realm ? "done" : i === g.realm ? "current" : "locked";
    ol.append(
      h("li", {
        class: `realm-step is-${status}`,
        html: `<span class="realm-medal calli" lang="zh-CN">${esc(r.glyph)}</span>
          <span class="realm-text"><b><span lang="zh-CN">${esc(r.zh)}</span> ${esc(r.name)}</b>
          <span class="muted small">${r.deck ? `${esc(r.scripture)} · ${r.total.toLocaleString()} words` : "Master every scripture"}</span></span>
          <span class="realm-state">${status === "done" ? icon("check") : status === "current" ? `${g.stage}/9` : ""}</span>`,
      }),
    );
  });
  box.append(ol);
  return box;
}
