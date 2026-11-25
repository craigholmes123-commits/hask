"""CC-CEDICT parsing and matching dictionary entries to syllabus readings."""
import re
from collections import defaultdict

from pinyin_util import numeric_syllables, toneless_key

LINE = re.compile(r"^(\S+) (\S+) \[([^\]]*)\] /(.*)/\s*$")

DROP_PREFIXES = (
    "surname ",
    "variant of",
    "old variant of",
    "archaic variant of",
    "japanese variant of",
    "erhua variant of",
    "used in ",
    "also pr.",
    "also written",
    "taiwan pr.",
    "(old)",
    "abbr. for",
    "see also",
    "see ",
    "(dialect)",
    "(archaic)",
    "(literary)",
    "(classical)",
)


def load(path):
    by_simp = defaultdict(list)
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            m = LINE.match(line.strip())
            if not m:
                continue
            trad, simp, py, defs = m.groups()
            by_simp[simp].append({"trad": trad, "py": py, "defs": defs.split("/")})
    return by_simp


def valid_syllables(by_simp):
    out = set()
    for entries in by_simp.values():
        for e in entries:
            for s, _ in numeric_syllables(e["py"]):
                if s.isalpha() and s.isascii():
                    out.add(s)
    # a few interjection/erhua forms that only exist with tone marks in official lists
    out.update({"r", "m", "n", "ng", "hm", "hng", "yo", "lo", "ei", "o"})
    return out


def clean_defs(defs):
    """Split classifiers off, drop low-value senses (surname, variant of...)."""
    keep, drop, classifiers = [], [], []
    for d in defs:
        d = d.strip()
        if not d:
            continue
        if d.startswith("CL:"):
            for c in d[3:].split(","):
                c = c.strip()
                simp = c.split("|")[-1].split("[")[0]
                if simp and simp not in classifiers:
                    classifiers.append(simp)
            continue
        # inline classifiers: "game (CL:場|场[chang3])"
        for inline in re.findall(r"\(?CL:([^)/]*)\)?", d):
            for c in inline.split(","):
                simp = c.strip().split("|")[-1].split("[")[0]
                if simp and simp not in classifiers:
                    classifiers.append(simp)
        d = re.sub(r"\s*[,;]?\s*\(?CL:[^)/]*\)?", "", d)
        d = re.sub(r"\s+", " ", d).strip()
        if not d:
            continue
        # strip trailing ", CL:..." remains and pinyin refs like 個|个[ge4] -> 个
        d = re.sub(r"(\S+)\|(\S+?)\[[^\]]+\]", r"\2", d)
        d = re.sub(r"([\u4e00-\u9fff]+)\[[a-zA-Z:0-9 ]+\]", r"\1", d)
        low = d.lower()
        if any(low.startswith(p) for p in DROP_PREFIXES):
            drop.append(d)
        else:
            keep.append(d)
    if not keep:
        keep = drop[:3]
    # de-duplicate preserving order
    seen, out = set(), []
    for d in keep:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out, classifiers


def match(by_simp, word, pinyin, tones=None):
    """Return list of CEDICT entries for this reading (best first) and match quality."""
    cands = by_simp.get(word, [])
    if not cands:
        return [], "none"
    key = toneless_key(pinyin)
    official_lower = pinyin[:1].islower()
    same = [e for e in cands if toneless_key(e["py"]) == key]
    if not same:
        return [], "no-reading"

    def score(e):
        s = 0
        sy = numeric_syllables(e["py"])
        if tones and len(tones) == len(sy):
            for (_, t1), t2 in zip(sy, tones):
                if t1 != t2:
                    # tone sandhi marked in syllabus for 一/不; neutral tone variance
                    s += 1 if (t1 == 5 or t2 == 5) else 2
        else:
            s += 3
        first_upper = e["py"][:1].isupper()
        if official_lower and first_upper:
            s += 10
        if not official_lower and not first_upper:
            s += 5
        if all(d.lower().startswith(DROP_PREFIXES) or d.startswith("CL:") for d in e["defs"] if d):
            s += 20
        return s

    ranked = sorted(same, key=score)
    best = score(ranked[0])
    chosen = [e for e in ranked if score(e) <= best + 1 and score(e) < 10] or ranked[:1]
    return chosen, "exact" if best == 0 else "close"
