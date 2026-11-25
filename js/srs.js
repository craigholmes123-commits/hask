// Spaced-repetition scheduler (SM-2 family, with learning steps like Anki).
// Pure functions: no DOM, no storage. Times are epoch milliseconds.

export const MIN = 60 * 1000;
export const DAY = 24 * 60 * MIN;

export const LEARN_STEPS = [1, 10]; // minutes
export const RELEARN_STEPS = [10]; // minutes
export const GRADUATE_IVL = 1; // days
export const EASY_IVL = 4; // days
export const KNOWN_IVL = 21; // days: a word counts as "known" from here
export const MAX_IVL = 3650;
export const DAY_ROLLOVER_HOUR = 4; // a study day starts at 4 am local time

export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;
export const NEW = 0, LEARNING = 1, REVIEW = 2, RELEARNING = 3;

export function newCard() {
  return { s: NEW, due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0 };
}

/** Local study-day key (YYYY-MM-DD) with a 4 am rollover. */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts - DAY_ROLLOVER_HOUR * 60 * MIN);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Timestamp at which the current study day ends. */
export function endOfDay(ts = Date.now()) {
  const d = new Date(ts);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_ROLLOVER_HOUR, 0, 0, 0);
  if (end.getTime() <= ts) end.setDate(end.getDate() + 1);
  return end.getTime();
}

function fuzz(ivl, rand) {
  if (ivl < 2.5) return ivl;
  const spread = Math.max(1, ivl * 0.05);
  return ivl + (rand() * 2 - 1) * spread;
}

/**
 * Apply a rating to a card. Returns a NEW card object.
 * @param {object} card
 * @param {1|2|3|4} rating AGAIN | HARD | GOOD | EASY
 * @param {number} now
 * @param {() => number} rand injectable for tests
 */
export function grade(card, rating, now = Date.now(), rand = Math.random) {
  const c = { ...newCard(), ...card };
  c.reps += 1;
  c.last = now;
  if (!c.f) c.f = now;

  if (c.s === NEW || c.s === LEARNING) {
    if (rating === AGAIN) {
      c.s = LEARNING;
      c.step = 0;
      c.due = now + LEARN_STEPS[0] * MIN;
    } else if (rating === HARD) {
      c.s = LEARNING;
      const mins = LEARN_STEPS[Math.min(c.step, LEARN_STEPS.length - 1)];
      c.due = now + mins * 1.5 * MIN;
    } else if (rating === GOOD) {
      const next = c.s === NEW ? 0 : c.step + 1;
      if (next >= LEARN_STEPS.length) {
        c.s = REVIEW;
        c.step = 0;
        c.ivl = GRADUATE_IVL;
        c.due = now + c.ivl * DAY;
      } else {
        c.s = LEARNING;
        c.step = next;
        c.due = now + LEARN_STEPS[next] * MIN;
      }
    } else {
      c.s = REVIEW;
      c.step = 0;
      c.ivl = EASY_IVL;
      c.ease = Math.min(3.5, c.ease + 0.15);
      c.due = now + c.ivl * DAY;
    }
    return c;
  }

  if (c.s === RELEARNING) {
    if (rating === AGAIN) {
      c.step = 0;
      c.due = now + RELEARN_STEPS[0] * MIN;
    } else if (rating === HARD) {
      c.due = now + RELEARN_STEPS[0] * 1.5 * MIN;
    } else {
      c.s = REVIEW;
      c.step = 0;
      if (rating === EASY) c.ivl = Math.max(c.ivl + 1, c.ivl * 1.5);
      c.due = now + Math.max(1, c.ivl) * DAY;
    }
    return c;
  }

  // REVIEW
  const overdueDays = Math.max(0, (now - c.due) / DAY);
  if (rating === AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.ivl = Math.max(1, c.ivl * 0.5);
    c.s = RELEARNING;
    c.step = 0;
    c.due = now + RELEARN_STEPS[0] * MIN;
    return c;
  }
  let ivl;
  if (rating === HARD) {
    c.ease = Math.max(1.3, c.ease - 0.15);
    ivl = Math.max(c.ivl + 1, c.ivl * 1.2);
  } else if (rating === GOOD) {
    ivl = Math.max(c.ivl + 1, (c.ivl + overdueDays / 2) * c.ease);
  } else {
    c.ease = Math.min(3.5, c.ease + 0.15);
    ivl = Math.max(c.ivl + 2, (c.ivl + overdueDays) * c.ease * 1.3);
  }
  c.ivl = Math.min(MAX_IVL, fuzz(ivl, rand));
  c.due = now + c.ivl * DAY;
  return c;
}

/** A new word has just been shown to the learner: start its learning steps. */
export function introduce(card, now = Date.now()) {
  const c = { ...newCard(), ...card };
  c.s = LEARNING;
  c.step = 0;
  c.due = now;
  c.last = now;
  if (!c.f) c.f = now;
  return c;
}

/** Mark a word the learner already knows: skip learning, first review in about a month. */
export function markKnown(card, now = Date.now()) {
  const c = { ...newCard(), ...card };
  c.s = REVIEW;
  c.ivl = 30;
  c.ease = Math.max(c.ease, 2.7);
  c.due = now + c.ivl * DAY;
  c.last = now;
  if (!c.f) c.f = now;
  c.k = 1; // marked as known without study
  return c;
}

/** Is the card waiting for the learner right now? Learning cards count when due within the next 20 min. */
export function isDue(card, now = Date.now()) {
  if (!card || card.s === NEW) return false;
  if (card.s === LEARNING || card.s === RELEARNING) return card.due <= now + 20 * MIN;
  return card.due <= endOfDay(now) - 1;
}

export function isKnown(card) {
  return !!card && card.s === REVIEW && card.ivl >= KNOWN_IVL;
}

/** 'new' | 'learning' | 'review' | 'known' */
export function status(card) {
  if (!card || card.s === NEW) return "new";
  if (card.s === LEARNING || card.s === RELEARNING) return "learning";
  return isKnown(card) ? "known" : "review";
}

/** Human label for the interval a rating would produce, e.g. "10 min", "3 d", "2 mo". */
export function previewLabel(card, rating, now = Date.now()) {
  const next = grade(card, rating, now, () => 0.5);
  return formatSpan(next.due - now);
}

export function formatSpan(ms) {
  const mins = Math.round(ms / MIN);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return `${(days / 365).toFixed(1)} y`;
}
