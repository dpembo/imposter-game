<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['code'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$code = strtoupper($input['code']);
$categories = $input['categories'] ?? ['ALL'];

// Validate categories are not empty
if (empty($categories)) {
    $categories = ['ALL'];
}

// Log for debugging (remove later if needed)
error_log("start_game.php - code: $code, categories: " . json_encode($categories));

if (GameManager::startGame($code, $categories)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Cannot start game']);
}
?>
