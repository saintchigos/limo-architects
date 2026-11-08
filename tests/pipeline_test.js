/**
 * LIMO Five-Stage Pipeline Engine Tests (M3, Issue #25 / M3-D)
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 *
 * Automated test suite for src/pipeline.js. Runnable with single command:
 * npm test   (part of the combined M3 suite)
 *
 * Acceptance (Issue #25): for each example program, load → step until halt →
 * assert final state, with the expected cycle count documented together with
 * its derivation, cross-checked against the hand-traced pipeline tables in
 * docs/HAZARD_API.md §7 (words assembled with src/assembler.js; program2 gets
 * the documented preload Memory[100] = 21).
 *
 * IMPORTANT — what these tests assert:
 * The M3 engine deliberately has no forwarding and no load-use stall
 * (docs/HAZARD_API.md §1.3), so a true dependency closer than distance 3
 * computes a stale value. On programs 1-3 and test_all_instructions that is
 * the documented, hand-traced M3 result — the ISA-level values in the .limo
 * file headers are "expected after M4" (docs/HAZARD_API.md §7, §8.8) and must
 * NOT be asserted here. `examples/program4_hazard_free.limo` is the one program
 * that is hazard-free by construction, so it is the M3 acceptance case where
 * the header values and the engine output must agree exactly.
 * The step loop caps at MAX_STEPS so a non-halting program fails fast instead
 * of spinning forever.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LimoAssembler } from '../src/assembler.js';
import { LimoPipeline } from '../src/pipeline.js';
import { CPUState } from '../src/models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_STEPS = 1000;

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

/** Assemble an examples/*.limo file; toolbar-style loader for the tests. */
function loadExample(fileName) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'examples', fileName), 'utf8');
  const res = new LimoAssembler().assemble(source);
  assert(res.success === true, `${fileName} assembles cleanly`, JSON.stringify(res.errors));
  if (!res.success) return null;
  return {
    words: res.machineWords,
    source: res.instructions.map(i => ({ lineNumber: i.lineNumber, assemblyText: i.assemblyText ?? '', mnemonic: i.mnemonic }))
  };
}

/** Step until halt (bounded) and return the engine so callers can assert state. */
function runToHalt(fileName, preloadedData = null) {
  const program = loadExample(fileName);
  if (!program) return null;
  const engine = new LimoPipeline({ words: program.words, source: program.source, preloadedData });
  let steps = 0;
  while (engine.canStep && steps < MAX_STEPS) {
    engine.step();
    steps++;
  }
  assertEqual(engine.cpu.cycleCount, steps, `${fileName} halted by itself (no MAX_STEPS bail-out)`);
  return engine;
}

console.log('====================================================');
console.log('  LIMO M3 Pipeline Engine Test Suite');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// Test Suite 1: program1_arithmetic.limo — arithmetic + logic chain
// -----------------------------------------------------------------------------
// Derivation (docs/HAZARD_API.md §7.3):
//   5 words, straight-line code. i0 fetches at cycle 1, i4 retires at cycle 9
//   (drain = words + 4 = 9). True dependencies at d=1/2:
//     i2 reads r1 (d=2), r2 (d=1)  -> r3 stays 0
//     i3 reads r2 (d=2)            -> r4 = 12 (r2 stale 0)
//     i4 reads r3 (d=2), r4 (d=1)  -> r5 stays 0
//   i0->i3 (r1, d=3) is safe on the WB-before-ID register file.
//   The header values r3=17/r4=7/r5=1 are the M4 forwarding contract, not M3.
console.log('[Test Suite 1: program1_arithmetic.limo — hand-traced M3 semantics]');
{
  const p = runToHalt('program1_arithmetic.limo');
  if (p) {
    assert(p.halted, 'program1 reaches the halted state');
    assertEqual(p.cpu.cycleCount, 9, 'program1 cycle count = 9 (5 words + 4-cycle drain)');
    assertEqual(p.cpu.instructionsRetired, 5, 'program1 retires all 5 instructions');
    assertEqual(p.cpu.flushCount, 0, 'program1 flush count = 0 (no taken branches)');
    assertEqual(p.cpu.stallCount, 0, 'program1 stall count = 0 (M3 has no stall logic)');
    assertEqual(p.cpu.readRegister(1), 12, 'program1 r1 = 12');
    assertEqual(p.cpu.readRegister(2), 5, 'program1 r2 = 5');
    assertEqual(p.cpu.readRegister(3), 0, 'program1 r3 = 0 (stale RAW at d=2/d=1 — M3 design, §7.3)');
    assertEqual(p.cpu.readRegister(4), 12, 'program1 r4 = 12 (r2 stale 0 — M3 design, §7.3)');
    assertEqual(p.cpu.readRegister(5), 0, 'program1 r5 = 0 (stale RAW — M3 design, §7.3)');
  }
}

// -----------------------------------------------------------------------------
// Test Suite 2: program2_memory.limo — load/store with preloaded data
// -----------------------------------------------------------------------------
// Derivation (docs/HAZARD_API.md §7.4, with preloaded Memory[100] = 21):
//   4 words, straight-line code: drain = 4 + 4 = 8 cycles, 4 retired.
//     i1 bala reads r1 (d=1)        -> address = 0, loads Memory[0] = 0 -> r2 = 0
//     i2 kopanya reads r2 (d=1)     -> r3 = 0 (load-use distance, M3 has no stall)
//     i3 boloka data r3 (d=1)       -> stores 0 to Memory[104] (base r1 at d=3 is safe)
//   The header values r2=21/r3=42/Memory[104]=42 are the M4 contract, not M3.
console.log('[Test Suite 2: program2_memory.limo — preloaded Memory[100] = 21]');
{
  const preload = new Map([[100, 21]]); // Memory[100] = 21 — documented preload
  const p = runToHalt('program2_memory.limo', preload);
  if (p) {
    assert(p.halted, 'program2 reaches the halted state');
    assertEqual(p.cpu.cycleCount, 8, 'program2 cycle count = 8 (4 words + 4-cycle drain)');
    assertEqual(p.cpu.instructionsRetired, 4, 'program2 retires all 4 instructions');
    assertEqual(p.cpu.flushCount, 0, 'program2 flush count = 0');
    assertEqual(p.cpu.readRegister(1), 100, 'program2 r1 = 100');
    assertEqual(p.cpu.readRegister(2), 0, 'program2 r2 = 0 (bala base r1 stale — M3 design, §7.4)');
    assertEqual(p.cpu.readRegister(3), 0, 'program2 r3 = 0 (load-use distance — M3 design, §7.4)');
    assertEqual(p.cpu.readMemory(100), 21, 'program2 Memory[100] = 21 unchanged (preloaded)');
    assertEqual(p.cpu.readMemory(104), 0, 'program2 Memory[104] = 0 (store data stale — M3 design, §7.4)');
  }
}

// -----------------------------------------------------------------------------
// Test Suite 3: program3_loop.limo — conditional branch loop
// -----------------------------------------------------------------------------
// Derivation (docs/HAZARD_API.md §7.5):
//   Every branch taken costs +2 cycles (flush IF/ID and the fetched word) and
//   the exit check reads r1 at d=1 from the preceding tlosa, so it compares the
//   *previous* counter. Iteration bodies that retire: 5 + 5*(3 instructions)…
//   Total: 36 cycles, 22 retired, 10 flushes (5 extra iterations' worth of
//   squashed instructions), 0 stalls. r5 = 15 is accidentally correct: the
//   extra iteration adds 0. r1 = -1 because the counter keeps decrementing on
//   the last two iteratons before the stale compare reads 0 and exits.
//   The header contract r1 = 0 is the M4 fix (§7.5: "Do not fix this by
//   editing the program; fix it in the M4 hazard unit.").
console.log('[Test Suite 3: program3_loop.limo — loop with stale exit compare]');
{
  const p = runToHalt('program3_loop.limo');
  if (p) {
    assert(p.halted, 'program3 reaches the halted state');
    assertEqual(p.cpu.cycleCount, 36, 'program3 cycle count = 36 (hand-traced, §7.5)');
    assertEqual(p.cpu.instructionsRetired, 22, 'program3 retires 22 instructions (hand-traced, §7.5)');
    assertEqual(p.cpu.flushCount, 10, 'program3 flush count = 10 taken-branch flushes, 2 per taken branch');
    assertEqual(p.cpu.stallCount, 0, 'program3 stall count = 0 (M3 has no stall logic)');
    assertEqual(p.cpu.readRegister(1), -1, 'program3 r1 = -1 (stale exit compare — M3 design, §7.5)');
    assertEqual(p.cpu.readRegister(2), 1, 'program3 r2 = 1');
    assertEqual(p.cpu.readRegister(3), 1, 'program3 r3 = 1 (exit threshold)');
    assertEqual(p.cpu.readRegister(5), 15, 'program3 r5 = 15 at halt (loop branches executed)');
  }
}

// -----------------------------------------------------------------------------
// Test Suite 4: program4_hazard_free.limo — the M3 hazard-free acceptance case
// -----------------------------------------------------------------------------
// The one example where header values and engine output MUST agree: every true
// dependency is at distance >= 3 and the WB-before-ID register file resolves it
// exactly (docs/HAZARD_API.md §7.6). 9 words, straight-line: 9 + 4 = 13 cycles.
console.log('[Test Suite 4: program4_hazard_free.limo — hazard-free PASS case]');
{
  const p = runToHalt('program4_hazard_free.limo');
  if (p) {
    assert(p.halted, 'program4 reaches the halted state');
    assertEqual(p.cpu.cycleCount, 13, 'program4 cycle count = 13 (9 words + 4-cycle drain, §7.6)');
    assertEqual(p.cpu.instructionsRetired, 9, 'program4 retires all 9 instructions');
    assertEqual(p.cpu.flushCount, 0, 'program4 flush count = 0');
    assertEqual(p.cpu.readRegister(1), 5, 'program4 r1 = 5');
    assertEqual(p.cpu.readRegister(2), 7, 'program4 r2 = 7');
    assertEqual(p.cpu.readRegister(3), 9, 'program4 r3 = 9');
    assertEqual(p.cpu.readRegister(4), 11, 'program4 r4 = 11');
    assertEqual(p.cpu.readRegister(5), 12, 'program4 r5 = 12 (d=4/d=3, both safe)');
    assertEqual(p.cpu.readRegister(6), 3, 'program4 r6 = 3');
    assertEqual(p.cpu.readRegister(7), 4, 'program4 r7 = 4');
    assertEqual(p.cpu.readRegister(10), 6, 'program4 r10 = 6');
    assertEqual(p.cpu.readRegister(8), 15, 'program4 r8 = 15 (d=4/d=3, both safe)');
  }
}

// -----------------------------------------------------------------------------
// Test Suite 5: test_all_instructions.limo — instruction/orthography smoke test
// -----------------------------------------------------------------------------
// Derivation (docs/HAZARD_API.md §7.7): two taken branches (lekana at i10 and
// kholo_ho at i14 squash the sequential-fetch instructions behind them), giving
// 23 cycles, 15 retired, 4 flushes. Early dependencies are stale: the shift
// reads r1 before i0 retires, the store/loads address Memory[0] with a stale
// base, and the final register file is r1=20 r2=200 r4=-20 r6=20 r7=-21 r8=20
// r9=99 r12=1 with Memory[0] = 20 (the accidental stale-base store).
console.log('[Test Suite 5: test_all_instructions.limo — smoke test, stale early ops]');
{
  const p = runToHalt('test_all_instructions.limo');
  if (p) {
    assert(p.halted, 'test_all reaches the halted state');
    assertEqual(p.cpu.cycleCount, 23, 'test_all cycle count = 23 (hand-traced, §7.7)');
    assertEqual(p.cpu.instructionsRetired, 15, 'test_all retires 15 instructions (hand-traced, §7.7)');
    assertEqual(p.cpu.flushCount, 4, 'test_all flush count = 4 (two taken branches x 2, §7.7)');
    assertEqual(p.cpu.readRegister(1), 20, 'test_all r1 = 20');
    assertEqual(p.cpu.readRegister(2), 200, 'test_all r2 = 200 (r2 reassigned as ts\'upiso_phaello base)');
    assertEqual(p.cpu.readRegister(4), -20, 'test_all r4 = -20 (tlosa with stale r3)');
    assertEqual(p.cpu.readRegister(5), 0, 'test_all r5 = 0 (le with stale r1/r2)');
    assertEqual(p.cpu.readRegister(6), 20, 'test_all r6 = 20 (kapa, d>=4 safe)');
    assertEqual(p.cpu.readRegister(7), -21, 'test_all r7 = -21 (hase r1)');
    assertEqual(p.cpu.readRegister(8), 20, 'test_all r8 = 20 (bala with stale base = 0)');
    assertEqual(p.cpu.readRegister(9), 99, 'test_all r9 = 99 (hali_lekane not-taken path keeps i11)');
    assertEqual(p.cpu.readRegister(12), 1, 'test_all r12 = 1 (qetello block reached)');
    assertEqual(p.cpu.readMemory(0), 20, 'test_all Memory[0] = 20 (stale-base store from §7.7)');
    assertEqual(p.cpu.readMemory(200), 0, 'test_all stores nothing at 200 (the boloka addressed 0 with a stale base)');
  }
}

// -----------------------------------------------------------------------------
// Test Suite 6: Misaligned load/store raise a loud error at MEM
// -----------------------------------------------------------------------------

console.log('[Test Suite 6: Misaligned Load/Store Raise Errors]');

// Direct model-level assertion: CPUState must refuse any non-multiple-of-4
// word address (docs/PIPELINE_REGISTERS.md load-store rule).
{
  const cpu = new CPUState();
  let loadThrew = null;
  let storeThrew = null;
  try { cpu.readMemory(102); } catch (error) { loadThrew = error; }
  try { cpu.writeMemory(2, 5); } catch (error) { storeThrew = error; }
  assert(loadThrew && /Misaligned word memory read/.test(loadThrew.message),
    'CPUState.readMemory(102) throws a misaligned-read error', loadThrew ? loadThrew.message : String(loadThrew));
  assert(storeThrew && /Misaligned word memory write/.test(storeThrew.message),
    'CPUState.writeMemory(2, 5) throws a misaligned-write error', storeThrew ? storeThrew.message : String(storeThrew));
}

// End-to-end through assembler + pipeline: bala with an odd offset faults at
// MEM when the address 100 + 2 = 102 hits memory.
{
  const res = new LimoAssembler().assemble('kopanya_hang r1, r0, 100\nbala r2, 2(r1)');
  assert(res.success, 'misaligned load program assembles (alignment is a runtime rule, not an encoding rule)',
    JSON.stringify(res.errors));
  if (res.success) {
    const p = new LimoPipeline({ words: res.machineWords, source: res.instructions.map(i => ({ lineNumber: i.lineNumber, assemblyText: i.assemblyText ?? '', mnemonic: i.mnemonic })) });
    let error = null;
    let steps;
    try {
      for (steps = 0; steps < MAX_STEPS && !error; steps++) p.step();
    } catch (thrown) {
      error = thrown;
    }
    assert(error && /Misaligned/.test(error.message), 'misaligned bala faults at MEM with a readable error',
      error ? error.message : String(error));
  }
}

// End-to-end: boloka with an odd offset faults the same way.
{
  const res = new LimoAssembler().assemble('kopanya_hang r1, r0, 100\nboloka r3, 2(r1)');
  assert(res.success, 'misaligned store program assembles', JSON.stringify(res.errors));
  if (res.success) {
    const p = new LimoPipeline({ words: res.machineWords, source: res.instructions.map(i => ({ lineNumber: i.lineNumber, assemblyText: i.assemblyText ?? '', mnemonic: i.mnemonic })) });
    let error = null;
    try {
      for (let steps = 0; steps < MAX_STEPS && !error; steps++) p.step();
    } catch (thrown) {
      error = thrown;
    }
    assert(error && /Misaligned/.test(error.message), 'misaligned boloka faults at MEM with a readable error',
      error ? error.message : String(error));
  }
}

console.log('\n====================================================');
console.log(`  Tests completed: ${passed} passed, ${failed} failed`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED SUCCESSFULLY! ✓\n');
}
