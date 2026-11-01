/**
 * LIMO Five-Stage Pipeline Engine (M3)
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 *
 * DRAFT FOR ISSUE B (Pipeline Lead: Lebohang Lithebe) — written alongside
 * the M3 interface work (Issue E) because the UI Needs the engine to be
 * verifiable. Review and own this file's semantics before submitting.
 *
 * Semantics (per docs/LIMO_BUILD_SPEC.md and docs/PIPELINE_REGISTERS.md):
 *   - One call to step() is exactly one clock cycle: every stage is computed
 *     from the previous cycle's latches, then all four pipeline registers
 *     latch once at the end of the cycle (compute first, latch last).
 *   - Stages are processed in reverse order WB → MEM → EX → ID → IF so that
 *     a WB register write is visible to an ID register read in the same
 *     cycle (the "half-cycle register file" model, P&H §4). A consumer at
 *     distance 3 (or more) from its producer therefore reads the new value:
 *     distance 1 and 2 are RAW hazards that M4 forwarding will resolve.
 *     M3 is hazard-free only: such programs may compute stale values by
 *     design, and that is documented behaviour, not a bug.
 *   - Branches resolve in EX with a 2-cycle flush penalty: IF/ID and the
 *     fetched instruction are squashed and PC takes the branch target.
 *   - There is no forwarding and no load-use stall in M3 (M4 milestone).
 *   - The engine halts once PC is past the program and the pipeline has
 *     fully drained (build spec: no instruction = halt).
 *
 * This module owns NO UI code. The UI consumes the CPUState snapshot and
 * the per-cycle result object returned by step().
 */

import { CPUState, ControlSignals } from './models.js';
import {
  IF_ID_Register,
  ID_EX_Register,
  EX_MEM_Register,
  MEM_WB_Register,
} from './models.js';
import { INSTRUCTIONS, OPCODES, REGISTER_INFO } from './isa.js';

/** Sign-extend a 12-bit value to a signed 32-bit int. */
function signExtend12(bits) {
  return (bits & 0x800) ? (bits - 0x1000) : bits;
}

/** Reconstruct + sign-extend the 13-bit B-type byte offset from a word. */
function extractBOffset(word) {
  const bit12 = (word >>> 31) & 0x1;
  const bits10_5 = (word >>> 25) & 0x3F;
  const bits4_1 = (word >>> 8) & 0x0F;
  const bit11 = (word >>> 7) & 0x1;
  let offset = (bit12 << 12) | (bit11 << 11) | (bits10_5 << 5) | (bits4_1 << 1);
  if (offset & 0x1000) offset -= 0x2000; // sign-extend 13 bits
  return offset;
}

/**
 * Decode a 32-bit LIMO word into:
 *   { mnemonic, format, opcode, rd, funct3, rs1, rs2, funct7, immediate, ctrl }
 * ctrl is a complete ControlSignals bundle (ID-stage output).
 *
 * NOTE FOR ISSUE A (ISA Architect: Katleho Motsheare): this decode function
 * is intended to be refactored into src/control.js with full JSDoc per
 * instruction against docs/LIMO_ISA_Specification.md. The signal values
 * below already follow that specification; the refactor should not change
 * them, only their location and documentation.
 */
export function decodeWord(word) {
  word = word >>> 0;
  const opcode = word & 0x7F;
  const rd = (word >>> 7) & 0x1F;
  const funct3 = (word >>> 12) & 0x07;
  const rs1 = (word >>> 15) & 0x1F;
  const rs2 = (word >>> 20) & 0x1F;
  const funct7 = (word >>> 25) & 0x7F;

  // Match the mnemonic from the frozen ISA table (12 instructions).
  let mnemonic = null;
  let format = null;
  for (const [name, def] of Object.entries(INSTRUCTIONS)) {
    if (def.opcode !== opcode) continue;
    if (def.format === 'R' && def.funct3 === funct3 && def.funct7 === funct7) {
      // Funct7 + funct3 uniquely identify each R-type instruction. For
      // `hase` the rs2 field is ignored (it is encoded as r0 by convention).
      mnemonic = name; format = 'R'; break;
    }
    if (def.format === 'I' && def.funct3 === funct3) {
      mnemonic = name; format = 'I'; break;
    }
    if (def.format === 'S' && def.funct3 === funct3) {
      mnemonic = name; format = 'S'; break;
    }
    if (def.format === 'B' && def.funct3 === funct3) {
      mnemonic = name; format = 'B'; break;
    }
  }

  if (!mnemonic) return null; // illegal / unknown word

  // Immediate extraction + control bundle per instruction class,
  // exactly as documented in docs/LIMO_ISA_Specification.md A5 and
  // docs/PIPELINE_REGISTERS.md §2.
  let immediate = 0;
  const signals = {};

  switch (format) {
    case 'R': {
      // ALUSrc = 0: operand B from readData2. regWrite forced off for noto.
      signals.aluOp = mnemonic === 'kopanya' ? 'ADD'
        : mnemonic === 'tlosa' ? 'SUB'
        : mnemonic === 'le' ? 'AND'
        : mnemonic === 'kapa' ? 'OR'
        : 'NOT'; // hase
      signals.aluSrc = 0;
      signals.regWrite = rd !== 0 ? 1 : 0;
      break;
    }
    case 'I': {
      immediate = signExtend12((word >>> 20) & 0xFFF);
      if (mnemonic === 'bala') {
        // LW: address add in EX, memory read in MEM, loaded word to rd.
        signals.aluOp = 'ADD';
        signals.aluSrc = 1;
        signals.regWrite = rd !== 0 ? 1 : 0;
        signals.memRead = 1;
        signals.memToReg = 1;
      } else if (mnemonic === 'checha_hang_leqeleng') {
        signals.aluOp = 'SLL';
        signals.aluSrc = 1;
        signals.regWrite = rd !== 0 ? 1 : 0;
      } else { // kopanya_hang (ADDI)
        signals.aluOp = 'ADD';
        signals.aluSrc = 1;
        signals.regWrite = rd !== 0 ? 1 : 0;
      }
      break;
    }
    case 'S': {
      immediate = signExtend12((((word >>> 25) & 0x7F) << 5) | ((word >>> 7) & 0x1F));
      // SW: address add; rs2 value latched into EX/MEM.writeData; no reg write.
      signals.aluOp = 'ADD';
      signals.aluSrc = 1;
      signals.regWrite = 0;
      signals.memWrite = 1;
      break;
    }
    case 'B': {
      immediate = extractBOffset(word);
      signals.aluOp = 'ADD';
      signals.aluSrc = 0; // branch compares rs1 vs rs2 registers
      signals.regWrite = 0;
      signals.branch = 1;
      signals.branchType = mnemonic === 'lekana' ? 'BEQ'
        : mnemonic === 'hali_lekane' ? 'BNE'
        : 'BGE';
      break;
    }
  }

  const ctrl = new ControlSignals({
    aluOp: signals.aluOp,
    aluSrc: signals.aluSrc,
    regWrite: signals.regWrite,
    memRead: signals.memRead ?? 0,
    memWrite: signals.memWrite ?? 0,
    memToReg: signals.memToReg ?? 0,
    branch: signals.branch ?? 0,
    branchType: signals.branchType ?? null,
    pcSrc: 0, // EX sets this when the branch resolves taken
  });

  return { mnemonic, format, opcode, rd, funct3, rs1, rs2, funct7, immediate, ctrl };
}

/* ------------------------------------------------------------------
 * Bilingual stage narration fragments for the Freshman-mode panel
 * (kept with the engine so UI and tests share one source of truth).
 * Each stage payload below feeds app.js via narrationEn()/narrationSt().
 * ------------------------------------------------------------------ */

export class LimoPipeline {
  /**
   * @param {object} program  Assembled program:
   *   - words: Array<number> 32-bit machine words (word i at address i*4)
   *   - source: Array<{ lineNumber, assemblyText, mnemonic }> per word
   *   - preloadedData: Map<number(number address), number(int32 value)>
   */
  constructor(program = {}) {
    this.words = program.words ?? [];
    this.source = program.source ?? [];
    this.preloadedData = program.preloadedData instanceof Map
      ? program.preloadedData
      : new Map(Object.entries(program.preloadedData ?? {}).map(([a, v]) => [Number(a), v]));
    this.cpu = new CPUState(); // architectural state + four pipeline registers
    this.halted = false;
    this.reset();
  }

  /** Single reset path shared by the Reset button, program loads and tests. */
  reset() {
    this.cpu.reset();                       // clears PC, GPRs, memory, counters, pipeline registers
    for (const [addr, value] of this.preloadedData) {
      this.cpu.writeMemory(addr, value);    // programs may assume preloaded data
    }
    this.halted = false;
  }

  get isHalted() {
    return this.halted;
  }

  /** True when one clock cycle is meaningful (not halted). */
  get canStep() {
    return !this.halted;
  }

  /**
   * Advance exactly one clock cycle. Returns a render-ready snapshot:
   * {
   *   cycle, retired, halted,
   *   stages: { IF, ID, EX, MEM, WB }  // what each stage processed this cycle
   *   trace: [string]                  // terminal-console lines (HTML-free)
   * }
   * Throws on misaligned memory access (CPUState enforces word alignment).
   */
  step() {
    if (this.halted) return null;
    this.cpu.cycleCount += 1;
    const s = this.cpu;
    const stages = { IF: null, ID: null, EX: null, MEM: null, WB: null };
    const trace = [];
    let flushTarget = null; // PC redirect from a branch resolved in EX this cycle

    /* ---------------- WB — write back (writes before ID reads) -------- */
    {
      const wb = s.MEM_WB;
      if (wb.valid) {
        let wroteRegister = false;
        if (wb.ctrl.regWrite && wb.rd !== 0) {
          s.writeRegister(wb.rd, wb.writeBackValue); // noto writes discarded
          wroteRegister = true;
        }
        s.instructionsRetired += 1;
        stages.WB = {
          valid: true,
          mnemonic: wb.mnemonic,
          assemblyText: wb.assemblyText,
          rd: wb.ctrl.regWrite ? wb.rd : null,
          value: wb.writeBackValue,
          wroteRegister,
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
          memData = s.readMemory(mem.aluResult); // throws if misaligned
          trace.push(`MEM: read word @0x${(mem.aluResult >>> 0).toString(16)} = ${memData}`);
        }
        if (mem.ctrl.memWrite) {
          s.writeMemory(mem.aluResult, mem.writeData); // throws if misaligned
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
          value: mem.ctrl.memRead ? memData : mem.writeData,
        };
      }
      this._nextMEM_WB = next;
    }

    /* ---------------- EX — execute + branch resolution ----------------- */
    {
      const ex = s.ID_EX;
      const next = new EX_MEM_Register();
      if (ex.valid) {
        // M3: no forwarding yet. Operand B from immediate or rs2 as-is.
        const operandA = ex.readData1;
        const operandB = ex.ctrl.aluSrc ? ex.immediate : ex.readData2;

        let aluResult = 0;
        switch (ex.ctrl.aluOp) {
          case 'ADD': aluResult = (operandA + operandB) | 0; break;
          case 'SUB': aluResult = (operandA - operandB) | 0; break;
          case 'AND': aluResult = (operandA & operandB) | 0; break;
          case 'OR':  aluResult = (operandA | operandB) | 0; break;
          case 'NOT': aluResult = (~operandA) | 0; break;
          case 'SLL': aluResult = (operandA << (ex.immediate & 0x1F)) | 0; break;
          default:    aluResult = (operandA + operandB) | 0;
        }

        // Branch resolution in EX (per ISA design-decision (c)).
        let branchTaken = false;
        let branchTarget = (ex.pc + ex.immediate) >>> 0;
        if (ex.ctrl.branch) {
          const a = ex.readData1 | 0;
          const b = ex.readData2 | 0; // signed comparison
          branchTaken = ex.ctrl.branchType === 'BEQ' ? a === b
            : ex.ctrl.branchType === 'BNE' ? a !== b
            : a >= b; // BGE (kholo_ho)
          if (branchTaken) {
            flushTarget = branchTarget;
            s.flushCount += 2; // 2-cycle penalty: IF and ID squashed (design doc (c))
            trace.push(`EX: branch ${ex.ctrl.branchType} taken -> 0x${branchTarget.toString(16)} (flush IF/ID, 2 bubbles)`);
          }
        }

        next.pc = ex.pc;
        next.valid = true;
        next.sourceLine = ex.sourceLine;
        next.assemblyText = ex.assemblyText;
        next.mnemonic = ex.mnemonic;
        next.aluResult = aluResult;
        next.writeData = ex.readData2; // store data (rs2 value)
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
          branchTarget,
        };
        trace.push(`EX: ${ex.mnemonic} ALU ${ex.ctrl.aluOp}(${operandA}, ${operandB}) = ${aluResult}`);
      }
      this._nextEX_MEM = next;
    }

    /* ---------------- ID — decode + register read ---------------------- */
    /* Runs AFTER WB in this function, so WB's write (same edge) is visible:
       the half-cycle register-file model. Distance >= 3 dependencies resolve. */
    {
      const id = s.IF_ID;
      const next = new ID_EX_Register();
      if (id.valid && id.instruction !== 0) {
        const decoded = decodeWord(id.instruction);
        if (!decoded) {
          // Illegal word: flag as a runtime error rather than executing noise.
          const err = new Error(
            `Illegal instruction word 0x${(id.instruction >>> 0).toString(16)} at PC 0x${(id.pc >>> 0).toString(16)}`
          );
          err.stage = 'ID';
          err.pc = id.pc;
          throw err;
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
        next.readData1 = s.readRegister(decoded.rs1); // after WB write
        next.readData2 = s.readRegister(decoded.rs2); // after WB write
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
          immediate: decoded.immediate,
        };
        trace.push(`ID: ${decoded.mnemonic} rs1=${decoded.rs1} rs2=${decoded.rs2} rd=${decoded.rd} imm=${decoded.immediate}`);
      }
      this._nextID_EX = next;
    }

    /* ---------------- IF — fetch + PC update --------------------------- */
    {
      const programEnd = this.words.length * 4;
      const pc = s.pc; // PC latched from the previous cycle
      const next = new IF_ID_Register();
      let nextPc = (pc + 4) >>> 0;

      if (flushTarget !== null) {
        // Branch taken: squash whatever IF just fetched; PC -> branch target.
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
        // IF/ID immediate is a decoded view for the hazard unit (doc §3).
        next.assemblyText = source?.assemblyText ?? `(pc 0x${pc.toString(16)})`;
        next.sourceLine = source?.lineNumber ?? null;
        stages.IF = {
          valid: true,
          pc,
          pcPlus4: nextPc,
          assemblyText: next.assemblyText,
          wordHex: next.instruction.toString(16).toUpperCase().padStart(8, '0'),
        };
        trace.push(`IF: fetch @0x${pc.toString(16)}`);
      } else {
        nextPc = pc; // freeze PC past the program end
        stages.IF = { valid: false, pc };
      }

      s.IF_ID = next;
      s.pc = nextPc;
    }

    /* ---------------- Latch the three remaining registers --------------- */
    // Fresh objects ensure bubble defaults (valid=false, NOP controls).
    if (flushTarget !== null) {
      // Branch taken at EX this edge: ID/EX is squashed along with IF/ID
      // (the two younger instructions never reach EX). See design doc (c).
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
    /* Halt when PC is past the program AND the pipeline has fully drained
       (nothing valid left in ID, EX, MEM or WB). */
    const programEnd = this.words.length * 4;
    const pipelineEmpty =
      !s.IF_ID.valid && !s.ID_EX.valid && !s.EX_MEM.valid && !s.MEM_WB.valid;
    if (s.pc >= programEnd && pipelineEmpty && stages.IF && !stages.IF.valid) {
      this.halted = true;
    }

    return { cycle: s.cycleCount, retired: s.instructionsRetired, halted: this.halted, stages, trace };
  }
}
