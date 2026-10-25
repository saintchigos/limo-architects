# M2 Sprint Note

**Milestone:** M2 — Simulator Design & Working Assembler  
**Date:** Sunday 11 October 2026  
**Role Rotation (Week 8):**

- ISA Architect: Tinotenda Knowledge Chigowe
- Assembler Lead: Katleho Motsheare
- Pipeline Lead: Tiisetso Joseph Masemene
- Hazard-Unit Lead: Lebohang Lithebe
- Interface Lead: Motloheloa Mokhele
- Test Lead: Mokheseng Mohasoa
- Scrum & Release Lead: Tinotenda Knowledge Chigowe

## Overview

This sprint focused on defining the LIMO architecture and preparing the simulator design foundation for the next implementation milestone. The team locked the architecture, documented the microarchitecture and interface design, delivered a working assembler with a passing 43-test unit suite, and published the simulator web app live on GitHub Pages — the required M2 package, tagged `m2`.

## Done

1. ISA frozen with the required design feedback incorporated.
   - Final opcode, funct3, and funct7 assignments were confirmed.
   - The ISA specification was updated and checked against the required test-vector expectations.
   - The architecture now has a stable contract for implementation.

2. Pipeline and datapath design completed.
   - The five-stage pipeline was documented: IF, ID, EX, MEM, WB.
   - The design includes separate instruction and data memories.
   - Branch resolution was placed in EX and the stall/flush model was documented.

3. Pipeline-register contract completed.
   - `IF/ID`, `ID/EX`, `EX/MEM`, and `MEM/WB` were specified in detail.
   - Control-signal bundles, forwarding paths, and bubble semantics were recorded.
   - Hazard inputs were mapped directly to the model fields to avoid ambiguity.

4. Interface wireframes and UI layout documented.
   - The simulator UI was designed around the editor, pipeline views, control tables, register file, memory inspector, and Freshman-mode narration.
   - Mobile and desktop layout concerns were considered and accessibility rules were included.

5. Working assembler implemented with a passing unit test suite.
   - The assembler is fully implemented in `src/isa.js` and `src/assembler.js`: all 12 mnemonics across the R/I/S/B formats, labels and branch resolution, Sesotho orthography and register digraphs (`ts'`, `ch'`), decimal/hex immediates, and plain-language errors with line numbers.
   - The unit test suite in `tests/assembler_test.js` (`npm test`, B8(i)) passes 43/43. It covers hand-encoded ISA verification vectors, every instruction class, label/branch offsets, and error reporting.
   - The build specification was prepared as part of the project baseline.

6. Simulator web app published and live on GitHub Pages.
   - The site at https://saintchigos.github.io/limo-architects/ serves the full app: the `.limo` editor, five-stage pipeline view, register file and data-memory inspectors, and the Machine Code inspector tab (verified rendering on 25 October 2026).
   - Deployment was completed with the `style.css` / `src/app.js` fix and the Machine Code inspector wiring, so the live demo reflects the tagged `m2` code.

7. Project documentation and AI-use tracking completed.
   - The required design documents live in `docs/`.
   - AI use was recorded in `AI_USE.md`.

8. M2 release tagged, published, and repo housekeeping completed.
   - The repository is tagged `m2` and the GitHub release was published on 25 October 2026 with the full m1→m2 changelog (PRs #16–#21).
   - M2 documentation, design files, test suite, and example programs are present in the repository.

## Not Done

The following items remain deferred to M3 / M4:

- Full step-by-step execution engine for a running compiler-to-simulator pipeline
- Dynamic live wire animation and richer runtime visualisation
- Full interactive hazard and forwarding demonstration during execution
- Advanced UI polish beyond the required M2 simulator design baseline

## Next

For the next milestone, the team should focus on:

1. Implementing the actual pipeline execution engine (`pipeline.js` / simulator logic)
2. Connecting the assembler output to machine memory and register state
3. Enabling Step, Run, Pause, and Reset operation
4. Validating hazard-free execution and forwarding behaviour
5. Preparing the M3 runtime UI for live instruction flow and stage-state display

## Who Did What

- Tinotenda Knowledge Chigowe: ISA architecture and release leadership
- Katleho Motsheare: assembler and specification support
- Tiisetso Joseph Masemene: pipeline design and architecture documentation
- Lebohang Lithebe: hazard and control-path design
- Motloheloa Mokhele: interface wireframes and user experience structure
- Mokheseng Mohasoa: testing and validation support
- Tinotenda Knowledge Chigowe: Scrum and release owner for M2 close-out

## Evidence and links

- Repository: https://github.com/saintchigos/limo-architects
- Live demo: https://saintchigos.github.io/limo-architects/ (verified live on 25 October 2026)
- Tagged release: https://github.com/saintchigos/limo-architects/releases/tag/m2
- Design docs:
  - `docs/M2_SIMULATOR_DESIGN.md`
  - `docs/PIPELINE_REGISTERS.md`
  - `docs/LIMO_BUILD_SPEC.md`
  - `docs/LIMO_ISA_Specification.md`
- Assembler, ISA, and web app:
  - `src/isa.js`
  - `src/assembler.js`
  - `src/app.js`
  - `index.html`, `style.css`
- Testing:
  - `tests/assembler_test.js` — 43 tests, all passing (`npm test`)
- Example programs: `examples/program1_arithmetic.limo`, `program2_memory.limo`, `program3_loop.limo`, `test_all_instructions.limo`
- AI usage file: `AI_USE.md`

## Release status

This sprint produced the required M2 design package and release candidate state for the project. All remaining release actions from the sprint close-out are complete: the repository is tagged `m2` at commit `7216a15` and the GitHub release has been published. The only outstanding item is confirming the sprint note submission in the required classroom workflow.

## Revision note

Revised 25 October 2026 to record the verified end-of-sprint state: the assembler and its 43-test unit suite pass (`npm test`), the GitHub Pages site is live and rendering the full app, and the `m2` tagged release is published. The assembler test work also satisfies the assembler-portion of B8(i); the full B8 test program set (≥8 programs, Ripes cross-check, usability test) remains M5 scope.

