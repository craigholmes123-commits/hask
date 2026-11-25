"""Parse the official HSK 3.0 examination syllabus PDF (新版HSK考试大纲, CLEC, Nov 2025).

The vocabulary section prints one entry per line:

    序号 等级 词语 拼音 词性
    7 1（4） 半 bàn 数、（副）
    10 1 本1 běn 量

`等级` is the level that introduces the entry; numbers in full-width brackets are
later levels where extra senses/uses of the same word are introduced.
A trailing digit on 词语 marks a homograph (本1 / 本2 are different words).
"""
import re
import unicodedata

LEVEL_KEYS = ["1", "2", "3", "4", "5", "6", "7-9"]
EXPECTED_NEW = {"1": 300, "2": 200, "3": 500, "4": 1000, "5": 1600, "6": 1800, "7-9": 5600}

_HAN = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff"  # CJK ideograph ranges
ROW = re.compile(
    rf"^(?P<id>\d{{1,5}})\s+"
    rf"(?P<level>(?:[1-6]|7-9)(?:（[0-9\-]+）)*)\s+"
    rf"(?P<word>[{_HAN}…（）()·／/A-Za-z]+?)(?P<homo>\d)?\s+"
    rf"(?P<pinyin>[^\s{_HAN}][^{_HAN}]*?)"
    rf"(?:\s+(?P<pos>[{_HAN}、（）()][{_HAN}、（）() ]*))?\s*$"
)


def read_pages(pdf_path):
    import pypdf

    reader = pypdf.PdfReader(pdf_path)
    if reader.is_encrypted:
        reader.decrypt("")
    return [p.extract_text() or "" for p in reader.pages]


def parse_vocab(pages):
    rows, unparsed = {}, []
    for page_no, text in enumerate(pages, 1):
        lines = [l.strip() for l in text.split("\n")]
        if not lines or not lines[0].startswith("序号 等级 词语"):
            continue
        for line in lines[1:]:
            if not line or line == "汉考国际" or line.isdigit():
                continue
            line = unicodedata.normalize("NFC", line)
            m = ROW.match(line)
            if not m:
                unparsed.append((page_no, line))
                continue
            rid = int(m["id"])
            level_label = m["level"]
            level = level_label.split("（")[0]
            extra = [int(x) if x.isdigit() else x for x in re.findall(r"（([0-9\-]+)）", level_label)]
            rows[rid] = {
                "id": rid,
                "level": level,
                "extra_levels": extra,
                "word": m["word"],
                "homograph": int(m["homo"]) if m["homo"] else None,
                "pinyin": re.sub(r"\s+", " ", m["pinyin"]).strip(),
                "pos": (m["pos"] or "").replace(" ", ""),
                "page": page_no,
            }
    return rows, unparsed


def validate(rows):
    problems = []
    ids = sorted(rows)
    missing = sorted(set(range(1, 11001)) - set(ids))
    if missing:
        problems.append(f"missing ids: {missing[:20]}{'…' if len(missing) > 20 else ''} ({len(missing)})")
    counts = {k: 0 for k in LEVEL_KEYS}
    for r in rows.values():
        counts[r["level"]] = counts.get(r["level"], 0) + 1
    for k, n in EXPECTED_NEW.items():
        if counts.get(k) != n:
            problems.append(f"level {k}: {counts.get(k)} entries, expected {n}")
    return counts, problems
