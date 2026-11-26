import test from "node:test";
import assert from "node:assert/strict";
import { coverage, fit, isOpen, pickIPlusOne, recommend } from "../js/ci.js";

const tok = (t, k, p = "x") => ({ t, p: k ? [...t].map(() => p).join(" ") : "", k });
const story = (id, level, sentences, extra = {}) => ({ id, level, words: extra.words || [], sentences: sentences.map((tokens) => ({ tokens })), series: extra.series || null });

test("coverage counts words, not punctuation, numbers or names", () => {
  const s = story("a", 0, [[tok("小林", "g:小林"), tok("是", "h1"), tok("三", "#"), tok("个", "h2"), tok("人", "h3"), tok("。", "")]], {
    words: [{ w: "小林", name: true }],
  });
  const c = coverage(s, { h1: { s: 2 }, h2: { s: 0 } });
  assert.equal(c.total, 3);
  assert.equal(c.known, 1); // a stored card that's still new doesn't count
  assert.deepEqual(c.unknown.map((u) => u.t), ["个", "人"]);
  assert.equal(fit(0.97).id, "easy");
  assert.equal(fit(0.9).id, "right");
  assert.equal(fit(0.75).id, "stretch");
  assert.equal(fit(0.2).id, "hard");
});

test("the storyteller suggests the best-understood open tale, and serials go in order", () => {
  const one = story("one", 0, [[tok("我", "h1"), tok("你", "h2")]], { series: { zh: "S", part: 1 } });
  const two = story("two", 0, [[tok("我", "h1"), tok("他", "h3")]], { series: { zh: "S", part: 2 } });
  const easy = story("easy", 1, [[tok("我", "h1"), tok("他", "h3")]]);
  const hard = story("hard", 3, [[tok("我", "h1"), tok("他", "h3")]]);
  const all = [one, two, easy, hard];
  const cards = { h1: { s: 2 }, h3: { s: 2 } };
  const none = () => false;
  assert.equal(isOpen(two, all, none), false);
  // realm 0: only level-0 tales qualify, and part two waits for part one
  assert.equal(recommend(all, cards, 0, none).id, "one");
  // realm 1 with part one read: "two" and "easy" are both fully known; the lower level wins
  const read = (id) => id === "one";
  assert.equal(recommend(all, cards, 1, read).id, "two");
  assert.equal(recommend(all, cards, 3, (id) => id !== "hard").id, "hard");
  assert.equal(recommend(all, cards, 3, () => true), null);
});

test("chatter picks sentences with exactly one unknown word", () => {
  const S = (words, h = 1) => ({ h, tokens: words.map((t) => ({ t, p: "x" })).concat([{ t: "。", p: "" }]) });
  const sentences = [S(["我", "喜欢", "茶"]), S(["我", "喜欢", "咖啡", "和", "茶"]), S(["我", "是", "三", "个", "人"]), S(["你", "好"]), S(["我", "喜欢", "他"])];
  const known = new Set(["我", "喜欢", "茶", "他", "是", "个", "人"]);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const picked = pickIPlusOne(sentences, known, { limit: 5, rand });
  const withWord = picked.filter((p) => p.word);
  assert.deepEqual(withWord.map((p) => p.word), []); // 咖啡 and 和 are both new: that sentence is i+2
  // few i+1 sentences: topped up with fully known ones (numbers don't count as words)
  assert.ok(picked.length >= 3 && picked.every((p) => p.word === null));
  const known2 = new Set([...known, "和"]);
  const p2 = pickIPlusOne(sentences, known2, { limit: 5, rand });
  assert.deepEqual(p2.filter((p) => p.word).map((p) => p.word), ["咖啡"]);
});
