// Turning study into visible cultivation: Qi floats, breakthrough banners, unlock sheets.
import { awardQi, checkUnlocks, realmLabel, tribulationReady } from "../game.js";
import { banner, floatText } from "../fx.js";
import { esc } from "../pinyin.js";
import { h, openSheet } from "../ui.js";

let blockedShown = false;

/** Award Qi for an action and show what happened. Returns awardQi's result. */
export function gainQi(base, anchor, opts) {
  const wasReady = tribulationReady();
  const r = awardQi(base, opts);
  floatText(`+${r.gained} 灵气`, anchor, "qi");
  if (r.stones) setTimeout(() => floatText(`+${r.stones} 灵石`, anchor, "stone"), 350);
  if (r.layers.length) {
    banner("突破 Breakthrough!", realmLabel().en, "jade");
  } else if (r.ready && !wasReady) {
    banner("渡劫 Your tribulation awaits", "Return to your cave to face the heavens", "cinnabar");
  } else if (r.blocked && !blockedShown) {
    blockedShown = true;
    banner("瓶颈 Bottleneck", "Your Qi is full. Learn new words to break through.", "gold");
  }
  return r;
}

/** Call at the start of a session so the bottleneck notice can show again. */
export function resetNotices() {
  blockedShown = false;
}

/** Grant any newly earned treasures/titles and show them. */
export function showUnlocks() {
  const fresh = checkUnlocks();
  if (!fresh.length) return;
  const box = h("div.unlocks");
  box.append(h("p.eyebrow", "机缘 · Fortune smiles on you"), h("h2", fresh.length > 1 ? "New treasures and titles" : fresh[0].type === "title" ? "A new title" : "A new treasure"));
  for (const { type, item } of fresh) {
    box.append(
      h("div.unlock-item", {
        html: `<span class="medal ${type}" lang="zh-CN">${esc(item.zh.slice(0, type === "title" ? 2 : 1))}</span>
          <div><b><span lang="zh-CN">${esc(item.zh)}</span> ${esc(item.name)}</b>
          <span class="muted small">${esc(type === "treasure" ? item.effect : "Title: shown in your cave. Change it in the Treasury.")}</span></div>`,
      }),
    );
  }
  openSheet(box, { label: "Rewards" });
}
