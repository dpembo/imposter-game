<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['code'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$code = strtoupper($input['code']);

if (GameManager::startGame($code, $input['categories'] ?? ['ALL'])) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Cannot start game']);
}
?>
