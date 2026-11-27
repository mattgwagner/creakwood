// Plays Case 1 end to end at iPad size (1180x820), answering from window.__cw, and takes one wrong
// answer and one wrong door on purpose. ALL=1 plays all three cases. Screenshots go to argv[2].
// Usage: node e2e/play.mjs [outDir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

// playwright-core is borrowed from a sibling repo (Comic Cop resolves it the same way).
let chromium;
for (const dir of ["/home/matt/Code/comic-cop/", "/home/matt/Code/killsaws/", "/home/matt/Code/readerful/"]) {
  try { ({ chromium } = createRequire(dir)("playwright-core")); break; } catch { }
}
if (!chromium) { console.error("playwright-core not found in comic-cop, killsaws or readerful node_modules"); process.exit(1); }

const out = process.argv[2] || "/tmp/creakwood-shots";
mkdirSync(out, { recursive: true });
const ALL = !!process.env.ALL;
const url = "file://" + new URL("../public/index.html", import.meta.url).pathname + "?debug";
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => m.type() === "error" && !/fonts\.g|ERR_NAME|ERR_INTERNET|net::/.test(m.text()) && errors.push(m.text()));
// Seed a fresh player before the page loads (the game's pagehide save would overwrite storage seeded after navigation).
await page.addInitScript(() => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.clear();
  localStorage.setItem("creakwood.players", JSON.stringify({ list: [{ id: "p1", name: "" }], cur: "p1" }));
  localStorage.setItem("creakwood.v1", JSON.stringify({ settings: { level: 2, readAloud: false, sound: true }, unlocked: 1, solved: {}, sel: 1 }));
});
await page.goto(url);
await page.waitForTimeout(500);
const ev = (f, a) => page.evaluate(f, a);
// The game can move on between reading state and clicking; a missed click just means "read state again".
const tap = async sel => { try { await page.click(sel, { timeout: 2500, force: sel === "#act" }); return true; } catch { return false; } };
const wait = ms => page.waitForTimeout(ms);
const shots = new Set();
const shot = async name => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${out}/${name}.png` }); };
await shot("0-title");
await ev(() => { window.__cw.fast = 3; });

const did = { wrongAnswer: 0, wrongDoor: 0, mc: 0, evidence: 0, order: 0, doors: 0, finale: 0, extras: 0, hides: 0, freezes: 0, caught: 0 };
const cases = ALL ? [1, 2, 3] : [1];
let stall = Date.now(), lastKey = "";
const results = [];

for (const n of cases) {
  // start from the title (case 1) or the results screen (next case)
  if (n === 1) { await page.click("#startBtn"); await wait(200); await page.click("#introGo"); }
  else { await page.click("#doneNext"); await wait(200); await page.click("#introGo"); }
  await wait(300);
  let finished = false;
  for (let i = 0; i < 6000 && !finished; i++) {
    const st = await ev(() => {
      const c = window.__cw, w = c.WORLD, q = c.Q, act = document.querySelector("#act.on");
      return {
        mode: c.S.mode, s: c.RUN ? c.RUN.s : -1, earned: w.earned, doorAsk: w.doorAsk, busy: w.busy, walking: w.walking, hidden: w.hidden, hiding: w.hiding,
        cr: w.cr && { k: w.cr.k, state: w.cr.state, t: w.cr.t }, px: w.px,
        q: q && { id: q.id, type: q.type, answer: q.answer, doors: q.doors },
        got: !!document.querySelector("#clue.on #qpanel [data-got]") || !!document.querySelector("#board.on #bFoot [data-got]"),
        act: act ? act.dataset.act : "", um: document.querySelector("#unmaskCard.on") ? 1 : 0,
        caught: c.RUN ? c.RUN.caught : 0, extra: document.querySelector("#qpanel .tagl")?.textContent || "",
      };
    });
    const key = JSON.stringify([st.mode, st.s, st.earned, st.doorAsk, st.q, st.got, st.um, Math.round(st.px)]);
    if (key !== lastKey) { lastKey = key; stall = Date.now(); }
    else if (Date.now() - stall > 25000) { await page.screenshot({ path: `${out}/stall.png` }); throw new Error("STALL " + key + " " + errors.join(" | ")); }

    if (st.mode === "done") {
      await shot(`c${n}-9-results`);
      const r = await ev(() => ({ solved: window.__cw.save.solved, text: document.querySelector("#doneCard p").textContent }));
      results.push({ case: n, stars: r.solved[n], detail: r.text.trim() });
      finished = true; break;
    }
    if (st.mode === "unmask") {
      await wait(900); await shot(n === 1 ? "5-unmask" : `c${n}-unmask`);
      for (let k = 0; k < 8 && await page.$("#umNext"); k++) { await tap("#umNext"); await wait(250); if (k === 2) await shot(n === 1 ? "5-unmask-reveal" : `c${n}-unmask-reveal`); }
      continue;
    }
    if (st.mode === "board") {
      if (st.got) { await tap("#bFoot [data-got]"); await wait(300); continue; }
      if (st.q && st.q.type === "finale") {
        await wait(300); await shot(n === 1 ? "4-clue-board" : `c${n}-board`);
        await tap(`#bOpts .opt[data-i="${st.q.answer}"]`); did.finale++; await wait(1300 / 3); continue;
      }
      if (st.q && st.q.type === "proof") {
        const sel = await ev(() => [...document.querySelectorAll(".pin.sel")].map(p => +p.dataset.pin));
        for (const i of st.q.answer) if (!sel.includes(i)) await tap(`.pin[data-pin="${i}"] .k`);
        if (n === 1) await shot("4-clue-board-proof");
        await tap("[data-prove]"); await wait(300); continue;
      }
      await wait(100); continue;
    }
    if (st.mode === "card") {
      if (!st.q) { if (st.got) { await tap("#qpanel [data-got]"); await wait(250); } else await wait(100); continue; }
      if (/Bonus/.test(st.extra) && !shots.has("extra" + st.q.id)) { shots.add("extra" + st.q.id); did.extras++; }
      await shot(n === 1 ? "1-clue-card" : `c${n}-clue-card`);
      if (st.q.type === "mc") {
        const answered = await ev(() => !!document.querySelector("#qpanel .opt.right"));
        if (answered) { await wait(120); continue; }
        // The deliberate miss goes on a question whose skill has a bonus question later in the case, so the
        // Leitner "missed skill comes back" path runs too.
        const target = n === 1 && did.wrongAnswer === 0 && await ev(id => {
          const c = window.__cw.CASES[0], si = c.scenes.findIndex(s => s.clue.qs.some(q => q.id === id));
          const q = c.scenes[si].clue.qs.find(q => q.id === id);
          return !q.extra && c.scenes.slice(si + 1).some(s => s.clue.qs.some(x => x.extra && x.skill === q.skill));
        }, st.q.id);
        if (target) {
          const wrong = (st.q.answer + 1) % (await page.locator("#qpanel .opt").count());
          await tap(`#qpanel .opt[data-i="${wrong}"]`); did.wrongAnswer++; await wait(250);
          await shot("2-wrong-answer-hint");
        }
        await tap(`#qpanel .opt[data-i="${st.q.answer}"]`); did.mc++; await wait(400);
        continue;
      }
      if (st.q.type === "evidence") {
        const done = await ev(() => !document.querySelector("[data-prove]"));
        if (done) { await wait(120); continue; }
        await tap(`#ptext .u[data-u="${st.q.answer[0]}"]`); await wait(150);
        await shot(n === 1 ? "2-evidence-tap" : `c${n}-evidence`);
        await tap("[data-prove]"); did.evidence++; await wait(500); continue;
      }
      if (st.q.type === "order") {
        const done = await ev(() => !!document.querySelector("#qpanel .opt.right"));
        if (done) { await wait(120); continue; }
        for (const i of st.q.answer) { await tap(`#qpanel .opt[data-i="${i}"]`); await wait(60); }
        if (n === 1) await shot("2-order");
        did.order++; await wait(500); continue;
      }
      await wait(100); continue;
    }
    if (st.mode !== "explore" || st.busy) { await wait(100); continue; }

    // creatures: hide from the Lamplighter, freeze for Tock
    if (st.act === "HIDE!") { await tap("#act"); did.hides++; await wait(150); continue; }
    if (st.act.startsWith("FREEZE")) { await tap("#act"); did.freezes++; await wait(150); continue; }
    if (st.hidden || st.hiding) { await wait(150); continue; }
    if (st.walking) { await wait(80); continue; }
    if (st.cr && st.cr.k === "tock" && (st.cr.state !== "closed" || st.cr.t < 1.6)) { await wait(80); continue; }
    if (st.cr && st.cr.k === "lamplighter" && st.cr.state !== "away") { await wait(80); continue; }

    if (st.doorAsk) {
      await wait(300); await shot(n === 1 ? "3-door-choice" : `c${n}-doors`);
      let pick = st.q.answer;
      if (n === 1 && did.wrongDoor === 0) { pick = st.q.doors.find(d => d !== st.q.answer); did.wrongDoor++; }
      await tap(`[data-spot="door:${pick}"]`); did.doors++;
      if (pick !== st.q.answer) { await wait(900); await shot(n === 1 ? "3-door-scare" : `c${n}-door-scare`); await wait(2500); await shot("3-door-hint"); }
      continue;
    }
    if (!st.earned) {
      if (n === 1 && st.s === 0) await shot("1-explore");
      await tap('[data-spot="clue"]'); await wait(150); continue;
    }
    if (await page.$('[data-spot="exit"]')) { await tap('[data-spot="exit"]'); await wait(200); continue; }
    await wait(100);
  }
  if (!finished) throw new Error(`case ${n} did not finish`);
  did.caught += await ev(() => (window.__cw.save.run ? window.__cw.save.run.caught : 0));
}

// Grown-ups screen: back to the title, then press and hold.
await page.click("#doneTitle"); await wait(300);
const box = await page.locator("#adultBtn").boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await wait(1400); await page.mouse.up(); await wait(200);
const adultOpen = await ev(() => document.querySelector("#sAdult.on") !== null);
await shot("6-grown-ups");
const skills = await ev(() => Object.fromEntries(Object.entries(window.__cw.save.skills).map(([k, v]) => [k, `${v.ok}/${v.n}`])));

// Creature checks: hiding from the Lamplighter works, standing in his light gets you caught,
// and Tock only catches you if you move while his eyes are open.
const creatures = {};
await page.close();   // a second open page can have its animation frames throttled
const until = async (p, f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await p.evaluate(f); if (v) return v; await p.waitForTimeout(60); } return null; };
{
  const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  p.on("pageerror", e => errors.push("lamp: " + e.message));
  await p.goto(url + "&test=lamp"); await p.evaluate(() => { window.__cw.fast = 2; });
  await until(p, () => document.querySelector("#act.on")?.dataset.act === "HIDE!");
  await p.click("#act", { force: true });
  await until(p, () => window.__cw.WORLD.hidden);
  await until(p, () => window.__cw.WORLD.cr.state === "walk"); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/7-lamplighter-hide.png` });
  creatures.hidPast = await until(p, () => window.__cw.WORLD.cr.state === "away" && window.__cw.WORLD.cr.passed && window.__cw.RUN.caught === 0);
  await until(p, () => window.__cw.WORLD.cr.state === "walk", 30000);
  creatures.caughtInLight = await until(p, () => window.__cw.RUN.caught === 1);
  await p.close();
}
{
  const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  p.on("pageerror", e => errors.push("tock: " + e.message));
  await p.goto(url + "&test=tock"); await p.evaluate(() => { window.__cw.fast = 2; });
  // freeze in time: start walking as his head turns, then tap FREEZE
  await until(p, () => window.__cw.WORLD.cr.state === "closed" && window.__cw.WORLD.cr.introduced === false || window.__cw.WORLD.cr.state === "turn");
  await until(p, () => window.__cw.WORLD.cr.state === "turn");
  await p.mouse.click(900, 700);
  await until(p, () => document.querySelector("#act.on")?.dataset.act?.startsWith("FREEZE"), 3000);
  await p.screenshot({ path: `${out}/8-tock-freeze.png` });
  await p.click("#act", { force: true }).catch(() => { });
  await until(p, () => window.__cw.WORLD.cr.state === "closed", 8000);
  creatures.froze = await p.evaluate(() => window.__cw.RUN.caught === 0);
  // now walk while the eyes are open
  await until(p, () => window.__cw.WORLD.cr.state === "open");
  await p.mouse.click(250, 700);
  creatures.caughtMoving = await until(p, () => window.__cw.RUN.caught === 1, 5000);
  await p.close();
}
await browser.close();

console.log("Playthrough:", JSON.stringify(did));
console.log("Creatures:", JSON.stringify(creatures));
for (const r of results) console.log(`  Case ${r.case}: ${"★".repeat(r.stars)} ${r.detail}`);
console.log("  Grown-ups skills:", JSON.stringify(skills));
const fail = [];
if (errors.length) fail.push("page errors: " + errors.join(" | "));
if (results.length !== cases.length) fail.push("not every case finished");
if (!did.wrongAnswer || !did.wrongDoor) fail.push("did not cover the wrong answer and wrong door paths");
if (!did.evidence || !did.order || !did.finale) fail.push("missed a mechanic");
if (!adultOpen) fail.push("Grown-ups screen did not open on hold");
if (!skills.evidence) fail.push("evidence taps not recorded");
for (const [k, v] of Object.entries(creatures)) if (!v) fail.push("creature check failed: " + k);
if (fail.length) { console.error("PLAYTHROUGH FAILED:\n  " + fail.join("\n  ")); process.exit(1); }
console.log(`Playthrough passed. Screenshots in ${out}`);
