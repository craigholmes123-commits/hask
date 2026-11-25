# Hask 汉语

A simplified-Chinese study app built on the **official HSK 3.0 word lists** (the HSK examination syllabus published in November 2025, used for exams since July 2026), plus the **Top 100 / 200 / 300 most common words**. It runs in any modern browser, installs to a phone's home screen, and works offline.

## What's inside

- **All 11,000 HSK 3.0 entries**, levels 1–6 plus the shared 7–9 band, parsed directly from the official syllabus PDF: 300 · 200 · 500 · 1,000 · 1,600 · 1,800 · 5,600 new words per level (cumulative 300 / 500 / 1,000 / 2,000 / 3,600 / 5,400 / 11,000). Official pinyin, parts of speech and homograph numbers (本1 / 本2) are kept.
- **Top 100 / 200 / 300**: the most common words, ranked by a blend of conversational frequency (film and TV subtitles) and general text. The Top 100 cover about 31% of the words in everyday Chinese text and the Top 300 about 42%.
- **汉字 / pīnyīn switch** in the header: show characters + pinyin, characters only, or pinyin only, everywhere in the app. After you answer, both scripts always appear.
- **Spaced repetition** (SM-2 with learning steps): reviews come back just before you'd forget them. A word becomes *known* (熟 seal) once its interval reaches three weeks.
- **Five question types**, rotated as a word matures: meaning, listening, reverse (English → Chinese), tone choice, and self-graded flashcards.
- **New-word cards** with tone-coloured characters in 田字格 practice squares, audio (normal and slow), how each character is built (meaning part + sound part), and an example sentence.
- **Word pages**: all meanings, measure words, character breakdowns, words that share a character, and up to three example sentences with per-word pinyin.
- **Practice drills**: Tone trainer (tone pairs by ear), Listening, Sentences (only sentences made of words you've studied), Speed round, Tricky words.
- **Guide**: habits that speed learning up, tones with pitch-contour diagrams and audio, pinyin sounds that surprise English speakers, tone-change rules, the HSK 3.0 table and a realistic timeline.
- **Progress** saved on the device, with backup and restore. When the app runs as a claude.ai artifact, progress also syncs between devices.

Audio uses the device's own Mandarin text-to-speech voice. If none is installed, Prefs → Audio explains how to add one on iPhone, Android and Windows.

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
js/state.js                  settings, progress, local storage, optional cloud sync
js/data.js                   deck loading, search, word families
js/views/*.js                Today, Words, Study session, Practice, Guide, Prefs
data/*.json                  generated vocabulary, sentences, characters
tools/build_data.py          regenerates data/ from the original sources
tests/*.test.mjs             unit + data-integrity tests (npm test)
sw.js, manifest.webmanifest  offline support and install metadata
```

## Rebuilding the data

```
pip install -r tools/requirements.txt
npm run build-data          # downloads sources into tools/.cache, writes data/
npm test
```

The build parses the syllabus PDF, checks that all 11,000 entries and the official per-level counts are present, aligns every pinyin syllable with its character, matches English definitions to the official reading, and picks example sentences that use the easiest possible surrounding words. It fails loudly if the syllabus can't be parsed exactly.

## Sources and licences

| Data | Source | Licence |
|---|---|---|
| Word lists, levels, pinyin, parts of speech | 《HSK考试大纲》 HSK examination syllabus, 中外语言交流合作中心 (CLEC), Nov 2025 (PDF revision Oct 2026) | © CLEC. This app is not affiliated with or endorsed by CLEC or Chinese Testing International |
| English definitions | [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cedict) | CC BY-SA 4.0 |
| Curated learner glosses | [HSKStory hsk-3-vocabulary](https://github.com/bezlant/hsk-3-vocabulary) | CC BY-SA 4.0 |
| Example sentences | [Tatoeba](https://tatoeba.org) via [manythings.org](https://www.manythings.org/anki/) | CC BY 2.0 FR |
| Character decomposition and origins | [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) `dictionary.txt` | LGPL-3.0 |
| App icon stroke outlines | Make Me a Hanzi `graphics.txt` (Arphic fonts) | Arphic Public License |
| Word frequency | [wordfreq](https://github.com/rspeer/wordfreq) and [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles 2018) | CC BY-SA 4.0 |

Because the definitions are share-alike, the generated files in `data/` are CC BY-SA 4.0 (with `data/chars.json` also under LGPL-3.0).
