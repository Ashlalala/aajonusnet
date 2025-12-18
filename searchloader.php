<?php
error_reporting(E_ERROR | E_PARSE);

if (ob_get_level()) {
    ob_end_clean();
}

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

$ids = (isset($data['ids']) && is_array($data['ids'])) ? $data['ids'] : [];

$replaceArray = ["\n", "\r", "\t"];
$contents = [];

foreach ($ids as $filePath) {
    if (file_exists($filePath)) {
        $text = file_get_contents($filePath);
        $text = str_replace($replaceArray, ' ', $text);
        $contents[$filePath] = htmlentities($text, ENT_QUOTES, 'UTF-8');
    }
}

$json = json_encode($contents);

header('Content-Type: application/json');
header('X-Total-Uncompressed-Length: ' . strlen($json));

echo $json;