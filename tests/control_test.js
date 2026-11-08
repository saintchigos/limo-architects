/**
 * LIMO Control Unit Unit Tests (M3, Issue #25 / M3-D)
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 *
 * Automated test suite for the ID-stage instruction decoder (src/control.js).
 * Runnable with single command: npm test   (part of the combined M3 suite)
 *
 * Acceptance (Issue #25): for each of the 12 instructions, the full
 * `ControlSignals` bundle decoded from a machine word must match the
 * documented table (control.js module header / docs/PIPELINE_REGISTERS.md §2).
 * The table rows live in RUN_SIGNALS below so a future ISA change fails loudly.
 *
 * NOTE: depends on the assembler API contract from issue #12
 * (LimoAssembler.assemble returning machineWords) and on issue #22 (decoder).
 */

import { LimoAssembler } from '../src/assembler.js';
import { decodeWord, IllegalInstructionError, decodeImmediate } from '../src/control.js';
import { INSTRUCTION_FORMATS } from '../src/isa.js';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName} ${details ? '--> ' + details : ''}`);
  }
}

function assertEqual(actual, expected, testName) {
  assert(actual === expected, testName, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * Assert every documented control field of one decoded bundle.
 * `expected` uses the documented table column names.
 */
function assertSignals(loaded, expected, testName) {
  for (const [field, expectation] of Object.entries(expected.signals)) {
    assertEqual(loaded.ctrl[field], expectation, `${testName} — ${field}`);
  }
}

console.log('====================================================');
console.log('  LIMO M3 Control Unit Test Suite');
console.log('====================================================\n');

const assembler = new LimoAssembler();

/**
 * One row per documented instruction (control.js header table):
 *   RegWrite | ALUSrc | ALUOp | MemRead | MemWrite | MemToReg | Branch | BranchType | PCSrc
 * RegWrite is 1 except for stores/branches and any rd == noto (r0) case,
 * which is asserted separately in Suite 2.
 */
const RUN_SIGNALS = [
  { mnemonic: 'kopanya',              src: 'kopanya r3, r1, r10',        format: INSTRUCTION_FORMATS.R, signals: { aluOp: 'ADD', aluSrc: 0, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'tlosa',                src: 'tlosa r4, r1, r2',           format: INSTRUCTION_FORMATS.R, signals: { aluOp: 'SUB', aluSrc: 0, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'kopanya_hang',         src: 'kopanya_hang r5, r1, 10',    format: INSTRUCTION_FORMATS.I, signals: { aluOp: 'ADD', aluSrc: 1, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'le',                   src: 'le r5, r1, r2',              format: INSTRUCTION_FORMATS.R, signals: { aluOp: 'AND', aluSrc: 0, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'kapa',                 src: 'kapa r6, r1, r2',            format: INSTRUCTION_FORMATS.R, signals: { aluOp: 'OR',  aluSrc: 0, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'hase',                 src: 'hase r7, r1',                format: INSTRUCTION_FORMATS.R, signals: { aluOp: 'NOT', aluSrc: 0, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'checha_hang_leqeleng', src: 'checha_hang_leqeleng r2, r1, 4', format: INSTRUCTION_FORMATS.I, signals: { aluOp: 'SLL', aluSrc: 1, branch: 0, branchType: null, memRead: 0, memWrite: 0, regWrite: 1, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'bala',                 src: 'bala r2, 16(r1)',            format: INSTRUCTION_FORMATS.I, signals: { aluOp: 'ADD', aluSrc: 1, branch: 0, branchType: null, memRead: 1, memWrite: 0, regWrite: 1, memToReg: 1, pcSrc: 0 } },
  { mnemonic: 'boloka',               src: 'boloka r3, 8(r2)',           format: INSTRUCTION_FORMATS.S, signals: { aluOp: 'ADD', aluSrc: 1, branch: 0, branchType: null, memRead: 0, memWrite: 1, regWrite: 0, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'lekana',               src: 'lekana r1, r2, 8',           format: INSTRUCTION_FORMATS.B, signals: { aluOp: 'ADD', aluSrc: 0, branch: 1, branchType: 'BEQ', memRead: 0, memWrite: 0, regWrite: 0, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'hali_lekane',          src: 'hali_lekane r1, r2, 12',     format: INSTRUCTION_FORMATS.B, signals: { aluOp: 'ADD', aluSrc: 0, branch: 1, branchType: 'BNE', memRead: 0, memWrite: 0, regWrite: 0, memToReg: 0, pcSrc: 0 } },
  { mnemonic: 'kholo_ho',             src: 'kholo_ho r1, r2, 24',        format: INSTRUCTION_FORMATS.B, signals: { aluOp: 'ADD', aluSrc: 0, branch: 1, branchType: 'BGE', memRead: 0, memWrite: 0, regWrite: 0, memToReg: 0, pcSrc: 0 } },
];

// -----------------------------------------------------------------------------
// Test Suite 1: Full control bundle for each of the 12 LIMO instructions
// -----------------------------------------------------------------------------

console.log('[Test Suite 1: Documented Control Signal Table for All 12 Instructions]');

for (const row of RUN_SIGNALS) {
  const res = assembler.assemble(row.src);
  assert(res.success === true && res.machineWords.length === 1, `${row.mnemonic} machine word assembles ('${row.src}')`,
    JSON.stringify(res.errors));
  if (!res.success) continue;

  let decoded;
  try {
    decoded = decodeWord(res.machineWords[0]);
  } catch (error) {
    assert(false, `${row.mnemonic} decodes without throwing`, error.message);
    continue;
  }

  assertSignals(decoded, row, `${row.mnemonic}`);
  assertEqual(decoded.mnemonic, row.mnemonic, `${row.mnemonic} — mnemonic matches`);
  assertEqual(decoded.format, row.format, `${row.mnemonic} — format matches`);
}

// -----------------------------------------------------------------------------
// Test Suite 2: RegWrite is forced off when rd is noto (r0)
// -----------------------------------------------------------------------------

console.log('\n[Test Suite 2: RegWrite Suppression for rd = noto]',);

// Writes to the hardwired zero register must not invoke WB, whatever the format.
const RD_ZERO_CASES = [
  { src: 'kopanya noto, r1, r2' },
  { src: 'kopanya_hang noto, r0, 7' },
  { src: 'bala noto, 0(r1)' },
  { src: 'checha_hang_leqeleng noto, r1, 2' },
];

for (const row of RD_ZERO_CASES) {
  const res = assembler.assemble(row.src);
  assert(res.success === true, `assembles ${row.src}`, JSON.stringify(res.errors));
  if (!res.success) continue;
  try {
    const decoded = decodeWord(res.machineWords[0]);
    assertEqual(decoded.ctrl.regWrite, 0, `RegWrite suppressed for rd=noto (${row.src})`);
  } catch (error) {
    assert(false, `decodes ${row.src}`, error.message);
  }
}

// -----------------------------------------------------------------------------
// Test Suite 3: Unused fields are normalised to zero (M4 hazard-unit safety)
// -----------------------------------------------------------------------------

console.log('\n[Test Suite 3: Field Normalisation for Unused Slots]');

// S-type and B-type have no rd: the bits in [11:7] are immediate bits.
{
  const res = assembler.assemble('boloka r3, 8(r2)');
  assert(res.success, 'boloka assembles', JSON.stringify(res.errors));
  assertEqual(decodeWord(res.machineWords[0]).rd, 0, 'S-type boloka decodes rd = 0');
}
{
  const res = assembler.assemble('lekana r1, r2, 8');
  assert(res.success, 'lekana assembles', JSON.stringify(res.errors));
  assertEqual(decodeWord(res.machineWords[0]).rd, 0, 'B-type lekana decodes rd = 0');
}
// I-type has no rs2: the bits in [24:20] are immediate bits.
{
  const res = assembler.assemble('kopanya_hang r5, r1, 10');
  assert(res.success, 'kopanya_hang assembles', JSON.stringify(res.errors));
  assertEqual(decodeWord(res.machineWords[0]).rs2, 0, 'I-type kopanya_hang decodes rs2 = 0');
}
// hase ignores its rs2 (assembler encodes r0), so the hazard unit must never
// see a phantom dependency.
{
  const res = assembler.assemble('hase r7, r1');
  assert(res.success, 'hase assembles', JSON.stringify(res.errors));
  assertEqual(decodeWord(res.machineWords[0]).rs2, 0, 'hase decodes rs2 = 0 (NOT uses rs1 only)');
}

// -----------------------------------------------------------------------------
// Test Suite 4: Immediate extraction and sign extension
// -----------------------------------------------------------------------------

console.log('\n[Test Suite 4: Immediate Extraction and Sign Extension]');

// Negative I-type immediate round-trips through the sign extension.
{
  const res = assembler.assemble('kopanya_hang r5, r1, -5');
  assert(res.success, 'kopanya_hang r5, r1, -5 assembles', JSON.stringify(res.errors));
  const word = res.machineWords[0];
  assertEqual(decodeImmediate(word, word & 0x7F), -5, 'I-type immediate -5 sign-extends to -5');
}
// Negative S-type offset.
{
  const res = assembler.assemble('boloka r2, -12(r1)');
  assert(res.success, 'boloka r2, -12(r1) assembles', JSON.stringify(res.errors));
  const word = res.machineWords[0];
  assertEqual(decodeImmediate(word, word & 0x7F), -12, 'S-type offset -12 sign-extends to -12');
}
// Backward B-type offset (same layout idea as the program 3 loop: the branch
// sits at address 4 and targets label boelela at address 0, so offset = -4).
{
  const res = assembler.assemble('boelela:\n  kopanya r5, r5, r1\n  kholo_ho r1, r3, boelela');
  assert(res.success, 'backward loop assembles', JSON.stringify(res.errors));
  const word = res.machineWords[1];
  assertEqual(decodeImmediate(word, word & 0x7F), -4, 'B-type backward offset -4 sign-extends to -4');
}
// R-type words carry no immediate: decodeImmediate must return 0.
{
  const res = assembler.assemble('kopanya r3, r1, r2');
  assert(res.success, 'kopanya assembles', JSON.stringify(res.errors));
  const word = res.machineWords[0];
  assertEqual(decodeImmediate(word, word & 0x7F), 0, 'R-type word extracts immediate 0');
}

// -----------------------------------------------------------------------------
// Test Suite 5: Illegal words throw, never decode to a NOP
// -----------------------------------------------------------------------------

console.log('\n[Test Suite 5: Illegal Instruction Words Throw]');

// All-zero word (opcode 0x00 matches nothing).
try {
  decodeWord(0x00000000);
  assert(false, 'all-zero word throws IllegalInstructionError');
} catch (error) {
  assert(error instanceof IllegalInstructionError, 'all-zero word throws IllegalInstructionError',
    `got ${error.name}: ${error.message}`);
  assertEqual(error.word, 0, 'error carries the offending word');
}

// kopanya machine word with funct7 corrupted past the frozen ISA table.
{
  const good = assembler.assemble('kopanya r3, r1, r2').machineWords[0];
  const corrupted = (good | (0b1111111 << 25)) >>> 0; // funct7 = 0b1111111
  try {
    decodeWord(corrupted);
    assert(false, 'corrupted funct7 throws IllegalInstructionError');
  } catch (error) {
    assert(error instanceof IllegalInstructionError, 'corrupted funct7 throws IllegalInstructionError',
      `got ${error.name}: ${error.message}`);
  }
}
// checha_hang_leqeleng requires imm[11:5] = 0000000; anything else is illegal.
{
  const good = assembler.assemble('checha_hang_leqeleng r2, r1, 4').machineWords[0];
  const corrupted = (good | (0b0000001 << 25)) >>> 0; // imm[11:5] = 0000001
  try {
    decodeWord(corrupted);
    assert(false, 'checha with non-zero imm[11:5] throws IllegalInstructionError');
  } catch (error) {
    assert(error instanceof IllegalInstructionError, 'checha with non-zero imm[11:5] throws IllegalInstructionError',
      `got ${error.name}: ${error.message}`);
  }
}

// -----------------------------------------------------------------------------
// Test Suite 6: PCSrc is owned by EX — ID always decodes 0
// -----------------------------------------------------------------------------

console.log('\n[Test Suite 6: PCSrc Stays 0 in ID]');

for (const row of RUN_SIGNALS) {
  const res = assembler.assemble(row.src);
  if (!res.success) continue;
  const ctrl = decodeWord(res.machineWords[0]).ctrl;
  assertEqual(ctrl.pcSrc, 0, `PCSrc decoded as 0 (branch resolution belongs to EX) for ${row.mnemonic}`);
}

console.log('\n====================================================');
console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✓\n');
}
