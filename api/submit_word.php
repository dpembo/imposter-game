<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['code']) || !isset($input['playerId']) || !isset($input['word'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$code = strtoupper($input['code']);
$turn = $input['turn'] ?? 0;

if (GameManager::submitWord($code, $input['playerId'], $input['word'], $turn)) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['success' => false, 'error' => 'Cannot submit word']);
}
?>
