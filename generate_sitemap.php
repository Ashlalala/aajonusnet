<?php

header('Content-Type: application/xml; charset=utf-8');

function sanitizeFileName($string) {
    $string = preg_replace('/[^a-zA-Z0-9\s]/', '', $string);
    $string = preg_replace('/\s+/', '-', $string);
    $string = strtolower($string);
    return $string;
}


echo '<?xml version="1.0" encoding="UTF-8"?>';
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

// Home Page
echo '<url>';
echo '<loc>https://aajonus.net/</loc>';
echo '<changefreq>daily</changefreq>';
echo '<priority>1.0</priority>';
echo '</url>';

// Categories
$directories = glob('md/*', GLOB_ONLYDIR);
foreach ($directories as $dir) {
    $category = str_replace('md/', '', $dir);
    $category = sanitizeFileName($category);
    echo '<url>';
    echo '<loc>https://aajonus.net/' . urlencode($category) . '</loc>';
    echo '<changefreq>daily</changefreq>';
    echo '<priority>0.8</priority>';
    echo '</url>';
}

// Articles
$mdFolder = 'md';
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($mdFolder));
foreach ($files as $file) {
    if ($file->isDir()) {
        continue;
    }
    $filename = $file->getBasename('.md');
    $sanitizedFileName = sanitizeFileName($filename);

    echo '<url>';
    echo '<loc>https://aajonus.net/' . urlencode($sanitizedFileName) . '</loc>';
    echo '<changefreq>weekly</changefreq>';
    echo '<priority>0.7</priority>';
    echo '</url>';
}

echo '</urlset>';
?>