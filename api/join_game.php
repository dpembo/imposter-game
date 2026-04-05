<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['code']) || !isset($input['playerName']) || !isset($input['playerId'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$code = strtoupper($input['code']);

if (GameManager::joinGame($code, $input['playerId'], $input['playerName'])) {
    $game = GameManager::getGame($code);
    echo json_encode([
        'success' => true,
        'playerId' => $input['playerId'],
        'isInitiator' => $game['initiatorId'] === $input['playerId']
    ]);
} else {
    echo json_encode(['success' => false, 'error' => 'Cannot join game']);
}
?>
