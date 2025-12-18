<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// 1) Read the raw query (preserve spaces)
if (isset($_GET['search'])) {
    $searchValue = strtolower($_GET['search']);
} else {
    $inputJSON   = file_get_contents('php://input');
    $data        = json_decode($inputJSON, true);
    $searchValue = isset($data['query']) ? strtolower($data['query']) : '';
}

// 2) Tokenize and filter out “the”
$words = preg_split('/\s+/', $searchValue);
$words = array_filter($words, fn($w) => $w !== '' && $w !== 'the');

// If all words are < 3 chars, return empty JSON array
if (empty($words) || array_reduce($words, fn($c,$w)=> $c && strlen($w) < 3, true)) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([], JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

$validWords = array_filter($words, fn($w) => strlen($w) >= 3);
$maxLength  = 200;

// ----------------------------------------------------------------------
// 3) Build article list by scanning the "md" folder
// ----------------------------------------------------------------------

// Loads: $mdFolder, $prioritizeCategories, categoryinLinks
require_once dirname(__DIR__) . '/config.php';
$mdFolder = dirname(__DIR__) . '/' . $mdFolder;

$articles              = [];

$it = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($mdFolder, FilesystemIterator::SKIP_DOTS)
);
foreach ($it as $file) {
    if ($file->isDir()) continue;
    $path   = $file->getPathname();
    $name   = $file->getBasename('.md');
    $catDir = dirname($path) === $mdFolder
            ? 'other'
            : ltrim(str_replace([$mdFolder, "\\"], ['', '/'], dirname($path)), '/');

    // build link (toggle $categoryInLinks if desired)
    if ($categoryInLinks) {
        $link = '/'.sanitizeFileName($catDir).'/'.sanitizeFileName($name);
    } else {
        $link = '/'.sanitizeFileName($name);
    }

    $articles[] = [
        'filePath' => $path,
        'filename' => $name,
        'category' => $catDir,
        'link'     => $link,
    ];
}

// ----------------------------------------------------------------------
// 4) Sort articles using original comparator
// ----------------------------------------------------------------------
usort($articles, function ($a, $b) use ($prioritizeCategories) {
    $catA = explode('/', $a['category']);
    $catB = explode('/', $b['category']);

    $mainCatA = $catA[0];
    $mainCatB = $catB[0];

    $priorityA = array_search($mainCatA, $prioritizeCategories);
    $priorityB = array_search($mainCatB, $prioritizeCategories);
    $priorityA = $priorityA === false ? PHP_INT_MAX : $priorityA;
    $priorityB = $priorityB === false ? PHP_INT_MAX : $priorityB;

    if ($priorityA != $priorityB) {
        return $priorityA - $priorityB;
    }
    if ($mainCatA != $mainCatB) {
        return strcmp($mainCatA, $mainCatB);
    }
    if ($mainCatA == 'QNA') {
        $pattern = '/\b(?:(January|February|March|April|May|June|July|August|September|October|November|December)'
                 . '(?:(?:\s+(\d{1,2})(?:,\s*|\s+))|(?:,\s*))?)?(\d{4})\b/';
        preg_match($pattern, $a['filename'], $ma);
        $monthA = !empty($ma[1]) ? $ma[1] : 'January';
        $dayA   = !empty($ma[2]) ? $ma[2] : '1';
        $yearA  = isset($ma[3])  ? $ma[3] : '1970';
        $timestampA = strtotime("$monthA $dayA, $yearA");

        preg_match($pattern, $b['filename'], $mb);
        $monthB = !empty($mb[1]) ? $mb[1] : 'January';
        $dayB   = !empty($mb[2]) ? $mb[2] : '1';
        $yearB  = isset($mb[3])  ? $mb[3] : '1970';
        $timestampB = strtotime("$monthB $dayB, $yearB");
        return $timestampB - $timestampA;
    }
    $fullCatA = $a['category'];
    $fullCatB = $b['category'];
    $subPA    = array_search($fullCatA, $prioritizeCategories);
    $subPB    = array_search($fullCatB, $prioritizeCategories);
    if ($subPA !== false || $subPB !== false) {
        $subPA = $subPA === false ? PHP_INT_MAX : $subPA;
        $subPB = $subPB === false ? PHP_INT_MAX : $subPB;
        if ($subPA != $subPB) {
            return $subPA - $subPB;
        }
    }
    $subA = $catA[1] ?? '';
    $subB = $catB[1] ?? '';
    if ($subA != $subB) {
        if ($subA === '' && $subB !== '') return -1;
        if ($subA !== '' && $subB === '') return 1;
        return strcmp($subA, $subB);
    }
    return strcmp($a['filename'], $b['filename']);
});

// ----------------------------------------------------------------------
// 5) Highlight helper
// ----------------------------------------------------------------------
function highlightTerms($text, $terms) {
    $pattern = '/'.implode('|', array_map(fn($t)=>preg_quote($t,'/'), $terms)).'/i';
    return preg_replace($pattern, '<span class="highlight">$0</span>', $text);
}

// ----------------------------------------------------------------------
// 6) Find matches
// ----------------------------------------------------------------------
function findMatches($body, $searchValue, $words, $maxLen, $link) {
    $exact   = [];
    $partial = [];
    $lastEnd = 0;

    foreach ($words as $w) {
        $offset = 0;
        while (false !== ($pos = strpos($body, $w, $offset))) {
            $start = max(0, $pos - $maxLen);
            if ($start < $lastEnd) {
                $start = $lastEnd;
            }
            $end = min(strlen($body), $start + ($maxLen * 2));

            $win = substr($body, $start, $end - $start);
            $win = preg_match('//u', $win) ? $win : @iconv('UTF-8', 'UTF-8//IGNORE', $win);

            $isExact = strpos($win, $searchValue) !== false;
            $allWordsPresent = array_reduce(
                $words,
                fn($c, $t) => $c && strpos($win, $t) !== false,
                true
            );

            // **ONLY** grab the highlighted snippet HTML
            if ($isExact) {
                $exact[] = highlightTerms($win, [$searchValue]);
            } elseif ($allWordsPresent) {
                $partial[] = highlightTerms($win, $words);
            }

            $lastEnd = $end;
            $offset  = $pos + 1;
        }
    }

    return [$exact, $partial];
}

// ----------------------------------------------------------------------
// 7) Loop → separate title/exact/partial results
// ----------------------------------------------------------------------
$titleResults   = [];
$exactResults   = [];
$partialResults = [];

foreach ($articles as $a) {
    if (!file_exists($a['filePath'])) continue;

    $raw   = file_get_contents($a['filePath']);
    $body  = strtolower(str_replace(["\n","\r","\t"], ' ', $raw));
    $title = $a['filename'];
    $tLow  = strtolower($title);

    list($ex, $pa) = findMatches(
        $body,
        $searchValue,
        $validWords,
        $maxLength,
        $a['link']
    );

    // title‐only match?
    $tWords = preg_split('/\s+/', trim($searchValue));
    $allOk  = array_reduce(
        $tWords,
        fn($carry, $w) => $carry && ($w === '' || strpos($tLow, $w) !== false),
        true
    );
    if ($allOk) {
        $titleResults[] = ['t' => $title, 'l' => $a['link'], 'sn' => []];
    }

    if (!empty($ex)) {
        $exactResults[] = ['t' => $title, 'l' => $a['link'], 'sn' => $ex];
    }
    if (!empty($pa)) {
        $partialResults[] = ['t' => $title, 'l' => $a['link'], 'sn' => $pa];
    }
}

// merge so titles come first
$results = array_merge($titleResults, $exactResults, $partialResults);

// ----------------------------------------------------------------------
// 8) Output JSON
// ----------------------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
$json = json_encode(
    $results,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR
);
if ($json === false) {
    header('Content-Type: text/plain; charset=utf-8');
    echo 'JSON encode error: ' . json_last_error_msg();
} else {
    echo $json;
}
exit;

// ----------------------------------------------------------------------
// 9) Filename sanitizer
// ----------------------------------------------------------------------
function sanitizeFileName($s) {
    $s = preg_replace('/[^a-zA-Z0-9\s]/', '', $s);
    $s = preg_replace('/\s+/', '-', $s);
    return strtolower($s);
}
