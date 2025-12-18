<?php
  // Get the data from POST request
  $data = json_decode(file_get_contents('php://input'), true);
  $ids = $data['ids'];

  // Initialize the array that will hold the content
  $contents = [];

  $replaceArray = ["\n", "\r", "\t"];

  foreach ($ids as $filePath) {
    if (file_exists($filePath)) {
      $content = file_get_contents($filePath);
$content = str_replace($replaceArray, ' ', $content);
$content = htmlentities($content, ENT_QUOTES, "UTF-8");
$contents[$filePath] = $content;
    }
  }
  echo json_encode($contents);
?>