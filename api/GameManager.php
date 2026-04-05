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
        
        // IMPORTANT: Store the categories being used so subsequent rounds use the same ones
        $game['categories'] = $categories;
        
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
        
        // If 'ALL' explicitly passed or empty, use all categories
        if (in_array('ALL', $categories) || empty($categories)) {
            $categoryList = array_keys($words);
        } else {
            // Use only the specified categories (filter to valid ones)
            $categoryList = array_filter($categories, function($cat) use ($words) {
                return isset($words[$cat]);
            });
            
            // If all specified categories were invalid, fall back to all
            if (empty($categoryList)) {
                $categoryList = array_keys($words);
            }
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
            'MOVIES' => ['AVATAR', 'TITANIC', 'INCEPTION', 'MATRIX', 'JAWS', 'ALIEN', 'PREDATOR', 'TERMINATOR', 'FORREST_GUMP', 'PULP_FICTION', 'FIGHT_CLUB', 'DARK_KNIGHT', 'AVENGERS', 'IRON_MAN', 'SPIDER_MAN', 'BATMAN', 'SUPERMAN', 'WONDER_WOMAN', 'AQUAMAN', 'FLASH', 'FROZEN', 'LION_KING', 'TOY_STORY', 'SHREK', 'FINDING_NEMO', 'CARS', 'MONSTERS_INC', 'UP', 'RATATOUILLE', 'WALL_E', 'GLADIATOR', 'BRAVEHEART', 'TITANIC', 'GODFATHER', 'GOODFELLAS', 'SCARFACE', 'AL_PACINO', 'HEAT', 'JOHN_WICK', 'MISSION_IMPOSSIBLE', 'FAST_FURIOUS', 'JURASSIC_PARK', 'INDEPENDENCE_DAY', 'BACK_TO_FUTURE', 'GHOSTBUSTERS', 'GREMLINS', 'POLTERGEIST', 'SHINING', 'HALLOWEEN', 'PSYCHO'],
            'COUNTRIES' => ['FRANCE', 'GERMANY', 'ITALY', 'SPAIN', 'PORTUGAL', 'GREECE', 'NETHERLANDS', 'BELGIUM', 'SWITZERLAND', 'AUSTRIA', 'SWEDEN', 'NORWAY', 'DENMARK', 'FINLAND', 'POLAND', 'HUNGARY', 'CZECH_REPUBLIC', 'ROMANIA', 'BULGARIA', 'CROAT', 'MEXICO', 'CANADA', 'BRAZIL', 'ARGENTINA', 'CHILE', 'PERU', 'COLOMBIA', 'VENEZUELA', 'ECUADOR', 'BOLIVIA', 'JAPAN', 'CHINA', 'SOUTH_KOREA', 'INDIA', 'THAILAND', 'VIETNAM', 'INDONESIA', 'PHILIPPINES', 'MALAYSIA', 'SINGAPORE', 'AUSTRALIA', 'NEW_ZEALAND', 'SOUTH_AFRICA', 'EGYPT', 'NIGERIA', 'KENYA', 'RUSSIA', 'UKRAINE', 'TURKEY', 'SAUDI_ARABIA'],
            'MUSIC' => ['GUITAR', 'PIANO', 'DRUM', 'VIOLIN', 'TRUMPET', 'SAXOPHONE', 'FLUTE', 'CLARINET', 'BASS', 'HARP', 'CELLO', 'ACCORDION', 'BANJO', 'MANDOLIN', 'UKULELE', 'OBOE', 'TROMBONE', 'TUBA', 'XYLOPHONE', 'TIMPANI', 'ROCK', 'POP', 'JAZZ', 'BLUES', 'CLASSICAL', 'COUNTRY', 'HIP_HOP', 'RAP', 'ELECTRONIC', 'REGGAE', 'METAL', 'FOLK', 'GOSPEL', 'SOUL', 'LATIN', 'DISCO', 'PUNK', 'INDIE', 'DANCE', 'OPERA', 'BEETHOVEN', 'MOZART', 'BACH', 'CHOPIN', 'VIVALDI', 'HANDEL', 'DEBUSSY', 'TCHAIKOVSKY', 'BRAHMS', 'WAGNER'],
            'TECHNOLOGY' => ['COMPUTER', 'LAPTOP', 'PHONE', 'TABLET', 'SMARTWATCH', 'CAMERA', 'PRINTER', 'SCANNER', 'KEYBOARD', 'MOUSE', 'MONITOR', 'SPEAKER', 'HEADPHONES', 'MICROPHONE', 'ROUTER', 'MODEM', 'SERVER', 'DESKTOP', 'PROCESSOR', 'RAM', 'HARD_DRIVE', 'SSD', 'MOTHERBOARD', 'GPU', 'POWER_SUPPLY', 'CHARGER', 'CABLE', 'USB', 'ADAPTER', 'HUB', 'DRONE', 'ROBOT', 'SATELLITE', 'TELESCOPE', 'MICROSCOPE', 'THERMOMETER', 'SCALE', 'TIMER', 'CALCULATOR', 'PROJECTOR', 'HOLOGRAM', 'QUANTUM_COMPUTER', 'VIRTUAL_REALITY', 'AUGMENTED_REALITY', 'ARTIFICIAL_INTELLIGENCE', 'MACHINE_LEARNING', 'BLOCKCHAIN', 'CLOUD', 'INTERNET', 'EMAIL'],
            'WEATHER' => ['RAIN', 'SNOW', 'SUNSHINE', 'CLOUD', 'THUNDER', 'LIGHTNING', 'WIND', 'FOG', 'HAIL', 'SLEET', 'HURRICANE', 'TORNADO', 'CYCLONE', 'BLIZZARD', 'STORM', 'DRIZZLE', 'SNOW_FLAKE', 'RAINBOW', 'DEW', 'FROST', 'TEMPERATURE', 'HUMIDITY', 'PRESSURE', 'BAROMETER', 'THERMOMETER', 'WEATHER_VANE', 'ANEMOMETER', 'PRECIPITATION', 'CELSIUS', 'FAHRENHEIT', 'CLIMATE', 'SEASON', 'SPRING', 'SUMMER', 'AUTUMN', 'WINTER', 'MONSOON', 'DROUGHT', 'FLOOD', 'EARTHQUAKE', 'VOLCANIC_ASH', 'AVALANCHE', 'TSUNAMI', 'WATERSPOUT', 'DUST_STORM', 'HEATWAVE', 'COLD_SNAP', 'SMOG', 'OZONE', 'HUMIDITY'],
            'BODY_PARTS' => ['HEAD', 'FACE', 'EYE', 'EAR', 'NOSE', 'MOUTH', 'TONGUE', 'TEETH', 'LIP', 'CHIN', 'CHEEK', 'FOREHEAD', 'TEMPLE', 'NECK', 'SHOULDER', 'ARM', 'ELBOW', 'FOREARM', 'WRIST', 'HAND', 'FINGER', 'PALM', 'NAIL', 'CHEST', 'RIBS', 'HEART', 'LUNG', 'STOMACH', 'LIVER', 'KIDNEY', 'INTESTINE', 'BONE', 'MUSCLE', 'SKIN', 'BLOOD', 'VEIN', 'ARTERY', 'NERVE', 'BRAIN', 'SPINE', 'LEG', 'THIGH', 'KNEE', 'SHIN', 'CALF', 'ANKLE', 'FOOT', 'HEEL', 'TOE', 'SOLE'],
            'COLORS' => ['RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE', 'PINK', 'BROWN', 'BLACK', 'WHITE', 'GRAY', 'SILVER', 'GOLD', 'BEIGE', 'CYAN', 'MAGENTA', 'LIME', 'NAVY', 'TEAL', 'TURQUOISE', 'MAROON', 'OLIVE', 'CORAL', 'SALMON', 'PEACH', 'LAVENDER', 'INDIGO', 'VIOLET', 'CRIMSON', 'SCARLET', 'EMERALD', 'SAPPHIRE', 'RUBY', 'AMBER', 'BRONZE', 'COPPER', 'PLATINUM', 'TIN', 'NICKEL', 'CHROME', 'MAHOGANY', 'EBONY', 'IVORY', 'CREAM', 'KHAKI', 'CHARCOAL', 'SLATE', 'TAN', 'RUST', 'BURGUNDY'],
            'PROFESSIONS' => ['DOCTOR', 'NURSE', 'TEACHER', 'ENGINEER', 'ARCHITECT', 'LAWYER', 'ACCOUNTANT', 'CHEF', 'CARPENTER', 'PLUMBER', 'ELECTRICIAN', 'MECHANIC', 'PILOT', 'ASTRONAUT', 'SCIENTIST', 'MATHEMATICIAN', 'PHYSICIST', 'CHEMIST', 'BIOLOGIST', 'GEOLOGIST', 'PROGRAMMER', 'DEVELOPER', 'DESIGNER', 'ARTIST', 'MUSICIAN', 'ACTOR', 'DIRECTOR', 'PRODUCER', 'PHOTOGRAPHER', 'JOURNALIST', 'WRITER', 'EDITOR', 'TRANSLATOR', 'INTERPRETER', 'DIPLOMAT', 'POLITICIAN', 'JUDGE', 'POLICE_OFFICER', 'FIREFIGHTER', 'SOLDIER', 'VETERINARIAN', 'DENTIST', 'PSYCHOLOGIST', 'THERAPIST', 'PHILOSOPHER', 'NUTRITIONIST', 'COACH', 'TRAINER', 'DANCER', 'SINGER'],
            'VEHICLES' => ['CAR', 'TRUCK', 'BUS', 'MOTORCYCLE', 'BICYCLE', 'SCOOTER', 'SKATEBOARD', 'ROLLERBLADES', 'AIRPLANE', 'HELICOPTER', 'JET', 'GLIDER', 'HOT_AIR_BALLOON', 'TRAIN', 'SUBWAY', 'TRAM', 'BUS', 'TROLLEY', 'BOAT', 'SHIP', 'YACHT', 'SAILBOAT', 'KAYAK', 'CANOE', 'SUBMARINE', 'FERRY', 'TANKER', 'YACHT', 'GARBAGE_TRUCK', 'AMBULANCE', 'FIRE_TRUCK', 'POLICE_CAR', 'TAXI', 'LIMOUSINE', 'VAN', 'PICKUP_TRUCK', 'TRACTOR', 'BULLDOZER', 'EXCAVATOR', 'CRANE', 'STEAMBOAT', 'CARGO_SHIP', 'CRUISE_SHIP', 'DINGHY', 'BARGE', 'ROCKET', 'SPACESHIP', 'SHUTTLE', 'DRONE', 'CART'],
            'CLOTHES' => ['SHIRT', 'PANTS', 'DRESS', 'SKIRT', 'JACKET', 'COAT', 'SWEATER', 'HOODIE', 'VEST', 'UNDERWEAR', 'SOCKS', 'SHOES', 'BOOTS', 'SANDALS', 'SLIPPERS', 'HAT', 'CAP', 'BERET', 'SCARF', 'GLOVES', 'MITTENS', 'BELT', 'TIE', 'BOW_TIE', 'SUSPENDERS', 'JEANS', 'BLAZER', 'SWIMSUIT', 'WETSUIT', 'TUXEDO', 'UNIFORM', 'ARMOR', 'HELMET', 'GOGGLES', 'SUNGLASSES', 'APRON', 'OVERALL', 'LEGGINGS', 'TIGHTS', 'STOCKINGS', 'BATHROBE', 'PAJAMAS', 'NIGHTGOWN', 'ROBE', 'CLOAK', 'CAPE', 'GOWN', 'SUIT', 'KIMONO', 'SARONG'],
            'FURNITURE' => ['BED', 'CHAIR', 'TABLE', 'DESK', 'SOFA', 'COUCH', 'OTTOMAN', 'STOOL', 'BENCH', 'SHELF', 'CABINET', 'DRESSER', 'NIGHTSTAND', 'WARDROBE', 'BOOKCASE', 'CLOSET', 'PANTRY', 'REFRIGERATOR', 'STOVE', 'OVEN', 'MICROWAVE', 'DISHWASHER', 'WASHING_MACHINE', 'DRYER', 'TOILET', 'SINK', 'BATHTUB', 'SHOWER', 'MIRROR', 'LAMP', 'CEILING_FAN', 'CHANDELIER', 'PICTURE_FRAME', 'CURTAINS', 'BLINDS', 'RUG', 'CARPET', 'DOOR', 'WINDOW', 'DOOR_FRAME', 'RAILING', 'BANISTER', 'STAIRS', 'LADDER', 'WALL', 'FLOOR', 'CEILING', 'COUNTER', 'ISLAND', 'BAR_STOOL'],
            'EMOTIONS' => ['HAPPY', 'SAD', 'ANGRY', 'FEARFUL', 'SURPRISED', 'DISGUSTED', 'CONFUSED', 'EXCITED', 'ANXIOUS', 'CALM', 'CONFIDENT', 'INSECURE', 'JEALOUS', 'ENVIOUS', 'PROUD', 'ASHAMED', 'GUILTY', 'RELIEVED', 'GRATEFUL', 'HOPEFUL', 'DESPERATE', 'LONELY', 'LOVED', 'BETRAYED', 'FORGIVEN', 'HUMILIATED', 'RESPECTED', 'MISUNDERSTOOD', 'APPRECIATED', 'IGNORED', 'MOTIVATED', 'DEMOTIVATED', 'INSPIRED', 'OVERWHELMED', 'PEACEFUL', 'IRRITATED', 'DELIGHTED', 'HEARTBROKEN', 'EXHILARATED', 'DEVASTATED', 'DETERMINED', 'HESITANT', 'COURAGEOUS', 'COWARDLY', 'COMPASSIONATE', 'INDIFFERENT', 'OPTIMISTIC', 'PESSIMISTIC', 'SATISFIED', 'DISAPPOINTED'],
            'GEOGRAPHY' => ['MOUNTAIN', 'VALLEY', 'HILL', 'PLATEAU', 'PLAIN', 'DESERT', 'FOREST', 'JUNGLE', 'RAINFOREST', 'TUNDRA', 'SAVANNA', 'GRASSLAND', 'BEACH', 'COAST', 'ISLAND', 'PENINSULA', 'ARCHIPELAGO', 'LAKE', 'RIVER', 'OCEAN', 'SEA', 'BAY', 'GULF', 'STRAIT', 'LAGOON', 'WATERFALL', 'CANYON', 'GORGE', 'CAVE', 'VOLCANO', 'GLACIER', 'ICEBERG', 'CLIFF', 'SLOPE', 'RIDGE', 'SUMMIT', 'CRATER', 'DELTA', 'ESTUARY', 'MARSH', 'SWAMP', 'BOG', 'OASIS', 'SPRING', 'GEYSER', 'HOT_SPRING', 'VOLCANO', 'QUICKSAND', 'REEF', 'RIFT'],
            'FANTASY' => ['DRAGON', 'UNICORN', 'PHOENIX', 'GRIFFIN', 'CENTAUR', 'MERMAID', 'VAMPIRE', 'WEREWOLF', 'ZOMBIE', 'GHOST', 'WITCH', 'WIZARD', 'SORCERER', 'WARLOCK', 'ELF', 'DWARF', 'GOBLIN', 'ORC', 'TROLL', 'GIANT', 'FAIRY', 'SPRITE', 'PIXIE', 'BANSHEE', 'LEVIATHAN', 'HYDRA', 'BASILISK', 'MEDUSA', 'CYCLOPS', 'KRAKEN', 'GOLEM', 'GARGOYLE', 'DEMON', 'ANGEL', 'SPIRIT', 'POLTERGEIST', 'SPECTRE', 'WRAITH', 'LICH', 'LICH_KING', 'ARCHLICH', 'THIEF', 'WARRIOR', 'MAGE', 'ROGUE', 'PALADIN', 'CLERIC', 'RANGER', 'BARBARIAN', 'DRUID'],
            'NATURE' => ['TREE', 'FLOWER', 'GRASS', 'BUSH', 'FERN', 'MOSS', 'FUNGUS', 'MUSHROOM', 'LEAF', 'BRANCH', 'ROOT', 'BARK', 'LOG', 'WOOD', 'PINE_CONE', 'SEED', 'FRUIT', 'BERRY', 'NUT', 'ACORN', 'ROCK', 'STONE', 'MINERAL', 'CRYSTAL', 'QUARTZ', 'DIAMOND', 'EMERALD', 'RUBY', 'SAPPHIRE', 'TOPAZ', 'STORM', 'LIGHTNING', 'THUNDER', 'RAIN', 'HAIL', 'DEW', 'FROST', 'ICE', 'SNOW', 'SLEET', 'SUNRISE', 'SUNSET', 'MOONLIGHT', 'STARLIGHT', 'ECLIPSE', 'COMET', 'METEOR', 'AURORA', 'RAINBOW', 'ATMOSPHERIC'],
            'HEROES' => ['BATMAN', 'SUPERMAN', 'SPIDER_MAN', 'IRON_MAN', 'CAPTAIN_AMERICA', 'THOR', 'BLACK_WIDOW', 'HULK', 'HAWKEYE', 'DOCTOR_STRANGE', 'WONDER_WOMAN', 'FLASH', 'GREEN_LANTERN', 'AQUAMAN', 'CYBORG', 'SHAZAM', 'BLACK_PANTHER', 'SCARLET_WITCH', 'VISION', 'ANTMAN', 'WASP', 'CAPTAIN_MARVEL', 'DOCTOR_STRANGE', 'DAREDEVIL', 'JESSICA_JONES', 'LUKE_CAGE', 'IRON_FIST', 'PUNISHER', 'DEADPOOL', 'WOLVERINE', 'CYCLOPS', 'STORM', 'JEAN_GREY', 'BEAST', 'ANGEL', 'ICE_MAN', 'COLOSSUS', 'NIGHTCRAWLER', 'ROGUE', 'GAMBIT', 'MYSTIQUE', 'PROFESSOR_X', 'MAGNETO', 'SENTINEL', 'SHADOW_CAT', 'CABLE', 'DOMINO', 'PSYLOCKE', 'ARCHANGEL', 'PHOENIX'],
            'HISTORY' => ['ROME', 'GREECE', 'EGYPT', 'BABYLON', 'PERSIA', 'VIKING', 'OTTOMAN', 'AZTEC', 'MAYA', 'INCA', 'SUMERIAN', 'EGYPTIAN', 'GREEK', 'ROMAN', 'MEDIEVAL', 'RENAISSANCE', 'BAROQUE', 'ENLIGHTENMENT', 'INDUSTRIAL_AGE', 'MODERN_AGE', 'STONE_AGE', 'BRONZE_AGE', 'IRON_AGE', 'DARK_AGES', 'MIDDLE_AGES', 'CRUSADE', 'INQUISITION', 'REFORMATION', 'REVOLUTION', 'WAR', 'BATTLE', 'EMPIRE', 'KINGDOM', 'DYNASTY', 'THRONE', 'CROWN', 'KING', 'QUEEN', 'EMPEROR', 'BISHOP', 'POPE', 'MONK', 'KNIGHT', 'SAMURAI', 'SHOGUN', 'PHARAOH', 'CAESAR', 'DICTATOR', 'NOBLE', 'PEASANT'],
            'SCIENCE' => ['ATOM', 'MOLECULE', 'ELECTRON', 'PROTON', 'NEUTRON', 'NUCLEUS', 'ELEMENT', 'COMPOUND', 'REACTION', 'CATALYST', 'ENERGY', 'FORCE', 'VELOCITY', 'ACCELERATION', 'GRAVITY', 'FRICTION', 'MOMENTUM', 'PRESSURE', 'TEMPERATURE', 'HEAT', 'LIGHT', 'SOUND', 'WAVE', 'FREQUENCY', 'WAVELENGTH', 'AMPLITUDE', 'PHASE', 'INTERFERENCE', 'REFRACTION', 'REFLECTION', 'MAGNETISM', 'ELECTRICITY', 'CURRENT', 'VOLTAGE', 'RESISTANCE', 'CONDUCTOR', 'INSULATOR', 'SEMICONDUCTOR', 'CIRCUIT', 'CELL', 'GENE', 'DNA', 'RNA', 'PROTEIN', 'ENZYME', 'ANTIBODY', 'HORMONE', 'VIRUS', 'BACTERIA', 'ORGANISM'],
            'LITERATURE' => ['NOVEL', 'POETRY', 'DRAMA', 'COMEDY', 'TRAGEDY', 'EPIC', 'SATIRE', 'FABLE', 'PARABLE', 'ALLEGORY', 'METAPHOR', 'SIMILE', 'PERSONIFICATION', 'HYPERBOLE', 'IRONY', 'PUNS', 'ALLITERATION', 'ONOMATOPOEIA', 'RHYME', 'RHYTHM', 'PROSE', 'VERSE', 'STANZA', 'SONNET', 'HAIKU', 'LIMERICK', 'CHARACTER', 'PROTAGONIST', 'ANTAGONIST', 'PLOT', 'SETTING', 'CONFLICT', 'CLIMAX', 'RESOLUTION', 'DIALOGUE', 'MONOLOGUE', 'SOLILOQUY', 'NARRATOR', 'POINT_OF_VIEW', 'THEME', 'AUTHOR', 'WRITER', 'POET', 'PLAYWRIGHT', 'SHAKESPEARE', 'DANTE', 'CERVANTES', 'AUSTEN', 'DICKENS', 'DOSTOYEVSKY'],
            'GAMES' => ['CHESS', 'CHECKERS', 'POKER', 'BLACKJACK', 'ROULETTE', 'DICE', 'CARD', 'DOMINO', 'SCRABBLE', 'MONOPOLY', 'RISK', 'STRATEGO', 'BATTLESHIP', 'CONNECT_FOUR', 'TIC_TAC_TOE', 'HANGMAN', 'BINGO', 'LOTTERY', 'LOTTO', 'SCRATCH_CARD', 'VIDEO_GAME', 'CONSOLE', 'PC_GAME', 'MOBILE_GAME', 'ARCADE', 'PINBALL', 'SLOT_MACHINE', 'KARAOKE', 'TRIVIA', 'CHARADES', 'PICTIONARY', 'HANGMAN', 'WORD_SEARCH', 'CROSSWORD', 'SUDOKU', 'PUZZLE', 'JIGSAW', 'RUBIKS_CUBE', 'LEGO', 'TOY', 'DOLL', 'ACTION_FIGURE', 'BOARD_GAME', 'DECK_BUILDING', 'RPG', 'MMO', 'FPS', 'RTS', 'SIMULATION', 'RACING_GAME'],
            'UNIVERSE' => ['SUN', 'MOON', 'STAR', 'PLANET', 'SATELLITE', 'ASTEROID', 'METEOR', 'COMET', 'BLACK_HOLE', 'NEBULA', 'GALAXY', 'MILKY_WAY', 'ANDROMEDA', 'QUASAR', 'PULSAR', 'SUPERNOVA', 'NEUTRON_STAR', 'WHITE_DWARF', 'RED_GIANT', 'BINARY_STAR', 'SOLAR_SYSTEM', 'ORBIT', 'ECLIPSE', 'TRANSIT', 'CONJUNCTION', 'OPPOSITION', 'RETROGRADE', 'PRECESSION', 'NUTATION', 'COSMIC_RAY', 'DARK_MATTER', 'DARK_ENERGY', 'ANTIMATTER', 'PHOTON', 'NEUTRINO', 'GRAVITON', 'TACHYON', 'HIGGS_BOSON', 'GLUON', 'SPACE_TIME', 'WORMHOLE', 'TIME_DILATION', 'GRAVITY_WELL', 'RADIATION', 'COSMIC_BACKGROUND', 'LIGHT_YEAR', 'PARSEC', 'SINGULARITY', 'EVENT_HORIZON', 'QUIESCENT_BLACK_HOLE'],
            'HOLIDAY' => ['CHRISTMAS', 'EASTER', 'HALLOWEEN', 'THANKSGIVING', 'VALENTINE_DAY', 'NEW_YEAR', 'BIRTHDAY', 'ANNIVERSARY', 'WEDDING', 'GRADUATION', 'MOTHER_DAY', 'FATHER_DAY', 'GRANDFATHER_DAY', 'GRANDPARENT_DAY', 'LABOR_DAY', 'MEMORIAL_DAY', 'INDEPENDENCE_DAY', 'FLAG_DAY', 'ARBOR_DAY', 'EARTH_DAY', 'SAINT_PATRICK_DAY', 'CINCO_DE_MAYO', 'DIWALI', 'HANUKKAH', 'KWANZAA', 'PASSOVER', 'YOM_KIPPUR', 'RID_AL_FITR', 'RID_AL_ADHA', 'CHINESE_NEW_YEAR', 'CARNIVAL', 'MARDI_GRAS', 'OKTOBERFEST', 'THANKSGIVING_CANADIAN', 'BOXING_DAY', 'EPIPHANY', 'ASCENSION_DAY', 'WHIT_SUNDAY', 'CORPUS_CHRISTI', 'ADVENT', 'ALL_SAINTS_DAY', 'ALL_SOULS_DAY', 'VETERANS_DAY', 'ARMISTICE_DAY', 'UNITED_NATIONS_DAY', 'WORLD_ENVIRONMENT_DAY', 'HUMAN_RIGHTS_DAY', 'WOMEN_INTERNATIONAL_DAY', 'WATER_DAY', 'FOREST_DAY'],
            'COOKING' => ['BAKE', 'BOIL', 'FRY', 'GRILL', 'STEAM', 'ROAST', 'BROIL', 'SIMMER', 'SAUTÉ', 'BLANCH', 'POACH', 'BRAISE', 'STEW', 'MARINATE', 'DICE', 'MINCE', 'CHOP', 'SLICE', 'JULIENNE', 'BRUNOISE', 'WHISK', 'BLEND', 'PUREE', 'STRAIN', 'SIFT', 'FOLD', 'KNEAD', 'PROOF', 'TEMPER', 'CARAMELIZE', 'DEGLAZE', 'REDUCE', 'EMULSIFY', 'GELATINIZE', 'CURE', 'SMOKE', 'PICKLE', 'FERMENT', 'INFUSE', 'INFUSION', 'CONSOMME', 'ROUX', 'BEURRE_BLANC', 'HOLLANDAISE', 'BEARNAISE', 'GRAVY', 'REDUCTION', 'GASTRIQUE', 'JUS', 'COULIS'],
            'DRINKS' => ['WATER', 'COFFEE', 'TEA', 'JUICE', 'SODA', 'BEER', 'WINE', 'SPIRITS', 'VODKA', 'WHISKEY', 'RUM', 'GIN', 'TEQUILA', 'BRANDY', 'COGNAC', 'CHAMPAGNE', 'PROSECCO', 'CIDER', 'SAKE', 'MEAD', 'MILK', 'YOGURT_DRINK', 'SMOOTHIE', 'MILKSHAKE', 'LATTE', 'CAPPUCCINO', 'ESPRESSO', 'AMERICANO', 'MACCHIATO', 'MOCHA', 'FRAPPUCCINO', 'ICED_COFFEE', 'COLD_BREW', 'GREEN_TEA', 'BLACK_TEA', 'HERBAL_TEA', 'OOLONG_TEA', 'MATCHA', 'CHAI', 'LEMONADE', 'ICED_TEA', 'KOMBUCHA', 'COCKTAIL', 'MARTINI', 'MARGARITA', 'PINA_COLADA', 'MOJITO', 'DAIQUIRI', 'COSMOPOLITAN', 'MIMOSA']
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
                $game['state']['votingStartTime'] = time();
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
            // Calculate points
            self::calculateRoundPoints($game);
            
            // Transition directly to results phase
            $game['state']['phase'] = 'results';
            $game['state']['resultStartTime'] = time();
        }
        
        self::updateGame($code, $game);
        return true;
    }
    
    public static function calculateRoundPoints(&$game) {
        // Initialize stats if not present
        if (!isset($game['state']['playerStats'])) {
            $game['state']['playerStats'] = [];
        }
        
        $imposterId = $game['state']['imposterPlayer'];
        $imposterName = $game['players'][$imposterId]['name'] ?? 'Unknown';
        
        // Count votes for the imposter
        $imposterVotes = 0;
        foreach ($game['state']['votes'] as $voterId => $votedFor) {
            if ($votedFor === $imposterId) {
                $imposterVotes++;
            }
        }
        
        // Check if imposter was caught (more than half voted for them)
        $imposterCaught = $imposterVotes >= ceil(count($game['players']) / 2);
        $pointsPerCorrectVote = 10;
        $imposterEscapePoints = 20;
        
        // Award points
        if ($imposterCaught) {
            // Imposter was caught - everyone else gets points for voting correctly, imposter gets 0
            foreach ($game['players'] as $playerId => $player) {
                $playerName = $player['name'];
                
                if ($playerId === $imposterId) {
                    // Imposter was caught - no points
                    $game['state']['playerStats'][$playerName] = (int)(($game['state']['playerStats'][$playerName] ?? 0));
                } else if (isset($game['state']['votes'][$playerId]) && $game['state']['votes'][$playerId] === $imposterId) {
                    // Voted for the imposter correctly
                    $game['state']['playerStats'][$playerName] = (int)(($game['state']['playerStats'][$playerName] ?? 0)) + $pointsPerCorrectVote;
                }
            }
        } else {
            // Imposter escaped - imposter gets points, others get 0
            foreach ($game['players'] as $playerId => $player) {
                $playerName = $player['name'];
                
                if ($playerId === $imposterId) {
                    // Imposter escaped successfully
                    $game['state']['playerStats'][$playerName] = (int)(($game['state']['playerStats'][$playerName] ?? 0)) + $imposterEscapePoints;
                }
            }
        }
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
        $game['state']['votingStartTime'] = null;
        $game['state']['resultStartTime'] = null;
        
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
