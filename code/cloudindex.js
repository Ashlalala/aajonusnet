// Ignore emoji variation selectors so they don't break matching
const EMOJI_VS = /[\uFE0E\uFE0F]/g;

// debounce + abort management
let searchTimeout = null;
let currentSearchController = null;

// escape helper for exact‑match detection
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createResultCard(titleText, results, link) {
  const resultCard = document.createElement('div');
  resultCard.className = 'card';

  const resultTitle = document.createElement('h2');
  resultTitle.innerHTML = `<a class="result-link" href="${link}">${titleText}</a>`;
  resultCard.appendChild(resultTitle);

  if (results.length === 0) return resultCard;

  for (let result of results) {
    const p = document.createElement('p');
    p.innerHTML = result;
    resultCard.appendChild(p);
  }
  return resultCard;
}

async function performCloudSearch(query, controller) {
  const resultsDOM = document.querySelector('.results');

  try {
    const response = await fetch('code/cloudsearch.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      resultsDOM.innerHTML = '<p>Error performing search.</p>';
      return;
    }

    const data = await response.json();
    // clear old
    resultsDOM.innerHTML = '';

    // fragments for grouping
    const fragTitle   = document.createDocumentFragment();
    const fragExact   = document.createDocumentFragment();
    const fragPartial = document.createDocumentFragment();

    // count total snippets
    const totalResults = data.reduce(
      (sum, item) => sum + ((item.sn && item.sn.length) ? item.sn.length : 0), 0);

    // build regex to detect exact‐phrase highlights
    const escapedQuery = escapeRegExp(query);
    const exactRegex   = new RegExp(
      `<span class="highlight">${escapedQuery}</span>`,
      'i'
    );
    const terms = query.trim().split(/\s+/).filter(Boolean);
const urlSearchTermsExact   = encodeURIComponent(terms.join('+'));
const urlSearchTermsPartial = (terms.length > 1)
  ? encodeURIComponent(terms.join('+'))
  : urlSearchTermsExact;

data.forEach(item => {
  const { t: title, l: link, sn: snippets = [] } = item;

  if (snippets.length === 0) {
    // title-only
    fragTitle.appendChild(createResultCard(title, [], link));
  } else {
    // decide exact vs partial by looking for the full phrase highlight
    const isExact = snippets.some(s => exactRegex.test(s));
    const sParam  = isExact ? urlSearchTermsExact : urlSearchTermsPartial;

    const snippetStrings = snippets.map(htmlSnippet => {
      const tmp = document.createElement('div');
      tmp.innerHTML = htmlSnippet;
      const snippetText = tmp.textContent || tmp.innerText || '';
      return `<a class="result-link" href="${link}?s=${sParam}&search=${encodeURIComponent(snippetText)}">${htmlSnippet}</a><br><br><hr>`;
    });

    if (isExact) {
      fragExact.appendChild(createResultCard(title, snippetStrings, link));
    } else {
      fragPartial.appendChild(createResultCard(title, snippetStrings, link));
    }
  }
});

    // 1) total summary
    const summary = document.createElement('p');
    summary.className = 'results-summary';
    summary.textContent = `There are ${totalResults} results.`;
    resultsDOM.appendChild(summary);

    // 2) title matches
    resultsDOM.appendChild(fragTitle);

    // 3) exact matches
    resultsDOM.appendChild(fragExact);

    // 4) partial heading (if needed)
    if (fragPartial.childElementCount > 0) {
      const header = document.createElement('p');
      header.style.fontStyle = 'italic';
      header.style.margin    = '20px 0 10px';
      header.textContent     = 'Partial matches:';
      resultsDOM.appendChild(header);
    }

    // 5) partial matches
    resultsDOM.appendChild(fragPartial);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Error during cloud search:', err);
    document.querySelector('.results').innerHTML = '<p>Error performing search.</p>';
  }
}

function search(input) {
  // strip emoji variation selectors, then lowercase (like index.js)
  const raw = input.value.replace(EMOJI_VS, '').toLowerCase();
  const searchValue = raw;
  const trimmedSearchValue = searchValue.trim();

  const catBar     = document.querySelector('.categories');
  const grid       = document.querySelector('.grid');
  const resultsDOM = document.querySelector('.results');

  resultsDOM.innerHTML = '';
  document.getElementById('clear-icon').style.display =
    searchValue.length > 0 ? 'block' : 'none';

  const words = searchValue.split(/\s+/).filter(Boolean);

  const isAl = /^[a-z]+$/i;
  const hasValidToken = words.some(word => (!isAl.test(word) || word.length >= 3));

  if (!hasValidToken) {
    grid.style.display = 'block';
    resultsDOM.style.display = 'none';
    if (catBar) catBar.style.display = 'flex';
    if (currentSearchController) currentSearchController.abort();
    return;
  }

  if (catBar) catBar.style.display = 'none';
  grid.style.display = 'none';
  resultsDOM.style.display = 'block';
  resultsDOM.innerHTML = '<p>Searching…</p>';

  // debounce + abort (same as before)
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (currentSearchController) currentSearchController.abort();
    currentSearchController = new AbortController();
    // send the trimmed query to backend
    performCloudSearch(trimmedSearchValue, currentSearchController);
  }, 300);
}


function clearSearch() {
    const searchInput = document.getElementById('search');
    searchInput.value = '';
    search(searchInput);
    document.getElementById('clear-icon').style.display = 'none';
    searchInput.focus();
}

function goBack() {
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
		search(searchInput) // may be not needed
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

function filterCategory(category, sanitizedCategory, element) {
  // Deselect all categories
  event.preventDefault();
  const categories = document.querySelectorAll('.categories a');
  for (let i = 0; i < categories.length; i++) {
    categories[i].classList.remove('chosen-category');
  }

  // Clear search input
  const searchInput = document.getElementById('search');
  searchInput.value = '';
  search(searchInput);


  // Select the clicked category
  element.classList.add('chosen-category');

  const cards = document.getElementsByClassName('card-md');
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const cardCategory = card.getElementsByClassName('category')[0].innerText;

    if (category === 'All' || cardCategory.startsWith(category)) {
      card.style.display = '';
    } else {
      card.style.display = 'none';
    }
  }

  const notFoundMessage = document.getElementById('not-found');
  if (notFoundMessage) {
    notFoundMessage.style.display = 'none';
  }

  // Update URL without reloading the page
  if (category === 'All') {
    window.history.replaceState({}, '', '/');
  } else {
    window.history.replaceState({}, '', `/${sanitizedCategory}/`);
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const input = document.getElementById('search');
  input.disabled = false;
  input.placeholder = 'Search';
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