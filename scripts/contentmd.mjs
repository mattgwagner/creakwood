// Builds CONTENT.md (every Level 2 passage with its questions, answers and skill tags) from the game data.
// Usage: node scripts/contentmd.mjs          writes CONTENT.md
//        import { buildContentMd }           used by contentcheck to fail when CONTENT.md is stale
import { writeFileSync } from "node:fs";
import { loadContent, optText, isRight } from "./content.mjs";

export function buildContentMd(C = loadContent()) {
  const { CASES, SKILLS, LEVELS, parsePassage, wordCount, plainText } = C;
  const L = [];
  const counts = {};
  for (const c of CASES) for (const s of c.scenes) {
    for (const q of s.clue.qs) counts[q.skill] = (counts[q.skill] || { core: 0, extra: 0 }), counts[q.skill][q.extra ? "extra" : "core"]++;
    if (s.doors) (counts[s.doors.skill] ||= { core: 0, extra: 0 }).core++;
  }
  L.push("# Creakwood: reading content", "");
  L.push("_Generated from `public/index.html` by `node scripts/contentmd.mjs`. Do not edit by hand; `npm run check` fails if this file is stale._", "");
  L.push("Every passage is shown at **Level 2** (grade 3, the default). Each one also has a shorter Level 1 and a longer Level 3 version in the game; the content check confirms that every sentence a question points at exists in all three.", "");
  L.push("How to read this file:", "");
  L.push("- **✔** marks the right option. The game shuffles the order.");
  L.push("- **Part B** is the evidence tap: the player taps the sentence in the passage that proves the Part A answer. The accepted sentence(s) are quoted.");
  L.push("- **Hint** is what Wick says after a wrong first answer. A second wrong answer shows the right answer with the proving sentence lit up.");
  L.push("- **Extra** questions are only asked when the player missed that skill earlier in the case (one per clue, if available).");
  L.push("- __Underlined__ words in passages are the vocabulary words.", "");
  L.push("## Questions per skill", "", "| Skill | Core | Extra | Total |", "|---|---|---|---|");
  let tc = 0, te = 0;
  for (const k of Object.keys(SKILLS)) { const v = counts[k] || { core: 0, extra: 0 }; tc += v.core; te += v.extra; L.push(`| ${SKILLS[k]} | ${v.core} | ${v.extra} | ${v.core + v.extra} |`); }
  L.push(`| **All** | **${tc}** | **${te}** | **${tc + te}** |`, "", "Door choices count as inference questions. Part B evidence taps are counted separately on the Grown-ups screen.", "");
  L.push("## Word counts", "", "| Passage | L1 | L2 | L3 |", "|---|---|---|---|");
  for (const c of CASES) for (const s of c.scenes) L.push(`| ${c.id}.${c.scenes.indexOf(s) + 1} ${s.clue.title} | ${[1, 2, 3].map(l => wordCount(parsePassage(s.clue["l" + l]))).join(" | ")} |`);
  L.push("", `Bands: ${[1, 2, 3].map(l => `Level ${l} ${LEVELS[l].min}–${LEVELS[l].max}`).join(", ")} words.`, "");

  const md = s => plainText(s).replace(/_(\w+)_/g, "$1");
  const renderPassage = p => {
    const out = [];
    let col = 0;
    for (const b of p.blocks) {
      if (b.t === "sep") { out.push("", "---", ""); col = b.col; continue; }
      if (b.t === "th") { out.push("", "| " + b.cells.join(" | ") + " |", "|" + b.cells.map(() => "---").join("|") + "|"); continue; }
      if (b.t === "row") { out.push("| " + b.cells.join(" | ") + " |"); continue; }
      if (b.t === "map") { out.push("", "_[Map with labels: " + b.units.map(u => u.text).join(", ") + "]_", ""); continue; }
      const text = b.units.map(u => u.text.replace(/_(\w+)_/g, "<u>$1</u>")).join(" ");
      if (b.t === "h1") out.push("", "**" + text + "**", "");
      else if (b.t === "h2") out.push("_" + text + "_", "");
      else if (b.t === "cap") out.push("> _Caption:_ " + text, "");
      else out.push(text, "");
    }
    return out.map(l => l === "" ? ">" : l.startsWith(">") ? l : "> " + l).join("\n").replace(/(>\n){2,}/g, ">\n");
  };
  const unitText = (p, key) => { const u = p.units.find(u => u.key === key); return u ? md(u.text) : `(missing ${key})`; };

  for (const c of CASES) {
    L.push(`## Case ${c.id}: ${c.title}`, "", `**Creature:** ${c.creatureName}`, "", `**Intro:** ${c.intro}`, "");
    c.scenes.forEach((s, si) => {
      const p = parsePassage(s.clue.l2);
      L.push(`### ${c.id}.${si + 1} ${s.name}: ${s.clue.title}`, "", `_${s.clue.label} (${s.clue.kind}), ${wordCount(p)} words at Level 2._`, "");
      L.push(renderPassage(p), "");
      s.clue.qs.forEach((q, qi) => {
        L.push(`**Q${qi + 1}. ${q.q}** \`${q.skill}\`${q.extra ? " _(extra)_" : ""}`, "");
        if (q.type === "order") q.items.forEach((it, i) => L.push(`${i + 1}. ${it}`));
        else q.opts.forEach(o => L.push(`- ${isRight(o) ? "✔ **" + optText(o) + "**" : optText(o)}`));
        L.push("", `_Hint:_ ${q.hint}`);
        if (q.ev) L.push("", `_Part B:_ ${(q.evq || "Tap the sentence that proves your answer.").replace(/^Part B: /, "")} Accepted: ${q.ev.map(k => `"${unitText(p, k)}"`).join(" or ")}`);
        L.push("");
      });
      if (s.doors) {
        const d = s.doors;
        L.push(`**Door choice. ${d.q}** \`${d.skill}\``, "");
        d.opts.forEach(o => L.push(`- ${o.right ? "✔ **" + o.label + "**" : o.label}`));
        L.push("", `_Hint:_ ${d.hint}`, "", `_After two misses:_ ${d.reveal}`, "");
      }
    });
    const f = c.finale;
    L.push(`### Case ${c.id} Clue Board`, "", `**${f.q}**`, "");
    f.opts.forEach(o => L.push(`- ${o.right ? "✔ **" + o.label + "**" : o.label}`));
    L.push("", `_Hint:_ ${f.hint}`, "", `**Pick the 2 clues that prove it:** ${f.proof.map(id => { const s = c.scenes.find(x => x.id === id); return `"${s.clue.title}"`; }).join(" and ")}. ${f.proofWhy}`, "", `_Proof hint:_ ${f.proofHint}`, "");
    L.push(`### Case ${c.id} unmask`, "", ...c.unmask.map(t => "> " + t + "\n>").join("\n").replace(/\n>$/, "").split("\n"), "");
  }
  return L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL("../CONTENT.md", import.meta.url).pathname;
  writeFileSync(out, buildContentMd());
  console.log("wrote", out);
}
