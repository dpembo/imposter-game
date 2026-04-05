# 🎭 IMPOSTER - Party Game

A real-time multiplayer web-based party game where players try to identify who the imposter is!

## Features

✨ **Smooth Gameplay**
- Real-time synchronization between all players
- Beautiful, modern UI with animations
- Dynamic sound effects using Web Audio API
- Responsive design for all devices

🎮 **Game Mechanics**
- 30 word categories with 50 words each
- Customizable number of players (2-8)
- Configurable game rounds
- 3-turn gameplay per round
- Voting system to identify the imposter
- Dynamic scoring and leaderboard

🎨 **Customization**
- Select specific categories or play with all
- Adjust number of rounds
- Choose player count
- Rotating starting player each round

## Requirements

- PHP 7.0+
- Modern web browser with JavaScript enabled
- Local server (Apache, Nginx, or PHP built-in server)

## Installation

1. Clone the repository or download the files
2. Place the project folder in your web server's root directory
3. No database setup needed - uses JSON file storage

## Running the Game

### Using PHP Built-in Server
```bash
cd /path/to/imposter
php -S localhost:8000
```

Then open your browser to `http://localhost:8000`

### Using Apache
1. Place the folder in `htdocs` (XAMPP/WAMP) or document root (Apache)
2. Access via `http://localhost/imposter`

### Using Nginx
Configure as needed and access the application

## How to Play

### Creating a Game
1. Click **"Create Game"** on the menu
2. Enter your name
3. Choose number of rounds (1-10)
4. Select number of players (2-8)
5. Choose categories (or select "All Categories")
6. Click **"Create"** to generate a game code

### Joining a Game
1. Click **"Join Game"** on the menu
2. Enter the 5-character game code
3. Enter your name
4. Click **"Join"**

### Game Flow
1. **Lobby Phase**: Wait for initiator to start the game
2. **Word Assignment**: All players see the secret word, imposter only sees the category
3. **Rounds**: 3 turns per round where players say related words
4. **Voting**: All players vote on who they think is the imposter
5. **Results**: See who was the imposter, scoring, and leaderboard

### Scoring
- **Catch the Imposter**: +10 points for everyone except imposter
- **Imposter Escapes**: +20 points for imposter
- **New Round**: Starting player rotates

## Game Structure

```
imposter/
├── index.html                 # Main HTML file
├── api/
│   ├── GameManager.php        # Core game logic
│   ├── create_game.php        # Create game endpoint
│   ├── join_game.php          # Join game endpoint
│   ├── get_game_state.php     # Sync game state
│   ├── start_game.php         # Start game endpoint
│   ├── submit_word.php        # Submit word endpoint
│   ├── submit_vote.php        # Submit vote endpoint
│   └── start_round.php        # Start next round endpoint
├── assets/
│   ├── css/
│   │   └── style.css          # Main stylesheet
│   └── js/
│       ├── audio.js           # Dynamic sound effects
│       └── app.js             # Game application logic
├── data/
│   ├── words.js               # 30 categories × 50 words
│   └── games.json             # Game state storage
└── README.md                  # This file
```

## Categories Included

- Animals
- Food
- Sports
- Movies
- Countries
- Music
- Technology
- Weather
- Body Parts
- Colors
- Professions
- Vehicles
- Clothes
- Furniture
- Emotions
- Geography
- Fantasy
- Nature
- Heroes
- History
- Science
- Literature
- Games
- Universe
- Holidays
- Cooking
- Drinks
- ... and more!

## Sound Effects

The game includes dynamic sound effects for:
- **Click**: Button interactions
- **Join**: Player joins game
- **Reveal**: Word reveal
- **Vote**: Voting
- **Caught**: Imposter caught
- **Notification**: Game events

## Technical Details

### Real-time Synchronization
- Clients poll the server every 500ms for game state updates
- All players see updates simultaneously
- No WebSocket required - works with simple HTTP polling

### Sound Generation
- Uses Web Audio API for dynamic sound synthesis
- No audio files needed - all sounds generated in real-time
- Works in all modern browsers

### Game State Management
- JSON-based storage in `data/games.json`
- Auto-cleanup of old games
- Support for multiple concurrent games

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Opera 76+

## Troubleshooting

### Game code not generating
- Check PHP file permissions on the `/data` directory
- Ensure `/data/` directory exists and is writable

### Sounds not playing
- Ensure browser allows audio playback
- Check browser's audio permissions
- Try in incognito/private mode

### Polling not working
- Check browser console for CORS issues
- Verify PHP headers are set correctly
- Ensure server supports JSON responses

## Future Enhancements

- WebSocket support for faster synchronization
- User accounts and persistent statistics
- Custom word lists
- Difficulty levels
- Spectator mode
- Mobile app version

## License

This game is free to use and modify for personal or educational purposes.

## Support

For issues or suggestions, please check the game code or modify as needed.

---

Enjoy the game! May the best imposter win! 🎭
