// Integrity checks for the generated data files (run after tools/build_data.py).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), "utf8"));
const LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"];
const NEW_PER_LEVEL = { 1: 300, 2: 200, 3: 500, 4: 1000, 5: 1600, 6: 1800, "7-9": 5600 };

const all = LEVELS.flatMap((l) => load("hsk" + l).words);

test("every official HSK 3.0 entry 1–11,000 is present exactly once", () => {
  assert.equal(all.length, 11000);
  const ids = new Set(all.map((w) => w.i));
  assert.equal(ids.size, 11000);
  for (let i = 1; i <= 11000; i++) assert.ok(ids.has(i), `missing ${i}`);
});

test("each level has the official number of new words", () => {
  for (const l of LEVELS) assert.equal(load("hsk" + l).words.length, NEW_PER_LEVEL[l], `HSK ${l}`);
  const meta = load("meta");
  assert.deepEqual(meta.cumulative, { 1: 300, 2: 500, 3: 1000, 4: 2000, 5: 3600, 6: 5400, "7-9": 11000 });
});

test("every word has pinyin aligned to its characters, tones and a gloss", () => {
  for (const w of all) {
    const chars = [...w.w];
    const syl = w.y.split(" ");
    assert.equal(syl.length, chars.length, `${w.w} ${w.y}`);
    assert.equal(w.t.length, chars.length, `${w.w} tones`);
    assert.match(w.t, /^[1-5]+$/);
    assert.ok(w.g && w.g.length > 0, `${w.w} gloss`);
    assert.ok(Array.isArray(w.d) && w.d.length > 0, `${w.w} defs`);
  }
});

test("Top 300 is ranked 1..300 and starts with the core words", () => {
  const top = load("top").words;
  assert.equal(top.length, 300);
  assert.deepEqual(top.map((w) => w.r), Array.from({ length: 300 }, (_, i) => i + 1));
  const first10 = top.slice(0, 10).map((w) => w.w);
  for (const core of ["的", "我", "是", "了", "你", "不"]) assert.ok(first10.includes(core), core);
  for (const w of top) {
    assert.ok(w.k, "key");
    assert.equal(w.y.split(" ").length, [...w.w].length, w.w);
  }
});

test("example sentence references are valid", () => {
  const n = load("sentences").s.length;
  for (const w of all) for (const i of w.e || []) assert.ok(i >= 0 && i < n, `${w.w} -> ${i}`);
});

test("audio references point inside their packed files, and beginners are covered", () => {
  const size = new Map();
  const check = (ref, label) => {
    const [file, off, len] = ref;
    if (!size.has(file)) size.set(file, statSync(new URL(`../audio/${file}.mp3`, import.meta.url)).size);
    assert.ok(off >= 0 && len > 0 && off + len <= size.get(file), `${label} -> ${ref}`);
  };
  const top = load("top").words;
  for (const w of [...all, ...top]) {
    if (w.a) check(w.a, w.w);
    for (const r of w.as || []) check(r, w.w);
  }
  const beginner = [...load("hsk1").words, ...load("hsk2").words, ...top];
  const silent = beginner.filter((w) => !w.a && !w.as).map((w) => w.w);
  assert.ok(silent.length <= 10, `beginner words without audio: ${silent.join(" ")}`);
  for (const ref of Object.values(load("meta").audio.tones)) check(ref, "tone guide");
});

test("spot checks against the 2025 syllabus", () => {
  const find = (w, p) => all.find((x) => x.w === w && (!p || x.p === p));
  assert.equal(find("爱").i, 1);
  assert.equal(find("爱").l, "1");
  assert.equal(find("不客气").p, "bú kèqi");
  assert.equal(find("任性").p, "rènxìng"); // corrected in the Oct 2026 PDF revision
  assert.equal(find("还", "huán").l, "3");
  assert.match(find("穿").g, /wear/);
  assert.match(find("号", "hào").g, /day|number/);
});
