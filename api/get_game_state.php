<?php
require_once __DIR__ . '/GameManager.php';

header('Content-Type: application/json');

if (!isset($_GET['code'])) {
    echo json_encode(['success' => false, 'error' => 'No game code']);
    exit;
}

$code = strtoupper($_GET['code']);
$game = GameManager::getGame($code);

if (!$game) {
    echo json_encode(['success' => false, 'error' => 'Game not found']);
    exit;
}

// Auto-transition from voting to results after 20 seconds
if ($game['state']['phase'] === 'voting' && $game['state']['votingStartTime']) {
    $elapsedSeconds = time() - $game['state']['votingStartTime'];
    if ($elapsedSeconds >= 20) {
        $game['state']['phase'] = 'results';
        $game['state']['resultStartTime'] = time();
        GameManager::updateGame($code, $game);
    }
}

// Format players for response
$players = [];
foreach ($game['players'] as $playerId => $playerData) {
    $players[] = [
        'id' => $playerId,
        'name' => $playerData['name'],
        'isInitiator' => $playerData['isInitiator'],
        'ready' => $playerData['ready'] ?? true
    ];
}

// Format current player
$currentPlayer = null;
if ($game['state']['currentPlayer']) {
    if (isset($game['players'][$game['state']['currentPlayer']])) {
        $currentPlayer = [
            'id' => $game['state']['currentPlayer'],
            'name' => $game['players'][$game['state']['currentPlayer']]['name']
        ];
    }
}

// Format imposter player
$imposterPlayer = null;
if ($game['state']['imposterPlayer']) {
    if (isset($game['players'][$game['state']['imposterPlayer']])) {
        $imposterPlayer = [
            'id' => $game['state']['imposterPlayer'],
            'name' => $game['players'][$game['state']['imposterPlayer']]['name']
        ];
    } else {
        // Debug: imposter ID doesn't exist in players
        error_log("DEBUG: Imposter ID {$game['state']['imposterPlayer']} not found in players. Available IDs: " . json_encode(array_keys($game['players'])));
    }
} else {
    // Debug: imposter player not set
    error_log("DEBUG: imposterPlayer is null/empty. Phase: {$game['state']['phase']}, Round: {$game['state']['currentRound']}");
}

// Format words said
$wordsSaid = [];
if (is_array($game['state']['wordsSaid'])) {
    foreach ($game['state']['wordsSaid'] as $entry) {
        $wordsSaid[$entry['playerId']] = $entry['word'];
    }
}

// Format votes
$votes = [];
if (is_array($game['state']['votes'])) {
    foreach ($game['state']['votes'] as $playerId => $votedFor) {
        $votes[$playerId] = $votedFor;
    }
}

echo json_encode([
    'success' => true,
    'state' => [
        'gameStarted' => $game['state']['gameStarted'],
        'gameActive' => $game['state']['gameActive'],
        'phase' => $game['state']['phase'],
        'currentRound' => $game['state']['currentRound'],
        'currentTurn' => $game['state']['currentTurn'],
        'totalTurns' => $game['state']['totalTurns'],
        'word' => $game['state']['word'],
        'category' => $game['state']['category'],
        'imposterPlayer' => $imposterPlayer,
        'currentPlayer' => $currentPlayer,
        'wordsSaid' => $wordsSaid,
        'votes' => $votes,
        'votingStartTime' => $game['state']['votingStartTime'] ?? null,
        'resultStartTime' => $game['state']['resultStartTime'] ?? null
    ],
    'players' => $players,
    'maxPlayers' => $game['maxPlayers'],
    'gameMode' => $game['gameMode'] ?? 'online',
    'categories' => $game['categories'],
    'numRounds' => $game['numRounds'],
    'imposterHints' => $game['imposterHints'] ?? true,
    'playerStats' => $game['state']['playerStats'] ?? []
]);
?>
