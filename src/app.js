/**
 * LIMO Simulator Web Application Controller
 * CS3520 — Computer Organisation and Architecture
 * Team: Architects
 * Milestone: M2
 */

/*import { LimoAssembler, toHex32 } from './assembler.js';
import { REGISTER_INFO, INSTRUCTIONS } from './isa.js';
import { CPUState } from './models.js';

// Preloaded example programs
export const EXAMPLES = {
  program1: `# LIMO Program 1 — Arithmetic and Logic
# CS3520 — Team Architects
# Computes: r5 = (r1 + r2) AND (r1 - r2)
# With a = 12, b = 5
# Expected: r1=12, r2=5, r3=17, r4=7, r5=1

kopanya_hang r1, r0, 12     # r1 = 12           (a)
kopanya_hang r2, r0, 5      # r2 = 5            (b)
kopanya      r3, r1, r2     # r3 = 12 + 5 = 17  (sum)
tlosa        r4, r1, r2     # r4 = 12 - 5 = 7   (difference)
le           r5, r3, r4     # r5 = 17 AND 7 = 1 (bitwise AND)
`,

  program2: `# LIMO Program 2 — Memory Load & Store
# CS3520 — Team Architects
# Assumes Memory[100] = 21 is pre-loaded
# Expected: Memory[100] = 21, Memory[104] = 42

kopanya_hang r1, r0, 100    # r1 = 100 (base address)
bala         r2, 0(r1)      # r2 = Memory[100]
kopanya      r3, r2, r2     # r3 = 21 + 21 = 42 (double r2)
boloka       r3, 4(r1)      # Memory[104] = 42
`,

  program3: `# LIMO Program 3 — Conditional Loop (Accumulator)
# CS3520 — Team Architects
# Computes: r5 = 5 + 4 + 3 + 2 + 1 = 15

kopanya_hang r1, r0, 5      # r1 = 5  (counter)
kopanya_hang r2, r0, 1      # r2 = 1  (decrement)
kopanya_hang r3, r0, 1      # r3 = 1  (threshold)
kopanya_hang r5, r0, 0      # r5 = 0  (accumulator)

boelela:
    kopanya  r5, r5, r1      # r5 = r5 + r1
    tlosa    r1, r1, r2      # r1 = r1 - 1
    kholo_ho r1, r3, boelela # if r1 >= 1, repeat loop
`,

  all_instructions: `# LIMO All 12 Instructions & Sesotho Digraph Test
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
`
};

class LimoApp {
  constructor() {
    this.assembler = new LimoAssembler();
    this.cpu = new CPUState();
    this.assembledResult = null;
    this.currentCycle = 0;

    // DOM references
    this.editor = document.getElementById('assemblyEditor');
    this.btnAssemble = document.getElementById('btnAssemble');
    this.exampleSelect = document.getElementById('exampleSelect');
    this.diagBox = document.getElementById('diagnosticsBox');
    this.machineCodeTable = document.getElementById('machineCodeBody');
    this.regGrid = document.getElementById('registersGrid');
    this.narrationEn = document.getElementById('narrationEnglish');
    this.narrationSt = document.getElementById('narrationSesotho');
    this.themeToggle = document.getElementById('themeToggle');

    this.init();
  }

  init() {
    // Populate default code
    this.editor.value = EXAMPLES.program1;

    // Event listeners
    this.btnAssemble.addEventListener('click', () => this.runAssemble());
    this.exampleSelect.addEventListener('change', (e) => this.loadExample(e.target.value));

    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    const btnOpen = document.getElementById('btnOpen');
    const btnSave = document.getElementById('btnSave');
    const fileInput = document.getElementById('fileInput');

    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveFile());
    }
    if (btnOpen && fileInput) {
      btnOpen.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.openFile(e));
    }

    // Step / Run controls for M2 wireframe preview
    const btnStep = document.getElementById('btnStep');
    const btnReset = document.getElementById('btnReset');
    if (btnStep) {
      btnStep.addEventListener('click', () => this.stepPreview());
    }
    if (btnReset) {
      btnReset.addEventListener('click', () => this.resetSimulation());
    }

    // Render initial register file
    this.renderRegisters();

    // Initial assemble
    this.runAssemble();
  }

  toggleTheme() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    document.body.setAttribute('data-theme', isLight ? 'dark' : 'light');
    this.themeToggle.textContent = isLight ? '🌙 Dark' : '☀️ Light';
  }

  loadExample(name) {
    if (EXAMPLES[name]) {
      this.editor.value = EXAMPLES[name];
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

  runAssemble() {
    const source = this.editor.value;
    this.assembledResult = this.assembler.assemble(source);

    if (this.assembledResult.success) {
      this.diagBox.innerHTML = `
        <div class="diag-success">
          ✓ Assembly successful: ${this.assembledResult.instructions.length} instructions encoded,
          ${Object.keys(this.assembledResult.symbolTable).length} labels resolved.
        </div>
      `;
      this.renderMachineCodeTable(this.assembledResult.instructions);
      this.updateFreshmanNarration(
        "Assembly succeeded! Review the color-coded fields in the machine code table. All Sesotho mnemonics and registers are correctly bound.",
        "Kopanyo e atlehile! Hlahloba li-field tsa khoutu ea mochini tafoleng. Mantsoe 'ohle a Sesotho le mabitso a li-register a hokahantsoe ka nepo."
      );
    } else {
      let errHtml = '';
      for (const err of this.assembledResult.errors) {
        errHtml += `<div class="diag-error">✗ ${err.message}</div>`;
      }
      this.diagBox.innerHTML = errHtml;
      this.machineCodeTable.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">Assembly failed. Correct errors above.</td></tr>`;
      this.updateFreshmanNarration(
        "Assembler found syntax or range errors. Check line numbers in the diagnostics log.",
        "Mohlophisi o fumane liphoso tsa syntax kapa tekanyo. Hlahloba linomoro tsa mela lethathamong la liphoso."
      );
    }
  }

  renderMachineCodeTable(instructions) {
    let rowsHtml = '';
    for (const inst of instructions) {
      const f = inst.fields;
      const addrHex = '0x' + toHex32(inst.address).slice(4);

      rowsHtml += `
        <tr>
          <td>${addrHex}</td>
          <td><strong>0x${inst.hex}</strong></td>
          <td><span class="badge-field badge-opcode">${(f.opcode).toString(2).padStart(7, '0')}</span></td>
          <td>${f.rd !== null ? `<span class="badge-field badge-rd">r${f.rd}</span>` : '—'}</td>
          <td><span class="badge-field badge-funct3">${(f.funct3).toString(2).padStart(3, '0')}</span></td>
          <td>${f.rs1 !== null ? `<span class="badge-field badge-rs1">r${f.rs1}</span>` : '—'}</td>
          <td>${f.rs2 !== null ? `<span class="badge-field badge-rs2">r${f.rs2}</span>` : '—'}</td>
          <td>${f.funct7 !== null ? `<span class="badge-field badge-funct7">${(f.funct7).toString(2).padStart(7, '0')}</span>` : '—'}</td>
          <td>${f.imm !== null ? `<span class="badge-field badge-imm">${f.imm}</span>` : '—'}</td>
        </tr>
      `;
    }
    this.machineCodeTable.innerHTML = rowsHtml;
  }

  renderRegisters() {
    let regHtml = '';
    for (let i = 0; i < 32; i++) {
      const info = REGISTER_INFO[i];
      const val = this.cpu.readRegister(i);
      regHtml += `
        <div class="reg-box" id="reg-box-${i}">
          <span class="reg-name">${info.name} (${info.alias})</span>
          <span class="reg-val">${val}</span>
        </div>
      `;
    }
    this.regGrid.innerHTML = regHtml;
  }

  updateFreshmanNarration(enText, stText) {
    if (this.narrationEn) this.narrationEn.textContent = enText;
    if (this.narrationSt) this.narrationSt.textContent = stText;
  }

  stepPreview() {
    this.currentCycle++;
    document.getElementById('clkCycleVal').textContent = this.currentCycle;

    // Cycle stage highlighting preview for wireframe
    const stages = ['stage-if', 'stage-id', 'stage-ex', 'stage-mem', 'stage-wb'];
    stages.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.remove('active');
    });

    const activeIndex = (this.currentCycle - 1) % stages.length;
    const activeEl = document.getElementById(stages[activeIndex]);
    if (activeEl) activeEl.classList.add('active');

    this.updateFreshmanNarration(
      `Cycle ${this.currentCycle}: Pipeline stage [${stages[activeIndex].replace('stage-', '').toUpperCase()}] is active. Live signals and register writes ready.`,
      `Potoloho ${this.currentCycle}: Karolo ea phala [${stages[activeIndex].replace('stage-', '').toUpperCase()}] e sebetsa hajoale.`
    );
  }

  resetSimulation() {
    this.currentCycle = 0;
    this.cpu.reset();
    document.getElementById('clkCycleVal').textContent = '0';
    document.getElementById('cpiVal').textContent = '0.00';
    document.getElementById('stallsVal').textContent = '0';
    document.getElementById('flushesVal').textContent = '0';
    this.renderRegisters();
    this.updateFreshmanNarration(
      "Simulation reset. Program Counter at 0x00000000. Ready to step.",
      "Tsamaiso e qalile bocha. Sebali sa tsamaiso se ho 0x00000000. E itokiselitse ho hata."
    );
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  new LimoApp();
});
*/
/**
 * LIMO Simulator Pro Controller (Reference-Accurate Edition)
 * CS3520 — Computer Organisation and Architecture
 */

import { LimoAssembler, toHex32 } from './assembler.js';
import { REGISTER_INFO } from './isa.js';
import { CPUState } from './models.js';

export const EXAMPLES = {
  program1: `# LIMO Program 1 — Arithmetic & Logic
# CS3520 — Team Architects
# Computes: r5 = (r1 + r2) AND (r1 - r2)
# a = 12, b = 5 -> Expected: r5 = 1

kopanya_hang r1, r0, 12     # r1 = 12 (a)
kopanya_hang r2, r0, 5      # r2 = 5  (b)
kopanya      r3, r1, r2     # r3 = 12 + 5 = 17
tlosa        r4, r1, r2     # r4 = 12 - 5 = 7
le           r5, r3, r4     # r5 = 17 AND 7 = 1
`,

  program2: `# LIMO Program 2 — Memory Load & Store
# Memory[100] = 21 -> Memory[104] = 42

kopanya_hang r1, r0, 100    # r1 = base 100
bala         r2, 0(r1)      # r2 = Memory[100]
kopanya      r3, r2, r2     # r3 = 21 + 21 = 42
boloka       r3, 4(r1)      # Memory[104] = 42
`,

  program3: `# LIMO Program 3 — Loop Accumulator
# Computes sum: 5 + 4 + 3 + 2 + 1 = 15

kopanya_hang r1, r0, 5      # r1 = counter (5)
kopanya_hang r2, r0, 1      # r2 = step (1)
kopanya_hang r3, r0, 1      # r3 = threshold (1)
kopanya_hang r5, r0, 0      # r5 = sum (0)

boelela:
    kopanya  r5, r5, r1      # r5 += r1
    tlosa    r1, r1, r2      # r1 -= 1
    kholo_ho r1, r3, boelela # if r1 >= 1 repeat
`,

  all_instructions: `# LIMO All 12 Instructions & Sesotho Digraph Test
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
`
};

class LimoApp {
  constructor() {
    this.assembler = new LimoAssembler();
    this.cpu = new CPUState();
    this.assembledResult = null;
    this.currentCycle = 0;
    this.displayFormat = 'hex'; // 'hex' | 'bin' | 'dec'
    this.instructionIndex = 0;
    this.isHalted = false;
    this.runTimer = null;

    // DOM references
    this.editor = document.getElementById('assemblyEditor');
    this.console = document.getElementById('executionConsole');
    this.gprBody = document.getElementById('gprTableBody');
    this.exampleSelect = document.getElementById('exampleSelect');
    this.sbCycleVal = document.getElementById('sbCycleVal');
    this.sbCpiVal = document.getElementById('sbCpiVal');
    this.sbNarrationText = document.getElementById('sbNarrationText');

    this.init();
  }

  init() {
    // Populate default example
    this.editor.value = EXAMPLES.program1;

    // Control buttons
    document.getElementById('btnRun').addEventListener('click', () => this.toggleRun());
    document.getElementById('btnAssemble').addEventListener('click', () => this.runAssemble());
    document.getElementById('btnStep').addEventListener('click', () => this.stepCycle());
    document.getElementById('btnReset').addEventListener('click', () => this.resetSimulation());
    this.exampleSelect.addEventListener('change', (e) => this.loadExample(e.target.value));

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

    // Display Type Segmented Switcher (Hex | Binary | Decimal)
    document.querySelectorAll('.pill-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.pill-opt').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        this.displayFormat = opt.dataset.format;
        this.renderRegisters();
      });
    });

    // Render Initial State
    this.renderRegisters();
    this.renderMemory();
    this.runAssemble();
  }

  loadExample(key) {
    if (EXAMPLES[key]) {
      this.editor.value = EXAMPLES[key];
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

  runAssemble() {
    this.assembledResult = this.assembler.assemble(this.editor.value);
    if (this.assembledResult.success) {
      this.logTerminal(`>> [Assembler] Assembly successful: ${this.assembledResult.instructions.length} instructions bound cleanly.`);
      this.sbNarrationText.textContent = "Assembly e lokile. Penya ⏭ ho hatela pele.";
    } else {
      const err = this.assembledResult.errors[0];
      this.logTerminal(`>> [Error] ${err.message}`);
      this.sbNarrationText.textContent = "Synta ea assembly e fosaahetse.";
    }
  }

  stepCycle() {
    if (!this.assembledResult || !this.assembledResult.success) {
      this.runAssemble();
      if (!this.assembledResult || !this.assembledResult.success) return;
    }

    const instructions = this.assembledResult.instructions;
    if (instructions.length === 0 || this.isHalted) return;

    const currentInst = instructions[this.instructionIndex];
    if (!currentInst) {
      this.finishRun();
      return;
    }

    this.currentCycle++;
    this.sbCycleVal.textContent = this.currentCycle;

    // 5-stage modulo cycle tracking
    const stages = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    const stageIndex = (this.currentCycle - 1) % stages.length;
    const stageName = stages[stageIndex];

    // Highlight pipeline visualizer block
    stages.forEach(s => {
      const el = document.getElementById(`stage-${s.toLowerCase()}`);
      if (el) el.classList.remove('active');
    });
    const activeEl = document.getElementById(`stage-${stageName.toLowerCase()}`);
    if (activeEl) activeEl.classList.add('active');

    const f = currentInst.fields;

    const pcHex = '0x' + toHex32(currentInst.address).slice(4);
    const instHex = '0x' + currentInst.hex;
    let modifiedReg = null;

    // Step Execution & Output to Terminal Console matching Reference Screenshot
    if (stageName === 'IF') {
      this.logTerminal(
        `<span class="t-arrow">&gt;&gt;</span> <span class="t-pc">pc:${pcHex}</span> | <span class="t-inst">inst:${instHex}</span> (${currentInst.lineText.trim()})`
      );
      document.getElementById('pipeDataIF').textContent = `PC: ${pcHex}`;
    } 
    else if (stageName === 'ID') {
      const rs1Val = f.rs1 !== null ? this.cpu.readRegister(f.rs1) : 0;
      let msg = `   <span class="t-sub-arrow">-&gt;</span> rs1 r${f.rs1} (${REGISTER_INFO[f.rs1]?.alias || 'r0'}): ${this.formatValue(rs1Val)}`;
      if (f.imm !== null) msg += ` | imm val: ${f.imm}`;
      this.logTerminal(msg);
      document.getElementById('pipeDataID').textContent = `r${f.rs1} -> r${f.rd || '—'}`;
    }
    else if (stageName === 'EX') {
      const rs1Val = f.rs1 !== null ? this.cpu.readRegister(f.rs1) : 0;
      const rs2Val = f.rs2 !== null ? this.cpu.readRegister(f.rs2) : 0;
      let alu;
      switch (currentInst.mnemonic) {
        case 'kopanya': alu = rs1Val + rs2Val; break;
        case 'tlosa': alu = rs1Val - rs2Val; break;
        case 'kopanya_hang': alu = rs1Val + f.imm; break;
        case 'le': alu = rs1Val & rs2Val; break;
        case 'kapa': alu = rs1Val | rs2Val; break;
        case 'hase': alu = ~rs1Val; break;
        case 'checha_hang_leqeleng': alu = rs1Val << f.imm; break;
        case 'bala':
        case 'boloka': alu = rs1Val + f.imm; break;
        default: alu = rs1Val;
      }
      alu |= 0;
      this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> EX ALU (${currentInst.mnemonic}): result = ${alu}`);
      document.getElementById('pipeDataEX').textContent = `ALU: ${alu}`;
    }
    else if (stageName === 'MEM') {
      if (currentInst.mnemonic === 'bala') {
        const address = (this.cpu.readRegister(f.rs1) + f.imm) | 0;
        const value = this.cpu.readMemory(address);
        this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> MEM: read [${this.formatValue(address)}] = ${this.formatValue(value)}`);
        document.getElementById('pipeDataMEM').textContent = `Read: ${this.formatValue(value)}`;
      } else if (currentInst.mnemonic === 'boloka') {
        this.logTerminal('   <span class="t-sub-arrow">-&gt;</span> MEM: aterese ea ho boloka e sebelitsoe');
        document.getElementById('pipeDataMEM').textContent = 'Store';
      } else {
        this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> MEM: ${currentInst.mnemonic.startsWith('lekana') || currentInst.mnemonic === 'hali_lekane' || currentInst.mnemonic === 'kholo_ho' ? 'Branch' : 'Pass-through'}`);
        document.getElementById('pipeDataMEM').textContent = 'Pass';
      }
    }
    else if (stageName === 'WB') {
      const rs1Val = f.rs1 !== null ? this.cpu.readRegister(f.rs1) : 0;
      const rs2Val = f.rs2 !== null ? this.cpu.readRegister(f.rs2) : 0;
      let nextInstructionIndex = this.instructionIndex + 1;

      if (f.rd !== null && f.rd !== 0) {
        let finalVal = 0;

        switch (currentInst.mnemonic) {
          case 'kopanya': finalVal = rs1Val + rs2Val; break;
          case 'tlosa': finalVal = rs1Val - rs2Val; break;
          case 'kopanya_hang': finalVal = rs1Val + f.imm; break;
          case 'le': finalVal = rs1Val & rs2Val; break;
          case 'kapa': finalVal = rs1Val | rs2Val; break;
          case 'hase': finalVal = ~rs1Val; break;
          case 'checha_hang_leqeleng': finalVal = rs1Val << f.imm; break;
          case 'bala': finalVal = this.cpu.readMemory((rs1Val + f.imm) | 0); break;
        }

        this.cpu.writeRegister(f.rd, finalVal);
        modifiedReg = f.rd;

        this.logTerminal(
          `   <span class="t-sub-arrow">-&gt;</span> <span class="t-reg">${currentInst.mnemonic} result: r${f.rd} (${REGISTER_INFO[f.rd].alias}) = ${this.formatValue(finalVal)}</span>`
        );
        document.getElementById('pipeDataWB').textContent = `r${f.rd} <= ${finalVal}`;
      } else if (currentInst.mnemonic === 'boloka') {
        const address = (rs1Val + f.imm) | 0;
        this.cpu.writeMemory(address, rs2Val);
        this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> <span class="t-reg">boloka result: Memory[${this.formatValue(address)}] = ${this.formatValue(rs2Val)}</span>`);
        this.renderMemory();
        document.getElementById('pipeDataWB').textContent = `Mem[${address}] <= ${rs2Val}`;
      } else if (['lekana', 'hali_lekane', 'kholo_ho'].includes(currentInst.mnemonic)) {
        const branchTaken = currentInst.mnemonic === 'lekana' ? rs1Val === rs2Val
          : currentInst.mnemonic === 'hali_lekane' ? rs1Val !== rs2Val
          : rs1Val >= rs2Val;
        if (branchTaken) {
          const targetAddress = currentInst.address + f.imm;
          const targetIndex = instructions.findIndex(inst => inst.address === targetAddress);
          nextInstructionIndex = targetIndex === -1 ? instructions.length : targetIndex;
        }
        this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> ${currentInst.mnemonic}: ${branchTaken ? 'branch taken' : 'branch not taken'}`);
        document.getElementById('pipeDataWB').textContent = branchTaken ? 'Branch taken' : 'Not taken';
      } else {
        this.logTerminal(`   <span class="t-sub-arrow">-&gt;</span> WB: Ha hona destination register write.`);
        document.getElementById('pipeDataWB').textContent = `No write`;
      }

      this.instructionIndex = nextInstructionIndex;
      if (this.instructionIndex >= instructions.length) this.finishRun();
    }

    this.renderRegisters(modifiedReg);
    this.sbNarrationText.textContent = this.isHalted
      ? `Program e qeta kamora li cycle tse ${this.currentCycle} .`
      : `Cycle ${this.currentCycle}: [${stageName}] stage active on "${currentInst.mnemonic}".`;
  }

  toggleRun() {
    if (this.runTimer) {
      this.stopRun();
      return;
    }
    if (!this.assembledResult || !this.assembledResult.success) this.runAssemble();
    if (!this.assembledResult || !this.assembledResult.success || this.isHalted) return;
    const button = document.getElementById('btnRun');
    button.textContent = '⏸';
    button.title = 'Pause execution';
    this.runTimer = window.setInterval(() => this.stepCycle(), 120);
  }

  stopRun() {
    if (this.runTimer) window.clearInterval(this.runTimer);
    this.runTimer = null;
    const button = document.getElementById('btnRun');
    button.textContent = '▶';
    button.title = 'Run Continuous';
  }

  finishRun() {
    this.isHalted = true;
    this.stopRun();
    this.logTerminal('<span class="t-reg">Program e qetile.</span>');
  }

  logTerminal(htmlLine) {
    const div = document.createElement('div');
    div.className = 'terminal-line';
    div.innerHTML = htmlLine;
    this.console.appendChild(div);
    this.console.scrollTop = this.console.scrollHeight;
  }

  formatValue(val) {
    if (this.displayFormat === 'hex') {
      return '0x' + (val >>> 0).toString(16).padStart(8, '0');
    } else if (this.displayFormat === 'bin') {
      return (val >>> 0).toString(2).padStart(32, '0');
    } else {
      return (val | 0).toString(10);
    }
  }

  renderRegisters(modifiedIndex = null) {
    let html = '';
    for (let i = 0; i < 32; i++) {
      const info = REGISTER_INFO[i];
      const val = this.cpu.readRegister(i);
      const isMod = i === modifiedIndex;

      html += `
        <div class="gpr-row ${isMod ? 'modified' : ''}">
          <span class="gpr-num">x${i}</span>
          <span class="gpr-alias">${info.alias}</span>
          <span class="gpr-val">${this.formatValue(val)}</span>
        </div>
      `;
    }
    this.gprBody.innerHTML = html;
  }

  renderMemory() {
    const body = document.getElementById('memoryHexBody');
    const entries = [...this.cpu.memory.entries()].sort((left, right) => left[0] - right[0]);
    body.innerHTML = entries.length
      ? entries.map(([address, value]) => `<tr><td class="addr-label">${this.formatValue(address)}</td><td colspan="4">${this.formatValue(value)}</td></tr>`).join('')
      : '<tr><td colspan="5" class="addr-label">Memory ha oa tshela</td></tr>';
  }

  resetSimulation() {
    this.stopRun();
    this.currentCycle = 0;
    this.instructionIndex = 0;
    this.isHalted = false;
    this.cpu.reset();
    this.sbCycleVal.textContent = '0';
    this.console.innerHTML = '<div class="terminal-line dim"># Simulation e qaliloe. Program Counter e ho 0x00000000.</div>';
    document.querySelectorAll('.pipeline-block').forEach(b => b.classList.remove('active'));
    this.renderRegisters();
    this.renderMemory();
    this.sbNarrationText.textContent = "Simulation reset. Ready to step.";
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LimoApp();
});