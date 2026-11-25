"""Pinyin helpers: tone extraction, syllable segmentation aligned to characters,
numeric <-> tone-mark conversion."""
import re
import unicodedata

TONE_MARKS = {"\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4}
MARK_FOR_TONE = {1: "\u0304", 2: "\u0301", 3: "\u030c", 4: "\u0300"}
APOSTROPHES = "'’‘`"


def base_and_tones(s):
    """Return list of (base_letter, tone_or_0, original_char) for each visible letter.
    ü / u: / v map to base 'v'."""
    out = []
    for ch in unicodedata.normalize("NFC", s):
        d = unicodedata.normalize("NFD", ch)
        base = d[0]
        marks = d[1:]
        tone = 0
        for m in marks:
            if m in TONE_MARKS:
                tone = TONE_MARKS[m]
        if base.lower() == "u" and "\u0308" in marks:
            base = "v" if base.islower() else "V"
        out.append((base, tone, ch))
    return out


def toneless_key(s):
    """Lowercase letters only, ü->v, no spaces/apostrophes/digits."""
    s = s.replace("u:", "v").replace("U:", "V")
    return "".join(b.lower() for b, _, _ in base_and_tones(s) if b.isalpha())


def numeric_syllables(cedict_pinyin):
    """'yi1 dian3 r5' -> [('yi',1),('dian',3),('r',5)] (letters lowercased, ü->v)."""
    out = []
    for tok in cedict_pinyin.split():
        tok = tok.replace("u:", "v").replace("U:", "V")
        m = re.match(r"^([A-Za-zv]+)([1-5])?$", tok)
        if not m:
            out.append((tok.lower(), 0))
            continue
        out.append((m.group(1).lower(), int(m.group(2) or 5)))
    return out


def mark_syllable(letters, tone):
    """Put a tone mark on a single toneless syllable ('hao', 3) -> 'hǎo'."""
    s = letters.replace("v", "ü").replace("V", "Ü")
    if tone not in MARK_FOR_TONE:
        return s
    lower = s.lower()
    if "a" in lower:
        i = lower.index("a")
    elif "e" in lower:
        i = lower.index("e")
    elif "ou" in lower:
        i = lower.index("o")
    else:
        i = max((k for k, c in enumerate(lower) if c in "aeiouü"), default=-1)
        if i < 0:  # m, n, ng, r
            i = 0 if lower[0] in "mn" else -1
            if i < 0:
                return s
    return unicodedata.normalize("NFC", s[: i + 1] + MARK_FOR_TONE[tone] + s[i + 1 :])


def numeric_to_marked(cedict_pinyin, join=""):
    sy = []
    for tok in cedict_pinyin.split():
        letters_tone = numeric_syllables(tok)
        if not letters_tone:
            continue
        letters, tone = letters_tone[0]
        cap = tok[:1].isupper()
        m = mark_syllable(letters, tone)
        sy.append(m[:1].upper() + m[1:] if cap else m)
    out = ""
    for i, s in enumerate(sy):
        if i and join == "" and s[:1].lower() in "aeoāáǎàēéěèōóǒò":
            out += "'"
        elif i:
            out += join
        out += s
    return out


class Segmenter:
    """Split an (official, tone-marked) pinyin word into syllables aligned to hanzi."""

    def __init__(self, valid_syllables):
        self.valid = set(valid_syllables)
        self.maxlen = max(len(s) for s in self.valid)

    def split(self, pinyin, hanzi):
        letters = [(b, t, ch) for b, t, ch in base_and_tones(pinyin)]
        # chunks separated by spaces/apostrophes/hyphens
        chunks, cur = [], []
        for b, t, ch in letters:
            if ch in " -" or ch in APOSTROPHES:
                if cur:
                    chunks.append(cur)
                cur = []
            elif b.isalpha():
                cur.append((b.lower(), t, ch))
        if cur:
            chunks.append(cur)
        n = len(hanzi)
        erhua_positions = {i for i, c in enumerate(hanzi) if c == "儿" and i > 0}
        # strict pinyin orthography first; the syllabus occasionally omits an
        # apostrophe (e.g. 疼爱 "téngài"), so fall back to a looser split
        for strict in (True, False):
            self.strict = strict
            best = self._search(chunks, 0, 0, 0, n, hanzi, erhua_positions)
            if best is not None:
                return best
        return None

    def _search(self, chunks, ci, pos, char_i, n, hanzi, erhua):
        if ci == len(chunks):
            return [] if char_i == n else None
        chunk = chunks[ci]
        if pos == len(chunk):
            return self._search(chunks, ci + 1, 0, char_i, n, hanzi, erhua)
        if char_i >= n:
            return None
        for L in range(min(self.maxlen + 1, len(chunk) - pos), 0, -1):
            piece = chunk[pos : pos + L]
            base = "".join(b for b, _, _ in piece)
            # pinyin orthography: a syllable starting with a/e/o is only written
            # mid-word after an apostrophe, i.e. it always starts a chunk here
            if self.strict and pos > 0 and base[0] in "aeo":
                continue
            tones = [t for _, t, _ in piece if t]
            if len(tones) > 1:
                continue
            text = "".join(ch for _, _, ch in piece)
            tone = tones[0] if tones else 5
            # erhua: syllable + 'r' covering this char and a following 儿
            if base.endswith("r") and base[:-1] in self.valid and (char_i + 1) in erhua and base != "er":
                rest = self._search(chunks, ci, pos + L, char_i + 2, n, hanzi, erhua)
                if rest is not None:
                    return [(text[:-1], tone), ("r", 5)] + rest
            if base in self.valid:
                rest = self._search(chunks, ci, pos + L, char_i + 1, n, hanzi, erhua)
                if rest is not None:
                    return [(text, tone)] + rest
        return None
