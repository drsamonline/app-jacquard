# Jacquard

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/app-jacquard/)
[![license](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-informational)](LICENSE)

**The loom you program** — automation with a real 8-bit machine under it: a fictional CPU, the
**Weft-8**, programmed in assembly, with the device's sensors exposed as memory-mapped peripherals.
Offline, no accounts, no telemetry.

## What it is

- **The ISA.** 16 eight-bit registers (R0 is the accumulator), a FLAGS register (Z, C, N, V), and
  fixed **two-byte** instructions — the opcode, then the operand, little-endian.
- **The machine.** 256 bytes of address space: program ROM at `0x00`, scratch RAM at `0x80`,
  peripherals from `0xC0` — `CLOCK`, `LAT`, `LON`, `OFFICE_INSIDE`, `NEXT_EVENT_MIN`, `NOTIFY`,
  `CLIPBOARD`, `ACCEL`, `RNG`, `AUDIO`, `HALT`.
- **The assembler.** Labels, `.str`, `.byte`, decimal/hex/character literals, and errors that name the
  line. It refuses a program longer than the 128-byte ROM, an undefined label, `R16`, an 8-bit value of
  300 — and it says which of those it was.
- **The card.** A reference table, generated from the engine itself, so the documentation cannot drift
  from the machine.
- **The examples.** `leave-now` (notify 10 minutes before the next event, unless you are at the
  office), a counted loop, `LOAD CLOCK` → `OUT NOTIFY`, nested `CALL`/`RET`, and a signed-comparison
  trace.

## Run it

Open `docs/index.html`, or the live demo above. That is the whole app; `web-kit.js` and `weft8.js` sit
next to it, so it works from `file://` and from GitHub Pages.

## Test it

```
node test-node.js      # 102 assertions, no dependencies
```

The tests run the **real** engine in `docs/play/weft8.js` — the same file the page loads. They cover the
encoding byte-for-byte, all 27 opcodes, five hand-checked branch traces (including signed `JG`/`JL` with
overflow), carry/overflow/zero/negative, `CMP`'s own flags, the stack guards, the peripherals, the
assembler's refusals, the step limit, and that the page loads the engine and every example it offers
assembles. The suite was checked to **bite**: with `JL` rewritten to test `Z`, two traces fail; with
`CMP`'s borrow suppressed, the carry assertion fails.

## One honest note on the count

The spec says "a program using all **28** opcodes". The opcode list it names — `LDI MOV LOAD STORE ADD
SUB AND OR XOR NOT SHL SHR CMP JMP JZ JNZ JG JL CALL RET PUSH POP IN OUT RAND NOP HLT` — is **27**
instructions, and 27 is what this machine implements. Nothing was invented to reach 28.

## Licence

PolyForm Noncommercial 1.0.0. © 2026 Dr Sohil Momin. Free for any noncommercial purpose; commercial use
needs a licence from the author.
