<?php
// Configuration and game state management

class GameManager {
    private static $gamesFile = __DIR__ . '/../data/games.json';
    
    public static function init() {
        if (!file_exists(self::$gamesFile)) {
            file_put_contents(self::$gamesFile, json_encode([]));
        }
    }
    
    public static function getGames() {
        self::init();
        $content = file_get_contents(self::$gamesFile);
        return json_decode($content, true) ?: [];
    }
    
    public static function saveGames($games) {
        file_put_contents(self::$gamesFile, json_encode($games, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }
    
    public static function generateCode() {
        // Use only clear characters: excludes I, L, O (letters) and 0, 1, 5 (numbers) to avoid confusion
        $chars = 'ABCDEFGHJKMNPQRSTUVWXYZ2346789';
        $code = '';
        for ($i = 0; $i < 5; $i++) {
            $code .= $chars[rand(0, strlen($chars) - 1)];
        }
        return $code;
    }
    
    public static function createGame($initiator, $playerCount, $categories, $numRounds, $gameMode = 'online', $imposterHints = true) {
        self::init();
        $games = self::getGames();
        
        // Generate unique code
        do {
            $code = self::generateCode();
        } while (isset($games[$code]));
        
        $playerId = bin2hex(random_bytes(4));
        
        $games[$code] = [
            'code' => $code,
            'created' => time(),
            'initiator' => $initiator,
            'initiatorId' => $playerId,
            'maxPlayers' => $playerCount,
            'gameMode' => $gameMode,
            'categories' => $categories,
            'numRounds' => $numRounds,
            'imposterHints' => $imposterHints,
            'players' => [
                $playerId => [
                    'id' => $playerId,
                    'name' => $initiator,
                    'isInitiator' => true,
                    'ready' => true
                ]
            ],
            'state' => [
                'gameStarted' => false,
                'gameActive' => false,
                'phase' => 'lobby',
                'currentRound' => 0,
                'currentTurn' => 0,
                'totalTurns' => 3,
                'word' => null,
                'category' => null,
                'imposterPlayer' => null,
                'currentPlayer' => null,
                'wordsSaid' => [],
                'votes' => [],
                'allPlayersSubmitted' => false
            ]
        ];
        
        self::saveGames($games);
        return $code;
    }
    
    public static function joinGame($code, $playerId, $playerName) {
        self::init();
        $games = self::getGames();
        
        if (!isset($games[$code])) {
            return false;
        }
        
        $game = &$games[$code];
        
        // Check if game is full
        if (count($game['players']) >= $game['maxPlayers']) {
            return false;
        }
        
        $game['players'][$playerId] = [
            'id' => $playerId,
            'name' => $playerName,
            'isInitiator' => false,
            'ready' => true
        ];
        
        self::saveGames($games);
        return true;
    }
    
    public static function getGame($code) {
        self::init();
        $games = self::getGames();
        return isset($games[$code]) ? $games[$code] : null;
    }
    
    public static function updateGame($code, $gameData) {
        self::init();
        $games = self::getGames();
        $games[$code] = $gameData;
        self::saveGames($games);
    }
    
    public static function startGame($code, $categories) {
        self::init();
        $games = self::getGames();
        
        if (!isset($games[$code])) {
            return false;
        }
        
        $game = &$games[$code];
        $game['state']['gameStarted'] = true;
        $game['state']['gameActive'] = true;
        $game['state']['phase'] = 'playing';
        $game['state']['currentRound'] = 0;
        
        // Select random category and word
        $selectedCategory = self::selectRandomWord($categories, $selectedWord);
        $game['state']['category'] = $selectedCategory;
        $game['state']['word'] = $selectedWord;
        
        // Select random imposter
        $playerIds = array_keys($game['players']);
        $imposterIndex = rand(0, count($playerIds) - 1);
        $game['state']['imposterPlayer'] = $playerIds[$imposterIndex];
        
        // Set first player
        $game['state']['currentPlayer'] = $playerIds[0];
        $game['state']['currentTurn'] = 0;
        $game['state']['wordsSaid'] = [];
        $game['state']['votes'] = []; 
        
        self::saveGames($games);
        return true;
    }
    
    public static function selectRandomWord($categories, &$selectedWord) {
        // Load word database from PHP array
        $words = self::getWordDatabase();
        
        if (in_array('ALL', $categories) || empty($categories)) {
            $categoryList = array_keys($words);
        } else {
            $categoryList = $categories;
        }
        
        $selectedCategory = $categoryList[rand(0, count($categoryList) - 1)];
        $wordList = $words[$selectedCategory];
        $selectedWord = $wordList[rand(0, count($wordList) - 1)];
        
        return $selectedCategory;
    }
    
    public static function getWordDatabase() {
        return [
            'ANIMALS' => ['DOG', 'CAT', 'ELEPHANT', 'LION', 'TIGER', 'BEAR', 'MONKEY', 'PENGUIN', 'GIRAFFE', 'ZEBRA', 'WOLF', 'DEER', 'HORSE', 'DUCK', 'EAGLE', 'SHARK', 'WHALE', 'DOLPHIN', 'PANDA', 'KOALA', 'SNAKE', 'CROCODILE', 'KANGAROO', 'RABBIT', 'SQUIRREL', 'FOX', 'OWL', 'PARROT', 'PEACOCK', 'CHEETAH', 'HIPPO', 'RHINO', 'BUFFALO', 'CAMEL', 'OSTRICH', 'FLAMINGO', 'SWAN', 'BUTTERFLY', 'BEE', 'ANT', 'FROG', 'LIZARD', 'TURTLE', 'CRAB', 'STARFISH', 'OCTOPUS', 'JELLYFISH', 'BADGER', 'OTTER', 'SEAL'],
            'FOOD' => ['PIZZA', 'HAMBURGER', 'PASTA', 'SUSHI', 'TACOS', 'SALAD', 'STEAK', 'CHICKEN', 'FISH', 'RICE', 'BREAD', 'CHEESE', 'MILK', 'EGGS', 'BACON', 'APPLE', 'BANANA', 'ORANGE', 'STRAWBERRY', 'GRAPE', 'WATERMELON', 'MANGO', 'PINEAPPLE', 'CARROT', 'BROCCOLI', 'POTATO', 'TOMATO', 'ONION', 'GARLIC', 'MUSHROOM', 'CAKE', 'COOKIE', 'CHOCOLATE', 'ICE_CREAM', 'DONUT', 'COFFEE', 'TEA', 'JUICE', 'WATER', 'SODA', 'BEER', 'WINE', 'SOUP', 'SANDWICH', 'BURRITO', 'NOODLES', 'CURRY', 'KEBAB', 'DUMPLING', 'WAFFLE'],
            'SPORTS' => ['SOCCER', 'BASKETBALL', 'TENNIS', 'VOLLEYBALL', 'BASEBALL', 'GOLF', 'CRICKET', 'HOCKEY', 'RUGBY', 'SWIMMING', 'CYCLING', 'RUNNING', 'BOXING', 'WRESTLING', 'BADMINTON', 'TABLE_TENNIS', 'ARCHERY', 'FENCING', 'SKATEBOARDING', 'SURFING', 'SKIING', 'SNOWBOARDING', 'ICE_SKATING', 'GYMNASTICS', 'MARTIAL_ARTS', 'WEIGHTLIFTING', 'TRACK_AND_FIELD', 'SUMO', 'BOWLING', 'DARTS', 'BILLIARDS', 'SNOWSPORTS', 'PARKOUR', 'CLIMBING', 'DIVING', 'EQUESTRIAN', 'FENCING', 'HEPTATHLON', 'JUDO', 'KARATE', 'LACROSSE', 'POLO', 'ROWING', 'SHOOTING', 'TAEKWONDO', 'VOLLEYBALL', 'WATER_POLO', 'WINDSURFING', 'WRESTLING', 'ROCK_CLIMBING'],
            'MUSIC' => ['GUITAR', 'PIANO', 'DRUM', 'VIOLIN', 'TRUMPET', 'SAXOPHONE', 'FLUTE', 'CLARINET', 'BASS', 'HARP', 'CELLO', 'ACCORDION', 'BANJO', 'MANDOLIN', 'UKULELE', 'OBOE', 'TROMBONE', 'TUBA', 'XYLOPHONE', 'TIMPANI', 'ROCK', 'POP', 'JAZZ', 'BLUES', 'CLASSICAL', 'COUNTRY', 'HIP_HOP', 'RAP', 'ELECTRONIC', 'REGGAE', 'METAL', 'FOLK', 'GOSPEL', 'SOUL', 'LATIN', 'DISCO', 'PUNK', 'INDIE', 'DANCE', 'OPERA', 'BEETHOVEN', 'MOZART', 'BACH', 'CHOPIN', 'VIVALDI', 'HANDEL', 'DEBUSSY', 'TCHAIKOVSKY', 'BRAHMS', 'WAGNER']
        ];
    }
    
    public static function submitWord($code, $playerId, $word, $turn) {
        $game = self::getGame($code);
        if (!$game) return false;
        
        // Record the word
        if (!isset($game['state']['wordsSaid'])) {
            $game['state']['wordsSaid'] = [];
        }
        
        $game['state']['wordsSaid'][] = [
            'playerId' => $playerId,
            'word' => $word,
            'turn' => $turn
        ];
        
        // Move to next player
        $playerIds = array_keys($game['players']);
        $currentPlayerIndex = array_search($game['state']['currentPlayer'], $playerIds);
        $nextPlayerIndex = ($currentPlayerIndex + 1) % count($playerIds);
        
        $game['state']['currentPlayer'] = $playerIds[$nextPlayerIndex];
        
        // Check if turn should advance
        if ($nextPlayerIndex === 0) {
            $game['state']['currentTurn']++;
            if ($game['state']['currentTurn'] >= $game['state']['totalTurns']) {
                // Move to voting phase
                $game['state']['phase'] = 'voting';
                $game['state']['votes'] = [];
            }
        }
        
        self::updateGame($code, $game);
        return true;
    }
    
    public static function submitVote($code, $playerId, $votedFor) {
        $game = self::getGame($code);
        if (!$game) return false;
        
        if (!isset($game['state']['votes'])) {
            $game['state']['votes'] = [];
        }
        
        $game['state']['votes'][$playerId] = $votedFor;
        
        // Check if all players have voted
        if (count($game['state']['votes']) === count($game['players'])) {
            $game['state']['phase'] = 'reveal';
            $game['state']['gameActive'] = false;
            $game['state']['revealStartTime'] = time();
        }
        
        self::updateGame($code, $game);
        return true;
    }
    
    public static function startRound($code) {
        $game = self::getGame($code);
        if (!$game) return false;
        
        $game['state']['currentRound']++;
        $game['state']['currentTurn'] = 0;
        $game['state']['phase'] = 'playing';
        $game['state']['gameActive'] = true;
        $game['state']['wordsSaid'] = [];
        $game['state']['votes'] = [];
        $game['state']['revealStartTime'] = null;
        
        // Select new word and imposter
        $selectedCategory = self::selectRandomWord($game['categories'], $selectedWord);
        $game['state']['category'] = $selectedCategory;
        $game['state']['word'] = $selectedWord;
        
        $playerIds = array_keys($game['players']);
        $imposterIndex = rand(0, count($playerIds) - 1);
        $game['state']['imposterPlayer'] = $playerIds[$imposterIndex];
        
        // Rotate starting player
        $currentStarterIndex = array_search($game['state']['currentPlayer'], $playerIds);
        $nextStarterIndex = ($currentStarterIndex + 1) % count($playerIds);
        $game['state']['currentPlayer'] = $playerIds[$nextStarterIndex];
        
        self::updateGame($code, $game);
        return true;
    }
}

// Set correct headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
?>
