#!/usr/bin/env python3
"""Build data/stories.json from the graded stories in tools/stories/*.txt.

The stories are original texts written for Hask, pre-segmented into words with
spaces. Every word must belong to the story's level (the realm's scripture
plus everything before it) or be listed in the story's `words:` header, where
it is pre-taught. The build fails on any word it can't place, on an ambiguous
reading (只 zhī / zhǐ) that isn't settled, and on unused header words.

Needs only the generated data/*.json, so run it after build_data.py:
    python3 tools/build_stories.py            # build
    python3 tools/build_stories.py --check 手 上边 每   # look up words' levels

Story file format:
    # id: boy-1
    # title: 老人
    # en: The Old Man
    # level: 0                 (0 = Top 100, 1 = HSK 1, ... 7 = HSK 7-9)
    # series: 茶馆少年 | The Teahouse Boy | 1      (optional)
    # blurb: One line for the list.
    # words: @小林|Xiǎo Lín|Xiao Lin (a name); 茶馆; 道|dào|the Way
    ---
    小林 在 茶馆 工作 。 | Xiao Lin works in a teahouse.
    (blank line = new paragraph; 还|huán overrides a reading, 还是|hái_shi for several syllables)
    ---
    ? 小林 在 哪里 工作 ？ | Where does Xiao Lin work?
    * 茶馆        (the right answer)
    - 学校
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEVELS = ["1", "2", "3", "4", "5", "6", "7-9"]
REALM_OF_LEVEL = {lv: i + 1 for i, lv in enumerate(LEVELS)}
LEVEL_NAMES = ["Top 100", "HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7–9"]
OFF_PATH = 8  # common words that are in no HSK list and outside the Top 100

HAN = re.compile(r"[㐀-鿿]")
NUMERALS = {
    "零": "líng", "〇": "líng", "一": "yī", "二": "èr", "两": "liǎng", "三": "sān", "四": "sì", "五": "wǔ",
    "六": "liù", "七": "qī", "八": "bā", "九": "jiǔ", "十": "shí", "百": "bǎi", "千": "qiān", "万": "wàn",
}
# readings used when a word has several and the story doesn't say
DEFAULT_READING = {
    "了": "le", "的": "de", "得": "de", "着": "zhe", "地": "de", "都": "dōu", "还": "hái", "为": "wèi",
    "要": "yào", "只": "zhǐ", "长": "cháng", "行": "xíng", "好": "hǎo", "一": "yī", "中": "zhōng",
    "种": "zhǒng", "少": "shǎo", "大": "dà", "觉": "jiào", "教": "jiāo", "当": "dāng", "便": "biàn",
    "过": "guò", "看": "kàn", "和": "hé", "会": "huì", "上": "shàng", "下": "xià", "里": "lǐ",
    "啊": "a", "来": "lái", "去": "qù", "说": "shuō", "没": "méi", "什么": "shénme", "这个": "zhège", "那个": "nàge",
}


def norm(p):
    p = unicodedata.normalize("NFC", p).lower()
    return re.sub(r"[\s'’_·\-]", "", p)


def load_words():
    recs = {}
    for lv in LEVELS:
        for w in json.loads((ROOT / "data" / f"hsk{lv}.json").read_text("utf-8"))["words"]:
            recs["h" + str(w["i"])] = dict(w, k="h" + str(w["i"]))
    for w in json.loads((ROOT / "data" / "top.json").read_text("utf-8"))["words"]:
        if w["k"] in recs:
            recs[w["k"]]["r"] = w["r"]
        else:
            recs[w["k"]] = dict(w)
    by_hanzi = {}
    for r in recs.values():
        realms = []
        if r.get("r") and r["r"] <= 100:
            realms.append(0)
        if r.get("l"):
            realms.append(REALM_OF_LEVEL[r["l"]])
        r["realm"] = min(realms) if realms else OFF_PATH
        by_hanzi.setdefault(r["w"], []).append(r)
    for lst in by_hanzi.values():
        lst.sort(key=lambda r: (r["realm"], r["k"]))
    return recs, by_hanzi


def realm_name(i):
    return LEVEL_NAMES[i] if i < len(LEVEL_NAMES) else "outside HSK"


class StoryError(Exception):
    pass


def parse_story(path):
    text = path.read_text("utf-8").replace("\r\n", "\n")
    parts = re.split(r"^---\s*$", text, flags=re.M)
    if len(parts) < 2:
        raise StoryError(f"{path.name}: needs a header, '---', then the story")
    head = {}
    for line in parts[0].splitlines():
        m = re.match(r"#\s*(\w+)\s*:\s*(.*)$", line.strip())
        if m:
            head[m.group(1)] = m.group(2).strip()
    for key in ("id", "title", "en", "level", "blurb"):
        if key not in head:
            raise StoryError(f"{path.name}: missing '# {key}:'")
    paras, cur = [], []
    for line in parts[1].splitlines():
        line = line.strip()
        if not line:
            if cur:
                paras.append(cur)
                cur = []
            continue
        if "|" not in line.replace("||", ""):
            raise StoryError(f"{path.name}: sentence without ' | English': {line}")
        zh, en = line.rsplit(" | ", 1)
        cur.append((zh.split(), en.strip()))
    if cur:
        paras.append(cur)
    questions = []
    if len(parts) > 2:
        q = None
        for line in parts[2].splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("?"):
                zh, en = line[1:].rsplit(" | ", 1)
                q = {"zh": zh.split(), "en": en.strip(), "opts": [], "a": None}
                questions.append(q)
            elif line[0] in "*-" and q is not None:
                if line[0] == "*":
                    q["a"] = len(q["opts"])
                q["opts"].append(line[1:].split())
            else:
                raise StoryError(f"{path.name}: can't read question line: {line}")
        for q in questions:
            if q["a"] is None or len(q["opts"]) < 2:
                raise StoryError(f"{path.name}: question needs 2+ options and one '*': {' '.join(q['zh'])}")
    return head, paras, questions


def parse_words(spec):
    out = {}
    for item in filter(None, (s.strip() for s in spec.split(";"))):
        name = item.startswith("@")
        bits = [b.strip() for b in item.lstrip("@").split("|")]
        w = bits[0]
        out[w] = {"w": w, "p": bits[1] if len(bits) > 1 else None, "g": bits[2] if len(bits) > 2 else None, "name": name}
    return out


class Builder:
    def __init__(self):
        self.recs, self.by_hanzi = load_words()

    def token(self, raw, level, glossary, used, errors, where):
        """One word of a story: its text, pinyin (one syllable per character) and word key.
        Keys: a word-list key, "#" for numbers, "g:<word>" for words only this story defines, "" for punctuation."""
        word, _, override = raw.partition("|")
        if not HAN.search(word):
            return {"t": word, "p": "", "k": ""}
        gl = glossary.get(word)
        if all(c in NUMERALS for c in word) and not gl and not override:
            return {"t": word, "p": " ".join(NUMERALS[c] for c in word), "k": "#"}
        if gl and gl["p"] and gl["g"]:
            # defined by the story itself (a name, or a sense the word lists don't cover)
            used.add(word)
            p = unicodedata.normalize("NFC", gl["p"])
            return {"t": word, "p": p if len(p.split()) == len(word) else self.align(word, p), "k": "g:" + word}
        recs = self.by_hanzi.get(word, [])
        want = override.replace("_", " ") if override else (gl["p"] if gl and gl["p"] else None)
        rec = None
        if want:
            rec = next((r for r in recs if norm(r["p"]) == norm(want)), None)
            if not rec and not gl:
                errors.append(f"{where}: no word {word} read '{want}'; readings: {[r['p'] for r in recs] or 'none'}")
        elif len({norm(r["p"]) for r in recs}) == 1:
            rec = recs[0]
        elif recs:
            dflt = DEFAULT_READING.get(word)
            rec = next((r for r in recs if dflt and norm(r["p"]) == norm(dflt)), None)
            if not rec:
                errors.append(f"{where}: {word} has several readings {sorted({r['p'] for r in recs})}; write {word}|<pinyin>")
        elif not gl:
            errors.append(f"{where}: {word} isn't in any word list; add it to '# words:' or split it")
        elif not gl["p"]:
            errors.append(f"{where}: {word} isn't in any word list, so '# words:' must give its pinyin and meaning")
        if gl:
            used.add(word)
        elif rec and rec["realm"] > level:
            errors.append(f"{where}: {word} is {realm_name(rec['realm'])}, above {realm_name(level)}; pre-teach it in '# words:' or rephrase")
        if rec:
            p, k = rec["y"], rec["k"]
        else:
            p, k = want or "", ("g:" + word if gl else "")
        p = unicodedata.normalize("NFC", p)
        if len(p.split()) != len(word):
            p = self.align(word, p)
        return {"t": word, "p": p, "k": k}

    @staticmethod
    def align(word, p):
        """Split joined pinyin ('Xiǎo Lín' is fine; 'cháguǎn' → 'chá guǎn') to one syllable per character."""
        syl = re.findall(r"[^aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]*[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+(?:ng|n(?![aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ])|r(?![aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]))?", p.replace(" ", ""), flags=re.I)
        return " ".join(syl) if len(syl) == len(word) else p

    def sentence(self, toks, level, glossary, used, errors, where):
        out = [self.token(t, level, glossary, used, errors, where) for t in toks]
        return {"z": "|".join(t["t"] for t in out), "y": "|".join(t["p"] for t in out), "k": "|".join(t["k"] for t in out)}

    def story(self, path):
        head, paras, questions = parse_story(path)
        level = int(head["level"])
        glossary = parse_words(head.get("words", ""))
        used, errors = set(), []
        out_paras = []
        stats = {"tokens": 0, "realms": {}}
        for pi, para in enumerate(paras):
            sents = []
            for si, (toks, en) in enumerate(para):
                s = self.sentence(toks, level, glossary, used, errors, f"{path.name} ¶{pi + 1}.{si + 1}")
                s["e"] = en
                sents.append(s)
                for t, k in zip(s["z"].split("|"), s["k"].split("|")):
                    if k and k != "#" and t not in glossary:
                        stats["tokens"] += 1
                        realm = self.recs[k]["realm"] if k in self.recs else -1
                        stats["realms"][realm] = stats["realms"].get(realm, 0) + 1
            out_paras.append(sents)
        out_q = []
        for qi, q in enumerate(questions):
            where = f"{path.name} Q{qi + 1}"
            item = self.sentence(q["zh"], level, glossary, used, errors, where)
            item["e"] = q["en"]
            item["o"] = [self.sentence(o, level, glossary, used, errors, where) for o in q["opts"]]
            item["a"] = q["a"]
            out_q.append(item)
        for w in glossary:
            if w not in used:
                errors.append(f"{path.name}: '# words:' lists {w} but the story never uses it")
        words = []
        for w, g in glossary.items():
            rec = self.by_hanzi.get(w, [None])[0]
            entry = {"w": w, "p": g["p"] or (rec["p"] if rec else ""), "g": g["g"] or (rec["g"] if rec else "")}
            if rec and not (g["p"] and g["g"]):
                entry["k"] = rec["k"]
                entry["p"] = g["p"] or rec["p"]
            if g["name"]:
                entry["n"] = 1
            if not entry["p"] or not entry["g"]:
                errors.append(f"{path.name}: '# words:' entry {w} needs pinyin and a gloss (it's in no word list)")
            words.append(entry)
        story = {"id": head["id"], "t": head["title"], "en": head["en"], "lv": level, "b": head["blurb"], "w": words, "p": out_paras, "q": out_q}
        if head.get("series"):
            zh, en, part = [x.strip() for x in head["series"].split("|")]
            story["s"] = [zh, en, int(part)]
        return story, errors, stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=str(ROOT / "tools" / "stories"))
    ap.add_argument("--out", default=str(ROOT / "data" / "stories.json"))
    ap.add_argument("--check", nargs="*", help="print the level of these words and exit")
    args = ap.parse_args()
    b = Builder()
    if args.check is not None:
        for w in args.check:
            recs = b.by_hanzi.get(w)
            if not recs:
                print(f"{w}: not in any list")
            for r in recs or []:
                print(f"{w}: {realm_name(r['realm'])} ({r['k']}) {r['p']} — {r['g']}")
        return
    stories, problems = [], []
    for path in sorted(Path(args.src).glob("*.txt")):
        try:
            story, errors, stats = b.story(path)
        except StoryError as e:
            problems.append(str(e))
            continue
        problems += errors
        stories.append(story)
        sents = sum(len(p) for p in story["p"])
        top = max((r for r in stats["realms"] if r >= 0), default=0)
        print(f"{story['id']:<10} {realm_name(story['lv']):<8} {sents:>3} sentences {stats['tokens']:>4} words "
              f"{len(story['w']):>2} pre-taught  hardest other word: {realm_name(top)}")
    ids = [s["id"] for s in stories]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        problems.append(f"duplicate story ids: {sorted(dupes)}")
    if problems:
        print("\n".join(["", f"{len(problems)} problem(s):"] + ["  " + p for p in problems]), file=sys.stderr)
        sys.exit(1)
    Path(args.out).write_text(json.dumps({"v": 1, "stories": stories}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"wrote {len(stories)} stories to {args.out}")


if __name__ == "__main__":
    main()
