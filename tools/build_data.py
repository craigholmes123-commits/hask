#!/usr/bin/env python3
"""Build the app's data files from public sources.

    python3 tools/build_data.py --cache /path/to/cache [--out data]

Sources (downloaded into --cache if missing):
  * 新版HSK考试大纲 (HSK examination syllabus, CLEC, Nov 2025; PDF revised Oct 2026)
  * CC-CEDICT (CC BY-SA 4.0)                — English definitions, classifiers
  * Tatoeba via manythings.org (CC BY 2.0 FR) — example sentences
  * Make Me a Hanzi dictionary.txt (LGPL-3)  — character decomposition / etymology
  * HSKStory hsk-3-vocabulary (CC BY-SA 4.0)   — curated learner glosses (preferred when the reading matches)
  * wordfreq (Apache-2.0 code, CC BY-SA 4.0 data) + FrequencyWords OpenSubtitles 2018 zh_cn
    (CC BY-SA 4.0) — word frequency for ordering and the Top 100/200/300 lists

Requires: pypdf wordfreq pypinyin jieba opencc-python-reimplemented
"""
import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cedict  # noqa: E402
import syllabus  # noqa: E402
from pinyin_util import Segmenter, base_and_tones, numeric_syllables, numeric_to_marked, toneless_key  # noqa: E402

SOURCES = {
    "syllabus.pdf": "https://hsk.cn-bj.ufileos.com/3.0/%E6%96%B0%E7%89%88HSK%E8%80%83%E8%AF%95%E5%A4%A7%E7%BA%B21219.pdf",
    "cedict.zip": "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.zip",
    "cmn-eng.zip": "https://www.manythings.org/anki/cmn-eng.zip",
    "mmah-dictionary.txt": "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt",
    "hskstory.json": "https://raw.githubusercontent.com/bezlant/hsk-3-vocabulary/main/hsk-3.0-vocabulary.json",
    "subtitles_zh_cn_50k.txt": "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/zh_cn/zh_cn_50k.txt",
}
LEVEL_FILE = {"1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7-9": "7-9"}
LEVEL_RANK = {"1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7-9": 7}
HAN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff]")
ALL_HAN = re.compile(r"^[\u3400-\u4dbf\u4e00-\u9fff]+$")
SHORT_GLOSS_LEN = 48

# Hand-picked glosses where the dictionary's first sense is misleading for learners.
GLOSS_OVERRIDES = {
    ("的", "de"): "(possessive / modifying particle) 's, of",
    ("了", "le"): "(particle: completed action / change of state)",
    ("吗", "ma"): "(question particle for yes/no questions)",
    ("呢", "ne"): "(particle: and you?; ongoing action; softens questions)",
    ("吧", "ba"): "(particle: suggestion 'let's…'; seeking agreement '…right?')",
    ("地", "de"): "(adverbial particle) -ly",
    ("得", "de"): "(complement particle, e.g. 跑得快 'runs fast')",
    ("着", "zhe"): "(particle: ongoing state, -ing)",
    ("过", "guo"): "(particle: have done before, experienced)",
    ("个", "gè"): "(general measure word); individual",
    ("是", "shì"): "to be; is; yes",
    ("在", "zài"): "at; in; to be (located) at; (doing sth) now",
    ("们", "men"): "(plural suffix for people)",
    ("这", "zhè"): "this",
    ("那", "nà"): "that",
    ("一", "yī"): "one; a; single",
    ("不", "bù"): "not; no",
    ("没", "méi"): "not (have); did not",
    ("有", "yǒu"): "to have; there is / are",
    ("和", "hé"): "and; with",
    ("就", "jiù"): "then; right away; just; only",
    ("也", "yě"): "also; too",
    ("都", "dōu"): "all; both; already",
    ("会", "huì"): "can; know how to; will (likely)",
    ("要", "yào"): "to want; will; need to",
    ("能", "néng"): "can; be able to",
    ("想", "xiǎng"): "to want to; would like; to think; to miss",
    ("还", "hái"): "still; also; even more",
    ("好", "hǎo"): "good; well; OK",
    ("很", "hěn"): "very; quite",
    ("太", "tài"): "too (much); very",
    ("对", "duì"): "right; correct; to; towards",
    ("说", "shuō"): "to speak; to say",
    ("去", "qù"): "to go",
    ("来", "lái"): "to come",
    ("吃", "chī"): "to eat",
    ("喝", "hē"): "to drink",
    ("看", "kàn"): "to look at; to see; to watch; to read",
    ("做", "zuò"): "to do; to make",
    ("他", "tā"): "he; him",
    ("她", "tā"): "she; her",
    ("它", "tā"): "it",
    ("我", "wǒ"): "I; me",
    ("你", "nǐ"): "you",
    ("人", "rén"): "person; people",
    ("多", "duō"): "many; much; more",
    ("大", "dà"): "big; large; old (age)",
    ("小", "xiǎo"): "small; little; young",
    ("上", "shàng"): "on; above; up; last (week etc.); to go up",
    ("下", "xià"): "under; below; down; next (week etc.); to go down",
    ("里", "lǐ"): "inside; in",
    ("点", "diǎn"): "o'clock; dot; a little",
    ("些", "xiē"): "some; a few",
    ("把", "bǎ"): "(handle measure word); (把-structure: takes the object)",
    ("被", "bèi"): "(passive marker) by",
    ("给", "gěi"): "to give; for; to",
    ("让", "ràng"): "to let; to allow; to make (sb do sth)",
    ("从", "cóng"): "from",
    ("跟", "gēn"): "with; and; to follow",
    ("比", "bǐ"): "than (comparison); to compare",
    ("最", "zuì"): "most; -est",
    ("再", "zài"): "again; then (after that)",
    ("又", "yòu"): "again (already happened); also",
    ("才", "cái"): "only then; just; only",
    ("呀", "ya"): "(particle: surprise / softening)",
    ("啊", "a"): "(particle: exclamation / softening)",
}

# Homographs that share a reading get identical dictionary senses; give each its own.
HOMOGRAPH_SENSES = {
    ("点", 2): ["to order (food etc)", "to point; to touch on", "to light (a fire)", "to nod; to check (a list)"],
    ("和", 2): ["harmonious; peaceful", "gentle; mild", "on good terms"],
    ("会", 2): ["meeting; gathering", "association; society", "(important) occasion; opportunity"],
    ("两", 2): ["liang (unit of weight = 50 grams)", "tael (old unit of weight)"],
    ("喂", 1): ["hello? (answering the phone); hey!"],
    ("喂", 2): ["to feed (a person or animal)"],
    ("别", 2): ["to leave; to part (from)", "to fasten with a pin or clip", "to differentiate"],
    ("打", 2): ["(colloquial) from; since (= 从)"],
    ("等", 2): ["and so on; etc.; and others", "grade; class; rank", "kind; type"],
    ("面", 1): ["face; side; surface", "(suffix of position, e.g. 上面 on top)", "to face", "(measure word for flat things: mirrors, flags)"],
    ("面", 2): ["noodles", "flour; powder"],
    ("才", 2): ["talent; ability", "gifted person"],
    ("该", 1): ["should; ought to", "to be sb's turn to", "to deserve"],
    ("该", 2): ["this; that; the above-mentioned (formal)"],
    ("为", 1): ["to act as; to serve as", "to become", "to be; to equal"],
    ("为", 2): ["by (in passive 为……所……)", "as; for"],
    ("本", 2): ["this; the current (year etc.)", "originally; at first", "root; origin; foundation"],
    ("过去", 2): ["(in the) past; former; previous"],
}

# First dictionary sense is rare or misleading for learners.
GLOSS_FIX = {
    "店": "shop; store; inn", "零": "zero; nought", "热": "hot; to heat up",
    "请": "please; to invite; to ask; to treat (to a meal)",
    "块": "yuan (money, colloquial); piece; lump",
    "件": "(measure word for clothes, matters, items); item",
    "口": "mouth; (measure word for family members)", "同学": "classmate; fellow student",
    "白色": "white", "阴": "overcast; cloudy; shady; yin", "介绍": "to introduce; introduction",
    "猫": "cat", "水": "water", "家人": "family member; family", "二": "two", "新": "new; newly",
    "饭": "meal; cooked rice; food", "星期": "week; day of the week", "嗯": "mm-hm; uh-huh; well… (agreement or thinking)",
    "不想": "don't want to; would rather not", "话": "words; speech; what sb says",
    "中": "middle; center; in; among", "头": "head; top; end; first",
}
TOP_PREFER = {"只": "zhǐ"}  # most frequent reading in running text

TOP_SKIP = {
    # high-frequency tokens that are fragments or not useful as flashcards
    "么", "我们的", "你们的", "他们的", "什么样", "为什么会", "就是说", "之",
}


def fetch(cache, name):
    path = os.path.join(cache, name)
    if not os.path.exists(path):
        print(f"downloading {name} …", file=sys.stderr)
        # some hosts refuse Python's default User-Agent
        req = urllib.request.Request(SOURCES[name], headers={"User-Agent": "Mozilla/5.0 (compatible; hask-data-build)", "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=300) as res, open(path + ".part", "wb") as out:
            out.write(res.read())
        os.replace(path + ".part", path)
    return path


def unzip_member(zpath, member, cache):
    out = os.path.join(cache, member)
    if not os.path.exists(out):
        with zipfile.ZipFile(zpath) as z:
            z.extract(member, cache)
    return out


def tones_of(syllables):
    return "".join(str(t) for _, t in syllables)


def apply_yi_bu_sandhi(tokens):
    """Mark the tone changes of 一 and 不 in sentence pinyin (as textbooks and the
    HSK syllabus do). tokens: list of [hanzi, pinyin_syllables(list)]"""
    flat = []
    for ti, (word, sys_) in enumerate(tokens):
        if not sys_:
            continue
        for ci, ch in enumerate(word):
            if ci < len(sys_):
                flat.append((ti, ci, ch))
    for k, (ti, ci, ch) in enumerate(flat):
        if ch not in "一不" or k + 1 >= len(flat):
            continue
        nti, nci, nch = flat[k + 1]
        if nti != ti and ch == "一" and len(tokens[ti][0]) == 1 and tokens[nti][0][:1] in "二三四五六七八九十零百千万":
            continue
        syl = tokens[ti][1][ci]
        nxt = tokens[nti][1][nci]
        nt = next((t for _, t, _ in base_and_tones(nxt) if t), 5)
        if ch == "不" and syl == "bù" and nt == 4:
            tokens[ti][1][ci] = "bú"
        elif ch == "一" and syl == "yī":
            prev = flat[k - 1][2] if k > 0 else ""
            if prev in "第十" or nch in "月号日" or HAN.match(nch) is None:
                continue
            if nch in "二三四五六七八九十零百千万":
                continue
            tokens[ti][1][ci] = "yí" if nt == 4 else ("yì" if nt in (1, 2, 3) else "yí")
    return tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    ap.add_argument("--audio-out", help="where packed recordings go (default: audio/ next to --out)")
    ap.add_argument("--no-audio", action="store_true", help="skip packaging the native-speaker recordings")
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)
    os.makedirs(args.out, exist_ok=True)

    # ---------- 1. syllabus ----------
    pages_cache = os.path.join(args.cache, "syllabus_pages.json")
    if os.path.exists(pages_cache):
        pages = json.load(open(pages_cache, encoding="utf-8"))
    else:
        pages = syllabus.read_pages(fetch(args.cache, "syllabus.pdf"))
        json.dump(pages, open(pages_cache, "w", encoding="utf-8"), ensure_ascii=False)
    rows, unparsed = syllabus.parse_vocab(pages)
    counts, problems = syllabus.validate(rows)
    if unparsed or problems:
        sys.exit(f"syllabus parse problems: {problems} unparsed={unparsed[:5]}")
    char_levels = parse_char_list(pages)
    print(f"syllabus: {len(rows)} entries {counts}; {len(char_levels)} characters", file=sys.stderr)

    # ---------- 2. dictionary ----------
    ced_path = unzip_member(fetch(args.cache, "cedict.zip"), "cedict_ts.u8", args.cache)
    ced = cedict.load(ced_path)
    seg = Segmenter(cedict.valid_syllables(ced))
    curated = load_curated(fetch(args.cache, "hskstory.json"))

    from wordfreq import top_n_list, zipf_frequency

    words = []
    stats = defaultdict(int)
    by_word = defaultdict(list)
    for rid in sorted(rows):
        r = rows[rid]
        r["pinyin"] = r["pinyin"].replace("’", "'").replace("/", " / ")
        r["pinyin"] = re.sub(r"\s+", " ", r["pinyin"]).strip()
        primary = r["pinyin"].split(" / ")[0]
        sy = seg.split(primary, r["word"])
        if sy is None:
            stats["unsegmented"] += 1
            print(f"  ! cannot align pinyin {r['word']} {r['pinyin']}", file=sys.stderr)
            sy = [(r["pinyin"], 5)] + [("", 5)] * (len(r["word"]) - 1)
        tones = [t for _, t in sy]
        entries, quality = cedict.match(ced, r["word"], primary, tones)
        stats[quality] += 1
        cedict_defs, cls = [], []
        for e in entries:
            d, c = cedict.clean_defs(e["defs"])
            cedict_defs += [x for x in d if x not in cedict_defs]
            cls += [x for x in c if x not in cls]
        defs = curated_defs(curated, r["word"], primary, tones)
        stats["curated" if defs else "cedict-only"] += 1
        defs = defs or cedict_defs
        rec = {
            "i": rid,
            "w": r["word"],
            "p": r["pinyin"],
            "y": " ".join(s for s, _ in sy),
            "t": tones_of(sy),
            "l": r["level"],
            "o": r["pos"],
            "d": defs,
            "c": cls,
            "q": round(zipf_frequency(r["word"], "zh"), 2),
        }
        if r["homograph"]:
            rec["h"] = r["homograph"]
        if r["extra_levels"]:
            rec["x"] = r["extra_levels"]
        words.append(rec)
        by_word[r["word"]].append(rec)

    split_homographs(by_word)
    for rec in words:
        senses = HOMOGRAPH_SENSES.get((rec["w"], rec.get("h")))
        if senses:
            rec["d"] = senses
    for rec in words:
        if rec["d"] and all(d.startswith(("erhua variant of", "erhua form of")) for d in rec["d"]):
            base = rec["w"][:-1] if rec["w"].endswith("儿") else rec["w"]
            for other in by_word.get(base, []):
                rec["d"] = other["d"]
                break
            else:
                for e in ced.get(base, []):
                    d, _ = cedict.clean_defs(e["defs"])
                    if d:
                        rec["d"] = d
                        break
        if not rec["d"]:
            rec["d"] = fallback_defs(ced, rec, by_word)
            stats["fallback"] += 1
        rec["g"] = short_gloss(rec)
    missing = [f"{w['w']} {w['p']}" for w in words if not w["d"]]
    print(f"definitions: {dict(stats)}; still missing {len(missing)}: {missing[:30]}", file=sys.stderr)

    # ---------- 3. frequency lists (Top 100 / 200 / 300) ----------
    top = build_top(ced, by_word, top_n_list, zipf_frequency, fetch(args.cache, "subtitles_zh_cn_50k.txt"), n=300)

    # ---------- 4. example sentences ----------
    sentences, examples = build_sentences(args.cache, words, by_word, top)
    for rec in words:
        ex = examples.get(("h", rec["i"]))
        if ex:
            rec["e"] = ex
    by_id = {w["i"]: w for w in words}
    full_top = []
    for rec in top:
        if rec["k"].startswith("c:"):
            ex = examples.get(("c", rec["w"]))
            if ex:
                rec["e"] = ex
            full_top.append(rec)
        else:  # embed the HSK record so the Top decks load from one file
            full_top.append(dict(by_id[int(rec["k"][1:])], k=rec["k"], r=rec["r"]))
    top = full_top

    # ---------- 5. characters ----------
    chars = build_chars(args.cache, words, top, ced, char_levels)

    # ---------- 6. native-speaker recordings ----------
    audio_meta = None
    if not args.no_audio:
        import build_audio

        audio_out = args.audio_out or os.path.join(os.path.dirname(os.path.abspath(args.out)), "audio")
        audio_meta = build_audio.build(words, top, chars, by_word, syllabus.LEVEL_KEYS, args.cache, audio_out)
        ma = next((w for w in by_word.get("吗", []) if "a" in w), None)
        if ma:
            audio_meta["tones"]["ma5"] = ma["a"]

    # ---------- write ----------
    for lv, name in LEVEL_FILE.items():
        lw = [w for w in words if w["l"] == lv]
        lw.sort(key=lambda w: (-w["q"], w["i"]))  # most frequent first
        write_json(os.path.join(args.out, f"hsk{name}.json"), {"level": lv, "words": lw})
    write_json(os.path.join(args.out, "top.json"), {"words": top})
    write_json(os.path.join(args.out, "sentences.json"), {"s": sentences})
    write_json(os.path.join(args.out, "chars.json"), chars)
    meta = {
        "built": __import__("datetime").date.today().isoformat(),
        "syllabus": "HSK 考试大纲 (CLEC, published 2025-11, in force 2026-07; PDF revision 2026-10)",
        "counts": {k: counts[k] for k in syllabus.LEVEL_KEYS},
        "cumulative": cumulative(counts),
        "sentences": len(sentences),
        "chars": len(chars),
        "cedict": cedict_date(ced_path),
    }
    meta["coverage"] = coverage(top, words)
    meta["char_counts"] = {k: sum(1 for v in char_levels.values() if v == k) for k in syllabus.LEVEL_KEYS}
    if audio_meta:
        meta["audio"] = audio_meta
    write_json(os.path.join(args.out, "meta.json"), meta)
    print(json.dumps(meta, ensure_ascii=False), file=sys.stderr)


def coverage(top, words):
    """Share of running Chinese text (wordfreq token frequencies) covered by each list."""
    from wordfreq import word_frequency

    def cov(ws):
        return round(100 * sum(word_frequency(w, "zh") for w in set(ws)), 1)

    out = {}
    for n in (100, 200, 300):
        out[f"top{n}"] = cov(t["w"] for t in top if t["r"] <= n)
    acc = []
    for k in syllabus.LEVEL_KEYS:
        acc += [w["w"] for w in words if w["l"] == k]
        out[f"hsk{k}"] = cov(acc)
    return out


def cumulative(counts):
    total, out = 0, {}
    for k in syllabus.LEVEL_KEYS:
        total += counts[k]
        out[k] = total
    return out


def cedict_date(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#! date="):
                return line.strip().split("=", 1)[1][:10]
            if not line.startswith("#"):
                break
    return None


def write_json(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {os.path.relpath(path)} ({os.path.getsize(path) // 1024} KB)", file=sys.stderr)


def parse_char_list(pages):
    """HSK 汉字大纲 认读字: '1. 爱' lines under 'HSK（一级）认读字' headings."""
    level_names = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七—九": "7-9", "七-九": "7-9"}
    out, current = {}, None
    for text in pages:
        for line in text.split("\n"):
            line = line.strip()
            m = re.match(r"^HSK（(.+?)级）认读字", line)
            if m:
                current = level_names.get(m.group(1))
                continue
            if line.startswith("HSK（") and "书写" in line:
                current = None
            m = re.match(r"^(\d+)\.\s*([\u3400-\u9fff])$", line)
            if m and current and m.group(2) not in out:
                out[m.group(2)] = current
    return out


def load_curated(path):
    out = {}
    for r in json.load(open(path, encoding="utf-8")):
        out[r["simplified"]] = r
    return out


def curated_defs(curated, word, pinyin, tones):
    """Learner-curated senses, only if their reading is the syllabus reading."""
    r = curated.get(word)
    if not r or toneless_key(r["pinyin"]) != toneless_key(pinyin):
        return []
    theirs = [t for _, t, _ in base_and_tones(r["pinyin"]) if t]
    ours = [t for t in tones if t != 5]
    # allow 一/不 sandhi differences; otherwise tones must agree
    if len(theirs) != len(ours):
        return []
    mism = sum(1 for a, b in zip(theirs, ours) if a != b)
    if mism and not (("一" in word or "不" in word) and mism <= word.count("一") + word.count("不")):
        return []
    defs = [d.strip() for d in r["definitions"] if d.strip()]
    if defs and all(d.startswith(("erhua variant", "erhua form", "variant of")) for d in defs):
        return []
    return defs




def split_homographs(by_word):
    """Homographs sharing a reading (本1 / 本2) get one CEDICT entry; split senses by POS."""
    for word, recs in by_word.items():
        groups = defaultdict(list)
        for r in recs:
            groups[toneless_key(r["p"])].append(r)
        for group in groups.values():
            if len(group) < 2:
                continue
            for r in group:
                pos = r["o"].split("、")[0].strip("（）")
                d = r["d"]
                if pos == "量":
                    sel = [x for x in d if "classifier" in x.lower() or "measure word" in x.lower()]
                elif pos == "动":
                    sel = [x for x in d if x.startswith("to ") and "classifier" not in x.lower()]
                elif pos in ("名",):
                    sel = [x for x in d if not x.startswith("to ") and "classifier" not in x.lower()]
                else:
                    sel = [x for x in d if "classifier" not in x.lower()]
                if sel:
                    r["d"] = sel


def fallback_defs(ced, rec, by_word):
    """No CEDICT entry with this reading: use any entry for the word, else character glosses."""
    for e in ced.get(rec["w"], []):
        d, _ = cedict.clean_defs(e["defs"])
        if d:
            return d
    # same word with another homograph number already defined?
    for other in by_word.get(rec["w"], []):
        if other is not rec and other["d"]:
            return other["d"]
    parts = []
    for ch in rec["w"]:
        for e in ced.get(ch, []):
            d, _ = cedict.clean_defs(e["defs"])
            if d:
                parts.append(f"{ch}: {d[0]}")
                break
    return ["(lit.) " + " + ".join(parts)] if parts else []


def short_gloss(rec):
    own_senses = (rec["w"], rec.get("h")) in HOMOGRAPH_SENSES
    if not own_senses:
        if (rec["w"], rec["p"]) in GLOSS_OVERRIDES:
            return GLOSS_OVERRIDES[(rec["w"], rec["p"])]
        if rec["w"] in GLOSS_FIX and (rec["w"] != "头" or rec["p"] == "tóu"):
            return GLOSS_FIX[rec["w"]]
    out = ""
    for d in rec["d"]:
        d = re.sub(r"^\(bound form\)\s*", "", d)
        d = re.sub(r"\s*\((Tw|PRC|coll\.|dialect|lit\.|fig\.)\)\s*", " ", d).strip()
        if not d:
            continue
        if not out:
            out = d
        elif len(out) + len(d) + 2 <= SHORT_GLOSS_LEN:
            out += "; " + d
        else:
            break
    if len(out) > SHORT_GLOSS_LEN + 20:
        cut = out[: SHORT_GLOSS_LEN + 20]
        out = cut[: cut.rfind(" ")].rstrip(",;") + "…" if " " in cut else cut + "…"
    return out


def build_top(ced, by_word, top_n_list, zipf_frequency, subtitles_path, n=300):
    """Most common words, weighted towards everyday speech.

    Rank = geometric blend of the OpenSubtitles (spoken, 60%) rank and the wordfreq
    (books, web, Wikipedia, subtitles; 40%) rank."""
    import math

    from opencc import OpenCC

    cc = OpenCC("t2s")
    spoken = {}
    with open(subtitles_path, encoding="utf-8") as f:
        for i, line in enumerate(f):
            w = cc.convert(line.split(" ")[0].strip())
            if ALL_HAN.match(w) and w not in spoken:
                spoken[w] = len(spoken) + 1
    general = {}
    for w in top_n_list("zh", 20000):
        if ALL_HAN.match(w) and w not in general:
            general[w] = len(general) + 1
    missing = 30000
    blend = {}
    for w in set(spoken) | set(general):
        rs, rg = spoken.get(w, missing), general.get(w, missing)
        blend[w] = math.exp(0.6 * math.log(rs) + 0.4 * math.log(rg))
    out, seen = [], set()
    for w in sorted(blend, key=blend.get):
        if len(out) >= n:
            break
        if w in seen or w in TOP_SKIP:
            continue
        seen.add(w)
        hsk = by_word.get(w)
        if hsk:
            prefer = TOP_PREFER.get(w)
            best = sorted(hsk, key=lambda r: (prefer is not None and r["p"] != prefer, LEVEL_RANK[r["l"]], r["i"]))[0]
            out.append({"k": f"h{best['i']}", "r": len(out) + 1})
            continue
        entries = [e for e in ced.get(w, []) if e["py"][:1].islower()]
        if not entries:
            continue  # not a dictionary word (e.g. 我要, 这是) or a proper noun
        entries.sort(key=lambda e: e["defs"][0].lower().startswith(cedict.DROP_PREFIXES))
        e = entries[0]
        d, c = cedict.clean_defs(e["defs"])
        if not d:
            continue
        syl = numeric_syllables(e["py"])
        if len(syl) != len(w):
            continue
        tones = [t for _, t in syl]
        marks = [numeric_to_marked(f"{s}{t}") for s, t in syl]
        for i, ch in enumerate(w[:-1]):  # 一 / 不 tone sandhi, as the syllabus writes it
            nxt = tones[i + 1]
            if ch == "不" and tones[i] == 4 and nxt == 4:
                marks[i], tones[i] = "bú", 2
            elif ch == "一" and tones[i] == 1:
                if nxt == 4 or w[i + 1] == "个":
                    marks[i], tones[i] = "yí", 2
                elif nxt in (1, 2, 3):
                    marks[i], tones[i] = "yì", 4
        rec = {
            "k": f"c:{w}",
            "r": len(out) + 1,
            "w": w,
            "p": join_syllables(marks),
            "y": " ".join(marks),
            "t": "".join(map(str, tones)),
            "l": "",
            "o": "",
            "d": d,
            "c": c,
            "q": round(zipf_frequency(w, "zh"), 2),
        }
        rec["g"] = short_gloss(rec)
        out.append(rec)
    return out


def join_syllables(marks):
    out = ""
    for i, m in enumerate(marks):
        if i and m[:1].lower() in "aeoāáǎàēéěèōóǒò":
            out += "'"
        out += m
    return out


def build_sentences(cache, words, by_word, top):
    import jieba
    from opencc import OpenCC
    from pypinyin import Style, pinyin as py_pinyin

    jieba.setLogLevel(60)
    cc = OpenCC("t2s")
    level_of = {}
    reading_of = {}
    for w in words:
        jieba.add_word(w["w"], freq=200000)
        r = LEVEL_RANK[w["l"]]
        if w["w"] not in level_of or r < level_of[w["w"]]:
            level_of[w["w"]] = r
        reading_of.setdefault(w["w"], set()).add(w["y"])
    top_c = {t["w"]: t for t in top if t["k"].startswith("c:")}
    for w in top_c:
        jieba.add_word(w, freq=200000)
        level_of.setdefault(w, 2)
        reading_of.setdefault(w, {top_c[w]["y"]})

    path = unzip_member(fetch(cache, "cmn-eng.zip"), "cmn.txt", cache)
    seen, raw = set(), []
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            en, zh, attr = parts[0], parts[1].strip(), parts[2]
            zh = cc.convert(zh)
            nhan = len(HAN.findall(zh))
            if nhan < 2 or nhan > 22 or re.search(r"[A-Za-z0-9]", zh):
                continue
            if zh in seen:
                continue
            seen.add(zh)
            m = re.search(r"#(\d+) \([^)]*\) & #(\d+)", attr)
            raw.append((zh, en, int(m.group(2)) if m else 0))

    sentences, examples_c = [], defaultdict(list)
    for zh, en, tid in raw:
        toks = []
        for tok in jieba.cut(zh, HMM=False):
            if HAN.match(tok):
                readings = reading_of.get(tok)
                if readings and len(readings) == 1:
                    syl = next(iter(readings)).split(" ")
                else:
                    syl = [p[0] for p in py_pinyin(tok, style=Style.TONE, heteronym=False)]
                if len(syl) != len(tok):
                    syl = [p[0] for p in py_pinyin(tok, style=Style.TONE, heteronym=False)]
                toks.append([tok, syl])
            else:
                toks.append([tok, []])
        toks = apply_yi_bu_sandhi(toks)
        han_toks = [t for t, s in toks if s]
        hard = max((level_of.get(t, 10) for t in han_toks), default=10)
        unknown = sum(1 for t in han_toks if t not in level_of)
        idx = len(sentences)
        sentences.append({"z": [[t, " ".join(s)] if s else [t] for t, s in toks], "e": en, "a": tid, "_h": hard, "_u": unknown})
        for t in set(han_toks):
            examples_c[t].append(idx)

    # choose up to 3 sentences per word: easiest (by hardest other word), then shortest
    used, examples = set(), {}

    def pick(word, level_rank, limit):
        cands = examples_c.get(word, [])

        def k(i):
            s = sentences[i]
            others = [level_of.get(t[0], 10) for t in s["z"] if len(t) > 1 and t[0] != word]
            hardest = max(others, default=0)
            return (max(0, hardest - level_rank), s["_u"], len("".join(t[0] for t in s["z"])))

        return sorted(cands, key=k)[:limit]

    for w in words:
        r = LEVEL_RANK[w["l"]]
        chosen = pick(w["w"], r, 3 if r <= 4 else 2)
        if chosen:
            examples[("h", w["i"])] = chosen
            used.update(chosen)
    for w in top_c.values():
        chosen = pick(w["w"], 2, 3)
        if chosen:
            examples[("c", w["w"])] = chosen
            used.update(chosen)
    # also keep easy sentences for reading practice (all words ≤ HSK 3, no unknowns)
    for i, s in enumerate(sentences):
        if s["_h"] <= 3 and s["_u"] == 0:
            used.add(i)

    remap, out = {}, []
    for i in sorted(used):
        remap[i] = len(out)
        s = sentences[i]
        # compact: tokens joined by "|", pinyin syllables space-separated per token
        out.append({
            "z": "|".join(t[0] for t in s["z"]),
            "y": "|".join(t[1] if len(t) > 1 else "" for t in s["z"]),
            "e": s["e"],
            "a": s["a"],
            "h": s["_h"] if s["_h"] < 10 else 0,
        })
    examples = {k: [remap[i] for i in v] for k, v in examples.items()}
    print(f"sentences: {len(raw)} candidates, {len(out)} kept; {len(examples)} words with examples", file=sys.stderr)
    return out, examples


def build_chars(cache, words, top, ced, char_levels):
    mmah = {}
    with open(fetch(cache, "mmah-dictionary.txt"), encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            mmah[d["character"]] = d
    needed = set()
    for w in list(words) + [t for t in top if "w" in t]:
        needed.update(ch for ch in w["w"] if HAN.match(ch))
    needed.update(char_levels)
    out = {}
    for ch in sorted(needed):
        rec = {}
        if ch in char_levels:
            rec["l"] = char_levels[ch]
        entries = [e for e in ced.get(ch, []) if e["py"][:1].islower()] or ced.get(ch, [])
        glosses, readings = [], []
        for e in entries:
            d, _ = cedict.clean_defs(e["defs"])
            py = numeric_to_marked(e["py"])
            if py not in readings:
                readings.append(py)
            if d and len(glosses) < 3:
                text = "; ".join(x for x in d[:4] if not x.startswith("(bound form) (")) or d[0]
                text = text.replace("(bound form) ", "")
                if len(text) > 90:
                    text = text[:90].rsplit(";", 1)[0]
                glosses.append(f"{py}: {text}" if len(entries) > 1 else text)
        m = mmah.get(ch, {})
        if not readings and m.get("pinyin"):
            readings = m["pinyin"]
        rec["p"] = readings[:4]
        rec["g"] = glosses or ([m["definition"]] if m.get("definition") else [])
        if m.get("radical"):
            rec["r"] = m["radical"]
        dec = m.get("decomposition", "")
        comps = [c for c in dec if HAN.match(c) or c in "⺈⺊⺌⺍⺗⺮⺶⺼⻊⻌⻏⻖⺡⺘⺅⺉⺧⺪⺫⺬⺭⺯⺰⺱⺲⺸⺹⻀⻂⻃⻄⻅⻆⻇⻈⻉⻋⻍⻎⻐⻑⻒⻓⻔⻕⻗⻘⻙⻚⻛⻜⻝⻞⻟⻠⻡⻢⻣⻤⻥⻦⻧⻨⻩⻪⻫⻬⻭⻮⻯⻰⻱⻲⻳"]
        if comps and dec != "？":
            rec["k"] = comps
        ety = m.get("etymology")
        if ety:
            e = {"t": ety.get("type", "")[:1]}  # p=pictophonetic / i=ideographic / p… see below
            e["t"] = {"pictophonetic": "s", "ideographic": "i", "pictographic": "p"}.get(ety.get("type"), "")
            if ety.get("hint"):
                e["h"] = ety["hint"]
            if ety.get("semantic"):
                e["m"] = ety["semantic"]
            if ety.get("phonetic"):
                e["f"] = ety["phonetic"]
            rec["e"] = e
        out[ch] = rec
    return out


if __name__ == "__main__":
    main()
