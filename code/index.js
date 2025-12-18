const EMOJI_VS = /[\uFE0E\uFE0F]/g; // Ignore emoji variation selector

// NEW: worker-based search state
let searchWorker = null;
let searchSeq = 0;
let lastPendingQuery = null;

// Rendering state for streamed batches
let renderState = {
  seq: 0,
  queue: [],
  raf: 0,
  results_DOM: null,
  exactFrag: null,
  partialFrag: null,
  totalResults: 0,
  urlSearchTermsExact: '',
  urlSearchTermsPartial: null,
  exactSection: null,
  partialSection: null,
  partialHeadingEl: null,
  partialHeadingShown: false,
  summaryEl: null,
};

const CARDS = document.getElementsByClassName('card-md');

// Map dataId -> { card, title, link }
const cardIndex = new Map();

function buildCardIndex() {
  if (cardIndex.size) return;
  for (let i = 0; i < CARDS.length; i++) {
    const card = CARDS[i];
    const h2 = card.querySelector('h2');
    const titleText = h2 ? h2.textContent : '';
    const title = titleText.toLowerCase();
    const link = card.querySelector('.read-more').href;
    const dataId = card.dataset.id;
    cardIndex.set(dataId, { card, title, titleText, link });
  }
}

function initSearchWorker() {
  if (searchWorker) {
    // refresh docs on re-init (e.g., after cache reset)
    const docs = [];
    cardIndex.forEach((v, id) => {
      const entry = articleData[id];
      if (entry && entry.text) docs.push({ id, text: entry.text, title: v.title });
    });
    try { searchWorker.postMessage({ type: 'init', docs }); } catch {}
    return;
  }

  searchWorker = new Worker('/code/localsearch.js');
searchWorker.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'ready') {
    if (lastPendingQuery) {
      try { searchWorker.postMessage(lastPendingQuery); } catch {}
      lastPendingQuery = null;
    }
    return;
  }
  if (msg.type === 'reset') {
		if (msg.seq !== searchSeq) return;
    startNewRender(msg.seq, msg.searchValue, msg.words, msg.trimmedSearchValue);
    return;
  }
  if (msg.type === 'batch') {
		if (msg.seq !== searchSeq) return;
    enqueueRenderItems(msg.seq, msg.results);
    return;
  }
  if (msg.type === 'done') {
		if (msg.seq !== searchSeq) return;
    finishRender(msg.seq, msg.totalResults);
    return;
  }
};


  const docs = [];
  cardIndex.forEach((v, id) => {
    const entry = articleData[id];
    if (entry && entry.text) docs.push({ id, text: entry.text, title: v.title });
  });
  searchWorker.postMessage({ type: 'init', docs });
}


async function search(input) {
  const catBar = document.querySelector('.categories');
  const grid = document.querySelector('.grid');
  const results_DOM = document.querySelector('.results');

  const searchValue = input.value.replace(EMOJI_VS, '').toLowerCase();
  const trimmedSearchValue = searchValue.trim();
  const words = searchValue.split(/\s+/).filter(word => word);

  document.getElementById('clear-icon').style.display = searchValue.length > 0 ? 'block' : 'none';

  const isAl = /^[a-z]+$/i;
  const hasValidToken = words.some(word => (!isAl.test(word) || word.length >= 3));

  if (!hasValidToken) {
    grid.style.display = 'block';
    results_DOM.style.display = 'none';
    catBar.style.display = '';
    results_DOM.innerHTML = '';
    return;
  }
  
  catBar.style.display = 'none';
  grid.style.display = 'none';
  results_DOM.style.display = 'block';

  // ensure indexes and worker are ready
  buildCardIndex();
  if (!searchWorker) initSearchWorker();

  // bump sequence so any in-flight query becomes stale
  const seq = ++searchSeq;
  const queryMsg = { type: 'query', seq, searchValue, trimmedSearchValue, words };

  try {
    searchWorker.postMessage(queryMsg);
  } catch {
    // worker not ready yet; queue it
    lastPendingQuery = queryMsg;
  }
}

function startNewRender(seq, searchValue, words, trimmedSearchValue) {
  renderState.seq = seq;
  renderState.queue = [];
  if (renderState.raf) cancelAnimationFrame(renderState.raf);
  renderState.raf = 0;

  const results_DOM = document.querySelector('.results');
  if (!results_DOM) return;
  renderState.results_DOM = results_DOM;

  // Clear fast; show searching
  results_DOM.innerHTML = '';
  const summary = document.createElement('p');
  summary.className = 'results-summary';
  summary.textContent = 'Searching…';
  results_DOM.appendChild(summary);

  renderState.summaryEl = summary;

  renderState.exactFrag = document.createDocumentFragment();
  renderState.partialFrag = document.createDocumentFragment();
	

renderState.exactSection = document.createElement('div');
renderState.partialSection = document.createElement('div');


const heading = document.createElement('p');
heading.className = 'partial-heading';
heading.style.display = 'none';
heading.textContent = 'Partial matches:';
renderState.partialHeadingEl = heading;
renderState.partialHeadingShown = false;

  renderState.totalResults = 0;
  renderState.urlSearchTermsExact = encodeURIComponent(searchValue.split(" ").join('+'));
  renderState.urlSearchTermsPartial = (words.length > 1) ? encodeURIComponent(words.join('+')) : null;

  // Do title-only matches synchronously (cheap)
  const titleWords = (trimmedSearchValue || '').split(/\s+/).filter(Boolean);
  if (titleWords.length) {
    const fragmentTitle = document.createDocumentFragment();
    let titleMatchCount = 0;
    cardIndex.forEach(({ card, title, titleText, link }) => {
      if (titleWords.every(w => title.includes(w))) {
        fragmentTitle.appendChild(createResultCard(titleText, [], link));
        titleMatchCount++;
      }
    });
    results_DOM.appendChild(fragmentTitle);
    renderState.totalResults = titleMatchCount;
  }
results_DOM.appendChild(renderState.exactSection);
results_DOM.appendChild(heading);
results_DOM.appendChild(renderState.partialSection);
}

function enqueueRenderItems(seq, items) {
  if (seq !== renderState.seq) return; // stale
  renderState.queue.push(...items);
  if (!renderState.raf) {
    renderState.raf = requestAnimationFrame(flushRenderQueue);
  }
}

function commitFrags() {
  if (renderState.exactFrag && renderState.exactFrag.childNodes.length) {
    renderState.exactSection.appendChild(renderState.exactFrag);
    renderState.exactFrag = document.createDocumentFragment();
  }
  if (renderState.partialFrag && renderState.partialFrag.childNodes.length) {
    if (!renderState.partialHeadingShown && renderState.partialHeadingEl) {
      renderState.partialHeadingEl.style.display = '';
      renderState.partialHeadingShown = true;
    }
    renderState.partialSection.appendChild(renderState.partialFrag);
    renderState.partialFrag = document.createDocumentFragment();
  }
}

function processQueueItem(r) {
  const idx  = cardIndex.get(r.id);
  if (!idx) return;
  const link = idx.link;

  const makeCard = (strings) => createResultCard(idx.titleText, strings, link);

  if (r.exact && r.exact.length) {
    const exactStrings = r.exact.map(item =>
      `<a class='result-text' href="${link}?s=${renderState.urlSearchTermsExact}&search=${item.frag}">${item.html}</a><hr>`
    );
    renderState.exactFrag.appendChild(makeCard(exactStrings));
    renderState.totalResults += r.exact.length;
  }
  if (r.partial && r.partial.length) {
    const partialStrings = r.partial.map(item =>
      `<a class='result-text' href="${link}?s=${renderState.urlSearchTermsPartial}&search=${item.frag}">${item.html}</a><hr>`
    );
    renderState.partialFrag.appendChild(makeCard(partialStrings));
    renderState.totalResults += r.partial.length;
  }
}

function flushRenderQueue() {
  renderState.raf = 0;
  if (!renderState.results_DOM) return;

  const start = performance.now();
  const BUDGET_MS = 12; // keep under a frame
  let processed = 0;

while (renderState.queue.length && (performance.now() - start) < BUDGET_MS) {
  const r = renderState.queue.shift();
  processQueueItem(r);

  if (++processed % 5 === 0) {
    commitFrags();
  }
}
  // update summary progressively
if (renderState.summaryEl) {
  const txt = `There ${renderState.totalResults === 1 ? 'is 1 result' : `are ${renderState.totalResults} results`}.`;
  if (renderState.summaryEl.textContent !== txt) renderState.summaryEl.textContent = txt;
}

  // Keep going next frame if there’s more
  if (renderState.queue.length) {
    renderState.raf = requestAnimationFrame(flushRenderQueue);
  }
}

function finishRender(seq, totalResultsFromWorker) {
  if (seq !== renderState.seq || !renderState.results_DOM) return;

  if (renderState.queue.length) {
    const SMALL_QUEUE = 50; // tune
    if (renderState.queue.length <= SMALL_QUEUE) {
      // small: drain now (keeps "tiny" searches instant)
      while (renderState.queue.length) processQueueItem(renderState.queue.shift());
    } else {
      // large: let rAF handle it to keep typing smooth
      if (!renderState.raf) renderState.raf = requestAnimationFrame(flushRenderQueue);
    }
  }
  commitFrags();

  const total = totalResultsFromWorker ?? renderState.totalResults;
  if (renderState.summaryEl) renderState.summaryEl.textContent = `There ${total === 1 ? 'is 1 result' : `are ${total} results`}.`;
}



function createResultCard(titleText, results, link) {
    // Create a new card for the search result
    const resultCard = document.createElement('div');
    resultCard.className = 'card';

    const resultTitle = document.createElement('h2');
    resultTitle.innerHTML = `<a class="result-title" href="${link}">${titleText}</a>`;
    resultCard.appendChild(resultTitle);

    if (results.length == 0) {
        return resultCard;
    }

    for (let result of results) {
    resultCard.insertAdjacentHTML('beforeend', result);
        /*const resultContent = document.createElement('p');
        resultContent.innerHTML = result;
        resultCard.appendChild(resultContent);*/
    }

    return resultCard;
}

function clearSearch() {
    const searchInput = document.getElementById('search');
    searchInput.value = '';
    search(searchInput);
    document.getElementById('clear-icon').style.display = 'none';
    searchInput.focus();
}

function goBack(ev) {
    if (ev) ev.preventDefault();
    if (document.referrer == "" || document.referrer.indexOf(window.location.hostname) < 0 || window.history.length <= 1) {
        // There is no previous page, go to the homepage
        window.location.href = '/';
    } else {
        // There is a previous page in the history stack, go back to it
        window.history.back();
    }
}

window.onload = function() {
	const searchInput = document.getElementById('search');
	if (searchInput){
		searchInput.focus();
        searchInput.addEventListener('keyup', function(event) {
            // Key code 13 is the "Return" key
            if (event.keyCode === 13) {
                // Remove focus to close the keyboard
                searchInput.blur();
            }
        });
	}
};

function scrollToElement(element) {
	const viewHeight = window.innerHeight;
	const elementPosition = element.getBoundingClientRect().top;
	const scrollPosition = elementPosition - (viewHeight / 2);
	window.scrollBy({
		top: scrollPosition,
		behavior: 'smooth'
     });
}
function scrollToPosition() {
    const element = document.getElementById("scrollToThis");
    if (element) {
        scrollToElement(element);
        return;
    }
    const specialBlocks = document.querySelectorAll("code, pre");
    for (let block of specialBlocks) {
        const index = block.textContent.indexOf('<span id="scrollToThis"></span>');
        if (index !== -1) {
            scrollToElement(block);
            // Remove the <span id="scrollToThis"></span> from the text content
            block.textContent = block.textContent.replace('<span id="scrollToThis"></span>', '');
            return;
         }
     }
}
scrollToPosition();

const articleRoot = document.querySelector('.content');
if (articleRoot) {
  document.body.addEventListener('click', function(e) {
    let target = e.target;
    
    // Traverse up to find the anchor tag
    while (target && target.tagName !== 'A') {
        target = target.parentNode;
    }
    
    // If an anchor tag is found and it matches the criteria
    if (target && /\.(jpg|png|gif)$/.test(target.href)) {
        e.preventDefault();
        const imgSrc = target.href;
        const previewDiv = document.createElement('div');
        previewDiv.className = 'image-preview';
        const img = document.createElement('img');
        img.src = imgSrc;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '10px auto';
        img.style.border = '1px solid #ddd';
        previewDiv.appendChild(img);

        // Toggle the image preview
        if (target.nextElementSibling && target.nextElementSibling.className === 'image-preview') {
            target.parentNode.removeChild(target.nextElementSibling);
        } else {
            target.parentNode.insertBefore(previewDiv, target.nextSibling);
        }
    }
  });
}

function filterCategory(ev, category, sanitizedCategory, element) {
  if (ev) ev.preventDefault();
  // Deselect all categories
  document.querySelectorAll('.categories a.chosen-category')
    .forEach(a => a.classList.remove('chosen-category'));
  // Select the category
  element.classList.add('chosen-category');

  // Clear search input
  const searchInput = document.getElementById('search');
  searchInput.value = '';
  const clearIcon = document.getElementById('clear-icon');
  if (clearIcon) clearIcon.style.display = 'none';

  const showAll = category === 'All';

  for (let i = 0; i < CARDS.length; i++) {
    const card = CARDS[i];
    const cardCategory = card.getElementsByClassName('category')[0].textContent;

    if (showAll || cardCategory.startsWith(category)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  }
  // Update URL without reloading the page
  window.history.replaceState({}, '', showAll ? '/' : `/${sanitizedCategory}/`);
}

document.addEventListener("DOMContentLoaded", function() {
  const removeHighlightsBtn = document.getElementById("removeHighlights");
  
  if (removeHighlightsBtn) {
    removeHighlightsBtn.addEventListener("click", function() {
        removeHighlights();
    });
    document.querySelectorAll("code, pre").forEach(el => {
        el.innerHTML = el.innerHTML.replace(/&lt;span class="highlight"&gt;(.*?)&lt;\/span&gt;/g, '<span class="highlight">$1</span>');
    });
  }
});

function removeHighlights() {
      const removeHighlightsBtn = document.getElementById("removeHighlights");
      if (!removeHighlightsBtn) {
          return;
      }
      // Remove highlights
      const highlighted = document.querySelectorAll(".highlight");
      for (let i = 0; i < highlighted.length; i++) {
        highlighted[i].outerHTML = highlighted[i].innerHTML;
      }

      // Hide the "X Remove Highlights" button
      removeHighlightsBtn.style.display = "none";
  
      // Update URL
      let url = window.location.href;
      url = url.split('?')[0];
      window.history.replaceState({}, '', url);
}

function shareArticle() {
    const url = window.location.href;

    // Check if Web Share API is supported
    if (navigator.share) {
        navigator.share({
            title: document.title,
            url: url
        }).then(() => {
            console.log("Successfully shared.");
        }).catch((error) => {
            console.log("Error sharing:", error);
        });
    } else {
      // Fallback to copying URL to clipboard
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("Copy");
      textArea.remove();
      alert("URL copied to clipboard.");
    }
}

// Open or create the database
let db;
const openRequest = indexedDB.open("myDatabase", 1);

openRequest.onupgradeneeded = function(event) {
  db = event.target.result;
  db.createObjectStore("myData", { keyPath: "id" });
};

openRequest.onsuccess = function(event) {
  db = event.target.result;
  // Now that the database is open, load the content
  // Start once, but only after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContentAsync, { once: true });
  } else {
    loadContentAsync();
  }
};

openRequest.onerror = function(event) {
  console.error("Error opening IndexedDB:", event);
};

let hasRetried = false;

// Global variable to store data
let articleData = {};

function populateAndEnableSearch(data) {
    try {
        const tempDiv = document.createElement('div');
        
        // Populate articleData with parsed HTML content
        Object.keys(data).forEach(id => {
            tempDiv.innerHTML = data[id];
            articleData[id] = {
                html: data[id],
                text: tempDiv.textContent.toLowerCase()
            };
        });
        const searchEl = document.getElementById("search");
        searchEl.disabled = false;
        searchEl.placeholder = "Search";
        search(searchEl); // Initiate search if necessary
        hasRetried = false;
        buildCardIndex();
        initSearchWorker();
    } catch (error) {
        console.error("Error:", error);
        if (!hasRetried) { // Reset the cache
            hasRetried = true;
            const transaction = db.transaction(["myData"], "readwrite");
            transaction.objectStore("myData").delete("allData");
            loadContentAsync();
        }
    }
}

// Store entire dataset in IndexedDB with expiration time
function storeAllData(data) {
  const expireTime = new Date().getTime() + 24 * 60 * 60 * 1000; // 24 hours from now
  const transaction = db.transaction(["myData"], "readwrite");
  const objectStore = transaction.objectStore("myData");
  objectStore.put({ id: "allData", content: data, expireTime: expireTime });
}

// Retrieve entire dataset from IndexedDB, checking for expiration
function retrieveAllData(callback) {
  const transaction = db.transaction(["myData"], "readonly");
  const objectStore = transaction.objectStore("myData");
  const request = objectStore.get("allData");

  request.onsuccess = function(event) {
    const currentTime = new Date().getTime();
    if (request.result && request.result.expireTime > currentTime) {
      callback(request.result.content);
    } else {
      const delTransaction = db.transaction(["myData"], "readwrite");
    delTransaction.objectStore("myData").delete("allData");
      callback(null);
    }
  };
}

function getCachedData() {
  return new Promise(resolve => retrieveAllData(resolve));
}

async function loadContentAsync() {
  const searchEl = document.getElementById('search');
  if (!searchEl) return;
  searchEl.disabled = true;
  searchEl.placeholder = 'Loading...';

  const cached = await getCachedData();
  if (cached) {
    populateAndEnableSearch(cached);
    return;
  }

  searchEl.placeholder = 'Loading... 0%';

  const response = await fetch('/code/loadsearch.php');

  const total = parseInt(
    response.headers.get('X-Total-Uncompressed-Length'),
    10
  );

  const reader  = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let raw = '';
  let loaded  = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    loaded += chunk.length;

    const pct = Math.min(100, Math.round((loaded / total) * 100));
    searchEl.placeholder = `Loading... ${pct}%`;
  }

  const data = JSON.parse(raw);
  storeAllData(data);
  populateAndEnableSearch(data);
}