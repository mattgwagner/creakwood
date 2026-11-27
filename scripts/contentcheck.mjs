// Content check: question shape, one right answer, evidence keys present at every level,
// word-count bands, Clue Board proofs, and CONTENT.md freshness. Exits 1 on any failure.
import { readFileSync, existsSync } from "node:fs";
import { loadContent, optText, isRight } from "./content.mjs";
import { buildContentMd } from "./contentmd.mjs";

const C = loadContent();
const { CASES, SKILLS, LEVELS, parsePassage, wordCount, plainText } = C;
const errs = [];
const err = (where, msg) => errs.push(`${where}: ${msg}`);
const norm = s => optText(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
const words = s => plainText(s).toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
const FAMILY = new RegExp(`\\b(${process.env.FAMILY_NAMES || "matt|wagner"})\\b`, "i");

const ids = new Set();
const perSkill = {};
const bands = { 1: [], 2: [], 3: [] };
let core = 0, extra = 0, evTaps = 0;

for (const c of CASES) {
  const sceneIds = c.scenes.map(s => s.id);
  if (c.scenes.length !== 5) err(`case ${c.id}`, `has ${c.scenes.length} scenes, want 5`);
  for (const s of c.scenes) {
    const where = s.id;
    const levels = {};
    for (const l of [1, 2, 3]) {
      const src = s.clue["l" + l];
      if (!src) { err(where, `missing level ${l}`); continue; }
      const p = parsePassage(src);
      levels[l] = p;
      const n = wordCount(p);
      bands[l].push(n);
      if (n < LEVELS[l].min || n > LEVELS[l].max) err(where, `level ${l} has ${n} words (band ${LEVELS[l].min}-${LEVELS[l].max})`);
      const seen = {};
      for (const u of p.units) if (u.key) { if (seen[u.key]) err(where, `level ${l} key "${u.key}" used twice`); seen[u.key] = 1; }
      if (/\[\[|\]\]/.test(p.units.map(u => u.text).join(" "))) err(where, `level ${l} has broken [[ ]] markup`);
      if (FAMILY.test(src)) err(where, `level ${l} contains a family name`);
    }
    const hasKey = (k, l) => levels[l] && levels[l].units.some(u => u.key === k);
    const needKeys = (keys, what) => {
      for (const k of keys || []) for (const l of [1, 2, 3]) if (!hasKey(k, l)) err(where, `${what} key "${k}" missing from level ${l}`);
    };
    const qs = s.clue.qs;
    const coreHere = qs.filter(q => !q.extra).length + (s.doors ? 1 : 0);
    if (coreHere < 2 || coreHere > 3) err(where, `${coreHere} core questions (want 2-3, door counts as one)`);
    for (const q of qs) {
      const w = `${where}/${q.id}`;
      if (ids.has(q.id)) err(w, "duplicate id"); ids.add(q.id);
      if (!SKILLS[q.skill]) err(w, `unknown skill "${q.skill}"`);
      if (!q.hint) err(w, "no hint");
      (perSkill[q.skill] ||= { core: 0, extra: 0 })[q.extra ? "extra" : "core"]++;
      q.extra ? extra++ : core++;
      if (FAMILY.test(JSON.stringify(q))) err(w, "contains a family name");
      if (q.type === "mc") {
        const right = q.opts.filter(isRight);
        if (right.length !== 1) err(w, `${right.length} right options (want exactly 1)`);
        if (q.opts.length < 3 || q.opts.length > 4) err(w, `${q.opts.length} options (want 3-4)`);
        const ns = q.opts.map(norm);
        if (new Set(ns).size !== ns.length) err(w, "duplicate options");
        if (q.opts.some(o => /all of the above|none of the above/i.test(o))) err(w, "all/none of the above");
        // Keyword-match guard: the right answer may not lift a 5-word run straight from the passage.
        const r = right[0] && words(optText(right[0]));
        if (r && r.length >= 5) for (const l of [1, 2, 3]) {
          const pw = words(levels[l].units.map(u => u.text).join(" ")).join(" ");
          for (let i = 0; i + 5 <= r.length; i++) if (pw.includes(r.slice(i, i + 5).join(" "))) { err(w, `right answer copies "${r.slice(i, i + 5).join(" ")}" from level ${l}`); break; }
        }
      } else if (q.type === "order") {
        if (q.items.length < 3 || q.items.length > 4) err(w, `${q.items.length} order items (want 3-4)`);
        if (new Set(q.items.map(norm)).size !== q.items.length) err(w, "duplicate order items");
      } else err(w, `unknown type "${q.type}"`);
      if (q.word) for (const l of [1, 2, 3]) if (!s.clue["l" + l].includes(`_${q.word}_`)) err(w, `vocab word "${q.word}" not underlined in level ${l}`);
      needKeys(q.look, "look");
      if (q.ev) { evTaps++; if (!q.ev.length) err(w, "empty ev"); needKeys(q.ev, "evidence"); }
    }
    if (s.doors) {
      const d = s.doors, w = `${where}/${d.id}`;
      if (ids.has(d.id)) err(w, "duplicate id"); ids.add(d.id);
      if (!SKILLS[d.skill]) err(w, `unknown skill "${d.skill}"`);
      (perSkill[d.skill] ||= { core: 0, extra: 0 }).core++; core++;
      const right = d.opts.filter(o => o.right);
      if (right.length !== 1) err(w, `${right.length} right doors (want exactly 1)`);
      if (d.opts.length < 2 || d.opts.length > 3) err(w, `${d.opts.length} doors (want 2-3)`);
      if (new Set(d.opts.map(o => o.label)).size !== d.opts.length) err(w, "duplicate door labels");
      if (!d.hint || !d.reveal) err(w, "door needs hint and reveal");
      needKeys(d.look, "look");
    }
  }
  const f = c.finale, w = `case ${c.id} finale`;
  if (f.opts.filter(o => o.right).length !== 1) err(w, "needs exactly one right option");
  if (!Array.isArray(f.proof) || f.proof.length !== 2 || new Set(f.proof).size !== 2) err(w, "proof must name 2 different clues");
  // Every scene's clue must be earned to finish the scene, so a proof clue is earnable iff it is a scene of this case.
  for (const id of f.proof || []) if (!sceneIds.includes(id)) err(w, `proof clue "${id}" is not a scene in this case`);
  if (!f.hint || !f.proofHint || !f.proofWhy) err(w, "needs hint, proofHint, proofWhy");
  if (!c.unmask || c.unmask.length < 3) err(`case ${c.id}`, "needs an unmask");
  if (FAMILY.test(JSON.stringify([c.intro, c.unmask, f, c.wickStart, c.scenes.map(s => [s.looks, s.creatureLine])]))) err(`case ${c.id}`, "contains a family name");
}

const mdPath = new URL("../CONTENT.md", import.meta.url).pathname;
if (!existsSync(mdPath) || readFileSync(mdPath, "utf8") !== buildContentMd(C)) err("CONTENT.md", "stale; run `node scripts/contentmd.mjs`");

const range = a => `${Math.min(...a)}-${Math.max(...a)}`;
console.log(`Content: ${CASES.length} cases, ${CASES.reduce((a, c) => a + c.scenes.length, 0)} passages, ${core} core questions + ${extra} extras, ${evTaps} Part B evidence taps`);
for (const k of Object.keys(SKILLS)) { const v = perSkill[k] || { core: 0, extra: 0 }; console.log(`  ${SKILLS[k].padEnd(26)} ${String(v.core).padStart(2)} core  ${String(v.extra).padStart(2)} extra`); }
for (const l of [1, 2, 3]) console.log(`  Level ${l} words: ${range(bands[l])} (band ${LEVELS[l].min}-${LEVELS[l].max})`);
if (errs.length) { console.error(`\nCONTENT CHECK FAILED (${errs.length}):`); for (const e of errs) console.error("  " + e); process.exit(1); }
console.log("Content check passed.");
