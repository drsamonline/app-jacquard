/* tests/page-smoke.js — the page, driven.
 *
 * test-node.js proves the ENGINE. This proves the PAGE: it boots the real
 * docs/play/index.html in jsdom with the two kit files inlined, clicks the real
 * buttons, and reads the real DOM back. It exists because a page bug that no
 * engine test could see - `vm.h` instead of `vm.peripherals`, which made "Assemble
 * & run" throw - shipped once and was caught only by driving it.
 *
 * jsdom is a TEST dependency. The app itself still has zero runtime dependencies.
 *
 * SPDX-FileCopyrightText: 2026 Dr Sohil Momin
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */
"use strict";

const fs = require("fs");
const path = require("path");

let JSDOM;
try {
  ({ JSDOM } = require("jsdom"));
} catch (e) {
  console.log("jsdom is not installed — run `npm install` first (it is a test-only dependency)");
  process.exit(2);
}

const dir = path.join(__dirname, "..", "docs", "play");
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
for (const kit of ["web-kit.js", "weft8.js"]) {
  const code = fs.readFileSync(path.join(dir, kit), "utf8");
  html = html.replace('<script src="' + kit + '"></script>', "<script>" + code + "</script>");
}

const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  beforeParse(window) {
    window.addEventListener("error", (e) => errors.push(e.message));
  }
});
const w = dom.window, d = w.document;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("PASS  " + name); return; }
  fail++;
  console.log("FAIL  " + name + (extra ? "  [" + extra + "]" : ""));
};
const click = (id) => d.getElementById(id).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const text = (id) => d.getElementById(id).textContent;

ok("the engine is loaded by the page", typeof w.Weft8 === "object");
ok("the reference card is generated (27 rows)", d.querySelectorAll("#refTable tbody tr").length === 27);
ok("all 16 registers are rendered", d.querySelectorAll("#regs .reg").length === 16);
ok("four flags are rendered", d.querySelectorAll("#flags .flag").length === 4);

/* the device controls are wired: 30 minutes out, it stays quiet; 6 minutes out,
 * it notifies. Both are read from the page's own sliders. */
click("run");
ok("no error was thrown while running", errors.length === 0, errors.join("; "));
ok("30 minutes to the next event: it halts without notifying",
   /halted after/.test(text("out")) && !/NOTIFY/.test(text("out")), text("out").slice(0, 90));

d.getElementById("nextEvent").value = "6";
d.getElementById("nextEvent").dispatchEvent(new w.Event("input", { bubbles: true }));
click("run");
ok("the device sliders reach the machine (6 minutes -> NOTIFY 1)",
   /NOTIFY 1/.test(text("out")), text("out").slice(0, 90));
ok("the weave strip lights exactly one instruction slot", d.querySelectorAll("#strip i.pc").length === 1);
ok("the program bytes are listed", /HLT/.test(text("bytes")));
ok("the byte counter is filled in", /bytes/.test(text("bytecount")));
ok("the state says the machine halted", text("state") === "halted", text("state"));

click("reset");
click("step");
ok("step reports the program counter", /pc = 0x/.test(text("out")), text("out").slice(0, 90));
ok("and the state says it is paused", text("state") === "paused", text("state"));

/* an example that does not assemble must be refused, and must not run */
d.getElementById("src").value = "FROB R1";
click("assembleOnly");
ok("a bad program is refused with its line", /line 1: unknown instruction/.test(text("out")), text("out").slice(0, 90));
ok("and the state says it does not assemble", text("state") === "does not assemble", text("state"));

click("reset");
ok("reset returns the machine to idle", text("state") === "idle", text("state"));

console.log("");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
