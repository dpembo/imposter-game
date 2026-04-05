# Quick Start Guide - IMPOSTER Game

## Step 1: Start the Server

Choose one of these methods to run the game:

### Option A: PHP Built-in Server (Recommended for Testing)
```bash
cd imposter
php -S localhost:8000
```

### Option B: XAMPP/WAMP
1. Place `imposter` folder in `htdocs`
2. Start Apache and PHP services
3. Visit `http://localhost/imposter`

### Option C: Docker
```bash
docker run -p 8000:80 -v "$(pwd)/imposter":/var/www/html php:8.0-apache
```

## Step 2: Open in Browser

Navigate to `http://localhost:8000` in your web browser

## Step 3: Create/Join a Game

### To CREATE a game:
1. Click **"Create Game"** button
2. Enter your name (e.g., "Alice")
3. Set rounds: **3**
4. Set players: **4**
5. Categories: **All Categories** (or choose specific ones)
6. Click **"Create"** → You'll get a **5-char code** (e.g., "GAME1")
7. Share this code with other players

### To JOIN a game:
1. Get the game code from the creator (e.g., "GAME1")
2. Click **"Join Game"** button
3. Enter the code: **GAME1**
4. Enter your name (e.g., "Bob")
5. Click **"Join"** → Wait in the lobby

## Step 4: Start Playing

### For the Game Creator:
1. Wait for players to join (shows in lobby)
2. Click **"Start Game"** when all players are ready

### For All Players:
1. **Word Reveal Phase**: See your secret word (or "IMPOSTER" badge if you're the imposter)
2. **3 Rounds of Turns**:
   - Players take turns saying related words
   - Imposter has to blend in and avoid detection
3. **Voting Phase**: Vote on who you think is the imposter
4. **Results**: See who was the imposter and earn points
5. **Next Round**: New word, category, and starting player

## Game Flow Example

**Players**: Alice (Creator), Bob, Carol, Dave

**Round 1:**
- ✅ Word: **"APPLE"**, Category: **"FOOD"**
- 🎯 Imposter: **Carol**
- Alice says: "juicy"
- Bob says: "crisp"
- Carol (imposter) says: "seed" (blending in!)
- Dave says: "red"
- 🗳️ Vote: 3 players vote Carol → **Caught!** +10 pts each
- Carol (imposter) gets 0 pts

**Round 2:**
- New word selected
- New imposter selected
- Starting player rotates
- Repeat!

## Tips for Playing

### If You Know the Word:
✓ Use obvious but varied words
✓ Watch other players for duplicates
✓ The imposter might repeat similar themes

### If You're the Imposter:
✓ Listen carefully to the category and words
✓ Say something plausible but avoid being obvious
✓ Take time with your answer - hesitation looks suspicious
✓ Don't say words that are TOO generic

### General Tips:
✓ Pay attention to patterns in word choices
✓ Vote based on word deviation from the theme
✓ Remember who said similar words
✓ Volume, hesitation, and confidence matter!

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit word or vote |
| `Escape` | Return to menu (from lobby) |

## Troubleshooting

### "Game code not found"
- Verify you're using the correct 5-character code
- Ensure the game hasn't expired (games auto-cleanup after 30 mins)
- Check that the creator has started the game

### "Game is full"
- Maximum 8 players per game
- Create a new game with fewer expected players

### No sound effects?
- Check browser volume settings
- Try in a different browser
- Sounds use Web Audio API - some older browsers may not support

### Lag between players?
- Game polls every 500ms for updates
- This is normal and intentional to reduce server load
- Ensure stable internet connection

## Scoring System

| Achievement | Points |
|------------|--------|
| Catch the imposter (per player) | +10 |
| Imposter escapes | +20 |
| Bonus for all rounds | Leaderboard at end |

## Categories Available (30+)

Animals, Food, Sports, Movies, Countries, Music, Technology, Weather, Body Parts, Colors, Professions, Vehicles, Clothes, Furniture, Emotions, Geography, Fantasy, Nature, Heroes, History, Science, Literature, Games, Universe, Holidays, Cooking, Drinks, and more!

## Need Help?

1. **Check the README.md** for detailed documentation
2. **Open browser console** (F12) to see any errors
3. **Check PHP logs** if using a server
4. **Verify `/data/games.json` is writable** (chmod 755 on Linux)

---

## Have Fun! 🎉

Ready to play? Create a game and share the code with friends!

Remember: The imposter is always one of you... 👀
