# M2 Milestone PDF Draft

## M2 - Simulator Design & Working Assembler

**Team:** Architects  
**Course:** CS3520 — Computer Organisation and Architecture  
**Milestone:** M2  
**Submission Date:** Sunday 23:59  
**Role Rotation (Week 8):**

- ISA Architect: Tinotenda Knowledge Chigowe
- Assembler Lead: Katleho Motsheare
- Pipeline Lead: Tiisetso Joseph Masemene
- Hazard-Unit Lead: Lebohang Lithebe
- Interface Lead: Motloheloa Mokhele
- Test Lead: Mokheseng Mohasoa
- Scrum & Release Lead: Tinotenda Knowledge Chigowe

---

## 1. Goal

The M2 milestone focused on finalising the LIMO ISA, delivering the simulator design baseline, and producing the required project documentation. The most important deliverables were the frozen ISA, the simulator architecture, the hazard and control model, the interface wireframes, and a fully working assembler with a passing unit test suite, published live on GitHub Pages.

---

## 2. Summary of Work Completed

### 2.1 ISA and architecture freeze

The team completed the ISA freeze and aligned the design with the project specification. The architecture reflects a Sesotho-language RISC-V-derived instruction set with a five-stage pipeline design and clear separation between architectural state and microarchitectural implementation details.

Completed outputs:
- Final ISA specification
- Opcode, funct3, and funct7 assignments
- Updated design documentation reflecting the final architecture contract

### 2.2 Simulator design documentation

The simulator design document captures the high-level system architecture, the block diagram, the five-stage pipeline, the forwarding and hazard model, and the stage-by-stage data flow. The design aligns with the build specification and clearly defines the responsibilities between assembler, pipeline engine, hazard unit, and UI.

Key documents:
- `docs/M2_SIMULATOR_DESIGN.md`
- `docs/LIMO_BUILD_SPEC.md`
- `docs/PIPELINE_REGISTERS.md`

### 2.3 Pipeline-register data model

The team produced a formal data-contract for the pipeline registers:
- IF/ID
- ID/EX
- EX/MEM
- MEM/WB

This model defines:
- register fields and widths
- control-signal bundling
- reset/bubble semantics
- load-use stall conditions
- branch flush behaviour
- forwarding inputs and outputs

### 2.4 Interface wireframes

The interface component of the project was drafted to reflect the simulator requirements and student usability needs. The UI design includes:
- source editor and machine-code view
- pipeline stages and datapath preview
- control-signal table
- register file and data memory inspector
- Freshman-mode bilingual narration panel
- responsiveness for phone and desktop screens

### 2.5 Working assembler with unit tests

The assembler was fully implemented and validated against the frozen ISA. Completed outputs:
- `src/isa.js` — the frozen instruction set as machine-readable definitions
- `src/assembler.js` — all 12 mnemonics across the R/I/S/B formats, labels and branch resolution, Sesotho orthography and register digraphs (`ts'`, `ch'`), decimal/hex immediates, and plain-language error reporting with line numbers
- `tests/assembler_test.js` — a 43-test unit suite (`npm test`) covering hand-encoded ISA verification vectors, every instruction class, label/branch offsets, and error handling. All 43 tests pass.

### 2.6 Simulator web app live on GitHub Pages

The simulator site is published and live at https://saintchigos.github.io/limo-architects/. The deployed app (verified 25 October 2026) includes:
- the `.limo` source editor with a Machine Code inspector tab
- the five-stage pipeline view and processor stage display
- the register file and data-memory inspectors
- the narration panel

The deployment was completed with the `style.css` / `src/app.js` additions and the Machine Code inspector wiring, so the live demo reflects the tagged `m2` code.

### 2.7 Test and project baseline

The team recorded AI usage in `AI_USE.md` and organised the repo so the project can be reviewed and released as a milestone. The repository contains the assembler, the test suite, four example LIMO programs, and the main design and specification artifacts required for sprint evidence.

---

## 3. What Was Done

1. ISA was frozen and aligned with D1 feedback.
2. The five-stage pipeline was designed and documented.
3. Pipeline registers were modelled with a complete data contract.
4. Forwarding, stall, and flush behaviour were specified.
5. Interface wireframes were prepared for the required simulator screens.
6. Build specification and supporting design docs were created.
7. The assembler was fully implemented and validated: the 43-test unit suite passes (`npm test`).
8. The simulator web app was deployed and verified live on GitHub Pages.
9. Project documentation and AI-use tracking were completed.
10. The repository was tagged `m2` and the GitHub release published (25 October 2026).

---

## 4. What Was Not Done

The following items remain for M3 and beyond (the full B8 test-program set of at least eight programs, the Ripes cross-check, and the usability test remain M5 scope):

- Full pipeline execution engine implementation
- Real step/run/pause/reset simulator execution
- Real-time value propagation and cycle animation
- Full UI wiring between the assembler and runtime engine
- Advanced dynamic visualisation beyond the M2 design baseline

---

## 5. What Is Next

The next phase will focus on the working implementation of the simulator itself:

1. Implement the runtime pipeline engine
2. Connect the assembler output to instruction and data memory
3. Add hazard detection and forwarding in execution logic
4. Implement step, run, pause, and reset controls
5. Validate the simulator against example LIMO programs
6. Extend UI views to show live stage activity and control-state updates

---

## 6. Team Contributions

- Tinotenda Knowledge Chigowe: ISA and release leadership
- Katleho Motsheare: assembler implementation and specification baseline
- Tiisetso Joseph Masemene: pipeline architecture and data model
- Lebohang Lithebe: hazard-unit design and forwarding logic
- Motloheloa Mokhele: interface wireframes and UX design / web app assets
- Mokheseng Mohasoa: assembler unit test suite and validation

---

## 7. Evidence and Project Links

- Repository: https://github.com/saintchigos/limo-architects
- Live demo: https://saintchigos.github.io/limo-architects/
- Tagged release: https://github.com/saintchigos/limo-architects/releases/tag/m2
- AI use record: `AI_USE.md`
- Design docs:
  - `docs/M2_SIMULATOR_DESIGN.md`
  - `docs/PIPELINE_REGISTERS.md`
  - `docs/LIMO_BUILD_SPEC.md`
  - `docs/LIMO_ISA_Specification.md`
- Assembler, ISA, and web app: `src/isa.js`, `src/assembler.js`, `src/app.js`, `index.html`, `style.css`
- Testing: `tests/assembler_test.js` — 43 tests, all passing (`npm test`)
- Example programs: `examples/program1_arithmetic.limo`, `program2_memory.limo`, `program3_loop.limo`, `test_all_instructions.limo`

---

## 8. Conclusion

The M2 milestone established the critical design foundation for the LIMO simulator project. The team completed the architectural specification, pipeline contract, hazard model, UI wireframes, and supporting documentation — and delivered the working assembler with its passing 43-test unit suite, published the simulator web app live on GitHub Pages, and tagged the `m2` release. This milestone leaves the project in a strong position for M3, where the simulator logic and interactive execution engine will be implemented.

---

## 9. Sign-off

This draft is intended to be used as the milestone PDF content for the M2 submission package and can be exported to PDF from a Markdown or document editor for submission.

Revised 25 October 2026 to record the verified end-of-sprint state: the assembler unit test suite passes (`npm test`, 43/43), the GitHub Pages site is live, and the `m2` tagged release is published.

