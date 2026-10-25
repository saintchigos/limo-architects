/**
 * LIMO Two-Pass Assembler
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 */

import {
  INSTRUCTIONS,
  INSTRUCTION_FORMATS,
  REGISTER_LOOKUP,
  REGISTER_INFO
} from './isa.js';

export class AssemblerError extends Error {
  constructor(message, lineNumber = null, lineContent = null) {
    super(lineNumber !== null ? `Line ${lineNumber}: ${message}` : message);
    this.name = 'AssemblerError';
    this.lineNumber = lineNumber;
    this.lineContent = lineContent;
  }
}

export { AssemblerError as AssemblyError };

/**
 * Tokenizes a single line of LIMO assembly code.
 * Handles Sesotho digraphs (apostrophes in ts', ch'), labels, comments, commas, parentheses.
 */
export function tokenizeLine(line, lineNumber = 1) {
  // Strip comments starting with '#'
  const commentIndex = line.indexOf('#');
  const codePart = commentIndex !== -1 ? line.substring(0, commentIndex) : line;
  const trimmed = codePart.trim();

  if (!trimmed) {
    return { label: null, tokens: [] };
  }

  let text = trimmed;
  let label = null;

  // Check for label at beginning of line (e.g., 'boelela:' or 'ts'upiso:')
  const labelMatch = text.match(/^([a-zA-Z_][a-zA-Z0-9_']*)\s*:\s*(.*)$/);
  if (labelMatch) {
    label = labelMatch[1];
    text = labelMatch[2].trim();
  }

  if (!text) {
    return { label, tokens: [] };
  }

  // Tokenize the remaining instruction text
  // Delimiters: spaces, tabs, commas, parentheses
  const tokens = [];
  let currentToken = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === ' ' || char === '\t' || char === ',') {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    } else if (char === '(' || char === ')') {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      tokens.push(char);
    } else {
      currentToken += char;
    }
  }

  if (currentToken) {
    tokens.push(currentToken);
  }

  return { label, tokens };
}

/**
 * Resolves a register string into an index (0-31).
 * Supports r0-r31 and Sesotho aliases (e.g. ts'upiso_phaello, noto).
 */
export function resolveRegister(token, lineNumber, lineContent) {
  if (!token) {
    throw new AssemblerError('Missing expected register operand', lineNumber, lineContent);
  }
  const clean = token.toLowerCase();

  // Direct match in lookup table (handles r0-r31 and Sesotho aliases)
  if (REGISTER_LOOKUP.hasOwnProperty(clean)) {
    return REGISTER_LOOKUP[clean];
  }

  // If in format rXX
  const rMatch = clean.match(/^r([0-9]+)$/);
  if (rMatch) {
    const idx = parseInt(rMatch[1], 10);
    if (idx >= 0 && idx <= 31) {
      return idx;
    }
    throw new AssemblerError(`Register index '${token}' out of bounds (must be r0–r31)`, lineNumber, lineContent);
  }

  throw new AssemblerError(`Unknown register '${token}'. Expected r0–r31 or valid Sesotho register name (e.g. 'noto', 'ts\'upiso_phaello')`, lineNumber, lineContent);
}

/**
 * Parses an immediate string into an integer.
 * Accepts decimal (-2048 to +2047) and hexadecimal (0x...).
 */
export function parseImmediate(token, minVal, maxVal, lineNumber, lineContent) {
  if (token === undefined || token === null || token === '') {
    throw new AssemblerError('Missing expected immediate value', lineNumber, lineContent);
  }

  let val;
  const clean = token.trim();
  if (clean.startsWith('0x') || clean.startsWith('0X') || clean.startsWith('-0x') || clean.startsWith('-0X')) {
    val = parseInt(clean, 16);
  } else {
    val = parseInt(clean, 10);
  }

  if (isNaN(val)) {
    throw new AssemblerError(`Invalid immediate number '${token}'`, lineNumber, lineContent);
  }

  if (val < minVal || val > maxVal) {
    throw new AssemblerError(`Immediate value '${token}' (${val}) exceeds allowed range [${minVal}, ${maxVal}]`, lineNumber, lineContent);
  }

  return val;
}

/**
 * Helper to convert 32-bit unsigned integer to 8-character hex string.
 */
export function toHex32(num) {
  return (num >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export const oHex32 = toHex32;

/**
 * Helper to convert 32-bit unsigned integer to 32-character binary string.
 */
export function toBinary32(num) {
  return (num >>> 0).toString(2).padStart(32, '0');
}

/**
 * Packs fields into 32-bit R-type machine word.
 * [funct7 31:25][rs2 24:20][rs1 19:15][funct3 14:12][rd 11:7][opcode 6:0]
 */
export function encodeRType(opcode, rd, funct3, rs1, rs2, funct7) {
  const word =
    ((funct7 & 0x7F) << 25) |
    ((rs2 & 0x1F) << 20) |
    ((rs1 & 0x1F) << 15) |
    ((funct3 & 0x07) << 12) |
    ((rd & 0x1F) << 7) |
    (opcode & 0x7F);
  return word >>> 0;
}

/**
 * Packs fields into 32-bit I-type machine word.
 * [imm[11:0] 31:20][rs1 19:15][funct3 14:12][rd 11:7][opcode 6:0]
 */
export function encodeIType(opcode, rd, funct3, rs1, imm12) {
  const immMasked = imm12 & 0xFFF;
  const word =
    (immMasked << 20) |
    ((rs1 & 0x1F) << 15) |
    ((funct3 & 0x07) << 12) |
    ((rd & 0x1F) << 7) |
    (opcode & 0x7F);
  return word >>> 0;
}

/**
 * Packs fields into 32-bit S-type machine word.
 * [imm[11:5] 31:25][rs2 24:20][rs1 19:15][funct3 14:12][imm[4:0] 11:7][opcode 6:0]
 */
export function encodeSType(opcode, funct3, rs1, rs2, imm12) {
  const immMasked = imm12 & 0xFFF;
  const immHigh = (immMasked >>> 5) & 0x7F; // 7 bits
  const immLow = immMasked & 0x1F;          // 5 bits
  const word =
    (immHigh << 25) |
    ((rs2 & 0x1F) << 20) |
    ((rs1 & 0x1F) << 15) |
    ((funct3 & 0x07) << 12) |
    (immLow << 7) |
    (opcode & 0x7F);
  return word >>> 0;
}

/**
 * Packs fields into 32-bit B-type machine word.
 * imm is signed 13-bit offset, bit 0 is 0.
 * [imm[12] 31][imm[10:5] 30:25][rs2 24:20][rs1 19:15][funct3 14:12][imm[4:1] 11:8][imm[11] 7][opcode 6:0]
 */
export function encodeBType(opcode, funct3, rs1, rs2, imm13) {
  const imm = imm13 & 0x1FFE; // 13 bits with bit 0 = 0
  const bit12 = (imm >>> 12) & 0x1;
  const bit10_5 = (imm >>> 5) & 0x3F;
  const bit4_1 = (imm >>> 1) & 0xF;
  const bit11 = (imm >>> 11) & 0x1;

  const word =
    (bit12 << 31) |
    (bit10_5 << 25) |
    ((rs2 & 0x1F) << 20) |
    ((rs1 & 0x1F) << 15) |
    ((funct3 & 0x07) << 12) |
    (bit4_1 << 8) |
    (bit11 << 7) |
    (opcode & 0x7F);
  return word >>> 0;
}

/**
 * Main Assembler Class
 */
export class LimoAssembler {
  constructor() {
    this.symbolTable = {};
    this.errors = [];
    this.instructions = [];
  }

  /**
   * Assembles LIMO assembly text into machine code instructions.
   * Returns { instructions, errors, symbolTable, machineWords }
   */
  assemble(sourceCode) {
    this.symbolTable = {};
    this.errors = [];
    this.instructions = [];

    if (sourceCode === undefined || sourceCode === null) {
      sourceCode = '';
    }
    const rawLines = String(sourceCode).split('\n');
    const parsedLines = [];

    // PASS 1: Detect labels, check instruction counts, assign addresses
    let currentAddress = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const lineText = rawLines[i];
      try {
        const { label, tokens } = tokenizeLine(lineText, lineNum);

        if (label) {
          if (this.symbolTable.hasOwnProperty(label)) {
            throw new AssemblerError(`Duplicate label '${label}' already defined at address 0x${toHex32(this.symbolTable[label])}`, lineNum, lineText);
          }
          this.symbolTable[label] = currentAddress;
        }

        if (tokens.length > 0) {
          parsedLines.push({
            lineNumber: lineNum,
            address: currentAddress,
            tokens,
            lineText
          });
          currentAddress += 4;
        }
      } catch (err) {
        this.errors.push({
          lineNumber: err.lineNumber || lineNum,
          message: err.message,
          lineText
        });
      }
    }

    if (this.errors.length > 0) {
      const formattedErrors = this.errors.map(e => {
        if (typeof e === 'string') {
          return e;
        }
        const msg = e.message || String(e);
        if (e.lineNumber && !/^Line\s+\d+:/.test(msg)) {
          return `Line ${e.lineNumber}: ${msg}`;
        }
        return msg;
      });
      return {
        success: false,
        instructions: [],
        errors: formattedErrors,
        symbolTable: this.symbolTable
      };
    }

    // PASS 2: Encode instructions into 32-bit machine code
    for (const item of parsedLines) {
      const { lineNumber, address, tokens, lineText } = item;
      try {
        const encoded = this.encodeInstruction(tokens, address, lineNumber, lineText);
        this.instructions.push(encoded);
      } catch (err) {
        this.errors.push({
          lineNumber: err.lineNumber || lineNumber,
          message: err.message,
          lineText
        });
      }
    }

    if (this.errors.length > 0) {
      const formattedErrors = this.errors.map(e => {
        if (typeof e === 'string') {
          return e;
        }
        const msg = e.message || String(e);
        if (e.lineNumber && !/^Line\s+\d+:/.test(msg)) {
          return `Line ${e.lineNumber}: ${msg}`;
        }
        return msg;
      });
      return {
        success: false,
        instructions: this.instructions,
        errors: formattedErrors,
        symbolTable: this.symbolTable,
        machineWords: this.instructions.map(inst => inst.machineCode)
      };
    }

    const resultInstructions = this.instructions.map(instr => {
      if (instr.value === undefined && instr.machineCode !== undefined) {
        instr.value = instr.machineCode >>> 0;
      }
      if (!instr.hex && instr.value !== undefined) {
        instr.hex = toHex32(instr.value);
      }
      if (!instr.binary && instr.value !== undefined) {
        instr.binary = toBinary32(instr.value);
      }
      return instr;
    });

    return {
      success: true,
      instructions: resultInstructions,
      errors: [],
      symbolTable: this.symbolTable,
      machineWords: resultInstructions.map(inst => inst.machineCode)
    };
  }

  encodeInstruction(tokens, address, lineNumber, lineText) {
    const mnemonic = tokens[0].toLowerCase();
    const instDef = INSTRUCTIONS[mnemonic];

    if (!instDef) {
      throw new AssemblerError(`Unknown mnemonic '${tokens[0]}'. Refer to LIMO ISA specification for supported Sesotho mnemonics.`, lineNumber, lineText);
    }

    let word = 0;
    let fields = {};

    switch (instDef.format) {
      case INSTRUCTION_FORMATS.R: {
        // Special case for 'hase rd, rs1' (NOT instruction)
        if (mnemonic === 'hase') {
          if (tokens.length < 3) {
            throw new AssemblerError("Instruction 'hase' requires 2 operands: hase rd, rs1", lineNumber, lineText);
          }
          const rd = resolveRegister(tokens[1], lineNumber, lineText);
          const rs1 = resolveRegister(tokens[2], lineNumber, lineText);
          const rs2 = 0; // noto
          word = encodeRType(instDef.opcode, rd, instDef.funct3, rs1, rs2, instDef.funct7);
          fields = {
            format: 'R',
            opcode: instDef.opcode,
            rd,
            funct3: instDef.funct3,
            rs1,
            rs2,
            funct7: instDef.funct7,
            imm: null
          };
        } else {
          // Standard R-type: mnemonic rd, rs1, rs2
          if (tokens.length < 4) {
            throw new AssemblerError(`Instruction '${mnemonic}' requires 3 register operands: ${mnemonic} rd, rs1, rs2`, lineNumber, lineText);
          }
          const rd = resolveRegister(tokens[1], lineNumber, lineText);
          const rs1 = resolveRegister(tokens[2], lineNumber, lineText);
          const rs2 = resolveRegister(tokens[3], lineNumber, lineText);
          word = encodeRType(instDef.opcode, rd, instDef.funct3, rs1, rs2, instDef.funct7);
          fields = {
            format: 'R',
            opcode: instDef.opcode,
            rd,
            funct3: instDef.funct3,
            rs1,
            rs2,
            funct7: instDef.funct7,
            imm: null
          };
        }
        break;
      }

      case INSTRUCTION_FORMATS.I: {
        if (mnemonic === 'bala') {
          // Syntax: bala rd, imm(rs1) OR bala rd, imm, rs1
          let rd, imm, rs1;
          if (tokens.length >= 4 && tokens[3] === '(') {
            // tokens: bala, rd, imm, (, rs1, )
            rd = resolveRegister(tokens[1], lineNumber, lineText);
            imm = parseImmediate(tokens[2], -2048, 2047, lineNumber, lineText);
            rs1 = resolveRegister(tokens[4], lineNumber, lineText);
          } else if (tokens.length === 3 && tokens[2].includes('(')) {
            // tokens: bala, rd, imm(rs1)
            rd = resolveRegister(tokens[1], lineNumber, lineText);
            const memMatch = tokens[2].match(/^([^\(]+)\(([^\)]+)\)$/);
            if (!memMatch) {
              throw new AssemblerError(`Invalid memory operand '${tokens[2]}'. Expected format 'offset(register)'`, lineNumber, lineText);
            }
            imm = parseImmediate(memMatch[1], -2048, 2047, lineNumber, lineText);
            rs1 = resolveRegister(memMatch[2], lineNumber, lineText);
          } else if (tokens.length >= 4) {
            rd = resolveRegister(tokens[1], lineNumber, lineText);
            imm = parseImmediate(tokens[2], -2048, 2047, lineNumber, lineText);
            rs1 = resolveRegister(tokens[3], lineNumber, lineText);
          } else {
            throw new AssemblerError("Instruction 'bala' requires syntax: bala rd, offset(rs1)", lineNumber, lineText);
          }

          word = encodeIType(instDef.opcode, rd, instDef.funct3, rs1, imm);
          fields = {
            format: 'I',
            opcode: instDef.opcode,
            rd,
            funct3: instDef.funct3,
            rs1,
            rs2: null,
            funct7: null,
            imm
          };
        } else if (mnemonic === 'checha_hang_leqeleng') {
          // Shift: checha_hang_leqeleng rd, rs1, shamt (0-31)
          if (tokens.length < 4) {
            throw new AssemblerError("Instruction 'checha_hang_leqeleng' requires: checha_hang_leqeleng rd, rs1, shamt", lineNumber, lineText);
          }
          const rd = resolveRegister(tokens[1], lineNumber, lineText);
          const rs1 = resolveRegister(tokens[2], lineNumber, lineText);
          const shamt = parseImmediate(tokens[3], 0, 31, lineNumber, lineText);
          word = encodeIType(instDef.opcode, rd, instDef.funct3, rs1, shamt);
          fields = {
            format: 'I',
            opcode: instDef.opcode,
            rd,
            funct3: instDef.funct3,
            rs1,
            rs2: null,
            funct7: null,
            imm: shamt
          };
        } else {
          // kopanya_hang rd, rs1, imm
          if (tokens.length < 4) {
            throw new AssemblerError(`Instruction '${mnemonic}' requires: ${mnemonic} rd, rs1, imm`, lineNumber, lineText);
          }
          const rd = resolveRegister(tokens[1], lineNumber, lineText);
          const rs1 = resolveRegister(tokens[2], lineNumber, lineText);
          const imm = parseImmediate(tokens[3], -2048, 2047, lineNumber, lineText);
          word = encodeIType(instDef.opcode, rd, instDef.funct3, rs1, imm);
          fields = {
            format: 'I',
            opcode: instDef.opcode,
            rd,
            funct3: instDef.funct3,
            rs1,
            rs2: null,
            funct7: null,
            imm
          };
        }
        break;
      }

      case INSTRUCTION_FORMATS.S: {
        // boloka rs2, imm(rs1)
        let rs2, imm, rs1;
        if (tokens.length >= 4 && tokens[3] === '(') {
          // tokens: boloka, rs2, imm, (, rs1, )
          rs2 = resolveRegister(tokens[1], lineNumber, lineText);
          imm = parseImmediate(tokens[2], -2048, 2047, lineNumber, lineText);
          rs1 = resolveRegister(tokens[4], lineNumber, lineText);
        } else if (tokens.length === 3 && tokens[2].includes('(')) {
          rs2 = resolveRegister(tokens[1], lineNumber, lineText);
          const memMatch = tokens[2].match(/^([^\(]+)\(([^\)]+)\)$/);
          if (!memMatch) {
            throw new AssemblerError(`Invalid memory operand '${tokens[2]}'. Expected format 'offset(register)'`, lineNumber, lineText);
          }
          imm = parseImmediate(memMatch[1], -2048, 2047, lineNumber, lineText);
          rs1 = resolveRegister(memMatch[2], lineNumber, lineText);
        } else if (tokens.length >= 4) {
          rs2 = resolveRegister(tokens[1], lineNumber, lineText);
          imm = parseImmediate(tokens[2], -2048, 2047, lineNumber, lineText);
          rs1 = resolveRegister(tokens[3], lineNumber, lineText);
        } else {
          throw new AssemblerError("Instruction 'boloka' requires syntax: boloka rs2, offset(rs1)", lineNumber, lineText);
        }

        word = encodeSType(instDef.opcode, instDef.funct3, rs1, rs2, imm);
        fields = {
          format: 'S',
          opcode: instDef.opcode,
          rd: null,
          funct3: instDef.funct3,
          rs1,
          rs2,
          funct7: null,
          imm
        };
        break;
      }

      case INSTRUCTION_FORMATS.B: {
        // Branches: mnemonic rs1, rs2, label/offset
        if (tokens.length < 4) {
          throw new AssemblerError(`Branch instruction '${mnemonic}' requires: ${mnemonic} rs1, rs2, label`, lineNumber, lineText);
        }
        const rs1 = resolveRegister(tokens[1], lineNumber, lineText);
        const rs2 = resolveRegister(tokens[2], lineNumber, lineText);
        const targetToken = tokens[3];

        let offset;
        if (this.symbolTable.hasOwnProperty(targetToken)) {
          const targetAddress = this.symbolTable[targetToken];
          offset = targetAddress - address;
        } else {
          // Try parsing direct numeric offset
          offset = parseImmediate(targetToken, -4096, 4094, lineNumber, lineText);
        }

        if (offset % 2 !== 0) {
          throw new AssemblerError(`Branch offset ${offset} is not halfword/word aligned`, lineNumber, lineText);
        }

        if (offset < -4096 || offset > 4094) {
          throw new AssemblerError(`Branch target offset ${offset} exceeds 13-bit branch reach [-4096, +4094]`, lineNumber, lineText);
        }

        word = encodeBType(instDef.opcode, instDef.funct3, rs1, rs2, offset);
        fields = {
          format: 'B',
          opcode: instDef.opcode,
          rd: null,
          funct3: instDef.funct3,
          rs1,
          rs2,
          funct7: null,
          imm: offset
        };
        break;
      }
    }

    return {
      address,
      lineNumber,
      lineText,
      mnemonic,
      format: instDef.format,
      machineCode: word >>> 0,
      hex: toHex32(word),
      binary: toBinary32(word),
      fields,
      instructionDef: instDef
    };
  }
}

export { LimoAssembler as Assembler };
export default LimoAssembler;

