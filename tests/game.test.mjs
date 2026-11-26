import test from "node:test";
import assert from "node:assert/strict";
import { words } from "../js/data.js";
import {
  QI, awardQi, bonuses, buyPill, checkUnlocks, claimMission, comprehended, dailyMissions, finishSession,
  finishTale, finishTribulation, gate, missionBoard, nextStep, qiNeed, tribulationOptions, tribulationReady, tribulationSetup, upgradeArray,
  usePill, weekStart, weeklyMissions,
} from "../js/game.js";
import { defaultGame, state } from "../js/state.js";

function fresh() {
  state.game = defaultGame();
  state.cards = {};
  state.days = {};
  state.settings.deck = "top100";
  words.clear();
  for (let r = 1; r <= 100; r++) words.set("t" + r, { k: "t" + r, w: "字" + r, r });
}
function learnTop(n) {
  for (let r = 1; r <= n; r++) state.cards["t" + r] = { s: 2, ivl: 3, due: Date.now() + 86400e3, u: Date.now() };
}

test("layer requirements scale with the realm", () => {
  assert.equal(gate(0, 1), 9);
  assert.equal(gate(0, 9), 80);
  assert.equal(gate(1, 9), 240);
  assert.equal(qiNeed(0, 1), 222);
  assert.ok(qiNeed(1, 1) > qiNeed(0, 1));
  assert.ok(qiNeed(0, 9) > qiNeed(0, 1));
});

test("Qi alone can't break a bottleneck; the excess condenses into spirit stones", () => {
  fresh();
  const r = awardQi(300);
  assert.equal(state.game.stage, 1);
  assert.equal(state.game.qi, qiNeed(0, 1));
  assert.equal(r.blocked, true);
  assert.equal(r.stones, 3); // 78 excess Qi -> 3 stones (20 each)
  assert.equal(nextStep().kind, "words");
});

test("learning words opens the next layer", () => {
  fresh();
  learnTop(9);
  assert.equal(comprehended(0), 9);
  const r = awardQi(qiNeed(0, 1));
  assert.deepEqual(r.layers, [2]);
  assert.equal(state.game.stage, 2);
  assert.equal(state.game.qi, 0);
});

test("layer nine plus 80% of the scripture makes the tribulation ready", () => {
  fresh();
  learnTop(80);
  state.game.stage = 9;
  awardQi(qiNeed(0, 9) + 5);
  assert.ok(tribulationReady());
  assert.equal(nextStep().kind, "tribulation");
  assert.deepEqual(tribulationSetup(), { bolts: 6, hearts: 3 });
  const res = finishTribulation(true);
  assert.equal(state.game.realm, 1);
  assert.equal(state.game.stage, 1);
  assert.equal(res.stones, 50);
  assert.equal(state.settings.deck, "hsk1");
});

test("a failed tribulation costs 30% of the gathered Qi", () => {
  fresh();
  learnTop(80);
  state.game.stage = 9;
  state.game.qi = 1000;
  finishTribulation(false);
  assert.equal(state.game.qi, 700);
  assert.equal(state.game.realm, 0);
  assert.equal(state.game.stats.tribFails, 1);
});

test("pills and the array multiply Qi", () => {
  fresh();
  learnTop(80);
  assert.equal(buyPill("qi"), false);
  state.game.stones = 200;
  assert.equal(buyPill("qi"), true);
  assert.equal(state.game.stones, 160);
  assert.equal(usePill("qi"), true);
  assert.equal(state.game.qiBoost, 25);
  assert.equal(awardQi(10).gained, 20);
  assert.equal(state.game.qiBoost, 24);
  assert.equal(upgradeArray(), true);
  assert.equal(state.game.arrayLv, 1);
  assert.equal(state.game.stones, 120);
  assert.equal(awardQi(10).gained, 22); // 10 * 1.1 * 2
  assert.ok(Math.abs(bonuses().qi - 0.1) < 1e-9);
});

test("sessions pay stones, feed the beast and grant an egg", () => {
  fresh();
  const out = finishSession({ correct: 12, answers: 15 });
  assert.equal(out.egg, true);
  assert.equal(out.fed, true);
  assert.ok(out.stones >= 5 + 3);
  assert.equal(state.game.beast.growth, 10);
  const again = finishSession({ correct: 0, answers: 1 });
  assert.equal(again.fed, false); // fed once per day
  assert.equal(state.days[Object.keys(state.days)[0]].s, 2);
});

test("missions: a session mission every day, claimable once", () => {
  fresh();
  const d = dailyMissions("2026-11-26");
  assert.equal(d[0].id, "session");
  assert.equal(new Set(d.map((m) => m.id)).size, 3);
  assert.deepEqual(dailyMissions("2026-11-26").map((m) => m.id), d.map((m) => m.id));
  assert.equal(weekStart(new Date(2026, 10, 26, 12).getTime()), "2026-11-23");
  assert.equal(weeklyMissions("2026-11-23").length, 2);
  finishSession({ correct: 4, answers: 4 });
  const m = missionBoard().daily[0];
  assert.equal(m.have, 1);
  const before = state.game.stones;
  assert.ok(claimMission(m) > 0);
  assert.ok(state.game.stones > before);
  assert.equal(claimMission(missionBoard().daily[0]), 0);
});

test("treasures and titles unlock from study milestones", () => {
  fresh();
  learnTop(10);
  state.game.stats.sessions = 1;
  const got = checkUnlocks().map((x) => x.item.id);
  assert.ok(got.includes("brush"));
  assert.ok(got.includes("seeker"));
  assert.equal(checkUnlocks().length, 0);
  assert.ok(bonuses().qi >= 0.05);
  assert.equal(QI.intro, 10);
});

test("tribulation choices: no shared characters, meanings or exact homophones", () => {
  const W = (k, w, p, g) => ({ k, w, p, g });
  const target = W("a", "是", "shì", "to be");
  const pool = [
    target,
    W("b", "事", "shì", "matter; thing"), // same sound: impossible to tell apart by ear
    W("c", "是", "shì", "yes"), // same characters (a homograph)
    W("d", "在", "zài", "to be; at"), // same first meaning
    W("e", "十", "shí", "ten"), // different tone: fair for listening
    W("f", "四", "sì", "four"),
    W("g", "大", "dà", "big"),
    W("h", "学生", "xuésheng", "student"),
    W("i", "老师", "lǎoshī", "teacher"),
  ];
  for (let n = 0; n < 50; n++) {
    let seed = n + 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const kind of ["meaning", "reverse", "listen"]) {
      const opts = tribulationOptions(pool, target, kind, rand);
      assert.equal(opts.length, 4);
      assert.equal(opts.filter((w) => w === target).length, 1);
      const others = opts.filter((w) => w !== target);
      assert.ok(others.every((w) => w.w !== "是" && w.k !== "d"), kind);
      assert.equal(new Set(opts.map((w) => w.w)).size, 4);
      if (kind === "listen") assert.ok(others.every((w) => w.k !== "b"));
      // character choices match the answer's length when they can
      if (kind !== "meaning") assert.ok(others.every((w) => [...w.w].length === 1), kind);
    }
  }
});

test("tales pay Qi once per tale per day, and stones the first time", () => {
  fresh();
  const a = finishTale("boy-1", { sentences: 10, correct: 3 });
  assert.deepEqual(a, { first: true, qiBase: 10 * QI.tale + 3 * QI.taleAnswer, stones: 10 });
  const b = finishTale("boy-1", { sentences: 10, correct: 3 });
  assert.equal(b.qiBase, 0);
  assert.equal(b.stones, 0);
  assert.equal(state.game.tales["boy-1"].n, 2);
  assert.equal(state.game.stats.tales, 2);
  for (let i = 0; i < 3; i++) finishTale("t" + i, { sentences: 5 });
  assert.ok(checkUnlocks().some((u) => u.item.id === "teahouse"));
});
