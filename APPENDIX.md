# Documentation Update Appendix

This appendix records the documentation changes made during the repository review and why each update was necessary.

## Updated Documents

### README.md

- Updated the frontend tech stack to match the current codebase: React 19 and React Router v7.
- Corrected the Quick Start clone path from the old placeholder repository name to the current `open-prompt-manager` repository.
- Updated the frontend local development example to use `npm ci --legacy-peer-deps`, which matches the current installation guidance for this Vite-based frontend.
- Corrected the frontend environment variable from `REACT_APP_API_URL` to `VITE_API_URL`, matching `frontend/src/services/api.js`.
- Refreshed the documented frontend project structure from old `.js` entrypoints to the current `.jsx` files and added the current page modules (`LoginPage`, `RegisterPage`, `AgentDetail`, `ApiDocs`).

### CONTRIBUTING.md

- Corrected the frontend environment variable from `REACT_APP_API_URL` to `VITE_API_URL`.
- Updated the frontend testing section from Jest-era wording to the current Vitest-based setup.
- Replaced the stale frontend test command (`--watchAll=false --ci --coverage`) with the current Vitest coverage command (`npm test -- --coverage`).
- Updated guidance for new frontend routes from `src/App.js` to `src/App.jsx`.
- Updated the project-structure description so `frontend/src/__tests__/` is described as a Vitest and React Testing Library test suite.
- Added a note that the repo still carries a Jest compatibility transform in `frontend/vite.config.js`, but new tests should use Vitest syntax.

### .github/copilot-instructions.md

- Updated route-registration guidance from `src/App.js` to `src/App.jsx`.
- Replaced the stale frontend test command with the current Vitest coverage command.
- Updated the frontend testing description from Jest to Vitest.
- Corrected the exemplar file reference from `frontend/src/App.js` to `frontend/src/App.jsx`.

### .github/pull_request_template.md

- Updated the frontend test checklist example from a Jest-specific command to the current frontend test command used by this repository.

## Review Scope

The review focused on documentation claims that could be directly verified against code or configuration, including:

- runtime and dependency versions
- frontend routing and file names
- local development and test commands
- frontend environment variables
- project structure and developer workflow references

Documents that already matched the implementation, including the backend API route descriptions and most of the deployment guidance, were left unchanged.