let docs = []; // [{ id, text, title }]
let activeSeq = 0;

const BATCH_DOCS = 25; // how many cards per message
const MAX_WINDOW = 200; // Maximum number of characters to display before and after the search value

self.onmessage = ({ data:msg }) => {
  if (msg.type === 'init') {
    docs = msg.docs || [];
    self.postMessage({ type: 'ready' });
    return;
  }
  if (msg.type === 'query') {
    activeSeq = msg.seq;
    runQuery(msg).catch(() => { /* ignore */ });
  }
};

async function runQuery({ seq, searchValue, trimmedSearchValue, words }) {
  const partial = words.length > 1;

  const exactRegex = new RegExp(`(${escapeRegExp(searchValue)})`, 'gi');
  const partialRegex = partial ? new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi') : null;
  const titleWords = trimmedSearchValue.split(/\s+/).filter(Boolean);

  let totalResults = 0;
  // tell main thread to reset UI for this seq
  self.postMessage({ type: 'reset', seq, searchValue, trimmedSearchValue, words });

  const batch = [];

  for (let i = 0; i < docs.length; i++) {
    if (seq !== activeSeq) return; // cancelled

    const { id, text, title } = docs[i];
    const [exact, partials] = findMatches(text, searchValue, words, MAX_WINDOW, exactRegex, partialRegex);
    const titleMatch = titleWords.length > 0 && titleWords.every(w => title.includes(w));

    if (titleMatch || exact.length || partials.length) {
      batch.push({ id, exact, partial: partials, titleMatch });
      totalResults += exact.length + partials.length;
    }

    if (batch.length >= BATCH_DOCS) {
      self.postMessage({ type: 'batch', seq, results: batch.splice(0) });
      await sleep(0); // yield so keystrokes can be processed
      if (seq !== activeSeq) return; // cancelled
    }

    if (i % 50 === 0) await sleep(0); // periodic yield during scanning
  }

  if (batch.length) {
    self.postMessage({ type: 'batch', seq, results: batch.splice(0) });
  }
  self.postMessage({ type: 'done', seq, totalResults });
}


function findMatches(text, searchValue, words, maxLength, exactRegex, partialRegex) {
  const wantPartial = words.length > 1;
  const exactMatches = [];
  const partialMatches = [];
  let lastWindowEnd = 0;

  for (let wi = 0; wi < words.length; wi++) {
    const word = words[wi];
    let offset = text.indexOf(word);
    while (offset !== -1) {
      let start = Math.max(0, offset - maxLength);
      if (start < lastWindowEnd) start = lastWindowEnd;
      let end = Math.min(text.length, start + (maxLength * 2));

      // UTF-16 surrogate safety (emoji)
      if (start > 0 && isLow(text.charCodeAt(start))) start--;
      if (end < text.length && isHigh(text.charCodeAt(end - 1))) end++;

      const windowText = text.substring(start, end);
      const exactPos = windowText.indexOf(searchValue);
      const hasAll = wantPartial && words.every(w => windowText.indexOf(w) !== -1);

      if (exactPos !== -1) {
        const html = highlightTerms(windowText, exactRegex);
        exactMatches.push({ frag: encodeURIComponent(windowText), html });
      } else if (hasAll) {
        const html = highlightTerms(windowText, partialRegex);
        partialMatches.push({ frag: encodeURIComponent(windowText), html });
      }

      lastWindowEnd = end;
      offset = text.indexOf(word, offset + 1);
    }
  }

  return [exactMatches, partialMatches];
}

function highlightTerms(text, regex) {
  return text.replace(regex, '<span class="highlight">$1</span>');
}
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function isHigh(cp) { return cp >= 0xD800 && cp <= 0xDBFF; }
function isLow(cp)  { return cp >= 0xDC00 && cp <= 0xDFFF; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
