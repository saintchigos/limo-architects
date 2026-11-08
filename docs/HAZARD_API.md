# LIMO Hazard Unit API Contract

**CS3520 - Computer Organisation and Architecture**  
**Team:** Architects  
**Milestone:** M3 verification and M4 hand-off  
**Issue:** #27 (Hazard-free guarantee pass + M4 hazard-unit API contract)  
**Owner:** Mokhele Motloheloa (Hazard-Unit Lead)  
**Status:** Proposed. Pipeline Lead review required before M4 implementation.

---

## 0. Scope and dependencies not listed in issue #27

This document has two jobs:

1. Record the M3 hazard-free verification: what the current five-stage engine does
   with the WB-before-ID half-cycle register-file rule, and which example
   programs are expected to be wrong until M4.
2. Define the executable contract that the M4 hazard unit must implement:
   forwarding selects, load-use stall, RAW detection, priority, and branch flush
   outputs.

The following dependencies are real and are not all named in issue #27. They must
be resolved in the same merge window or the contract cannot be exercised:

| ID | Dependency | Why it matters | Current state |
|---|---|---|---|
| D1 | `src/control.js` (Issue #22) | The engine needs the decoder that produces `ID/EX.ctrl`; there is no decoder on `main`. | Only on `feature/m3-pipeline-core` / PR #31. |
| D2 | `src/pipeline.js` (Issue #23 / #31) | The half-cycle WB-before-ID behaviour being verified lives here. `main` still contains the M2 instruction-by-instruction preview in `src/app.js`, not a five-stage engine. | Only on PR #31. |
| D3 | `examples/program4_hazard_free.limo` | This is the only example on the M3 branch that is deliberately hazard-free. It does not exist on `main`. | Only on PR #31. |
| D4 | Data-memory preloading for `program2_memory.limo` | `program2` assumes `Memory[100] = 21`. The file does not preload it; the engine's `program.preloadedData` does. Without the preload the expected result is meaningless. | Supported by PR #31, not visible from the issue or the `.limo` file. |
| D5 | Branch mnemonic mismatch | `docs/LIMO_BUILD_SPEC.md` mentions `nyane_ho`; the frozen ISA and `src/isa.js` use `hali_lekane` for BNE and `kholo_ho` for BGE. `branchType` is `BEQ`, `BNE`, `BGE`. | Contract follows `src/isa.js`, not the build-spec prose. |
| D6 | `src/hazard.js` does not exist | `tests/hazard_test.js` cannot be a runnable test until the module and npm-test wiring exist. Issue #27 makes the test stub optional and says to decide with the Test Lead. | Deferred; contract is the minimum deliverable. |
| D7 | `src/app.js` has no forwarding toggle | The M4 contract takes `forwardingEnabled` from the UI, but the current M2 controller has no such control. | M4 UI dependency (Issue #26/M4). |
| D8 | `tests/hazard_test.js` is not in `npm test` | `package.json` only runs `tests/assembler_test.js`. A new test file would silently never run unless the script is extended. | Test Lead decision required. |

**Verification source.** The traces in this document were produced by assembling
the example files and running the `LimoPipeline` from
`origin/feature/m3-pipeline-core` (PR #31, commit `a43a7ce`). They are not traces
of the M2 preview currently on `main`. If PR #31 changes semantics, re-run the
traces before using this document for M4.

---

## 1. The M3 rule this contract is built around

### 1.1 Clocking order

`LimoPipeline.step()` performs one clock edge. Internally it computes stages in
this order:

```text
WB -> MEM -> EX -> ID -> IF
```

Then it latches `IF/ID`, `ID/EX`, `EX/MEM` and `MEM/WB` once at the end. Because
WB runs before ID, a register write committed by WB in cycle `N` is visible to an
ID read in the same cycle `N`. This is the half-cycle register-file model
(Patterson & Hennessy, the "write in first half, read in second half" rule).

### 1.2 Instruction timeline with no stalls and no taken branch

For instruction index `i` (0-based), fetched at address `i * 4`:

| Stage | Cycle |
|---|---|
| IF | `i + 1` |
| ID | `i + 2` |
| EX | `i + 3` |
| MEM | `i + 4` |
| WB | `i + 5` |

Producer `p`, consumer `c`, with no stalls or taken branch:

```text
producer WB cycle  = p + 5
consumer ID cycle  = c + 2
visible when       p + 5 <= c + 2
therefore          c - p >= 3
```

Define the **instruction distance** `d = c - p`:

| Distance | Example | M3 behaviour | M4 requirement |
|---|---|---|---|
| `d = 1` | consumer immediately follows producer | ID reads the old value; result is stale | EX/MEM forwarding (or load-use stall if producer is a load) |
| `d = 2` | one instruction between producer and consumer | ID reads the old value; result is stale | MEM/WB forwarding |
| `d >= 3` | two or more instructions between | WB-before-ID makes the new value visible | No action |

Consequences:

- M3 is correct only for straight-line programs whose true register
  dependencies are all at distance 3 or more.
- A taken branch changes which instructions are fetched, but it does not change
  the rule: WB still runs before ID in every cycle. It does change the dynamic
  distance between a loop-body producer and the next iteration's consumer, so
  loops must be analysed dynamically (program 3 below).
- A load at distance 2 is not an M3 load-use stall; the value is still stale in
  ID but M4 can fix it at EX with MEM/WB forwarding. A load at distance 1 is the
  only load-use stall case.

### 1.3 M3 has no hazard unit

The M3 engine deliberately has no forwarding and no load-use stall:

- `step()` reads `readData1/readData2` once in ID and latches them into `ID/EX`.
- EX uses those latched values directly; there is no forwarding mux.
- There is no load-use freeze; the dependent instruction simply reads stale data.
- `stallCount` remains 0 in all M3 traces.
- Branches resolve in EX. A taken branch flushes the two younger instructions and
  increments `flushCount` by 2.

That is expected for M3. The rest of this document is the M4 contract that
replaces this limitation without changing the architectural model.

---

## 2. Inputs guaranteed by `src/models.js`

The hazard unit must read only these documented fields. It must not re-decode
`instruction` words; `src/control.js` already normalises unused fields to zero
(`rd = 0` for S/B, `rs2 = 0` for I-type).

### 2.1 Pipeline registers

| Register | Field | Type | Hazard-unit use |
|---|---|---|---|
| `IF_ID` | `valid` | boolean | A bubble in ID must not create a hazard. |
| `IF_ID` | `rs1`, `rs2` | uint5 | Load-use comparison against the instruction in EX. |
| `IF_ID` | `pc`, `instruction` | uint32 | Diagnostics and trace only. |
| `ID_EX` | `valid` | boolean | No consumer in EX means no forwarding. |
| `ID_EX` | `rs1`, `rs2` | uint5 | Forwarding comparisons. `rs2` is also the store-data source. |
| `ID_EX` | `rd` | uint5 | Load-use producer index; used only with `memRead`. |
| `ID_EX` | `readData1`, `readData2` | int32 | Original operands when no forwarding is selected. |
| `ID_EX` | `immediate` | int32 | ALU operand B when `aluSrc == 1`; branch displacement. |
| `ID_EX` | `ctrl.memRead` | 0/1 | Load-use detection. |
| `ID_EX` | `ctrl.memWrite` | 0/1 | Identifies a store whose `readData2` is store data. |
| `ID_EX` | `ctrl.branch` | 0/1 | Branch operand forwarding. |
| `ID_EX` | `ctrl.branchType` | `BEQ`/`BNE`/`BGE`/null | Branch comparator selection. |
| `ID_EX` | `ctrl.aluSrc` | 0/1 | Selects whether ForwardB feeds ALU input B or store data. |
| `ID_EX` | `ctrl.aluOp` | string | EX operation (ADD/SUB/AND/OR/NOT/SLL). |
| `EX_MEM` | `valid` | boolean | A bubble cannot forward. |
| `EX_MEM` | `rd` | uint5 | Producer index. |
| `EX_MEM` | `aluResult` | int32 | Forward value for ALU results and effective addresses. |
| `EX_MEM` | `writeData` | int32 | Forward value for store data. |
| `EX_MEM` | `ctrl.regWrite` | 0/1 | Producer must actually write. |
| `EX_MEM` | `ctrl.memRead` | 0/1 | A load in EX/MEM has an address, not data; do not forward it as an ALU result. |
| `MEM_WB` | `valid` | boolean | A bubble cannot forward. |
| `MEM_WB` | `rd` | uint5 | Producer index. |
| `MEM_WB` | `writeBackValue` | int32 | The only value forwarded from MEM/WB (already selected from ALU or load data). |
| `MEM_WB` | `ctrl.regWrite` | 0/1 | Producer must actually write. |

### 2.2 Control input

| Input | Type | Meaning |
|---|---|---|
| `forwardingEnabled` | boolean | UI toggle. `true` enables EX/MEM and MEM/WB forwarding. `false` forces every true RAW dependency to stall. |

### 2.3 Non-inputs

The hazard unit must not use:

- `assemblyText`, `mnemonic`, `sourceLine` - display only.
- `IF_ID.rd` / `IF_ID.funct3` / `IF_ID.funct7` - the hazard unit needs only
  `IF_ID.rs1`, `IF_ID.rs2`, `ID_EX` and the two producer latches.
- A register-index comparison without the `rd !== 0` guard - `noto` writes are
  discarded and must never generate a hazard.

---

## 3. Outputs (M4 API)

The contract uses a single exported entry point. Names are suggestions for
`src/hazard.js`; the behaviour is normative.

```js
export const FORWARD = Object.freeze({
  NONE:   0b00, // use ID/EX.readData1 or ID/EX.readData2
  MEM_WB: 0b01, // use MEM_WB.writeBackValue
  EX_MEM: 0b10  // use EX_MEM.aluResult / EX_MEM.writeData
});

export function detectHazards(cpu, { forwardingEnabled = true } = {}) {
  // cpu is CPUState from src/models.js
  // returns the object below; must not mutate cpu
}
```

Return object:

| Field | Type | Meaning |
|---|---|---|
| `forwardA` | `FORWARD` | Selector for EX ALU operand A (and branch `rs1`). |
| `forwardB` | `FORWARD` | Selector for EX ALU operand B when `aluSrc == 0`; for `readData2` / store data when the consumer is a store. |
| `loadUseStall` | boolean | One-cycle freeze required: freeze PC and `IF/ID`; insert a bubble into `ID/EX`. |
| `freezePC` | boolean | Pipeline control; `true` exactly when `loadUseStall` (and on no-forwarding RAW stalls). |
| `freezeIFID` | boolean | Pipeline control; `true` exactly when `loadUseStall` (and on no-forwarding RAW stalls). |
| `flushIDEX` | boolean | Pipeline control; `true` when a stall inserts a bubble into EX. |
| `flushIFID` | boolean | Control-hazard output: branch taken, squash the instruction in IF/ID. |
| `redirectPC` | boolean | Control-hazard output: branch taken, next PC is `branchTarget`. |
| `branchTaken` | boolean | Optional convenience mirror of EX branch resolution. |
| `branchTarget` | uint32 | `ID_EX.pc + ID_EX.immediate`, valid when `branchTaken`. |
| `hazards` | array | Diagnostic list; one entry per detected condition (see below). |

Each `hazards` entry should be:

```js
{
  type: 'LOAD_USE' | 'RAW_EX_MEM' | 'RAW_MEM_WB' | 'STORE_DATA' | 'BRANCH',
  consumer: 'ID' | 'EX',
  producerIndex: 1 | 2 | null, // 1 = EX/MEM, 2 = MEM/WB
  register: 0,                 // 1-31
  operand: 'rs1' | 'rs2',
  action: 'STALL' | 'FORWARD_EX_MEM' | 'FORWARD_MEM_WB' | 'FLUSH'
}
```

The diagnostic array is for the hazard view (B5) and tests; it is not used by
the datapath muxes.

### 3.1 `flushIDEX` vs `flushIFID`

- A load-use stall sets `flushIDEX = true` because the instruction that would
  enter EX is replaced by a bubble while the consumer stays in `IF/ID`.
- A taken branch sets `flushIFID = true` and `redirectPC = true`. The pipeline
  also drops the instruction that would be decoded into `ID/EX`, which is why
  `docs/PIPELINE_REGISTERS.md` and `docs/M2_SIMULATOR_DESIGN.md` describe a
  two-instruction flush. If the Pipeline Lead keeps branch resolution in
  `pipeline.js`, these fields are informational and the existing
  `branchTaken/branchTarget` path may be used instead; the hazard view must
  still be able to display them.

---

## 4. Detection conditions and priority

### 4.1 Load-use (checked first)

```text
LOAD_USE = IF_ID.valid
        && ID_EX.valid
        && ID_EX.ctrl.memRead == 1
        && ID_EX.rd != 0
        && (ID_EX.rd == IF_ID.rs1 || ID_EX.rd == IF_ID.rs2)
```

The load is the instruction in EX (`ID_EX`); the dependent instruction is in ID
(`IF_ID`). This is the only distance-1 load case. Action: `loadUseStall = true`,
freeze PC and `IF/ID`, flush `ID/EX` (bubble). No EX/MEM forwarding is allowed
for this case because `EX_MEM.aluResult` will hold the load address, not the
loaded word.

A load at distance 2 (`MEM_WB` producer) is **not** a load-use stall. It is fixed
by MEM/WB forwarding at EX.

### 4.2 RAW forwarding from EX/MEM

The producer is the younger instruction currently in MEM. EX/MEM wins when both
producers match.

```text
EX_MEM can forward when:
  EX_MEM.valid
  && EX_MEM.ctrl.regWrite == 1
  && EX_MEM.rd != 0
  && EX_MEM.ctrl.memRead == 0        // never forward a load's address as data

forwardA = EX_MEM  if EX_MEM.rd == ID_EX.rs1
forwardB = EX_MEM  if EX_MEM.rd == ID_EX.rs2
```

For a store consumer, `forwardB` selects `EX_MEM.aluResult` for an ALU store, but
the store data source is `readData2`. The EX stage must apply `forwardB` to the
store-data path as well; see 5.2.

### 4.3 RAW forwarding from MEM/WB

The producer is the instruction in WB and is also the value already selected
from ALU or memory.

```text
MEM_WB can forward when:
  MEM_WB.valid
  && MEM_WB.ctrl.regWrite == 1
  && MEM_WB.rd != 0

forwardA = MEM_WB  if MEM_WB.rd == ID_EX.rs1
forwardB = MEM_WB  if MEM_WB.rd == ID_EX.rs2
```

A load in MEM/WB is safe to forward because `MEM_WB.writeBackValue` is `memData`
when `memToReg == 1`.

### 4.4 Priority

```text
1. Check load-use. If true: stall; do not compute forwarding for the consumer.
2. Else if EX_MEM matches operand A: forwardA = EX_MEM; never fall through to
   MEM_WB for that operand.
3. Else if MEM_WB matches operand A: forwardA = MEM_WB.
4. Repeat 2-3 independently for operand B.
```

Rules:

- EX/MEM is the younger producer and takes priority when both match.
- `rd == 0` never matches, regardless of the other fields.
- A store's `rs2` is data, not an ALU operand when `aluSrc == 1`. It still needs
  forwarding, but into the EX/MEM `writeData` path (section 5.2).
- A branch reads both operands in EX; the same ForwardA/ForwardB selectors feed
  the branch comparator. There is no third forwarding path for branches.

### 4.5 Forwarding disabled

When `forwardingEnabled == false`:

- `forwardA` and `forwardB` must stay `FORWARD.NONE`.
- Any true RAW dependency closer than distance 3 must stall instead of forward.
  A distance-1 dependency produced by `EX/MEM` needs two stall cycles; a
  distance-2 dependency produced by `MEM/WB` needs one. The exact bubble count is
  pipeline-control's responsibility, but the hazard unit must keep reporting the
  RAW until the producer has retired and `IF/ID` has been frozen through the
  required cycles.
- Load-use still stalls as in 4.1. Forwarding being off does not make a load-use
  hazard worse or better; it just prevents the later MEM/WB fix.

The UI must show the difference in `stallCount` and CPI, so M4 tests should cover
forwarding ON and OFF for the same program.

---

## 5. Integration contract for `pipeline.js`

### 5.1 Call order

The hazard unit is combinational: it reads the latches at the start of a cycle
and returns selects before EX runs. A compatible order inside `step()` is:

```text
1. Snapshot old latches (WB, MEM, EX, ID inputs).
2. WB commits old MEM/WB.
3. MEM accesses memory and forms next MEM/WB.
4. Hazard unit evaluates IF_ID, ID_EX, EX_MEM, MEM_WB, forwardingEnabled.
5. EX executes using forwardA/forwardB and branch outputs.
6. ID decodes; if loadUseStall, do not latch a new ID/EX (latch a bubble) and
   freeze IF/ID/PC; otherwise latch decoded ID/EX.
7. IF fetches; if redirectPC, fetch is squashed and PC = branchTarget.
8. Latch all registers once.
```

Step 4 uses the **old** `EX/MEM` and `MEM/WB` latches (the producers), and the
**old** `ID_EX` (consumer). It must not use the newly computed `next` registers.

### 5.2 Operand muxes

```text
EX ALU input A = forwardA == NONE    ? ID_EX.readData1
               : forwardA == EX_MEM  ? EX_MEM.aluResult
               : forwardA == MEM_WB  ? MEM_WB.writeBackValue
               : ID_EX.readData1

EX ALU input B = ID_EX.ctrl.aluSrc == 1 ? ID_EX.immediate
               : forwardB == NONE       ? ID_EX.readData2
               : forwardB == EX_MEM     ? EX_MEM.aluResult
               : forwardB == MEM_WB     ? MEM_WB.writeBackValue
               : ID_EX.readData2

Store data = forwardB == NONE    ? ID_EX.readData2
           : forwardB == EX_MEM  ? EX_MEM.aluResult   // store-to-store or ALU producer
           : forwardB == MEM_WB  ? MEM_WB.writeBackValue
           : ID_EX.readData2
```

For a store whose data comes from a preceding load, the load-use stall covers
distance 1; MEM/WB forwards distance 2. For a store writing an ALU result that
is only in `EX_MEM`, `EX_MEM.aluResult` is the store data. `EX_MEM.writeData` is
the already-forwarded data of the previous store and is the correct source when
the consumer is a store and the producer is an older store; if `EX_MEM` is a
store, `EX_MEM.writeData` should be used for a store-data forward instead of
`EX_MEM.aluResult`. Implementations must document which convention they use; the
simulator's M4 tests should pin it.

### 5.3 Load-use freeze

```text
loadUseStall:
  PC        <- hold
  IF_ID     <- hold (consumer remains in ID)
  ID_EX     <- bubble
  cycle proceeds; no architectural write from the bubble
```

This is the only case where `ID_EX.flush()` is used as a hazard action. A branch
flush also flushes `IF_ID` and discards the next `ID_EX`.

### 5.4 Branch/control hazard

Branches resolve in EX. The branch instruction is in `ID_EX`; the two younger
instructions are in `IF_ID` and in the current IF fetch. On `branchTaken`:

```text
branchTarget = (ID_EX.pc + ID_EX.immediate) >>> 0
flush IF_ID
discard next ID_EX
PC <- branchTarget
flushCount += 2
```

Branch operands must use the same forwarding selects as ALU inputs. Without
forwarding, program 3 shows the failure mode: the final `kholo_ho` compares the
stale `r1 = 0` before the preceding `tlosa` writes `-1`, so it takes an extra
iteration. That is an expected M3 result, not an M4 contract behaviour.

---

## 6. M4 test matrix (for `tests/hazard_test.js` when Test Lead approves)

Issue #27 makes the test stub optional. When it is added, extend `npm test` in
`package.json` so it actually runs. Minimum cases:

| ID | Setup | Expected |
|---|---|---|
| H1 | ALU producer in EX/MEM, consumer in EX, `rd == rs1` | `forwardA = EX_MEM`, `forwardB = NONE`. |
| H2 | ALU producer in EX/MEM, consumer in EX, `rd == rs2` | `forwardB = EX_MEM`. |
| H3 | Producer in MEM/WB, consumer in EX, distance 2 | `forwardA/B = MEM_WB`. |
| H4 | Both EX/MEM and MEM/WB match the same operand | `EX_MEM` wins. |
| H5 | Producer is `r0` | no forwarding, no stall. |
| H6 | Load in EX, dependent in ID | `loadUseStall = true`, freeze, `flushIDEX`, no forwarding. |
| H7 | Load in MEM/WB, dependent in EX (distance 2) | `MEM_WB` forward, no stall. |
| H8 | Load in EX, independent instruction in ID | no stall. |
| H9 | Store data from a preceding load (distance 1) | stall; no store. |
| H10 | Branch operands at distance 1/2 | correct forwarding; branch decision uses new values. |
| H11 | `forwardingEnabled = false`, distance 1 | no forward; stall until WB-before-ID, 2 cycles. |
| H12 | `forwardingEnabled = false`, distance 2 | no forward; 1 stall cycle. |
| H13 | Taken branch | `flushIFID`, `redirectPC`, target correct; `flushCount += 2`. |
| H14 | Not-taken branch | no flush, no redirect. |

The tests must assert both the returned selectors and the diagnostic `hazards`
array (type, producer index, register, operand).

---

## 7. M3 hand verification

### 7.1 How the traces were produced

```text
Assemble each examples/*.limo with src/assembler.js.
Load the words into LimoPipeline from PR #31 (commit a43a7ce).
Install program2 preloaded data: Memory[100] = 21.
Step until LimoPipeline.isHalted.
Record every cycle's IF/ID/EX/MEM/WB stage and the WB write.
```

No stalls, no forwarding, and no manual state edits were used. The traces below
are the output of that run, with instructions numbered `i0`, `i1`, ... in
assembly order.

### 7.2 Summary

| Example | Words | M3 cycles | Retired | RAW < 3 | M3 result | Status |
|---|---:|---:|---:|---|---|---|
| `program1_arithmetic.limo` | 5 | 9 | 5 | yes | `r3 = 0`, `r4 = 12`, `r5 = 0` (expected `17`, `7`, `1`) | Expected incorrect until M4. |
| `program2_memory.limo` | 4 | 8 | 4 | yes | `r2 = 0`, `r3 = 0`, `Memory[104] = 0` (expected `21`, `42`, `42`) | Expected incorrect until M4. |
| `program3_loop.limo` | 7 | 36 | 22 | yes, including a branch operand | `r5 = 15` (correct sum) but `r1 = -1` and 10 flushes (expected `r1 = 0`) | Expected incorrect until M4. |
| `program4_hazard_free.limo` | 9 | 13 | 9 | no | `r1=5 r2=7 r3=9 r4=11 r5=12 r6=3 r7=4 r8=15 r10=6` | **Hazard-free PASS.** |
| `test_all_instructions.limo` | 17 | 23 | 15 | yes | See 7.7; branches and values differ from the intended all-instructions test | Expected incorrect until M4. |

### 7.3 `program1_arithmetic.limo`

True dependencies closer than distance 3:

| Consumer | Reads | Producer(s) and distance | Consequence in M3 |
|---|---|---|---|
| `i2 kopanya r3, r1, r2` | `r1` | `i0` `d=2` HAZARD | `r1` still 0 at ID, `r3 = 0`. |
| `i2 kopanya r3, r1, r2` | `r2` | `i1` `d=1` HAZARD | `r2` still 0, `r3 = 0`. |
| `i3 tlosa r4, r1, r2` | `r2` | `i1` `d=2` HAZARD | `r2` still 0, so `r4 = 12 - 0 = 12`. |
| `i4 le r5, r3, r4` | `r3` | `i2` `d=2` HAZARD | `r3` still 0. |
| `i4 le r5, r3, r4` | `r4` | `i3` `d=1` HAZARD | `r4` still 0, `r5 = 0`. |

`i0 -> i3` (`r1`, `d=3`) is safe because WB and ID occur in the same cycle. It
does not rescue `i3`, because its other operand `r2` is still stale.

| Cycle | IF | ID | EX | MEM | WB |
|---:|---|---|---|---|---|
| 1 | i0 @0x0 | - | - | - | - |
| 2 | i1 @0x4 | i0 kopanya_hang | - | - | - |
| 3 | i2 @0x8 | i1 kopanya_hang | i0 kopanya_hang -> 12 | - | - |
| 4 | i3 @0xc | i2 kopanya | i1 kopanya_hang -> 5 | i0 kopanya_hang | - |
| 5 | i4 @0x10 | i3 tlosa | i2 kopanya -> 0 | i1 kopanya_hang | i0 kopanya_hang r1=12 |
| 6 | - | i4 le | i3 tlosa -> 12 | i2 kopanya | i1 kopanya_hang r2=5 |
| 7 | - | - | i4 le -> 0 | i3 tlosa | i2 kopanya r3=0 |
| 8 | - | - | - | i4 le | i3 tlosa r4=12 |
| 9 | - | - | - | - | i4 le r5=0 |

Final: `r1=12 r2=5 r3=0 r4=12 r5=0`, 9 cycles, 5 retired, 0 flushes, 0 stalls.
Expected after M4: `r1=12 r2=5 r3=17 r4=7 r5=1`.

### 7.4 `program2_memory.limo`

Preloaded `Memory[100] = 21`.

| Consumer | Reads | Producer(s) and distance | Consequence in M3 |
|---|---|---|---|
| `i1 bala r2, 0(r1)` | `r1` | `i0` `d=1` HAZARD | Address is 0, not 100; load reads `Memory[0] = 0`. |
| `i2 kopanya r3, r2, r2` | `r2` | `i1` `d=1` HAZARD (load-use) | `r2` is 0 at ID, `r3 = 0`. |
| `i3 boloka r3, 4(r1)` | `r3` (store data) | `i2` `d=1` HAZARD | Store writes 0, not 42. |
| `i3 boloka r3, 4(r1)` | `r1` (base) | `i0` `d=3` safe | Base 100 is available. |

| Cycle | IF | ID | EX | MEM | WB |
|---:|---|---|---|---|---|
| 1 | i0 @0x0 | - | - | - | - |
| 2 | i1 @0x4 | i0 kopanya_hang | - | - | - |
| 3 | i2 @0x8 | i1 bala | i0 kopanya_hang -> 100 | - | - |
| 4 | i3 @0xc | i2 kopanya | i1 bala -> 0 | i0 kopanya_hang | - |
| 5 | - | i3 boloka | i2 kopanya -> 0 | i1 bala | i0 kopanya_hang r1=100 |
| 6 | - | - | i3 boloka -> 104 | i2 kopanya | i1 bala r2=0 |
| 7 | - | - | - | i3 boloka | i2 kopanya r3=0 |
| 8 | - | - | - | - | i3 boloka |

Final: `r1=100 r2=0 r3=0`, `Memory[100]=21`, `Memory[104]=0`, 8 cycles,
4 retired, 0 flushes, 0 stalls. Expected after M4: `r2=21`, `r3=42`,
`Memory[104]=42`.

### 7.5 `program3_loop.limo`

Program 3 is not hazard-free even though its loop spacing looks wide. The
critical dependency is inside the loop and is **dynamic**:

| Consumer | Reads | Producer and distance | Consequence in M3 |
|---|---|---|---|
| `i4 kopanya r5, r5, r1` | `r5` | `i3` `d=1` on the first iteration | First iteration reads `r5 = 0`; that happens to be the intended initial value. |
| `i6 kholo_ho r1, r3, boelela` | `r1` | preceding `i5 tlosa` `d=1` **on every iteration** | Branch compares the old `r1`, not the just-decremented value. On the final iteration it sees `r1 = 0` instead of `-1` (or rather it sees the previous value at the point where the new value should decide the exit), so it takes one extra iteration and ends at `r1 = -1`. |
| `i5 tlosa r1, r1, r2` | `r1` | previous iteration's `i5` through the loop | Spacing plus WB-before-ID normally makes this safe; the branch hazard above still corrupts the exit. |

| Cycle | IF | ID | EX | MEM | WB |
|---:|---|---|---|---|---|
| 1 | i0 @0x0 | - | - | - | - |
| 2 | i1 @0x4 | i0 kopanya_hang | - | - | - |
| 3 | i2 @0x8 | i1 kopanya_hang | i0 kopanya_hang -> 5 | - | - |
| 4 | i3 @0xc | i2 kopanya_hang | i1 kopanya_hang -> 1 | i0 kopanya_hang | - |
| 5 | i4 @0x10 | i3 kopanya_hang | i2 kopanya_hang -> 1 | i1 kopanya_hang | i0 kopanya_hang r1=5 |
| 6 | i5 @0x14 | i4 kopanya | i3 kopanya_hang -> 0 | i2 kopanya_hang | i1 kopanya_hang r2=1 |
| 7 | i6 @0x18 | i5 tlosa | i4 kopanya -> 5 | i3 kopanya_hang | i2 kopanya_hang r3=1 |
| 8 | - | i6 kholo_ho | i5 tlosa -> 4 | i4 kopanya | i3 kopanya_hang r5=0 |
| 9 | flush | - | i6 kholo_ho -> 6 | i5 tlosa | i4 kopanya r5=5 |
| 10 | i4 @0x10 | - | - | i6 kholo_ho | i5 tlosa r1=4 |
| 11 | i5 @0x14 | i4 kopanya | - | - | i6 kholo_ho |
| 12 | i6 @0x18 | i5 tlosa | i4 kopanya -> 9 | - | - |
| 13 | - | i6 kholo_ho | i5 tlosa -> 3 | i4 kopanya | - |
| 14 | flush | - | i6 kholo_ho -> 5 | i5 tlosa | i4 kopanya r5=9 |
| 15 | i4 @0x10 | - | - | i6 kholo_ho | i5 tlosa r1=3 |
| 16 | i5 @0x14 | i4 kopanya | - | - | i6 kholo_ho |
| 17 | i6 @0x18 | i5 tlosa | i4 kopanya -> 12 | - | - |
| 18 | - | i6 kholo_ho | i5 tlosa -> 2 | i4 kopanya | - |
| 19 | flush | - | i6 kholo_ho -> 4 | i5 tlosa | i4 kopanya r5=12 |
| 20 | i4 @0x10 | - | - | i6 kholo_ho | i5 tlosa r1=2 |
| 21 | i5 @0x14 | i4 kopanya | - | - | i6 kholo_ho |
| 22 | i6 @0x18 | i5 tlosa | i4 kopanya -> 14 | - | - |
| 23 | - | i6 kholo_ho | i5 tlosa -> 1 | i4 kopanya | - |
| 24 | flush | - | i6 kholo_ho -> 3 | i5 tlosa | i4 kopanya r5=14 |
| 25 | i4 @0x10 | - | - | i6 kholo_ho | i5 tlosa r1=1 |
| 26 | i5 @0x14 | i4 kopanya | - | - | i6 kholo_ho |
| 27 | i6 @0x18 | i5 tlosa | i4 kopanya -> 15 | - | - |
| 28 | - | i6 kholo_ho | i5 tlosa -> 0 | i4 kopanya | - |
| 29 | flush | - | i6 kholo_ho -> 2 | i5 tlosa | i4 kopanya r5=15 |
| 30 | i4 @0x10 | - | - | i6 kholo_ho | i5 tlosa r1=0 |
| 31 | i5 @0x14 | i4 kopanya | - | - | i6 kholo_ho |
| 32 | i6 @0x18 | i5 tlosa | i4 kopanya -> 15 | - | - |
| 33 | - | i6 kholo_ho | i5 tlosa -> -1 | i4 kopanya | - |
| 34 | - | - | i6 kholo_ho -> 1 | i5 tlosa | i4 kopanya r5=15 |
| 35 | - | - | - | i6 kholo_ho | i5 tlosa r1=-1 |
| 36 | - | - | - | - | i6 kholo_ho |

Final: `r1=-1 r2=1 r3=1 r5=15`, 36 cycles, 22 retired, 10 flushes,
0 stalls. The sum is accidentally correct because the extra iteration adds 0;
the counter is not. Expected after M4: `r1=0`, `r5=15`, and the loop exits once.
Do not fix this by editing the program; fix it in the M4 hazard unit.

### 7.6 `program4_hazard_free.limo`

Every true dependency is at distance 3 or more:

| Consumer | Reads | Producer(s) and distance | Safe? |
|---|---|---|---|
| `i4 kopanya r5, r1, r2` | `r1` | `i0` `d=4` | yes |
| `i4 kopanya r5, r1, r2` | `r2` | `i1` `d=3` | yes, WB-before-ID same cycle |
| `i8 kapa r8, r5, r6` | `r5` | `i4` `d=4` | yes |
| `i8 kapa r8, r5, r6` | `r6` | `i5` `d=3` | yes, WB-before-ID same cycle |

| Cycle | IF | ID | EX | MEM | WB |
|---:|---|---|---|---|---|
| 1 | i0 @0x0 | - | - | - | - |
| 2 | i1 @0x4 | i0 kopanya_hang | - | - | - |
| 3 | i2 @0x8 | i1 kopanya_hang | i0 kopanya_hang -> 5 | - | - |
| 4 | i3 @0xc | i2 kopanya_hang | i1 kopanya_hang -> 7 | i0 kopanya_hang | - |
| 5 | i4 @0x10 | i3 kopanya_hang | i2 kopanya_hang -> 9 | i1 kopanya_hang | i0 kopanya_hang r1=5 |
| 6 | i5 @0x14 | i4 kopanya | i3 kopanya_hang -> 11 | i2 kopanya_hang | i1 kopanya_hang r2=7 |
| 7 | i6 @0x18 | i5 kopanya_hang | i4 kopanya -> 12 | i3 kopanya_hang | i2 kopanya_hang r3=9 |
| 8 | i7 @0x1c | i6 kopanya_hang | i5 kopanya_hang -> 3 | i4 kopanya | i3 kopanya_hang r4=11 |
| 9 | i8 @0x20 | i7 kopanya_hang | i6 kopanya_hang -> 4 | i5 kopanya_hang | i4 kopanya r5=12 |
| 10 | - | i8 kapa | i7 kopanya_hang -> 6 | i6 kopanya_hang | i5 kopanya_hang r6=3 |
| 11 | - | - | i8 kapa -> 15 | i7 kopanya_hang | i6 kopanya_hang r7=4 |
| 12 | - | - | - | i8 kapa | i7 kopanya_hang r10=6 |
| 13 | - | - | - | - | i8 kapa r8=15 |

Final: `r1=5 r2=7 r3=9 r4=11 r5=12 r6=3 r7=4 r8=15 r10=6`, 13 cycles,
9 retired, 0 flushes, 0 stalls. This matches the file header and is the
hazard-free acceptance case for M3.

### 7.7 `test_all_instructions.limo`

This program is an instruction/orthography smoke test, not a hazard-free
program. Its branches are also affected by stale operands, so its dynamic path
is not the intended "all 12 instructions" path.

True dependencies closer than distance 3 (static instruction indices):

| Consumer | Reads | Producer(s) and distance |
|---|---|---|
| `i1 checha_hang_leqeleng` | `r1` | `i0` `d=1` |
| `i2 kopanya` | `r1`, `r2` | `i0` `d=2`, `i1` `d=1` |
| `i3 tlosa` | `r3` | `i2` `d=1` |
| `i8 boloka` | `r2` (base), `r6` (data) | `i7` `d=1`, `i5` `d=3` |
| `i9 bala` | `r2` (base) | `i7` `d=2` |
| `i10 lekana` | `r8` | `i9` `d=1` (load-use) |

`i4`/`i5`/`i6` read `r1`/`r2` at distances 4-6, which are safe; the damage is
already done by `i1`/`i2`.

| Cycle | IF | ID | EX | MEM | WB |
|---:|---|---|---|---|---|
| 1 | i0 @0x0 | - | - | - | - |
| 2 | i1 @0x4 | i0 kopanya_hang | - | - | - |
| 3 | i2 @0x8 | i1 checha_hang_leqeleng | i0 kopanya_hang -> 20 | - | - |
| 4 | i3 @0xc | i2 kopanya | i1 checha_hang_leqeleng -> 0 | i0 kopanya_hang | - |
| 5 | i4 @0x10 | i3 tlosa | i2 kopanya -> 0 | i1 checha_hang_leqeleng | i0 kopanya_hang r1=20 |
| 6 | i5 @0x14 | i4 le | i3 tlosa -> -20 | i2 kopanya | i1 checha_hang_leqeleng r2=0 |
| 7 | i6 @0x18 | i5 kapa | i4 le -> 0 | i3 tlosa | i2 kopanya r3=0 |
| 8 | i7 @0x1c | i6 hase | i5 kapa -> 20 | i4 le | i3 tlosa r4=-20 |
| 9 | i8 @0x20 | i7 kopanya_hang | i6 hase -> -21 | i5 kapa | i4 le r5=0 |
| 10 | i9 @0x24 | i8 boloka | i7 kopanya_hang -> 200 | i6 hase | i5 kapa r6=20 |
| 11 | i10 @0x28 | i9 bala | i8 boloka -> 0 | i7 kopanya_hang | i6 hase r7=-21 |
| 12 | i11 @0x2c | i10 lekana | i9 bala -> 0 | i8 boloka | i7 kopanya_hang r2=200 |
| 13 | i12 @0x30 | i11 kopanya_hang | i10 lekana -> 20 | i9 bala | i8 boloka |
| 14 | i13 @0x34 | i12 hali_lekane | i11 kopanya_hang -> 99 | i10 lekana | i9 bala r8=20 |
| 15 | flush | i13 kopanya_hang | i12 hali_lekane -> 220 | i11 kopanya_hang | i10 lekana |
| 16 | i14 @0x38 | - | - | i12 hali_lekane | i11 kopanya_hang r9=99 |
| 17 | i15 @0x3c | i14 kholo_ho | - | - | i12 hali_lekane |
| 18 | flush | i15 kopanya_hang | i14 kholo_ho -> 220 | - | - |
| 19 | i16 @0x40 | - | - | i14 kholo_ho | - |
| 20 | - | i16 kopanya_hang | - | - | i14 kholo_ho |
| 21 | - | - | i16 kopanya_hang -> 1 | - | - |
| 22 | - | - | - | i16 kopanya_hang | - |
| 23 | - | - | - | - | i16 kopanya_hang r12=1 |

Final: `r1=20 r2=200 r4=-20 r6=20 r7=-21 r8=20 r9=99 r12=1`,
`Memory[0]=20`, 23 cycles, 15 retired, 4 flushes, 0 stalls. The `r1 = 20`
value and the branch path show that the early shift/branch dependencies are
stale. Expected incorrect until M4.

---

## 8. Hand-off checklist for the M4 implementer

1. Implement `src/hazard.js` with `detectHazards(cpu, { forwardingEnabled })`
   returning the fields in section 3.
2. Keep the input reads exactly as section 2; do not decode raw words.
3. Apply priority exactly as section 4.4: load-use first, then EX/MEM over
   MEM/WB, independently for A and B.
4. Wire the selectors into EX (section 5.2), including store data and branch
   comparators.
5. Wire `loadUseStall` into PC/IF-ID freeze and ID/EX bubble (section 5.3).
6. Keep branch flush behaviour in EX; only mirror it as hazard diagnostics if
   the Pipeline Lead wants it in the hazard view.
7. Add the test matrix in section 6 after the Test Lead agrees to extend
   `npm test`.
8. Re-run the traces in section 7 after implementation. Programs 1-3 and
   `test_all_instructions` must start producing the values in their headers;
   program 4 must stay unchanged at 13 cycles with 9 retired.

## 9. Open review questions

- Pipeline Lead: does `flushIFID`/`redirectPC` live in `hazard.js`, or does
  `pipeline.js` keep branch resolution and the hazard unit only reports branch
  diagnostics? The rest of the contract is independent of that choice.
- Test Lead: do we add `tests/hazard_test.js` and change `npm test` to run both
  files, or keep the contract doc as the M3 deliverable and add tests in M4?
- UI Lead: where does the forwarding ON/OFF toggle live in the M4 control bar,
  and should the hazard view show the `hazards` array verbatim?
