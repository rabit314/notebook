# Project Rules & Workflow Instructions

## 1. Always Push Workflow
Follow this exact deployment procedure for every user request:
1.1 **Do the task**: Implement the requested feature, refinement, or bug fix.
1.2 **Check if it works**: Run syntax validation (`node -c js/app.js`) and ensure the code is complete and functional.
1.3 **Safe / No worries -> Push to main**: If tests pass and it is not a breaking/risky change, stage, commit with a clear message, and `git push origin main`.
1.4 **Code breaks -> Do NOT push**: If there are errors or broken functionality, fix them first before pushing.

---

## 2. Version Numbering Rules (Semantic Versioning)
Always update the version number according to the scope of the update:

- **2.1 Way too big update (Major)**: Change **`A.X.X`** (e.g., `1.0.0` -> `2.0.0`)
- **2.2 Recognizable update / New feature (Minor)**: Change **`X.A.X`** (e.g., `1.0.0` -> `1.1.0`)
- **2.3 Small change / Bug fix / Minor tweak (Patch)**: Change **`X.X.A`** (e.g., `1.0.0` -> `1.0.1`)

### Files to keep synchronized on version bump:
1. `js/app.js`: `const APP_VERSION = 'X.Y.Z';` and the header comment `Version: X.Y.Z`
2. `index.html`: `#versionBadge` text and title attribute (`vX.Y.Z`)
3. `README.md`: Version badge shields.io URL and feature list text
