# LIMO ISA Specification
**CS3520 — Computer Organisation and Architecture**  
**Team:** Architects  
**Repository:** [saintchigos/limo-architects](https://github.com/saintchigos/limo-architects)  
**Milestone:** M1 (Frozen for M2)

---

## A1. Processor Style
LIMO is a 32-bit, load–store, RISC-V-derived instruction set architecture.

| Property | LIMO Decision |
|---|---|
| Architecture class | RISC (load–store only) |
| Word size | 32 bits |
| Memory model | Byte-addressed |
| Byte order | Little-endian |
| Instruction size | Fixed 32 bits |
| Instruction formats | R, I, S, B |
| Word alignment | Word-aligned (addresses must be multiples of 4) |
| Assembly language | Sesotho-language mnemonics |

- **Load–store**: only `bala` (load word) and `boloka` (store word) access data memory. All other instructions operate exclusively on registers.
- **Little-endian**: for a 32-bit value stored at address $A$, the least significant byte is at $A$, the most significant byte at $A+3$. This matches RV32I and ensures straightforward cross-checking against Ripes.
- **Word-alignment**: all instruction fetches and word memory accesses must use addresses divisible by 4. The simulator reports a misalignment error otherwise. This falls naturally from fixed 32-bit instructions: instruction $0$ is at address $0$, subsequent instructions at $4, 8, 12$, etc.
- **Omitted formats**: U-type and J-type are not included in the baseline. LIMO's 12-bit I-type immediate is sufficient for all targeted programs. The absence of J-type means long-range unconditional branches are not supported; this is documented as the primary structural limitation in A6(f).

---

## A2. Register File
LIMO has 32 general-purpose registers (`r0`–`r31`), each 32 bits wide. Register indices are 5 bits ($2^5 = 32$).

### Programmer-Visible Special-Purpose Registers

| Number | Assembly name | Sesotho meaning | Role |
|---|---|---|---|
| PC (separate) | `sebali_tsamaiso` | program runner | Architectural PC; separate from `r0`–`r31` and not addressable through GPR fields |
| `r0` | `noto` | zero | Hardwired to 0; all writes are silently discarded |
| `r1` | `khutla_aterese` | return address | Stores return address on procedure calls |
| `r2` | `ts'upiso_phaello` | stack pointer | Points to the current top of the call stack |
| `r3` | `ts'upiso_kakaretso` | global pointer | Points to the global data region |

*PC numbering note*: `sebali_tsamaiso` is a separate architectural special-purpose register, not one of the numbered GPRs. The 5-bit register fields address only `r0`–`r31`.

### General-Purpose Registers

| Numbers | Group | Sesotho name | Role |
|---|---|---|---|
| `r4`–`r7` | Argument registers | `li_khang` (`li_khang0`–`li_khang3` / `a0`–`a3`) | Function arguments / caller-saved |
| `r8`–`r9` | Return value registers | `li_phetho` (`li_phetho0`–`li_phetho1`) | Function return values |
| `r10`–`r15` | Temporary registers | `li_nakoana` (`li_nakoana0`–`li_nakoana5` / `t0`–`t5`) | Not preserved across calls |
| `r16`–`r31` | Saved registers | `li_boloka` (`li_boloka0`–`li_boloka15` / `s0`–`s15`) | Callee-saved; preserved across calls |

*Note on `ts'upiso_phaello`*: the apostrophe in `ts'` is a Sesotho digraph representing a distinct phoneme. The assembler preserves and tokenises this character as part of the identifier (see A4).

---

## A3. Instruction Set
LIMO implements 12 instructions across four classes. No multiply/divide, floating-point, CSRs, or hardware exceptions are included.

### Arithmetic — 3 instructions
| # | Mnemonic | Syntax | Operation | Format | RV32I equivalent |
|---|---|---|---|---|---|
| 1 | `kopanya` | `kopanya rd, rs1, rs2` | `rd = rs1 + rs2` | R | ADD |
| 2 | `tlosa` | `tlosa rd, rs1, rs2` | `rd = rs1 - rs2` | R | SUB |
| 3 | `kopanya_hang` | `kopanya_hang rd, rs1, imm` | `rd = rs1 + imm` | I | ADDI |

### Logic — 3 instructions
| # | Mnemonic | Syntax | Operation | Format | RV32I equivalent |
|---|---|---|---|---|---|
| 4 | `le` | `le rd, rs1, rs2` | `rd = rs1 & rs2` | R | AND |
| 5 | `kapa` | `kapa rd, rs1, rs2` | `rd = rs1 \| rs2` | R | OR |
| 6 | `hase` | `hase rd, rs1` | `rd = ~rs1` (bitwise NOT) | R | — (pseudo: XORI rd, rs1, -1) |

*Note on `hase`*: RISC-V has no dedicated NOT instruction; it uses `XORI rd, rs1, -1`. LIMO provides it as a real R-type instruction. The assembler sets `rs2 = r0` (`noto`) and the processor ignores the `rs2` field.

### Shift — 1 instruction
| # | Mnemonic | Syntax | Operation | Format | RV32I equivalent |
|---|---|---|---|---|---|
| 7 | `checha_hang_leqeleng` | `checha_hang_leqeleng rd, rs1, shamt` | `rd = rs1 << shamt` | I | SLLI |

*Note*: Only the lower 5 bits of the immediate (`shamt`) are used; a 32-bit register can only be shifted 0–31 positions.

### Memory — 2 instructions
| # | Mnemonic | Syntax | Operation | Format | RV32I equivalent |
|---|---|---|---|---|---|
| 8 | `bala` | `bala rd, imm(rs1)` | `rd = Memory[rs1 + imm]` | I | LW |
| 9 | `boloka` | `boloka rs2, imm(rs1)` | `Memory[rs1 + imm] = rs2` | S | SW |

### Branches — 3 instructions
| # | Mnemonic | Syntax | Operation | Format | RV32I equivalent |
|---|---|---|---|---|---|
| 10 | `lekana` | `lekana rs1, rs2, label` | `if rs1 == rs2: PC = label` | B | BEQ |
| 11 | `kholo_ho` | `kholo_ho rs1, rs2, label` | `if rs1 >= rs2: PC = label` | B | BGE |
| 12 | `hali_lekane` | `hali_lekane rs1, rs2, label` | `if rs1 != rs2: PC = label` | B | BNE |

---

## A4. Sesotho Assembly

### Mnemonic Glossary
| Mnemonic | Sesotho Meaning | Operation | RV32I Equivalent |
|---|---|---|---|
| `kopanya` | combine / add together | `rd = rs1 + rs2` | ADD |
| `tlosa` | remove / take away | `rd = rs1 - rs2` | SUB |
| `kopanya_hang` | add right now / add immediately | `rd = rs1 + imm` | ADDI |
| `le` | and (conjunction) | `rd = rs1 & rs2` | AND |
| `kapa` | or (disjunction) | `rd = rs1 \| rs2` | OR |
| `hase` | it is not / negate | `rd = ~rs1` | — |
| `checha_hang_leqeleng` | shift immediately to the left | `rd = rs1 << shamt` | SLLI |
| `bala` | read / load | `rd = Memory[rs1 + imm]` | LW |
| `boloka` | save / store | `Memory[rs1 + imm] = rs2` | SW |
| `lekana` | equal / balanced | branch if `rs1 == rs2` | BEQ |
| `kholo_ho` | greater than or equal | branch if `rs1 >= rs2` | BGE |
| `hali_lekane` | not equal | branch if `rs1 != rs2` | BNE |

### Assembly Syntax & Rules
- **Comments**: Start with `#` and extend to the end of the line.
- **Labels**: Defined as an identifier followed by a colon (e.g., `boelela:`).
- **Immediates**: May be expressed in decimal (e.g. `10`, `-4`) or hexadecimal (e.g. `0x1F`).
- **Apostrophe Handling**: Sesotho orthography includes digraphs `ts'` and `ch'`, where the apostrophe denotes a distinct ejective consonant, not a string delimiter.
  - *Tokenisation rule*: An identifier begins with a letter and continues consuming characters that are letters, digits, underscores (`_`), or apostrophes (`'`). Tokenisation stops at whitespace, a comma, a parenthesis, or end-of-line.
  - Hence `ts'upiso_phaello` is scanned as a single register identifier.

---

## A5. Encoding and Specification

### Instruction Formats
All formats use the same 32-bit field layouts as their RV32I counterparts:

```
R-type:
 31         25 24     20 19     15 14   12 11      7 6       0
+-------------+---------+---------+-------+---------+---------+
|   funct7    |   rs2   |   rs1   |funct3 |   rd    | opcode  |
|   7 bits    | 5 bits  | 5 bits  |3 bits | 5 bits  | 7 bits  |
+-------------+---------+---------+-------+---------+---------+

I-type:
 31                   20 19     15 14   12 11      7 6       0
+-----------------------+---------+-------+---------+---------+
|       imm[11:0]       |   rs1   |funct3 |   rd    | opcode  |
|        12 bits        | 5 bits  |3 bits | 5 bits  | 7 bits  |
+-----------------------+---------+-------+---------+---------+

S-type:
 31         25 24     20 19     15 14   12 11      7 6       0
+-------------+---------+---------+-------+---------+---------+
|  imm[11:5]  |   rs2   |   rs1   |funct3 | imm[4:0]| opcode  |
|   7 bits    | 5 bits  | 5 bits  |3 bits | 5 bits  | 7 bits  |
+-------------+---------+---------+-------+---------+---------+

B-type:
 31 30      25 24     20 19     15 14   12 11     8 7 6      0
+--+----------+---------+---------+-------+--------+-+--------+
|12|imm[10:5] |   rs2   |   rs1   |funct3 |imm[4:1]|1| opcode |
+--+----------+---------+---------+-------+--------+-+--------+
```

### Opcode Assignments
| Format | Opcode (binary) | Opcode (hex) |
|---|---|---|
| R | `1001101` | `0x4D` |
| I | `1001001` | `0x49` |
| S | `0101101` | `0x2D` |
| B | `1001110` | `0x4E` |

### Field Breakdown per Instruction
- **R-type (`opcode = 1001101 / 0x4D`)**:
  - `kopanya`: `funct3 = 000`, `funct7 = 0000000`
  - `tlosa`: `funct3 = 000`, `funct7 = 0000001`
  - `le`: `funct3 = 001`, `funct7 = 0000010`
  - `kapa`: `funct3 = 101`, `funct7 = 0000011`
  - `hase`: `funct3 = 010`, `funct7 = 0000100` (rs2 = 0)
- **I-type (`opcode = 1001001 / 0x49`)**:
  - `bala`: `funct3 = 000`
  - `kopanya_hang`: `funct3 = 100`
  - `checha_hang_leqeleng`: `funct3 = 101` (imm[11:5] = 0000000, shamt = imm[4:0])
- **S-type (`opcode = 0101101 / 0x2D`)**:
  - `boloka`: `funct3 = 000`
- **B-type (`opcode = 1001110 / 0x4E`)**:
  - `lekana` (BEQ): `funct3 = 000`
  - `hali_lekane` (BNE): `funct3 = 001`
  - `kholo_ho` (BGE): `funct3 = 101`

### Immediate Ranges
- **I-type**: 12-bit signed ($-2048$ to $+2047$).
- **S-type**: 12-bit signed ($-2048$ to $+2047$).
- **B-type**: 13-bit signed with bit 0 implicitly 0 ($-4096$ to $+4094$, multiples of 2 bytes).

### Hand-Encoded Verification Vectors
1. **R-type (`kopanya r3, r1, r2`)**:
   - `funct7` = `0000000`, `rs2` = `00010` (r2), `rs1` = `00001` (r1), `funct3` = `000`, `rd` = `00011` (r3), `opcode` = `1001101`
   - Binary: `00000000001000001000000111001101`
   - Hex: `0x002081CD`
2. **I-type (`kopanya_hang r5, r1, 10`)**:
   - `imm[11:0]` = `000000001010` (10), `rs1` = `00001` (r1), `funct3` = `100`, `rd` = `00101` (r5), `opcode` = `1001001`
   - Binary: `00000000101000001100001011001001`
   - Hex: `0x00A0C2C9`
3. **S-type (`boloka r3, 8(r2)`)**:
   - `imm[11:5]` = `0000000`, `rs2` = `00011` (r3), `rs1` = `00010` (r2), `funct3` = `000`, `imm[4:0]` = `01000`, `opcode` = `0101101`
   - Binary: `00000000001100010000010000101101`
   - Hex: `0x0031042D`
4. **B-type (`lekana r1, r2, 8`)**:
   - Branch offset $+8$: `imm[12]` = `0`, `imm[10:5]` = `000000`, `rs2` = `00010` (r2), `rs1` = `00001` (r1), `funct3` = `000`, `imm[4:1]` = `0100`, `imm[11]` = `0`, `opcode` = `1001110`
   - Binary: `00000000010000001000010001001110`
   - Hex: `0x0020844E`

---

## A6. Design-Decision Log

### (a) Register-file size: cost and benefit
Choosing 32 registers means each register field is 5 bits wide. An R-type instruction spends 15 of its 32 bits on register addresses, leaving 17 bits for opcode and funct fields — identical to RV32I and sufficient for our 12-instruction set. The forwarding unit requires four 5-bit comparators to detect RAW hazards across EX/MEM and MEM/WB stages. The benefit is low register pressure: in our sample programs, all intermediate values remain in registers throughout computation with no spills to data memory, keeping instruction counts low. The cost is those 15 encoding bits — a 16-register design would reclaim 3 bits, usable for wider immediates, but at the expense of increased register spilling in loops.

### (b) Architectural vs microarchitectural registers
LIMO's architectural registers — the 32 GPRs, PC (`sebali_tsamaiso`), zero register (`noto`), stack pointer (`ts'upiso_phaello`) and return address (`khutla_aterese`) — are programmer-visible and fully specified in the ISA. The microarchitectural registers — IF/ID, ID/EX, EX/MEM and MEM/WB pipeline registers and the instruction register — exist only to carry data between pipeline stages and are invisible to software. The ISA must not specify them because they are an implementation detail: a valid LIMO implementation could use a different pipeline depth or out-of-order execution and still honour the ISA contract. Exposing pipeline registers in the ISA would permanently bind every implementation to one specific microarchitecture, eliminating the implementation freedom that separating ISA from microarchitecture exists to provide.

### (c) Branch resolution stage and flush cost
LIMO resolves branches in the EX stage, where the ALU computes the comparison and the branch target is available. By EX, two instructions have already entered the pipeline behind the branch — one in IF and one in ID — so both must be flushed on a taken branch, costing 2 cycles per taken branch. Resolving in ID would reduce flushes to 1 but requires a dedicated comparator and branch-target adder in the decode stage, adding significant hardware complexity. Given LIMO's small instruction set and simulator implementation goals, EX resolution offers the better complexity tradeoff. Our sample program 3 (counting loop) shows taken branches are infrequent enough that the 2-cycle penalty has minimal overall CPI impact.

### (d) Load-use stall under full forwarding
A load's result is not available until the end of the MEM stage. A dependent instruction needs that value at the start of its EX stage. Even with full forwarding, the value would need to travel backwards in time — from MEM of the load to EX of the dependent instruction in the same cycle. This is physically impossible; one stall cycle is mandatory.

```
         C1    C2    C3    C4    C5    C6
bala     IF    ID    EX   MEM    WB
kopanya        IF    ID   ***    EX   MEM   WB
                           ↑
                        stall inserted here
                        value exits MEM at end of C4
                        kopanya needs it at start of EX
                        forwarded from MEM/WB to EX in C5
```
The bubble (`***`) is inserted by the hazard unit, which stalls `kopanya` for one cycle until the load result can be forwarded from MEM/WB.

### (e) Flags register: would LIMO benefit?
LIMO's branches (`lekana`, `kholo_ho`, `hali_lekane`) embed their comparison directly into the branch instruction, following the RISC-V model. A flags register would separate comparison from branching: a compare instruction sets flags, a branch reads them. This adds expressive flexibility but creates a new RAW hazard: every branch becomes dependent on the preceding compare, requiring the forwarding unit to track the flags register as additional architectural state. Since LIMO has no multiply or complex operations that naturally produce flag outputs, the added hazard complexity outweighs the benefit. Keeping comparisons inside branch instructions means one instruction, one pipeline pass, and no flag-forwarding logic — simpler hardware and no extra stall cases in the hazard unit.

### (f) What breaks first as programs grow
With 32 registers, register pressure is the last concern — LIMO programs can hold many live values simultaneously without memory spills. Immediate range (12-bit signed, −2048 to +2047) limits large constants and array offsets but only affects specific access patterns. Branch reach breaks first. LIMO's B-type immediate gives a signed 13-bit offset, reaching ±4 KB — roughly ±1000 instructions. As programs grow beyond this, forward and backward branches to distant labels exceed the encodable offset. LIMO currently has no J-type jump or indirect-branch instruction, so it cannot express a general workaround for an out-of-range branch using the instructions defined here. The practical fix in a future ISA revision would be to add a J-type jump (or another explicitly specified long-range control-transfer instruction). Until then, the assembler must report an out-of-range branch rather than silently emit an unsupported sequence. This is the first structural limitation a larger LIMO program would encounter.
