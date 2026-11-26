# Hask 汉语

A cultivation game for learning simplified Chinese. You rise from **Qi Refining (炼气)** to **Immortal (仙人)** by mastering the **official HSK 3.0 word lists** (the HSK examination syllabus published in November 2025, used for exams since July 2026) and the **Top 100 / 200 / 300 most common words**. It runs in any modern browser, installs to a phone's home screen, and works offline.

## The cultivation game

Progress comes only from study; nothing accumulates while you're away.

| Realm | Scripture (word list) |
|---|---|
| 炼气 Qi Refining | Top 100 |
| 筑基 Foundation Establishment | HSK 1 |
| 金丹 Golden Core | HSK 2 |
| 元婴 Nascent Soul | HSK 3 |
| 化神 Spirit Transformation | HSK 4 |
| 炼虚 Void Refining | HSK 5 |
| 合体 Body Integration | HSK 6 |
| 大乘 Mahayana | HSK 7–9 |
| 仙人 Immortal | all of them |

- **洞府 Cave**: your realm and layer (1–9), a dantian ring that fills with **灵气 Qi** from every answer, and the comprehension gauge. A layer needs Qi *and* enough of the scripture's words learned (the **瓶颈 bottleneck**); Qi that overflows a bottleneck condenses into spirit stones.
- **天劫 Heavenly Tribulation**: at layer nine with 80% of the scripture learned, a 6–9 bolt quiz on the realm's words. Wrong answers are lightning strikes against your Dao Hearts. Survive to enter the next realm (the next scripture becomes your study deck); fail and lose 30% of your gathered Qi.
- **修炼 Cultivate**: the spaced-repetition session. **试炼 Trials** are the drills, and **心魔 Inner Demons** fights your most-missed words.
- **宝库 Treasury**: spend **灵石 spirit stones** on pills (double Qi, extra Dao Heart, beast growth) and on the **聚灵阵 Spirit-Gathering Array** (+10% Qi per level). Collect **法宝 treasures** and **道号 titles** earned by milestones.
- **灵兽 Spirit beast**: an egg appears after your first session, grows each day you cultivate, and hatches into an Ink Fox, Cloud Crane, Jade Rabbit or Qilin with its own bonus.
- **宗门 Sect**: three daily and two weekly missions that pay spirit stones, your cultivator's record, the **Elder's Teachings** (the learning guide) and the **Sect Hall** (settings).

## What's inside

- **All 11,000 HSK 3.0 entries**, levels 1–6 plus the shared 7–9 band, parsed directly from the official syllabus PDF: 300 · 200 · 500 · 1,000 · 1,600 · 1,800 · 5,600 new words per level (cumulative 300 / 500 / 1,000 / 2,000 / 3,600 / 5,400 / 11,000). Official pinyin, parts of speech and homograph numbers (本1 / 本2) are kept.
- **Top 100 / 200 / 300**: the most common words, ranked by a blend of conversational frequency (film and TV subtitles) and general text. The Top 100 cover about 31% of the words in everyday Chinese text and the Top 300 about 42%.
- **汉字 / pīnyīn switch** in the header: show characters + pinyin, characters only, or pinyin only, everywhere in the app. After you answer, both scripts always appear.
- **Spaced repetition** (SM-2 with learning steps): reviews come back just before you'd forget them. A word becomes *known* (熟 seal) once its interval reaches three weeks.
- **Five question types**, rotated as a word matures: meaning, listening, reverse (English → Chinese), tone choice, and self-graded flashcards.
- **Native-speaker audio** for 99.6% of the 11,000 words, built in and cached for offline use: whole-word recordings where they exist, otherwise the word's syllables read in the right tones. Sentences use the device's Mandarin voice (or Claude's voice when hosted on claude.ai).
- **New-word cards** with tone-coloured characters in 田字格 practice squares, audio (normal and slow), how each character is built (meaning part + sound part), and an example sentence.
- **Word pages**: all meanings, measure words, character breakdowns, words that share a character, and up to three example sentences with per-word pinyin.
- **Trials**: Tone (tone pairs by ear), Listening, Reading (only sentences made of words you've studied), Speed, Inner Demons (most-missed words).
- **Elder's Teachings**: how cultivation works, habits that speed learning up, tones with pitch-contour diagrams and audio, pinyin sounds that surprise English speakers, tone-change rules, the HSK 3.0 table and a realistic timeline.
- **Progress** saved on the device, with backup and restore. When the app runs as a claude.ai artifact, progress also syncs between devices.

Words play from the built-in recordings on any device. Whole sentences need a Mandarin text-to-speech voice on the device; Sect → Sect Hall → Audio has a sound check and shows how to add one on iPhone, Android, Windows and Mac.

## Running it

It's a static site with no build step.

- **GitHub Pages**: merge this branch into `main` and make sure Pages is set to deploy from `main` / root (Settings → Pages). The app is then at `https://<user>.github.io/hask/`. On a phone, open it and choose *Add to Home Screen*.
- **Locally**: `npm run serve` (or `python3 -m http.server 8000`), then open <http://localhost:8000>. It needs to be served over HTTP; opening `index.html` as a file won't load the data.

Keyboard shortcuts on desktop: `1`–`4` answer, `Enter`/`Space` continue, `R` replays audio, `K` marks a new word as already known.

## Project layout

```
index.html, css/app.css      app shell and styles
js/main.js                   routing, header switch, boot
js/srs.js                    scheduler (pure functions, unit-tested)
js/pinyin.js                 tone/pinyin helpers (unit-tested)
js/state.js                  settings, progress, game state, local storage, optional cloud sync
js/game.js                   cultivation rules: realms, Qi, bottlenecks, tribulations, shop, missions, beasts (unit-tested)
js/fx.js                     ink-wash mountains, Qi floats, lightning, banners
js/audio.js, js/speech.js    recordings, device voice and Claude voice playback
js/data.js                   deck loading, search, word families
js/views/*.js                Cave, Library, Cultivate (study), Trials, Tribulation, Treasury, Sect, Teachings, Sect Hall
data/*.json                  generated vocabulary, sentences, characters
audio/*.mp3                  packed native-speaker recordings (~200 clips per file)
tools/build_data.py          regenerates data/ and audio/ from the original sources
tests/*.test.mjs             unit + data-integrity tests (npm test)
sw.js, manifest.webmanifest  offline support and install metadata
```

## Rebuilding the data

```
pip install -r tools/requirements.txt   # also needs git and ffmpeg for the audio
npm run build-data          # downloads sources into tools/.cache, writes data/ and audio/
npm test
```

The build parses the syllabus PDF, checks that all 11,000 entries and the official per-level counts are present, aligns every pinyin syllable with its character, matches English definitions to the official reading, and picks example sentences that use the easiest possible surrounding words. It fails loudly if the syllabus can't be parsed exactly. The audio step trims silence from every recording, evens out loudness, re-encodes to one small format and packs the clips into files of about 200; add `--no-audio` to skip it.

## Sources and licences

| Data | Source | Licence |
|---|---|---|
| Word lists, levels, pinyin, parts of speech | 《HSK考试大纲》 HSK examination syllabus, 中外语言交流合作中心 (CLEC), Nov 2025 (PDF revision Oct 2026) | © CLEC. This app is not affiliated with or endorsed by CLEC or Chinese Testing International |
| English definitions | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) | CC BY-SA 4.0 |
| Curated learner glosses | [HSKStory hsk-3-vocabulary](https://github.com/bezlant/hsk-3-vocabulary) | CC BY-SA 4.0 |
| Word and syllable recordings | [audio-cmn](https://github.com/hugolpz/audio-cmn), read by Yue Tan (Shtooka project) and Chen Wang | CC BY-SA |
| Example sentences | [Tatoeba](https://tatoeba.org) via [manythings.org](https://www.manythings.org/anki/) | CC BY 2.0 FR |
| Character decomposition and origins | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) `dictionary.txt` | LGPL-3.0 |
| App icon stroke outlines | Make Me a Hanzi `graphics.txt` (Arphic fonts) | Arphic Public License |
| Word frequency | [wordfreq](https://github.com/rspeer/wordfreq) and [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles 2018) | CC BY-SA 4.0 |

Because the definitions and recordings are share-alike, the generated files in `data/` and `audio/` are CC BY-SA (with `data/chars.json` also under LGPL-3.0).
