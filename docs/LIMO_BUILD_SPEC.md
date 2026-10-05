# LIMO Simulator — Build Prompt

You are building **LIMO**: a browser-based, five-stage pipeline simulator for a custom RISC-V-derived processor whose assembly language uses Sesotho mnemonics. The entire application runs in the browser with no server, no login, and no external dependencies beyond what is fetched from a CDN. It must be publishable directly to GitHub Pages.

---

## Constraints

- Pure frontend: HTML + CSS + JavaScript (or TypeScript compiled to JS). No backend, no Node server at runtime.
- Total bundle must be under 2 MB.
- Must work on a modern phone over a slow connection.
- No frameworks that require a build step unless you also provide the build config and compiled output. Vanilla JS or a lightweight bundler (Vite) is preferred.
- Repo structure: all source in `/src`, tests in `/tests`, example programs in `/examples`. The GitHub Pages entry point is `index.html` at the repo root, or `/docs/index.html` if using the docs folder deploy method.
- Every test must be runnable with one command: `npm test`.

---

## The LIMO ISA — complete specification

### Core properties

| Property | Value |
|----------|-------|
| Word size | 32 bits |
| Memory | Byte-addressed, little-endian, word-aligned |
| Instruction size | Fixed 32 bits |
| Registers | 32 general-purpose (r0–r31) |
| Register field width | 5 bits |
| Instruction formats | R, I, S, B |

### Register file

| Number | Name | Role |
|--------|------|------|
| r0 | `noto` | Hardwired zero — writes are silently discarded |
| r1 | `khutla_aterese` | Return address |
| r2 | `ts'upiso_phaello` | Stack pointer |
| r3 | `ts'upiso_kakaretso` | Global pointer |
| r4–r7 | `li_khang` | Argument registers |
| r8–r9 | `li_phetho` | Return value registers |
| r10–r15 | `li_nakoana` | Temporary registers |
| r16–r31 | `li_boloka` | Saved registers |

The PC is a separate 32-bit register named `sebali_tsamaiso`. It is not addressable as a numbered register.

### Instruction formats

```
R-type: [funct7:7][rs2:5][rs1:5][funct3:3][rd:5][opcode:7]
I-type: [imm[11:0]:12][rs1:5][funct3:3][rd:5][opcode:7]
S-type: [imm[11:5]:7][rs2:5][rs1:5][funct3:3][imm[4:0]:5][opcode:7]
B-type: [imm[12]:1][imm[10:5]:6][rs2:5][rs1:5][funct3:3][imm[4:1]:4][imm[11]:1][opcode:7]
```

B-type encodes a 13-bit signed byte offset. Bit 0 is always 0 (word-aligned targets). Branch reach: ±4 KB.

### Opcode table

| Format | Opcode (binary) |
|--------|----------------|
| R | `1001101` |
| I | `1001001` |
| S | `0101101` |
| B | `1001110` |

### Instruction encodings

**R-type (opcode = `1001101`)**

| Mnemonic | Meaning | funct3 | funct7 | Operation |
|----------|---------|--------|--------|-----------|
| `kopanya` | add | `000` | `0000000` | rd = rs1 + rs2 |
| `tlosa` | subtract | `000` | `0000001` | rd = rs1 − rs2 |
| `le` | AND | `001` | `0000010` | rd = rs1 & rs2 |
| `kapa` | OR | `101` | `0000011` | rd = rs1 \| rs2 |
| `hase` | NOT | `010` | `0000100` | rd = ~rs1 (rs2 field = 00000, ignored) |

**I-type (opcode = `1001001`)**

| Mnemonic | Meaning | funct3 | Operation |
|----------|---------|--------|-----------|
| `bala` | load word | `000` | rd = Memory[rs1 + imm] |
| `kopanya_hang` | add immediate | `100` | rd = rs1 + SignExt(imm) |
| `checha_hang_leqeleng` | shift left immediate | `101` | rd = rs1 << imm[4:0] |

**S-type (opcode = `0101101`)**

| Mnemonic | Meaning | funct3 | Operation |
|----------|---------|--------|-----------|
| `boloka` | store word | `000` | Memory[rs1 + imm] = rs2 |

**B-type (opcode = `1001110`)**

| Mnemonic | Meaning | funct3 | Operation |
|----------|---------|--------|-----------|
| `kholo_ho` | branch ≥ | `000` | if rs1 ≥ rs2 (signed): PC = PC + offset |
| `nyane_ho` | branch ≤ | `001` | if rs1 ≤ rs2 (signed): PC = PC + offset |
| `lekana` | branch == | `010` | if rs1 == rs2: PC = PC + offset |

### Immediate sign-extension

All immediates are sign-extended to 32 bits before use. For B-type, reconstruct the 13-bit offset as:
```
offset = SignExt({ imm[12], imm[11], imm[10:5], imm[4:1], 1'b0 }, 13)
```

### Assembler syntax

```
# comment
label:
    kopanya   rd, rs1, rs2       # R-type
    kopanya_hang rd, rs1, imm    # I-type (decimal or 0x hex)
    bala      rd, imm(rs1)       # I-type load
    boloka    rs2, imm(rs1)      # S-type store
    lekana    rs1, rs2, label    # B-type branch
```

Registers may be written as `r0`–`r31` or by their Sesotho names. Labels are identifiers containing letters, digits, underscores, or apostrophes. The apostrophe is a valid identifier character (Sesotho digraphs like `ts'` must tokenise as part of the identifier, not as a delimiter). Comments begin with `#`.

---

## Pipeline architecture

Five stages: **IF → ID → EX → MEM → WB**

Pipeline registers between stages: **IF/ID**, **ID/EX**, **EX/MEM**, **MEM/WB**.

### Stage behaviour

**IF — Instruction Fetch**
- Fetch 32-bit instruction from instruction memory at PC
- Increment PC by 4
- Write instruction and PC+4 into IF/ID

**ID — Instruction Decode**
- Decode opcode, funct3, funct7, rs1, rs2, rd, immediate
- Read rs1 and rs2 from register file
- Generate control signals: `RegWrite`, `ALUSrc`, `ALUCtrl`, `MemRead`, `MemWrite`, `MemToReg`, `Branch`, `PCSrc`
- Write decoded values and signals into ID/EX

**EX — Execute**
- Mux ALU inputs with forwarded values if applicable
- Run ALU: add, sub, and, or, not, shift-left
- Compute branch target: PC + SignExt(offset)
- Evaluate branch condition (compare rs1 and rs2)
- Set `PCSrc = 1` if branch taken
- Write ALU result, memory write data, control signals into EX/MEM

**MEM — Memory Access**
- If `MemRead`: read 32-bit word from data memory at ALU result address
- If `MemWrite`: write rs2 to data memory at ALU result address
- Word-aligned only — flag misalignment as an error
- Write loaded value (or ALU result for non-memory instructions) into MEM/WB

**WB — Write Back**
- If `RegWrite` and `MemToReg`: write memory data to rd
- If `RegWrite` and not `MemToReg`: write ALU result to rd
- Writing to r0 (`noto`) is silently discarded

---

## Hazard handling

### RAW forwarding (ForwardA / ForwardB)

Detect and forward when:
- `EX/MEM.RegWrite && EX/MEM.rd != 0 && EX/MEM.rd == ID/EX.rs1` → ForwardA = EX/MEM (from ALU result)
- `EX/MEM.RegWrite && EX/MEM.rd != 0 && EX/MEM.rd == ID/EX.rs2` → ForwardB = EX/MEM
- `MEM/WB.RegWrite && MEM/WB.rd != 0 && MEM/WB.rd == ID/EX.rs1` → ForwardA = MEM/WB (from write-back value)
- `MEM/WB.RegWrite && MEM/WB.rd != 0 && MEM/WB.rd == ID/EX.rs2` → ForwardB = MEM/WB

EX/MEM forwarding takes priority over MEM/WB when both conditions are true.

### Load-use stall

When the instruction in EX is a load (`MemRead == 1`) and its destination matches a source of the instruction in ID:
```
if (ID/EX.MemRead &&
    (ID/EX.rd == IF/ID.rs1 || ID/EX.rd == IF/ID.rs2)):
    stall: freeze PC and IF/ID, insert bubble into ID/EX
```

### Branch flush (EX resolution)

LIMO resolves branches in EX. When a branch is taken (`PCSrc = 1`):
- Flush the two instructions that entered IF and ID behind the branch
- Set PC to the branch target
- Flushing = replace those pipeline register contents with NOPs/bubbles

### Forwarding ON/OFF switch

The UI exposes a toggle to disable forwarding. When OFF, every RAW hazard must stall instead of forward. This makes the CPI cost of each hazard visible.

---

## What to build

### B1 — Editor and assembler

- A text editor where the user types or pastes LIMO assembly, or opens a `.limo` file
- Line-by-line assembler output: binary (32-bit) and hex for each instruction, with fields colour-coded by type (opcode, rs1, rs2, rd, funct, imm)
- Error reporting: plain English messages with the line number (e.g. `Line 7: unknown register 'r33'`)
- Support for labels, comments, decimal and hex (`0x`) immediates

### B2 — Pipeline controls

- **Step**: advance one clock cycle
- **Run**: run until halted or breakpoint, with configurable speed
- **Pause**: stop a running simulation
- **Reset**: return to initial state
- **Breakpoints**: click a line in the editor to set/clear a breakpoint
- **Step Back** (recommended): undo one cycle

### B3 — Datapath view

Each cycle, display with live values:
- Active pipeline stages and wires highlighted
- PC, PC+4, branch target
- Register operands (rs1, rs2 values)
- Immediate value
- ALU inputs A and B, ALU result
- Memory address and data (for load/store)
- Write-back value
- Contents of all four pipeline registers (IF/ID, ID/EX, EX/MEM, MEM/WB)

### B4 — Control signals view

Show the signals generated in ID and their journey down the pipeline each cycle:
- `RegWrite`, `ALUSrc`, `ALUCtrl`, `MemRead`, `MemWrite`, `MemToReg`, `Branch`, `PCSrc`
- Each signal displayed as 0 or 1 with a one-line description of its meaning

### B5 — Hazard view

- Label each detected hazard (RAW, load-use, control) on the pipeline diagram
- Show which forwarding path is active (ForwardA/ForwardB source)
- Show bubbles inserted for load-use stalls
- Show instructions flushed by branch taken
- Forwarding ON/OFF toggle that shows the cycle cost difference

### B6 — Statistics and state

- Instruction-by-cycle pipeline chart (gantt-style, one row per instruction, columns = cycles, cells = stage or bubble)
- Running totals: cycles executed, CPI, stall count, flush count
- Register file table: all 32 registers, displaying current value in hex and decimal, with Sesotho names, highlighting changed registers each cycle
- Data memory table: address and value for all written addresses, highlighting changes

### B7 — Freshman mode

- A narration panel that explains, in plain English and Sesotho, what each stage did this cycle
  - e.g. "IF: Fetched `kopanya r3, r1, r2` from address 0x0000. PC advanced to 0x0004."
  - e.g. Sesotho: "IF: Re bala `kopanya r3, r1, r2` ho tsoa atereseng 0x0000."
- Tooltips on every datapath element explaining what it does
- At least five built-in example programs (see below)
- Colour is never the only visual cue — use labels, icons, or patterns alongside colour for accessibility

### B8 — Testing

**Unit tests** (runnable with `npm test`):
- Assembler: encoding each instruction class, label resolution, immediate sign-extension, error cases
- Control decoder: correct signal values for every instruction
- Hazard/forwarding unit: RAW detected and forwarded correctly, load-use stall inserted, branch flushed

**Eight LIMO test programs** (save as `.limo` files in `/examples`):

| File | Tests |
|------|-------|
| `01_arithmetic.limo` | `kopanya`, `tlosa`, `kopanya_hang` |
| `02_logic.limo` | `le`, `kapa`, `hase` |
| `03_shift.limo` | `checha_hang_leqeleng` |
| `04_memory.limo` | `bala`, `boloka` |
| `05_raw_forwarding.limo` | RAW hazard resolved by forwarding |
| `06_load_use_stall.limo` | Load immediately followed by dependent instruction |
| `07_branch.limo` | Branch taken and branch not taken |
| `08_loop.limo` | Array/accumulator loop |

Each test program must include a comment header with:
- What the program computes
- Expected final register values
- Expected memory values (if any)
- Expected total cycle count

**RV32I cross-check**: translate each program to RV32I and run in Ripes five-stage pipeline. Results and cycle counts must agree, or the difference is documented in a comment.

**Usability test**: the built-in freshman mode must be tested with at least three first-year students not in CS3520. Document tasks, observations, and changes made. Save this as `/docs/usability_report.md`.

---

## Built-in example programs

Include these five as selectable examples in the UI:

### Example 1: Add two numbers
```
kopanya_hang r1, r0, 12
kopanya_hang r2, r0, 5
kopanya      r3, r1, r2
```

### Example 2: Memory load and double
```
kopanya_hang r1, r0, 100
bala         r2, 0(r1)
kopanya      r3, r2, r2
boloka       r3, 4(r1)
```

### Example 3: RAW forwarding demo
```
kopanya_hang r1, r0, 10
kopanya_hang r2, r0, 20
kopanya      r3, r1, r2
kopanya      r4, r3, r1
```

### Example 4: Load-use stall demo
```
kopanya_hang r1, r0, 100
bala         r2, 0(r1)
kopanya      r3, r2, r2
```

### Example 5: Countdown loop (sum 1 to 5)
```
kopanya_hang r1, r0, 5
kopanya_hang r2, r0, 1
kopanya_hang r3, r0, 1
kopanya_hang r5, r0, 0
boelela:
    kopanya  r5, r5, r1
    tlosa    r1, r1, r2
    kholo_ho r1, r3, boelela
```

---

## Suggested module structure

```
src/
  assembler/
    tokenizer.js       # lexer: handles apostrophes in identifiers
    parser.js          # two-pass assembler, label resolution
    encoder.js         # instruction → 32-bit binary
    errors.js          # error types with line numbers
  simulator/
    isa.js             # instruction definitions, control signal table
    pipeline.js        # five-stage pipeline state machine
    hazard.js          # forwarding and stall detection
    memory.js          # instruction memory and data memory
    registers.js       # 32-register file, r0 write guard
  ui/
    editor.js          # code editor with syntax highlighting
    datapath.js        # SVG datapath diagram with live values
    controls.js        # signal table
    hazards.js         # hazard annotations
    stats.js           # pipeline chart, CPI counter
    freshman.js        # narration panel and tooltips
    app.js             # top-level controller
tests/
  assembler.test.js
  control.test.js
  hazard.test.js
examples/
  01_arithmetic.limo
  02_logic.limo
  03_shift.limo
  04_memory.limo
  05_raw_forwarding.limo
  06_load_use_stall.limo
  07_branch.limo
  08_loop.limo
```

---

## Implementation order

Build in this order so each milestone has a working deliverable:

1. **Assembler** — tokenizer, parser, encoder, error reporting. All unit tests passing.
2. **Pipeline state machine** — no UI yet, just the logic: instruction fetch, decode, execute, memory, write-back. Verify with the example programs by logging state to console.
3. **Hazard unit** — forwarding, load-use stall, branch flush. Test in isolation.
4. **Basic UI** — editor + step controls + register file table + memory table. No datapath diagram yet.
5. **Datapath SVG** — draw the five-stage datapath, wire up live value labels.
6. **Control view + hazard labels** — add the signal table and hazard annotations to the diagram.
7. **Statistics + pipeline chart** — gantt chart, CPI counter.
8. **Freshman mode** — narration panel, tooltips.
9. **Polish** — built-in examples, responsive layout, accessibility (no colour-only cues).

---

## Notes

- All arithmetic is 32-bit unsigned for storage; branch comparisons for `kholo_ho` and `nyane_ho` use **signed** comparison (two's complement).
- `noto` (r0) always reads as 0 and discards writes.
- Memory is word-addressed internally but byte-addressed in the ISA. Flag any non-word-aligned load/store address as an error.
- The simulator halts when PC reaches an address with no instruction (end of program).
- The datapath SVG should be scalable and readable on a phone screen (min width ~380px).
- Declare all AI tool usage in `AI_USE.md` at the repo root.
