"""Package native-speaker recordings for the app.

Source: audio-cmn (https://github.com/hugolpz/audio-cmn), CC BY-SA:
  * 24k-abr/hsk/cmn-<word>.mp3      words, read by Yue Tan (Shtooka project)
  * 24k-abr/syllabs/cmn-<py><n>.mp3 every toned syllable, read by Chen Wang

Every clip is trimmed of silence, loudness-normalised and re-encoded to one
format (mono 24 kHz MP3, no tags, no Xing frame) so clips can be byte-sliced
from larger files and syllables can be joined. Clips are packed into files of
~200 clips each (audio/w<level>-<n>.mp3, audio/s-<n>.mp3); each word record
gets a reference [file, byte offset, byte length]:

  "a":  a recording of the whole word
  "as": recordings of its syllables, played in sequence (used when the word
        itself was not recorded, or when the character has several readings
        and the word recording could be the wrong one)
"""
import hashlib
import os
import shutil
import subprocess
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor

REPO = "https://github.com/hugolpz/audio-cmn.git"
CHUNK = 200
FILTER = (
    "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.04,"
    "areverse,silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.08,areverse,"
    "loudnorm=I=-18:TP=-2:LRA=11"
)
TONE_MARKS = {"\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4}


def ensure_source(cache):
    """Sparse, blob-filtered clone of audio-cmn with only the compressed word/syllable folders."""
    path = os.path.join(cache, "audio-cmn")
    if os.path.isdir(os.path.join(path, "24k-abr", "hsk")):
        return path
    print("downloading audio-cmn recordings …", file=sys.stderr)
    subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1", REPO, path], check=True)
    subprocess.run(["git", "-C", path, "sparse-checkout", "init", "--no-cone"], check=True)
    with open(os.path.join(path, ".git", "info", "sparse-checkout"), "w") as f:
        f.write("/24k-abr/hsk/\n/24k-abr/syllabs/\n")
    subprocess.run(["git", "-C", path, "checkout", "-q", "HEAD"], check=True)
    return path


def syllable_key(text, tone, citation=None):
    """('nǚ', 3) -> 'nv3'. Neutral tone uses the character's citation tone when known."""
    d = unicodedata.normalize("NFD", text.lower())
    letters = d.replace("u\u0308", "v")
    letters = "".join(c for c in letters if c.isascii() and c.isalpha())
    if tone == 5:
        tone = citation.get(letters) if citation else None
        if not tone:
            return None
    return f"{letters}{tone}"


def citation_tones(char_info):
    """{letters: tone} for a character's non-neutral readings, from chars.json data."""
    out = {}
    for py in char_info.get("p", []):
        d = unicodedata.normalize("NFD", py.lower())
        tone = next((TONE_MARKS[c] for c in d if c in TONE_MARKS), None)
        letters = "".join(c for c in d.replace("u\u0308", "v") if c.isascii() and c.isalpha())
        if tone and letters not in out:
            out[letters] = tone
    return out


def process(src, clip_cache):
    """Normalise one clip (cached by content hash). Returns processed bytes."""
    with open(src, "rb") as f:
        raw = f.read()
    h = hashlib.sha1(raw + FILTER.encode()).hexdigest()
    dst = os.path.join(clip_cache, h + ".mp3")
    if not os.path.exists(dst):
        cmd = [
            "ffmpeg", "-v", "error", "-y", "-i", src, "-af", FILTER,
            "-ar", "24000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "32k",
            "-map_metadata", "-1", "-id3v2_version", "0", "-write_id3v1", "0", "-write_xing", "0",
            "-f", "mp3", dst + ".tmp",
        ]
        subprocess.run(cmd, check=True)
        os.replace(dst + ".tmp", dst)
    with open(dst, "rb") as f:
        return f.read()


def build(words, top, chars, by_word, level_keys, cache, audio_out):
    """Attach audio references to word records (mutates them) and write packed files."""
    src = ensure_source(cache)
    word_dir = os.path.join(src, "24k-abr", "hsk")
    syl_dir = os.path.join(src, "24k-abr", "syllabs")
    have_word = {n[4:-4] for n in os.listdir(word_dir) if n.startswith("cmn-") and n.endswith(".mp3")}
    have_syl = {n[4:-4] for n in os.listdir(syl_dir) if n.startswith("cmn-") and n.endswith(".mp3")}
    clip_cache = os.path.join(cache, "audio-clips")
    os.makedirs(clip_cache, exist_ok=True)

    # characters read more than one way in the syllabus (还 hái/huán …): the single
    # recording might be the other reading, so use syllables for those
    polyphones = {w for w, recs in by_word.items() if len({r["p"] for r in recs}) > 1}

    plan_word = {}  # record id -> source path
    plan_syl = {}  # record id -> [syllable keys]
    syl_order = []  # syllables in first-use order (common words first)
    seen_syl = set()

    def plan(rec):
        w = rec["w"]
        if w in have_word and w not in polyphones:
            plan_word[id(rec)] = os.path.join(word_dir, f"cmn-{w}.mp3")
            return
        keys = []
        syl = rec["y"].split(" ")
        for i, s in enumerate(syl):
            if s == "r":  # erhua: the base syllable carries it
                continue
            tone = int(rec["t"][i]) if i < len(rec["t"]) else 5
            ch = rec["w"][i] if i < len(rec["w"]) else ""
            key = syllable_key(s, tone, citation_tones(chars.get(ch, {})))
            if not key or key not in have_syl:
                return  # not playable from syllables: the device voice will be used
            keys.append(key)
        if keys and len(keys) <= 6:
            plan_syl[id(rec)] = keys
            for k in keys:
                if k not in seen_syl:
                    seen_syl.add(k)
                    syl_order.append(k)

    ordered = list(top) + [w for lv in level_keys for w in words if w["l"] == lv]
    for rec in ordered:
        if id(rec) not in plan_word and id(rec) not in plan_syl:
            plan(rec)
    # tone-guide syllables (妈 麻 马 骂)
    for k in ("ma1", "ma2", "ma3", "ma4"):
        if k not in seen_syl and k in have_syl:
            seen_syl.add(k)
            syl_order.append(k)

    # process everything in parallel
    jobs = {}
    for rec in ordered:
        if id(rec) in plan_word:
            jobs[plan_word[id(rec)]] = None
    for k in syl_order:
        jobs[os.path.join(syl_dir, f"cmn-{k}.mp3")] = None
    print(f"audio: {len(jobs)} clips to prepare …", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=max(2, os.cpu_count() or 2)) as pool:
        for path, data in zip(jobs, pool.map(lambda p: process(p, clip_cache), list(jobs))):
            jobs[path] = data

    if os.path.isdir(audio_out):
        shutil.rmtree(audio_out)
    os.makedirs(audio_out)
    packs = {}

    def pack(name, data):
        buf = packs.setdefault(name, bytearray())
        ref = [name, len(buf), len(data)]
        buf.extend(data)
        return ref

    # words: one series of files per level (study order), top-only words separately
    syl_ref = {}
    for i, k in enumerate(syl_order):
        syl_ref[k] = pack(f"s-{i // CHUNK}", jobs[os.path.join(syl_dir, f"cmn-{k}.mp3")])
    counters = {}
    word_refs = {}
    for rec in ordered:
        path = plan_word.get(id(rec))
        if not path:
            continue
        group = rec["l"] or "t"
        if path in word_refs.get(group, {}):
            ref = word_refs[group][path]
        else:
            n = counters.get(group, 0)
            ref = pack(f"w{group}-{n // CHUNK}", jobs[path])
            counters[group] = n + 1
            word_refs.setdefault(group, {})[path] = ref
        rec["a"] = ref
    for rec in ordered:
        keys = plan_syl.get(id(rec))
        if keys:
            rec["as"] = [syl_ref[k] for k in keys]

    total = 0
    for name, buf in packs.items():
        with open(os.path.join(audio_out, name + ".mp3"), "wb") as f:
            f.write(buf)
        total += len(buf)
    stats = {
        "word_clips": sum(1 for r in ordered if "a" in r),
        "syllable_words": sum(1 for r in ordered if "as" in r),
        "none": sum(1 for r in ordered if "a" not in r and "as" not in r),
        "files": len(packs),
        "bytes": total,
    }
    print(f"audio: {stats}", file=sys.stderr)
    return {"tones": {k: syl_ref[k] for k in ("ma1", "ma2", "ma3", "ma4") if k in syl_ref}, "stats": stats}
