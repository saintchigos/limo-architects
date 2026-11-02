/**
 * LIMO Control Unit
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 *
 * The control unit is the ID-stage decoder. It turns one raw 32-bit LIMO word
 * into the decoded fields the pipeline latches into ID/EX and the complete
 * `ControlSignals` bundle defined in docs/PIPELINE_REGISTERS.md §2.
 *
 * Signal table produced by this module (PCSrc stays 0 until EX resolves a branch):
 *
 * | Mnemonic              | RegWrite | ALUSrc | ALUOp | MemRead | MemWrite | MemToReg | Branch | BranchType | PCSrc |
 * |-----------------------|----------|--------|-------|---------|----------|----------|--------|------------|-------|
 * | kopanya               | rd != 0  | 0      | ADD   | 0       | 0        | 0        | 0      | null       | 0     |
 * | tlosa                 | rd != 0  | 0      | SUB   | 0       | 0        | 0        | 0      | null       | 0     |
 * | kopanya_hang          | rd != 0  | 1      | ADD   | 0       | 0        | 0        | 0      | null       | 0     |
 * | le                    | rd != 0  | 0      | AND   | 0       | 0        | 0        | 0      | null       | 0     |
 * | kapa                  | rd != 0  | 0      | OR    | 0       | 0        | 0        | 0      | null       | 0     |
 * | hase                  | rd != 0  | 0      | NOT   | 0       | 0        | 0        | 0      | null       | 0     |
 * | checha_hang_leqeleng  | rd != 0  | 1      | SLL   | 0       | 0        | 0        | 0      | null       | 0     |
 * | bala                  | rd != 0  | 1      | ADD   | 1       | 0        | 1        | 0      | null       | 0     |
 * | boloka                | 0        | 1      | ADD   | 0       | 1        | 0        | 0      | null       | 0     |
 * | lekana                | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BEQ        | 0     |
 * | hali_lekane           | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BNE        | 0     |
 * | kholo_ho              | 0        | 0      | ADD   | 0       | 0        | 0        | 1      | BGE        | 0     |
 *
 * Why each signal exists:
 * - RegWrite lets WB commit the instruction's result. It is forced off when
 *   rd is `noto` (r0), because architectural writes to zero are discarded.
 * - ALUSrc selects operand B: 0 reads rs2, 1 selects the sign-extended
 *   immediate. R-type and branches therefore use 0; immediates and memory
 *   address calculations use 1.
 * - ALUOp selects the EX operation: ADD/SUB/AND/OR/NOT/SLL. Loads and stores
 *   use ADD to form `rs1 + imm`; branches use a separate comparator in EX.
 * - MemRead/MemWrite are asserted only by `bala`/`boloka`, keeping the
 *   load-store ISA property that no other instruction touches data memory.
 * - MemToReg selects the WB mux: 1 takes the loaded word, 0 takes ALUResult.
 * - Branch marks a conditional branch; BranchType picks BEQ/BNE/BGE for EX.
 * - PCSrc is produced by ID as 0 and is set by EX when a branch is taken.
 */

import { ControlSignals } from './models.js';
import { INSTRUCTIONS, INSTRUCTION_FORMATS, OPCODES } from './isa.js';

/**
 * Sign-extend a 12-bit immediate to a signed 32-bit JavaScript number.
 * I-type and S-type immediates are 12 bits wide (docs/LIMO_ISA_Specification.md A5).
 *
 * @param {number} bits Unsigned 12-bit field value (0x000–0xFFF).
 * @returns {number} Signed value in the range -2048…2047.
 */
export function signExtend12(bits) {
  return (bits & 0x800) ? bits - 0x1000 : bits;
}

/**
 * Reconstruct and sign-extend the 13-bit B-type byte offset.
 *
 * B-type layout (docs/LIMO_ISA_Specification.md A5):
 *   [imm[12] | imm[10:5] | rs2 | rs1 | funct3 | imm[4:1] | imm[11] | opcode]
 * Bit 0 is implicit zero because every LIMO instruction is word-aligned.
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
 * Extract the sign-extended immediate for an instruction without decoding its
 * control signals. IF uses this to fill the `IF/ID.immediate` diagnostic view
 * required by docs/PIPELINE_REGISTERS.md §3.
 *
 * @param {number} word Raw 32-bit LIMO instruction word.
 * @param {number} opcode The word's 7-bit opcode.
 * @returns {number} Signed immediate, or 0 for R-type words.
 */
export function decodeImmediate(word, opcode) {
  const w = word >>> 0;
  if (opcode === OPCODES.I || opcode === OPCODES.S) {
    const imm12 = opcode === OPCODES.I
      ? (w >>> 20) & 0xFFF
      : (((w >>> 25) & 0x7F) << 5) | ((w >>> 7) & 0x1F);
    return signExtend12(imm12);
  }
  if (opcode === OPCODES.B) return extractBImmediate(w);
  return 0;
}

/**
 * Match the frozen ISA table in src/isa.js. Matching on opcode plus funct3 and
 * (for R-type) funct7 means an unknown or malformed word is never guessed into
 * a real instruction.
 *
 * @returns {{ mnemonic: string, def: object } | null}
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
 * The decoder deliberately throws for an unknown word instead of returning a
 * NOP: silently treating an illegal encoding as a bubble would hide a corrupt
 * program. The pipeline adds the faulting PC before rethrowing (Issue A:
 * "unknown words reported as an error, not silently decoded").
 *
 * Fields unused by a format are normalised to zero so they cannot be mistaken
 * for real operands by the M4 hazard unit:
 * - S-type and B-type have no rd, so `rd` is 0.
 * - I-type has no rs2, so `rs2` is 0 (the bits in that position are immediate).
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
 * }}
 * @throws {Error} When the opcode/funct combination is not one of the 12 LIMO instructions.
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
    const error = new Error(
      `Illegal instruction word 0x${w.toString(16).toUpperCase().padStart(8, '0')}: ` +
      `no LIMO instruction matches opcode 0b${opcode.toString(2).padStart(7, '0')}, ` +
      `funct3 0b${funct3.toString(2).padStart(3, '0')}, ` +
      `funct7 0b${funct7.toString(2).padStart(7, '0')}`
    );
    error.name = 'IllegalInstructionError';
    error.word = w;
    throw error;
  }

  const { mnemonic, def } = match;
  const format = def.format;
  const rd = (format === INSTRUCTION_FORMATS.S || format === INSTRUCTION_FORMATS.B) ? 0 : rawRd;
  const rs2 = (format === INSTRUCTION_FORMATS.I) ? 0 : rawRs2;
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
    case INSTRUCTION_FORMATS.R: {
      // R-type reads both register operands; hase ignores rs2 (NOT uses rs1 only).
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
    }

    case INSTRUCTION_FORMATS.I: {
      // All I-type instructions use the sign-extended immediate as operand B.
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
    }

    case INSTRUCTION_FORMATS.S: {
      // Store: rs2 is the data to write; no register write-back.
      signals.aluOp = 'ADD';
      signals.aluSrc = 1;
      signals.regWrite = 0;
      signals.memWrite = 1;
      break;
    }

    case INSTRUCTION_FORMATS.B: {
      // Branch: EX compares rs1 and rs2 and computes pc + immediate.
      signals.aluOp = 'ADD';
      signals.aluSrc = 0;
      signals.regWrite = 0;
      signals.branch = 1;
      signals.branchType = mnemonic === 'lekana' ? 'BEQ'
        : mnemonic === 'hali_lekane' ? 'BNE'
        : 'BGE';
      break;
    }

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

export default decodeWord;
