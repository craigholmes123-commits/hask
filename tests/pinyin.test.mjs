import test from "node:test";
import assert from "node:assert/strict";
import { markSyllable, pinyinHTML, pinyinKey, rebuildPinyin, retone, stripTones, toneOf, toneVariants } from "../js/pinyin.js";

test("toneOf reads tone marks, including ü", () => {
  assert.equal(toneOf("mā"), 1);
  assert.equal(toneOf("má"), 2);
  assert.equal(toneOf("mǎ"), 3);
  assert.equal(toneOf("mà"), 4);
  assert.equal(toneOf("ma"), 5);
  assert.equal(toneOf("lǜ"), 4);
  assert.equal(toneOf("nǚ"), 3);
});

test("markSyllable follows the a / e / ou / last-vowel rule", () => {
  assert.equal(markSyllable("hao", 3), "hǎo");
  assert.equal(markSyllable("xie", 4), "xiè");
  assert.equal(markSyllable("dou", 1), "dōu");
  assert.equal(markSyllable("gui", 4), "guì");
  assert.equal(markSyllable("liu", 2), "liú");
  assert.equal(markSyllable("lv", 4), "lǜ");
  assert.equal(markSyllable("nve", 4), "nüè");
  assert.equal(markSyllable("ma", 5), "ma");
  assert.equal(retone("nǚ", 1), "nǖ");
});

test("search keys ignore tones, spaces, numbers and apostrophes", () => {
  assert.equal(pinyinKey("Nǐ hǎo"), "nihao");
  assert.equal(pinyinKey("ni3hao3"), "nihao");
  assert.equal(pinyinKey("nǚ'ér"), "nver");
  assert.equal(pinyinKey("nu:er"), "nver");
  assert.equal(stripTones("lǜsè"), "lvse");
});

test("tone variants keep the official spelling and never repeat the answer", () => {
  const word = { w: "不客气", p: "bú kèqi", y: "bú kè qi", t: "245" };
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const v = toneVariants(word, 3, rand);
  assert.equal(v.length, 3);
  for (const x of v) {
    assert.notEqual(x, "bú kèqi");
    assert.match(x, /^b\S+ k\S+q\S+$/);
  }
  assert.equal(rebuildPinyin({ p: "Hànyǔ", y: "Hàn yǔ" }, ["hān", "yú"]), "Hānyú");
});

test("pinyinHTML wraps each syllable in its tone class", () => {
  const html = pinyinHTML({ p: "yìdiǎnr", y: "yì diǎn r", t: "435" });
  assert.equal(html, '<span class="t4">yì</span><span class="t3">diǎn</span><span class="t5">r</span>');
});
