// Cultivation rules. Everything here is driven by study: Qi (灵气) comes only
// from answering, layers also need words actually learned (the bottleneck),
// and each realm ends with a Heavenly Tribulation quiz.
import { levelOfKey, words } from "./data.js";
import { REVIEW, RELEARNING, dayKey, isKnown } from "./srs.js";
import { bumpDay, defaultGame, saveGame, setSetting, state, streak, today } from "./state.js";

export const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** Realms in order; each is cultivated by studying one scripture (deck). */
export const REALMS = [
  { id: "qi", zh: "炼气", name: "Qi Refining", glyph: "气", deck: "top100", total: 100, scripture: "Top 100" },
  { id: "foundation", zh: "筑基", name: "Foundation Establishment", glyph: "基", deck: "hsk1", level: "1", total: 300, scripture: "HSK 1" },
  { id: "core", zh: "金丹", name: "Golden Core", glyph: "丹", deck: "hsk2", level: "2", total: 200, scripture: "HSK 2" },
  { id: "soul", zh: "元婴", name: "Nascent Soul", glyph: "婴", deck: "hsk3", level: "3", total: 500, scripture: "HSK 3" },
  { id: "spirit", zh: "化神", name: "Spirit Transformation", glyph: "神", deck: "hsk4", level: "4", total: 1000, scripture: "HSK 4" },
  { id: "void", zh: "炼虚", name: "Void Refining", glyph: "虚", deck: "hsk5", level: "5", total: 1600, scripture: "HSK 5" },
  { id: "unity", zh: "合体", name: "Body Integration", glyph: "合", deck: "hsk6", level: "6", total: 1800, scripture: "HSK 6" },
  { id: "mahayana", zh: "大乘", name: "Mahayana", glyph: "乘", deck: "hsk7-9", level: "7-9", total: 5600, scripture: "HSK 7–9" },
  { id: "immortal", zh: "仙人", name: "Immortal", glyph: "仙", deck: null, total: 0, scripture: "" },
];
export const FINAL_REALM = REALMS.length - 1;

/** Base Qi for each kind of study action, before bonuses. */
export const QI = { intro: 10, learn: 5, review: 6, wrong: 1, hard: 3, tone: 3, listen: 2, speed: 1, read: 2, demon: 3, session: 20, tribulation: 0 };

const COMPREHENSION_SHARE = 0.8; // share of a realm's words to learn before its tribulation

export function realm(i = state.game.realm) {
  return REALMS[Math.min(i, FINAL_REALM)];
}

export function realmLabel(g = state.game) {
  const r = realm(g.realm);
  if (g.realm >= FINAL_REALM) return { zh: "仙人", en: "Immortal" };
  return { zh: `${r.zh}期 · ${CN_NUM[g.stage]}层`, en: `${r.name} · Layer ${g.stage}` };
}

/** Words of a realm's scripture that have been learned (passed their learning steps). */
export function comprehended(i = state.game.realm) {
  const r = realm(i);
  if (!r.deck) return 0;
  let n = 0;
  if (r.level) {
    for (const [k, c] of Object.entries(state.cards)) {
      if ((c.s === REVIEW || c.s === RELEARNING) && levelOfKey(k) === r.level) n++;
    }
  } else {
    for (const w of words.values()) {
      if (w.r && w.r <= r.total) {
        const c = state.cards[w.k];
        if (c && (c.s === REVIEW || c.s === RELEARNING)) n++;
      }
    }
  }
  return n;
}

/** Words needed to complete layer `stage` of realm `i`. */
export function gate(i, stage) {
  return Math.ceil((realm(i).total * COMPREHENSION_SHARE * stage) / 9);
}

/** Qi needed to complete a layer. Scales with the realm's size and depth. */
export function qiNeed(i, stage) {
  const r = realm(i);
  const base = ((r.total * COMPREHENSION_SHARE) / 9) * 25 * (1 + 0.25 * i);
  return Math.max(60, Math.round(base * (1 + 0.05 * (stage - 1))));
}

// ---------- treasures, titles, beasts ----------
export const TREASURES = [
  { id: "brush", zh: "青玉笔", name: "Jade Brush", effect: "+5% Qi", how: "Learn your first 10 words", bonus: { qi: 0.05 }, test: (c) => c.learned >= 10 },
  { id: "bell", zh: "听雷铃", name: "Thunder-Listening Bell", effect: "+1 Dao Heart in tribulations", how: "Survive your first Heavenly Tribulation", bonus: { hearts: 1 }, test: (c) => c.tribs >= 1 },
  { id: "inkstone", zh: "墨龙砚", name: "Ink-Dragon Inkstone", effect: "+10% spirit stones", how: "Cultivate 7 days in a row", bonus: { stones: 0.1 }, test: (c) => c.streak >= 7 },
  { id: "taiji", zh: "太极盘", name: "Taiji Disc", effect: "+25% Qi from trials", how: "Get 50 tones right in the Tone Trial", bonus: { trial: 0.25 }, test: (c) => c.tones >= 50 },
  { id: "pearl", zh: "定心珠", name: "Heart-Calming Pearl", effect: "+1 Dao Heart in tribulations", how: "Complete 30 cultivation sessions", bonus: { hearts: 1 }, test: (c) => c.sessions >= 30 },
  { id: "bowl", zh: "聚宝盆", name: "Treasure Bowl", effect: "+10% spirit stones", how: "Complete 20 sect missions", bonus: { stones: 0.1 }, test: (c) => c.missions >= 20 },
  { id: "scroll", zh: "万字卷", name: "Scroll of Ten Thousand Words", effect: "+10% Qi", how: "Master 500 words", bonus: { qi: 0.1 }, test: (c) => c.known >= 500 },
  { id: "page", zh: "天书残页", name: "Page of the Heavenly Book", effect: "+15% Qi", how: "Reach the Golden Core realm", bonus: { qi: 0.15 }, test: (c) => c.realm >= 2 },
  { id: "mirror", zh: "照妖镜", name: "Demon-Revealing Mirror", effect: "+50% Qi against Inner Demons", how: "Defeat 50 Inner Demons", bonus: { demon: 0.5 }, test: (c) => c.demons >= 50 },
];

export const TITLES = [
  { id: "mortal", zh: "凡人", name: "Mortal", how: "Where every journey begins", test: () => true },
  { id: "seeker", zh: "求道者", name: "Seeker of the Dao", how: "Complete your first cultivation session", test: (c) => c.sessions >= 1 },
  { id: "hundred", zh: "百字书生", name: "Hundred-Word Scholar", how: "Master 100 words", test: (c) => c.known >= 100 },
  { id: "listener", zh: "闻音者", name: "Listener of Tones", how: "Get 100 tones right in the Tone Trial", test: (c) => c.tones >= 100 },
  { id: "steadfast", zh: "道心坚定", name: "Steadfast Dao Heart", how: "Cultivate 30 days in a row", test: (c) => c.streak >= 30 },
  { id: "demonslayer", zh: "斩魔者", name: "Demon Slayer", how: "Defeat 100 Inner Demons", test: (c) => c.demons >= 100 },
  { id: "thousand", zh: "千字真人", name: "Thousand-Word Sage", how: "Master 1,000 words", test: (c) => c.known >= 1000 },
  ...REALMS.slice(1).map((r, i) => ({
    id: "realm-" + r.id,
    zh: ["筑基修士", "金丹真人", "元婴老祖", "化神尊者", "炼虚大能", "合体天君", "大乘仙尊", "飞升仙人"][i],
    name: ["Foundation Cultivator", "Golden Core Adept", "Nascent Soul Patriarch", "Venerable of Spirit", "Void Sovereign", "Heavenly Lord", "Mahayana Sage", "Ascended Immortal"][i],
    how: `Reach ${r.name}`,
    test: (c) => c.realm >= i + 1,
  })),
];

export const BEASTS = {
  fox: { zh: "墨狐", glyph: "狐", name: "Ink Fox", perk: "+5% spirit stones per stage", bonus: (s) => ({ stones: 0.05 * s }) },
  crane: { zh: "云鹤", glyph: "鹤", name: "Cloud Crane", perk: "+5% Qi per stage", bonus: (s) => ({ qi: 0.05 * s }) },
  rabbit: { zh: "玉兔", glyph: "兔", name: "Jade Rabbit", perk: "+1 Dao Heart as a Spirit Beast, +2 when Divine", bonus: (s) => ({ hearts: Math.max(0, s - 1) }) },
  qilin: { zh: "麒麟", glyph: "麟", name: "Qilin", perk: "Pills 10% cheaper per stage", bonus: (s) => ({ discount: 0.1 * s }) },
};
export const BEAST_STAGES = [
  { zh: "灵蛋", name: "Spirit Egg", at: 0 },
  { zh: "幼兽", name: "Hatchling", at: 30 },
  { zh: "灵兽", name: "Spirit Beast", at: 150 },
  { zh: "神兽", name: "Divine Beast", at: 400 },
];

export function beastStage(b = state.game.beast) {
  if (!b) return -1;
  if (!b.kind) return 0;
  let s = 1;
  for (let i = 1; i < BEAST_STAGES.length; i++) if (b.growth >= BEAST_STAGES[i].at) s = i;
  return s;
}

/** All active bonuses: array level, treasures and the spirit beast. */
export function bonuses(g = state.game) {
  const b = { qi: 0.1 * g.arrayLv, stones: 0, hearts: 0, discount: 0, trial: 0, demon: 0 };
  for (const t of TREASURES) {
    if (!g.treasures.includes(t.id)) continue;
    for (const [k, v] of Object.entries(t.bonus)) b[k] += v;
  }
  if (g.beast && g.beast.kind) {
    const extra = BEASTS[g.beast.kind].bonus(beastStage(g.beast));
    for (const [k, v] of Object.entries(extra)) b[k] += v;
  }
  b.discount = Math.min(0.5, b.discount);
  return b;
}

// ---------- Qi ----------
/**
 * Award Qi for a study action. Returns what happened so the UI can celebrate:
 * {gained, layers: [new stage numbers], blocked: bool, stones: overflow stones, ready: tribulation ready}
 */
export function awardQi(base, { source = "study" } = {}) {
  const g = state.game;
  const out = { gained: 0, layers: [], blocked: false, stones: 0, ready: false };
  const b = bonuses(g);
  let mult = 1 + b.qi + (source === "trial" ? b.trial : 0) + (source === "demon" ? b.demon + b.trial : 0);
  if (g.qiBoost > 0) {
    mult *= 2;
    g.qiBoost -= 1;
  }
  out.gained = Math.max(1, Math.round(base * mult));
  g.stats.totalQi += out.gained;
  if (g.realm >= FINAL_REALM) {
    saveGame();
    return out;
  }
  g.qi += out.gained;
  const have = comprehended(g.realm);
  while (true) {
    const need = qiNeed(g.realm, g.stage);
    if (g.qi < need) break;
    if (g.stage < 9 && have >= gate(g.realm, g.stage)) {
      g.qi -= need;
      g.stage += 1;
      out.layers.push(g.stage);
      continue;
    }
    // full but blocked (bottleneck), or layer nine waiting for the tribulation:
    // excess Qi condenses into spirit stones (20 Qi -> 1 stone)
    const extra = g.qi - need;
    g.qi = need;
    g.overflow = (g.overflow || 0) + extra;
    const stones = Math.floor(g.overflow / 20);
    if (stones) {
      g.overflow -= stones * 20;
      g.stones += stones;
      out.stones = stones;
    }
    out.blocked = g.stage < 9 || have < gate(g.realm, 9);
    break;
  }
  out.ready = tribulationReady(g);
  saveGame();
  return out;
}

/** Earn spirit stones (bonuses apply). Returns the amount added. */
export function earnStones(n) {
  const g = state.game;
  const add = Math.round(n * (1 + bonuses(g).stones));
  g.stones += add;
  saveGame();
  return add;
}

export function tribulationReady(g = state.game) {
  return g.realm < FINAL_REALM && g.stage === 9 && g.qi >= qiNeed(g.realm, 9) && comprehended(g.realm) >= gate(g.realm, 9);
}

/** What's needed next, for the cave screen. */
export function nextStep(g = state.game) {
  if (g.realm >= FINAL_REALM) return { kind: "done" };
  if (tribulationReady(g)) return { kind: "tribulation" };
  const have = comprehended(g.realm);
  const needWords = gate(g.realm, g.stage);
  const needQi = qiNeed(g.realm, g.stage);
  return { kind: have < needWords ? "words" : "qi", have, needWords, qi: g.qi, needQi };
}

// ---------- tribulation ----------
export function tribulationSetup(g = state.game) {
  return { bolts: 6 + Math.min(3, g.realm), hearts: 3 + bonuses(g).hearts + g.heartBonus };
}

export function finishTribulation(success) {
  const g = state.game;
  const from = g.realm;
  g.heartBonus = 0;
  let stones = 0;
  if (success) {
    g.realm = Math.min(FINAL_REALM, g.realm + 1);
    g.stage = 1;
    g.qi = 0;
    g.stats.tribs += 1;
    stones = earnStones(50 * (from + 1));
    const next = realm(g.realm);
    if (next.deck) setSetting("deck", next.deck);
  } else {
    g.qi = Math.floor(g.qi * 0.7);
    g.stats.tribFails += 1;
  }
  saveGame();
  return { stones, realm: g.realm };
}

// ---------- shop ----------
export const PILLS = {
  qi: { zh: "聚气丹", name: "Qi-Gathering Pill", price: 40, effect: "Double Qi for your next 25 answers" },
  heart: { zh: "护心丹", name: "Heart-Guarding Pill", price: 60, effect: "+1 Dao Heart in your next tribulation" },
  beast: { zh: "灵兽丹", name: "Beast-Nurturing Pill", price: 30, effect: "+25 growth for your spirit beast" },
};

export function pillPrice(id, g = state.game) {
  return Math.round(PILLS[id].price * (1 - bonuses(g).discount));
}

export function buyPill(id) {
  const g = state.game;
  const price = pillPrice(id);
  if (g.stones < price) return false;
  g.stones -= price;
  g.pills[id] = (g.pills[id] || 0) + 1;
  saveGame();
  return true;
}

export function usePill(id) {
  const g = state.game;
  if (!g.pills[id]) return false;
  if (id === "beast" && !g.beast) return false;
  g.pills[id] -= 1;
  if (id === "qi") g.qiBoost += 25;
  else if (id === "heart") g.heartBonus += 1;
  else if (id === "beast") g.beast.growth += 25;
  saveGame();
  return true;
}

export const ARRAY_MAX = 10;
export function arrayCost(lv = state.game.arrayLv) {
  return Math.round(40 * Math.pow(1.5, lv));
}
export function upgradeArray() {
  const g = state.game;
  if (g.arrayLv >= ARRAY_MAX || g.stones < arrayCost()) return false;
  g.stones -= arrayCost();
  g.arrayLv += 1;
  saveGame();
  return true;
}

// ---------- spirit beast ----------
export function hatch(kind) {
  const b = state.game.beast;
  if (!b || b.kind || b.growth < BEAST_STAGES[1].at || !BEASTS[kind]) return false;
  b.kind = kind;
  saveGame();
  return true;
}

// ---------- missions ----------
export const DAILY = [
  { id: "session", zh: "修炼", text: "Complete a cultivation session", goal: 1, stat: (d) => d.s || 0, reward: 10 },
  { id: "learn5", zh: "悟经", text: "Comprehend 5 new words", goal: 5, stat: (d) => d.n || 0, reward: 15 },
  { id: "correct30", zh: "答问", text: "Answer 30 questions correctly", goal: 30, stat: (d) => d.c || 0, reward: 15 },
  { id: "answer50", zh: "勤修", text: "Answer 50 questions", goal: 50, stat: (d) => d.r || 0, reward: 15 },
  { id: "tones10", zh: "音律", text: "Tone Trial: get 10 tones right", goal: 10, stat: (d) => d.tc || 0, reward: 20 },
  { id: "listen8", zh: "听风", text: "Listening Trial: 8 right", goal: 8, stat: (d) => d.lc || 0, reward: 15 },
  { id: "read5", zh: "读经", text: "Reading Trial: read 5 sentences", goal: 5, stat: (d) => d.rd || 0, reward: 15 },
  { id: "speed12", zh: "疾风", text: "Speed Trial: score 12 or more", goal: 12, stat: (d) => d.sp || 0, reward: 20 },
  { id: "demons5", zh: "斩魔", text: "Defeat 5 Inner Demons", goal: 5, stat: (d) => d.dm || 0, reward: 20 },
];
export const WEEKLY = [
  { id: "days5", zh: "恒心", text: "Cultivate on 5 days this week", goal: 5, stat: (days) => days.filter((d) => (d.s || 0) > 0).length, reward: 80 },
  { id: "learn40", zh: "博览", text: "Comprehend 40 new words this week", goal: 40, stat: (days) => days.reduce((a, d) => a + (d.n || 0), 0), reward: 80 },
  { id: "correct200", zh: "精进", text: "200 correct answers this week", goal: 200, stat: (days) => days.reduce((a, d) => a + (d.c || 0), 0), reward: 100 },
  { id: "trials", zh: "试炼", text: "Score in 3 different trials this week", goal: 3, stat: (days) => ["tc", "lc", "rd", "sp", "dm"].filter((f) => days.some((d) => (d[f] || 0) > 0)).length, reward: 80 },
];

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** Today's three missions: always a session, plus two picked by the date. */
export function dailyMissions(dk = dayKey()) {
  const rest = DAILY.slice(1);
  const a = hash(dk) % rest.length;
  let b = hash(dk + "b") % (rest.length - 1);
  if (b >= a) b += 1;
  return [DAILY[0], rest[a], rest[b]];
}

/** Monday of the study week, as a day key. */
export function weekStart(ts = Date.now()) {
  const d = new Date(ts - 4 * 3600e3);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(12);
  return dayKey(d.getTime() + 4 * 3600e3);
}

export function weeklyMissions(wk = weekStart()) {
  const a = hash(wk) % WEEKLY.length;
  const b = (a + 1 + (hash(wk + "w") % (WEEKLY.length - 1))) % WEEKLY.length;
  return [WEEKLY[a], WEEKLY[b]];
}

function weekDays(wk) {
  const out = [];
  const [y, m, d] = wk.split("-").map(Number);
  for (let i = 0; i < 7; i++) {
    const x = new Date(y, m - 1, d + i, 12);
    const k = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    out.push(state.days[k] || {});
  }
  return out;
}

/** Missions with progress and claim state for the sect board. */
export function missionBoard() {
  const dk = dayKey();
  const wk = weekStart();
  const d = state.days[dk] || {};
  const days = weekDays(wk);
  const claimedD = state.game.claimed[dk] || [];
  const claimedW = state.game.claimed["w" + wk] || [];
  return {
    daily: dailyMissions(dk).map((m) => ({ ...m, scope: dk, have: Math.min(m.goal, m.stat(d)), claimed: claimedD.includes(m.id) })),
    weekly: weeklyMissions(wk).map((m) => ({ ...m, scope: "w" + wk, have: Math.min(m.goal, m.stat(days)), claimed: claimedW.includes(m.id) })),
  };
}

export function claimMission(m) {
  const g = state.game;
  if (m.claimed || m.have < m.goal) return 0;
  const list = g.claimed[m.scope] || [];
  if (list.includes(m.id)) return 0;
  g.claimed[m.scope] = [...list, m.id];
  // forget claims older than three weeks
  const cutoff = dayKey(Date.now() - 21 * 86400e3);
  for (const k of Object.keys(g.claimed)) if (k.replace(/^w/, "") < cutoff) delete g.claimed[k];
  g.stats.missions += 1;
  if (g.beast) g.beast.growth += 2;
  return earnStones(m.reward);
}

export function claimableCount() {
  const b = missionBoard();
  return [...b.daily, ...b.weekly].filter((m) => !m.claimed && m.have >= m.goal).length;
}

// ---------- sessions ----------
/** Rewards when a cultivation session ends. */
export function finishSession({ correct = 0, answers = 0 } = {}) {
  const g = state.game;
  const first = !(today().s > 0);
  bumpDay("s");
  g.stats.sessions += 1;
  let stones = 5 + Math.floor(correct / 4);
  if (first) stones += Math.min(30, 5 + 2 * streak());
  const out = { first, egg: false, fed: false };
  if (!g.beast) {
    g.beast = { kind: null, growth: 0, fed: null };
    out.egg = true;
  }
  if (g.beast.fed !== dayKey()) {
    g.beast.fed = dayKey();
    g.beast.growth += 10;
    out.fed = true;
  }
  out.qi = answers ? awardQi(QI.session) : null;
  out.stones = earnStones(stones);
  return out;
}

// ---------- unlocks ----------
function unlockContext(g = state.game) {
  let known = 0;
  let learned = 0;
  for (const c of Object.values(state.cards)) {
    if (c.s === REVIEW || c.s === RELEARNING) learned++;
    if (isKnown(c)) known++;
  }
  return { known, learned, streak: streak(), tones: g.stats.tones, sessions: g.stats.sessions, missions: g.stats.missions, tribs: g.stats.tribs, demons: g.stats.demons, realm: g.realm };
}

/** Grant any treasures and titles whose conditions are now met. Returns the new ones. */
export function checkUnlocks() {
  const g = state.game;
  const ctx = unlockContext(g);
  const fresh = [];
  for (const t of TREASURES) {
    if (!g.treasures.includes(t.id) && t.test(ctx)) {
      g.treasures.push(t.id);
      fresh.push({ type: "treasure", item: t });
    }
  }
  for (const t of TITLES) {
    if (!g.titles.includes(t.id) && t.test(ctx)) {
      g.titles.push(t.id);
      fresh.push({ type: "title", item: t });
    }
  }
  if (fresh.length) saveGame();
  return fresh;
}

export function titleOf(g = state.game) {
  return TITLES.find((t) => t.id === g.title) || TITLES[0];
}

export function setTitle(id) {
  const g = state.game;
  if (!g.titles.includes(id)) return;
  g.title = id;
  saveGame();
}

export function addStat(key, n = 1) {
  state.game.stats[key] = (state.game.stats[key] || 0) + n;
  saveGame();
}

export { defaultGame };
