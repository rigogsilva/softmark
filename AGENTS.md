# Softmark — Agent Instructions

## Project structure

```
softmark.jsx   — React renderer (single source of truth for UI)
softmark.sh    — Thin bash launcher (wraps jsx, serves locally, opens in cmux or browser)
README.md      — User-facing docs
AGENTS.md      — This file
```

## How it works

`softmark.jsx` is a self-contained React component that renders markdown. It is used in two ways:

1. **As a Claude artifact** — published at the artifact URL in `softmark.sh`
2. **Locally** — `softmark.sh` reads it, strips `import`/`export default`, wraps it in an HTML file with React + Babel loaded from CDN, injects the markdown content, and serves it via a local Python HTTP server

This means **editing `softmark.jsx` updates both** — the local renderer and the artifact (after republishing).

## Making changes

### Updating the renderer (softmark.jsx)

1. Edit `softmark.jsx`
2. Install locally: `cp softmark.jsx ~/.config/softmark/softmark.jsx`
3. Test: `softmark path/to/file.md`
4. Ask Claude to republish the artifact with the updated JSX
5. If the artifact URL changed, update line ~44 in `softmark.sh`:
   ```bash
   SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/NEW-URL}"
   ```
6. Reinstall: `cp softmark.sh ~/.local/bin/softmark`
7. Commit both files

### Updating the launcher (softmark.sh)

1. Edit `softmark.sh`
2. Reinstall: `cp softmark.sh ~/.local/bin/softmark && chmod +x ~/.local/bin/softmark`
3. Test all modes (see below)
4. Commit

## Testing

```bash
# Rendered view (cmux browser pane or system browser)
softmark README.md

# AI review mode (copies to clipboard + opens artifact)
softmark --ai README.md

# Open viewer only
softmark --open

# Force system browser
softmark --browser README.md

# Help
softmark --help
```

## Key implementation details

- `softmark.sh` strips `import { ... } from "react"` and `export default` from the JSX at runtime using `sed` — React is provided via CDN
- Content injection uses Python (not sed) to safely handle special characters
- cmux detection: `$CMUX_SURFACE_ID` env var — set automatically inside cmux sessions
- cmux opens via `cmux browser open-split "http://127.0.0.1:PORT/file.html"` — uses localhost because WebKit in cmux does not load `file://` URLs
- A Python HTTP server is spun up on a random port and killed after 30 seconds
- Artifact URL is hardcoded as default in `softmark.sh` line ~44; users can override via `softmark --config`

## Current artifact URL

`https://claude.ai/public/artifacts/45ebea89-f898-436a-96fa-c6587e0aa08d`

Always keep this in sync with the hardcoded default in `softmark.sh`.
