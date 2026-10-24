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

### Hazard Resolution
1. **RAW (Read-After-Write) Data Hazards**:
   - Forwarding from `EX/MEM` to ALU inputs: when `EX/MEM.RegWrite == 1` and `EX/MEM.rd != 0` and `EX/MEM.rd == ID/EX.rs1` (or `rs2`).
   - Forwarding from `MEM/WB` to ALU inputs: when `MEM/WB.RegWrite == 1` and `MEM/WB.rd != 0` and `MEM/WB.rd == ID/EX.rs1` (or `rs2`), unless overridden by `EX/MEM`.
2. **Load-Use Data Hazard**:
   - Condition: `ID/EX.MemRead == 1` and (`ID/EX.rd == IF/ID.rs1` or `ID/EX.rd == IF/ID.rs2`).
   - Action: Hazard Unit stalls the pipeline for 1 clock cycle:
     - Freezes `PC` write ($PC$ stays at same instruction).
     - Freezes `IF/ID` register write ($IF/ID$ preserves current instruction).
     - Inserts a bubble (synchronous clear / zero control signals) into `ID/EX`.
3. **Control Hazards (Branch Taken)**:
   - Branch condition and target evaluated in `EX` stage.
   - When branch evaluates as taken:
     - `PC` is updated with branch target address ($PC_{target} = PC_{EX} + \text{imm}_{B}$).
     - `IF/ID` register is flushed (cleared to NOP).
     - `ID/EX` register is flushed (cleared to NOP).
     - Penalty: 2 cycles.

---

## 3. Pipeline-Register Data Model

Each pipeline register carries data and control flags forward to the next clock cycle. In software, these are structured as immutable or cycle-latched state objects.

### 3.1 `IF/ID` Register
| Field | Type / Width | Description |
|---|---|---|
| `pc` | uint32 (32 bits) | The PC of the fetched instruction |
| `pcPlus4` | uint32 (32 bits) | $PC + 4$ sequentially computed |
| `rawInstruction` | uint32 (32 bits) | The 32-bit machine word |
| `valid` | boolean | False if flushed (NOP) or stalled bubble |
| `sourceLine` | number | Line number in the original .limo file (for debugging/narration) |

### 3.2 `ID/EX` Register
| Group | Field | Type | Description |
|---|---|---|---|
| **Context** | `pc` | uint32 | Instruction's PC |
| | `pcPlus4` | uint32 | $PC + 4$ |
| | `valid` | boolean | True if valid instruction, false if flushed/bubble |
| | `sourceLine`| number | Original source line |
| | `instructionName` | string | e.g. `kopanya`, `bala`, `boloka` |
| **Operands** | `readData1` | int32 | Register value $rs1$ read from RegFile |
| | `readData2` | int32 | Register value $rs2$ read from RegFile |
| | `immediate` | int32 | Sign-extended 32-bit immediate |
| | `rs1` | uint5 | Source register 1 index ($0..31$) |
| | `rs2` | uint5 | Source register 2 index ($0..31$) |
| | `rd` | uint5 | Destination register index ($0..31$) |
| | `funct3` | uint3 | 3-bit funct field |
| | `funct7` | uint7 | 7-bit funct field |
| **EX Controls**| `aluOp` | string | ALU operation code (`ADD`, `SUB`, `AND`, `OR`, `NOT`, `SLL`, `PASS`) |
| | `aluSrc` | uint1 | 0: second operand is register ($rs2$); 1: second operand is immediate |
| | `branch` | uint1 | 1 if branch instruction (`lekana`, `hali_lekane`, `kholo_ho`) |
| **MEM Controls**| `memRead` | uint1 | 1 if memory load (`bala`) |
| | `memWrite` | uint1 | 1 if memory store (`boloka`) |
| **WB Controls** | `regWrite` | uint1 | 1 if writes to register file (`rd != 0`) |
| | `memToReg` | uint1 | 0: ALU result; 1: Memory load data |

### 3.3 `EX/MEM` Register
| Group | Field | Type | Description |
|---|---|---|---|
| **Context** | `pc` | uint32 | Instruction's PC |
| | `valid` | boolean | Valid flag |
| | `sourceLine`| number | Original source line |
| | `instructionName` | string | Instruction mnemonic |
| **Data** | `aluResult` | int32 | Computed arithmetic/logic or memory effective address |
| | `writeData` | int32 | Data to store to memory ($rs2$ value, possibly forwarded) |
| | `rd` | uint5 | Destination register index |
| **Branch** | `branchTarget`| uint32 | Computed branch target address ($PC + \text{imm}$) |
| | `branchTaken` | boolean | True if branch condition satisfied |
| **MEM Controls**| `memRead` | uint1 | Memory read enable |
| | `memWrite` | uint1 | Memory write enable |
| **WB Controls** | `regWrite` | uint1 | Register write enable |
| | `memToReg` | uint1 | Selects memory data (1) vs. ALU result (0) |

### 3.4 `MEM/WB` Register
| Group | Field | Type | Description |
|---|---|---|---|
| **Context** | `pc` | uint32 | Instruction's PC |
| | `valid` | boolean | Valid flag |
| | `sourceLine`| number | Original source line |
| | `instructionName` | string | Instruction mnemonic |
| **Data** | `aluResult` | int32 | Result from ALU stage |
| | `memData` | int32 | Word loaded from data memory (if `memRead == 1`) |
| | `rd` | uint5 | Destination register index |
| **WB Controls** | `regWrite` | uint1 | Register write enable |
| | `memToReg` | uint1 | Memory to register MUX control |

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
