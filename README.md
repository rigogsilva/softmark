# Softmark

Markdown previewer for the terminal. Opens `.md` files as a formatted HTML preview or sends them to the Claude AI artifact viewer — all from your terminal, without leaving your workflow.

Two modes:

| Mode | Command | What it does |
|------|---------|-------------|
| **Rendered view** | `softmark file.md` | Renders markdown as styled HTML in a browser pane |
| **AI review** | `softmark --ai file.md` | Copies content to clipboard + opens the Claude artifact viewer |

---

## Requirements

- macOS (uses `pbcopy` for clipboard)
- `python3` (pre-installed on macOS)
- `bash`

Optional (for in-terminal browser pane):
- [cmux](https://github.com/rigogsilva/cmux) — opens the preview in a split pane inside your terminal

---

## Install

```bash
# 1. Copy the script
cp softmark.sh ~/.local/bin/softmark
chmod +x ~/.local/bin/softmark

# 2. Make sure ~/.local/bin is in your PATH
#    Add this to your ~/.zshrc or ~/.bashrc if needed:
export PATH="$HOME/.local/bin:$PATH"

# 3. Configure (first time, or after publishing a new artifact)
softmark --config
```

The config wizard sets the Claude artifact URL used by `--ai` mode:

```
Softmark — Configuration

Config file: ~/.config/softmark/config

Current settings:
  AI URL: https://claude.ai

Enter your published Softmark artifact URL
(paste the URL from Claude after publishing, or press Enter to keep current)
> https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480

✓ Config saved to ~/.config/softmark/config
```

> The default artifact URL (`https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480`) is a publicly hosted Softmark artifact. You can use it as-is or publish your own and configure it.

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

Copies the file content to your clipboard, then opens the Claude artifact viewer. Paste the content there for an AI-assisted review session.

### Force open in default browser (skip cmux)

```bash
softmark --browser path/to/file.md
```

---

## Terminal vs cmux behavior

### Regular terminal (no cmux)

Both modes fall back to `open` (macOS default browser):

```bash
# Rendered view → opens file:///tmp/softmark-XXXX.html in your default browser
softmark file.md

# AI mode → opens the Claude artifact URL in your default browser
softmark --ai file.md
```

### Inside cmux

When running inside a [cmux](https://github.com/rigogsilva/cmux) session (`$CMUX_SURFACE_ID` is set), Softmark opens a browser pane split in your current workspace instead of launching an external browser:

```bash
# Rendered view → opens in a cmux browser split pane
softmark file.md

# AI mode → opens Claude artifact in a cmux browser split pane
#            (content already copied to clipboard — paste it there)
softmark --ai file.md
```

No extra configuration needed — cmux detection is automatic.

---

## Claude Code integration

To have Claude automatically use Softmark when you ask it to open or review `.md` files, add this to your `~/.claude/CLAUDE.md`:

```markdown
## Markdown Viewer (Softmark)

When the user asks to view, open, or review a `.md` file, use `softmark` from the terminal.
Binary: `~/.local/bin/softmark`

Two modes:

- **Rendered view** — opens the file as a formatted HTML preview in a cmux browser pane:
  ```bash
  softmark path/to/file.md
  ```
- **AI review mode** — copies file content to clipboard and opens the Claude artifact viewer in a cmux browser pane (user pastes content there):
  ```bash
  softmark --ai path/to/file.md
  ```

Always prefer `softmark` over printing raw markdown to the terminal when the user wants to read or review a file.
```

---

## Configuration

Config is stored at `~/.config/softmark/config`:

```bash
# Softmark config
SOFTMARK_AI_URL="https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480"
```

You can edit it directly or run `softmark --config` to use the interactive wizard.

---

## License

MIT
