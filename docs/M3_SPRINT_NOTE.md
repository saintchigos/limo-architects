# M3 Sprint Note

**Milestone:** M3 — Pipeline core
**Date:** Sunday 8 November 2026
**Scrum & Release Lead:** Katleho Motsheare (double role this week)

## Overview

This sprint delivered the M3 pipeline core for the LIMO simulator. The project
now has a working five-stage engine (IF, ID, EX, MEM, WB), a control unit that
decodes every one of the 12 Sesotho instructions into control signals, program
loading from the assembler into simulated memory, an engine-driven UI, a
hazard-free verification pass with the M4 hazard-unit contract, and an automated
test suite that runs with one command. The site is deployed to GitHub Pages and
the release is tagged `m3`.

## Done

1. **M3-A — Control unit (#22, Katleho Motsheare).**
   `src/control.js` decodes a 32-bit machine word into the full control bundle
   (`aluOp`, `aluSrc`, `branch`, `branchType`, `memRead`, `memWrite`, `regWrite`,
   `memToReg`, `pcSrc`). Illegal encodings raise `IllegalInstructionError` and
   writes to `noto` (r0) are suppressed.

2. **M3-B — Pipeline core (#23, Lebohang Lithebe).**
   `src/pipeline.js` implements the five-stage step engine with `IF/ID`, `ID/EX`,
   `EX/MEM`, and `MEM/WB` latches, branch resolution in EX, flush handling, and
   the documented WB-before-ID register-file rule.

3. **M3-C — Program loading (#24, Crispy Mars).**
   Assembled programs now load into the simulated machine and run through the
   pipeline engine instead of the M2 instruction-by-instruction preview.

4. **M3-D — Automated tests (#25, Tinotenda Knowledge Chigowe).**
   Added `tests/control_test.js` (184 checks) and `tests/pipeline_test.js`
   (72 checks) alongside the existing 43 assembler tests. `npm test` runs all
   three suites: **299 checks, all passing**.

5. **M3-E — UI wiring (#26, Mokheseng Mohasoa).**
   The interface exposes Step, Run, Pause, and Reset controls, live register and
   data-memory views, a five-stage strip, pipeline-register inspection, latch
   connectors, and engine-driven dock views.

6. **M3-F — Hazard-free guarantee + M4 contract (#27, Mokhele Motloheloa).**
   `docs/HAZARD_API.md` records the M3 hazard-free verification and defines the
   forwarding selects, load-use stall, RAW detection, priority, and branch-flush
   contract for the M4 hazard unit.

7. **M3-G — Release management (#28, Katleho Motsheare).**
   All A–F issues are closed with one owner each; the M3 pull requests are merged
   to `main`; the site is deployed to GitHub Pages; the repository is tagged
   `m3`; and this sprint note plus the release notes record the deliverables.

## Not Done

Deferred to M4, as designed in the M3 contract:

- Forwarding and load-use stall implementation (`src/hazard.js`)
- Runtime demonstration of hazard resolution and forwarding in the UI
- Richer datapath animation and full B8 test-program set (Ripes cross-check,
  usability test) — M5 scope

## Next

1. Implement `src/hazard.js` against the `docs/HAZARD_API.md` contract.
2. Wire forwarding and stall controls into the engine and UI.
3. Add `tests/hazard_test.js` to the `npm test` command.
4. Re-verify the example programs under forwarding and stalling.
5. Prepare the M4 release and sprint note.

## Who Did What

- Katleho Motsheare — M3-A control unit, M3-G sprint/release management
- Lebohang Lithebe — M3-B pipeline core
- Crispy Mars — M3-C program loading
- Tinotenda Knowledge Chigowe — M3-D automated tests
- Mokheseng Mohasoa — M3-E UI wiring
- Mokhele Motloheloa — M3-F hazard-free pass and M4 hazard-unit contract
- Katleho Motsheare — Scrum and release owner for M3 close-out

## Evidence and links

- Repository: https://github.com/saintchigos/limo-architects
- Live demo: https://saintchigos.github.io/limo-architects/
- Tagged release: https://github.com/saintchigos/limo-architects/releases/tag/m3
- Control unit: `src/control.js`
- Pipeline engine: `src/pipeline.js`
- Hazard contract: `docs/HAZARD_API.md`
- Pipeline-register model: `docs/PIPELINE_REGISTERS.md`
- Interface wireframes: `docs/WIREFRAMES.md`, `docs/wireframes/`
- Testing: `tests/assembler_test.js` (43), `tests/control_test.js` (184),
  `tests/pipeline_test.js` (72) — 299 checks, all passing (`npm test`)
- Example programs: `examples/program1_arithmetic.limo`,
  `program2_memory.limo`, `program3_loop.limo`, `program4_hazard_free.limo`,
  `test_all_instructions.limo`
- AI usage record: `AI_USE.md`

## Release status

The M3 deliverables are merged to `main`, the GitHub Pages deployment is live,
the repository is tagged `m3`, and the GitHub release links the sprint
deliverables. The only outstanding action is posting this sprint note in the
required Google Classroom workflow.
