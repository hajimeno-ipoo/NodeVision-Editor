# AGENTS.md — NodeVision Editor

## 1. Project Snapshot
- **Repo**: `/Users/apple/Desktop/AI アプリ/NodeVision Editor`
- **Product**: Electron desktop app with a React/Vite renderer that delivers a ComfyUI-inspired node-based editor for images and video.
- **Supporting Services**: Prototype FastAPI backend providing health/info, node catalog, and project persistence endpoints.
- **Primary Goals**: Build an interactive node graph editor, keep IPC secure, and iterate on backend-assisted workflows for preview generation.

## 2. Codebase Map
- `src/main/` — Electron main process (TypeScript → compiled with `tsc`).
- `preload/` — Preload scripts exposing safe IPC bridges (`contextIsolation` enabled).
- `src/renderer/` — React 18 + React Flow UI delivered via Vite.
- `src/shared/` — Shared TypeScript definitions/utilities consumed by main and renderer.
- `backend/` — FastAPI prototype (`uvicorn` entrypoint `backend.app.main:app`).
- `tests/` — Vitest suites (renderer + shared logic) with media fixtures under `tests/media/`.
- `docs/` & `NodeVision_Editor_技術仕様書_v1.1.md` — Authoritative specs, event protocol, schema references.
- `samples/` — `.nveproj` example projects used for manual validation.

## 3. Toolchain & Prerequisites
- **Node.js**: Use Node 20 LTS (project uses ES modules + TypeScript).
- **Python**: 3.10+ virtual environment for FastAPI prototype.
- **Package Managers**: `npm` for the monorepo, `pip` within `backend/`.
- **MCP Servers**: `serena` (project tooling) and `context7` (documentation lookup) are available in-agent.

## 4. Setup Commands
```bash
npm install                # install Electron/React toolchain
python3 -m venv .venv      # from backend/
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## 5. Run & Build
- `npm run dev` — Starts FastAPI via `scripts/run-backend.mjs` and launches Electron (`scripts/run-electron.mjs`).
- `npm run start` — Builds (`build:lib`, `build:main`, `build:renderer`) then launches Electron.
- `npm run build` — Produces distributable artifacts (no hot reload).
- Backend only: `npm run dev:backend` or `uvicorn backend.app.main:app --reload` inside the virtualenv.

## 6. Quality Gates
- `npm test` — Vitest suite (aim for 100% coverage; add/update tests when touching executable code).
- `npm run test:watch` — Interactive test loop.
- `npm run verify:security` — Ensures Electron flags stay hardened (must pass before release builds).
- Backend tests (if added): run via `pytest` or FastAPI-specific scripts inside `backend/tests/`.

## 7. Agent Operating Procedures
- **Planning**: Use Serena’s plan tool (`update_plan`) with detailed steps before modifications.
- **Documentation Fetch**: Call `context7` to pull latest references (e.g., `/openai/agents.md`) before coding.
- **Progress Updates**: Update Serena plan status after each step and record completion.
- **Testing Loop**: Follow "plan → implement → unit test → fix" until coverage goals are satisfied; explicitly note when tests are skipped (only permissible for doc-only edits).
- **Code Review**: Run Serena’s review helpers before final response when changes touch code.
- **Responses**: Communicate in Japanese (ギャル口調) per maintainer preference when summarizing results to the user.

## 8. Key References
- `NodeVision_Editor_技術仕様書_v1.1.md` — end-to-end product spec & roadmap.
- `docs/event_protocol.md` — IPC event shapes and error catalog.
- `docs/project_schema_v1.json` — `.nveproj` schema for project persistence.
- `backend/README.md` — Backend setup & API hints.
- `tests/` — Current Vitest expectations and media fixtures.

## 9. Common Pitfalls & Tips
- Running `npm run dev` triggers a full build via `npm start`; expect initial compilation cost.
- Keep IPC exposure minimal; preload scripts must stay in sync with `contextIsolation` rules.
- Media fixtures are large—avoid committing new binaries without compression + justification.
- When editing docs only, mention why tests are skipped but still update Serena plans.
- Leverage `scripts/benchmarks/*` for performance validation before shipping preview changes.

## 10. Ready Checklist for Contributions
- [ ] Dependencies installed (`npm install`, backend venv ready if needed).
- [ ] Serena plan updated with detailed steps.
- [ ] Implementation changes linked to tests (`npm test`) and coverage checked.
- [ ] `npm run verify:security` executed if Electron configs changed.
- [ ] Documentation and samples updated to reflect behavior.
- [ ] Final response summarises changes + next steps for the maintainer.
