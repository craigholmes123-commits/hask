// Pinyin and tone helpers. Pure functions (string in, string out).

const MARKS = { "\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4 };
const MARK_FOR = { 1: "\u0304", 2: "\u0301", 3: "\u030c", 4: "\u0300" };
export const TONE_NAMES = { 1: "1st · high flat", 2: "2nd · rising", 3: "3rd · dip", 4: "4th · falling", 5: "neutral" };
export const TONE_SIGNS = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "·" };

/** Tone number (1-5) of one syllable written with tone marks. */
export function toneOf(syllable) {
  for (const ch of syllable.normalize("NFD")) {
    if (MARKS[ch]) return MARKS[ch];
  }
  return 5;
}

/** Remove tone marks, keep ü as "v" for matching ("lǚ" -> "lv"). */
export function stripTones(s) {
  return s
    .normalize("NFD")
    .replace(/u\u0308/g, "v")
    .replace(/U\u0308/g, "V")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/** Normalise a search string or pinyin to bare lowercase letters: "Nǐ hǎo" -> "nihao", "ni3 hao3" -> "nihao", "lü" -> "lv". */
export function pinyinKey(s) {
  return stripTones(s).toLowerCase().replace(/u:/g, "v").replace(/[^a-z]/g, "");
}

/** Put a tone mark on a toneless syllable: ("hao", 3) -> "hǎo"; ("lv", 4) -> "lǜ". */
export function markSyllable(letters, tone) {
  const s = letters.replace(/v/g, "ü").replace(/V/g, "Ü").normalize("NFC");
  if (!MARK_FOR[tone]) return s;
  const lower = s.toLowerCase();
  let i = -1;
  if (lower.includes("a")) i = lower.indexOf("a");
  else if (lower.includes("e")) i = lower.indexOf("e");
  else if (lower.includes("ou")) i = lower.indexOf("o");
  else {
    for (let k = 0; k < lower.length; k++) if ("aeiouü".includes(lower[k])) i = k; // last vowel
    if (i < 0 && (lower[0] === "m" || lower[0] === "n")) i = 0; // m, n, ng
  }
  if (i < 0) return s;
  return (s.slice(0, i) + s[i] + MARK_FOR[tone] + s.slice(i + 1)).normalize("NFC");
}

/** Change the tone of a marked syllable: ("hǎo", 4) -> "hào". */
export function retone(syllable, tone) {
  const letters = stripTones(syllable);
  return markSyllable(letters, tone);
}

/** "nǐ hǎo" syllables + tones as [{s, t}] */
export function syllables(word) {
  return word.y.split(" ").map((s, i) => ({ s, t: Number(word.t[i]) || toneOf(s) }));
}

/** Rewrite the official pinyin with replacement syllables, keeping its spaces and apostrophes. */
export function rebuildPinyin(word, newSyl) {
  const syl = word.y.split(" ");
  let rest = word.p.split(" / ")[0];
  let out = "";
  for (let i = 0; i < syl.length; i++) {
    if (!syl[i]) continue;
    const idx = rest.toLowerCase().indexOf(syl[i].toLowerCase());
    if (idx < 0) return join(newSyl);
    const orig = rest.slice(idx, idx + syl[i].length);
    let rep = newSyl[i];
    if (orig[0] && orig[0] !== orig[0].toLowerCase()) rep = rep[0].toUpperCase() + rep.slice(1);
    out += rest.slice(0, idx) + rep;
    rest = rest.slice(idx + syl[i].length);
  }
  return out + rest;
}

/**
 * Distractor readings for a tone question: same syllables, different tones,
 * written like the official pinyin. Returns up to `n` distinct strings.
 */
export function toneVariants(word, n = 3, rand = Math.random) {
  const syl = syllables(word);
  const changeable = syl.map((x, i) => i).filter((i) => syl[i].s !== "r");
  const correct = rebuildPinyin(word, syl.map((x) => x.s));
  const out = new Set();
  let guard = 0;
  while (out.size < n && guard++ < 200 && changeable.length) {
    const changed = syl.map((x) => x.s);
    const howMany = changeable.length > 1 && rand() < 0.4 ? 2 : 1;
    const picked = new Set();
    while (picked.size < Math.min(howMany, changeable.length)) {
      picked.add(changeable[Math.floor(rand() * changeable.length)]);
    }
    for (const i of picked) {
      const options = [1, 2, 3, 4].filter((t) => t !== syl[i].t);
      changed[i] = retone(syl[i].s, options[Math.floor(rand() * options.length)]);
    }
    const v = rebuildPinyin(word, changed);
    if (v !== correct) out.add(v);
  }
  return [...out];
}

function join(parts) {
  let out = "";
  parts.forEach((p, i) => {
    if (i && /^[aeoāáǎàēéěèōóǒò]/i.test(p)) out += "'";
    out += p;
  });
  return out;
}
export { join as joinSyllables };

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** Characters of a word, each wrapped with its tone class. */
export function hanziHTML(word) {
  const chars = [...word.w];
  const tones = word.t || "";
  return chars.map((ch, i) => `<span class="t${tones[i] || 5}">${esc(ch)}</span>`).join("");
}

/** Pinyin syllables of a word, each wrapped with its tone class (official spelling kept). */
export function pinyinHTML(word) {
  if (word.p.includes(" / ")) return `<span class="t${word.t[0] || 5}">${esc(word.p)}</span>`;
  const syl = word.y.split(" ");
  // Rebuild from the official spelling so spaces/apostrophes are preserved.
  let rest = word.p;
  let out = "";
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i];
    if (!s) continue;
    const idx = rest.toLowerCase().indexOf(s.toLowerCase());
    if (idx < 0) return `<span>${esc(word.p)}</span>`;
    out += esc(rest.slice(0, idx));
    out += `<span class="t${word.t[i] || 5}">${esc(rest.slice(idx, idx + s.length))}</span>`;
    rest = rest.slice(idx + s.length);
  }
  return out + esc(rest);
}

/** Per-character ruby: pinyin over each character, tone coloured. */
export function rubyHTML(word) {
  const chars = [...word.w];
  const syl = word.y.split(" ");
  if (syl.length !== chars.length) return `<ruby>${hanziHTML(word)}<rt>${pinyinHTML(word)}</rt></ruby>`;
  return chars
    .map((ch, i) => {
      const t = word.t[i] || 5;
      const s = syl[i] === "r" ? "r" : syl[i];
      return `<ruby class="t${t}">${esc(ch)}<rt>${esc(s)}</rt></ruby>`;
    })
    .join("");
}

/** Tone class for a sentence token syllable list ("nǐ hǎo") -> per-char spans. */
export function tokenHTML(text, pinyin, mode) {
  const chars = [...text];
  const syl = pinyin ? pinyin.split(" ") : [];
  if (!pinyin || syl.length !== chars.length) {
    if (mode === "pinyin" && pinyin) return `<span class="tok">${esc(pinyin)}</span>`;
    return `<span class="tok">${esc(text)}</span>`;
  }
  const tones = syl.map(toneOf);
  if (mode === "pinyin") {
    return `<span class="tok">${syl.map((s, i) => `<span class="t${tones[i]}">${esc(s)}</span>`).join("")}</span>`;
  }
  if (mode === "hanzi") {
    return `<span class="tok">${chars.map((c, i) => `<span class="t${tones[i]}">${esc(c)}</span>`).join("")}</span>`;
  }
  return `<span class="tok">${chars
    .map((c, i) => `<ruby class="t${tones[i]}">${esc(c)}<rt>${esc(syl[i])}</rt></ruby>`)
    .join("")}</span>`;
}
