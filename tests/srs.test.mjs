import test from "node:test";
import assert from "node:assert/strict";
import {
  AGAIN, DAY, EASY, GOOD, HARD, KNOWN_IVL, LEARNING, MIN, NEW, RELEARNING, REVIEW,
  dayKey, endOfDay, grade, introduce, isDue, isKnown, markKnown, newCard, previewLabel, status,
} from "../js/srs.js";

const T0 = new Date(2026, 10, 25, 12, 0, 0).getTime();
const half = () => 0.5;

test("a new word goes through two learning steps before graduating", () => {
  let c = introduce(newCard(), T0);
  assert.equal(c.s, LEARNING);
  assert.equal(c.step, 0);
  c = grade(c, GOOD, T0, half);
  assert.equal(c.s, LEARNING);
  assert.equal(c.step, 1);
  assert.equal(c.due, T0 + 10 * MIN);
  c = grade(c, GOOD, T0 + 10 * MIN, half);
  assert.equal(c.s, REVIEW);
  assert.equal(c.ivl, 1);
  assert.equal(c.due, T0 + 10 * MIN + DAY);
});

test("AGAIN during learning restarts the steps", () => {
  let c = grade(introduce(newCard(), T0), GOOD, T0, half);
  c = grade(c, AGAIN, T0 + MIN, half);
  assert.equal(c.s, LEARNING);
  assert.equal(c.step, 0);
  assert.equal(c.due, T0 + 2 * MIN);
});

test("EASY on a new word graduates straight to a 4-day interval", () => {
  const c = grade(introduce(newCard(), T0), EASY, T0, half);
  assert.equal(c.s, REVIEW);
  assert.equal(c.ivl, 4);
});

test("review intervals grow with GOOD and ease changes with HARD/EASY", () => {
  let c = { ...newCard(), s: REVIEW, ivl: 10, ease: 2.5, due: T0 };
  const good = grade(c, GOOD, T0, half);
  assert.equal(Math.round(good.ivl), 25);
  const hard = grade(c, HARD, T0, half);
  assert.ok(hard.ivl >= 11 && hard.ivl < 13);
  assert.ok(hard.ease < 2.5);
  const easy = grade(c, EASY, T0, half);
  assert.ok(easy.ivl > good.ivl);
  assert.ok(easy.ease > 2.5);
});

test("a lapse halves the interval and goes to relearning", () => {
  const c = grade({ ...newCard(), s: REVIEW, ivl: 20, ease: 2.5, due: T0 }, AGAIN, T0, half);
  assert.equal(c.s, RELEARNING);
  assert.equal(c.lapses, 1);
  assert.equal(c.ivl, 10);
  assert.equal(c.due, T0 + 10 * MIN);
  const back = grade(c, GOOD, T0 + 10 * MIN, half);
  assert.equal(back.s, REVIEW);
  assert.equal(back.due, T0 + 10 * MIN + 10 * DAY);
});

test("ease never drops below 1.3", () => {
  let c = { ...newCard(), s: REVIEW, ivl: 5, ease: 1.35, due: T0 };
  for (let i = 0; i < 5; i++) c = grade({ ...c, s: REVIEW }, AGAIN, T0, half);
  assert.equal(c.ease, 1.3);
});

test("markKnown schedules a check in about a month", () => {
  const c = markKnown(newCard(), T0);
  assert.equal(c.s, REVIEW);
  assert.equal(c.due, T0 + 30 * DAY);
  assert.ok(isKnown(c));
  assert.equal(status(c), "known");
});

test("isDue: learning within 20 min, reviews by end of study day", () => {
  assert.equal(isDue(null, T0), false);
  assert.equal(isDue({ s: NEW }, T0), false);
  assert.equal(isDue({ s: LEARNING, due: T0 + 15 * MIN }, T0), true);
  assert.equal(isDue({ s: LEARNING, due: T0 + 30 * MIN }, T0), false);
  assert.equal(isDue({ s: REVIEW, due: T0 + 6 * 60 * MIN }, T0), true); // later today
  assert.equal(isDue({ s: REVIEW, due: endOfDay(T0) + MIN }, T0), false);
});

test("study day rolls over at 4 am", () => {
  const lateNight = new Date(2026, 10, 26, 2, 30).getTime();
  assert.equal(dayKey(lateNight), "2026-11-25");
  assert.equal(dayKey(new Date(2026, 10, 26, 4, 1).getTime()), "2026-11-26");
  assert.equal(endOfDay(T0), new Date(2026, 10, 26, 4, 0).getTime());
});

test("status labels", () => {
  assert.equal(status(undefined), "new");
  assert.equal(status({ s: LEARNING }), "learning");
  assert.equal(status({ s: REVIEW, ivl: 3 }), "review");
  assert.equal(status({ s: REVIEW, ivl: KNOWN_IVL }), "known");
});

test("button previews read naturally", () => {
  const c = introduce(newCard(), T0);
  assert.equal(previewLabel(c, AGAIN, T0), "1 min");
  assert.equal(previewLabel(c, GOOD, T0), "10 min");
  assert.equal(previewLabel(c, EASY, T0), "4 d");
});
