/* test-node.js — the proof for Jacquard's Weft-8.
 *
 * Run: node test-node.js
 * Every assertion here runs the REAL engine in docs/play/weft8.js — the same
 * file the page loads. Nothing is mocked except the peripherals, which are host
 * callbacks by design.
 *
 * SPDX-FileCopyrightText: 2026 Dr Sohil Momin
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */
"use strict";

const W = require("./docs/play/weft8.js");

let pass = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; return; }
  failures.push(name);
  console.log("  FAIL  " + name);
}
function eq(got, want, name) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  ok(g === w, name + "  (got " + g + ", want " + w + ")");
}

function build(src) {
  const a = W.assemble(src);
  if (a.errors.length) throw new Error("assemble failed: " + JSON.stringify(a.errors));
  return a;
}
function run(src, opts, maxSteps) {
  const a = build(src);
  const h = W.host(opts || {});
  const vm = new W.VM({ rom: a.bytes, peripherals: h, rand: () => 7 });
  vm.run(maxSteps);
  return { vm, h, a };
}
function hexdump(a) {
  return a.all.map(b => "0x" + b.toString(16).toUpperCase().padStart(2, "0"));
}

/* ------------------------------------------------------------------ encoding */
console.log("encoding — two bytes, little-endian, opcode first");

{
  const a = build("LDI 0x2A\nMOV R3, R0\nHLT");
  eq(hexdump(a), ["0x00", "0x2A", "0x01", "0x30", "0x1A", "0x00"],
     "LDI 0x2A / MOV R3,R0 / HLT assembles to exactly that listing");
  eq(a.all.length, 6, "three instructions are six bytes");
}

{
  const a = build("ADD R12, R5");
  eq(hexdump(a), ["0x04", "0xC5"], "ADD R12,R5 packs both registers into the operand byte");
}

{
  const a = build("NOT R7");
  eq(hexdump(a), ["0x09", "0x70"], "NOT R7 puts the register in the high nibble");
}

{
  const a = build("JMP 0x84");
  eq(hexdump(a), ["0x0D", "0x84"], "a jump carries a full 8-bit address");
}

{
  const a = build("OUT CLOCK");
  eq(hexdump(a), ["0x17", "0xC0"], "a port name assembles to its address");
}

/* -------------------------------------------------------------- all opcodes */
console.log("the whole instruction set — all of it assembles and runs");

const ALL_OPS = `
        LDI 1
        MOV R1, R0
        MOV R2, R1
        ADD R1, R2
        SUB R1, R2
        AND R1, R2
        OR  R1, R2
        XOR R1, R2
        NOT R1
        SHL R1
        SHR R1
        CMP R1, R2
        JZ  a1
        NOP
a1:     JNZ a2
        NOP
a2:     JG  a3
        NOP
a3:     JL  a4
        NOP
a4:     JMP a5
        NOP
a5:     CALL sub
        PUSH R1
        POP R3
        IN  CLOCK
        OUT NOTIFY
        LOAD 0x80
        STORE 0x80
        RAND R4
        NOP
        HLT
sub:    RET
`;

{
  const a = W.assemble(ALL_OPS);
  eq(a.errors, [], "the all-opcode program assembles with no errors");
  const used = new Set(a.listing.filter(l => l.mnemonic && l.mnemonic.charAt(0) !== ".").map(l => l.mnemonic));
  const missing = Object.keys(W.OPCODES).filter(k => !used.has(k));
  eq(missing, [], "every one of the " + Object.keys(W.OPCODES).length + " named opcodes appears in the program");

  const h = W.host({ hour: 11 });
  const vm = new W.VM({ rom: a.bytes, peripherals: h, rand: () => 7 });
  vm.run();
  eq(vm.halted, true, "it reaches HLT");
  eq(vm.error, null, "it halts with no error");
  eq(vm.steps < 200, true, "it halts in under 200 steps (no runaway jump)");
  eq(h.notes, [11], "IN CLOCK then OUT NOTIFY delivers the hour");
}

/* --------------------------------------------------------- the branch traces */
console.log("the branches — five hand-checked traces");

function trace(name, prog, opts, expect) {
  const r = run(prog, opts);
  eq(r.vm.halted, true, name + ": halted");
  eq(r.vm.error, null, name + ": no error");
  eq(r.vm.r[3], expect, name + ": R3 is " + expect);
}

/* 1. equal operands set Z, so JZ is taken */
trace("5 vs 5 -> JZ", `
        LDI 5
        MOV R1, R0
        LDI 5
        MOV R2, R0
        CMP R1, R2
        JZ  equal
        LDI 1
        MOV R3, R0
        HLT
equal:  LDI 2
        MOV R3, R0
        HLT
`, {}, 2);

/* 2. 3 - 5 = -2, N=1 V=0, so JL is taken and JG is not */
trace("3 vs 5 -> JL", `
        LDI 3
        MOV R1, R0
        LDI 5
        MOV R2, R0
        CMP R1, R2
        JL  less
        LDI 1
        MOV R3, R0
        HLT
less:   LDI 2
        MOV R3, R0
        HLT
`, {}, 2);

/* 3. 7 - 2 = 5, N=0 V=0, so JG is taken and JL is not */
trace("7 vs 2 -> JG", `
        LDI 7
        MOV R1, R0
        LDI 2
        MOV R2, R0
        CMP R1, R2
        JG  greater
        LDI 1
        MOV R3, R0
        HLT
greater: LDI 2
        MOV R3, R0
        HLT
`, {}, 2);

/* 4. SIGNED: 0xFF is -1, and -1 < 1 even though 255 > 1 unsigned.
 *    CMP: 0xFF - 0x01 = 0xFE -> N=1, C=1 (borrow), V=0, so JL fires. */
trace("-1 vs 1 -> JL (signed, not unsigned)", `
        LDI 0xFF
        MOV R1, R0
        LDI 0x01
        MOV R2, R0
        CMP R1, R2
        JL  less
        LDI 1
        MOV R3, R0
        HLT
less:   LDI 2
        MOV R3, R0
        HLT
`, {}, 2);

/* 5. SIGNED: 127 vs -1 overflows on subtract: 0x7F - 0xFF = 0x80 -> N=1, V=1,
 *    so JG fires (N = V) and JL does not. */
trace("127 vs -1 -> JG (overflow handled)", `
        LDI 0x7F
        MOV R1, R0
        LDI 0xFF
        MOV R2, R0
        CMP R1, R2
        JG  greater
        LDI 1
        MOV R3, R0
        HLT
greater: LDI 2
        MOV R3, R0
        HLT
`, {}, 2);

/* JNZ is the complement of JZ — a loop that runs exactly five times */
{
  const r = run(`
        LDI 5
        MOV R1, R0
        LDI 0
        MOV R2, R0
loop:   LDI 1
        ADD R2, R0
        LDI 1
        MOV R5, R0
        SUB R1, R5
        JNZ loop
        MOV R3, R2
        HLT
`);
  eq(r.vm.r[3], 5, "JNZ: a counted loop runs exactly five times");
}

/* ------------------------------------------------------------- flags and ALU */
console.log("flags — carry, overflow, zero, negative");

{
  const r = run("LDI 0x7F\nMOV R1, R0\nLDI 1\nMOV R2, R0\nADD R1, R2\nHLT");
  eq(r.vm.r[1], 0x80, "127 + 1 wraps to 0x80");
  eq(r.vm.flags.V, true, "127 + 1 sets overflow");
  eq(r.vm.flags.N, true, "127 + 1 sets negative");
  eq(r.vm.flags.C, false, "127 + 1 does not carry out");
}
{
  const r = run("LDI 0xFF\nMOV R1, R0\nLDI 1\nMOV R2, R0\nADD R1, R2\nHLT");
  eq(r.vm.r[1], 0x00, "255 + 1 wraps to 0");
  eq(r.vm.flags.C, true, "255 + 1 carries out");
  eq(r.vm.flags.Z, true, "255 + 1 sets zero");
}
{
  const r = run("LDI 2\nMOV R1, R0\nLDI 5\nMOV R2, R0\nSUB R1, R2\nHLT");
  eq(r.vm.r[1], 0xFD, "2 - 5 wraps to 0xFD");
  eq(r.vm.flags.C, true, "2 - 5 borrows (carry set)");
  eq(r.vm.flags.N, true, "2 - 5 is negative");
}
{
  const r = run("LDI 0x81\nMOV R1, R0\nSHL R1\nHLT");
  eq(r.vm.r[1], 0x02, "0x81 << 1 = 0x02");
  eq(r.vm.flags.C, true, "the shifted-out bit lands in carry");
}
{
  const r = run("LDI 0x03\nMOV R1, R0\nSHR R1\nHLT");
  eq(r.vm.r[1], 0x01, "0x03 >> 1 = 0x01");
  eq(r.vm.flags.C, true, "SHR puts bit 0 in carry");
}
{
  const r = run("LDI 0x0F\nMOV R1, R0\nNOT R1\nHLT");
  eq(r.vm.r[1], 0xF0, "NOT 0x0F = 0xF0");
}
{
  const r = run("LDI 2\nMOV R1, R0\nLDI 5\nMOV R2, R0\nCMP R1, R2\nHLT");
  eq(r.vm.flags.C, true, "CMP 2 vs 5 sets carry (a borrow happened)");
  eq(r.vm.flags.N, true, "CMP 2 vs 5 is negative");
  eq(r.vm.flags.Z, false, "CMP 2 vs 5 is not zero");
}
{
  const r = run("LDI 5\nMOV R1, R0\nLDI 5\nMOV R2, R0\nCMP R1, R2\nHLT");
  eq([r.vm.flags.Z, r.vm.flags.C, r.vm.flags.N, r.vm.flags.V], [true, false, false, false],
     "CMP 5 vs 5 is zero with no carry, no negative and no overflow");
}
{
  const r = run("LDI 0x7F\nMOV R1, R0\nLDI 0xFF\nMOV R2, R0\nCMP R1, R2\nHLT");
  eq(r.vm.flags.V, true, "CMP 127 vs -1 sets overflow, which is what makes JG correct");
  eq(r.vm.r[1], 0x7F, "CMP stores nothing in Ra");
}

/* ------------------------------------------------------------ stack and CALL */
console.log("the stack — CALL/RET, PUSH/POP, and the guards");

{
  const r = run(`
        LDI 1
        CALL first
        LDI 9
        MOV R3, R0
        HLT
first:  LDI 2
        CALL second
        RET
second: LDI 3
        MOV R4, R0
        RET
`);
  eq(r.vm.halted, true, "nested CALL/RET returns to the caller and halts");
  eq(r.vm.r[4], 3, "the inner subroutine ran");
  eq(r.vm.r[3], 9, "the caller continued after both RETs");
  eq(r.vm.stack.length, 0, "the stack is empty again");
}
{
  const r = run("LDI 5\nMOV R1, R0\nLDI 6\nMOV R2, R0\nPUSH R1\nPUSH R2\nPOP R3\nPOP R4\nHLT");
  eq([r.vm.r[3], r.vm.r[4]], [6, 5], "POP returns the pushes in reverse order");
}
{
  const r = run("RET\nHLT");
  eq(r.vm.error, "RET with an empty stack", "RET on an empty stack is an error, not a crash");
}
{
  const r = run("PUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nPUSH R1\nHLT");
  eq(r.vm.error, "stack overflow", "the seventeenth push overflows a 16-deep stack");
}

/* --------------------------------------------------------------- peripherals */
console.log("the peripherals — the machine's senses");

{
  const r = run("LOAD 0xC0\nOUT 0xC5\nHLT", { hour: 14 });
  eq(r.h.notes, [14], "LOAD CLOCK then OUT NOTIFY delivers the hour (14)");
  eq(r.h.output[0], "NOTIFY 14", "the host shows it as 'NOTIFY 14'");
}
{
  const r = run("LDI 65\nOUT CLIPBOARD\nLDI 66\nOUT CLIPBOARD\nHLT");
  eq(r.h.output.join(","), "CLIPBOARD 'A',CLIPBOARD 'B'", "OUT CLIPBOARD writes characters in order");
}
{
  const r = run("IN CLOCK\nHLT", { hour: 7 });
  eq(r.vm.r[0], 7, "IN CLOCK puts the hour in the accumulator");
}
{
  const r = run("LOAD 0x90\nHLT");
  eq(r.vm.r[0], 0, "an unwritten RAM byte reads 0, and the machine says nothing");
  eq(r.vm.error, null, "reading blank RAM is not an error");
}
{
  const r = run("LDI 5\nSTORE 0x80\nLDI 0\nLOAD 0x80\nHLT");
  eq(r.vm.r[0], 5, "STORE then LOAD round-trips through scratch RAM");
}
{
  const r = run("LDI 9\nSTORE 0x10\nHLT");
  eq(r.vm.mem[0x10], W.assemble("LDI 9\nSTORE 0x10\nHLT").all[0], "a write into ROM leaves the program intact");
  ok(r.vm.log.some(l => /write to ROM/.test(l)), "and it says so rather than silently doing nothing");
}
{
  const r = run("RAND R2\nHLT");
  eq(r.vm.r[2], 7, "RAND takes its byte from the injected source, so it is testable");
}

/* ----------------------------------------------------------------- examples */
console.log("the example programs — leave-now, as the reference card promises");

const LEAVE_NOW = `
; leave-now: notify 10 minutes before the next event, unless you are already
; at the office.
        IN  OFFICE_INSIDE
        CMP R0, R15          ; R15 is always 0 here
        JNZ done             ; already at the office -> nothing to say
        IN  NEXT_EVENT_MIN
        MOV R1, R0
        LDI 10
        MOV R2, R0
        CMP R1, R2
        JG  done             ; more than 10 minutes away -> wait
        LDI 1
        OUT NOTIFY
done:   HLT
`;

{
  const a = W.assemble(LEAVE_NOW);
  eq(a.errors, [], "leave-now assembles");

  const soon = run(LEAVE_NOW, { officeInside: 0, nextEventMin: 6 });
  eq(soon.h.notes, [1], "6 minutes to the next event, not at the office: it notifies");

  const far = run(LEAVE_NOW, { officeInside: 0, nextEventMin: 25 });
  eq(far.h.notes, [], "25 minutes away: it stays quiet");

  const there = run(LEAVE_NOW, { officeInside: 1, nextEventMin: 3 });
  eq(there.h.notes, [], "already at the office: it stays quiet even with 3 minutes left");

  const edge = run(LEAVE_NOW, { officeInside: 0, nextEventMin: 10 });
  eq(edge.h.notes, [1], "exactly 10 minutes: it notifies (the boundary is inclusive)");
}

/* --------------------------------------------------------------- assembler */
console.log("the assembler — labels, .str, .byte, and refusing bad input");

{
  const a = build(".str \"AB\"\nLDI 1\nHLT");
  eq(hexdump(a), ["0x41", "0x42", "0x00", "0x01", "0x1A", "0x00"], ".str emits ASCII in place");
}
{
  const a = build(".byte 1, 0xFF, 'A'");
  eq(hexdump(a), ["0x01", "0xFF", "0x41"], ".byte takes decimal, hex and a character");
}
{
  const a = build("start:\n  JMP start\n");
  eq(a.symbols.start, 0, "a label resolves to its address");
}
{
  const a = W.assemble("LDI 1\nJMP nowhere\nHLT");
  eq(a.errors.length, 1, "an undefined label is one error");
  ok(/undefined label/.test(a.errors[0].message), "and it names the problem: " + a.errors[0].message);
  eq(a.errors[0].line, 2, "on the right line");
}
{
  const a = W.assemble("FROB R1");
  eq(a.errors.length, 1, "an unknown instruction is refused");
  ok(/unknown instruction/.test(a.errors[0].message), "with a message that says so");
}
{
  const a = W.assemble("ADD R1, R16");
  eq(a.errors.length, 1, "R16 does not exist on a 16-register machine");
  ok(/two registers/.test(a.errors[0].message), "and the message shows the right form");
}
{
  const a = W.assemble("LDI 300");
  eq(a.errors.length, 1, "an 8-bit immediate of 300 is refused");
  ok(/outside 0-255/.test(a.errors[0].message), "with the range named");
}
{
  const a = W.assemble("HLT R1");
  eq(a.errors.length, 1, "HLT takes no operand");
}
{
  const many = new Array(70).fill("NOP").join("\n");
  const a = W.assemble(many);
  eq(a.errors.length, 1, "a program longer than the 128-byte ROM is refused");
  ok(/program ROM is 128/.test(a.errors[0].message), "and the limit is stated: " + a.errors[0].message);
}
{
  const a = W.assemble("start:\nstart:\nHLT");
  eq(a.errors.length, 1, "a duplicate label is refused");
}
{
  const a = W.assemble("LDI 1\nHLT");
  eq(a.errors, [], "a clean program produces no errors at all");
}

/* --------------------------------------------------------------- the guards */
console.log("the guards — a runaway program stops, and it says why");

{
  const r = run("loop: JMP loop", {}, 50);
  eq(r.vm.error, "step limit reached (50)", "an infinite loop stops at the step limit and says so");
  eq(r.vm.steps, 50, "after exactly the number of steps it was given");
}
{
  const rom = new Uint8Array(128);
  rom[0] = 0xFF; rom[1] = 0x00;
  const vm = new W.VM({ rom: rom, peripherals: W.host() });
  vm.run();
  ok(/not an instruction: 0xFF at 0x00/.test(vm.error || ""),
     "an opcode the machine does not have is an error, not a silent zero: " + vm.error);
}

/* ------------------------------------------------------------------- wiring */
console.log("the page — it loads the engine it is tested against");

{
  const fs = require("fs");
  const html = fs.readFileSync("./docs/play/index.html", "utf8");
  ok(/<script src="weft8\.js"><\/script>/.test(html), "the page loads weft8.js");
  ok(/<script src="web-kit\.js"><\/script>/.test(html), "the page loads web-kit.js");
  ok(html.indexOf('id="src"') > 0, "the page has the assembly editor");
  ok(html.indexOf('id="refTable"') > 0, "the page has the reference card");

  const inline = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  const last = inline[inline.length - 1].replace(/^<script>/, "").replace(/<\/script>$/, "");
  let parsed = true;
  try { new Function(last); } catch (e) { parsed = false; }
  ok(parsed, "the page's own script parses");

  /* The examples the page offers must assemble on the machine it ships. */
  const start = last.indexOf("var EXAMPLES");
  const end = last.indexOf("/* ---- the reference card");
  const block = last.slice(start, end);
  const sources = block.match(/\[[\s\S]*?\]\.join\("\\n"\)/g) || [];
  ok(sources.length >= 5, "the page carries at least five example programs (" + sources.length + ")");
  sources.forEach(function (literal, i) {
    const body = literal.replace(/\.join\("\\n"\)$/, "");
    const src = eval(body).join("\n");
    const a = W.assemble(src);
    eq(a.errors, [], "example " + (i + 1) + " assembles");
  });
}

/* ------------------------------------------------------------------ summary */

/* the family — every page links back to the Loom, and the Loom to every page */
{
  const fsm = require("fs");
  const landing = fsm.readFileSync("./docs/index.html", "utf8");
  ok(landing.indexOf('id="family"') > 0, "the landing page carries the family strip");
  ok(landing.indexOf("you are here") > 0, "and marks this page as the one you are on");
  ['app-weft-puzzles', 'app-clip-loom', 'weft8-hardware', 'weft8-kit', 'weft8-classroom', 'weft8-compare'].forEach(function (slug) {
    ok(landing.indexOf("https://drsamonline.github.io/" + slug + "/") > 0, "it links to " + slug);
  });
  const readme = fsm.readFileSync("./README.md", "utf8");
  ok(readme.indexOf("The Weft-8 family") > 0, "the README carries the family table too");
  ok(readme.indexOf("you are here") > 0, "and marks this repository in it");
}

console.log("");
console.log(pass + " passed, " + failures.length + " failed");
if (failures.length) {
  console.log("failed:");
  failures.forEach(f => console.log("  - " + f));
  process.exit(1);
}
