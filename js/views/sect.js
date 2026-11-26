// 宗门 Sect: missions, the cultivator's record, and the way to the elders and the sect hall.
import { missionBoard, realmLabel, titleOf } from "../game.js";
import { esc } from "../pinyin.js";
import { status } from "../srs.js";
import { state, streak } from "../state.js";
import { h, icon } from "../ui.js";
import { missionRow } from "./cave.js";

export function renderSect(root) {
  root.innerHTML = "";
  const g = state.game;
  const page = h("section.page.sect");
  root.append(page);
  const rerender = () => renderSect(root);
  page.append(
    h("header.page-head", {
      html: `<p class="eyebrow">宗门 · Sect</p><h1><span class="calli h1-zh" lang="zh-CN">墨韵宗</span> Ink Rhyme Sect</h1>
      <p class="lede">The sect hands out missions every day and every week. Finish them for spirit stones; your spirit beast grows a little with each one.</p>`,
    }),
  );

  const board = missionBoard();
  const daily = h("section.card.missions-card");
  daily.append(h("h2", { html: `<span lang="zh-CN">日常任务</span> Daily missions` }));
  for (const m of board.daily) daily.append(missionRow(m, rerender));
  const weekly = h("section.card.missions-card");
  weekly.append(h("h2", { html: `<span lang="zh-CN">周常任务</span> Weekly missions` }), h("p.muted.small", "A new pair every Monday."));
  for (const m of board.weekly) weekly.append(missionRow(m, rerender));
  page.append(h("div.split", daily, weekly));

  // cultivator's record
  let learned = 0;
  let known = 0;
  for (const c of Object.values(state.cards)) {
    const st = status(c);
    if (st === "review" || st === "known") learned++;
    if (st === "known") known++;
  }
  const t = titleOf();
  const rec = h("section.card.record");
  rec.innerHTML = `<h2><span lang="zh-CN">修为录</span> Cultivator's record</h2>
    <dl class="record-grid">
      <div><dt>Realm</dt><dd lang="zh-CN">${esc(realmLabel().zh)}</dd></div>
      <div><dt>Title</dt><dd><span lang="zh-CN">${esc(t.zh)}</span> ${esc(t.name)}</dd></div>
      <div><dt>Words comprehended</dt><dd>${learned.toLocaleString()}</dd></div>
      <div><dt>Words mastered</dt><dd>${known.toLocaleString()}</dd></div>
      <div><dt>Qi gathered</dt><dd>${Math.round(g.stats.totalQi).toLocaleString()}</dd></div>
      <div><dt>Sessions</dt><dd>${g.stats.sessions.toLocaleString()}</dd></div>
      <div><dt>Tribulations survived</dt><dd>${g.stats.tribs}${g.stats.tribFails ? ` <span class="muted small">(${g.stats.tribFails} failed)</span>` : ""}</dd></div>
      <div><dt>Inner Demons defeated</dt><dd>${g.stats.demons.toLocaleString()}</dd></div>
      <div><dt>Streak</dt><dd>${streak()} days</dd></div>
    </dl>`;
  page.append(rec);

  const links = h("div.sect-links");
  links.append(
    h("a.sect-link", { href: "#guide", html: `<span class="medal title" lang="zh-CN">训</span><span><b><span lang="zh-CN">长老训诫</span> Elder's Teachings</b><span class="muted small">How cultivation works, habits that speed learning, tones and pinyin</span></span>${icon("right", "chev")}` }),
    h("a.sect-link", { href: "#prefs", html: `<span class="medal title" lang="zh-CN">殿</span><span><b><span lang="zh-CN">宗门大殿</span> Sect Hall</b><span class="muted small">Settings: display, study pace, audio, backups</span></span>${icon("right", "chev")}` }),
  );
  page.append(links);
}

