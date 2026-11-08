# Use of AI

AI tools were used to outline the project structure and create project files.
The project specification itself was written without AI assistance, except that
AI was used to create example programs included with the specification.

## M3 — Pipeline core (week of 8 November 2026)

- **Tool:** OpenCode AI coding assistant.
- **Purpose:** Drafting the M3 sprint note and release notes, and helping run the
  verification commands before the release.
- **What changed:** `docs/M3_SPRINT_NOTE.md` and `docs/M3_RELEASE_NOTES.md` were
  drafted with AI assistance, and this AI-use section was updated. The M3 code,
  tests, and design documents were reviewed and verified by the team; the sprint
  note and release notes were checked against the merged work before release.
- **Verification:** AI-assisted run of `npm test` reported 43 assembler, 184
  control, and 72 pipeline checks passing (299 total), and the live GitHub Pages
  site was reloaded to confirm it serves the M3 build.