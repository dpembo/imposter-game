<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['initiator']) || !isset($input['playerCount'])) {
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$code = GameManager::createGame(
    $input['initiator'],
    $input['playerCount'],
    $input['categories'] ?? ['ALL'],
    $input['numRounds'] ?? 1,
    $input['gameMode'] ?? 'online',
    $input['imposterHints'] ?? true
);

$game = GameManager::getGame($code);
$initiatorId = $game['initiatorId'];

echo json_encode([
    'success' => true,
    'code' => $code,
    'playerId' => $initiatorId
]);
?>
