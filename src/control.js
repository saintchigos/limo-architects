/**
 * LIMO Control Unit — ID-stage instruction decoder
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Milestone: M3 (Issue A)
 *
 * One raw 32-bit LIMO word goes in; the decoded register fields, the immediate,
 * and the complete `ControlSignals` bundle defined in
 * docs/PIPELINE_REGISTERS.md §2 come out. The pipeline latches those values into
 * ID/EX, so every later stage reads one control bundle that belongs to exactly
 * one instruction.
 *
 * Signal table produced here (`pcSrc` stays 0 until EX resolves a branch):
 *
 * | Mnemonic             | RegWrite | ALUSrc | ALUOp | MemRead | MemWrite | MemToReg | Branch | BranchType | PCSrc |
 * |----------------------|----------|--------|-------|---------|----------|----------|--------|------------|-------|
 * | kopanya              | rd != 0  | 0      | ADD   | 0       | 0        | 0        | 0      | null       | 0     |
 * | tlosa                | rd != 0  | 0      | SUB   | 0       | 0        | 0        | 0      | null       | 0     |
 * | kopanya_hang         | rd != 0  | 1      | ADD   | 0       | 0        | 0        | 0      | null       | 0     |
 * | le                   | rd != 0  | 0      | AND   | 0       | 0        | 0        | 0      | null       | 0     |
 * | kapa                 | rd != 0  | 0      | OR    | 0       | 0        | 0        | 0      | null       | 0     |
 * | hase                 | rd != 0  | 0      | NOT   | 0       | 0        | 0        | 0      | null       | 0     |
 * | checha_hang_leqeleng | rd != 0  | 1      | SLL   | 0       | 0        | 0        | 0      | null       | 0     |
 * | bala                 | rd != 0  | 1      | ADD   | 1       | 0        | 1        | 0      | null       | 0     |
 * | boloka               | 0        | 1      | ADD   | 0       | 1        | 0        | 0      | null       | 0     |
 * | lekana               | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BEQ        | 0     |
 * | hali_lekane          | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BNE        | 0     |
 * | kholo_ho             | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BGE        | 0     |
 *
 * Why each control row looks the way it does:
 *
 * - `RegWrite` is the WB commit enable. It is forced to 0 when `rd == noto`
 *   (r0), because a write to the hardwired zero register must have no effect.
 *   It is also 0 for stores and branches, which produce no register result.
 * - `ALUSrc` selects operand B in EX: 0 uses `readData2` (rs2), 1 uses the
 *   sign-extended immediate. R-type and branches compare/combine two registers;
 *   immediate arithmetic, shifts, loads and stores need the immediate.
 * - `ALUOp` selects the EX operation. Loads and stores use ADD to form the
 *   address `rs1 + imm`; branches use ADD only as a neutral value because their
 *   comparison is performed by the branch unit from `branchType`.
 * - `MemRead` is asserted only by `bala`, preserving the load-store ISA rule
 *   that no other instruction reads data memory.
 * - `MemWrite` is asserted only by `boloka`, and `RegWrite` stays 0 for it, so
 *   store data reaches memory but never write-back.
 * - `MemToReg` selects the WB mux: 1 takes the loaded word (`bala`), 0 takes
 *   `aluResult` for every other register-writing instruction.
 * - `Branch` marks the three conditional branches; `branchType` tells EX which
 *   comparison to perform (BEQ, BNE, BGE).
 * - `PCSrc` is a next-PC select owned by EX. ID always produces 0; EX sets it to
 *   1 only when a branch is actually taken, selecting `branchTarget`.
 * - The EX branch target is `(ID_EX.pc + ID_EX.immediate) >>> 0`, where
 *   `immediate` is the sign-extended B-type offset reconstructed below. This is
 *   "PC of the branch + sign-extended offset", not a PC-relative value added to
 *   any later PC.
 *
 * Unknown opcode/funct combinations throw instead of decoding to a NOP. A NOP
 * would silently hide a corrupt program word, which is worse than a loud fault
 * that the UI can report together with the faulting PC.
 */

import { ControlSignals } from './models.js';
import { INSTRUCTIONS, INSTRUCTION_FORMATS, OPCODES } from './isa.js';

/**
 * Error thrown for a word that is not one of the 12 frozen LIMO instructions.
 * Extra fields let the simulator attach/display the offending encoding.
 */
export class IllegalInstructionError extends Error {
  /**
   * @param {number} word Raw 32-bit word that failed to decode.
   * @param {{ opcode: number, funct3: number, funct7: number }} fields Decoded bit-fields.
   */
  constructor(word, { opcode, funct3, funct7 }) {
    super(
      `Illegal instruction word 0x${(word >>> 0).toString(16).toUpperCase().padStart(8, '0')}: ` +
      `no LIMO instruction matches opcode 0b${opcode.toString(2).padStart(7, '0')}, ` +
      `funct3 0b${funct3.toString(2).padStart(3, '0')}, ` +
      `funct7 0b${funct7.toString(2).padStart(7, '0')}`
    );
    this.name = 'IllegalInstructionError';
    this.word = word >>> 0;
    this.opcode = opcode;
    this.funct3 = funct3;
    this.funct7 = funct7;
  }
}

/**
 * Sign-extend a 12-bit immediate to a signed 32-bit JavaScript number.
 * I-type and S-type immediates are 12 bits (docs/LIMO_ISA_Specification.md A5).
 *
 * @param {number} bits Unsigned 12-bit field value (0x000–0xFFF).
 * @returns {number} Signed value in the range -2048…2047.
 */
export function signExtend12(bits) {
  const value = bits & 0xFFF;
  return (value & 0x800) ? value - 0x1000 : value;
}

/**
 * Reconstruct and sign-extend the 13-bit B-type byte offset.
 *
 * Frozen B-type layout (docs/LIMO_ISA_Specification.md A5):
 *   [imm[12] | imm[10:5] | rs2 | rs1 | funct3 | imm[4:1] | imm[11] | opcode]
 *
 * Bit 0 is implicitly zero because instructions and branch targets are
 * word-aligned. The returned value is the offset EX adds to the branch PC:
 * `branchTarget = (ID_EX.pc + offset) >>> 0`.
 *
 * @param {number} word Raw 32-bit LIMO instruction word.
 * @returns {number} Signed byte offset in the range -4096…4094.
 */
export function extractBImmediate(word) {
  const w = word >>> 0;
  const bit12 = (w >>> 31) & 0x1;
  const bits10_5 = (w >>> 25) & 0x3F;
  const bits4_1 = (w >>> 8) & 0x0F;
  const bit11 = (w >>> 7) & 0x1;

  let offset = (bit12 << 12) | (bit11 << 11) | (bits10_5 << 5) | (bits4_1 << 1);
  if (offset & 0x1000) offset -= 0x2000;
  return offset;
}

/**
 * Extract the sign-extended immediate for a word without decoding controls.
 * IF uses this to fill `IF/ID.immediate` (docs/PIPELINE_REGISTERS.md §3).
 *
 * @param {number} word Raw 32-bit LIMO instruction word.
 * @param {number} opcode The word's 7-bit opcode.
 * @returns {number} Signed immediate, or 0 for R-type words.
 */
export function decodeImmediate(word, opcode) {
  const w = word >>> 0;
  if (opcode === OPCODES.I) {
    return signExtend12((w >>> 20) & 0xFFF);
  }
  if (opcode === OPCODES.S) {
    const imm12 = (((w >>> 25) & 0x7F) << 5) | ((w >>> 7) & 0x1F);
    return signExtend12(imm12);
  }
  if (opcode === OPCODES.B) {
    return extractBImmediate(w);
  }
  return 0;
}

/**
 * Match the frozen ISA table in src/isa.js.
 *
 * Matching requires opcode plus funct3 and, for R-type, funct7. Non-R formats
 * use funct3 because their upper 7 bits are part of the immediate, not a
 * function selector.
 *
 * @param {number} opcode 7-bit opcode.
 * @param {number} funct3 3-bit function field.
 * @param {number} funct7 7-bit function field.
 * @returns {{ mnemonic: string, def: object } | null} Match, or null when illegal.
 */
function matchInstruction(opcode, funct3, funct7) {
  for (const [mnemonic, def] of Object.entries(INSTRUCTIONS)) {
    if (def.opcode !== opcode) continue;

    if (def.format === INSTRUCTION_FORMATS.R) {
      if (def.funct3 === funct3 && def.funct7 === funct7) {
        return { mnemonic, def };
      }
    } else if (def.funct3 === funct3) {
      return { mnemonic, def };
    }
  }
  return null;
}

/**
 * Decode one 32-bit LIMO instruction word into the fields and control bundle
 * consumed by the pipeline.
 *
 * Unused fields are normalised to zero so the future hazard unit cannot mistake
 * immediate bits for real operands:
 * - S-type and B-type have no `rd`, so `rd` is 0.
 * - I-type has no `rs2`, so `rs2` is 0.
 * - `hase` ignores its `rs2` field (the assembler encodes r0), so `rs2` is 0.
 *
 * @param {number} word Raw 32-bit LIMO instruction word.
 * @returns {{
 *   word: number,
 *   mnemonic: string,
 *   format: string,
 *   opcode: number,
 *   rd: number,
 *   funct3: number,
 *   rs1: number,
 *   rs2: number,
 *   funct7: number,
 *   immediate: number,
 *   ctrl: ControlSignals,
 *   instructionDef: object
 * }} Decoded fields plus a fresh control bundle.
 * @throws {IllegalInstructionError} When the encoding is not one of the 12 LIMO instructions.
 */
export function decodeWord(word) {
  const w = word >>> 0;
  const opcode = w & 0x7F;
  const rawRd = (w >>> 7) & 0x1F;
  const funct3 = (w >>> 12) & 0x07;
  const rs1 = (w >>> 15) & 0x1F;
  const rawRs2 = (w >>> 20) & 0x1F;
  const funct7 = (w >>> 25) & 0x7F;

  const match = matchInstruction(opcode, funct3, funct7);
  if (!match) {
    throw new IllegalInstructionError(w, { opcode, funct3, funct7 });
  }

  const { mnemonic, def } = match;
  const format = def.format;

  // `checha_hang_leqeleng` requires imm[11:5] = 0000000; only shamt (imm[4:0])
  // is meaningful. Rejecting a non-zero upper field keeps the decoder from
  // silently accepting an encoding the frozen ISA does not define.
  if (mnemonic === 'checha_hang_leqeleng' && funct7 !== 0) {
    throw new IllegalInstructionError(w, { opcode, funct3, funct7 });
  }

  const rd = (format === INSTRUCTION_FORMATS.S || format === INSTRUCTION_FORMATS.B) ? 0 : rawRd;
  const rs2 = (format === INSTRUCTION_FORMATS.I || mnemonic === 'hase') ? 0 : rawRs2;
  const immediate = decodeImmediate(w, opcode);

  const signals = {
    aluOp: 'ADD',
    aluSrc: 0,
    branch: 0,
    branchType: null,
    memRead: 0,
    memWrite: 0,
    regWrite: 0,
    memToReg: 0,
    pcSrc: 0
  };

  switch (format) {
    case INSTRUCTION_FORMATS.R:
      // Register-register operations read both operands; NOT ignores rs2.
      signals.aluOp = {
        kopanya: 'ADD',
        tlosa: 'SUB',
        le: 'AND',
        kapa: 'OR',
        hase: 'NOT'
      }[mnemonic];
      signals.aluSrc = 0;
      signals.regWrite = rd !== 0 ? 1 : 0;
      break;

    case INSTRUCTION_FORMATS.I:
      // Immediate arithmetic, shifts and loads all take operand B from the
      // sign-extended immediate.
      signals.aluSrc = 1;
      signals.regWrite = rd !== 0 ? 1 : 0;

      if (mnemonic === 'bala') {
        signals.aluOp = 'ADD';
        signals.memRead = 1;
        signals.memToReg = 1;
      } else if (mnemonic === 'checha_hang_leqeleng') {
        signals.aluOp = 'SLL';
      } else {
        signals.aluOp = 'ADD';
      }
      break;

    case INSTRUCTION_FORMATS.S:
      // Store: rs2 is the data written to memory; no register write-back.
      signals.aluOp = 'ADD';
      signals.aluSrc = 1;
      signals.regWrite = 0;
      signals.memWrite = 1;
      break;

    case INSTRUCTION_FORMATS.B:
      // Branch: EX compares rs1/rs2 and computes pc + immediate.
      signals.aluOp = 'ADD';
      signals.aluSrc = 0;
      signals.regWrite = 0;
      signals.branch = 1;
      signals.branchType = mnemonic === 'lekana' ? 'BEQ'
        : mnemonic === 'hali_lekane' ? 'BNE'
        : 'BGE';
      break;

    default:
      break;
  }

  return {
    word: w,
    mnemonic,
    format,
    opcode,
    rd,
    funct3,
    rs1,
    rs2,
    funct7,
    immediate,
    ctrl: new ControlSignals(signals),
    instructionDef: def
  };
}

/**
 * Decode a word and return only its control bundle.
 * Convenience wrapper for callers that already have the raw fields.
 *
 * @param {number} word Raw 32-bit LIMO instruction word.
 * @returns {ControlSignals} Decoded control signals.
 */
export function decodeControl(word) {
  return decodeWord(word).ctrl;
}

/** Alias retained for callers that prefer the instruction-oriented name. */
export const decodeInstruction = decodeWord;

export default decodeWord;
