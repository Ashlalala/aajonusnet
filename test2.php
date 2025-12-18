<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" />
<title>Find‑on‑Page overlay (top layout)</title>
<style>
 :root{--bg:#121212;--panel:#2c2c2e;--text:#e3e3e3;--accent:#ffe54c;--accent-strong:#ff8c00;}
 body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin:0;padding:1.5rem;background:var(--bg);color:var(--text);line-height:1.55;}
 h1{font-weight:600;margin-top:4rem;margin-bottom:1rem;}p{max-width:65ch;margin:0 0 1rem;}
 /* —— overlay —— */
 #find-box{position:fixed;top:0;left:0;right:0;margin:0 auto;padding:0.6rem 0.7rem;display:grid;grid-template-columns:auto 1fr auto auto auto;align-items:center;gap:0.45rem;background:var(--panel);border-radius:0 0 0.9rem 0.9rem;box-shadow:0 4px 12px rgba(0,0,0,.45);z-index:9999;touch-action:none;}#find-box[hidden]{display:none;}
 #find-box input{width:100%;background:#000;border:none;color:#fff;padding:0.4rem 0.65rem;font-size:1rem;border-radius:0.4rem;outline:none;}
 #find-count{min-width:4.2rem;text-align:center;font-size:0.8rem;}
 #find-box button{background:none;border:none;color:#fff;font-size:1.1rem;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0 0.35rem;-webkit-tap-highlight-color:transparent;touch-action:manipulation;user-select:none;}
 #find-box button:hover{color:var(--accent);}#find-prev,#find-next{font-size:1.2rem;}
 mark{background:var(--accent);color:#000;padding:0 0.06em;border-radius:0.18em;}mark.current{outline:2px solid var(--accent-strong);} 
</style>
</head>
<body>
<div id="find-box" hidden>
  <button id="find-close" aria-label="Close">✕</button>
  <input id="find-input" placeholder="Find…" aria-label="Find in page" autocomplete="off" />
  <span id="find-count">0 / 0</span>
  <button id="find-prev" aria-label="Previous">▲</button>
  <button id="find-next" aria-label="Next">▼</button>
</div>

<main id="content">
  <h1>Find‑on‑Page overlay (pure JS)</h1>
  <p>Tap ⌘F / Ctrl‑F or double‑tap anywhere to open the search bar. The bar now stays pinned at the top of the screen and no longer jumps around with the virtual keyboard.</p>
  <script>document.write([...Array(40)].map((_,i)=>`<p>Paragraph ${i+1}: Raw milk, raw honey and raw butter appear in raw primal diets. Try searching the digit 1 or the word raw multiple times to test highlighting.</p>`).join(''));</script>
</main>

<script>
/* ===== simple highlighter (on #content only) ===== */
const container=document.getElementById('content');
function unmark(){container.querySelectorAll('mark').forEach(m=>{m.replaceWith(document.createTextNode(m.textContent));});container.normalize();}
function markAll(term){
  if(!term) return;
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node){
      const tag = node.parentNode.tagName;
      return (/SCRIPT|STYLE|NOSCRIPT/.test(tag)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    const txt = n.nodeValue;
    let last = 0, m, frag = null;
    while((m = rx.exec(txt))){
      frag ??= document.createDocumentFragment();
      const before = txt.slice(last, m.index);
      if(before) frag.append(before);
      const mk = document.createElement('mark');
      mk.textContent = m[0];
      frag.append(mk);
      last = m.index + m[0].length;
    }
    if(!frag) return;
    const after = txt.slice(last);
    if(after) frag.append(after);
    n.replaceWith(frag);
  });
}
/* ===== overlay logic ===== */
const box=document.getElementById('find-box');const input=document.getElementById('find-input');
const count=document.getElementById('find-count');const prev=document.getElementById('find-prev');const next=document.getElementById('find-next');const close=document.getElementById('find-close');
let hits=[],idx=0;
function status(){count.textContent=hits.length?`${idx+1} / ${hits.length}`:'0 / 0';}
function focus(){hits[idx]?.scrollIntoView({block:'center'});hits.forEach(h=>h.classList.remove('current'));hits[idx]?.classList.add('current');status();}
function search(q){unmark();hits=[];idx=0;if(!q){status();return;}markAll(q);hits=[...container.querySelectorAll('mark')];if(hits.length)focus();else status();}
function step(dir){if(!hits.length)return;idx=(idx+dir+hits.length)%hits.length;focus();input.focus({preventScroll:true});}
input.addEventListener('input',()=>search(input.value.trim()));next.addEventListener('click',()=>step(1));prev.addEventListener('click',()=>step(-1));
close.addEventListener('click',()=>{box.hidden=true;unmark();hits=[];status();input.blur();});
/* open overlay */
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='f'){e.preventDefault();box.hidden=false;setTimeout(()=>input.select(),0);}else if(e.key==='Enter'&&document.activeElement===input){step(1);} });
let lastTap=0;document.addEventListener('touchend',e=>{if(e.target.closest('#find-box'))return;const now=Date.now();if(now-lastTap<400){box.hidden=false;input.focus({preventScroll:true});}lastTap=now;});
</script>
</body>
</html>
