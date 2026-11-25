// Text-to-speech using the device's own Mandarin voice (Web Speech API).
import { state } from "./state.js";

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let voices = [];
const listeners = new Set();

const PREFERRED = [/xiaoxiao/i, /tingting/i, /google.*(普通话|mandarin|中国)/i, /yaoyao|huihui|kangkang/i, /meijia/i];

function isMandarin(v) {
  const lang = (v.lang || "").toLowerCase().replace("_", "-");
  return lang.startsWith("zh-cn") || lang === "zh" || lang.startsWith("cmn") || lang === "zh-hans" || lang.startsWith("zh-hans");
}

function refresh() {
  if (!synth) return;
  const all = synth.getVoices();
  voices = all.filter(isMandarin);
  if (!voices.length) voices = all.filter((v) => (v.lang || "").toLowerCase().startsWith("zh") && !/hk|yue|tw/i.test(v.lang));
  for (const fn of listeners) fn(voices);
}

if (synth) {
  refresh();
  synth.addEventListener?.("voiceschanged", refresh);
  if (!voices.length) setTimeout(refresh, 600);
}

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

export function canSpeakMandarin() {
  return !!synth && voices.length > 0;
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

let current = null;

/** Speak Chinese text. Resolves when finished (or immediately if speech is unavailable). */
export function speak(text, { rate, slow = false } = {}) {
  if (!synth || !text) return Promise.resolve(false);
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = v?.lang || "zh-CN";
    const base = rate ?? state.settings.rate ?? 0.8;
    u.rate = slow ? Math.max(0.4, base * 0.6) : base;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    current = u;
    synth.speak(u);
    // Safari sometimes never fires onend
    setTimeout(() => resolve(true), 1500 + text.length * 600);
  });
}

export function stopSpeaking() {
  synth?.cancel();
  current = null;
}
