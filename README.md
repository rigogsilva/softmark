# Softmark

Markdown previewer for the terminal. Opens `.md` files as a formatted HTML
preview or sends them to the Claude AI artifact viewer — all from your terminal,
without leaving your workflow.

Three modes:

| Mode              | Command                 | What it does                                                        |
| ----------------- | ----------------------- | ------------------------------------------------------------------- |
| **Rendered view** | `softmark file.md`      | Renders markdown as styled HTML in a browser pane                   |
| **AI review**     | `softmark --ai file.md` | Copies content to clipboard + opens the Claude artifact viewer      |
| **Open viewer**   | `softmark --open`       | Opens the Claude artifact viewer (no file — pin it to your browser) |

Or just open the viewer in your browser now:
**[Softmark AI Viewer →](https://claude.ai/public/artifacts/45ebea89-f898-436a-96fa-c6587e0aa08d)**

---

## Requirements

- macOS (uses `pbcopy` for clipboard)
- `python3` (pre-installed on macOS)
- `bash`

Optional (for in-terminal browser pane):

- [cmux](https://github.com/rigogsilva/cmux) — opens the preview in a split pane
  inside your terminal

---

## Install

```bash
# 1. Copy both files
mkdir -p ~/.local/bin ~/.config/softmark
cp softmark.sh ~/.local/bin/softmark
cp softmark.jsx ~/.config/softmark/softmark.jsx
chmod +x ~/.local/bin/softmark

# 2. Make sure ~/.local/bin is in your PATH
#    Add this to your ~/.zshrc or ~/.bashrc if needed:
export PATH="$HOME/.local/bin:$PATH"
```

No configuration needed — the default artifact URL is hardcoded and works out of
the box.

> **Optional:** Run `softmark --config` to point to your own published artifact
> instead of the default one.

> **Note:** `softmark.jsx` is the single source of truth for the renderer. It
> powers both the local preview (wrapped with React CDN by the shell script) and
> the Claude artifact. When you update the JSX, both stay in sync automatically.

---

## Usage

### Rendered view — opens formatted HTML preview

```bash
softmark path/to/file.md
```

### AI review mode — copy to clipboard + open Claude artifact

```bash
softmark --ai path/to/file.md
```

Copies the file content to your clipboard, then opens the Claude artifact
viewer. Paste the content there for an AI-assisted review session.

### Open viewer — open the artifact without a file

```bash
softmark --open
```

Opens the Claude artifact viewer directly with no file. Useful for pinning it to
your browser as a persistent tab for quick paste-and-review sessions.

### Force open in default browser (skip cmux)

```bash
softmark --browser path/to/file.md
```

---

## Terminal vs cmux behavior

### Regular terminal (no cmux)

All modes fall back to `open` (macOS default browser):

```bash
softmark file.md          # → opens rendered preview in default browser
softmark --ai file.md     # → opens Claude artifact in default browser
softmark --open           # → opens Claude artifact in default browser
```

### Inside cmux

When running inside a [cmux](https://github.com/rigogsilva/cmux) session
(`$CMUX_SURFACE_ID` is set), Softmark opens a browser pane split in your current
workspace:

```bash
softmark file.md          # → rendered preview in cmux browser split pane
softmark --ai file.md     # → Claude artifact in cmux pane (paste content there)
softmark --open           # → Claude artifact in cmux pane (pin it, reuse anytime)
```

No extra configuration needed — cmux detection is automatic.

---

## Updating the artifact

`softmark.jsx` is the single source of truth — it powers both the local renderer
and the Claude artifact. To update:

1. **Edit `softmark.jsx`** in this repo
2. **Ask Claude to republish the artifact** — share the updated JSX and ask
   Claude to update and publish it
3. **Check if the link changed** — Claude may generate a new artifact URL when
   republishing
   - If the URL is the **same**: no action needed
   - If the URL **changed**: update the hardcoded default in `softmark.sh`:
     ```bash
     # Line ~44 in softmark.sh
     SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/NEW-URL-HERE}"
     ```
4. **Commit and reinstall**:
   ```bash
   cp softmark.jsx ~/.config/softmark/softmark.jsx
   cp softmark.sh ~/.local/bin/softmark
   git add softmark.jsx softmark.sh && git commit -m "update: softmark renderer"
   ```

Current artifact:
`https://claude.ai/public/artifacts/45ebea89-f898-436a-96fa-c6587e0aa08d`

---

## Claude Code integration

To have Claude automatically use Softmark when you ask it to open or review
`.md` files, add this to your `~/.claude/CLAUDE.md`:

````markdown
## Markdown Viewer (Softmark)

When the user asks to view, open, or review a `.md` file, use `softmark` from
the terminal. Binary: `~/.local/bin/softmark`

Three modes:

- **Rendered view** — opens the file as a formatted HTML preview in a cmux
  browser pane:
  ```bash
  softmark path/to/file.md
  ```
````

- **AI review mode** — copies file content to clipboard and opens the Claude
  artifact viewer in a cmux browser pane (user pastes content there):
  ```bash
  softmark --ai path/to/file.md
  ```
- **Open viewer** — opens the Claude artifact viewer without a file (pin it to
  your browser):
  ```bash
  softmark --open
  ```

Always prefer `softmark` over printing raw markdown to the terminal when the
user wants to read or review a file.

````

---

## Configuration

Config is stored at `~/.config/softmark/config`:

```bash
# Softmark config
SOFTMARK_AI_URL="https://claude.ai/public/artifacts/45ebea89-f898-436a-96fa-c6587e0aa08d"
````

You can edit it directly or run `softmark --config` to use the interactive
wizard.

---

## License

MIT
