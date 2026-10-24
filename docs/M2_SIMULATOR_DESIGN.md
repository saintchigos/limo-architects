# LIMO Pipeline Simulator Design Document — Milestone M2
**CS3520 — Computer Organisation and Architecture**  
**Team:** Architects  
**Academic Year:** 2026/2027 · Semester A  
**Milestone:** M2 (Simulator Design & Working Assembler)

---

## 1. System Overview & Architecture

The LIMO simulator is an educational, interactive 5-stage pipelined processor simulator executing the LIMO Instruction Set Architecture (Sesotho-language RISC-V derivative). It is architected as a lightweight, zero-dependency static web application hosted directly on GitHub Pages (< 2 MB footprint).

### High-Level Architecture
```
+-------------------------------------------------------------------------------+
|                             LIMO Browser Application                          |
+-------------------------------------------------------------------------------+
|  [ Assembly Source Editor (.limo) ]       [ UI Controls: Step / Run / Reset ] |
+-------------------------------------------------------------------------------+
                                      |
                           (LIMO Assembler: Pass 1 & 2)
                                      v
+-------------------------------------------------------------------------------+
|  Machine Code Memory: 32-bit words, Disassembly, Source Line Mapping          |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                       5-Stage Pipelined Datapath Engine                       |
|                                                                               |
|   [ IF ]  ====>  [ IF/ID ]  ====>  [ ID ]  ====>  [ ID/EX ]  ====>  [ EX ]    |
|   Fetch          Register          Decode         Register          Execute   |
|                                                                        ||     |
|                                                                        \/     |
|   [ WB ]  <====  [ MEM/WB ] <====  [ MEM ] <====  [ EX/MEM ] <=========+      |
|  Write-back      Register          Memory         Register                    |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | Hazard Detection Unit (Stalls / Bubbles)                              |   |
|   | Forwarding Unit (EX/MEM -> EX, MEM/WB -> EX)                          |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                            Visualisation Layer                                |
|  - Datapath Diagram: Live values, active units, and highlighted wires         |
|  - Control Table: Journey of signals (RegWrite, ALUSrc, MemRead, etc.)        |
|  - Pipeline Cycle Chart: Instruction vs. Cycle matrix (IF, ID, EX, MEM, WB)   |
|  - Register File (r0-r31 with Sesotho names) & Data Memory Inspector          |
|  - Freshman Mode Narration: Live bilingual commentary (English + Sesotho)     |
+-------------------------------------------------------------------------------+
```

### 1.1 Layer responsibilities and module map

The build specification suggests an `assembler/`, `simulator/` and `ui/` split.
The design keeps those responsibilities separate even where the M2 implementation
currently uses fewer files. The table below is the contract for M3: a module may
move, but its inputs, outputs and owner must not change silently.

| Layer | Suggested modules (`LIMO_BUILD_SPEC.md`) | M2 files | Responsibilities | Inputs → outputs |
|---|---|---|---|---|
| **Editor and assembler** | `assembler/tokenizer.js`, `parser.js`, `encoder.js`, `errors.js`; `simulator/isa.js` | `src/assembler.js`, `src/isa.js` | Tokenise Sesotho identifiers and comments, run the two-pass symbol resolution, validate operands, encode R/I/S/B words, and report line-numbered errors. Knows the ISA; knows nothing about the pipeline. | `.limo` source → `{ instructions, errors, symbolTable, machineWords }` with per-line address, hex, binary and field metadata. |
| **Pipeline engine** | `simulator/pipeline.js`, `memory.js`, `registers.js`; models in `src/models.js` | `src/models.js` (M2); `pipeline.js` in M3 | Own the architectural state (PC, 32 GPRs, data memory), the four pipeline registers, and one non-blocking stage update per clock. Fetch from instruction memory, decode and read registers, execute/branch-resolve, access data memory, write back. | Assembled instruction words + control inputs → next `CPUState`, per-stage trace, retirement/stall/flush counters. |
| **Hazard unit** | `simulator/hazard.js` | `src/models.js` fields; `hazard.js` in M3/M4 | Detect load-use stalls and RAW forwarding; select `ForwardA`/`ForwardB`; drive PC/IF-ID freeze, bubble insertion and branch flush. Reads pipeline-register fields only. | `ID_EX`, `EX_MEM`, `MEM_WB`, `IF_ID`, forwarding-enable → stall/flush controls and forwarding selects. |
| **UI views** | `ui/editor.js`, `datapath.js`, `controls.js`, `hazards.js`, `stats.js`, `freshman.js`, `app.js` | `index.html`, `style.css`, `src/app.js` | Render the editor, machine-code table, datapath, control-signal journey, hazard annotations, statistics and bilingual Freshman mode. Reads a snapshot of state; never mutates the pipeline directly. | `CPUState` snapshot + assembled program + selected view → DOM/SVG. |
| **Tests and examples** | `tests/*.test.js`, `examples/*.limo` | `tests/`, `examples/` | Unit-test the assembler, model invariants, control decoder and hazard logic independently of the UI; provide runnable programs with expected register/memory/cycle results. | Module APIs → pass/fail with diagnostic messages; `.limo` source → expected final state. |

Rules that keep the layers independent:

1. The assembler never imports pipeline code, and the pipeline never parses source text.
2. The hazard unit never reads the DOM and the UI never reaches into a stage function; the UI consumes a read-only snapshot.
3. `src/models.js` is the single definition of the pipeline-register fields. M3 code must extend that model rather than invent parallel objects.
4. The same `CPUState.reset()` path is used by the Reset button, a new program load and the tests.

---

## 2. Pipelined Datapath & Detailed Block Diagram

The processor implements the classical 5-stage RISC pipeline:
1. **IF (Instruction Fetch)**: Uses the Program Counter (`sebali_tsamaiso`) to fetch a 32-bit instruction word from instruction memory, computes $PC + 4$, and handles branch target redirect when a branch is taken.
2. **ID (Instruction Decode / Register Read)**: Decodes opcode, funct3, funct7, reads operands $rs1$ and $rs2$ from the 32-register register file, sign-extends immediate values (I, S, B types), and produces control signals.
3. **EX (Execute / Address Calculation / Branch Resolution)**: Performs ALU operations, shifts, calculates memory effective addresses ($rs1 + \text{imm}$), and computes conditional branch comparisons and targets ($PC + \text{imm}$). Branches resolve here.
4. **MEM (Memory Access)**: Reads from or writes to data memory for `bala` (LW) and `boloka` (SW).
5. **WB (Write-Back)**: Writes the selected result (ALU result or memory load word) back to destination register $rd$ in the register file.

### Datapath Block Diagram
```
         +-------------------------------------------------------------+
         |                       EX-Stage Branch Target                |
         +---------------------------------------+                     |
                                                 |                     |
     PCSrc (from EX) -------------------------+  |                     |
                                              |  |                     |
                                              v  v                     |
      +-------+       +--------+            +-----+                    |
+---> |  PC   | ----> | +4 Add | ---------> | MUX | -------------------+
|     +---+---+       +---+----+            +-----+
|         |               |                    |
|         v               | (PC+4)             v (Next PC)
|     +-------+           |
|     | I-MEM |           |
|     +---+---+           |
|         |               |
|         v (Instr)       v
|     +========================+
|     ||    IF/ID REGISTER    ||
|     +========================+
|         |               |
|         v (Instr)       v (PC)
|     +-------+       +--------+
|     | Ctrl  |       | Reg    |
|     | Unit  |       | File   | ----> ReadData1 (rs1)
|     +---+---+       | (r0-31)| ----> ReadData2 (rs2)
|         |           +--------+
|         v (Imm Gen)
|     +-------+
|     | Sign  | ----> Extended Imm
|     | Ext   |
|     +-------+
|         |
|         v
|     +========================+
|     ||    ID/EX REGISTER    ||  <--- Hazard Unit stalls / flushes
|     +========================+
|         |       |       |       |
|         | (Ctrl)| (Imm) | (RD1) | (RD2)
|         |       |       v       v
|         |       |    +-----+ +-----+
|         |       |    |FwdA | |FwdB | <--- Forwarding Unit
|         |       |    +--+--+ +--+--+
|         |       |       |       |
|         |       |       v (ALU  v
|         |       |       In1) +-----+
|         |       +----------> | MUX | (ALUSrc)
|         |                    +--+--+
|         |                       |
|         |                       v (ALU In2)
|         |       +-----------+
|         +-----> |    ALU    | ----> ALU Result & Zero/Branch Decision
|         |       +-----+-----+
|         |             |
|         v             v
|     +========================+
|     ||   EX/MEM REGISTER    ||
|     +========================+
|         |             |           |
|         | (Ctrl)      | (ALU Res) | (WriteData2)
|         |             v           v
|         |          +-----------------+
|         +--------> |   Data Memory   |
|         |          +--------+--------+
|         |                   | (ReadData)
|         v                   v
|     +========================+
|     ||   MEM/WB REGISTER    ||
|     +========================+
|         |             |           |
|         | (MemToReg)  | (ALU Res) | (Mem Data)
|         |             v           v
|         |            +-------------+
|         +----------> |     MUX     |
|                      +------+------+
|                             |
|                             v (WriteBack Data)
+-----------------------------+ (Fed back to RegFile WB stage)
```

### Hazard and control paths

```
 IF/ID.rs1, IF/ID.rs2 ─────────────┐
                                   v
                          +------------------+   stall=1   +---------------------------+
 ID/EX.rd, ID/EX.ctrl.memRead ───> | Load-use detector| ──────────> | freeze PC and IF/ID;      |
                          +------------------+             | ID/EX.flush() (bubble)    |
                                                           +---------------------------+

 EX/MEM.rd, EX_MEM.ctrl.regWrite ──┐
                                    v
                          +------------------+  ForwardA / ForwardB  +------------------+
 MEM/WB.rd, MEM/WB.ctrl.regWrite ─>| Forwarding unit  | ───────────────────> | EX ALU input muxes|
                          +------------------+   (EX/MEM has priority) +------------------+
                                                                                  ^
 ID/EX.rs1, ID/EX.rs2 ─────────────────────────────────────────────────────────────┘

 ID/EX.ctrl.branch, ID/EX.readData1, ID/EX.readData2, ID/EX.immediate, ID/EX.pc
                                    |
                                    v
                          +------------------+  branchTaken, branchTarget  +------------------+
                          | EX branch unit   | ──────────────────────────> | next-PC mux      |
                          +------------------+                              +------------------+
                                    |
                                    | taken
                                    v
                          IF/ID.flush(); ID/EX.flush(); EX_MEM.ctrl.pcSrc = 1
```

Every box in this diagram maps to a condition in the hazard table below and to a
field in [`PIPELINE_REGISTERS.md`](PIPELINE_REGISTERS.md). The pipeline-engine
layer owns the registers; the hazard unit only reads them and drives the
freeze/flush/select outputs.

---

### Hazard Resolution and Named Control Paths

All hazard paths below have named inputs and outputs so the hazard unit can be
implemented and unit-tested without the UI. Signal names use the model fields
documented in [`PIPELINE_REGISTERS.md`](PIPELINE_REGISTERS.md).

| Path | Inputs | Output / action |
|---|---|---|
| **Forward A from EX/MEM** | `EX_MEM.ctrl.regWrite`, `EX_MEM.rd`, `ID_EX.rs1`, `EX_MEM.aluResult` | `ForwardA = EX/MEM`; ALU input A becomes `EX_MEM.aluResult`. |
| **Forward B from EX/MEM** | `EX_MEM.ctrl.regWrite`, `EX_MEM.rd`, `ID_EX.rs2`, `EX_MEM.aluResult` (or `EX_MEM.writeData` for a store) | `ForwardB = EX/MEM`; ALU input B / store data becomes the EX/MEM value. |
| **Forward A from MEM/WB** | `MEM_WB.ctrl.regWrite`, `MEM_WB.rd`, `ID_EX.rs1`, `MEM_WB.writeBackValue` | `ForwardA = MEM/WB`; ALU input A becomes `MEM_WB.writeBackValue`. |
| **Forward B from MEM/WB** | `MEM_WB.ctrl.regWrite`, `MEM_WB.rd`, `ID_EX.rs2`, `MEM_WB.writeBackValue` | `ForwardB = MEM/WB`; ALU input B / store data becomes `MEM_WB.writeBackValue`. |
| **Load-use stall** | `ID_EX.ctrl.memRead`, `ID_EX.rd`, `IF_ID.rs1`, `IF_ID.rs2` | `stall = 1`: freeze PC and `IF/ID`; `ID_EX.flush()` inserts one bubble. |
| **Branch flush** | `ID_EX.ctrl.branch`, `ID_EX.readData1`, `ID_EX.readData2`, `ID_EX.immediate`, `ID_EX.pc` | EX computes `branchTaken` and `branchTarget`; on taken, `if_id.flush()`, `id_ex.flush()`, `pcSrc = 1` and next `PC = branchTarget`. |
| **Write-back** | `MEM_WB.valid`, `MEM_WB.ctrl.regWrite`, `MEM_WB.ctrl.memToReg`, `MEM_WB.rd`, `MEM_WB.aluResult`, `MEM_WB.memData` | `writeBackValue` is selected in MEM; WB writes it to `rd` only when valid and `regWrite` (and `rd != noto`). |

Priority and timing rules:

1. `EX_MEM` forwarding wins over `MEM/WB` when both match; it is the younger producer.
2. The load-use condition is checked before forwarding. A load in EX has only its address in `EX_MEM.aluResult`, so the dependent instruction must wait one cycle and then take the value from `MEM_WB.writeBackValue`.
3. A branch is resolved in EX. The two younger instructions (in IF and ID) are squashed, giving a 2-cycle flush penalty. `EX_MEM.branchTaken` and `EX_MEM.ctrl.pcSrc` record the decision for the datapath view and the next-PC mux.
4. Forwarding can be disabled from the UI. With forwarding OFF, every RAW condition in the table becomes a stall, so the statistics view can show the cycle cost.
5. A flushed or stalled entry is a bubble: `valid === false` and `ctrl` is a NOP. It cannot commit a register or memory write.

### Data-flow walkthrough: `bala r2, 0(r1)`

Assume `r1 = 100`, `Memory[100] = 21`, and the instruction is at address `0x20`.

| Cycle | Stage | State after the clock edge | Notes |
|---|---|---|---|
| 1 | **IF** | `IF/ID = { pc: 0x20, pcPlus4: 0x24, instruction: bala, rs1: 1, rd: 2, immediate: 0, valid: true }` | Instruction fetched from instruction memory; PC advances to `0x24`. |
| 2 | **ID** | `ID/EX = { pc: 0x20, rs1: 1, rs2: 0, rd: 2, readData1: 100, readData2: 0, immediate: 0, ctrl: { memRead: 1, memToReg: 1, regWrite: 1, aluOp: 'ADD', aluSrc: 1 } }` | `rs1` is read from the register file; `0` is sign-extended; the control unit asserts load controls. |
| 3 | **EX** | `EX/MEM = { aluResult: 100, writeData: 0, rd: 2, ctrl: { memRead: 1, memToReg: 1, regWrite: 1 } }` | ALU computes the effective address `r1 + 0 = 100`. If the next instruction reads `r2`, the hazard unit raises the load-use stall. |
| 4 | **MEM** | `MEM/WB = { aluResult: 100, memData: 21, rd: 2, writeBackValue: 21, ctrl: { memToReg: 1, regWrite: 1 } }` | Data memory reads word 21 at address 100; `writeBackValue` selects `memData`. |
| 5 | **WB** | `r2 = 21`; `MEM_WB` becomes a bubble next cycle | WB writes `writeBackValue`; retirement counter increments. |

### Data-flow walkthrough: `boloka r3, 4(r1)`

Assume `r1 = 100`, `r3 = 42`, and the instruction is at address `0x30`.

| Cycle | Stage | State after the clock edge | Notes |
|---|---|---|---|
| 1 | **IF** | `IF/ID = { pc: 0x30, pcPlus4: 0x34, instruction: boloka, rs1: 1, rs2: 3, immediate: 4, valid: true }` | Instruction fetched; PC advances to `0x34`. |
| 2 | **ID** | `ID/EX = { pc: 0x30, rs1: 1, rs2: 3, rd: 0, readData1: 100, readData2: 42, immediate: 4, ctrl: { memWrite: 1, aluOp: 'ADD', aluSrc: 1, regWrite: 0 } }` | Both source registers are read; `rd` is not used by a store. `RegWrite` stays 0. |
| 3 | **EX** | `EX/MEM = { aluResult: 104, writeData: 42, rd: 0, ctrl: { memWrite: 1, regWrite: 0 } }` | ALU computes the effective address `r1 + 4`; `writeData` carries `rs2` (possibly forwarded). |
| 4 | **MEM** | `MEM/WB = { aluResult: 104, memData: 0, rd: 0, writeBackValue: 104, ctrl: { memWrite: 1, regWrite: 0 } }` | Data memory writes 42 to address 104. No register write is enabled. |
| 5 | **WB** | No architectural change | `ctrl.regWrite == 0`, so WB does nothing. The store has already completed in MEM. |

Both walkthroughs use the same four registers. The only difference is which
controls survive and whether WB commits; this is why the control bundle travels
with every instruction instead of being regenerated from `rd` or the mnemonic.

---

## 3. Pipeline-Register Data Model

Each pipeline register is a plain JavaScript object latched once per clock. The
complete field-by-field contract (name, type, source, purpose), the control
signal bundle, reset/bubble behaviour, microarchitectural-only fields and the
hazard-unit inputs are defined in
[`PIPELINE_REGISTERS.md`](PIPELINE_REGISTERS.md). The executable definition is
[`src/models.js`](../src/models.js). This section is the short map; the separate
document is authoritative when the two disagree.

| Register | Latched from | Key payload | Consumed by |
|---|---|---|---|
| `IF/ID` | IF | `pc`, `pcPlus4`, `instruction`, decoded `rs1`/`rs2`/`rd`/immediate, `valid` | ID and the load-use hazard check |
| `ID/EX` | ID | `pc`, register indices and values, `immediate`, `funct3`/`funct7`, `ctrl` | EX, forwarding unit and branch unit |
| `EX/MEM` | EX | `aluResult`, `writeData`, `rd`, `branchTarget`, `branchTaken`, `ctrl` | MEM and the EX/MEM forwarding path |
| `MEM/WB` | MEM | `aluResult`, `memData`, `rd`, `writeBackValue`, `ctrl` | WB and the MEM/WB forwarding path |

### 3.1 Control signals

Every register carries the same `ControlSignals` bundle:
`aluOp` (ALUCtrl), `aluSrc`, `branch`, `branchType`, `memRead`, `memWrite`,
`regWrite`, `memToReg` and `pcSrc`. ID generates the bundle; EX sets `pcSrc` when
a branch is taken; MEM and WB consume the subset relevant to their stage. A
bubble carries `ControlSignals.createNop()`, so every signal is deasserted.

### 3.2 Reset and bubble representation

- Constructors call `reset()`: every numeric field is `0`, `valid` is `false`,
  `branchTaken` is `false`, `mnemonic`/`sourceLine` are `null`, and `ctrl` is a
  NOP bundle.
- `flush()` calls `reset()` and labels the entry `'FLUSH (Bubble)'`.
- `valid === false` is the authoritative bubble marker. Downstream stages must
  not commit architectural state from an invalid register.
- A load-use stall freezes PC and `IF/ID` and calls `ID_EX.flush()`. A taken
  branch calls `IF_ID.flush()` and `ID_EX.flush()` and sets
  `EX_MEM.ctrl.pcSrc = 1`.

### 3.3 Microarchitectural-only fields

`IF/ID`, `ID/EX`, `EX/MEM`, `MEM/WB`, `valid`, `ctrl`, `sourceLine`,
`assemblyText`, `mnemonic`, `branchTarget`, `branchTaken`, `aluResult`,
`memData` and `writeBackValue` are not part of the LIMO ISA. They exist for this
five-stage implementation, for flushing/diagnostics, or for the UI. The
architectural state is the 32 GPRs, PC and data memory. See the ISA
specification's design-decision log item (b) for why the ISA must not specify
pipeline registers.

### 3.4 Hazard-unit inputs available in the model

`ID_EX.ctrl.memRead`, `ID_EX.rd`, `IF_ID.rs1`, `IF_ID.rs2`,
`EX_MEM.ctrl.regWrite`, `EX_MEM.rd`, `MEM_WB.ctrl.regWrite`, `MEM_WB.rd`,
`ID_EX.rs1`, `ID_EX.rs2`, `MEM_WB.writeBackValue` and `EX_MEM.aluResult` are all
directly readable. No stage needs to reconstruct a register index from the raw
instruction word.

---

## 4. User Interface Wireframes & Component Layout

The user interface is designed for clarity, responsive performance, and ease of use for first-year students. It runs entirely client-side without external dependencies.

```
+-------------------------------------------------------------------------------------------------------+
|  LIMO SIMULATOR  |  A Sesotho-Language RISC-V Derivative  |  Team Architects  |  [Dark / Light Mode]  |
+-------------------------------------------------------------------------------------------------------+
|  [Select Example Program: Program 1 (Arithmetic) v]  [Open .limo]  [Save .limo]  [Assemble & Load]    |
+----------------------------------------------------+--------------------------------------------------+
|  STEP CONTROLS: [Step Cycle] [Run] [Pause] [Reset] |  CLK: 0  |  CPI: 0.00  |  Stalls: 0  | Flushes: 0  |
+----------------------------------------------------+--------------------------------------------------+
|  LEFT PANE: Code & Machine Encoding (50%)          |  RIGHT PANE: Visualisation & Datapath (50%)      |
|  +-----------------------------------------------+  |  +---------------------------------------------+  |
|  | [1] # Assembly Editor                         |  |  | PIPELINE STAGES (Active Units)               |  |
|  | [2] boelela:                                  |  |  | [ IF ] -> [ ID ] -> [ EX ] -> [ MEM ] ->[ WB]|  |
|  | [3]   kopanya_hang r1, r0, 5                  |  |  +---------------------------------------------+  |
|  | [4]   tlosa r1, r1, r2                        |  |  | DATAPATH SCHEMATIC & LIVE WIRES             |  |
|  | [5]   kholo_ho r1, r3, boelela                |  |  | PC: 0x00000004   ALU Res: 4                  |  |
|  |                                               |  |  | ForwardA: 00     ForwardB: 10 (from MEM/WB)  |  |
|  +-----------------------------------------------+  |  +---------------------------------------------+  |
|  | ASSEMBLED MACHINE CODE TABLE                  |  |  | CONTROL SIGNALS JOURNEY                      |  |
|  | Addr | Hex      | Opcode| Rd |Fn3|Rs1|Rs2|Imm |  |  | Stage | RegW | ALUSrc | MemR | MemW | Branch |  |
|  | 0x00 | 00A0C2C9 | 100100| r5 |100| r1| - | 10 |  |  | EX    | 1    | 1      | 0    | 0    | 0      |  |
|  | 0x04 | 002081CD | 100110| r3 |000| r1| r2| -  |  |  +---------------------------------------------+  |
|  +-----------------------------------------------+  |  | REGISTER FILE (Sesotho Aliases)             |  |
|  | ERROR & WARNING DIAGNOSTICS LOG               |  |  | r0 (noto): 0       r1 (khutla_aterese): 12   |  |
|  | Line 4: Valid instruction 'tlosa r1, r1, r2'  |  |  | r2 (ts'upiso_phaello): 1024 ...              |  |
|  +-----------------------------------------------+  |  +---------------------------------------------+  |
+----------------------------------------------------+--------------------------------------------------+
|  BOTTOM PANE: FRESHMAN MODE NARRATION (Bilingual)                                                     |
|  English: In this cycle, stage EX computed 'r1 - r2' resulting in 4. Forwarding path B used.          |
|  Sesotho: Karolong ena, 'tlosa' e nkile r1 le r2 ho etsa palo ea 4. Phallo ea pele e sebelisitsoe.    |
+-------------------------------------------------------------------------------------------------------+
```

---

## 5. Assembler Specification & Error Handling

### 5.1 Tokenization & Syntax Rules
- **Orthography**: Identifiers permit Sesotho apostrophes (`ts'`, `ch'`). A token regex of `/^[a-zA-Z_][a-zA-Z0-9_']*$/` accurately preserves names like `ts'upiso_phaello`.
- **Labels**: Regex `/^([a-zA-Z_][a-zA-Z0-9_']*):$/`.
- **Registers**: Accepts standard forms `r0`–`r31` as well as all official Sesotho names and group aliases (`noto`, `khutla_aterese`, `ts'upiso_phaello`, `ts'upiso_kakaretso`, `li_khang`, `li_phetho`, `li_nakoana`, `li_boloka`).
- **Memory Syntax**: Supports `imm(rs1)` (e.g. `0(r1)`, `8(ts'upiso_phaello)`).
- **Immediates**: Signed decimals (`-2048` to `+2047`) and hex (`0x00` to `0xFFF`).

### 5.2 Two-Pass Assembly Process
- **Pass 1 (Symbol Resolution)**:
  - Scans each line, removes comments and whitespace.
  - Detects and records label addresses ($PC$ advances by 4 bytes for each valid instruction).
  - Validates duplicate label definitions and misalignment.
- **Pass 2 (Code Generation)**:
  - Resolves instruction mnemonics and operands.
  - Computes branch offsets: $\text{offset} = \text{targetPC} - \text{currentPC}$. Verifies offset is word-aligned and fits within 13 bits (signed $-4096 \dots +4094$).
  - Packs bitfields into a 32-bit unsigned integer according to R, I, S, B format bitmasks.
  - Outputs instruction metadata, hex string, binary string, and colour-coded field tags.

### 5.3 Plain-English Error Reporting
Errors are trapped with line numbers, offending text, and explanatory hints:
- `Line 12: Unknown mnemonic 'add'. Did you mean Sesotho equivalent 'kopanya'?`
- `Line 15: Register 'r35' out of range (must be r0–r31 or valid Sesotho alias).`
- `Line 22: Branch target label 'tsoela_pele' is undefined.`
- `Line 28: Immediate value 5000 exceeds 12-bit signed range (-2048 to +2047).`

---

## 6. Milestone M2 Sprint Note

**Milestone:** M2 — Simulator Design & Working Assembler  
**Date:** Sunday 11 October 2026 (Week 8)  
**Role Rotation (Week 8):**
- **ISA Architect**: Tinotenda Knowledge Chigowe
- **Assembler Lead**: Katleho Motsheare
- **Pipeline Lead**: Tiisetso Joseph Masemene
- **Hazard-Unit Lead**: Lebohang Lithebe
- **Interface Lead**: Motloheloa Mokhele
- **Test Lead**: Mokheseng Mohasoa
- **Scrum & Release Lead**: Tinotenda Knowledge Chigowe

### What Was Done
1. **ISA Frozen with D1 Feedback Applied**: Finalized opcode, funct3, funct7 assignments; incorporated hand-encoded verification test vectors in `docs/LIMO_ISA_Specification.md`.
2. **Datapath & Microarchitecture Design**: Specified complete 5-stage pipeline, branch resolution in EX stage with 2-cycle flush, and load-use hazard stall unit.
3. **Pipeline-Register Data Model**: Defined typed structures for `IF/ID`, `ID/EX`, `EX/MEM`, and `MEM/WB` registers including forwarding and control bits.
4. **Interface Wireframes**: Designed modular web interface with visual datapath, interactive instruction machine code inspector, control signals table, and Freshman bilingual narration panel.
5. **Production LIMO Assembler**: Implemented robust two-pass JavaScript assembler supporting all 12 instructions, Sesotho digraphs (`ts'`), register aliases, decimal/hex immediates, and comprehensive error reporting.
6. **Automated Unit Test Suite**: Implemented single-command test runner verifying all instruction encodings against course specification test vectors.
7. **Static Web App & GitHub Pages Setup**: Packaged zero-dependency HTML/CSS/JS ready for deployment.

### What Was Not Done (Deferred to M3 / M4)
- Full step-by-step cycle execution engine (M3 milestone target).
- Dynamic wire animation and live value propagation during execution (M4 milestone target).

### What Is Next (Milestone M3)
- Implement `pipeline.js` containing stage step logic for IF, ID, EX, MEM, WB.
- Connect assembler output to instruction memory and register file state.
- Enable Step, Run, Pause, and Reset execution for hazard-free LIMO programs.
