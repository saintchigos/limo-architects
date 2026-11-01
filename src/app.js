/**
 * LIMO Simulator Web Application Controller
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Milestone: M3 (Interface Lead: Mokheseng Mohasoa / @Dvago432)
 *
 * UI contract (M2 design doc §1.1): the interface reads a snapshot of the
 * simulation state and never mutates the pipeline directly. All stepping
 * goes through the LimoPipeline engine (src/pipeline.js); the UI renders
 * the returned per-cycle result plus the CPUState snapshot.
 *
 * The commented-out M2 wireframe stub that previously lived in this file
 * was removed; the machine-code naming and reference behaviour it drafted
 * is preserved in the active controller below.
 */

import { LimoAssembler, toHex32 } from './assembler.js';
import { REGISTER_INFO } from './isa.js';
import { LimoPipeline } from './pipeline.js';

export const EXAMPLES = {
  program1: {
    name: 'Program 1: Arithmetic (Kopanya/Tlosa)',
    preloadedData: null,
    source: `# LIMO Program 1 — Arithmetic & Logic
# CS3520 — Team Architects
# Computes: r5 = (r1 + r2) AND (r1 - r2)
# a = 12, b = 5 -> Expected (forwarding, M4): r5 = 1
# NOTE: reads r2 only 1 cycle after its producer, so on the M3
# hazard-free engine (no forwarding) r3/r4/r5 use stale r2 = 0.

kopanya_hang r1, r0, 12     # r1 = 12 (a)
kopanya_hang r2, r0, 5      # r2 = 5  (b)
kopanya      r3, r1, r2     # r3 = 12 + 5 = 17
tlosa        r4, r1, r2     # r4 = 12 - 5 = 7
le           r5, r3, r4     # r5 = 17 AND 7 = 1
`},

  program2: {
    name: 'Program 2: Memory (Bala/Boloka)',
    preloadedData: { 100: 21 },
    source: `# LIMO Program 2 — Memory Load & Store
# Memory[100] = 21 (preloaded) -> Memory[104] = 42
# NOTE: bala result reaches WB one cycle after kopanya reads r2,
# so on the M3 engine r3 stays stale until forwarding lands in M4.

kopanya_hang r1, r0, 100    # r1 = base 100
bala         r2, 0(r1)      # r2 = Memory[100]
kopanya      r3, r2, r2     # r3 = 21 + 21 = 42
boloka       r3, 4(r1)      # Memory[104] = 42
`},

  program3: {
    name: 'Program 3: Loop (Boelela)',
    preloadedData: null,
    source: `# LIMO Program 3 — Loop Accumulator
# Computes sum: 5 + 4 + 3 + 2 + 1 = 15
# NOTE: in-loop reads of r1/r5 trail their producers by < 3
# instructions, so the hazard-free M3 engine drifts until M4.

kopanya_hang r1, r0, 5      # r1 = counter (5)
kopanya_hang r2, r0, 1      # r2 = step (1)
kopanya_hang r3, r0, 1      # r3 = threshold (1)
kopanya_hang r5, r0, 0      # r5 = sum (0)

boelela:
    kopanya  r5, r5, r1      # r5 += r1
    tlosa    r1, r1, r2      # r1 -= 1
    kholo_ho r1, r3, boelela # if r1 >= 1 repeat
`},

  program4_hazard_free: {
    name: 'Program 4: Hazard-Free Spacing (M3 demo)',
    preloadedData: null,
    source: `# LIMO Program 4 — Hazard-free by construction (runs CORRECTLY on M3)
# Producers are at least 3 instructions ahead of their consumers,
# which the WB-before-ID register-file convention resolves exactly.
# Expected final: r1=5 r2=7 r3=9 r4=11 r5=12 r6=3 r7=4 r10=6 r8=15
# Expected: 9 retired, 13 cycles, 0 branches taken.

kopanya_hang r1, noto, 5     # i0: r1 = 5
kopanya_hang r2, noto, 7     # i1: r2 = 7
kopanya_hang r3, noto, 9     # i2: spacing filler
kopanya_hang r4, noto, 11    # i3: spacing filler
kopanya      r5, r1, r2      # i4: r5 = 5 + 7 = 12   (dist 4, 3)
kopanya_hang r6, noto, 3     # i5: r6 = 3
kopanya_hang r7, noto, 4     # i6: spacing filler
kopanya_hang r10, noto, 6    # i7: spacing filler
kapa         r8, r5, r6      # i8: r8 = 12 | 3 = 15  (dist 4, 3)
`},

  all_instructions: {
    name: 'All 12 Sesotho Mnemonics',
    preloadedData: null,
    source: `# LIMO All 12 Instructions & Sesotho Digraph Test
# Close dependencies are deliberate here — suitable for the
# M4 forwarding/hazard demo, expected stale on the M3 engine.

kopanya_hang r1, noto, 20
checha_hang_leqeleng r2, r1, 2
kopanya r3, r1, r2
tlosa r4, r3, r1
le r5, r1, r2
kapa r6, r1, r2
hase r7, r1
kopanya_hang ts'upiso_phaello, noto, 200
boloka r6, 0(ts'upiso_phaello)
bala r8, 0(ts'upiso_phaello)
lekana r8, r6, label_eq
kopanya_hang r9, noto, 99
label_eq:
hali_lekane r1, r2, label_neq
label_neq:
kholo_ho r2, r1, label_done
label_done:
kopanya_hang r12, noto, 1
`}
};

/* Speed presets for the Run loop (ms between clock cycles) */
const RUN_SPEEDS = { slow: 400, normal: 160, fast: 60 };

class LimoApp {
  constructor() {
    this.assembler = new LimoAssembler();
    this.engine = null;            // LimoPipeline — single owner of mutable state
    this.assembledResult = null;
    this.displayFormat = 'hex';    // 'hex' | 'bin' | 'dec'
    this.isHalted = false;
    this.runTimer = null;
    this.runSpeed = RUN_SPEEDS.normal;
    this.prevRegisters = null;     // Int32Array snapshot before last step
    this.prevMemory = null;        // Map snapshot before last step
    this.MAX_LINES = 400;          // terminal console cap

    // DOM references
    this.editor = document.getElementById('assemblyEditor');
    this.console = document.getElementById('executionConsole');
    this.gprBody = document.getElementById('gprTableBody');
    this.mcBody = document.getElementById('machineCodeBody');
    this.mcHeader = document.getElementById('machineTableHeader');
    this.regsHeader = document.getElementById('regsTableHeader');
    this.displayBar = document.getElementById('displayTypeBar');
    this.exampleSelect = document.getElementById('exampleSelect');
    this.sbCycleVal = document.getElementById('sbCycleVal');
    this.sbCpiVal = document.getElementById('sbCpiVal');
    this.sbRetiredVal = document.getElementById('sbRetiredVal');
    this.sbFlushVal = document.getElementById('sbFlushVal');
    this.sbStateChip = document.getElementById('sbStateChip');
    this.sbNarrationText = document.getElementById('sbNarrationText');

    this.init();
  }

  init() {
    this.editor.value = EXAMPLES.program1.source;

    // Transport controls
    document.getElementById('btnRun').addEventListener('click', () => this.toggleRun());
    document.getElementById('btnAssemble').addEventListener('click', () => {
      this.stopRun();
      this.runAssemble();
    });
    document.getElementById('btnStep').addEventListener('click', () => this.stepCycle());
    document.getElementById('btnReset').addEventListener('click', () => this.resetSimulation());
    this.exampleSelect.addEventListener('change', (e) => this.loadExample(e.target.value));

    // Run speed control
    const speedSelect = document.getElementById('speedSelect');
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.runSpeed = RUN_SPEEDS[e.target.value] ?? RUN_SPEEDS.normal;
        // Apply immediately if currently running
        if (this.runTimer) {
          this.stopRunIntervalOnly();
          this.startRunInterval();
        }
      });
    }

    // File buttons
    const btnOpen = document.getElementById('btnOpen');
    const btnSave = document.getElementById('btnSave');
    const fileInput = document.getElementById('fileInput');
    if (btnSave) btnSave.addEventListener('click', () => this.saveFile());
    if (btnOpen && fileInput) {
      btnOpen.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.openFile(e));
    }

    // Tab switching in Center Area: Editor vs Execution
    const tabEditor = document.getElementById('tabBtnEditor');
    const tabExecution = document.getElementById('tabBtnExecution');
    const editorArea = document.getElementById('editorViewArea');
    const pipelineArea = document.getElementById('pipelineViewArea');

    tabEditor.addEventListener('click', () => {
      tabEditor.classList.add('active');
      tabExecution.classList.remove('active');
      editorArea.style.display = 'block';
      pipelineArea.style.display = 'none';
    });

    tabExecution.addEventListener('click', () => {
      tabExecution.classList.add('active');
      tabEditor.classList.remove('active');
      editorArea.style.display = 'none';
      pipelineArea.style.display = 'block';
    });

    // Left Activity Dock buttons
    document.querySelectorAll('.dock-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        if (tab === 'editor') tabEditor.click();
        if (tab === 'processor' || tab === 'pipeline') tabExecution.click();
      });
    });

    // Inspector Card Tabs: Registers vs Machine Code
    const tabRegs = document.getElementById('tabRegsToggle');
    const tabMachine = document.getElementById('tabMachineToggle');

    tabRegs.addEventListener('click', () => {
      tabRegs.classList.add('active');
      tabMachine.classList.remove('active');
      this.gprBody.style.display = '';
      this.regsHeader.style.display = '';
      this.displayBar.style.display = '';
      this.mcBody.style.display = 'none';
      this.mcHeader.style.display = 'none';
    });

    tabMachine.addEventListener('click', () => {
      tabMachine.classList.add('active');
      tabRegs.classList.remove('active');
      this.gprBody.style.display = 'none';
      this.regsHeader.style.display = 'none';
      this.displayBar.style.display = 'none';
      this.mcBody.style.display = '';
      this.mcHeader.style.display = '';
      this.renderMachineCode();
    });

    // Display Type Segmented Switcher (Hex | Binary | Decimal)
    document.querySelectorAll('.pill-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.pill-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        this.displayFormat = opt.dataset.format;
        this.renderRegisters(new Set());
        this.renderMemory(new Set());
      });
    });

    // Render Initial State
    this.renderRegisters(new Set());
    this.renderMemory(new Set());
    this.runAssemble();

    // Test/verification hooks: ?example=<key>&autostep=<n> (also handy for demos)
    const params = new URLSearchParams(window.location.search);
    const exKey = params.get('example');
    if (exKey && EXAMPLES[exKey]) {
      this.exampleSelect.value = exKey;
      this.loadExample(exKey);
    }
    const auto = parseInt(params.get('autostep'), 10);
    if (Number.isFinite(auto) && auto > 0 && this.engine) {
      for (let i = 0; i < auto; i++) {
        if (this.engine.isHalted) break;
        this.stepCycle();
      }
      // Demo/test convenience: show the pipeline view for the stepped state
      document.getElementById('tabBtnExecution').click();
    }
  }

  /* ------------------------------------------------------------------
   * Editor / examples / files — unchanged M2 behaviour
   * ------------------------------------------------------------------ */

  loadExample(key) {
    if (EXAMPLES[key]) {
      this.editor.value = EXAMPLES[key].source;
      this.resetSimulation();
      this.runAssemble();
    }
  }

  saveFile() {
    const blob = new Blob([this.editor.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.limo';
    a.click();
    URL.revokeObjectURL(url);
  }

  openFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      this.editor.value = evt.target.result;
      this.runAssemble();
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------
   * Assembler + program loading (bridge detail; Issue C formalises it)
   * ------------------------------------------------------------------ */

  runAssemble() {
    this.assembledResult = this.assembler.assemble(this.editor.value);
    if (this.assembledResult.success) {
      this.logTerminal(`>> [Assembler] Assembly successful: ${this.assembledResult.instructions.length} instructions bound cleanly.`, 't-reg');
      // Build the engine program: machine words + per-word source map.
      const words = this.assembledResult.instructions.map(inst => inst.machineCode >>> 0);
      const source = this.assembledResult.instructions.map(inst => ({
        lineNumber: inst.lineNumber,
        assemblyText: (inst.lineText || '').trim(),
        mnemonic: inst.mnemonic,
      }));
      const ex = EXAMPLES[this.exampleSelect.value];
      const preloadedData = new Map(Object.entries(ex?.preloadedData ?? {}).map(([a, v]) => [Number(a), v]));
      this.engine = new LimoPipeline({ words, source, preloadedData });
      this.isHalted = false;
    } else {
      const err = this.assembledResult.errors[0];
      const lineTag = err && err.line ? `Line ${err.line}: ` : '';
      const msg = err && err.message ? err.message : String(err);
      this.logTerminal(`>> [Error] ${lineTag}${msg}`, 't-err');
      this.engine = null;
      this.isHalted = false;
    }
    this.renderMachineCode();
  }

  /* ------------------------------------------------------------------
   * Stepping — everything flows from the engine's per-cycle result
   * ------------------------------------------------------------------ */

  stepCycle() {
    if (!this.engine) this.runAssemble();
    if (!this.engine || this.isHalted) {
      this.setNarration('Program is halted. Press Reset (⏮) to run again.');
      return;
    }

    // Snapshot before the edge (for change highlighting)
    this.prevRegisters = new Int32Array(this.engine.cpu.registers);
    this.prevMemory = new Map(this.engine.cpu.memory);

    let result;
    try {
      result = this.engine.step();
    } catch (runtimeError) {
      this.stopRun();
      this.logTerminal(`>> [Runtime] ${runtimeError.message}`, 't-err');
      this.setNarration(
        `Runtime error: ${runtimeError.message}`
      );
      return;
    }

    // Status bar
    this.sbCycleVal.textContent = result.cycle;
    this.sbCpiVal.textContent = result.retired > 0 ? (result.cycle / result.retired).toFixed(2) : '—';
    this.sbRetiredVal.textContent = result.retired;
    this.sbFlushVal.textContent = this.engine.cpu.flushCount;

    // Pipeline visualiser + terminal + narration
    this.renderPipeline(result.stages);
    this.appendTrace(result.trace);
    this.renderRegisters(this.diffChangedRegisters());
    this.renderMemory(this.diffChangedMemory());

    const narration = this.buildNarration(result);
    this.setNarration(narration.EN);

    if (result.halted) {
      this.isHalted = true;
      this.stopRun();
      this.logTerminal('>> Program e qetile. Halted.', 't-reg');
      this.setStateChip('halted', 'Halted');
      this.setNarration(
        `Program halted after ${result.cycle} cycles; ${result.retired} instructions retired. Press Reset to run again.`
      );
    } else {
      this.setStateChip(this.runTimer ? 'running' : 'ready', this.runTimer ? 'Running' : 'Ready');
    }
  }

  diffChangedRegisters() {
    const changed = new Set();
    if (this.prevRegisters) {
      for (let i = 0; i < 32; i++) {
        if (this.prevRegisters[i] !== this.engine.cpu.registers[i]) changed.add(i);
      }
    }
    return changed;
  }

  diffChangedMemory() {
    const changed = new Set();
    if (this.prevMemory) {
      for (const [addr, val] of this.engine.cpu.memory) {
        if (this.prevMemory.get(addr) !== val) changed.add(addr);
      }
    }
    return changed;
  }

  /* Pipeline stage blocks — the IF→ID→EX→MEM→WB strip */
  renderPipeline(stages) {
    const map = { IF: 'if', ID: 'id', EX: 'ex', MEM: 'mem', WB: 'wb' };
    for (const [stage, key] of Object.entries(map)) {
      const block = document.getElementById(`stage-${key}`);
      const data = document.getElementById(`pipeData${stage}`);
      if (!block || !data) continue;
      const p = stages[stage];
      block.classList.remove('active', 'bubble');
      if (!p || !p.valid) {
        if (p && p.flushed) block.classList.add('bubble');
        data.textContent = p && p.flushed ? 'FLUSHED' : 'bubble';
        continue;
      }
      block.classList.add('active');
      data.textContent = this.stageDataText(stage, p);
    }
  }

  stageDataText(stage, p) {
    switch (stage) {
      case 'IF': return `PC ${this.fmtAddr(p.pc)} · ${p.wordHex}`;
      case 'ID': return `${p.mnemonic} rs${p.rs1}→rd${p.rd}`;
      case 'EX': {
        let t = `ALU ${p.aluOp} → ${this.formatValue(p.result)}`;
        if (p.branchTaken) t += ' (taken)';
        return t;
      }
      case 'MEM':
        if (p.read) return `read [${this.fmtAddr(p.address)}]`;
        if (p.write) return `write [${this.fmtAddr(p.address)}]`;
        return 'pass';
      case 'WB':
        return p.wroteRegister ? `r${p.rd} <= ${this.formatValue(p.value)}` : 'no write';
      default: return '—';
    }
  }

  /* Per-cycle narration in English + Sesotho from the stage payloads */
  buildNarration(result) {
    const partsEN = [];
    const partsST = [];
    const s = result.stages;
    if (s.IF && s.IF.valid) {
      partsEN.push(`IF fetched "${s.IF.assemblyText}" at ${this.fmtAddr(s.IF.pc)}`);
      partsST.push(`IF e ngolisa "${s.IF.assemblyText}" ho ${this.fmtAddr(s.IF.pc)}`);
    }
    if (s.ID && s.ID.valid) {
      partsEN.push(`ID decoded ${s.ID.mnemonic}`);
      partsST.push(`ID e hlalosa ${s.ID.mnemonic}`);
    }
    if (s.EX && s.EX.valid) {
      partsEN.push(s.EX.branchTaken
        ? `EX resolved branch taken`
        : `EX computed ${s.EX.mnemonic} = ${this.formatValue(s.EX.result)}`);
      partsST.push(s.EX.branchTaken
        ? `EX e sebetse tlola`
        : `EX e bala ${s.EX.mnemonic} = ${this.formatValue(s.EX.result)}`);
    }
    if (s.MEM && s.MEM.valid) {
      if (s.MEM.read) partsEN.push(`MEM loaded ${this.formatValue(s.MEM.value)}`);
      else if (s.MEM.write) partsEN.push(`MEM stored to memory`);
      partsST.push(s.MEM.read ? `MEM e bale mohopolong` : s.MEM.write ? `MEM e ngole mohopolong` : `MEM ea feta`);
    }
    if (s.WB && s.WB.valid) {
      if (s.WB.wroteRegister) {
        partsEN.push(`WB wrote r${s.WB.rd} = ${this.formatValue(s.WB.value)}`);
        partsST.push(`WB e ngotse r${s.WB.rd} = ${this.formatValue(s.WB.value)}`);
      } else {
        partsEN.push(`WB retired ${s.WB.mnemonic}`);
        partsST.push(`WB e phethetse ${s.WB.mnemonic}`);
      }
    }
    const body = result.stages.IF && result.stages.IF.flushed ? ' [branch flush]' : '';
    const lead = `Cycle ${result.cycle}${body}: `;
    return { EN: lead + (partsEN.join(' · ') || 'pipeline bubbles'), ST: lead + (partsST.join(' · ') || 'li-bubble tsa phala') };
  }

  /* ------------------------------------------------------------------
   * Run / Pause / Reset
   * ------------------------------------------------------------------ */

  toggleRun() {
    if (this.runTimer) {
      this.stopRun();
      return;
    }
    if (!this.engine) this.runAssemble();
    if (!this.engine || this.isHalted) return;
    const button = document.getElementById('btnRun');
    button.textContent = '⏸';
    button.title = 'Pause execution';
    this.startRunInterval();
  }

  startRunInterval() {
    this.runTimer = window.setInterval(() => this.stepCycle(), this.runSpeed);
    this.setStateChip('running', 'Running');
  }

  stopRunIntervalOnly() {
    if (this.runTimer) window.clearInterval(this.runTimer);
    this.runTimer = null;
  }

  stopRun() {
    this.stopRunIntervalOnly();
    const button = document.getElementById('btnRun');
    if (button) {
      button.textContent = '▶';
      button.title = 'Run Continuous';
    }
    if (!this.isHalted) this.setStateChip('ready', 'Ready');
  }

  resetSimulation() {
    this.stopRun();
    if (this.engine) this.engine.reset();
    this.isHalted = false;
    this.prevRegisters = null;
    this.prevMemory = null;
    this.sbCycleVal.textContent = '0';
    this.sbCpiVal.textContent = '—';
    if (this.sbRetiredVal) this.sbRetiredVal.textContent = '0';
    if (this.sbFlushVal) this.sbFlushVal.textContent = '0';
    this.console.innerHTML = '<div class="terminal-line dim"># Simulation e qaliloe. Program Counter e ho 0x00000000.</div>';
    document.querySelectorAll('.pipeline-block').forEach(b => {
      b.classList.remove('active', 'bubble');
      const data = b.querySelector('.block-data');
      if (data) data.textContent = '—';
    });
    this.renderRegisters(new Set());
    this.renderMemory(new Set());
    this.setStateChip('ready', 'Ready');
    this.sbNarrationText.textContent = 'Simulation reset. Ready to step.';
  }

  finishRun() { // kept for API completeness (halting is reported by the engine)
    this.isHalted = true;
    this.stopRun();
  }

  /* ------------------------------------------------------------------
   * Rendering — terminal, registers, memory, machine code
   * ------------------------------------------------------------------ */

  appendTrace(lines) {
    for (const line of lines) {
      const div = document.createElement('div');
      div.className = 'terminal-line';
      // Colour by stage keyword; plain otherwise
      const cls = line.startsWith('IF:') ? 't-pc'
        : line.startsWith('ID:') ? 't-sub-arrow'
        : line.startsWith('EX:') ? 't-inst'
        : line.startsWith('MEM:') ? 't-sub-arrow'
        : line.startsWith('WB:') ? 't-reg'
        : '';
      if (cls) div.classList.add(cls);
      div.textContent = line;
      this.console.appendChild(div);
    }
    // Cap console length
    while (this.console.children.length > this.MAX_LINES) {
      this.console.removeChild(this.console.firstChild);
    }
    this.console.scrollTop = this.console.scrollHeight;
  }

  logTerminal(text, cls = '') {
    const div = document.createElement('div');
    div.className = `terminal-line ${cls}`.trim();
    div.textContent = text;
    this.console.appendChild(div);
    while (this.console.children.length > this.MAX_LINES) {
      this.console.removeChild(this.console.firstChild);
    }
    this.console.scrollTop = this.console.scrollHeight;
  }

  formatValue(val) {
    if (this.displayFormat === 'hex') {
      return '0x' + ((val | 0) >>> 0).toString(16).padStart(8, '0');
    } else if (this.displayFormat === 'bin') {
      return ((val | 0) >>> 0).toString(2).padStart(32, '0');
    }
    return (val | 0).toString(10);
  }

  fmtAddr(addr) {
    return '0x' + (addr >>> 0).toString(16).padStart(4, '0');
  }

  renderRegisters(changedSet) {
    let html = '';
    for (let i = 0; i < 32; i++) {
      const info = REGISTER_INFO[i];
      const val = this.engine ? this.engine.cpu.readRegister(i) : 0;
      const isChanged = changedSet && changedSet.has(i);
      html += `
        <div class="gpr-row ${isChanged ? 'modified' : ''}">
          <span class="gpr-num">r${i}</span>
          <span class="gpr-alias">${info.alias}</span>
          <span class="gpr-val">${this.formatValue(val)}${isChanged ? '<span class="gpr-dot" aria-hidden="true"></span>' : ''}</span>
        </div>
      `;
    }
    this.gprBody.innerHTML = html;
  }

  renderMemory(changedSet) {
    const body = document.getElementById('memoryHexBody');
    if (!body) return;
    const entries = this.engine
      ? [...this.engine.cpu.memory.entries()].sort((a, b) => a[0] - b[0])
      : [];
    let html = '';
    if (entries.length === 0) {
      html += '<tr><td colspan="2" class="addr-label dim">Memory ha e soa (empty)</td></tr>';
    } else {
      for (const [addr, value] of entries) {
        const isChanged = changedSet && changedSet.has(addr);
        html += `
          <tr class="${isChanged ? 'memory-changed' : ''}">
            <td class="addr-label">${this.formatValue(addr)}</td>
            <td>${this.formatValue(value)}${isChanged ? '<span class="gpr-dot" aria-hidden="true"></span>' : ''}</td>
          </tr>
        `;
      }
    }
    body.innerHTML = html;
  }

  renderMachineCode() {
    if (!this.mcBody) return;

    if (!this.assembledResult || !this.assembledResult.success || this.assembledResult.instructions.length === 0) {
      this.mcBody.innerHTML = '<div class="mc-empty"># Assembly ha e soe. Lokisa liphoso ho editor, ea tobetsa Generate.</div>';
      return;
    }

    let html = '';
    for (const inst of this.assembledResult.instructions) {
      const addrHex = '0x' + toHex32(inst.address).slice(4);
      const wordHex = inst.hex;
      const bin = ((parseInt(wordHex, 16) >>> 0).toString(2)).padStart(32, '0');
      const tooltip = `opcode=${bin.slice(0, 7)} rd=${inst.fields.rd !== null ? bin.slice(7, 12) : '—'} funct3=${bin.slice(12, 15)} ... (${inst.mnemonic})`;

      html += `
        <div class="mc-row" title="${tooltip}">
          <span class="mc-addr">${addrHex}</span>
          <span class="mc-word">${wordHex}</span>
          <span class="mc-bin">${bin}</span>
        </div>
      `;
    }
    this.mcBody.innerHTML = html;
  }

  setStateChip(state, label) {
    if (!this.sbStateChip) return;
    this.sbStateChip.textContent = label;
    this.sbStateChip.className = `sb-chip ${state}`.trim();
  }

  setNarration(enText) {
    // The bottom bar shows the English narration; the Sesotho freshman-mode
    // panel (M5) will consume EXAMPLES' own translations plus narrationST()
    // helpers added alongside the datapath views.
    this.sbNarrationText.textContent = enText;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LimoApp();
});
