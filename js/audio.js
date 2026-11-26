// Native-speaker recordings (audio-cmn, CC BY-SA), packed into mp3 files.
// A word carries "a": [file, byteOffset, byteLength] for a whole-word recording,
// or "as": [[file, offset, length], ...] for its syllables played in sequence.
// Clips are byte-sliced from the packed file and played through one reusable
// <audio> element; where the page isn't allowed blob:/data: media (some
// sandboxed viewers), it falls back to the Web Audio API.

const packs = new Map(); // file name -> Promise<ArrayBuffer>
let el = null;
let ctx = null;
let mode = "blob"; // blob -> data -> webaudio, downgraded on failure
let token = 0;
let currentUrl = null;
let currentSource = null;

function audioEl() {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
  }
  return el;
}

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function hasRecording(word) {
  return !!(word && (word.a || (word.as && word.as.length)));
}

function loadPack(name) {
  if (!packs.has(name)) {
    const p = fetch(`audio/${name}.mp3`).then((r) => {
      if (!r.ok) throw new Error(`audio ${name}: ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => packs.delete(name));
    packs.set(name, p);
  }
  return packs.get(name);
}

/** Start downloading the packed files behind these words (no playback). */
export function prefetch(wordList, limit = 3) {
  const names = new Set();
  for (const w of wordList) {
    if (w.a) names.add(w.a[0]);
    else if (w.as) w.as.forEach((r) => names.add(r[0]));
    if (names.size >= limit) break;
  }
  for (const n of names) loadPack(n).catch(() => {});
}

async function clipBytes(refs) {
  const parts = await Promise.all(refs.map(async ([name, off, len]) => new Uint8Array(await loadPack(name), off, len)));
  if (parts.length === 1) return parts[0];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function playElement(src, slow) {
  return new Promise((resolve, reject) => {
    const a = audioEl();
    a.onended = () => resolve(true);
    a.onerror = () => reject(Object.assign(new Error("media error"), { name: "MediaError" }));
    a.src = src;
    a.preservesPitch = true;
    a.playbackRate = slow ? 0.7 : 1;
    const p = a.play();
    if (p && p.catch) p.catch(reject);
  });
}

async function playWebAudio(bytes) {
  const c = audioCtx();
  if (!c) throw new Error("no Web Audio");
  if (c.state === "suspended") await c.resume().catch(() => {});
  const buf = await c.decodeAudioData(bytes.slice().buffer);
  return new Promise((resolve) => {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.onended = () => resolve(true);
    currentSource = src;
    src.start();
  });
}

/**
 * Play a word's recording. Resolves true when it played, false when it couldn't
 * (no recording, offline and not cached, or the browser blocked playback).
 */
export async function playRecording(word, { slow = false } = {}) {
  const refs = word.a ? [word.a] : word.as;
  if (!refs || !refs.length) return false;
  const my = ++token;
  stopRecording(false);
  let bytes;
  try {
    bytes = await clipBytes(refs);
  } catch {
    return false;
  }
  if (my !== token) return true; // a newer request took over
  while (true) {
    try {
      if (mode === "blob") {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
        return await playElement(currentUrl, slow);
      }
      if (mode === "data") return await playElement("data:audio/mpeg;base64," + toBase64(bytes), slow);
      return await playWebAudio(bytes);
    } catch (e) {
      if (e && e.name === "NotAllowedError") return false; // needs a tap first; try again on the next one
      if (e && e.name === "AbortError") return true; // interrupted by a newer clip
      if (mode === "blob") mode = "data";
      else if (mode === "data") mode = "webaudio";
      else return false;
    }
  }
}

export function stopRecording(bump = true) {
  if (bump) token++;
  if (el && !el.paused) el.pause();
  if (currentSource) {
    try {
      currentSource.stop();
    } catch {
      /* already stopped */
    }
    currentSource = null;
  }
}

/** 50 ms of silence as a WAV file (mono, 8 kHz, 8-bit). */
function silentWav() {
  const n = 400;
  const b = new DataView(new ArrayBuffer(44 + n));
  const str = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n, true);
  str(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 8000, true);
  b.setUint16(32, 1, true);
  b.setUint16(34, 8, true);
  str(36, "data");
  b.setUint32(40, n, true);
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128);
  return b.buffer;
}

/** iOS and some webviews only allow sound after a tap: prime both players on the first one. */
export function unlockAudio() {
  const handler = () => {
    document.removeEventListener("pointerdown", handler, true);
    document.removeEventListener("keydown", handler, true);
    const c = audioCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    try {
      const a = audioEl();
      a.muted = true;
      a.src = URL.createObjectURL(new Blob([silentWav()], { type: "audio/wav" }));
      const p = a.play();
      const restore = () => {
        a.pause();
        a.muted = false;
      };
      if (p && p.then) p.then(restore, restore);
      else restore();
    } catch {
      /* nothing to prime */
    }
  };
  document.addEventListener("pointerdown", handler, true);
  document.addEventListener("keydown", handler, true);
}
