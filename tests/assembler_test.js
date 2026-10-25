/**
 * Automated Unit Test Suite for LIMO Assembler
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Milestone: M2
 *
 * Runnable with single command: npm test   (delegates to node tests/assembler_test.js)
 *
 * NOTE: depends on the assembler API contract from issue #12
 * (src/assembler.js exporting LimoAssembler / toHex32, src/isa.js exporting
 * INSTRUCTIONS / OPCODES). Until that lands, this suite fails on import —
 * that is loud by design so the freeze contract is testable day one.
 */

import { LimoAssembler, toHex32 } from '../src/assembler.js';
import { INSTRUCTIONS, OPCODES } from '../src/isa.js';

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

function assertHex(actual, expected, testName) {
  const act = actual.toUpperCase().replace(/^0X/, '');
  const exp = expected.toUpperCase().replace(/^0X/, '');
  assert(act === exp, testName, `expected 0x${exp}, got 0x${act}`);
}

console.log('====================================================');
console.log('  LIMO M2 Assembler Unit Test Suite');
console.log('====================================================\n');

const assembler = new LimoAssembler();

// -----------------------------------------------------------------------------
// Test Suite 1: Hand-Encoded Verification Vectors from Course ISA Specification
// -----------------------------------------------------------------------------
console.log('[Test Suite 1: ISA Spec Hand-Encoded Verification Vectors]');

// Vector 1: R-type
// kopanya r3, r1, r2 -> 0x002081CD
{
  const res = assembler.assemble('kopanya r3, r1, r2');
  assert(res.success, 'kopanya r3, r1, r2 assembles successfully');
  assertHex(res.instructions[0].hex, '002081CD', 'kopanya r3, r1, r2 hand-encoded hex matches 0x002081CD');
}

// Vector 2: I-type
// kopanya_hang r5, r1, 10 -> 0x00A0C2C9
{
  const res = assembler.assemble('kopanya_hang r5, r1, 10');
  assert(res.success, 'kopanya_hang r5, r1, 10 assembles successfully');
  assertHex(res.instructions[0].hex, '00A0C2C9', 'kopanya_hang r5, r1, 10 hand-encoded hex matches 0x00A0C2C9');
}

// Vector 3: S-type
// boloka r3, 8(r2) -> 0x0031042D
{
  const res = assembler.assemble('boloka r3, 8(r2)');
  assert(res.success, 'boloka r3, 8(r2) assembles successfully');
  assertHex(res.instructions[0].hex, '0031042D', 'boloka r3, 8(r2) hand-encoded hex matches 0x0031042D');
}

// Vector 4: B-type
// lekana r1, r2, 8 -> 0x0020844E
{
  const res = assembler.assemble('lekana r1, r2, 8');
  assert(res.success, 'lekana r1, r2, 8 assembles successfully');
  assertHex(res.instructions[0].hex, '0020844E', 'lekana r1, r2, 8 hand-encoded hex matches 0x0020844E');
}

// -----------------------------------------------------------------------------
// Test Suite 2: All 12 LIMO Instructions Coverage
// -----------------------------------------------------------------------------
console.log('\n[Test Suite 2: All 12 Instructions Coverage]');

// 1. kopanya (ADD)
{
  const res = assembler.assemble('kopanya r10, r11, r12');
  assert(res.success && res.instructions[0].fields.opcode === OPCODES.R && res.instructions[0].fields.funct7 === 0b0000000, 'kopanya fields valid');
}

// 2. tlosa (SUB)
{
  const res = assembler.assemble('tlosa r4, r1, r2');
  assert(res.success && res.instructions[0].fields.funct7 === 0b0000001 && res.instructions[0].fields.funct3 === 0b000, 'tlosa fields valid');
}

// 3. kopanya_hang (ADDI)
{
  const res = assembler.assemble('kopanya_hang r1, r0, -5');
  assert(res.success && res.instructions[0].fields.imm === -5 && res.instructions[0].fields.opcode === OPCODES.I, 'kopanya_hang with negative immediate');
}

// 4. le (AND)
{
  const res = assembler.assemble('le r5, r3, r4');
  assert(res.success && res.instructions[0].fields.funct3 === 0b001 && res.instructions[0].fields.funct7 === 0b0000010, 'le (AND) fields valid');
}

// 5. kapa (OR)
{
  const res = assembler.assemble('kapa r6, r3, r4');
  assert(res.success && res.instructions[0].fields.funct3 === 0b101 && res.instructions[0].fields.funct7 === 0b0000011, 'kapa (OR) fields valid');
}

// 6. hase (NOT - Bitwise NOT)
{
  const res = assembler.assemble('hase r7, r1');
  assert(res.success && res.instructions[0].fields.rs2 === 0 && res.instructions[0].fields.funct3 === 0b010 && res.instructions[0].fields.funct7 === 0b0000100, 'hase (NOT) correctly encodes rs2 as r0');
}

// 7. checha_hang_leqeleng (SLLI)
{
  const res = assembler.assemble('checha_hang_leqeleng r2, r1, 4');
  assert(res.success && res.instructions[0].fields.imm === 4 && res.instructions[0].fields.funct3 === 0b101, 'checha_hang_leqeleng (SLLI) fields valid');
}

// 8. bala (LW)
{
  const res = assembler.assemble('bala r2, 16(r1)');
  assert(res.success && res.instructions[0].fields.imm === 16 && res.instructions[0].fields.opcode === OPCODES.I, 'bala (LW) fields valid');
}

// 9. boloka (SW)
{
  const res = assembler.assemble('boloka r2, -12(r1)');
  assert(res.success && res.instructions[0].fields.imm === -12 && res.instructions[0].fields.opcode === OPCODES.S, 'boloka (SW) with negative offset');
}

// 10. lekana (BEQ)
{
  const res = assembler.assemble('target:\nlekana r1, r2, target');
  assert(res.success && res.instructions[0].fields.imm === 0 && res.instructions[0].fields.funct3 === 0b000, 'lekana (BEQ) to same line');
}

// 11. hali_lekane (BNE)
{
  const res = assembler.assemble('hali_lekane r1, r2, 12');
  assert(res.success && res.instructions[0].fields.imm === 12 && res.instructions[0].fields.funct3 === 0b001, 'hali_lekane (BNE) fields valid');
}

// 12. kholo_ho (BGE)
{
  const res = assembler.assemble('kholo_ho r1, r2, 24');
  assert(res.success && res.instructions[0].fields.imm === 24 && res.instructions[0].fields.funct3 === 0b101, 'kholo_ho (BGE) fields valid');
}

// -----------------------------------------------------------------------------
// Test Suite 3: Sesotho Orthography & Apostrophe Handling
// -----------------------------------------------------------------------------
console.log('\n[Test Suite 3: Sesotho Orthography & Register Digraphs]');

// Register with digraph apostrophe: ts'upiso_phaello (stack pointer r2)
{
  const res = assembler.assemble("kopanya_hang ts'upiso_phaello, noto, 512");
  assert(res.success, "Tokenizes and resolves ts'upiso_phaello as r2");
  assert(res.instructions[0].fields.rd === 2, "ts'upiso_phaello maps to register index 2");
  assert(res.instructions[0].fields.rs1 === 0, "noto maps to register index 0");
}

// Register with digraph apostrophe: ts'upiso_kakaretso (global pointer r3)
{
  const res = assembler.assemble("kopanya_hang ts'upiso_kakaretso, noto, 1024");
  assert(res.success && res.instructions[0].fields.rd === 3, "ts'upiso_kakaretso maps to register index 3");
}

// Return address register: khutla_aterese (r1)
{
  const res = assembler.assemble("kopanya khutla_aterese, noto, r4");
  assert(res.success && res.instructions[0].fields.rd === 1, "khutla_aterese maps to register index 1");
}

// Memory instruction using Sesotho register name with apostrophe
{
  const res = assembler.assemble("bala r10, 0(ts'upiso_phaello)");
  assert(res.success && res.instructions[0].fields.rs1 === 2, "bala with base register ts'upiso_phaello resolves correctly");
}

// -----------------------------------------------------------------------------
// Test Suite 4: Labels, Branches & Program Loops
// -----------------------------------------------------------------------------
console.log('\n[Test Suite 4: Labels & Branch Resolving]');

// Forward and backward branches
{
  const prog = `
  kopanya_hang r1, r0, 5
boelela:
  kopanya r5, r5, r1
  tlosa r1, r1, r2
  kholo_ho r1, r3, boelela
  kopanya_hang r10, r0, 1
  `;
  const res = assembler.assemble(prog);
  assert(res.success, 'Loop program with backward branch assembles successfully');
  assert(res.symbolTable['boelela'] === 4, 'Label boelela is located at address 0x00000004');
  // kholo_ho is at address 12 (0x0C). boelela is at 4. offset = 4 - 12 = -8
  const bgeInst = res.instructions[3];
  assert(bgeInst.fields.imm === -8, `Backward branch offset is -8 (actual: ${bgeInst.fields.imm})`);
}

// Forward branch
{
  const prog = `
  lekana r1, r2, forward_target
  kopanya_hang r3, r0, 99
forward_target:
  kopanya_hang r4, r0, 42
  `;
  const res = assembler.assemble(prog);
  assert(res.success, 'Forward branch assembles successfully');
  // lekana is at 0. forward_target is at 8. offset = +8
  assert(res.instructions[0].fields.imm === 8, 'Forward branch offset is +8');
}

// -----------------------------------------------------------------------------
// Test Suite 5: Error Reporting Diagnostics
// -----------------------------------------------------------------------------
console.log('\n[Test Suite 5: Plain-Language Error Reporting]');

// Unknown mnemonic (asserts line number and message — B8i acceptance criteria)
{
  const res = assembler.assemble('kopanya r1, r2, r3\nadd r1, r2, r3');
  assert(!res.success, 'Fails on unknown English mnemonic add');
  assert(res.errors[0].message.includes('Unknown mnemonic'), 'Helpful error on unknown mnemonic');
  assert(res.errors[0].line === 2, 'Unknown mnemonic error reports source line 2');
}

// Unknown register (asserts line number and message)
{
  const res = assembler.assemble('# register test\nkopanya r50, r1, r2');
  assert(!res.success, 'Fails on out of bounds register r50');
  assert(res.errors[0].message.includes('out of bounds'), 'Reports out of bounds register');
  assert(res.errors[0].line === 2, 'Out of bounds register error reports source line 2');
}

// Undefined label (asserts line number and message)
{
  const res = assembler.assemble('lekana r1, r2, non_existent_label');
  assert(!res.success, 'Fails on undefined branch label');
  assert(res.errors[0].message.includes('Invalid immediate'), 'Reports error on undefined branch label');
  assert(res.errors[0].line === 1, 'Undefined label error reports source line 1');
}

// Immediate out of range (asserts line number and message)
{
  const res = assembler.assemble('# imm range test\n\nkopanya_hang r1, r0, 5000');
  assert(!res.success, 'Fails on I-type immediate 5000 outside 12-bit signed range');
  assert(res.errors[0].message.includes('exceeds allowed range'), 'Reports immediate out of range');
  assert(res.errors[0].line === 3, 'Immediate out of range error reports source line 3');
}

console.log('\n====================================================');
console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✓\n');
}
