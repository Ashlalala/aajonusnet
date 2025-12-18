<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Standalone Find‑on‑Page demo (no external libs)</title>
  <style>
    /* Layout / text */
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5;background:#121212;color:#e3e3e3;margin:0;padding:2rem;}
    h1{font-weight:600;margin-top:0;margin-bottom:1rem;}
    p{max-width:65ch;text-wrap:pretty;margin:0 0 1rem 0;}

    /* Overlay */
    #find-box{position:fixed;top:0.75rem;right:0.75rem;display:flex;align-items:center;gap:0.4rem;background:#222;padding:0.5rem 0.6rem;border-radius:0.6rem;box-shadow:0 2px 6px rgba(0,0,0,.35);} 
    #find-box[hidden]{display:none;}
    #find-box input{background:#000;border:none;color:#fff;padding:0.25rem 0.5rem;font-size:0.9rem;width:10rem;border-radius:0.25rem;outline:none;}
    #find-count{font-size:0.75rem;}
    #find-box button{background:none;border:none;color:#fff;font-size:0.9rem;cursor:pointer;line-height:1;display:grid;place-items:center;}
    #find-box button:hover{color:#ffdf6e;}

    /* Highlight */
    mark{background:#ffe54c;color:#000;padding:0 0.1em;border-radius:0.15em;}
    mark.current{outline:2px solid #ff8c00;}
  </style>
</head>
<body>
  <h1>Find‑on‑Page overlay demo (pure JS)</h1>
  <p>Lorem ipsum dolor sit amet, <strong>raw</strong> primal diet advocates eating <em>raw</em> meat and dairy. This paragraph repeats the word raw several times to give the search engine something to highlight. Raw honey and raw butter are staples of the plan.</p>
  <p>Another paragraph mentions Raw foods again. Raw milk straight from the cow, raw cheese, and raw eggs are consumed without cooking.</p>
  <p>Non‑related text: The quick brown fox jumps over the lazy dog. “Sphinx of black quartz, judge my vow.” These pangrams help fill the page.</p>

  <!-- Search overlay -->
  <div id="find-box" hidden>
    <input id="find-input" placeholder="Find…" aria-label="Find in page" />
    <span id="find-count">0</span>
    <button id="find-prev" title="Previous result">▲</button>
    <button id="find-next" title="Next result">▼</button>
    <button id="find-close" title="Close search">✕</button>
  </div>

<script>
/* ========= minimal highlighter ========== */
function unmark(container=document.body){
  container.querySelectorAll('mark').forEach(m=>{
    const parent=m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent),m);
    parent.normalize();
  });
}

function mark(container, term){
  if(!term) return;
  const walk=document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi');
  let node;
  while((node=walk.nextNode())){
    const txt=node.nodeValue;
    const frag=document.createDocumentFragment();
    let last=0, changed=false;
    txt.replace(regex,(match,offset)=>{
      changed=true;
      const before=txt.slice(last,offset);
      if(before) frag.appendChild(document.createTextNode(before));
      const markEl=document.createElement('mark');
      markEl.textContent=match;
      frag.appendChild(markEl);
      last=offset+match.length;
      return match;
    });
    if(!changed) continue;
    const after=txt.slice(last);
    if(after) frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag,node);
  }
}
/* ========= UI glue ========= */
const ctx=document.body;
const box=document.getElementById('find-box');
const input=document.getElementById('find-input');
const count=document.getElementById('find-count');
const prevBtn=document.getElementById('find-prev');
const nextBtn=document.getElementById('find-next');
const closeBtn=document.getElementById('find-close');
let hits=[],idx=0;
function updateStatus(){count.textContent=hits.length?`${idx+1} / ${hits.length}`:'0';}
function focusHit(){
  hits[idx]?.scrollIntoView({block:'center'});
  hits.forEach(h=>h.classList.remove('current'));
  hits[idx]?.classList.add('current');
  updateStatus();
}
function runSearch(q){
  unmark(ctx);
  hits=[]; idx=0;
  if(!q){updateStatus();return;}
  mark(ctx,q);
  hits=Array.from(ctx.querySelectorAll('mark'));
  if(hits.length){focusHit();}else{updateStatus();}
}
input.addEventListener('input',()=>runSearch(input.value.trim()));
nextBtn.addEventListener('click',()=>{if(!hits.length)return;idx=(idx+1)%hits.length;focusHit();});
prevBtn.addEventListener('click',()=>{if(!hits.length)return;idx=(idx+hits.length-1)%hits.length;focusHit();});
closeBtn.addEventListener('click',()=>{box.hidden=true;unmark(ctx);hits=[];updateStatus();});

document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key==='f'){
    e.preventDefault();
    box.hidden=false;
    setTimeout(()=>input.select(),0);
  }
});
// double‑tap to open (for touch)
let lastTap=0;
ctx.addEventListener('touchend',e=>{
  const now=Date.now();
  if(now-lastTap<400){box.hidden=false;input.focus();}
  lastTap=now;
});
</script>
</body>
</html>
