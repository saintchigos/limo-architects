# LIMO Pipeline Register Data Model

**CS3520 — Computer Organisation and Architecture**  
**Team:** Architects  
**Milestone:** M2 (Simulator Design)  
**Executable model:** [`src/models.js`](../src/models.js)  
**Related design:** [`M2_SIMULATOR_DESIGN.md`](M2_SIMULATOR_DESIGN.md)

This document is the complete contract for the data that travels between the
five pipeline stages. It defines every field, where the field comes from, how it
is consumed, and what a reset or bubble looks like. A developer should be able
to create the four register objects from this document without inspecting the
implementation.

The model follows the build specification in
[`LIMO_BUILD_SPEC.md`](LIMO_BUILD_SPEC.md): five stages, branches resolved in
EX, separate instruction and data memories, and a load-use stall whenever an
instruction in EX is a load whose destination is read by the instruction in ID.

---

## 1. Naming and representation conventions

| Convention | Meaning |
|---|---|
| `uint32` | Unsigned 32-bit value stored in a JavaScript number (`>>> 0` when displayed). |
| `int32` | Two's-complement 32-bit value stored in a JavaScript number (`\| 0` when written). |
| `uint5`, `uint3`, `uint7` | Unsigned bit-field widths used by the LIMO encodings. |
| `boolean` | `true` / `false`; never `0` / `1` for `valid`, `branchTaken`. |
| `null` | "Not applicable", used for `sourceLine`, `mnemonic` and `branchType` in a bubble. |
| `ctrl` | A `ControlSignals` object. Controls travel as one bundle so a stage cannot accidentally use a signal from a different instruction. |

The dots in names such as `ID_EX.ctrl.regWrite` are used consistently in this
document and in the code. Signal names in prose (`RegWrite`, `ALUSrc`, …) are the
names used by the build specification; the corresponding JavaScript property is
shown in the same table.

---

## 2. Control signals carried by the pipeline

All signals are produced in ID and then copied forward in the `ctrl` bundle of
each pipeline register. EX updates `pcSrc` when it resolves a branch; the
remaining signals retain the value produced by ID.

| Build-spec name | Model field | Width / values | Generated in | Consumed in | Purpose |
|---|---|---|---|---|---|
| `RegWrite` | `ctrl.regWrite` | 1 bit (`0`/`1`) | ID | WB | Allow a write to `rd`. Forced to 0 when `rd == noto`. |
| `ALUSrc` | `ctrl.aluSrc` | 1 bit (`0`/`1`) | ID | EX | 0 selects `readData2`; 1 selects the sign-extended immediate. |
| `ALUCtrl` | `ctrl.aluOp` | string: `ADD`, `SUB`, `AND`, `OR`, `NOT`, `SLL`, `PASS` | ID | EX | Selects the ALU operation. `PASS` is used for loads/stores (address add uses `ADD`). |
| `MemRead` | `ctrl.memRead` | 1 bit | ID | MEM | Enable a word read from data memory (`bala`). |
| `MemWrite` | `ctrl.memWrite` | 1 bit | ID | MEM | Enable a word write to data memory (`boloka`). |
| `MemToReg` | `ctrl.memToReg` | 1 bit | ID | WB | 0 selects the ALU result; 1 selects the loaded memory word. |
| `Branch` | `ctrl.branch` | 1 bit | ID | EX | Marks `lekana`, `hali_lekane`, `kholo_ho`. |
| `PCSrc` | `ctrl.pcSrc` | 1 bit | EX | IF/next-PC mux | 1 selects `EX_MEM.branchTarget` instead of `PC + 4`. |
| (branch type) | `ctrl.branchType` | `BEQ`, `BNE`, `BGE`, or `null` | ID | EX | Selects the comparison performed by the branch unit. |

`ControlSignals.createNop()` returns a bundle with every signal deasserted:
`aluOp = 'ADD'`, `aluSrc = 0`, `branch = 0`, `branchType = null`,
`memRead = 0`, `memWrite = 0`, `regWrite = 0`, `memToReg = 0`, `pcSrc = 0`.
That bundle is the control payload of a bubble.

---

## 3. `IF/ID` — instruction fetch to decode

Latched at the end of IF. It carries the fetched word and the PC that produced
it. The decoded fields are a stable view of the instruction bits, written with
the word so the hazard unit can compare `IF/ID.rs1` and `IF/ID.rs2` without
re-decoding the instruction.

| Field | Type / width | Source | Purpose |
|---|---|---|---|
| `pc` | `uint32` | PC used for the fetch | Branch target calculation and narration. |
| `pcPlus4` | `uint32` | IF adder (`pc + 4`) | Sequential next PC when no branch is taken. |
| `instruction` | `uint32` | Instruction memory at `pc` | The complete 32-bit LIMO word passed to ID. |
| `opcode` | `uint7` | `instruction[6:0]` | Initial decode and illegal-instruction checks. |
| `rd` | `uint5` | `instruction[11:7]` | Destination index (0 when the format has no `rd`). |
| `funct3` | `uint3` | `instruction[14:12]` | Selects the instruction within its opcode class. |
| `rs1` | `uint5` | `instruction[19:15]` | Source register 1; also a load-use hazard input. |
| `rs2` | `uint5` | `instruction[24:20]` | Source register 2; also a load-use hazard input. |
| `funct7` | `uint7` | `instruction[31:25]` | Distinguishes R-type operations. |
| `immediate` | `int32` | Sign-extended I/S/B immediate | Decode result carried into ID/EX; the raw word remains available in `instruction`. |
| `valid` | `boolean` | Set by IF; cleared by a flush | `false` means the entry is a bubble and must not change architectural state. |
| `sourceLine` | `number \| null` | Assembler source map | Editor highlighting and Freshman-mode narration. |
| `assemblyText` | `string` | Assembler source map or `'NOP (Empty)'` / `'FLUSH (Bubble)'` | Human-readable display of the register contents. |

`ID` reads `readData1 = regFile[IF/ID.rs1]` and
`readData2 = regFile[IF/ID.rs2]`, sign-extends the immediate, and produces the
control bundle that is latched into `ID/EX`.

---

## 4. `ID/EX` — decode to execute

Latched at the end of ID.

| Field | Type / width | Source | Purpose |
|---|---|---|---|
| `pc` | `uint32` | `IF/ID.pc` | Branch target calculation in EX. |
| `pcPlus4` | `uint32` | `IF/ID.pcPlus4` | Link value and pipeline chart. |
| `valid` | `boolean` | ID | Bubble marker. |
| `sourceLine` | `number \| null` | `IF/ID.sourceLine` | Diagnostics and narration. |
| `assemblyText` | `string` | `IF/ID.assemblyText` | Display. |
| `mnemonic` | `string \| null` | Decoder | Display, hazard explanation and Freshman mode. |
| `rs1` | `uint5` | Decoder | Forwarding-unit comparison. |
| `rs2` | `uint5` | Decoder | Forwarding-unit comparison and store-data forwarding. |
| `rd` | `uint5` | Decoder | Destination index; load-use and RAW-hazard comparison. |
| `readData1` | `int32` | Register file at `rs1` | ALU input A before forwarding. |
| `readData2` | `int32` | Register file at `rs2` | ALU input B before forwarding, or store data. |
| `immediate` | `int32` | Sign-extended instruction immediate | ALU input B when `aluSrc == 1`, branch offset, or memory offset. |
| `funct3` | `uint3` | Decoder | ALU/branch sub-operation. |
| `funct7` | `uint7` | Decoder | R-type sub-operation. |
| `ctrl` | `ControlSignals` | ID control unit | Complete control bundle for EX, MEM and WB. |

---

## 5. `EX/MEM` — execute to memory

Latched at the end of EX.

| Field | Type / width | Source | Purpose |
|---|---|---|---|
| `pc` | `uint32` | `ID/EX.pc` | Display and branch bookkeeping. |
| `valid` | `boolean` | EX | Bubble marker. |
| `sourceLine` | `number \| null` | `ID/EX.sourceLine` | Diagnostics and narration. |
| `assemblyText` | `string` | `ID/EX.assemblyText` | Display. |
| `mnemonic` | `string \| null` | `ID/EX.mnemonic` | Display and hazard explanation. |
| `aluResult` | `int32` | ALU output | Arithmetic result, branch comparison result, or effective memory address. |
| `writeData` | `int32` | Forwarded `rs2` value | Data written by `boloka`; also forwarded to a dependent store. |
| `rd` | `uint5` | `ID/EX.rd` | Destination index for forwarding and WB. |
| `branchTarget` | `uint32` | `ID/EX.pc + ID/EX.immediate` | Address selected by `PCSrc` when a branch is taken. |
| `branchTaken` | `boolean` | EX branch comparator | Records the resolved branch decision for MEM/UI and branch flushing. |
| `ctrl` | `ControlSignals` | `ID/EX.ctrl`, with `pcSrc` set by EX | MEM and WB controls, plus the resolved next-PC select. |

The value forwarded from `EX/MEM` is `aluResult`. A load cannot forward from
`EX/MEM` because its data is not available until the end of MEM; that case is
handled by the load-use stall.

---

## 6. `MEM/WB` — memory to write-back

Latched at the end of MEM.

| Field | Type / width | Source | Purpose |
|---|---|---|---|
| `pc` | `uint32` | `EX/MEM.pc` | Display and branch bookkeeping. |
| `valid` | `boolean` | MEM | Bubble marker. |
| `sourceLine` | `number \| null` | `EX/MEM.sourceLine` | Diagnostics and narration. |
| `assemblyText` | `string` | `EX/MEM.assemblyText` | Display. |
| `mnemonic` | `string \| null` | `EX/MEM.mnemonic` | Display and Freshman-mode narration. |
| `aluResult` | `int32` | `EX/MEM.aluResult` | ALU result to write back for non-load instructions. |
| `memData` | `int32` | Data memory at `EX/MEM.aluResult` | Word loaded by `bala` (0 when `memRead == 0`). |
| `rd` | `uint5` | `EX/MEM.rd` | Destination index. |
| `writeBackValue` | `int32` | `memToReg ? memData : aluResult` | The exact value WB will write, and the value forwarded from MEM/WB. |
| `ctrl` | `ControlSignals` | `EX/MEM.ctrl` | `regWrite` and `memToReg` are consumed in WB; the rest is retained for the control-signal view. |

`WB` writes `writeBackValue` to `rd` only when `valid && ctrl.regWrite` and
`rd != 0`. Writing `noto` is silently discarded.

---

## 7. Reset state, bubbles and flushes

### 7.1 Power-on reset

Each register class calls `reset()` from its constructor. `CPUState.reset()` also
recreates all four registers, clears the register file and data memory, and
resets the counters.

A reset pipeline register has:

| Field group | Reset value |
|---|---|
| `pc`, `pcPlus4`, `instruction`, `opcode`, `rd`, `funct3`, `rs1`, `rs2`, `funct7`, `immediate` | `0` |
| `readData1`, `readData2`, `aluResult`, `writeData`, `memData`, `writeBackValue`, `branchTarget` | `0` |
| `branchTaken` | `false` |
| `valid` | `false` |
| `sourceLine`, `mnemonic` | `null` |
| `assemblyText` | `'NOP (Empty)'` |
| `ctrl` | `ControlSignals.createNop()` |

### 7.2 Bubble representation

A bubble is represented unambiguously by `valid === false`. The payload is also
zeroed and the control bundle is a NOP, so even buggy code that forgets to check
`valid` cannot write a register or memory. `assemblyText` is the only
human-readable difference between an empty register and a flushed register.

Downstream stage logic must follow this rule:

```text
if (!register.valid) {
  // Do not read operands, do not write memory, do not write a register.
  // Propagate a bubble to the next register.
}
```

### 7.3 `flush()`

`flush()` calls `reset()` and then sets `assemblyText = 'FLUSH (Bubble)'`. It is
used for every entry that must be squashed.

| Event | Action |
|---|---|
| Load-use stall | Freeze PC and `IF/ID` (do not latch a new instruction); call `ID_EX.flush()` to insert one bubble. |
| Branch taken in EX | Call `IF_ID.flush()` and `ID_EX.flush()` for the two younger instructions. Set `EX_MEM.branchTaken = true` and `EX_MEM.ctrl.pcSrc = 1`; the next PC becomes `EX_MEM.branchTarget`. |
| Branch not taken | No flush; `EX_MEM.branchTaken = false` and `ctrl.pcSrc = 0`. |
| Reset | `CPUState.reset()` recreates every register in the power-on state. |

A bubble does not increment `instructionsRetired`; a flushed instruction never
retires. `CPUState.stallCount` and `CPUState.flushCount` record the two events
for the statistics view.

---

## 8. Hazard-detection inputs

The model deliberately keeps every input needed by the hazard unit in a stable
field. No stage has to reconstruct a register index from a raw word.

| Hazard | Condition | Action |
|---|---|---|
| Load-use stall | `ID_EX.ctrl.memRead == 1` and (`ID_EX.rd == IF_ID.rs1` or `ID_EX.rd == IF_ID.rs2`) | Freeze PC and `IF/ID`; `ID_EX.flush()`. One-cycle penalty. |
| RAW forwarding A from EX/MEM | `EX_MEM.ctrl.regWrite == 1 && EX_MEM.rd != 0 && EX_MEM.rd == ID_EX.rs1` | ALU input A = `EX_MEM.aluResult`. |
| RAW forwarding B from EX/MEM | `EX_MEM.ctrl.regWrite == 1 && EX_MEM.rd != 0 && EX_MEM.rd == ID_EX.rs2` | ALU input B (or store data) = `EX_MEM.aluResult` / `EX_MEM.writeData`. |
| RAW forwarding A from MEM/WB | `MEM_WB.ctrl.regWrite == 1 && MEM_WB.rd != 0 && MEM_WB.rd == ID_EX.rs1` | ALU input A = `MEM_WB.writeBackValue`. |
| RAW forwarding B from MEM/WB | `MEM_WB.ctrl.regWrite == 1 && MEM_WB.rd != 0 && MEM_WB.rd == ID_EX.rs2` | ALU input B (or store data) = `MEM_WB.writeBackValue`. |
| Branch operand forwarding | Branch reads `rs1`/`rs2` in EX | The same forwarding muxes feed the branch comparator; `EX_MEM` has priority over `MEM/WB`. |
| Forwarding disabled | UI toggle is OFF | Stall on every RAW condition instead of forwarding. |

When both forwarding sources match, `EX_MEM` wins because it is the younger
producer. The load-use condition is checked before forwarding: a load in EX must
not be forwarded from `EX_MEM`, because `EX_MEM.aluResult` is the address, not
the loaded data.

---

## 9. Architectural versus microarchitectural state

| State | Visible to software? | Why |
|---|---|---|
| 32 GPRs (`r0`–`r31`), PC (`sebali_tsamaiso`), data memory | Yes | Defined by the LIMO ISA. A program can observe these through instructions. |
| `IF/ID`, `ID/EX`, `EX/MEM`, `MEM/WB` | No | Implementation detail. Another correct LIMO implementation could use a different pipeline depth or organisation. |
| `valid`, `sourceLine`, `assemblyText`, `mnemonic` | No | Simulator bookkeeping for flushing, diagnostics and narration. |
| `ctrl` bundle | No | Decoder output; equivalent logic could be combinational in another implementation. |
| `branchTarget`, `branchTaken`, `aluResult`, `memData`, `writeBackValue` | No | Intermediate datapath values. Only the final register/memory effect is architectural. |
| `cycleCount`, `instructionsRetired`, `stallCount`, `flushCount` | No | Statistics for the UI. |

The ISA specification deliberately does not define pipeline registers. Binding
the ISA to this particular five-stage microarchitecture would remove the freedom
to implement LIMO differently while still obeying the same instruction contract.
See `LIMO_ISA_Specification.md`, design-decision log item (b), for the same
argument in ISA terms.

---

## 10. Code mapping and invariants

| Model element | Code |
|---|---|
| Control bundle | `ControlSignals` in `src/models.js` |
| IF/ID register | `IF_ID_Register` |
| ID/EX register | `ID_EX_Register` |
| EX/MEM register | `EX_MEM_Register` |
| MEM/WB register | `MEM_WB_Register` |
| Architectural state and all four registers | `CPUState` |
| Bubble factory | `ControlSignals.createNop()` |
| Reset/flush | `reset()` and `flush()` on each register; `CPUState.reset()` |

Invariants the implementation must preserve:

1. `valid === false` implies no architectural write, regardless of the remaining fields.
2. `reset()` and `flush()` never leave a stale register index, control bit or payload value behind.
3. Each register owns a distinct `ControlSignals` instance; control objects are never shared between registers.
4. `MEM_WB.writeBackValue` is computed in MEM and is the only value forwarded from MEM/WB.
5. `r0` reads as 0 and ignores writes, including writes that arrive through WB.
6. Data-memory addresses must be word-aligned; a misaligned read or write raises an error.
7. `memData` is 0 when `memRead == 0`; `branchTarget`/`branchTaken` are only meaningful when `ctrl.branch == 1`.
