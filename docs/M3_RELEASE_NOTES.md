# M3 Release Notes

## M3 — Pipeline core

This release packages the completed M3 milestone work for the LIMO project.

### Included work

- Control unit that decodes all 12 Sesotho instructions into control signals
- Five-stage pipeline engine with `IF/ID`, `ID/EX`, `EX/MEM`, and `MEM/WB` latches
- Program loading from the assembler into the simulated machine
- Engine-driven UI: Step/Run/Pause/Reset, stage strip, register and memory views,
  pipeline-register inspection, and latch connectors
- Hazard-free guarantee pass and the M4 hazard-unit API contract
- Automated control-decoder and pipeline test suites wired into one command
- M3 sprint note in `docs/M3_SPRINT_NOTE.md`

### Sprint deliverables

- [M3-A control unit](https://github.com/saintchigos/limo-architects/issues/22)
- [M3-B pipeline core](https://github.com/saintchigos/limo-architects/issues/23)
- [M3-C program loading](https://github.com/saintchigos/limo-architects/issues/24)
- [M3-D automated tests](https://github.com/saintchigos/limo-architects/issues/25)
- [M3-E UI wiring](https://github.com/saintchigos/limo-architects/issues/26)
- [M3-F hazard-free pass + M4 contract](https://github.com/saintchigos/limo-architects/issues/27)
- [M3-G release management](https://github.com/saintchigos/limo-architects/issues/28)
- Sprint note: [`docs/M3_SPRINT_NOTE.md`](https://github.com/saintchigos/limo-architects/blob/main/docs/M3_SPRINT_NOTE.md)

### Key files

- `src/control.js` — control-unit decoder
- `src/pipeline.js` — five-stage pipeline engine
- `src/app.js` — engine-driven UI wiring
- `docs/HAZARD_API.md` — M4 hazard-unit contract
- `docs/PIPELINE_REGISTERS.md` — pipeline-register data model
- `docs/WIREFRAMES.md` — interface wireframes
- `AI_USE.md` — AI usage record

### Verification

- `npm test` runs the assembler, control, and pipeline suites: 43 + 184 + 72 =
  **299 checks, all passing**.
- GitHub Pages deployment serves the app from `main`; the site loads and accepts
  and assembles a LIMO program.

### Live project links

- Repository: https://github.com/saintchigos/limo-architects
- Demo: https://saintchigos.github.io/limo-architects/
- Release: https://github.com/saintchigos/limo-architects/releases/tag/m3

### M3 status summary

The simulator now executes assembled LIMO programs through a real five-stage
pipeline. Hazard handling (forwarding and load-use stalls) is defined by the
`docs/HAZARD_API.md` contract and implemented in M4.
