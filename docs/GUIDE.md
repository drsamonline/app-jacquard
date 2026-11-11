# Jacquard — user guide

**Version 1.0.0 · PolyForm Noncommercial 1.0.0**

A tiny virtual machine with a loom's soul: 27 two-byte opcodes, 16 registers, four flags, a
256-byte memory map, and peripherals as host callbacks. The page shows you the registers, the flags,
the program bytes, scratch RAM, and a **weave strip** that lights up the instruction the program
counter is standing on.

## Running a program

`leave-now` ships with the app: notify ten minutes before the next calendar event, unless you are
already at the office. It exercises a peripheral read, a comparison, a signed branch and an output,
and all four of its paths are asserted.

```
        IN  OFFICE_INSIDE
        CMP R0, R15          ; R15 is 0 here
        JNZ done             ; already there -> say nothing
        IN  NEXT_EVENT_MIN
        MOV R1, R0           ; R1 = minutes to the event
        LDI 10
        MOV R2, R0           ; R2 = 10
        CMP R1, R2
        JG  done             ; more than 10 minutes -> wait
        LDI 1
        OUT NOTIFY           ; leave now
done:   HLT
```

## What is proven

**118 assertions** — 102 for the engine and 16 that drive the page. The failure behaviour is
asserted rather than promised: see *What it refuses to do* in the [README](../README.md), which lists
each refusal next to the test that holds it.

## One honest note on the count

There are **27 opcodes**, not 28. The specification's own summary line says 28; the opcode table
defines 27, and 27 are implemented. Nothing was invented to close the gap.

## Run it

From a USB stick, a laptop or a phone — it is one page with no dependencies. Open it in a browser.

## Licence

PolyForm Noncommercial 1.0.0. See [LICENSE](../LICENSE).
