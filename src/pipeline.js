/**
 * LIMO Five-Stage Pipeline Engine (M3)
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Pipeline Lead: Lebohang Lithebe
 *
 * One call to `step()` is exactly one clock edge. Every stage is computed from
 * the previous cycle's latches, then all four pipeline registers latch once at
 * the end of the cycle (compute first, latch last).
 *
 * Semantics:
 * - Stages are processed WB → MEM → EX → ID → IF. Because WB commits before ID
 *   reads, a register write is visible to a same-cycle ID read (the "half-cycle
 *   register file" model, P&H §4). Consumers at distance 3 or more from their
 *   producer therefore see the new value; distance 1 and 2 are RAW hazards that
 *   M4 forwarding will resolve. M3 is hazard-free only: closer dependencies may
 *   compute stale values by design, and that is documented behaviour.
 * - Branches resolve in EX with a 2-cycle flush penalty: the instructions in
 *   IF/ID and the one fetched this cycle are squashed and PC takes the target.
 * - There is no forwarding and no load-use stall in M3 (M4 milestone).
 * - The engine halts once PC is past the program AND the pipeline has drained
 *   (build spec: no instruction = halt). Halting on fetch alone would discard
 *   instructions still in flight.
 *
 * This module owns no UI code. The UI reads `cpu` (a CPUState snapshot) and the
 * per-cycle result returned by `step()`; it never mutates pipeline state.
 */

import {
  CPUState,
  IF_ID_Register,
  ID_EX_Register,
  EX_MEM_Register,
  MEM_WB_Register
} from './models.js';
import { decodeWord, decodeImmediate } from './control.js';
import { REGISTER_INFO } from './isa.js';

/**
 * Advance the simulator by one clock edge.
 *
 * @param {object} [program] Assembled program description.
 * @param {number[]} [program.words] 32-bit machine words; word i is at address i*4.
 * @param {Array<{lineNumber: number, assemblyText: string, mnemonic: string}>} [program.source]
 *   Per-word source map used for diagnostics and narration.
 * @param {Map<number, number>|Object<string, number>} [program.preloadedData]
 *   Data-memory contents installed by reset (for example Memory[100] = 21).
 */
export class LimoPipeline {
  constructor(program = {}) {
    this.words = program.words ?? [];
    this.source = program.source ?? [];
    this.preloadedData = program.preloadedData instanceof Map
      ? program.preloadedData
      : new Map(Object.entries(program.preloadedData ?? {}).map(([address, value]) => [Number(address), value]));

    /** Architectural state plus the four pipeline registers. */
    this.cpu = new CPUState();
    this.halted = false;
    this.reset();
  }

  /**
   * Single reset path shared by the Reset button, program loads and tests.
   * CPUState.reset() clears PC, GPRs, data memory, counters and every latch;
   * preloaded data is then reinstalled so a rerun starts from the same inputs.
   */
  reset() {
    this.cpu.reset();
    for (const [address, value] of this.preloadedData) {
      this.cpu.writeMemory(address, value);
    }
    this.halted = false;
  }

  /** True once PC is past the program and every valid instruction has retired. */
  get isHalted() {
    return this.halted;
  }

  /** True while another clock edge is meaningful. */
  get canStep() {
    return !this.halted;
  }

  /**
   * Advance exactly one clock cycle.
   *
   * @returns {{
   *   cycle: number,
   *   retired: number,
   *   halted: boolean,
   *   stages: { IF: object|null, ID: object|null, EX: object|null, MEM: object|null, WB: object|null },
   *   trace: string[]
   * } | null} Render-ready snapshot, or null when already halted.
   * @throws {Error} On an illegal instruction word or misaligned data-memory access.
   */
  step() {
    if (this.halted) return null;

    this.cpu.cycleCount += 1;
    const s = this.cpu;
    const stages = { IF: null, ID: null, EX: null, MEM: null, WB: null };
    const trace = [];
    let flushTarget = null;

    /* ---------------- WB — write back (writes before ID reads) -------- */
    {
      const wb = s.MEM_WB;
      if (wb.valid) {
        let wroteRegister = false;
        if (wb.ctrl.regWrite && wb.rd !== 0) {
          s.writeRegister(wb.rd, wb.writeBackValue);
          wroteRegister = true;
        }
        s.instructionsRetired += 1;
        stages.WB = {
          valid: true,
          mnemonic: wb.mnemonic,
          assemblyText: wb.assemblyText,
          rd: wb.ctrl.regWrite ? wb.rd : null,
          value: wb.writeBackValue,
          wroteRegister
        };
        trace.push(wroteRegister
          ? `WB: r${wb.rd} (${REGISTER_INFO[wb.rd].alias}) <= ${wb.writeBackValue}`
          : `WB: ${wb.mnemonic} retired (no register write)`);
      }
    }

    /* ---------------- MEM — memory access ------------------------------ */
    {
      const mem = s.EX_MEM;
      const next = new MEM_WB_Register();
      if (mem.valid) {
        let memData = 0;
        if (mem.ctrl.memRead) {
          memData = s.readMemory(mem.aluResult);
          trace.push(`MEM: read word @0x${(mem.aluResult >>> 0).toString(16)} = ${memData}`);
        }
        if (mem.ctrl.memWrite) {
          s.writeMemory(mem.aluResult, mem.writeData);
          trace.push(`MEM: wrote ${mem.writeData} @0x${(mem.aluResult >>> 0).toString(16)}`);
        }
        next.pc = mem.pc;
        next.valid = true;
        next.sourceLine = mem.sourceLine;
        next.assemblyText = mem.assemblyText;
        next.mnemonic = mem.mnemonic;
        next.aluResult = mem.aluResult;
        next.memData = memData;
        next.rd = mem.rd;
        next.writeBackValue = mem.ctrl.memToReg ? memData : mem.aluResult;
        next.ctrl = mem.ctrl.clone();
        stages.MEM = {
          valid: true,
          mnemonic: mem.mnemonic,
          assemblyText: mem.assemblyText,
          address: mem.aluResult,
          read: mem.ctrl.memRead,
          write: mem.ctrl.memWrite,
          value: mem.ctrl.memRead ? memData : mem.writeData
        };
      }
      this._nextMEM_WB = next;
    }

    /* ---------------- EX — execute + branch resolution ----------------- */
    {
      const ex = s.ID_EX;
      const next = new EX_MEM_Register();
      if (ex.valid) {
        const operandA = ex.readData1;
        const operandB = ex.ctrl.aluSrc ? ex.immediate : ex.readData2;

        let aluResult = 0;
        switch (ex.ctrl.aluOp) {
          case 'ADD': aluResult = (operandA + operandB) | 0; break;
          case 'SUB': aluResult = (operandA - operandB) | 0; break;
          case 'AND': aluResult = (operandA & operandB) | 0; break;
          case 'OR': aluResult = (operandA | operandB) | 0; break;
          case 'NOT': aluResult = (~operandA) | 0; break;
          case 'SLL': aluResult = (operandA << (ex.immediate & 0x1F)) | 0; break;
          default: aluResult = (operandA + operandB) | 0; break;
        }

        let branchTaken = false;
        const branchTarget = (ex.pc + ex.immediate) >>> 0;
        if (ex.ctrl.branch) {
          const a = ex.readData1 | 0;
          const b = ex.readData2 | 0;
          branchTaken = ex.ctrl.branchType === 'BEQ' ? a === b
            : ex.ctrl.branchType === 'BNE' ? a !== b
            : a >= b;
          if (branchTaken) {
            flushTarget = branchTarget;
            s.flushCount += 2;
            trace.push(`EX: branch ${ex.ctrl.branchType} taken -> 0x${branchTarget.toString(16)} (flush IF/ID, 2 bubbles)`);
          }
        }

        next.pc = ex.pc;
        next.valid = true;
        next.sourceLine = ex.sourceLine;
        next.assemblyText = ex.assemblyText;
        next.mnemonic = ex.mnemonic;
        next.aluResult = aluResult;
        next.writeData = ex.readData2;
        next.rd = ex.rd;
        next.branchTarget = branchTarget;
        next.branchTaken = branchTaken;
        next.ctrl = ex.ctrl.clone();
        if (branchTaken) next.ctrl.pcSrc = 1;
        stages.EX = {
          valid: true,
          mnemonic: ex.mnemonic,
          assemblyText: ex.assemblyText,
          aluOp: ex.ctrl.aluOp,
          operandA,
          operandB,
          result: aluResult,
          branchTaken,
          branchTarget
        };
        trace.push(`EX: ${ex.mnemonic} ALU ${ex.ctrl.aluOp}(${operandA}, ${operandB}) = ${aluResult}`);
      }
      this._nextEX_MEM = next;
    }

    /* ---------------- ID — decode + register read ---------------------- */
    /* Runs after WB in this function, so WB's write on the same edge is
       visible here: the half-cycle register-file model. */
    {
      const id = s.IF_ID;
      const next = new ID_EX_Register();
      if (id.valid) {
        let decoded;
        try {
          decoded = decodeWord(id.instruction);
        } catch (error) {
          error.stage = 'ID';
          error.pc = id.pc;
          throw error;
        }

        next.pc = id.pc;
        next.pcPlus4 = id.pcPlus4;
        next.valid = true;
        next.sourceLine = id.sourceLine;
        next.assemblyText = id.assemblyText;
        next.mnemonic = decoded.mnemonic;
        next.rs1 = decoded.rs1;
        next.rs2 = decoded.rs2;
        next.rd = decoded.rd;
        next.readData1 = s.readRegister(decoded.rs1);
        next.readData2 = s.readRegister(decoded.rs2);
        next.immediate = decoded.immediate;
        next.funct3 = decoded.funct3;
        next.funct7 = decoded.funct7;
        next.ctrl = decoded.ctrl;
        stages.ID = {
          valid: true,
          mnemonic: decoded.mnemonic,
          assemblyText: id.assemblyText,
          rs1: decoded.rs1,
          rs1Value: next.readData1,
          rs2: decoded.rs2,
          rs2Value: next.readData2,
          rd: decoded.rd,
          immediate: decoded.immediate
        };
        trace.push(`ID: ${decoded.mnemonic} rs1=${decoded.rs1} rs2=${decoded.rs2} rd=${decoded.rd} imm=${decoded.immediate}`);
      }
      this._nextID_EX = next;
    }

    /* ---------------- IF — fetch + PC update --------------------------- */
    {
      const programEnd = this.words.length * 4;
      const pc = s.pc;
      const next = new IF_ID_Register();
      let nextPc = (pc + 4) >>> 0;

      if (flushTarget !== null) {
        next.flush();
        nextPc = flushTarget >>> 0;
        stages.IF = { valid: false, flushed: true, pc };
      } else if (pc < programEnd) {
        const source = this.source[pc >>> 2] ?? null;
        next.pc = pc;
        next.pcPlus4 = nextPc;
        next.valid = true;
        next.instruction = this.words[pc >>> 2] >>> 0;
        next.opcode = next.instruction & 0x7F;
        next.rd = (next.instruction >>> 7) & 0x1F;
        next.funct3 = (next.instruction >>> 12) & 0x07;
        next.rs1 = (next.instruction >>> 15) & 0x1F;
        next.rs2 = (next.instruction >>> 20) & 0x1F;
        next.funct7 = (next.instruction >>> 25) & 0x7F;
        next.immediate = decodeImmediate(next.instruction, next.opcode);
        next.assemblyText = source?.assemblyText ?? `(pc 0x${pc.toString(16)})`;
        next.sourceLine = source?.lineNumber ?? null;
        stages.IF = {
          valid: true,
          pc,
          pcPlus4: nextPc,
          assemblyText: next.assemblyText,
          wordHex: next.instruction.toString(16).toUpperCase().padStart(8, '0')
        };
        trace.push(`IF: fetch @0x${pc.toString(16)}`);
      } else {
        nextPc = pc;
        stages.IF = { valid: false, pc };
      }

      s.IF_ID = next;
      s.pc = nextPc;
    }

    /* ---------------- Latch the three remaining registers --------------- */
    if (flushTarget !== null) {
      const squashed = new ID_EX_Register();
      squashed.flush();
      s.ID_EX = squashed;
    } else {
      s.ID_EX = this._nextID_EX;
    }
    s.EX_MEM = this._nextEX_MEM;
    s.MEM_WB = this._nextMEM_WB;
    this._nextID_EX = this._nextEX_MEM = this._nextMEM_WB = null;

    /* ---------------- Halt detection ----------------------------------- */
    const programEnd = this.words.length * 4;
    const pipelineEmpty =
      !s.IF_ID.valid && !s.ID_EX.valid && !s.EX_MEM.valid && !s.MEM_WB.valid;
    if (s.pc >= programEnd && pipelineEmpty && stages.IF && !stages.IF.valid) {
      this.halted = true;
    }

    return {
      cycle: s.cycleCount,
      retired: s.instructionsRetired,
      halted: this.halted,
      stages,
      trace
    };
  }
}

export default LimoPipeline;
