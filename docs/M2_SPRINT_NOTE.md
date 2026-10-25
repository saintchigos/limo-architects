# M2 Sprint Note

**Milestone:** M2 — Simulator Design & Working Assembler  
**Date:** Sunday 11 October 2026  
**Role Rotation (Week 8):**

- ISA Architect: Tinotenda Knowledge Chigowe
- Assembler Lead: Katleho Motsheare
- Pipeline Lead: Tiisetso Joseph Masemene
- Hazard-Unit Lead: Lebohang Lithebe
- Interface Lead: Motloheloa Mokhele
- Test Lead: Mokheseng Mohasoa
- Scrum & Release Lead: Tinotenda Knowledge Chigowe

## Overview

This sprint focused on defining the LIMO architecture and preparing the simulator design foundation for the next implementation milestone. The team completed the core design work needed to lock the architecture, document the microarchitecture, and prepare the assembler and interface foundations for M3.

## Done

1. ISA frozen with the required design feedback incorporated.
   - Final opcode, funct3, and funct7 assignments were confirmed.
   - The ISA specification was updated and checked against the required test-vector expectations.
   - The architecture now has a stable contract for implementation.

2. Pipeline and datapath design completed.
   - The five-stage pipeline was documented: IF, ID, EX, MEM, WB.
   - The design includes separate instruction and data memories.
   - Branch resolution was placed in EX and the stall/flush model was documented.

3. Pipeline-register contract completed.
   - `IF/ID`, `ID/EX`, `EX/MEM`, and `MEM/WB` were specified in detail.
   - Control-signal bundles, forwarding paths, and bubble semantics were recorded.
   - Hazard inputs were mapped directly to the model fields to avoid ambiguity.

4. Interface wireframes and UI layout documented.
   - The simulator UI was designed around the editor, pipeline views, control tables, register file, memory inspector, and Freshman-mode narration.
   - Mobile and desktop layout concerns were considered and accessibility rules were included.

5. Assembler and specification work completed.
   - The build specification and architecture documentation were prepared as part of the project baseline.
   - The assembler flow and error-handling expectations were documented.

6. Project documentation and AI-use tracking completed.
   - The required design documents live in `docs/`.
   - AI use was recorded in `AI_USE.md`.

7. GitHub project and repo housekeeping prepared for release close-out.
   - M2 documentation, design files, and milestone artifacts are present in the repository.
   - The release package is ready to be tagged and published.

## Not Done

The following items remain deferred to M3 / M4:

- Full step-by-step execution engine for a running compiler-to-simulator pipeline
- Dynamic live wire animation and richer runtime visualisation
- Full interactive hazard and forwarding demonstration during execution
- Advanced UI polish beyond the required M2 simulator design baseline

## Next

For the next milestone, the team should focus on:

1. Implementing the actual pipeline execution engine (`pipeline.js` / simulator logic)
2. Connecting the assembler output to machine memory and register state
3. Enabling Step, Run, Pause, and Reset operation
4. Validating hazard-free execution and forwarding behaviour
5. Preparing the M3 runtime UI for live instruction flow and stage-state display

## Who Did What

- Tinotenda Knowledge Chigowe: ISA architecture and release leadership
- Katleho Motsheare: assembler and specification support
- Tiisetso Joseph Masemene: pipeline design and architecture documentation
- Lebohang Lithebe: hazard and control-path design
- Motloheloa Mokhele: interface wireframes and user experience structure
- Mokheseng Mohasoa: testing and validation support
- Tinotenda Knowledge Chigowe: Scrum and release owner for M2 close-out

## Evidence and links

- Repository: https://github.com/saintchigos/limo-architects
- Live demo: https://saintchigos.github.io/limo-architects/
- Design docs:
  - `docs/M2_SIMULATOR_DESIGN.md`
  - `docs/PIPELINE_REGISTERS.md`
  - `docs/LIMO_BUILD_SPEC.md`
  - `docs/LIMO_ISA_Specification.md`
- AI usage file: `AI_USE.md`

## Release status

This sprint produced the required M2 design package and release candidate state for the project. The remaining release actions are to tag the repository as `m2`, publish the GitHub release, and submit the sprint note to the required classroom workflow.

