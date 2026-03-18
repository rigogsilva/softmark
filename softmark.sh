#!/bin/bash
# ─────────────────────────────────────────────
# Softmark — Markdown, made simple
# 
# Usage:
#   softmark spec.md                  Open in cmux browser pane (or fallback to browser)
#   softmark --ai spec.md             Copy content to clipboard + open Claude artifact
#   softmark --browser spec.md        Force open in default browser
#   softmark --config                 Configure Softmark (set AI URL, etc.)
#   softmark -h | --help
#
# Install:
#   cp softmark.sh ~/.local/bin/softmark
#   chmod +x ~/.local/bin/softmark
# ─────────────────────────────────────────────

set -euo pipefail

# ── Config file ──
SOFTMARK_CONFIG="${HOME}/.config/softmark/config"

load_config() {
  if [[ -f "$SOFTMARK_CONFIG" ]]; then
    source "$SOFTMARK_CONFIG"
  fi
}

save_config() {
  mkdir -p "$(dirname "$SOFTMARK_CONFIG")"
  cat > "$SOFTMARK_CONFIG" << EOF
# Softmark config
SOFTMARK_AI_URL="${SOFTMARK_AI_URL}"
EOF
}

# Load existing config
load_config

# Defaults (env var overrides config file)
SOFTMARK_AI_URL="${SOFTMARK_AI_URL:-https://claude.ai/public/artifacts/e3e69f30-3603-4d4e-93a7-5c75ec53d480}"

# ── Colors ──
GREEN='\033[0;32m'
DIM='\033[2m'
BOLD='\033[1m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Config wizard ──
run_config() {
  echo -e "${BOLD}Softmark${NC} — Configuration"
  echo ""
  echo -e "Config file: ${DIM}${SOFTMARK_CONFIG}${NC}"
  echo ""

  # Current values
  echo -e "Current settings:"
  echo -e "  AI URL: ${CYAN}${SOFTMARK_AI_URL}${NC}"
  echo ""

  # Set AI URL
  echo -e "Enter your published Softmark artifact URL"
  echo -e "${DIM}(paste the URL from Claude after publishing, or press Enter to keep current)${NC}"
  read -r -p "> " new_url

  if [[ -n "$new_url" ]]; then
    SOFTMARK_AI_URL="$new_url"
  fi

  save_config

  echo ""
  echo -e "${GREEN}✓${NC} Config saved to ${DIM}${SOFTMARK_CONFIG}${NC}"
  echo ""
  echo -e "  AI URL: ${CYAN}${SOFTMARK_AI_URL}${NC}"
  echo ""
  echo -e "Test it: ${GREEN}softmark --ai your-file.md${NC}"
}

# ── Help ──
show_help() {
  echo -e "${BOLD}Softmark${NC} — Markdown, made simple"
  echo ""
  echo -e "  ${GREEN}softmark${NC} <file.md>              Open in cmux pane (or browser)"
  echo -e "  ${GREEN}softmark --ai${NC} <file.md>         Copy to clipboard + open Claude artifact"
  echo -e "  ${GREEN}softmark --browser${NC} <file.md>    Force open in default browser"
  echo -e "  ${GREEN}softmark --config${NC}               Configure Softmark settings"
  echo -e "  ${GREEN}softmark -h${NC}                      Show this help"
  echo ""
  echo -e "Config: ${DIM}${SOFTMARK_CONFIG}${NC}"
  echo -e "AI URL: ${DIM}${SOFTMARK_AI_URL}${NC}"
}

# ── Args ──
AI_MODE=false
FORCE_BROWSER=false
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ai) AI_MODE=true; shift ;;
    --browser) FORCE_BROWSER=true; shift ;;
    --config) run_config; exit 0 ;;
    -h|--help) show_help; exit 0 ;;
    *) FILE="$1"; shift ;;
  esac
done

if [[ -z "$FILE" ]]; then
  show_help
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo -e "Error: file not found: ${FILE}"
  exit 1
fi

FILENAME=$(basename "$FILE")
CONTENT=$(cat "$FILE")

# ── AI Mode: copy to clipboard + open Claude ──
if $AI_MODE; then
  echo "$CONTENT" | pbcopy
  echo -e "${GREEN}✓${NC} Copied ${BOLD}${FILENAME}${NC} to clipboard (${#CONTENT} chars)"
  echo -e "${DIM}Opening Softmark AI... paste your content there${NC}"
  
  # Try cmux browser first, fallback to system open
  if command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
    cmux browser open "$SOFTMARK_AI_URL"
  else
    open "$SOFTMARK_AI_URL"
  fi
  exit 0
fi

# ── Generate HTML ──
TMPFILE=$(mktemp /tmp/softmark-XXXXXX.html)

# Escape content for JS embedding
ESCAPED_CONTENT=$(echo "$CONTENT" | python3 -c "
import sys, json
content = sys.stdin.read()
print(json.dumps(content))
")

cat > "$TMPFILE" << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Softmark</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,600;0,6..72,700;1,6..72,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

:root {
  --bg:#F7F5F0;--bg2:#EDEAE3;--bg3:#E3E0D8;--surface:#FFF;
  --text:#2C2A25;--text2:#6B6860;--text3:#9C9890;
  --accent:#3D6B52;--accent2:#2A4D3A;--accent-light:#E8F0EB;
  --warn:#C4793A;--warn-light:#FDF3EB;
  --border:#DDD9D1;--border2:#CECAC2;
  --font-body:'Newsreader',Georgia,serif;
  --font-ui:'DM Sans',system-ui,sans-serif;
  --font-mono:'JetBrains Mono',monospace;
  --radius:10px;
}
.dark {
  --bg:#1A1A1E;--bg2:#242428;--bg3:#2E2E33;--surface:#222226;
  --text:#E0DDD6;--text2:#A09C94;--text3:#6B6860;
  --accent:#5A9E74;--accent2:#7AC095;--accent-light:#1E2E24;
  --warn:#D4944A;--warn-light:#2A2218;
  --border:#3A3A3E;--border2:#4A4A4E;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);font-family:var(--font-body);color:var(--text);display:flex;flex-direction:column;height:100vh;overflow:hidden}

.topbar{padding:8px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);background:var(--surface);font-family:var(--font-ui);flex-shrink:0}
.topbar-l{display:flex;align-items:center;gap:10px}
.tb-logo{width:24px;height:24px;background:var(--accent2);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);font-size:13px;font-weight:700;color:#fff}
.tb-fname{font-size:13px;font-weight:600;color:var(--text)}
.tb-stats{font-size:11px;color:var(--text3)}
.topbar-r{display:flex;align-items:center;gap:6px}
.btn{padding:5px 12px;border:1px solid var(--border);background:var(--surface);border-radius:8px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--text2);cursor:pointer}
.btn:hover{border-color:var(--accent);color:var(--accent2);background:var(--accent-light)}
.btn-dis{opacity:.4;cursor:not-allowed}
.tb-sep{width:1px;height:18px;background:var(--border);margin:0 4px}
.tab{padding:5px 12px;border:none;background:transparent;border-radius:6px;font-family:var(--font-ui);font-size:12px;font-weight:500;color:var(--text2);cursor:pointer}
.tab:hover{color:var(--accent2)}
.tab.on{background:var(--bg2);color:var(--accent2)}

.doc{flex:1;overflow-y:auto;padding:36px 32px 120px}
.wrap{max-width:740px;margin:0 auto}

.block{position:relative;padding:2px 8px;margin:-2px -8px;border-radius:6px;cursor:pointer;transition:background .15s}
.block:hover{background:rgba(61,107,82,.04)}
.block-actions{position:absolute;top:4px;right:4px;display:none;gap:4px}
.block:hover .block-actions{display:flex}
.block-btn{font-family:var(--font-ui);font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-light);padding:3px 8px;border-radius:4px;border:none;cursor:pointer}
.block-btn:hover{background:var(--accent2);color:#fff}

.block-edit{background:var(--surface);border:2px solid var(--accent);border-radius:var(--radius);padding:12px;margin:4px 0}
.block-edit textarea{width:100%;min-height:60px;border:none;outline:none;font-family:var(--font-mono);font-size:13.5px;line-height:1.65;color:var(--text);background:transparent;resize:none}
.block-edit-bar{display:flex;align-items:center;justify-content:space-between;margin-top:8px;font-family:var(--font-ui)}
.block-edit-bar span{font-size:11px;color:var(--text3)}
.bsm{padding:4px 10px;border:1px solid var(--border);background:var(--surface);border-radius:6px;font-family:var(--font-ui);font-size:11px;font-weight:500;color:var(--text2);cursor:pointer}
.bsm:hover{border-color:var(--accent);color:var(--accent2)}
.bsm-a{background:var(--accent2);color:#fff;border-color:var(--accent2)}

.unote{display:flex;align-items:flex-start;gap:8px;margin:4px 0 8px 8px;padding:8px 12px;font-family:var(--font-ui)}
.unote-bar{width:3px;min-height:20px;border-radius:2px;background:var(--accent);flex-shrink:0;align-self:stretch}
.unote-author{font-size:10px;font-weight:600;color:var(--accent2);text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:2px}
.unote-text{font-size:13px;line-height:1.5;color:var(--text)}
.unote-x{border:none;background:none;font-size:13px;color:var(--text3);cursor:pointer}
.unote-x:hover{color:var(--warn)}
.unote-input{display:flex;align-items:center;gap:8px;margin:4px 0 8px 8px;padding:8px 12px}
.unote-field{flex:1;padding:6px 10px;border:1.5px solid var(--accent);border-radius:6px;font-family:var(--font-ui);font-size:13px;outline:none;color:var(--text);background:var(--surface)}

.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;z-index:200}
.modal{background:var(--surface);border-radius:14px;width:550px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.12)}
.modal-h{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;font-family:var(--font-ui);font-weight:600}
.modal-b{padding:16px 20px}
.modal-ta{width:100%;min-height:200px;border:1px solid var(--border);border-radius:8px;padding:12px;font-family:var(--font-mono);font-size:12px;color:var(--text);background:var(--bg);resize:vertical}

/* Markdown */
.md h1{font-size:2em;font-weight:700;color:var(--text);margin:.4em 0 .3em;line-height:1.15;letter-spacing:-.5px}
.md h2{font-size:1.5em;font-weight:600;color:var(--text);margin:.4em 0 .3em;border-bottom:1px solid var(--border);padding-bottom:.2em}
.md h3{font-size:1.2em;font-weight:600;color:var(--text);margin:.3em 0 .2em}
.md h4,.md h5,.md h6{font-size:1em;font-weight:600;color:var(--text2);margin:.3em 0 .2em}
.md p{font-size:1em;line-height:1.78;color:var(--text);margin:0 0 .5em}
.md a{color:var(--accent)}
.md strong{font-weight:600;color:var(--text)}
.md ul,.md ol{margin:0 0 .8em;padding-left:1.8em}
.md ul{list-style-type:disc}.md ol{list-style-type:decimal}
.md li{font-size:1em;line-height:1.78;color:var(--text);margin-bottom:.3em}
.md li p{margin:0 0 .3em}
.md li::marker{color:var(--accent)}
.md blockquote{border-left:3px solid var(--accent);margin:.5em 0;padding:.4em 1em;background:var(--accent-light);border-radius:0 8px 8px 0;color:var(--accent2);font-style:italic}
.md blockquote p{margin:0}
.md hr{border:none;height:1px;background:var(--border);margin:1.5em 0}
.md pre{background:#1B1D23;color:#D4D4D4;border-radius:var(--radius);padding:16px 20px;margin:.5em 0;overflow-x:auto;font-family:var(--font-mono);font-size:13px;line-height:1.65}
.md pre code{background:none;color:inherit;padding:0;font-size:inherit}
.md code{background:var(--bg2);color:var(--warn);padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:.87em}
.md .table-scroll{overflow-x:auto;margin:.5em 0;border:1px solid var(--border);border-radius:var(--radius)}
.md .table-scroll table{margin:0;border:none;border-radius:0}
.md table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;margin:.5em 0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.md thead{background:var(--bg2)}
.md th{font-family:var(--font-ui);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px;color:var(--text2);padding:10px 14px;text-align:left;border-bottom:1px solid var(--border)}
.md td{padding:10px 14px;border-bottom:1px solid var(--bg2);color:var(--text)}
.md tr:last-child td{border-bottom:none}
.md tr:hover td{background:var(--bg)}
.md th:not(:last-child),.md td:not(:last-child){border-right:1px solid var(--bg2)}

.source{background:#1B1D23;color:#D4D4D4;font-family:var(--font-mono);font-size:13px;line-height:1.7;padding:22px;border-radius:var(--radius);white-space:pre-wrap;word-break:break-word}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-l">
    <div class="tb-logo">S</div>
    <span class="tb-fname" id="fname"></span>
    <span class="tb-stats" id="stats"></span>
  </div>
  <div class="topbar-r">
    <button class="tab on" id="tab-preview" onclick="setMode('preview')">Preview</button>
    <button class="tab" id="tab-source" onclick="setMode('source')">Source</button>
    <div class="tb-sep"></div>
    <button class="btn" onclick="changeFontSize(-2)">A−</button>
    <button class="btn" onclick="changeFontSize(2)">A+</button>
    <div class="tb-sep"></div>
    <button class="btn" onclick="saveFile()">Save</button>
    <button class="btn btn-dis" id="btn-copy" onclick="copyReview()">Copy Review</button>
    <div class="tb-sep"></div>
    <button class="btn" id="btn-dark" onclick="toggleDark()">🌙 Dark</button>
  </div>
</div>
<div class="doc" id="doc"><div class="wrap" id="wrap"></div></div>
<div class="modal-bg" id="copy-modal" style="display:none" onclick="closeCopyModal()">
  <div class="modal" onclick="event.stopPropagation()">
    <div class="modal-h"><span>Copy Review</span><button class="btn" onclick="closeCopyModal()">✕</button></div>
    <div class="modal-b">
      <p style="font-size:12px;color:var(--text3);margin-bottom:8px;font-family:var(--font-ui)">Select all (⌘A) and copy (⌘C):</p>
      <textarea class="modal-ta" id="copy-text" readonly onfocus="this.select()"></textarea>
    </div>
  </div>
</div>
<script>
let markdown="",fileName="",blocks=[],userNotes=[],noteId=0,mode="preview",fontSize=16;
let isDark=window.matchMedia("(prefers-color-scheme:dark)").matches;
if(isDark)document.body.classList.add("dark");

function init(c,n){markdown=c;fileName=n;document.getElementById("fname").textContent=n;updateStats();splitBlocks();render()}
function updateStats(){const w=markdown.trim().split(/\s+/).filter(w=>w).length;document.getElementById("stats").textContent=`${w} words · ${markdown.split("\n").length} lines`}
function escH(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function escA(s){return s.replace(/'/g,"\\'").replace(/"/g,"&quot;")}

function splitBlocks(){
  blocks=[];const lines=markdown.split("\n");let cur=[],inCode=false,inList=false;
  const flush=()=>{if(cur.length&&cur.join("\n").trim()){blocks.push(cur.join("\n"))}cur=[];inList=false};
  const isLS=l=>/^[\s]*[-*+]\s+/.test(l)||/^[\s]*\d+\.\s+/.test(l);
  const isC=l=>/^[ \t]{2,}/.test(l)&&l.trim().length>0;
  for(let i=0;i<lines.length;i++){const l=lines[i];
    if(l.trim().startsWith("```")){if(inCode){cur.push(l);flush();inCode=false}else{flush();inCode=true;cur.push(l)}continue}
    if(inCode){cur.push(l);continue}
    if(/^#{1,6}\s+/.test(l)){flush();cur.push(l);flush();continue}
    if(/^[-*_]{3,}$/.test(l.trim())){flush();blocks.push(l);continue}
    if(l.trim()===""){if(inList){let n=i+1;while(n<lines.length&&lines[n].trim()==="")n++;if(n<lines.length&&(isLS(lines[n])||isC(lines[n]))){cur.push(l);continue}}if(cur.join("\n").trim())flush();continue}
    if(l.trim().startsWith("|")&&cur.length>0&&cur[cur.length-1].trim().startsWith("|")){cur.push(l);continue}
    if(l.trim().startsWith("|")&&(cur.length===0||!cur[cur.length-1].trim().startsWith("|"))){flush();cur.push(l);continue}
    if(isLS(l)){if(!inList&&cur.length>0)flush();inList=true;cur.push(l);continue}
    if(inList&&isC(l)){cur.push(l);continue}
    if(l.startsWith(">")){if(cur.length>0&&!cur[cur.length-1].startsWith(">"))flush();cur.push(l);continue}
    if(inList)flush();cur.push(l)}flush()
}
function joinBlocks(){return blocks.join("\n\n")}
function parseMd(md){
  let h=marked.parse(md,{gfm:true,breaks:false});
  h=h.replace(/<input.*?checked.*?disabled.*?>/gi,'<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;margin-right:5px;font-size:12px;vertical-align:middle;background:var(--accent);color:#fff">✓</span>');
  h=h.replace(/<input.*?disabled.*?>/gi,'<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:4px;margin-right:5px;font-size:12px;vertical-align:middle;border:2px solid var(--border2)">○</span>');
  h=h.replace(/<table>/g,'<div class="table-scroll"><table>').replace(/<\/table>/g,'</table></div>');
  return h
}

function render(){
  const w=document.getElementById("wrap");w.style.fontSize=fontSize+"px";
  if(mode==="source"){w.innerHTML=`<div class="source">${escH(markdown)}</div>`;return}
  let h="";blocks.forEach((b,i)=>{
    const notes=userNotes.filter(n=>n.bi===i);
    h+=`<div class="block" onclick="handleClick(event,${i})"><div class="block-actions"><button class="block-btn" onclick="event.stopPropagation();startEdit(${i})">✎ Edit</button><button class="block-btn" onclick="event.stopPropagation();startComment(${i})">💬 Comment</button></div><div class="md">${parseMd(b)}</div></div>`;
    notes.forEach(n=>{h+=`<div class="unote"><div class="unote-bar"></div><div style="flex:1"><span class="unote-author">You</span><span class="unote-text">${escH(n.text)}</span></div><button class="unote-x" onclick="delNote(${n.id})">✕</button></div>`});
    h+=`<div id="ci-${i}"></div>`});
  w.innerHTML=h;updCopyBtn()
}

function handleClick(e,i){if(e.target.tagName==="A"||e.target.closest(".block-actions")||e.target.closest(".unote"))return;startEdit(i)}
function startEdit(i){
  let h="";blocks.forEach((b,bi)=>{
    const notes=userNotes.filter(n=>n.bi===bi);
    if(bi===i){h+=`<div class="block-edit"><textarea id="eta" oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'">${escH(b)}</textarea><div class="block-edit-bar"><span>Esc cancel · ⌘↵ save</span><div style="display:flex;gap:6px"><button class="bsm" onclick="cancelEdit()">Cancel</button><button class="bsm bsm-a" onclick="saveEdit(${i})">Save</button></div></div></div>`}
    else{h+=`<div class="block" onclick="handleClick(event,${bi})"><div class="block-actions"><button class="block-btn" onclick="event.stopPropagation();startEdit(${bi})">✎ Edit</button><button class="block-btn" onclick="event.stopPropagation();startComment(${bi})">💬 Comment</button></div><div class="md">${parseMd(b)}</div></div>`}
    notes.forEach(n=>{h+=`<div class="unote"><div class="unote-bar"></div><div style="flex:1"><span class="unote-author">You</span><span class="unote-text">${escH(n.text)}</span></div><button class="unote-x" onclick="delNote(${n.id})">✕</button></div>`});
    h+=`<div id="ci-${bi}"></div>`});
  document.getElementById("wrap").innerHTML=h;
  const ta=document.getElementById("eta");if(ta){ta.focus();ta.style.height="auto";ta.style.height=ta.scrollHeight+"px"}
  document.onkeydown=e=>{if(e.key==="Escape"){cancelEdit();e.preventDefault()}if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)){saveEdit(i);e.preventDefault()}}
}
function saveEdit(i){const ta=document.getElementById("eta");if(ta){blocks[i]=ta.value;markdown=joinBlocks();updateStats()}document.onkeydown=null;render()}
function cancelEdit(){document.onkeydown=null;render()}

function startComment(i){
  const c=document.getElementById(`ci-${i}`);if(!c)return;
  const q=blocks[i].replace(/[#*`~\[\]()>-]/g,"").trim().split(/\s+/).slice(0,6).join(" ");
  c.innerHTML=`<div class="unote-input"><div style="width:3px;min-height:20px;border-radius:2px;background:var(--accent);flex-shrink:0"></div><input id="ni-${i}" class="unote-field" placeholder="Add your comment..." onkeydown="nKey(event,${i},'${escA(q)}')"><button class="bsm bsm-a" onclick="subNote(${i},'${escA(q)}')">Add</button><button class="bsm" onclick="canComment(${i})">Cancel</button></div>`;
  document.getElementById(`ni-${i}`).focus()
}
function nKey(e,i,q){if(e.key==="Enter")subNote(i,q);if(e.key==="Escape")canComment(i)}
function subNote(i,q){const inp=document.getElementById(`ni-${i}`);if(inp&&inp.value.trim()){userNotes.push({id:++noteId,bi:i,text:inp.value.trim(),quote:q});render()}}
function canComment(i){const c=document.getElementById(`ci-${i}`);if(c)c.innerHTML=""}
function delNote(id){userNotes=userNotes.filter(n=>n.id!==id);render()}

function setMode(m){mode=m;document.getElementById("tab-preview").className=m==="preview"?"tab on":"tab";document.getElementById("tab-source").className=m==="source"?"tab on":"tab";render()}
function changeFontSize(d){fontSize=Math.max(12,Math.min(28,fontSize+d));document.getElementById("wrap").style.fontSize=fontSize+"px"}
function toggleDark(){isDark=!isDark;document.body.classList.toggle("dark",isDark);document.getElementById("btn-dark").textContent=isDark?"☀️ Light":"🌙 Dark"}

function saveFile(){
  let name=fileName.replace(/\.[^.]+$/,"")||"document",content=markdown;
  if(userNotes.length>0){content+="\n\n---\n\n## Review Notes\n\n### Reviewer Comments\n\n";content+=userNotes.map((n,i)=>`${i+1}. > "${n.quote}"\n\n   ${n.text}`).join("\n\n")+"\n";name+="-reviewed"}
  const b=new Blob([content],{type:"text/markdown"}),u=URL.createObjectURL(b),a=document.createElement("a");
  a.href=u;a.download=name+".md";document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u)
}
function updCopyBtn(){const b=document.getElementById("btn-copy");b.className=userNotes.length>0?"btn":"btn btn-dis"}
function copyReview(){
  if(userNotes.length===0)return;
  let o=`## Softmark Review — ${fileName}\n\n### My Comments\n\n`;
  o+=userNotes.map((n,i)=>`${i+1}. > "${n.quote}"\n   ${n.text}`).join("\n\n")+"\n";
  document.getElementById("copy-text").value=o;document.getElementById("copy-modal").style.display="flex";
  setTimeout(()=>document.getElementById("copy-text").select(),100)
}
function closeCopyModal(){document.getElementById("copy-modal").style.display="none"}

// Drag & drop
document.addEventListener("dragover",e=>e.preventDefault());
document.addEventListener("drop",e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){const r=new FileReader;r.onload=ev=>init(ev.target.result,f.name);r.readAsText(f)}});

// Watch for file changes (for live reload from terminal)
let lastContent = null;
function checkFileChange() {
  // This only works if served by a local server, not file:// protocol
  // Placeholder for future live-reload support
}

// Init
const SM_CONTENT=__SOFTMARK_CONTENT__;
const SM_FILENAME=__SOFTMARK_FILENAME__;
init(SM_CONTENT,SM_FILENAME);
</script>
</body>
</html>
HTMLEOF

# Inject content (use Python to avoid sed special-char issues)
python3 - "$TMPFILE" "$FILE" "$FILENAME" << 'PYEOF'
import sys, json
tmpfile, srcfile, filename = sys.argv[1], sys.argv[2], sys.argv[3]
with open(srcfile, 'r') as f:
    content = f.read()
with open(tmpfile, 'r') as f:
    html = f.read()
html = html.replace('__SOFTMARK_CONTENT__', json.dumps(content))
html = html.replace('__SOFTMARK_FILENAME__', json.dumps(filename))
with open(tmpfile, 'w') as f:
    f.write(html)
PYEOF

# ── Open ──
if ! $FORCE_BROWSER && command -v cmux &>/dev/null && [[ -n "${CMUX_SURFACE_ID:-}" ]]; then
  # Inside cmux — open in a browser pane
  echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in cmux browser pane"
  cmux browser open "file://${TMPFILE}"
  # Notify
  cmux notify --title "Softmark" --body "Opened ${FILENAME}" 2>/dev/null || true
else
  # Fallback to default browser
  echo -e "${GREEN}✓${NC} Opening ${BOLD}${FILENAME}${NC} in browser"
  open "$TMPFILE"
fi

# Clean up after delay (give browser time to load the file)
(sleep 30 && rm -f "$TMPFILE") &
