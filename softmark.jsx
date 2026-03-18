import { useState, useCallback, useRef, useEffect } from "react";

/* ──────────────────────────────────────────────
   MARKDOWN PARSER — uses marked.js via CDN
   ────────────────────────────────────────────── */
let markedLoaded = false;
let markedReady = null;

// Load marked.js from CDN once
const loadMarked = () => {
  if (markedReady) return markedReady;
  markedReady = new Promise((resolve) => {
    let loaded = 0;
    const check = () => { if (++loaded >= 3) { markedLoaded = true; resolve(); } };

    if (window.marked) check(); else {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js";
      s.onload = check; s.onerror = check;
      document.head.appendChild(s);
    }

    if (window.hljs) check(); else {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
      s2.onload = check; s2.onerror = check;
      document.head.appendChild(s2);
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
    link.onload = check; link.onerror = check;
    document.head.appendChild(link);
  });
  return markedReady;
};

// Basic fallback parser if CDN fails
function fallbackParse(md) {
  let h = md;
  h = h.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\n\n/g, '</p><p>');
  return `<p>${h}</p>`;
}

function parseMarkdown(md) {
  if (markedLoaded && window.marked) {
    try {
      const renderer = new window.marked.Renderer();
      renderer.code = function({ text, lang }) {
        if (window.hljs && lang && window.hljs.getLanguage(lang)) {
          return `<pre><code class="hljs language-${lang}">${window.hljs.highlight(text, { language: lang }).value}</code></pre>`;
        }
        if (window.hljs) {
          return `<pre><code class="hljs">${window.hljs.highlightAuto(text).value}</code></pre>`;
        }
        return `<pre><code>${text}</code></pre>`;
      };
      const html = window.marked.parse(md, { gfm: true, breaks: false, renderer });
      // Post-process
      return html
        .replace(/<input.*?checked.*?disabled.*?>/gi, '<span class="cb ck">✓</span>')
        .replace(/<input.*?disabled.*?>/gi, '<span class="cb uc">○</span>')
        .replace(/<table>/g, '<div class="table-scroll"><table>')
        .replace(/<\/table>/g, '</table></div>');
    } catch {
      return fallbackParse(md);
    }
  }
  return fallbackParse(md);
}

/* ──────────────────────────────────────────────
   BLOCK SPLITTER
   ────────────────────────────────────────────── */
function splitIntoBlocks(md) {
  const blocks = [];
  const lines = md.split("\n");
  let current = [];
  let inCodeBlock = false;
  let inList = false;

  const flush = () => {
    if (current.length > 0) {
      const text = current.join("\n");
      if (text.trim()) blocks.push(text);
      current = [];
    }
    inList = false;
  };

  const isListStart = (l) => /^[\s]*[-*+]\s+/.test(l) || /^[\s]*\d+\.\s+/.test(l);
  const isContinuation = (l) => /^[ \t]{2,}/.test(l) && l.trim().length > 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) { current.push(line); flush(); inCodeBlock = false; continue; }
      else { flush(); inCodeBlock = true; current.push(line); continue; }
    }
    if (inCodeBlock) { current.push(line); continue; }
    if (/^#{1,6}\s+/.test(line)) { flush(); current.push(line); flush(); continue; }
    if (/^[-*_]{3,}$/.test(line.trim())) { flush(); blocks.push(line); continue; }

    // Empty line handling — keep empty lines within lists (multi-line items)
    if (line.trim() === "") {
      if (inList) {
        // Peek ahead: if next non-empty line is a list item or continuation, stay in list
        let nextIdx = i + 1;
        while (nextIdx < lines.length && lines[nextIdx].trim() === "") nextIdx++;
        if (nextIdx < lines.length && (isListStart(lines[nextIdx]) || isContinuation(lines[nextIdx]))) {
          current.push(line);
          continue;
        }
      }
      if (current.join("\n").trim()) flush();
      continue;
    }

    // Table rows
    if (line.trim().startsWith("|") && current.length > 0 && current[current.length - 1].trim().startsWith("|")) { current.push(line); continue; }
    if (line.trim().startsWith("|") && (current.length === 0 || !current[current.length - 1].trim().startsWith("|"))) { flush(); current.push(line); continue; }

    // List items and continuation lines
    if (isListStart(line)) {
      if (!inList && current.length > 0) flush();
      inList = true;
      current.push(line);
      continue;
    }

    // Indented continuation of a list item
    if (inList && isContinuation(line)) {
      current.push(line);
      continue;
    }

    // Blockquotes
    if (line.startsWith(">")) {
      if (current.length > 0 && !current[current.length - 1].startsWith(">")) flush();
      current.push(line); continue;
    }

    // If we were in a list but this line isn't a list/continuation, flush the list
    if (inList) flush();

    current.push(line);
  }
  flush();
  return blocks;
}

function joinBlocks(blocks) { return blocks.join("\n\n"); }

/* ──────────────────────────────────────────────
   AI HELPERS
   ────────────────────────────────────────────── */
async function callClaude(systemPrompt, userMessage) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    let data;
    try { data = await res.json(); } catch { return `Response error (${res.status})`; }
    if (data.error) return `API Error: ${data.error.message || JSON.stringify(data.error)}`;
    if (data.content && Array.isArray(data.content)) {
      return data.content.filter(b => b.type === "text").map(b => b.text).join("\n") || "Empty response.";
    }
    return "Unexpected: " + JSON.stringify(data).slice(0, 500);
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

const QUICK_ACTIONS = [
  { id: "summarize", label: "Summarize", icon: "📋",
    system: "Provide a clear, concise summary. Bullet points for key takeaways. Under 200 words.",
    prompt: (md) => `Summarize:\n\n${md}` },
  { id: "review-content", label: "Review Content", icon: "🔍",
    system: `You are a senior engineer and technical reviewer. Your job is NOT to summarize the document — the author already knows what they wrote. Instead, find what's MISSING, what could go WRONG, and what's UNCLEAR. Respond with ONLY a raw JSON array. No markdown fences, no text before or after. Format: [{"quote":"plain text phrase","comment":"your finding"}]. Rules:
- 4-8 comments. Be specific and actionable.
- Focus on: gaps (missing info needed to implement), risks (what could fail or break), ambiguities (things open to interpretation), missing edge cases, unstated assumptions, dependencies that aren't called out.
- Do NOT restate what the document says. Do NOT summarize sections. Every comment must add NEW information or raise a question the author hasn't addressed.
- Each quote MUST be 3-6 plain words with NO markdown formatting. Pick distinctive phrases.
- Frame comments as questions or risks, e.g. "What happens if X fails?" or "No rollback plan for Y" or "Who owns Z?"`,
    prompt: (md) => `Return ONLY a JSON array. Find gaps, risks, and ambiguities — do NOT summarize.\n\n${md}` },
  { id: "review-writing", label: "Review Writing", icon: "✍️",
    system: `You are a technical writing editor. Review the document for clarity, structure, and readability — NOT for technical correctness. Respond with ONLY a raw JSON array. No markdown fences, no text before or after. Format: [{"quote":"plain text phrase","comment":"your suggestion"}]. Rules:
- 4-8 comments. Be specific.
- Focus on: confusing sentences that need rewriting, jargon that should be defined, sections that are too dense and should be broken up, missing context for readers who aren't the author, structural improvements (ordering, headings, flow), inconsistent terminology.
- Do NOT comment on technical decisions. Only comment on how well the ideas are communicated.
- Each quote MUST be 3-6 plain words with NO markdown formatting. Pick distinctive phrases.`,
    prompt: (md) => `Return ONLY a JSON array. Review writing clarity and structure only.\n\n${md}` },
];

const SAMPLE = `# Project Kickoff: Platform Redesign

## Overview

We're redesigning the customer portal to improve onboarding and reduce support tickets. The goal is a 30% reduction in time-to-value for new users.

## Key Decisions

- **Framework**: Moving from Angular to React + Next.js
- **Timeline**: 8 weeks, starting March 24
- **Team**: 3 engineers, 1 designer, 1 PM

## Action Items

- [ ] Sarah to finalize wireframes by March 21
- [ ] Dev team to set up new repo and CI/CD pipeline
- [ ] Schedule weekly syncs every Tuesday at 2pm
- [x] Stakeholder approval received

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|--------|------------|
| Scope creep | High | High | Strict sprint planning |
| API delays | Medium | Medium | Mock services ready |
| Designer bandwidth | Low | High | Backup freelancer identified |

## Next Steps

The team should review the technical spec document and provide feedback by end of week. We need to finalize the component library choice before sprint 1 begins.

> "The best way to predict the future is to invent it." — Alan Kay

\`\`\`javascript
// New auth flow
const authenticate = async (user) => {
  const token = await auth.verify(user.credentials);
  return { session: token, redirect: '/dashboard' };
};
\`\`\`

---

*Last updated: March 17, 2026*
`;

/* ──────────────────────────────────────────────
   EDITABLE BLOCK
   ────────────────────────────────────────────── */
/* ──────────────────────────────────────────────
   HTML → MARKDOWN conversion (for rich editor)
   ────────────────────────────────────────────── */
function htmlToMd(html) {
  let md = html;
  md = md.replace(/<div><br\s*\/?><\/div>/gi, '\n');
  md = md.replace(/<div>([\s\S]*?)<\/div>/gi, '$1\n');
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => {
    const inner = c.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1').replace(/<br\s*\/?>/gi, '\n');
    return inner.split('\n').map(l => `> ${l.trim()}`).join('\n') + '\n\n';
  });
  md = md.replace(/<hr\s*\/?>/gi, '\n---\n\n');
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, items) => {
    return items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
      const clean = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1').replace(/<br\s*\/?>/gi, ' ').trim();
      return `- ${clean}\n`;
    }) + '\n';
  });
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, items) => {
    let i = 0;
    return items.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => {
      const clean = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1').replace(/<br\s*\/?>/gi, ' ').trim();
      return `${++i}. ${clean}\n`;
    }) + '\n';
  });
  const decodeCode = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
  md = md.replace(/<pre[^>]*>\s*<code[^>]*class="[^"]*language-([^"]*)"[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, lang, code) => `\`\`\`${lang}\n${decodeCode(code)}\n\`\`\`\n\n`);
  md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => `\`\`\`\n${decodeCode(code)}\n\`\`\`\n\n`);
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => `\`\`\`\n${decodeCode(code)}\n\`\`\`\n\n`);
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<[^>]+>/g, '');
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
  md = md.replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

/* ──────────────────────────────────────────────
   EDITABLE BLOCK — Rich + Raw editing
   ────────────────────────────────────────────── */
function EditableBlock({ blockMd, index, onSave, comments, showComments, userNotes, onAddNote, onDeleteNote }) {
  const [editMode, setEditMode] = useState(null); // null | "rich" | "raw"
  const [commenting, setCommenting] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [draft, setDraft] = useState(blockMd);
  const [hovered, setHovered] = useState(false);
  const [linkInput, setLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [savedRange, setSavedRange] = useState(null);
  const ref = useRef(null);
  const richRef = useRef(null);
  const noteRef = useRef(null);
  const blockRef = useRef(null);
  const linkRef = useRef(null);

  const isCodeBlock = blockMd.trim().startsWith("```");

  useEffect(() => { setDraft(blockMd); setEditMode(null); }, [blockMd]);
  useEffect(() => {
    if (editMode === "raw" && ref.current) { ref.current.focus(); ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
    if (editMode === "rich" && richRef.current) {
      richRef.current.innerHTML = parseMarkdown(draft || blockMd);
      richRef.current.focus();
    }
  }, [editMode]);
  useEffect(() => {
    if (commenting && noteRef.current) noteRef.current.focus();
  }, [commenting]);

  const exec = (cmd, val = null) => { document.execCommand(cmd, false, val); richRef.current?.focus(); };

  const toggleList = (type) => {
    if (!richRef.current) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    let node = sel.anchorNode;
    if (node?.nodeType === 3) node = node.parentElement;
    let listParent = null, walk = node;
    while (walk && walk !== richRef.current) {
      if (walk.tagName === "UL" || walk.tagName === "OL") { listParent = walk; break; }
      walk = walk.parentElement;
    }
    if (listParent) {
      const range = sel.getRangeAt(0);
      const allItems = Array.from(listParent.querySelectorAll(":scope > li"));
      const selectedItems = allItems.filter(li => range.intersectsNode(li));
      if (selectedItems.length === allItems.length) {
        const frag = document.createDocumentFragment();
        allItems.forEach(li => { const p = document.createElement("p"); p.innerHTML = li.innerHTML.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1'); frag.appendChild(p); });
        listParent.replaceWith(frag);
      } else {
        const frag = document.createDocumentFragment();
        let beforeList = null, afterList = null, phase = "before";
        allItems.forEach(li => {
          const isSel = selectedItems.includes(li);
          if (phase === "before" && !isSel) { if (!beforeList) beforeList = document.createElement(listParent.tagName.toLowerCase()); beforeList.appendChild(li.cloneNode(true)); }
          else if (isSel) { phase = "selected"; const p = document.createElement("p"); p.innerHTML = li.innerHTML.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1'); if (beforeList) { frag.appendChild(beforeList); beforeList = null; } frag.appendChild(p); }
          else { phase = "after"; if (!afterList) afterList = document.createElement(listParent.tagName.toLowerCase()); afterList.appendChild(li.cloneNode(true)); }
        });
        if (beforeList) frag.appendChild(beforeList);
        if (afterList) frag.appendChild(afterList);
        listParent.replaceWith(frag);
      }
      richRef.current.focus();
    } else {
      document.execCommand(type, false, null);
      richRef.current.focus();
    }
  };

  const startLink = () => {
    const sel = window.getSelection();
    if (sel.rangeCount) setSavedRange(sel.getRangeAt(0).cloneRange());
    setLinkUrl(""); setLinkInput(true);
    setTimeout(() => linkRef.current?.focus(), 50);
  };
  const applyLink = () => {
    if (!linkUrl.trim()) { setLinkInput(false); richRef.current?.focus(); return; }
    if (savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); }
    document.execCommand('createLink', false, linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`);
    setLinkInput(false); setLinkUrl(""); setSavedRange(null);
    setTimeout(() => richRef.current?.focus(), 10);
  };
  const removeLink = () => { document.execCommand('unlink', false, null); richRef.current?.focus(); };
  const cancelLink = () => { setLinkInput(false); setLinkUrl(""); setSavedRange(null); richRef.current?.focus(); };

  const saveRich = () => { if (richRef.current) { onSave(index, htmlToMd(richRef.current.innerHTML)); } setEditMode(null); };
  const saveRaw = () => { onSave(index, draft); setEditMode(null); };
  const cancel = () => { setDraft(blockMd); setEditMode(null); };
  const switchTo = (mode) => {
    if (editMode === "rich" && mode === "raw" && richRef.current) setDraft(htmlToMd(richRef.current.innerHTML));
    setEditMode(mode);
  };

  const submitNote = () => {
    if (noteText.trim()) {
      const words = blockMd.replace(/[#*`~\[\]()>-]/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
      onAddNote(index, noteText.trim(), words);
      setNoteText("");
      setCommenting(false);
    }
  };

  let html = parseMarkdown(blockMd);
  if (showComments && comments) {
    comments.forEach(c => {
      if (!c.quote) return;
      const quote = c.quote.replace(/\*\*/g,"").replace(/\*/g,"").replace(/`/g,"").replace(/~/g,"").trim();
      if (!quote) return;
      const esc = quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const directMatch = new RegExp(`(${esc})`, 'gi');
      if (directMatch.test(html)) {
        html = html.replace(directMatch, `<mark class="ai-hl" id="hl-${c.gIdx}" data-comment="${c.gIdx}">$1<span class="cbadge">${c.gIdx}</span></mark>`);
        return;
      }
      const words = quote.split(/\s+/).filter(w => w);
      if (words.length >= 2) {
        const tagGap = "(?:\\s*(?:<[^>]*>)*\\s*)";
        const flexPattern = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(tagGap);
        try {
          const flexRegex = new RegExp(`(${flexPattern})`, 'gi');
          if (flexRegex.test(html)) {
            html = html.replace(flexRegex, `<mark class="ai-hl" id="hl-${c.gIdx}" data-comment="${c.gIdx}">$1<span class="cbadge">${c.gIdx}</span></mark>`);
            return;
          }
        } catch {}
      }
      if (words.length >= 3) {
        const shortWords = words.slice(0, 3);
        const shortEsc = shortWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("(?:\\s*(?:<[^>]*>)*\\s*)");
        try {
          const shortRegex = new RegExp(`(${shortEsc})`, 'gi');
          if (shortRegex.test(html)) {
            html = html.replace(shortRegex, `<mark class="ai-hl" id="hl-${c.gIdx}" data-comment="${c.gIdx}">$1<span class="cbadge">${c.gIdx}</span></mark>`);
          }
        } catch {}
      }
    });
  }

  const hasComments = comments && comments.length > 0;
  const hasNotes = userNotes && userNotes.length > 0;

  if (editMode) {
    const isRich = editMode === "rich";
    return (
      <div className="bedit" ref={blockRef}>
        {/* Toolbar */}
        <div className="bedit-toolbar">
          {isRich && (
            <>
              <button className="tb-e" onClick={() => exec('bold')}><strong>B</strong></button>
              <button className="tb-e" onClick={() => exec('italic')}><em>I</em></button>
              <button className="tb-e" onClick={() => exec('strikeThrough')}><s>S</s></button>
              <div className="tb-es" />
              <button className="tb-e" onClick={() => exec('formatBlock', 'h1')}>H1</button>
              <button className="tb-e" onClick={() => exec('formatBlock', 'h2')}>H2</button>
              <button className="tb-e" onClick={() => exec('formatBlock', 'h3')}>H3</button>
              <button className="tb-e" onClick={() => exec('formatBlock', 'p')}>Normal</button>
              <div className="tb-es" />
              <button className="tb-e" onClick={() => toggleList('insertUnorderedList')}>• List</button>
              <button className="tb-e" onClick={() => toggleList('insertOrderedList')}>1. List</button>
              <button className="tb-e" onClick={() => exec('formatBlock', 'blockquote')}>" Quote</button>
              <div className="tb-es" />
              <button className="tb-e" onClick={() => { const c = window.getSelection()?.toString(); if (c) exec('insertHTML', `<code>${c}</code>`); }}>&lt;/&gt;</button>
              <button className="tb-e" onClick={startLink}>🔗</button>
              <button className="tb-e" onClick={removeLink} style={{textDecoration:"line-through"}}>🔗</button>
              <div className="tb-es" />
              <button className="tb-e" onClick={() => exec('undo')}>↩</button>
              <button className="tb-e" onClick={() => exec('redo')}>↪</button>
            </>
          )}
          {!isCodeBlock && (
            <div className="bedit-mt">
              <button className={`bedit-mtb ${isRich ? "on" : ""}`} onClick={() => switchTo("rich")}>Edit</button>
              <button className={`bedit-mtb ${!isRich ? "on" : ""}`} onClick={() => switchTo("raw")}>Raw Edit</button>
            </div>
          )}
          {isCodeBlock && <div className="bedit-mt"><span className="bedit-mtb on">Code</span></div>}
        </div>

        {/* Link input */}
        {linkInput && (
          <div className="bedit-link">
            <span className="bedit-link-l">URL:</span>
            <input ref={linkRef} className="bedit-link-in" value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyLink(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelLink(); } }}
              placeholder="https://example.com" />
            <button className="bsm bsm-a" onClick={applyLink}>Apply</button>
            <button className="bsm" onClick={cancelLink}>Cancel</button>
          </div>
        )}

        {/* Editor area */}
        {isRich ? (
          <div ref={richRef} className="bedit-rich md-rendered" contentEditable suppressContentEditableWarning />
        ) : (
          <textarea ref={ref} className="bedit-ta" value={draft}
            onChange={e => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
            onKeyDown={e => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveRaw(); }}
          />
        )}

        <div className="bedit-bar">
          <span className="bedit-hint">{isRich ? "Edit visually or switch to Raw Edit" : "Esc cancel · ⌘↵ save"}</span>
          <div style={{display:"flex",gap:6}}>
            <button className="bsm" onClick={cancel}>Cancel</button>
            <button className="bsm bsm-a" onClick={isRich ? saveRich : saveRaw}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={blockRef}>
      <div className={`bview ${hovered ? "bview-h" : ""}`}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          if (e.target.tagName === "A") return;
          if (e.target.closest("mark.ai-hl") || e.target.closest(".cbadge")) return;
          if (e.target.closest(".unote") || e.target.closest(".unote-x")) return;
          setEditMode(isCodeBlock ? "raw" : "rich");
        }}>
        <div className="md-rendered" dangerouslySetInnerHTML={{ __html: html }} />
        {hovered && <div className="bview-actions">
          {isCodeBlock ? (
            <button className="bview-btn" onClick={(e) => { e.stopPropagation(); setEditMode("raw"); }}>✎ Edit Code</button>
          ) : (
            <>
              <button className="bview-btn" onClick={(e) => { e.stopPropagation(); setEditMode("rich"); }}>✎ Edit</button>
              <button className="bview-btn" onClick={(e) => { e.stopPropagation(); setEditMode("raw"); }}>{"{ }"}</button>
            </>
          )}
          <button className="bview-btn" onClick={(e) => { e.stopPropagation(); setCommenting(true); }}>💬 Comment</button>
        </div>}
      </div>

      {/* User notes for this block */}
      {hasNotes && userNotes.map((n, ni) => (
        <div key={ni} className="unote">
          <div className="unote-bar" />
          <div className="unote-body">
            <span className="unote-author">You</span>
            <span className="unote-text">{n.text}</span>
          </div>
          <button className="unote-x" onClick={() => onDeleteNote(n._id)}>✕</button>
        </div>
      ))}

      {/* Comment input */}
      {commenting && (
        <div className="unote-input">
          <div className="unote-bar" />
          <input ref={noteRef} className="unote-field" value={noteText} onChange={e => setNoteText(e.target.value)}
            placeholder="Add your comment or question..."
            onKeyDown={e => { if (e.key === "Enter") submitNote(); if (e.key === "Escape") { setCommenting(false); setNoteText(""); } }}
          />
          <button className="bsm bsm-a" onClick={submitNote}>Add</button>
          <button className="bsm" onClick={() => { setCommenting(false); setNoteText(""); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   OPEN MODAL
   ────────────────────────────────────────────── */
function OpenModal({ onClose, onFile }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [pathPaste, setPathPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const fref = useRef(null);

  const loadUrl = async () => {
    if (!url.trim()) return;
    setLoading(true); setError("");
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const text = await r.text();
      onFile(text, url.split("/").pop() || "remote.md");
    } catch (e) {
      setError("Couldn't fetch that URL. Check it's a raw/plain-text link.");
    }
    setLoading(false);
  };

  return (
    <div className="mo" onClick={onClose}>
      <div className="mo-box" onClick={e => e.stopPropagation()}>
        <div className="mo-hdr">
          <span className="mo-title">Open Markdown</span>
          <button className="mo-x" onClick={onClose}>✕</button>
        </div>
        <div className="mo-sec">
          <label className="mo-lbl">From URL</label>
          <p className="mo-hint">GitLab raw, GitHub raw, or any direct .md link</p>
          <div style={{display:"flex",gap:8}}>
            <input className="mo-inp" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://gitlab.com/.../raw/main/README.md"
              onKeyDown={e => { if (e.key === "Enter") loadUrl(); }} />
            <button className="btn" onClick={loadUrl} disabled={loading}>{loading ? "..." : "Load"}</button>
          </div>
          {error && <p className="mo-err">{error}</p>}
        </div>
        <div className="mo-div"><span>or</span></div>
        <div className="mo-sec">
          <label className="mo-lbl">From your computer</label>
          <button className="btn btn-accent" style={{width:"100%"}} onClick={() => fref.current?.click()}>Browse files...</button>
          <input ref={fref} type="file" accept=".md,.markdown,.txt,.mdx" style={{display:"none"}}
            onChange={e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = ev => onFile(ev.target.result, f.name); r.readAsText(f); }}} />
        </div>
        <div className="mo-div"><span>or</span></div>
        <div className="mo-sec">
          <label className="mo-lbl">From a local file path</label>
          <p className="mo-hint">Paste a path and copy the terminal command below, then paste the file contents</p>
          <div style={{display:"flex",gap:8}}>
            <input className="mo-inp" value={localPath} onChange={e => setLocalPath(e.target.value)}
              placeholder="/path/to/file.md" />
          </div>
          {localPath.trim() && !localPath.startsWith("http") && (
            <div className="mo-path-helper">
              <p className="mo-hint" style={{marginTop:8,marginBottom:4}}>Run this in your terminal to copy the file:</p>
              <div className="mo-cmd-row">
                <code className="mo-cmd">cat "{localPath.trim()}" | pbcopy</code>
                <button className="bsm" onClick={() => {
                  navigator.clipboard.writeText(`cat "${localPath.trim()}" | pbcopy`);
                  setCopied(true); setTimeout(() => setCopied(false), 2000);
                }}>{copied ? "✓ Copied" : "Copy"}</button>
              </div>
              <p className="mo-hint" style={{marginTop:8,marginBottom:4}}>Then paste the content here:</p>
              <textarea className="mo-paste" value={pathPaste} onChange={e => setPathPaste(e.target.value)}
                placeholder="⌘V to paste file contents..." rows={4} />
              {pathPaste.trim() && (
                <button className="btn btn-a" style={{width:"100%",marginTop:8}} onClick={() => {
                  onFile(pathPaste, localPath.split("/").pop() || "file.md");
                }}>Load pasted content</button>
              )}
            </div>
          )}
        </div>
        <div className="mo-div"><span>or</span></div>
        <div className="mo-sec" style={{paddingBottom:20}}>
          <label className="mo-lbl">Drag & drop</label>
          <p className="mo-hint">Close this and drop a file anywhere on the page</p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   MAIN
   ────────────────────────────────────────────── */
export default function App() {
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState("rendered");
  const [pasteText, setPasteText] = useState("");
  const [showOpen, setShowOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiTitle, setAiTitle] = useState("");
  const [chat, setChat] = useState([]);
  const [chatIn, setChatIn] = useState("");
  const [comments, setComments] = useState([]);
  const [userNotes, setUserNotes] = useState([]); // {blockIndex, text, quote}
  const [showCom, setShowCom] = useState(true);
  const [fontSize, setFontSize] = useState(16);
  const [activeComment, setActiveComment] = useState(-1);
  const [saveMsg, setSaveMsg] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [copyText, setCopyText] = useState(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
  });
  const chatEnd = useRef(null);
  const docRef = useRef(null);
  const tbFileRef = useRef(null);
  const emptyFileRef = useRef(null);
  const [parserReady, setParserReady] = useState(markedLoaded);

  const hasDoc = markdown.trim().length > 0 || mode === "paste";

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);
  useEffect(() => { loadMarked().then(() => setParserReady(true)); }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        setMode(m => m === "rendered" ? "source" : "rendered");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Scroll listener: detect which AI comment highlight is in view
  useEffect(() => {
    if (comments.length === 0) return;
    const docEl = docRef.current;
    if (!docEl) return;

    const onScroll = () => {
      const marks = docEl.querySelectorAll("mark.ai-hl");
      if (marks.length === 0) return;
      const viewTop = docEl.scrollTop;
      const viewMid = viewTop + docEl.clientHeight / 2;
      let closest = -1;
      let closestDist = Infinity;
      marks.forEach(m => {
        const id = parseInt(m.dataset.comment, 10);
        const dist = Math.abs(m.offsetTop - viewMid);
        if (dist < closestDist) { closestDist = dist; closest = id; }
      });
      setActiveComment(closest);
    };

    docEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial
    return () => docEl.removeEventListener("scroll", onScroll);
  }, [comments]);

  const [blocks, setBlocks] = useState([]);
  const handleBlockSave = (i, t) => {
    setBlocks(prev => {
      const b = [...prev];
      b[i] = t;
      setMarkdown(joinBlocks(b));
      return b;
    });
  };

  const load = useCallback((text, name) => {
    setMarkdown(text); setFileName(name); setMode("rendered");
    setBlocks(splitIntoBlocks(text));
    setComments([]); setAiResult(null); setChat([]); setShowOpen(false);
  }, []);

  // Auto-load content injected by CLI launcher
  useEffect(() => {
    if (window.__SOFTMARK_INJECT__) {
      const { content, filename } = window.__SOFTMARK_INJECT__;
      if (content) load(content, filename || "document.md");
      delete window.__SOFTMARK_INJECT__;
    }
  }, [load]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const r = new FileReader(); r.onload = e => load(e.target.result, file.name); r.readAsText(file);
  }, [load]);

  const reset = () => { setMarkdown(""); setFileName(null); setMode("rendered"); setPasteText(""); setAiTitle(""); setAiOpen(false); setComments([]); setUserNotes([]); setAiResult(null); setChat([]); setBlocks([]); };

  const runAction = async (a) => {
    setAiLoading(true); setAiOpen(true); setAiTitle(a.label); setAiResult(null);
    const isReview = a.id === "review-content" || a.id === "review-writing";
    if (isReview) {
      setAiResult("Analyzing...");
      const r = await callClaude(a.system, a.prompt(markdown));
      try {
        let c = null;
        try { c = JSON.parse(r.trim()); } catch {}
        if (!c) try { c = JSON.parse(r.replace(/```(?:json)?\s*/gi,"").replace(/```/g,"").trim()); } catch {}
        if (!c) { const m = r.match(/\[[\s\S]*\]/); if (m) try { c = JSON.parse(m[0]); } catch {} }
        if (c && Array.isArray(c) && c.length) {
          const v = c.filter(x => x.quote && x.comment).map((x, idx) => ({ ...x, _id: idx + 1 }));
          setComments(v); setShowCom(true);
          setAiResult(`${v.length} ${a.id === "review-content" ? "content" : "writing"} comments added. Look for highlights in the preview.`);
        } else throw new Error();
      } catch { setAiResult(`${a.label}:\n\n` + r); }
    } else {
      setAiResult(await callClaude(a.system, a.prompt(markdown)));
    }
    setAiLoading(false);
  };

  const sendChat = async () => {
    if (!chatIn.trim()) return;
    const msg = chatIn; setChatIn("");
    setChat(p => [...p, { role: "user", text: msg }]);
    setAiLoading(true);
    const r = await callClaude("Answer questions about the document. Concise. Bullet points when listing.", `Document:\n\n${markdown}\n\nQuestion: ${msg}`);
    setChat(p => [...p, { role: "assistant", text: r }]);
    setAiLoading(false);
  };

  // Map comments to blocks — fuzzy match stripping markdown syntax
  const stripMd = (s) => s.replace(/\*\*/g,"").replace(/\*/g,"").replace(/`/g,"").replace(/~/g,"").replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").toLowerCase();
  const bc = blocks.map(() => []);
  comments.forEach((c) => {
    if (!c.quote) return;
    const q = stripMd(c.quote);
    for (let bi = 0; bi < blocks.length; bi++) {
      if (stripMd(blocks[bi]).includes(q)) { bc[bi].push({ ...c, gIdx: c._id }); break; }
    }
  });

  const wc = markdown.trim().split(/\s+/).filter(w => w).length;

  // Table of contents from headings
  const toc = [];
  markdown.split("\n").forEach(line => {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) toc.push({ level: m[1].length, text: m[2].replace(/[*`~\[\]()]/g, "").trim() });
  });

  return (
    <div className={dark ? "dark" : ""} onDrop={e => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
      style={{ height: "100vh", background: "var(--bg)", fontFamily: "var(--font-body)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{--bg:#F7F5F0;--bg2:#EDEAE3;--bg3:#E3E0D8;--surface:#FFF;--text:#2C2A25;--text2:#6B6860;--text3:#9C9890;--accent:#3D6B52;--accent2:#2A4D3A;--accent-light:#E8F0EB;--accent-glow:#4A8A65;--warn:#C4793A;--warn-light:#FDF3EB;--border:#DDD9D1;--border2:#CECAC2;--font-body:'Newsreader',Georgia,serif;--font-ui:'DM Sans',system-ui,sans-serif;--font-mono:'JetBrains Mono',monospace;--radius:10px;--shadow-sm:0 1px 3px rgba(0,0,0,.06);--shadow-md:0 4px 16px rgba(0,0,0,.08);--shadow-lg:0 8px 32px rgba(0,0,0,.12)}
        .dark{--bg:#1A1A1E;--bg2:#242428;--bg3:#2E2E33;--surface:#222226;--text:#E0DDD6;--text2:#A09C94;--text3:#6B6860;--accent:#5A9E74;--accent2:#7AC095;--accent-light:#1E2E24;--accent-glow:#5A9E74;--warn:#D4944A;--warn-light:#2A2218;--border:#3A3A3E;--border2:#4A4A4E;--shadow-sm:0 1px 3px rgba(0,0,0,.2);--shadow-md:0 4px 16px rgba(0,0,0,.3);--shadow-lg:0 8px 32px rgba(0,0,0,.4)}
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

        .drag-overlay{position:fixed;inset:0;z-index:200;background:rgba(61,107,82,.06);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;border:3px dashed var(--accent);border-radius:16px;margin:8px}
        .drag-overlay span{font-family:var(--font-ui);font-size:18px;font-weight:600;color:var(--accent);background:var(--surface);padding:16px 32px;border-radius:12px;box-shadow:var(--shadow-lg)}

        .topbar{position:sticky;top:0;z-index:100;background:var(--bg);backdrop-filter:blur(14px);border-bottom:1px solid var(--border);padding:8px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;font-family:var(--font-ui)}
        .topbar-l{display:flex;align-items:center;gap:10px}
        .tb-logo{width:24px;height:24px;background:var(--accent2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);font-size:13px;font-weight:700;color:#fff}
        .tb-fname{font-size:13px;font-weight:600;color:var(--text);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tb-stats{font-size:11px;color:var(--text3)}
        .topbar-r{display:flex;align-items:center;gap:4px}
        .tb-group{display:flex;align-items:center;gap:2px}
        .tb-sep{width:1px;height:18px;background:var(--border);margin:0 6px}
        .tb-icon{width:30px;height:28px;border:none;background:0 0;border-radius:6px;font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--text3);cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center}
        .tb-icon:hover{color:var(--accent2);background:var(--accent-light)}
        .tb-ai{padding:5px 14px;border:1.5px solid var(--accent);background:var(--accent-light);border-radius:8px;font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--accent2);cursor:pointer;transition:.15s;white-space:nowrap}
        .tb-ai:hover{background:var(--accent2);color:#fff}
        .tb-ai-on{background:var(--accent2);color:#fff;border-color:var(--accent2)}
        .tb-ai-on:hover{background:var(--accent-glow)}

        .tb-toggle{display:flex;background:var(--bg2);border-radius:8px;padding:3px;cursor:pointer;user-select:none}
        .tb-tog-opt{padding:5px 14px;border-radius:6px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--text3);transition:all .15s}
        .tb-tog-on{background:var(--surface);color:var(--accent2);box-shadow:var(--shadow-sm);font-weight:600}

        /* Empty state */
        .empty{display:flex;align-items:center;justify-content:center;flex:1;padding:40px;font-family:var(--font-ui);overflow-y:auto}
        .empty-inner{width:100%;max-width:520px}
        .empty-brand{text-align:center;margin-bottom:28px}
        .empty-logo{width:56px;height:56px;background:var(--accent2);border-radius:14px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);font-size:26px;font-weight:700;color:#fff;letter-spacing:-1px}
        .empty-name{font-family:var(--font-body);font-size:28px;font-weight:700;color:var(--text);margin:0;letter-spacing:-.5px}
        .empty-tagline{font-size:14px;color:var(--text3);margin:4px 0 0}
        .empty-drop{border:2.5px dashed var(--border2);border-radius:16px;padding:48px 32px;text-align:center;background:var(--surface);transition:border-color .2s,background .2s}
        .empty-drop:hover{border-color:var(--accent);background:var(--accent-light)}
        .empty-drop-icon{margin-bottom:16px;opacity:.7;display:flex;justify-content:center}
        .empty-title{font-family:var(--font-body);font-size:22px;font-weight:700;color:var(--text);margin:0 0 6px;letter-spacing:-.3px}
        .empty-sub{font-size:14px;color:var(--text3);margin:0}
        .empty-divider{display:flex;align-items:center;gap:12px;margin:20px 0;color:var(--text3);font-size:12px}
        .empty-divider::before,.empty-divider::after{content:"";flex:1;height:1px;background:var(--border)}
        .empty-actions{display:flex;gap:10px}
        .empty-action{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 12px;border:1px solid var(--border);background:var(--surface);border-radius:12px;cursor:pointer;transition:all .2s;text-align:center}
        .empty-action:hover{border-color:var(--accent);background:var(--accent-light);transform:translateY(-2px);box-shadow:var(--shadow-sm)}
        .empty-action-icon{font-size:22px;margin-bottom:2px}
        .empty-action-label{font-size:13px;font-weight:600;color:var(--text)}
        .empty-action-desc{font-size:11px;color:var(--text3);line-height:1.3}
        .empty-example{display:block;margin:20px auto 0;border:none;background:none;font-family:var(--font-ui);font-size:12px;color:var(--text3);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
        .empty-example:hover{color:var(--accent2)}
        .btn{padding:5px 12px;border:1px solid var(--border);background:var(--surface);border-radius:8px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--text2);cursor:pointer;transition:.15s;white-space:nowrap}
        .btn:hover{border-color:var(--accent);color:var(--accent2);background:var(--accent-light)}
        .btn-dis{opacity:.4;cursor:not-allowed}
        .btn-dis:hover{border-color:var(--border);color:var(--text3);background:var(--surface)}
        .btn-a{background:var(--accent2);color:#fff;border-color:var(--accent2)}.btn-a:hover{background:var(--accent-glow);color:#fff}

        .abar{display:flex;align-items:center;gap:6px;padding:8px 20px;background:var(--surface);border-bottom:1px solid var(--border);font-family:var(--font-ui);overflow-x:auto}
        .abar-l{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-right:4px;white-space:nowrap}
        .abtn{padding:6px 14px;border:1px solid var(--border);background:var(--bg);border-radius:20px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--text);cursor:pointer;transition:.2s;white-space:nowrap;display:flex;align-items:center;gap:5px}
        .abtn:hover{border-color:var(--accent);background:var(--accent-light);color:var(--accent2);transform:translateY(-1px);box-shadow:var(--shadow-sm)}
        .abtn.dis{opacity:.6;pointer-events:none}
        .abtn-on{background:var(--accent2);color:#fff;border-color:var(--accent2)}
        .abtn-on:hover{background:var(--accent-glow);color:#fff}

        .main{display:flex;flex:1;min-height:0;overflow:hidden}
        .doc{flex:1;overflow-y:auto;min-width:0}

        /* TOC sidebar */
        .toc-sidebar{border-right:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;font-family:var(--font-ui);overflow:hidden;transition:width .2s ease;flex-shrink:0}
        .toc-open{width:220px}
        .toc-closed{width:36px}
        .toc-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 10px 6px;flex-shrink:0}
        .toc-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px}
        .toc-toggle{width:24px;height:24px;border:none;background:var(--bg);border-radius:6px;font-size:10px;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;flex-shrink:0}
        .toc-toggle:hover{background:var(--bg3);color:var(--text)}
        .toc-list{flex:1;overflow-y:auto;padding:0 10px 16px}
        .toc-item{display:block;width:100%;text-align:left;border:none;background:none;font-family:var(--font-ui);font-size:12px;color:var(--text2);padding:4px 6px;cursor:pointer;transition:all .15s;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .toc-item:hover{color:var(--accent2);background:var(--accent-light)}
        .toc-h1{font-weight:600;color:var(--text)}
        .toc-h2{padding-left:12px}
        .toc-h3{padding-left:24px;font-size:11px;color:var(--text3)}
        .toc-h4,.toc-h5,.toc-h6{padding-left:36px;font-size:11px;color:var(--text3)}
        .wrap{max-width:740px;margin:0 auto;padding:36px 32px 120px}

        /* Block editing */
        .bview{position:relative;cursor:pointer;border-radius:6px;transition:background .15s,box-shadow .15s;padding:2px 8px;margin:-2px -8px}
        .bview:hover{background:rgba(61,107,82,.04)}
        .bview-h{box-shadow:inset 3px 0 0 var(--accent)}
        .bedit{background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius);margin:4px 0;box-shadow:var(--shadow-md);overflow:hidden}
        .bedit-toolbar{display:flex;align-items:center;gap:3px;padding:6px 10px;background:var(--bg);border-bottom:1px solid var(--border);flex-wrap:wrap}
        .tb-e{padding:4px 8px;border:1px solid transparent;background:none;border-radius:5px;font-family:var(--font-ui);font-size:12px;cursor:pointer;color:var(--text2);transition:.15s}
        .tb-e:hover{background:var(--accent-light);color:var(--accent2);border-color:var(--border)}
        .tb-es{width:1px;height:18px;background:var(--border);margin:0 2px}
        .bedit-mt{display:flex;gap:2px;background:var(--bg2);border-radius:6px;padding:2px;margin-left:auto}
        .bedit-mtb{padding:4px 10px;border:none;background:none;border-radius:4px;font-family:var(--font-ui);font-size:11px;font-weight:500;color:var(--text2);cursor:pointer}
        .bedit-mtb:hover{color:var(--accent2)}
        .bedit-mtb.on{background:var(--surface);color:var(--accent2);box-shadow:var(--shadow-sm)}
        .bedit-link{display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--accent-light);border-bottom:1px solid var(--border);font-family:var(--font-ui)}
        .bedit-link-l{font-size:12px;font-weight:600;color:var(--accent2)}
        .bedit-link-in{flex:1;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-family:var(--font-ui);font-size:12px;outline:none;color:var(--text);background:var(--surface)}
        .bedit-link-in:focus{border-color:var(--accent)}
        .bedit-rich{min-height:80px;padding:16px 20px;outline:none;font-family:var(--font-body);font-size:inherit;line-height:1.78;color:var(--text)}
        .bedit-rich:focus{background:rgba(61,107,82,.01)}
        .bedit-ta{width:100%;min-height:60px;border:none;outline:none;padding:16px 20px;font-family:var(--font-mono);font-size:13.5px;line-height:1.65;color:var(--text);background:0 0;resize:none}
        .bedit-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-top:1px solid var(--border);background:var(--bg)}
        .bedit-hint{font-family:var(--font-ui);font-size:11px;color:var(--text3)}
        .bsm{padding:4px 10px;border:1px solid var(--border);background:var(--surface);border-radius:6px;font-family:var(--font-ui);font-size:11px;font-weight:500;color:var(--text2);cursor:pointer}
        .bsm:hover{border-color:var(--accent);color:var(--accent2)}
        .bsm-a{background:var(--accent2);color:#fff;border-color:var(--accent2)}.bsm-a:hover{background:var(--accent-glow);color:#fff}

        /* AI panel */
        .aip{width:380px;min-width:380px;height:100%;max-height:100%;border-left:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;font-family:var(--font-ui);animation:si .25s ease;overflow:hidden}
        @keyframes si{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
        .aip-h{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .aip-t{font-size:14px;font-weight:600;color:var(--text)}
        .aip-x{width:28px;height:28px;border:none;background:var(--bg);border-radius:6px;cursor:pointer;font-size:16px;color:var(--text2);display:flex;align-items:center;justify-content:center}
        .aip-x:hover{background:var(--bg3);color:var(--text)}
        .aip-b{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
        .aic{background:var(--bg);border-radius:var(--radius);padding:14px 16px;font-size:13.5px;line-height:1.7;color:var(--text);white-space:pre-wrap;word-break:break-word}
        .aic h4{font-size:12px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
        .cm{padding:10px 14px;border-radius:var(--radius);font-size:13px;line-height:1.65;max-width:92%;word-break:break-word;white-space:pre-wrap}
        .cm-u{background:var(--accent2);color:#fff;align-self:flex-end;border-bottom-right-radius:3px}
        .cm-a{background:var(--bg);color:var(--text);align-self:flex-start;border-bottom-left-radius:3px}
        .cm-md{font-size:13px}.cm-md p{font-size:13px;margin:0 0 .3em}.cm-md p:last-child{margin:0}
        .cm-md ul,.cm-md ol{margin:0 0 .3em;padding-left:1.2em;font-size:13px}.cm-md li{font-size:13px;line-height:1.5;margin-bottom:.1em}
        .cm-md h1,.cm-md h2,.cm-md h3,.cm-md h4{font-size:14px;margin:.3em 0 .2em}
        .cm-md code{font-size:12px}.cm-md pre{font-size:12px;padding:8px 12px;margin:.3em 0}
        .ci-wrap{flex-shrink:0;border-top:1px solid var(--border);background:var(--surface)}
        .ci-label{padding:8px 16px 0;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px}
        .ci-row{padding:8px 16px 12px;display:flex;gap:8px;flex-shrink:0}
        .ci-in{flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:var(--font-ui);font-size:13px;outline:none;background:var(--bg);color:var(--text)}
        .ci-in:focus{border-color:var(--accent)}.ci-in::placeholder{color:var(--text3)}
        .ld{display:flex;gap:4px;padding:8px 0}.ld span{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:bo 1.2s infinite}.ld span:nth-child(2){animation-delay:.15s}.ld span:nth-child(3){animation-delay:.3s}
        @keyframes bo{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}

        .clist{display:flex;flex-direction:column;gap:8px}
        .clist-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:4px}
        .clist-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px}
        .clist-actions{display:flex;gap:8px}
        .clist-btn{border:none;background:none;font-family:var(--font-ui);font-size:11px;color:var(--accent2);cursor:pointer;padding:0;font-weight:500}
        .clist-btn:hover{text-decoration:underline}
        .clist-btn-dim{color:var(--text3);font-weight:400}
        .clist-btn-dim:hover{color:var(--warn)}
        .citem{background:var(--warn-light);border:1px solid rgba(196,121,58,.2);border-radius:var(--radius);padding:10px 12px;font-size:12.5px;line-height:1.6;transition:all .15s;display:flex;align-items:flex-start;gap:8px}
        .citem-body{flex:1;cursor:pointer}
        .citem-x{flex-shrink:0;border:none;background:none;font-size:14px;color:var(--text3);cursor:pointer;padding:0;line-height:1;margin-top:1px}
        .citem-x:hover{color:var(--warn)}
        .citem-click{cursor:pointer}
        .citem-click:hover{border-color:var(--warn);box-shadow:var(--shadow-sm);transform:translateY(-1px)}
        .citem-active{border-color:var(--warn);background:rgba(196,121,58,.15);box-shadow:inset 3px 0 0 var(--warn)}
        .citem .ci{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:var(--warn);color:#fff;font-size:10px;font-weight:700;margin-right:6px;flex-shrink:0}
        .citem .cq{color:var(--text3);font-style:italic;display:block;margin-top:4px;font-size:11.5px}

        mark.ai-hl{background:rgba(196,121,58,.15);border-bottom:2px solid var(--warn);border-radius:2px;padding:1px 2px;position:relative;cursor:pointer;transition:background .3s}
        mark.ai-hl:hover{background:rgba(196,121,58,.28)}
        mark.ai-hl-flash{background:rgba(196,121,58,.45)!important;transition:background .15s}
        .cbadge{position:absolute;top:-10px;right:-8px;width:18px;height:18px;border-radius:50%;background:var(--warn);color:#fff;font-family:var(--font-ui);font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.15);pointer-events:none}

        /* Edit mode comment pills */
        .bedit-comments{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
        .bedit-comment-pill{font-family:var(--font-ui);font-size:11px;color:var(--warn);background:var(--warn-light);padding:2px 8px;border-radius:12px;border:1px solid rgba(196,121,58,.2)}

        /* Block hover actions */
        .bview-actions{position:absolute;top:4px;right:4px;display:flex;gap:4px;opacity:.85}
        .bview-btn{font-family:var(--font-ui);font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:3px 8px;border-radius:4px;border:none;cursor:pointer;transition:.15s}
        .bview-btn:hover{background:var(--accent2);color:#fff}

        /* User notes */
        .unote{display:flex;align-items:flex-start;gap:8px;margin:4px 0 8px 8px;padding:8px 12px;font-family:var(--font-ui);animation:fadeIn .2s ease}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .unote-bar{width:3px;min-height:100%;border-radius:2px;background:var(--accent);flex-shrink:0;align-self:stretch}
        .unote-body{flex:1}
        .unote-author{font-size:10px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px}
        .unote-text{font-size:13px;line-height:1.5;color:var(--text)}
        .unote-x{border:none;background:none;font-size:13px;color:var(--text3);cursor:pointer;padding:0;line-height:1}
        .unote-x:hover{color:var(--warn)}
        .unote-input{display:flex;align-items:center;gap:8px;margin:4px 0 8px 8px;padding:8px 12px}
        .unote-field{flex:1;padding:6px 10px;border:1.5px solid var(--accent);border-radius:6px;font-family:var(--font-ui);font-size:13px;outline:none;color:var(--text);background:var(--surface)}
        .unote-field:focus{box-shadow:0 0 0 3px rgba(61,107,82,.1)}
        .unote-field::placeholder{color:var(--text3)}

        /* Modal */
        .mo{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.3);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center}
        .mo-box{background:var(--surface);border-radius:14px;box-shadow:var(--shadow-lg);width:480px;max-width:90vw}
        .mo-hdr{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
        .mo-title{font-family:var(--font-ui);font-size:16px;font-weight:600;color:var(--text)}
        .mo-x{width:28px;height:28px;border:none;background:var(--bg);border-radius:6px;cursor:pointer;font-size:16px;color:var(--text2);display:flex;align-items:center;justify-content:center}
        .mo-sec{padding:16px 20px}
        .mo-lbl{font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--text2);display:block;margin-bottom:6px}
        .mo-hint{font-family:var(--font-ui);font-size:12px;color:var(--text3);margin:0 0 8px}
        .mo-inp{flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:var(--font-ui);font-size:13px;outline:none;color:var(--text)}.mo-inp:focus{border-color:var(--accent)}
        .mo-err{font-family:var(--font-ui);font-size:12px;color:#c53030;margin-top:6px}
        .mo-div{padding:0 20px;display:flex;align-items:center;gap:12px;color:var(--text3);font-family:var(--font-ui);font-size:12px}
        .mo-div::before,.mo-div::after{content:"";flex:1;height:1px;background:var(--border)}
        .mo-path-helper{margin-top:4px}
        .mo-cmd-row{display:flex;align-items:center;gap:8px}
        .mo-cmd{flex:1;display:block;padding:8px 12px;background:#1B1D23;color:#D4D4D4;border-radius:6px;font-family:var(--font-mono);font-size:12px;white-space:nowrap;overflow-x:auto}
        .mo-paste{width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-family:var(--font-mono);font-size:13px;outline:none;color:var(--text);resize:vertical;min-height:80px}
        .mo-paste:focus{border-color:var(--accent)}.mo-paste::placeholder{color:var(--text3)}

        /* MD rendered */
        .md-rendered h1{font-size:2em;font-weight:700;color:var(--text);margin:.4em 0 .3em;line-height:1.15;letter-spacing:-.5px}
        .md-rendered h2{font-size:1.5em;font-weight:600;color:var(--text);margin:.4em 0 .3em;line-height:1.2;border-bottom:1px solid var(--border);padding-bottom:.2em}
        .md-rendered h3{font-size:1.2em;font-weight:600;color:var(--text);margin:.3em 0 .2em}
        .md-rendered h4,.md-rendered h5,.md-rendered h6{font-size:1em;font-weight:600;color:var(--text2);margin:.3em 0 .2em}
        .md-rendered p{font-size:1em;line-height:1.78;color:var(--text);margin:0 0 .5em}
        .md-rendered a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
        .md-rendered strong{font-weight:600;color:var(--text)}.md-rendered em{font-style:italic}.md-rendered del{text-decoration:line-through;opacity:.5}
        .md-rendered ul,.md-rendered ol{margin:0 0 .8em;padding-left:1.8em}
        .md-rendered ul{list-style-type:disc}
        .md-rendered ol{list-style-type:decimal}
        .md-rendered li{font-size:1em;line-height:1.78;color:var(--text);margin-bottom:.3em}
        .md-rendered li p{margin:0 0 .3em}
        .md-rendered li::marker{color:var(--accent)}
        .md-rendered blockquote{border-left:3px solid var(--accent);margin:.5em 0;padding:.4em 1em;background:var(--accent-light);border-radius:0 8px 8px 0;color:var(--accent2);font-style:italic}
        .md-rendered blockquote p{margin:0}
        .md-rendered hr{border:none;height:1px;background:var(--border);margin:1.5em 0}
        .md-rendered pre{background:#1B1D23;color:#D4D4D4;border-radius:var(--radius);padding:16px 20px;margin:.5em 0;overflow-x:auto;font-family:var(--font-mono);font-size:13px;line-height:1.65}
        .md-rendered pre code{background:none;color:inherit;padding:0;border-radius:0;font-size:inherit}
        .md-rendered code{background:var(--bg2);color:var(--warn);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:.87em}
        .md-rendered .table-scroll{overflow-x:auto;margin:.5em 0;border:1px solid var(--border);border-radius:var(--radius)}
        .md-rendered .table-scroll table{margin:0;border:none;border-radius:0}
        .md-rendered table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;margin:.5em 0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;table-layout:auto}
        .md-rendered thead{background:var(--bg2)}
        .md-rendered th{font-family:var(--font-ui);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);padding:10px 14px;text-align:left;border-bottom:1px solid var(--border)}
        .md-rendered td{padding:10px 14px;border-bottom:1px solid var(--bg2);color:var(--text)}
        .md-rendered th:not(:last-child),.md-rendered td:not(:last-child){border-right:1px solid var(--bg2)}
        .md-rendered tr:last-child td{border-bottom:none}.md-rendered tr:hover td{background:var(--bg)}
        .md-rendered img{max-width:100%;border-radius:8px;margin:.5em 0}
        .md-rendered .cb{display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;margin-right:5px;font-size:12px;vertical-align:middle}
        .md-rendered .ck{background:var(--accent);color:#fff}.md-rendered .uc{border:2px solid var(--border2)}

        .src{background:#1B1D23;color:#D4D4D4;font-family:var(--font-mono);font-size:13px;line-height:1.7;padding:22px;border-radius:var(--radius);white-space:pre-wrap;word-break:break-word}
        .pa{width:100%;min-height:350px;background:var(--surface);border:2px solid var(--border);border-radius:var(--radius);padding:18px 22px;font-family:var(--font-mono);font-size:14px;line-height:1.7;color:var(--text);resize:vertical;outline:none}
        .pa:focus{border-color:var(--accent)}.pa::placeholder{color:var(--text3)}
        .pa-bar{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}

        .fcb{position:fixed;bottom:20px;right:20px;z-index:80;padding:10px 16px;border-radius:24px;border:1px solid var(--border);background:var(--surface);box-shadow:var(--shadow-md);font-family:var(--font-ui);font-size:12px;font-weight:600;color:var(--warn);cursor:pointer;display:flex;align-items:center;gap:6px}
        .fcb:hover{box-shadow:var(--shadow-lg);transform:translateY(-1px)}

        @media(max-width:840px){.aip{position:fixed;inset:0;width:100%;min-width:0;z-index:150}.wrap{padding:24px 16px 100px}.stats{display:none}.toc-sidebar{display:none}}
        @media print{.topbar,.abar,.aip,.fcb,.bview-badge,.toc-sidebar,.bview-actions{display:none!important}.wrap{padding:0;max-width:100%}.bview{cursor:default}.bview:hover{background:0 0;box-shadow:none}}
      `}</style>

      {isDragging && <div className="drag-overlay"><span>Drop your .md file here</span></div>}
      {showOpen && <OpenModal onClose={() => setShowOpen(false)} onFile={load} />}
      <input ref={tbFileRef} type="file" accept=".md,.markdown,.txt,.mdx" style={{display:"none"}}
        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />

      {/* Copy fallback modal */}
      {copyText && (
        <div className="mo" onClick={() => setCopyText(null)}>
          <div className="mo-box" onClick={e => e.stopPropagation()} style={{maxWidth:600}}>
            <div className="mo-hdr">
              <span className="mo-title">Copy Review</span>
              <button className="mo-x" onClick={() => setCopyText(null)}>✕</button>
            </div>
            <div className="mo-sec">
              <p className="mo-hint" style={{marginBottom:8}}>Select all (⌘A) and copy (⌘C):</p>
              <textarea className="pa" style={{minHeight:250,fontSize:12}} value={copyText} readOnly
                onFocus={e => e.target.select()} />
            </div>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {!hasDoc && !isDragging && (
        <div className="empty">
          <div className="empty-inner">
            <div className="empty-brand">
              <div className="empty-logo">S</div>
              <h1 className="empty-name">Softmark</h1>
              <p className="empty-tagline">Markdown, made simple</p>
            </div>

            <div className="empty-drop">
              <div className="empty-drop-icon">
                <svg width="40" height="40" viewBox="0 0 48 48" fill="none" style={{color:"var(--accent)"}}>
                  <path d="M24 4v28m0 0l-10-10m10 10l10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M8 34v6a4 4 0 004 4h24a4 4 0 004-4v-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="empty-title">Drop your .md file here</h2>
              <p className="empty-sub">Drag and drop any markdown file onto this area</p>
            </div>

            <div className="empty-divider"><span>or choose an option</span></div>

            <div className="empty-actions">
              <button className="empty-action" onClick={() => emptyFileRef.current?.click()}>
                <span className="empty-action-icon">📂</span>
                <span className="empty-action-label">Browse files</span>
                <span className="empty-action-desc">Pick a .md file from your computer</span>
              </button>
              <button className="empty-action" onClick={() => setShowOpen(true)}>
                <span className="empty-action-icon">🔗</span>
                <span className="empty-action-label">Open URL</span>
                <span className="empty-action-desc">Load from GitLab, GitHub, or any link</span>
              </button>
              <button className="empty-action" onClick={() => { setMode("paste"); setFileName("New document"); }}>
                <span className="empty-action-icon">📋</span>
                <span className="empty-action-label">Paste markdown</span>
                <span className="empty-action-desc">Paste raw markdown content</span>
              </button>
            </div>

            <button className="empty-example" onClick={() => { load(SAMPLE, "sample.md"); }}>
              or load an example document to explore
            </button>
          </div>
          <input ref={emptyFileRef} type="file" accept=".md,.markdown,.txt,.mdx" style={{display:"none"}}
            onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      )}

      {/* ── TOOLBAR (only when doc loaded) ── */}
      {hasDoc && (
        <>
          <div className="topbar">
            <div className="topbar-l">
              <div className="tb-logo">S</div>
              <span className="tb-fname">{fileName || "Untitled"}</span>
              <span className="tb-stats">{wc} words · {markdown.split("\n").length} lines</span>
            </div>
            <div className="topbar-r">
              <div className="tb-toggle" onClick={() => setMode(mode === "rendered" ? "source" : "rendered")}>
                <div className={`tb-tog-opt ${mode==="rendered"?"tb-tog-on":""}`}>Preview</div>
                <div className={`tb-tog-opt ${mode==="source"?"tb-tog-on":""}`}>Source</div>
              </div>
              <div className="tb-sep" />
              <div className="tb-group">
                <button className="tb-icon" onClick={() => setFontSize(s => Math.max(12, s - 2))} title="Smaller text">A−</button>
                <button className="tb-icon" onClick={() => setFontSize(s => Math.min(28, s + 2))} title="Larger text">A+</button>
              </div>
              <div className="tb-sep" />
              <div className="tb-group">
                <button className="btn" onClick={() => setShowOpen(true)}>Open</button>
                <button className="btn" onClick={() => {
                  try {
                    let saveName = "document";
                    if (fileName && !["New document", "Pasted", "Pasted content"].includes(fileName)) {
                      saveName = fileName.replace(/\.[^.]+$/, "");
                    } else {
                      const headingMatch = markdown.match(/^#\s+(.+)$/m);
                      if (headingMatch) {
                        saveName = headingMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
                      }
                    }

                    const hasReview = comments.length > 0 || userNotes.length > 0;
                    let content;

                    if (hasReview) {
                      // Build doc with inline comments after each block
                      const parts = blocks.map((block, i) => {
                        let part = block;
                        const blockAi = bc[i] || [];
                        const blockUser = userNotes.filter(n => n.blockIndex === i);
                        const inlineNotes = [];
                        blockAi.forEach(c => {
                          inlineNotes.push(`> **[AI]** "${c.quote}" — ${c.comment}`);
                        });
                        blockUser.forEach(n => {
                          inlineNotes.push(`> **[Review]** "${n.quote}" — ${n.text}`);
                        });
                        if (inlineNotes.length > 0) {
                          part += "\n\n" + inlineNotes.join("\n>\n");
                        }
                        return part;
                      });
                      content = parts.join("\n\n");
                    } else {
                      content = markdown;
                    }

                    const blob = new Blob([content], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = saveName + (hasReview ? "-reviewed" : "") + ".md";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch { navigator.clipboard.writeText(markdown); }
                }}>Save</button>
                <button className={`btn ${(comments.length > 0 || userNotes.length > 0) ? "" : "btn-dis"}`}
                  disabled={comments.length === 0 && userNotes.length === 0}
                  onClick={() => {
                    let out = `## Softmark Review — ${fileName || "document"}\n\n`;
                    if (comments.length > 0) {
                      out += `### AI Review (${aiTitle})\n\n`;
                      out += comments.map((c, i) => `${i + 1}. > "${c.quote}"\n   ${c.comment}`).join("\n\n");
                      out += "\n\n";
                    }
                    if (userNotes.length > 0) {
                      out += `### My Comments\n\n`;
                      out += userNotes.map((n, i) => `${i + 1}. > "${n.quote}"\n   ${n.text}`).join("\n\n");
                      out += "\n";
                    }
                    setCopyText(out);
                  }}>Copy Review</button>
                <button className="btn" onClick={reset}>Close</button>
              </div>
              <div className="tb-sep" />
              <div className="tb-group">
                <button className="btn" onClick={() => setDark(d => !d)}>
                  {dark ? "☀️ Light" : "🌙 Dark"}
                </button>
              </div>
            </div>
          </div>

          <div className="abar">
            <span className="abar-l">AI</span>
            {QUICK_ACTIONS.map(a => (
              <button key={a.id} className={`abtn ${aiLoading?"dis":""}`} onClick={() => runAction(a)} disabled={aiLoading}>
                <span>{a.icon}</span>{a.label}
              </button>
            ))}
            <button className={`abtn ${aiOpen ? "abtn-on" : ""}`} onClick={() => setAiOpen(!aiOpen)}>
              <span>💬</span>{aiOpen ? "Close Chat" : "Chat"}
            </button>
          </div>
        </>
      )}

      {/* ── CONTENT ── */}
      {hasDoc && (
        <div className="main">
          {/* TOC left sidebar */}
          {mode === "rendered" && toc.length > 1 && (
            <div className={`toc-sidebar ${tocOpen ? "toc-open" : "toc-closed"}`}>
              <div className="toc-hdr">
                <span className="toc-label">{tocOpen ? "Contents" : ""}</span>
                <button className="toc-toggle" onClick={() => setTocOpen(!tocOpen)} title={tocOpen ? "Collapse" : "Expand contents"}>
                  {tocOpen ? "◀" : "▶"}
                </button>
              </div>
              {tocOpen && (
                <div className="toc-list">
                  {toc.map((h, i) => (
                    <button key={i} className={`toc-item toc-h${h.level}`} onClick={() => {
                      const docEl = docRef.current;
                      if (!docEl) return;
                      const headings = docEl.querySelectorAll("h1,h2,h3,h4,h5,h6");
                      if (headings && headings[i]) {
                        headings[i].scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}>{h.text}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="doc" ref={docRef}>
            <div className="wrap" style={{ fontSize: `${fontSize}px` }}>
              {mode === "rendered" && blocks.map((b, i) => (
                <EditableBlock key={`${i}-${b.slice(0,20)}`} blockMd={b} index={i} onSave={handleBlockSave} comments={bc[i]} showComments={showCom}
                  userNotes={userNotes.filter(n => n.blockIndex === i)}
                  onAddNote={(bi, text, quote) => setUserNotes(prev => [...prev, { _id: Date.now(), blockIndex: bi, text, quote }])}
                  onDeleteNote={(id) => setUserNotes(prev => prev.filter(n => n._id !== id))}
                />
              ))}
              {mode === "source" && <div className="src">{markdown}</div>}
              {mode === "paste" && (
                <div>
                  <textarea className="pa" value={pasteText} onChange={e => setPasteText(e.target.value)} placeholder="Paste markdown here..." />
                  <div className="pa-bar">
                    <button className="btn" onClick={() => setPasteText("")}>Clear</button>
                    <button className="btn btn-a" onClick={() => { if (pasteText.trim()) { load(pasteText, "Pasted"); setPasteText(""); }}}>Render</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {aiOpen && (
            <div className="aip">
              <div className="aip-h">
                <div className="aip-t">AI Assistant</div>
                <button className="aip-x" onClick={() => setAiOpen(false)}>✕</button>
              </div>

              <div className="aip-b">
                {aiTitle && (
                  <div className="aic"><h4>{aiTitle}</h4>
                    {aiLoading && !aiResult ? <div className="ld"><span/><span/><span/></div> : <div className="md-rendered cm-md" dangerouslySetInnerHTML={{ __html: parseMarkdown(aiResult || "") }} />}
                  </div>
                )}

                {(comments.length > 0 || userNotes.length > 0) && (
                  <div className="clist">
                    <div className="clist-hdr">
                      <div className="clist-label">Review ({comments.length + userNotes.length} comments)</div>
                      <div className="clist-actions">
                        <button className="clist-btn" onClick={() => {
                          let out = `## Softmark Review — ${fileName || "document"}\n\n`;
                          if (comments.length > 0) {
                            out += `### AI Review (${aiTitle})\n\n`;
                            out += comments.map((c, i) => `${i + 1}. > "${c.quote}"\n   ${c.comment}`).join("\n\n");
                            out += "\n\n";
                          }
                          if (userNotes.length > 0) {
                            out += `### My Comments\n\n`;
                            out += userNotes.map((n, i) => `${i + 1}. > "${n.quote}"\n   ${n.text}`).join("\n\n");
                            out += "\n";
                          }
                          setCopyText(out);
                        }}>Copy review</button>
                        {comments.length > 0 && <button className="clist-btn clist-btn-dim" onClick={() => { setComments([]); setActiveComment(-1); }}>Dismiss AI</button>}
                      </div>
                    </div>
                    {comments.map((c) => {
                      const hlId = `hl-${c._id}`;
                      return (
                        <div key={c._id} className={`citem citem-click ${activeComment === c._id ? "citem-active" : ""}`}>
                          <div className="citem-body" onClick={() => {
                            let el = document.getElementById(hlId);
                            if (!el) {
                              const marks = document.querySelectorAll("mark.ai-hl");
                              for (const m of marks) { if (m.dataset.comment === String(c._id)) { el = m; break; } }
                            }
                            if (!el && c.quote) {
                              const cleanQ = c.quote.replace(/\*\*/g,"").replace(/\*/g,"").replace(/`/g,"").replace(/~/g,"").trim().toLowerCase();
                              const docEl = document.querySelector(".doc");
                              if (docEl) {
                                const walker = document.createTreeWalker(docEl, NodeFilter.SHOW_TEXT);
                                while (walker.nextNode()) {
                                  if (walker.currentNode.textContent.toLowerCase().includes(cleanQ)) {
                                    el = walker.currentNode.parentElement; break;
                                  }
                                }
                              }
                            }
                            if (el) {
                              el.scrollIntoView({ behavior: "smooth", block: "center" });
                              el.classList.add("ai-hl-flash");
                              setTimeout(() => el.classList.remove("ai-hl-flash"), 1500);
                            }
                          }}>
                            <span className="ci">{c._id}</span>
                            <span>{c.comment}</span>
                            <span className="cq">"{c.quote}"</span>
                          </div>
                          <button className="citem-x" onClick={(e) => {
                            e.stopPropagation();
                            setComments(prev => prev.filter(x => x._id !== c._id));
                          }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {chat.map((m, i) => (
                  <div key={i} className={`cm ${m.role==="user"?"cm-u":"cm-a"}`}>
                    {m.role === "user" ? m.text : <div className="md-rendered cm-md" dangerouslySetInnerHTML={{ __html: parseMarkdown(m.text) }} />}
                  </div>
                ))}
                {aiLoading && chat.length > 0 && chat[chat.length-1].role==="user" && (
                  <div className="cm cm-a"><div className="ld"><span/><span/><span/></div></div>
                )}
                <div ref={chatEnd}/>
              </div>
              <div className="ci-wrap">
                <div className="ci-label">Chat with this document</div>
                <div className="ci-row">
                  <input className="ci-in" value={chatIn} onChange={e => setChatIn(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey) { e.preventDefault(); sendChat(); }}}
                    placeholder="Ask a question..." disabled={aiLoading} />
                  <button className="btn btn-a" onClick={sendChat} disabled={aiLoading||!chatIn.trim()}>Send</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {comments.length > 0 && !aiOpen && (
        <button className="fcb" onClick={() => { setShowCom(!showCom); setAiOpen(true); }}>
          💬 {comments.length} AI Comments
        </button>
      )}
    </div>
  );
}
