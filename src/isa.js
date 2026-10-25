/**
 * LIMO ISA Definition & Constants
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 */

export const INSTRUCTION_FORMATS = {
  R: 'R',
  I: 'I',
  S: 'S',
  B: 'B',
};

export const OPCODES = {
  R: 0b1001101, // 0x4D (77)
  I: 0b1001001, // 0x49 (73)
  S: 0b0101101, // 0x2D (45)
  B: 0b1001110, // 0x4E (78)
};

export const OPCODES_HEX = {
  R: '0x4D',
  I: '0x49',
  S: '0x2D',
  B: '0x4E',
};

// Instruction definitions: format, opcode, funct3, funct7 (for R-type), Sesotho description, RV32I counterpart
export const INSTRUCTIONS = {
  // Arithmetic (R-type and I-type)
  kopanya: {
    format: INSTRUCTION_FORMATS.R,
    opcode: OPCODES.R,
    funct3: 0b000,
    funct7: 0b0000000,
    rv32i: 'ADD',
    name: 'kopanya',
    description: 'Add rd = rs1 + rs2',
    sesotho: 'Kopanya (kopanya rs1 le rs2 ho etsa rd)'
  },
  tlosa: {
    format: INSTRUCTION_FORMATS.R,
    opcode: OPCODES.R,
    funct3: 0b000,
    funct7: 0b0000001,
    rv32i: 'SUB',
    name: 'tlosa',
    description: 'Subtract rd = rs1 - rs2',
    sesotho: 'Tlosa (tlosa rs2 ho rs1 ho etsa rd)'
  },
  kopanya_hang: {
    format: INSTRUCTION_FORMATS.I,
    opcode: OPCODES.I,
    funct3: 0b100,
    funct7: null,
    rv32i: 'ADDI',
    name: 'kopanya_hang',
    description: 'Add Immediate rd = rs1 + imm',
    sesotho: 'Kopanya hang (kopanya hang-hang imm ho rs1)'
  },

  // Logic (R-type)
  le: {
    format: INSTRUCTION_FORMATS.R,
    opcode: OPCODES.R,
    funct3: 0b001,
    funct7: 0b0000010,
    rv32i: 'AND',
    name: 'le',
    description: 'Bitwise AND rd = rs1 & rs2',
    sesotho: 'Le (papiso ea AND lipakeng tsa rs1 le rs2)'
  },
  kapa: {
    format: INSTRUCTION_FORMATS.R,
    opcode: OPCODES.R,
    funct3: 0b101,
    funct7: 0b0000011,
    rv32i: 'OR',
    name: 'kapa',
    description: 'Bitwise OR rd = rs1 | rs2',
    sesotho: 'Kapa (papiso ea OR lipakeng tsa rs1 le rs2)'
  },
  hase: {
    format: INSTRUCTION_FORMATS.R,
    opcode: OPCODES.R,
    funct3: 0b010,
    funct7: 0b0000100,
    rv32i: 'NOT',
    name: 'hase',
    description: 'Bitwise NOT rd = ~rs1 (rs2 encoded as r0)',
    sesotho: 'Hase (ho fetola li-bits tsa rs1 ho ba tse fapaneng)'
  },

  // Shift (I-type)
  checha_hang_leqeleng: {
    format: INSTRUCTION_FORMATS.I,
    opcode: OPCODES.I,
    funct3: 0b101,
    funct7: null,
    rv32i: 'SLLI',
    name: 'checha_hang_leqeleng',
    description: 'Shift Left Logical Immediate rd = rs1 << shamt',
    sesotho: 'Checha hang leqeleng (sutisa li-bits ka leqeleng)'
  },

  // Memory (I-type load, S-type store)
  bala: {
    format: INSTRUCTION_FORMATS.I,
    opcode: OPCODES.I,
    funct3: 0b000,
    funct7: null,
    rv32i: 'LW',
    name: 'bala',
    description: 'Load Word rd = Memory[rs1 + imm]',
    sesotho: 'Bala (bala lentsoe ho tsoa mohopolong/memory)'
  },
  boloka: {
    format: INSTRUCTION_FORMATS.S,
    opcode: OPCODES.S,
    funct3: 0b000,
    funct7: null,
    rv32i: 'SW',
    name: 'boloka',
    description: 'Store Word Memory[rs1 + imm] = rs2',
    sesotho: 'Boloka (boloka boleng ba rs2 mohopolong/memory)'
  },

  // Conditional Branch (B-type)
  lekana: {
    format: INSTRUCTION_FORMATS.B,
    opcode: OPCODES.B,
    funct3: 0b000,
    funct7: null,
    rv32i: 'BEQ',
    name: 'lekana',
    description: 'Branch if Equal if rs1 == rs2 then PC += imm',
    sesotho: 'Lekana (tlola haeba rs1 e lekana le rs2)'
  },
  hali_lekane: {
    format: INSTRUCTION_FORMATS.B,
    opcode: OPCODES.B,
    funct3: 0b001,
    funct7: null,
    rv32i: 'BNE',
    name: 'hali_lekane',
    description: 'Branch if Not Equal if rs1 != rs2 then PC += imm',
    sesotho: 'Ha li lekane (tlola haeba rs1 e sa lekane le rs2)'
  },
  kholo_ho: {
    format: INSTRUCTION_FORMATS.B,
    opcode: OPCODES.B,
    funct3: 0b101,
    funct7: null,
    rv32i: 'BGE',
    name: 'kholo_ho',
    description: 'Branch if Greater or Equal if rs1 >= rs2 then PC += imm',
    sesotho: 'Kholo ho (tlola haeba rs1 e le kholo kapa e lekana le rs2)'
  }
};

// Register map: canonical numbers, standard names, and Sesotho names
export const REGISTER_INFO = [
  { index: 0,  name: 'r0',  alias: 'noto',               group: 'zero',       meaning: 'Zero (hardwired to 0)' },
  { index: 1,  name: 'r1',  alias: 'khutla_aterese',     group: 'ra',         meaning: 'Return address' },
  { index: 2,  name: 'r2',  alias: "ts'upiso_phaello",    group: 'sp',         meaning: 'Stack pointer' },
  { index: 3,  name: 'r3',  alias: "ts'upiso_kakaretso",  group: 'gp',         meaning: 'Global pointer' },
  { index: 4,  name: 'r4',  alias: 'li_khang0',          group: 'argument',   meaning: 'Function argument 0 (a0)' },
  { index: 5,  name: 'r5',  alias: 'li_khang1',          group: 'argument',   meaning: 'Function argument 1 (a1)' },
  { index: 6,  name: 'r6',  alias: 'li_khang2',          group: 'argument',   meaning: 'Function argument 2 (a2)' },
  { index: 7,  name: 'r7',  alias: 'li_khang3',          group: 'argument',   meaning: 'Function argument 3 (a3)' },
  { index: 8,  name: 'r8',  alias: 'li_phetho0',         group: 'return',     meaning: 'Function return value 0' },
  { index: 9,  name: 'r9',  alias: 'li_phetho1',         group: 'return',     meaning: 'Function return value 1' },
  { index: 10, name: 'r10', alias: 'li_nakoana0',        group: 'temporary',  meaning: 'Temporary register 0 (t0)' },
  { index: 11, name: 'r11', alias: 'li_nakoana1',        group: 'temporary',  meaning: 'Temporary register 1 (t1)' },
  { index: 12, name: 'r12', alias: 'li_nakoana2',        group: 'temporary',  meaning: 'Temporary register 2 (t2)' },
  { index: 13, name: 'r13', alias: 'li_nakoana3',        group: 'temporary',  meaning: 'Temporary register 3 (t3)' },
  { index: 14, name: 'r14', alias: 'li_nakoana4',        group: 'temporary',  meaning: 'Temporary register 4 (t4)' },
  { index: 15, name: 'r15', alias: 'li_nakoana5',        group: 'temporary',  meaning: 'Temporary register 5 (t5)' },
  { index: 16, name: 'r16', alias: 'li_boloka0',         group: 'saved',      meaning: 'Saved register 0 (s0)' },
  { index: 17, name: 'r17', alias: 'li_boloka1',         group: 'saved',      meaning: 'Saved register 1 (s1)' },
  { index: 18, name: 'r18', alias: 'li_boloka2',         group: 'saved',      meaning: 'Saved register 2 (s2)' },
  { index: 19, name: 'r19', alias: 'li_boloka3',         group: 'saved',      meaning: 'Saved register 3 (s3)' },
  { index: 20, name: 'r20', alias: 'li_boloka4',         group: 'saved',      meaning: 'Saved register 4 (s4)' },
  { index: 21, name: 'r21', alias: 'li_boloka5',         group: 'saved',      meaning: 'Saved register 5 (s5)' },
  { index: 22, name: 'r22', alias: 'li_boloka6',         group: 'saved',      meaning: 'Saved register 6 (s6)' },
  { index: 23, name: 'r23', alias: 'li_boloka7',         group: 'saved',      meaning: 'Saved register 7 (s7)' },
  { index: 24, name: 'r24', alias: 'li_boloka8',         group: 'saved',      meaning: 'Saved register 8 (s8)' },
  { index: 25, name: 'r25', alias: 'li_boloka9',         group: 'saved',      meaning: 'Saved register 9 (s9)' },
  { index: 26, name: 'r26', alias: 'li_boloka10',        group: 'saved',      meaning: 'Saved register 10 (s10)' },
  { index: 27, name: 'r27', alias: 'li_boloka11',        group: 'saved',      meaning: 'Saved register 11 (s11)' },
  { index: 28, name: 'r28', alias: 'li_boloka12',        group: 'saved',      meaning: 'Saved register 12 (s12)' },
  { index: 29, name: 'r29', alias: 'li_boloka13',        group: 'saved',      meaning: 'Saved register 13 (s13)' },
  { index: 30, name: 'r30', alias: 'li_boloka14',        group: 'saved',      meaning: 'Saved register 14 (s14)' },
  { index: 31, name: 'r31', alias: 'li_boloka15',        group: 'saved',      meaning: 'Saved register 15 (s15)' },
];

// Mapping for fast identifier resolution (supports both rX and Sesotho aliases)
export const REGISTER_LOOKUP = {};
REGISTER_INFO.forEach(reg => {
  REGISTER_LOOKUP[reg.name.toLowerCase()] = reg.index;
  REGISTER_LOOKUP[reg.alias.toLowerCase()] = reg.index;
});

// Also support base group names mapping to first of group, or with underscore
REGISTER_LOOKUP['li_khang'] = 4;
REGISTER_LOOKUP['li_phetho'] = 8;
REGISTER_LOOKUP['li_nakoana'] = 10;
REGISTER_LOOKUP['li_boloka'] = 16;
// Also common RV32I aliases for convenience and cross-checking
REGISTER_LOOKUP['zero'] = 0;
REGISTER_LOOKUP['ra'] = 1;
REGISTER_LOOKUP['sp'] = 2;
REGISTER_LOOKUP['gp'] = 3;
REGISTER_LOOKUP['a0'] = 4;
REGISTER_LOOKUP['a1'] = 5;
REGISTER_LOOKUP['a2'] = 6;
REGISTER_LOOKUP['a3'] = 7;

export const SPECIAL_REGISTERS = {
  PC: 'sebali_tsamaiso'
};
