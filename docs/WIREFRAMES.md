# LIMO Simulator Interface Wireframes

Status: **draft for team agreement**. These wireframes cover every M2, M3, and M4 screen requested by issue #11. They are layout and interaction specifications, not final visual design.

## Asset index

| Asset | Viewport | Covers |
| --- | --- | --- |
| [`docs/wireframes/editor-assembler.svg`](wireframes/editor-assembler.svg) | 1000 x 640 desktop | Source editor, line numbers, diagnostics, hex/binary field output, assembler legend, empty/error states |
| [`docs/wireframes/execution-datapath.svg`](wireframes/execution-datapath.svg) | 1200 x 820 desktop | Pipeline controls, five-stage strip, datapath live values, control signals, hazards/forwarding, statistics, registers, memory, Freshman mode |
| [`docs/wireframes/phone-380.svg`](wireframes/phone-380.svg) | 380 x 900 phone | Responsive editor/output, sticky controls, stage strip, compact datapath, statistics, register/memory sheets, bilingual narration |

Open the SVG files directly in a browser. Text is selectable, and the SVGs use no external fonts, scripts, or images.

## Screen map

### 1. Editor and assembler output

Desktop reference: `editor-assembler.svg`.

- Application bar: program selector, Open, Save, Generate, theme control.
- Editor: line-number gutter, source tokens, current-PC marker, breakpoint marker, error marker.
- Diagnostics: plain-English, line-numbered warnings and errors. Errors never replace the last valid machine-code output.
- Assembler output: address, eight-digit hex, and binary fields. Each field carries a text label (`OP`, `RD`, `F3`, `RS`, `IMM`) and appears in the field legend.
- Source and output remain linked by source line number.
- Empty state: "Assembly ha e soe"; Run and Step are disabled until assembly succeeds.
- Error state: failing source line is marked; the previously assembled program remains visible.

### 2. Pipeline controls

Desktop reference: `execution-datapath.svg`, top control bar.

- Primary controls: Step, Run, Pause, Reset, Step Back.
- Speed control with a visible current value, not only slider position.
- Breakpoint control opens the source line-number gutter; breakpoints have a text/icon marker.
- Forwarding ON/OFF toggle is always visible because it changes stalls, CPI, and datapath annotations.
- Status strip: cycle, CPI, stalls, flushes.
- Running state must show a clear Pause action; paused/running/reset states must not rely on colour alone.
- Step Back restores the previous architectural and pipeline state. It must be disabled at the first cycle.

### 3. Datapath with live-value labels

Desktop reference: `execution-datapath.svg`, left panel.

- Five stages: IF, ID, EX, MEM, WB.
- Pipeline latches: IF/ID, ID/EX, EX/MEM, MEM/WB.
- Units: PC, I-MEM, control/decode, register file, ALU, branch unit, D-MEM, WB mux.
- Live labels sit next to the wire or unit they describe:
  - PC, PC+4, branch target
  - instruction word and decoded mnemonic
  - rs1/rs2 values, immediate values
  - ALU A/B inputs and ALU result
  - memory address, read data, write data
  - write-back value and destination register
- Values use fixed-width hex where relevant and retain register aliases.
- Active stage uses an outline plus a text label, not colour alone.
- Forwarding paths are dashed arrows plus a text tag such as `ForwardA=EX/MEM (10)`.

### 4. Control signals and hazards

Desktop reference: `execution-datapath.svg`, right panel.

- Control-signal journey table: stage by stage, showing RegWrite, ALUSrc, ALUCtrl, MemRead, MemWrite, MemToReg.
- Each bit-valued signal shows both `0/1` and a tooltip or inline explanation.
- Hazard annotations attach to the stage strip and affected operands:
  - RAW / load-use / control-hazard label
  - producer and consumer instruction
  - forwarding source (`EX/MEM` or `MEM/WB`)
  - stall reason and affected stages
  - branch flush reason and flush count
- Branch state: `PCSrc`, branch target, flush of IF/ID and ID/EX, incrementing flush counter.
- Hazard annotations are the implementation target for the future `src/hazard.js` contract in [`docs/HAZARD_API.md`](HAZARD_API.md).

### 5. Statistics and state tables

Desktop reference: `execution-datapath.svg`, lower panels.

- Pipeline chart: one row per instruction, one column per cycle, stage letters inside cells.
- Bubble cells are hatched and labelled `bubble`.
- Summary values: cycles, retired instructions, CPI, stalls, flushes, forwarding state.
- Register file: 32 GPRs with Sesotho aliases, hex/decimal value, and a changed marker.
- Memory table: written addresses only by default, with hex and decimal values.
- Machine-code table: address, hex word, mnemonic, and source line.
- Register and memory tables sort naturally by register number or address; changed values remain visible without relying on row colour.

### 6. Freshman mode

Desktop reference: `execution-datapath.svg`, footer and hazard annotations.
Phone reference: `phone-380.svg`, narration card.

- Narration panel provides an English sentence and a Sesotho sentence for the current cycle.
- Every datapath block and control signal has a short tooltip.
- Narration is an ARIA live region, so screen readers announce the new cycle once.
- Tooltips are available by keyboard focus, not hover only.
- The mode does not hide technical labels; it adds explanations beside them.
- Sesotho apostrophes and diacritics must render correctly.
- A "tooltip glossary" is reachable without stepping the simulation.

### 7. Phone layout at 380px

Reference: `phone-380.svg`.

- No horizontal page scroll at 380px.
- Header and transport controls stay sticky at the top.
- Controls wrap into two rows; every target is at least 44 x 44 CSS pixels.
- Tabs switch Editor, Execution, Registers, Memory, and Narration. Only one major panel is expanded at a time.
- Editor stacks above machine code. The assembler table scrolls horizontally inside its panel, with a sticky address column.
- The five-stage strip scrolls horizontally with a visible scroll affordance and stage letters.
- The datapath becomes a compact stage/unit summary; full live values remain available in a scrollable detail card.
- Statistics and register/memory tables become full-height sheets on tap.
- Narration remains visible below the current stage and is also available as a dedicated tab.

## Implementation notes

These wireframes are buildable in plain HTML, CSS, and JavaScript, matching the current no-framework app.

- Use CSS Grid for desktop regions and a single-column flow below 560px.
- Use semantic HTML for controls, tables, tabs, and dialogs.
- Draw the datapath as inline SVG or a positioned CSS grid; avoid canvas so labels remain selectable and accessible.
- Drive active stages, values, forwarding paths, and hazard labels from the same simulator state object.
- Keep table headers (`<th scope="col">`), captions, and row headers.
- Use the browser file picker for Open/Save; no server is required.
- Prefer state-driven CSS classes over scripted inline styles for active/error/changed states.
- Provide a reduced-motion mode; stage highlighting and narration must remain usable without animation.

## Accessibility requirements

- Colour is never the only cue. Field chips have text labels, changed rows say "yes", forwarding paths have text tags, active stages have outlines and labels, and bubbles are labelled.
- Text and controls meet WCAG AA contrast. Grid lines may be lighter than text but not below 3:1 against their panel.
- Visible focus ring on every control, tab, table row action, and tooltip trigger.
- Keyboard order follows the visual order. The simulation can be stepped without a mouse.
- Tooltips open on focus and dismiss with Escape.
- The narration region uses `aria-live="polite"`; do not announce every hidden table update.
- Touch targets are at least 44 x 44 CSS pixels at 380px.
- Body text remains readable without zoom. Machine code and tables may scroll rather than shrink below 12px.
- The current state is announced as text: "Cycle 7, running", "Paused at breakpoint line 5", "Reset complete".

## Team sign-off checklist

Issue #11 is complete when the team confirms:

- [ ] The editor, assembler, controls, datapath, control/hazard, statistics, Freshman-mode, and phone screens match the M2/M3/M4 requirements.
- [ ] The desktop and 380px layouts are buildable in plain HTML/CSS/JS.
- [ ] The accessibility notes above are accepted as implementation requirements.
- [ ] The two desktop SVGs and the phone SVG in `docs/wireframes/` are the agreed references.
- [ ] Any mismatch between the wireframes and the final simulator state model is recorded before implementation starts.
