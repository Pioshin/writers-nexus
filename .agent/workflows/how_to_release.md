---
description: How to release a new version of Writers Nexus
---

# Release Workflow

1.  **Bump Version**
    - Update `package.json` version field (e.g., `0.1.0-alpha` -> `0.1.0-beta`).
    - Update the UI Badge in `index.html` (search for `v0.1.0-α`).

2.  **Lint & Check**
    - Run `npm run check` to verify code quality.

3.  **Export Backup**
    - Perform a full JSON export of the current state to verify `DataManager` integrity.

4.  **Tag & Commit**
    - (If Git is used) `git tag v0.X.X`
