// Prefs: display, study, audio, backup, about.
import { byHanzi, loadFile, loadMeta } from "../data.js";
import { esc } from "../pinyin.js";
import { hasClaudeVoice, hasSpeech, onVoices, playWordSound, speak } from "../speech.js";
import { exportJSON, importJSON, resetAll, setSetting, state } from "../state.js";
import { h, icon, toast } from "../ui.js";

function pickedName(voices) {
  const v = voices.find((x) => x.voiceURI === state.settings.voice) || voices[0];
  return `${v.name}${voices.length > 1 ? ` and ${voices.length - 1} more` : ""}`;
}

function field(label, control, hint) {
  const id = control.id;
  const wrap = h("div.field");
  wrap.append(h("label", { for: id, text: label }), control);
  if (hint) wrap.append(h("p.hint-text", hint));
  return wrap;
}

function select(id, options, value, onchange) {
  const s = h("select", { id });
  for (const [v, label] of options) s.append(h("option", { value: String(v), text: label }));
  s.value = String(value);
  s.addEventListener("change", () => onchange(s.value));
  return s;
}

function toggle(id, label, checked, onchange, hint) {
  const input = h("input", { type: "checkbox", id, role: "switch" });
  input.checked = checked;
  input.addEventListener("change", () => onchange(input.checked));
  const row = h("label.toggle-row", { for: id });
  row.append(h("span", h("b", label), hint ? h("small", hint) : null), input);
  return row;
}

export async function renderPrefs(root) {
  root.innerHTML = "";
  const page = h("section.page.prefs");
  root.append(page);
  page.append(h("header.page-head", { html: `<a class="back" href="#sect">${icon("left")} Sect</a><p class="eyebrow">宗门大殿 · Sect Hall</p><h1><span lang="zh-CN" class="h1-zh calli">大殿</span> Sect Hall</h1><p class="lede">Settings for sound, display, your study pace and your records.</p>` }));
  const s = state.settings;

  // audio
  const audio = h("section.card.form");
  audio.append(h("h2", "Audio"));
  const check = h("div.sound-check", { role: "status" });
  audio.append(h("p.muted.small", "Words play from recordings of a native speaker built into the app. Whole sentences use a Mandarin voice on your device."));
  audio.append(check);
  const tests = h("div.row.wrap");
  const testWord = h("button.btn.ghost.small", { type: "button", html: `${icon("sound")} Play a word: 谢谢` });
  const testSentence = h("button.btn.ghost.small", { type: "button", html: `${icon("sound")} Play a sentence` });
  tests.append(testWord, testSentence);
  audio.append(tests);
  const result = h("p.small.test-result", { role: "status", "aria-live": "polite" });
  audio.append(result);
  testWord.addEventListener("click", async () => {
    result.textContent = "Playing…";
    await loadFile("hsk1").catch(() => {});
    const w = byHanzi.get("谢谢")?.[0];
    const ok = w && (await playWordSound(w));
    result.textContent = ok
      ? "If you heard “xièxie”, word audio works. Nothing? Check the volume, and on iPhone the silent switch."
      : "Couldn't play the recording. Check your connection, then try again.";
  });
  testSentence.addEventListener("click", async () => {
    result.textContent = "Playing…";
    const ok = await speak("你好，欢迎你来学习汉语！");
    result.textContent = ok ? "If you heard a sentence, sentence audio works." : "No Mandarin voice is available here, so sentences can't be read aloud. See below.";
  });

  audio.append(toggle("pref-autoplay", "Play words automatically", s.autoplay, (v) => setSetting("autoplay", v)));
  const rate = h("input", { type: "range", id: "pref-rate", min: "0.5", max: "1.2", step: "0.05", value: String(s.rate) });
  const rateOut = h("output", { for: "pref-rate", text: `${Math.round(s.rate * 100)}%` });
  rate.addEventListener("input", () => (rateOut.textContent = `${Math.round(rate.value * 100)}%`));
  rate.addEventListener("change", () => setSetting("rate", Number(rate.value)));
  audio.append(h("div.field", h("label", { for: "pref-rate", text: "Sentence speaking speed" }), h("div.range-row", rate, rateOut)));
  const voiceSel = h("select#pref-voice");
  const voiceField = field("Sentence voice", voiceSel, "The Mandarin voices installed on this device.");
  audio.append(voiceField);
  const help = h("details.voice-help");
  help.innerHTML = `<summary>How to add a Mandarin voice for sentences</summary>
    <ul>
      <li><b>iPhone / iPad:</b> Settings → Accessibility → Spoken Content → Voices → Chinese (China mainland) → download a voice. Use Safari.</li>
      <li><b>Android:</b> use Chrome. Settings → System → Languages → Text-to-speech → Google → install the Chinese (Mandarin) voice data.</li>
      <li><b>Windows:</b> Settings → Time &amp; language → Speech → Add voices → Chinese (Simplified, China). Chrome and Edge also include online Chinese voices.</li>
      <li><b>Mac:</b> System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Chinese (China mainland).</li>
    </ul>
    <p class="muted small">Then reload this page. Inside the Claude mobile app pages can't use the phone's voices; open the app in Safari or Chrome instead.</p>`;
  audio.append(help);
  const renderCheck = (voices) => {
    const rows = [
      ["Word recordings", true, "Built in for almost every word"],
      [
        "Device Mandarin voice",
        voices.length > 0,
        voices.length ? pickedName(voices) : hasSpeech() ? "None found on this device" : "This browser can't speak",
      ],
    ];
    if (window.claude) rows.push(["Claude voice", hasClaudeVoice(), hasClaudeVoice() ? "Available as a backup" : "Not available in this view"]);
    check.innerHTML = rows
      .map(([label, ok, note]) => `<div class="sc-row"><span class="sc-dot ${ok ? "ok" : "no"}" aria-hidden="true"></span><b>${esc(label)}</b><span class="muted">${esc(note)}</span></div>`)
      .join("");
    voiceSel.innerHTML = "";
    voiceSel.append(h("option", { value: "", text: "Best available" }));
    for (const v of voices) voiceSel.append(h("option", { value: v.voiceURI, text: `${v.name} (${v.lang})` }));
    voiceSel.value = s.voice && voices.some((v) => v.voiceURI === s.voice) ? s.voice : "";
    voiceField.hidden = voices.length === 0;
    help.open = voices.length === 0 && !hasClaudeVoice();
  };
  onVoices(renderCheck);
  voiceSel.addEventListener("change", () => setSetting("voice", voiceSel.value));
  page.append(audio);

  // display
  const display = h("section.card.form");
  display.append(h("h2", "Display"));
  display.append(
    field(
      "Show Chinese as",
      select("pref-script", [["both", "汉字 + pīnyīn (both)"], ["hanzi", "汉字 characters only"], ["pinyin", "pīnyīn only"]], s.script, (v) => setSetting("script", v)),
      "Same as the switch at the top. Answers always show both.",
    ),
  );
  display.append(toggle("pref-tones", "Tone colours", s.toneColors, (v) => setSetting("toneColors", v), "Red, orange, green, blue, grey for tones 1–4 and neutral"));
  page.append(display);

  // study
  const study = h("section.card.form");
  study.append(h("h2", "Study"));
  study.append(
    field(
      "New words per day",
      select("pref-daily", [[5, "5 · gentle"], [10, "10 · steady (recommended)"], [15, "15"], [20, "20 · fast"], [30, "30 · intensive"]], s.dailyNew, (v) => setSetting("dailyNew", Number(v))),
      "Each new word adds roughly 10 reviews over the following month.",
    ),
  );
  study.append(field("Cards per session", select("pref-session", [[10, "10 · about 3 minutes"], [20, "20 · about 6 minutes"], [30, "30"], [50, "50"]], s.sessionSize, (v) => setSetting("sessionSize", Number(v)))));
  study.append(
    field(
      "Question style",
      select("pref-style", [["mixed", "Mixed (recommended)"], ["choice", "Multiple choice only"], ["flip", "Flashcards: grade yourself"]], s.answerStyle, (v) => setSetting("answerStyle", v)),
      "Mixed rotates meaning, listening, reverse and tone questions, and uses self-graded cards for words you know well.",
    ),
  );
  study.append(
    field(
      "Order within HSK levels",
      select("pref-order", [["frequency", "Most common words first"], ["official", "Syllabus order (alphabetical by pinyin)"]], s.order, (v) => setSetting("order", v)),
    ),
  );
  page.append(study);

  // data
  const data = h("section.card.form");
  data.append(h("h2", "Your progress"));
  const syncNote = h("p.muted.small");
  const st = state.sync.status;
  syncNote.textContent =
    st === "synced" || st === "syncing"
      ? "Progress is saved on this device and synced to your Claude account, so it follows you to your other devices."
      : "Progress is saved in this browser on this device. Use a backup to move it to another device.";
  data.append(syncNote);
  const row = h("div.row.wrap");
  const exportBtn = h("button.btn.ghost", { type: "button", text: "Download backup" });
  exportBtn.addEventListener("click", () => {
    const json = exportJSON();
    try {
      const blob = new Blob([json], { type: "application/json" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `hask-progress-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    } catch {
      /* fall through to the copy option */
    }
  });
  const copyBtn = h("button.btn.ghost", { type: "button", text: "Copy backup" });
  copyBtn.addEventListener("click", async () => {
    const json = exportJSON();
    try {
      await navigator.clipboard.writeText(json);
      toast("Backup copied. Paste it into a note or email to keep it.");
    } catch {
      area.value = json;
      area.hidden = false;
      area.select();
      toast("Select all and copy the text below.");
    }
  });
  const fileIn = h("input", { type: "file", id: "pref-import-file", accept: ".json,application/json", hidden: true });
  const importBtn = h("button.btn.ghost", { type: "button", text: "Restore from file", onclick: () => fileIn.click() });
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files[0];
    if (!f) return;
    try {
      importJSON(await f.text());
      toast("Progress restored and merged.");
    } catch (e) {
      toast(e.message || "That file couldn't be read.");
    }
    fileIn.value = "";
  });
  // inside the claude.ai viewer, pages can't start downloads; copying still works
  if (window.claude) exportBtn.hidden = true;
  row.append(exportBtn, copyBtn, importBtn, fileIn);
  data.append(row);
  const area = h("textarea#pref-backup-text", { rows: 4, placeholder: "Or paste a backup here and press Restore pasted text", hidden: true });
  const pasteBtn = h("button.btn.link", { type: "button", text: "Paste a backup instead" });
  const restorePaste = h("button.btn.ghost.small", { type: "button", text: "Restore pasted text", hidden: true });
  pasteBtn.addEventListener("click", () => {
    area.hidden = false;
    restorePaste.hidden = false;
    area.value = "";
    area.focus();
  });
  restorePaste.addEventListener("click", () => {
    try {
      importJSON(area.value);
      toast("Progress restored and merged.");
      area.hidden = true;
      restorePaste.hidden = true;
    } catch (e) {
      toast(e.message || "That text isn't a valid backup.");
    }
  });
  data.append(pasteBtn, area, restorePaste);

  const danger = h("div.danger");
  const resetBtn = h("button.btn.danger-btn.small", { type: "button", text: "Reset all progress…" });
  const confirmBox = h("div.confirm", { hidden: true });
  confirmBox.innerHTML = `<p>This erases every word's progress, your streak and stats. Settings are kept. Download a backup first if you might want it back.</p>`;
  const yes = h("button.btn.danger-btn.small", { type: "button", text: "Erase my progress" });
  const no = h("button.btn.ghost.small", { type: "button", text: "Keep it" });
  confirmBox.append(h("div.row", no, yes));
  resetBtn.addEventListener("click", () => {
    confirmBox.hidden = false;
    resetBtn.hidden = true;
    no.focus();
  });
  no.addEventListener("click", () => {
    confirmBox.hidden = true;
    resetBtn.hidden = false;
  });
  yes.addEventListener("click", () => {
    resetAll();
    toast("Progress erased.");
    confirmBox.hidden = true;
    resetBtn.hidden = false;
  });
  danger.append(resetBtn, confirmBox);
  data.append(danger);
  page.append(data);

  // about
  const meta = await loadMeta().catch(() => null);
  const about = h("section.card.prose.about");
  about.innerHTML = `
    <h2>About the data</h2>
    <ul class="credits">
      <li><b>Word lists, levels, pinyin, parts of speech:</b> 《HSK考试大纲》 HSK examination syllabus, 中外语言交流合作中心 (Center for Language Education and Cooperation), published November 2025${meta ? `; ${meta.cumulative["7-9"].toLocaleString()} entries` : ""}. Not an official product.</li>
      <li><b>English meanings:</b> <a href="https://www.mdbg.net/chinese/dictionary?page=cedict" target="_blank" rel="noopener">CC-CEDICT</a>${meta?.cedict ? ` (${esc(meta.cedict)})` : ""}, CC BY-SA 4.0, and <a href="https://github.com/bezlant/hsk-3-vocabulary" target="_blank" rel="noopener">HSKStory's curated HSK 3.0 glosses</a>, CC BY-SA 4.0.</li>
      <li><b>Word and syllable recordings:</b> <a href="https://github.com/hugolpz/audio-cmn" target="_blank" rel="noopener">audio-cmn</a>, read by Yue Tan (Shtooka project) and Chen Wang, CC BY-SA.</li>
      <li><b>Example sentences:</b> <a href="https://tatoeba.org" target="_blank" rel="noopener">Tatoeba</a> via manythings.org, CC BY 2.0 FR.</li>
      <li><b>Character parts and origins:</b> <a href="https://github.com/skishore/makemeahanzi" target="_blank" rel="noopener">Make Me a Hanzi</a>, LGPL-3.0.</li>
      <li><b>Word frequency (Top 100/200/300):</b> <a href="https://github.com/rspeer/wordfreq" target="_blank" rel="noopener">wordfreq</a> and <a href="https://github.com/hermitdave/FrequencyWords" target="_blank" rel="noopener">FrequencyWords</a> (OpenSubtitles 2018), CC BY-SA 4.0.</li>
    </ul>
    <p class="muted small">${meta ? `Data built ${esc(meta.built)}. ` : ""}Sentences are read by your device's own Mandarin voice.</p>`;
  page.append(about);
}
