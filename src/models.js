/**
 * LIMO Pipeline Register Data Models & Control Signal Definitions
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Milestone: M2
 *
 * The classes in this file are the executable form of docs/PIPELINE_REGISTERS.md.
 * Every pipeline register can be created, reset, and flushed without guessing at
 * hidden fields. A register with valid === false is a bubble: downstream stages
 * must treat it as a NOP and must not commit architectural state from it.
 */

/**
 * Control signals generated in ID and propagated down the pipeline.
 *
 * `aluOp` is the ALU control word (the ALUCtrl signal in the build spec).
 * `pcSrc` is the branch-target select; EX sets it when a branch is taken.
 */
export class ControlSignals {
  constructor(signals = {}) {
    // EX stage controls
    this.aluOp = signals.aluOp ?? 'ADD';          // ALUCtrl: ADD, SUB, AND, OR, NOT, SLL, PASS
    this.aluSrc = signals.aluSrc ?? 0;            // 0: rs2 value, 1: sign-extended immediate
    this.branch = signals.branch ?? 0;            // 1 for lekana / hali_lekane / kholo_ho
    this.branchType = signals.branchType ?? null; // 'BEQ', 'BNE', 'BGE'

    // MEM stage controls
    this.memRead = signals.memRead ?? 0;          // 1 for bala (load word)
    this.memWrite = signals.memWrite ?? 0;        // 1 for boloka (store word)

    // WB stage controls
    this.regWrite = signals.regWrite ?? 0;        // 1 when rd is written (rd != 0)
    this.memToReg = signals.memToReg ?? 0;        // 0: ALU result, 1: loaded memory word

    // Next-PC select, set by EX when a branch is taken
    this.pcSrc = signals.pcSrc ?? 0;
  }

  /** All control signals deasserted: the control payload of a bubble/NOP. */
  static createNop() {
    return new ControlSignals({
      aluOp: 'ADD',
      aluSrc: 0,
      branch: 0,
      branchType: null,
      memRead: 0,
      memWrite: 0,
      regWrite: 0,
      memToReg: 0,
      pcSrc: 0
    });
  }

  clone() {
    return new ControlSignals(this);
  }

  /** True when this control bundle cannot change architectural state. */
  isNop() {
    return this.regWrite === 0 &&
      this.memRead === 0 &&
      this.memWrite === 0 &&
      this.branch === 0 &&
      this.pcSrc === 0;
  }
}

/**
 * IF/ID Pipeline Register
 *
 * Carries the fetched word and its PC into ID. The decoded fields are a view of
 * the instruction bits and exist so the hazard unit can read IF/ID.rs1 and
 * IF/ID.rs2 without re-decoding the word.
 */
export class IF_ID_Register {
  constructor() {
    this.reset();
  }

  reset() {
    this.pc = 0;
    this.pcPlus4 = 0;
    this.instruction = 0;       // 32-bit machine word
    this.opcode = 0;            // instruction[6:0]
    this.rd = 0;                // instruction[11:7]
    this.funct3 = 0;            // instruction[14:12]
    this.rs1 = 0;               // instruction[19:15]
    this.rs2 = 0;               // instruction[24:20]
    this.funct7 = 0;            // instruction[31:25]
    this.immediate = 0;         // sign-extended I/S/B immediate
    this.valid = false;
    this.sourceLine = null;
    this.assemblyText = 'NOP (Empty)';
  }

  /** Replace this register with an empty bubble, discarding stale data. */
  flush() {
    this.reset();
    this.assemblyText = 'FLUSH (Bubble)';
  }

  get isBubble() {
    return !this.valid;
  }
}

/**
 * ID/EX Pipeline Register
 *
 * Carries decoded operands, register indices, the immediate, and the complete
 * control bundle from ID into EX.
 */
export class ID_EX_Register {
  constructor() {
    this.reset();
  }

  reset() {
    this.pc = 0;
    this.pcPlus4 = 0;
    this.valid = false;
    this.sourceLine = null;
    this.assemblyText = 'NOP (Empty)';
    this.mnemonic = null;

    // Decoded register indices and operand values
    this.rs1 = 0;
    this.rs2 = 0;
    this.rd = 0;
    this.readData1 = 0;
    this.readData2 = 0;
    this.immediate = 0;

    // Instruction sub-fields retained for ALU/branch control and display
    this.funct3 = 0;
    this.funct7 = 0;

    // Control signals propagated to EX, MEM and WB
    this.ctrl = ControlSignals.createNop();
  }

  flush() {
    this.reset();
    this.assemblyText = 'FLUSH (Bubble)';
  }

  get isBubble() {
    return !this.valid;
  }
}

/**
 * EX/MEM Pipeline Register
 *
 * Carries the ALU result, the store data, the destination index, the resolved
 * branch information, and the MEM/WB controls from EX into MEM.
 */
export class EX_MEM_Register {
  constructor() {
    this.reset();
  }

  reset() {
    this.pc = 0;
    this.valid = false;
    this.sourceLine = null;
    this.assemblyText = 'NOP (Empty)';
    this.mnemonic = null;

    // Results from EX
    this.aluResult = 0;
    this.writeData = 0;          // rs2 value to write on a store
    this.rd = 0;
    this.branchTarget = 0;       // PC + sign-extended B-type offset
    this.branchTaken = false;

    // MEM and WB controls propagated from ID/EX
    this.ctrl = ControlSignals.createNop();
  }

  flush() {
    this.reset();
    this.assemblyText = 'FLUSH (Bubble)';
  }

  get isBubble() {
    return !this.valid;
  }
}

/**
 * MEM/WB Pipeline Register
 *
 * Carries the ALU result, loaded memory word, destination index, the selected
 * write-back value, and the WB controls from MEM into WB.
 */
export class MEM_WB_Register {
  constructor() {
    this.reset();
  }

  reset() {
    this.pc = 0;
    this.valid = false;
    this.sourceLine = null;
    this.assemblyText = 'NOP (Empty)';
    this.mnemonic = null;

    // Results from MEM
    this.aluResult = 0;
    this.memData = 0;            // word loaded from data memory (if memRead)
    this.rd = 0;
    this.writeBackValue = 0;     // memToReg ? memData : aluResult

    // WB controls propagated from EX/MEM
    this.ctrl = ControlSignals.createNop();
  }

  flush() {
    this.reset();
    this.assemblyText = 'FLUSH (Bubble)';
  }

  get isBubble() {
    return !this.valid;
  }
}

/**
 * CPU Architectural State (register file, PC, data memory) and the four
 * pipeline registers for one simulated core.
 */
export class CPUState {
  constructor() {
    this.registers = new Int32Array(32); // r0 is hardwired to zero
    this.memory = new Map();             // byte address -> 32-bit word
    this.reset();
  }

  readRegister(index) {
    if (index === 0) return 0;
    return this.registers[index] | 0;
  }

  writeRegister(index, value) {
    if (index === 0) return; // writes to noto (r0) are silently discarded
    this.registers[index] = value | 0;
  }

  readMemory(address) {
    if (address % 4 !== 0) {
      throw new Error(`Misaligned word memory read at address 0x${(address >>> 0).toString(16)}`);
    }
    return this.memory.has(address) ? (this.memory.get(address) | 0) : 0;
  }

  writeMemory(address, value) {
    if (address % 4 !== 0) {
      throw new Error(`Misaligned word memory write at address 0x${(address >>> 0).toString(16)}`);
    }
    this.memory.set(address, value | 0);
  }

  reset() {
    this.pc = 0;
    this.registers.fill(0);
    this.memory.clear();
    this.cycleCount = 0;
    this.instructionsRetired = 0;
    this.stallCount = 0;
    this.flushCount = 0;

    this.IF_ID = new IF_ID_Register();
    this.ID_EX = new ID_EX_Register();
    this.EX_MEM = new EX_MEM_Register();
    this.MEM_WB = new MEM_WB_Register();
  }
}
