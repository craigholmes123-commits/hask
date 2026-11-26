// All sound in the app goes through here.
//   Words:     native-speaker recording -> device Mandarin voice -> Claude voice -> nothing
//   Sentences: device Mandarin voice -> Claude voice -> nothing
// "Device voice" is the browser's Web Speech API; "Claude voice" is the claude.ai
// artifact viewer's tts capability (Chrome/Edge tabs and the desktop app only).
import { hasRecording, playRecording, stopRecording, unlockAudio } from "./audio.js";
import { state } from "./state.js";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voices = [];
let voicesKnown = false; // has the browser reported any voices at all?
const listeners = new Set();

const PREFERRED = [/xiaoxiao/i, /tingting/i, /google.*(普通话|mandarin|中国)/i, /yaoyao|huihui|kangkang|yunxi/i, /meijia|lili/i];

function isMandarin(v) {
  const lang = (v.lang || "").toLowerCase().replace("_", "-");
  return lang.startsWith("zh-cn") || lang === "zh" || lang.startsWith("cmn") || lang.startsWith("zh-hans") || lang === "zh-sg";
}

function refresh() {
  if (!synth) return;
  const all = synth.getVoices() || [];
  voicesKnown = voicesKnown || all.length > 0;
  voices = all.filter(isMandarin);
  if (!voices.length) voices = all.filter((v) => (v.lang || "").toLowerCase().startsWith("zh") && !/hk|yue|tw/i.test(v.lang));
  for (const fn of listeners) fn(voices);
}

if (synth) {
  refresh();
  synth.addEventListener?.("voiceschanged", refresh);
  // Safari and some Android browsers fill the list late and may not fire the event
  for (const ms of [300, 1000, 2500]) setTimeout(refresh, ms);
}
if (typeof document !== "undefined") unlockAudio();

export function onVoices(fn) {
  listeners.add(fn);
  fn(voices);
  return () => listeners.delete(fn);
}

export function hasSpeech() {
  return !!synth;
}

export function mandarinVoices() {
  return voices;
}

/** Device voice usable? If the browser lists no voices at all yet, try anyway with lang zh-CN. */
export function canSpeakMandarin() {
  if (!synth) return false;
  if (!voices.length) refresh();
  return voices.length > 0 || !voicesKnown;
}

function pickVoice() {
  const wanted = state.settings.voice;
  if (wanted) {
    const v = voices.find((x) => x.voiceURI === wanted || x.name === wanted);
    if (v) return v;
  }
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name));
    if (v) return v;
  }
  return voices.find((v) => v.localService) || voices[0] || null;
}

function deviceSpeak(text, { rate, slow = false } = {}) {
  if (!synth || !text) return Promise.resolve(false);
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "zh-CN";
    const base = rate ?? state.settings.rate ?? 0.8;
    u.rate = slow ? Math.max(0.4, base * 0.6) : base;
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
    u.onend = () => finish(true);
    u.onerror = (e) => finish(e && e.error === "interrupted");
    synth.speak(u);
    // Safari sometimes never fires onend
    setTimeout(() => finish(true), 1500 + text.length * 600);
  });
}

// ---------- Claude voice (claude.ai artifact viewer) ----------
let claudeTts = null;
export async function initClaudeVoice() {
  const claude = typeof window !== "undefined" ? window.claude : null;
  if (!claude || typeof claude.use !== "function") return;
  try {
    claudeTts = await claude.use("tts");
  } catch {
    claudeTts = null;
  }
  for (const fn of listeners) fn(voices);
}

export function hasClaudeVoice() {
  return !!claudeTts;
}

async function claudeSpeak(text, { slow = false } = {}) {
  if (!claudeTts || !text) return false;
  try {
    await claudeTts.speak(text, { language: "zh-CN", rate: slow ? 0.7 : 0.9 });
    return true;
  } catch (e) {
    // the viewer turned reading aloud off, or it isn't offered here: stop using it
    if (e && (e.code === "not_granted" || e.code === "unavailable")) claudeTts = null;
    return e && e.code === "stopped";
  }
}

function stopClaude() {
  try {
    claudeTts?.stop?.();
  } catch {
    /* nothing playing */
  }
}

// ---------- public API ----------
/** Can this word be heard at all here? */
export function canPlayWord(word) {
  return hasRecording(word) || canSpeakMandarin() || hasClaudeVoice();
}

/** Can whole sentences be heard here? */
export function canSpeakSentences() {
  return canSpeakMandarin() || hasClaudeVoice();
}

/** Play a word: recording first, then a synthetic voice. Resolves true if something played. */
export async function playWordSound(word, opts = {}) {
  if (!word) return false;
  stopSpeaking();
  if (hasRecording(word) && (await playRecording(word, opts))) return true;
  if (canSpeakMandarin()) return deviceSpeak(word.w, opts);
  if (hasClaudeVoice()) return claudeSpeak(word.w, opts);
  return false;
}

/** Speak any Chinese text (sentences). */
export async function speak(text, opts = {}) {
  stopRecording();
  if (canSpeakMandarin()) return deviceSpeak(text, opts);
  if (hasClaudeVoice()) return claudeSpeak(text, opts);
  return false;
}

export function stopSpeaking() {
  synth?.cancel();
  stopRecording();
  stopClaude();
}
