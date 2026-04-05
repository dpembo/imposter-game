// Helper function to generate or retrieve persistent player ID
function getOrCreatePlayerId() {
    let playerId = localStorage.getItem('imposterPlayerId');
    if (!playerId) {
        playerId = 'player_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('imposterPlayerId', playerId);
    }
    return playerId;
}

// Main Game Application
class ImposterGame {
    constructor() {
        this.currentScreen = 'menu';
        this.gameCode = null;
        this.playerName = null;
        this.playerId = getOrCreatePlayerId();
        this.isInitiator = false;
        this.players = [];
        this.currentPlayer = null;
        this.gameSettings = {
            numRounds: 1,
            categories: [],
            maxPlayers: 8,
            gameMode: 'online',  // 'online', 'silent', or 'passplay'
            imposterHints: true  // Show category hint to imposter
        };
        this.gameState = {
            currentRound: 0,
            currentTurn: 0,
            totalTurns: 3,
            word: null,
            category: null,
            imposterPlayer: null,
            wordsSaid: {},
            votes: {},
            gameActive: false
        };
        this.stats = {
            rounds: [],
            playerTotals: {},
            playerStats: {},  // Track per-player stats: imposterCount, thinkTimes[], etc.
            lastAccumulatedStats: {}  // Track what we've already added to totals to prevent double-accumulation
        };
        this.pollInterval = null;
        this.revealTimerId = null;
        this.votingTimerId = null;
        this.resultsTimerId = null;
        this.screenChangeCallback = null;
    }

    generateGameCode() {
        // Use only clear characters: excludes I, L, O (letters) and 0, 1, 5 (numbers) to avoid confusion
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ2346789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async startGame(playerCount = 4, gameMode = 'online') {
        try {
            const response = await fetch('api/create_game.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    initiator: this.playerName,
                    playerCount: playerCount,
                    categories: this.gameSettings.categories,
                    numRounds: this.gameSettings.numRounds,
                    gameMode: gameMode,
                    imposterHints: this.gameSettings.imposterHints
                })
            });

            const data = await response.json();
            if (data.success) {
                this.gameCode = data.code;
                this.playerId = data.playerId;
                localStorage.setItem('imposterPlayerId', this.playerId);
                audio.playSound('join');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error starting game:', error);
            return false;
        }
    }

    async joinGame(code, name) {
        try {
            const response = await fetch('api/join_game.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code.toUpperCase(),
                    playerName: name,
                    playerId: this.playerId
                })
            });

            const data = await response.json();
            if (data.success) {
                this.gameCode = code.toUpperCase();
                this.playerName = name;
                this.playerId = data.playerId;
                localStorage.setItem('imposterPlayerId', this.playerId);
                this.isInitiator = data.isInitiator;
                audio.playSound('join');
                this.startPolling();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error joining game:', error);
            return false;
        }
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);

        let lastState = JSON.stringify(this.gameState);
        let lastPlayersCount = this.players ? this.players.length : 0;
        
        // Reset score tracking to prevent double-accumulation
        this.stats.lastAccumulatedStats = {};

        this.pollInterval = setInterval(async () => {
            try {
                const timestamp = Date.now();
                const response = await fetch(`api/get_game_state.php?code=${this.gameCode}&t=${timestamp}`, {
                    cache: 'no-store'
                });
                const data = await response.json();

                if (data.success) {
                    const oldScreen = this.currentScreen;
                    const currentState = JSON.stringify(data.state);
                    const currentPlayersCount = data.players ? data.players.length : 0;
                    const hasStateChanged = lastState !== currentState;
                    const hasPlayersChanged = lastPlayersCount !== currentPlayersCount;

                    // Play sound when player joins or leaves lobby
                    if (hasPlayersChanged && this.currentScreen === 'lobby') {
                        if (currentPlayersCount > lastPlayersCount) {
                            // Player joined
                            audio.playSound('join');
                        } else if (currentPlayersCount < lastPlayersCount) {
                            // Player left
                            audio.playSound('notification');
                        }
                    }

                    // Update game state
                    this.gameState = data.state;
                    
                    // Accumulate player stats into totals for leaderboard (only add the difference)
                    if (data.playerStats) {
                        for (const playerName in data.playerStats) {
                            const currentScore = parseInt(data.playerStats[playerName]) || 0;
                            const lastScore = parseInt(this.stats.lastAccumulatedStats[playerName]) || 0;
                            const scoreIncrease = currentScore - lastScore;
                            
                            if (scoreIncrease > 0) {
                                this.stats.playerTotals[playerName] = (parseInt(this.stats.playerTotals[playerName]) || 0) + scoreIncrease;
                                this.stats.lastAccumulatedStats[playerName] = currentScore;
                            }
                        }
                    }
                    
                    // Play sound if it's this player's turn
                    const oldPlayer = this.currentPlayer;
                    this.currentPlayer = data.state.currentPlayer?.id;
                    if (oldPlayer !== this.currentPlayer && this.currentPlayer === this.playerId && this.currentScreen === 'game') {
                        audio.playSound('notification');
                    }
                    
                    this.players = data.players;
                    this.gameSettings.numRounds = data.numRounds || this.gameSettings.numRounds;
                    this.gameSettings.gameMode = data.gameMode || this.gameSettings.gameMode;
                    this.gameSettings.imposterHints = data.imposterHints !== undefined ? data.imposterHints : this.gameSettings.imposterHints;
                    lastState = currentState;
                    lastPlayersCount = currentPlayersCount;

                    // Determine current screen based on game state
                    let newScreen = this.currentScreen;
                    if (data.state.gameActive) {
                        if (data.state.phase === 'voting') {
                            newScreen = 'voting';
                        } else if (data.state.phase === 'results') {
                            newScreen = 'results';
                            // Only play sound when transitioning INTO results
                            if (oldScreen !== 'results') {
                                console.log('Transitioning to results, playing sound');
                                audio.playSound('caught');
                            }
                        } else {
                            newScreen = 'game';
                        }
                    } else if (data.state.gameStarted) {
                        newScreen = 'lobby';
                    }
                    
                    // Log transitions
                    if (oldScreen !== newScreen) {
                        console.log(`Screen transition: ${oldScreen} -> ${newScreen}, phase: ${data.state.phase}`);
                    }
                    
                    this.currentScreen = newScreen;

                    // Only re-render if something actually changed
                    if (oldScreen !== this.currentScreen || hasStateChanged || hasPlayersChanged) {
                        this.render();
                    }
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 500);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        if (this.votingTimerId) {
            clearInterval(this.votingTimerId);
            this.votingTimerId = null;
        }
        if (this.revealTimerId) {
            clearInterval(this.revealTimerId);
            this.revealTimerId = null;
        }
        if (this.resultsTimerId) {
            clearInterval(this.resultsTimerId);
            this.resultsTimerId = null;
        }
    }

    async submitWord(word) {
        try {
            const response = await fetch('api/submit_word.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.gameCode,
                    playerId: this.playerId,
                    word: word,
                    turn: this.gameState.currentTurn
                })
            });

            const data = await response.json();
            if (data.success) {
                audio.playSound('click');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error submitting word:', error);
            return false;
        }
    }

    async submitVote(targetPlayerId) {
        try {
            const response = await fetch('api/submit_vote.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.gameCode,
                    playerId: this.playerId,
                    votedFor: targetPlayerId
                })
            });

            const data = await response.json();
            if (data.success) {
                audio.playSound('vote');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error submitting vote:', error);
            return false;
        }
    }

    async startNextRound() {
        if (!this.isInitiator) return;

        // Clear any active timers
        if (this.votingTimerId) {
            clearInterval(this.votingTimerId);
            this.votingTimerId = null;
        }
        if (this.revealTimerId) {
            clearInterval(this.revealTimerId);
            this.revealTimerId = null;
        }
        if (this.resultsTimerId) {
            clearInterval(this.resultsTimerId);
            this.resultsTimerId = null;
        }

        try {
            const response = await fetch('api/start_round.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.gameCode
                })
            });

            const data = await response.json();
            if (data.success) {
                audio.playSound('click');
                
                // Immediately fetch updated game state to get new imposter and round data
                const stateResponse = await fetch(`api/get_game_state.php?code=${this.gameCode}&t=${Date.now()}`, {
                    cache: 'no-store'
                });
                const stateData = await stateResponse.json();
                
                if (stateData.success) {
                    this.gameState = stateData.state;
                    this.players = stateData.players;
                    this.currentScreen = 'game';
                    this.render();
                }
                
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error starting next round:', error);
            return false;
        }
    }

    render() {
        const app = document.getElementById('app');
        app.innerHTML = '';

        switch (this.currentScreen) {
            case 'menu':
                app.appendChild(this.renderMenu());
                break;
            case 'join':
                app.appendChild(this.renderJoin());
                break;
            case 'lobby':
                app.appendChild(this.renderLobby());
                break;
            case 'game':
                app.appendChild(this.renderGame());
                break;
            case 'voting':
                app.appendChild(this.renderVoting());
                break;
            case 'results':
                app.appendChild(this.renderResults());
                break;
            default:
                app.appendChild(this.renderMenu());
        }
    }

    renderMenu() {
        const div = document.createElement('div');
        div.className = 'screen menu-screen active';
        div.innerHTML = `
            <div class="menu-content">
                <h1 class="game-title">IMPOSTER</h1>
                <p class="game-subtitle">Can you blend in?</p>
                <div class="menu-buttons">
                    <button class="btn-primary" onclick="game.showCreateGame()">Create Game</button>
                    <button class="btn-secondary" onclick="game.currentScreen = 'join'; game.render()">Join Game</button>
                </div>
            </div>
        `;
        return div;
    }

    renderJoin() {
        const div = document.createElement('div');
        div.className = 'screen join-screen active';
        div.innerHTML = `
            <div class="join-container">
                <h2 class="join-title">Join Game</h2>
                <div>
                    <input type="text" class="join-code-input" id="gameCode" placeholder="Game Code" maxlength="5" style="text-transform: uppercase;">
                    <input type="text" class="name-input" id="playerName" placeholder="Your Name" maxlength="20">
                    <div class="button-group">
                        <button class="btn-primary" onclick="game.joinGameHandler()">Join</button>
                        <button class="btn-danger" onclick="game.currentScreen = 'menu'; game.render()">Back</button>
                    </div>
                </div>
            </div>
        `;
        return div;
    }

    renderLobby() {
        const div = document.createElement('div');
        div.className = 'screen lobby-screen active';

        let categoryHTML = '<div class="category-grid">';
        const allCategories = Object.keys(typeof WORD_DATABASE !== 'undefined' ? WORD_DATABASE : {});
        let selected = this.gameSettings.categories || [];
        
        // Filter out 'ALL' from selected list for checking
        let realCategories = selected.filter(cat => cat !== 'ALL');
        
        // If none selected, treat as all categories
        if (!selected.length || (selected.length === 1 && selected[0] === 'ALL')) {
            categoryHTML += '<span style="grid-column: 1 / -1; text-align: center; color: var(--success);">✓ All Categories Selected</span>';
        } else if (realCategories.length === allCategories.length) {
            // If all are selected, show message
            categoryHTML += '<span style="grid-column: 1 / -1; text-align: center; color: var(--success);">✓ All Categories Selected</span>';
        } else {
            // Show only selected categories (not 'ALL')
            realCategories.forEach(cat => {
                categoryHTML += `<div class="category-btn selected">${cat.replace(/_/g, ' ')}</div>`;
            });
        }
        categoryHTML += '</div>';

        div.innerHTML = `
            <div class="lobby-container">
                <div class="lobby-content-scroll">
                    <div class="lobby-header">
                        <h2 class="lobby-title">Game Lobby</h2>
                        <div class="game-code-display">${this.gameCode}</div>
                    </div>

                    ${this.isInitiator ? `
                        <div class="lobby-settings">
                            <div class="setting-group">
                                <label class="setting-label">Number of Rounds</label>
                                <input type="number" class="setting-input" id="numRounds" value="${this.gameSettings.numRounds}" min="1" max="10">
                            </div>
                            <div class="setting-group">
                                <label class="setting-label">Select Categories</label>
                                <button class="btn-secondary" style="margin-top: 0.5rem;" onclick="game.showCategorySelection()">Choose Categories</button>
                            </div>
                        </div>
                    ` : ''}

                    <h3 class="category-title">Categories:</h3>
                    ${categoryHTML}

                    <h3 class="category-title" style="margin-top: 2rem;">Players (${this.players.length}/${this.gameSettings.maxPlayers})</h3>
                    <div class="players-list">
                        ${this.players.map(p => `
                            <div class="player-item ${p.isInitiator ? 'is-initiator' : ''}">
                                <div class="player-name">${p.name}${p.isMe ? ' (You)' : ''}</div>
                                <div class="player-status">${p.ready ? '✓ Ready' : 'Joining...'}</div>
                                ${p.isInitiator ? '<div class="initiator-badge">INITIATOR</div>' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="lobby-actions">
                    ${this.isInitiator ? `
                        <button class="btn-primary" onclick="game.startGameSession()">Start Game</button>
                    ` : `
                        <button class="btn-secondary" disabled>Waiting for Initiator...</button>
                    `}
                    <button class="btn-danger" onclick="game.leaveGame()">Leave</button>
                </div>
            </div>
        `;
        return div;
    }

    renderGame() {
        const div = document.createElement('div');
        div.className = 'screen game-screen active';

        console.log('renderGame called:', { currentTurn: this.gameState.currentTurn, totalTurns: this.gameState.totalTurns, currentPlayer: this.gameState.currentPlayer?.name });

        const isCurrentPlayer = this.gameState.currentPlayer?.id === this.playerId;
        const isImposter = this.gameState.imposterPlayer?.id === this.playerId;
        const gameMode = this.gameSettings.gameMode;

        // Find your own name
        const yourPlayer = this.players?.find(p => p.id === this.playerId);
        const yourName = yourPlayer?.name || 'You';

        let wordDisplay = '';
        if (isImposter) {
            if (this.gameSettings.imposterHints) {
                wordDisplay = `<div class="reveal-label">Category</div><div class="reveal-content">${this.gameState.category}</div><div style="margin-top: 1rem;"><div class="imposter-badge">YOU ARE THE IMPOSTER</div></div>`;
            } else {
                wordDisplay = `<div style="margin-top: 1rem;"><div class="imposter-badge">YOU ARE THE IMPOSTER</div></div><div style="margin-top: 1rem; text-align: center; opacity: 0.7;">No hints available</div>`;
            }
        } else if (this.gameState.word) {
            wordDisplay = `<div class="reveal-label">Word</div><div class="reveal-content">${this.gameState.word}</div>`;
        } else {
            wordDisplay = `<div class="reveal-label">Waiting...</div>`;
        }

        let wordsHtml = '';
        if (this.gameState.wordsSaid && Object.keys(this.gameState.wordsSaid).length > 0) {
            wordsHtml = '<div class="words-said">' +
                Object.entries(this.gameState.wordsSaid).map(([playerId, word]) => {
                    const player = this.players.find(p => p.id === playerId);
                    return `
                        <div class="word-chip">
                            <div class="chip-player">${player?.name || 'Unknown'}</div>
                            <div class="chip-word">"${word}"</div>
                        </div>
                    `;
                }).join('') +
                '</div>';
        }

        const currentPlayerName = this.gameState.currentPlayer?.name || 'Unknown';
        
        // Build the input section based on game mode
        let inputSection = '';
        if (isCurrentPlayer) {
            if (gameMode === 'passplay') {
                // Pass and Play mode - just show Pass button
                const nextPlayerIndex = (this.gameState.currentTurn + 1) % this.players.length;
                const nextPlayerName = this.players[nextPlayerIndex]?.name || 'Next Player';
                inputSection = `
                    <div style="text-align: center; margin-bottom: 1rem; font-size: 0.95rem; color: var(--light); opacity: 0.8;">
                        You've seen the word. Ready to pass?
                    </div>
                    <div class="input-section" style="justify-content: center;">
                        <button class="btn-submit" style="flex: 1; max-width: 300px;" onclick="game.passToNextPlayer()">
                            Pass to ${nextPlayerName}
                        </button>
                    </div>
                `;
            } else if (gameMode === 'silent') {
                // Silent mode - only typing, no speaking
                inputSection = `
                    <div style="text-align: center; margin-bottom: 1rem; font-size: 0.9rem; color: var(--light); opacity: 0.8;">Type a related word:</div>
                    <div class="input-section">
                        <input type="text" class="word-input" id="wordInput" placeholder="Type a word..." maxlength="30">
                        <button class="btn-submit" onclick="game.submitGuess()">Submit</button>
                    </div>
                `;
            } else {
                // Online mode - both typing and continue (speaking)
                inputSection = `
                    <div style="text-align: center; margin-bottom: 1rem; font-size: 0.9rem; color: var(--light); opacity: 0.8;">Type your word or click Continue if playing in person:</div>
                    <div class="input-section">
                        <input type="text" class="word-input" id="wordInput" placeholder="Say a related word..." maxlength="30">
                        <button class="btn-submit" onclick="game.submitGuess()">Submit</button>
                        <button class="btn-submit" style="background: linear-gradient(135deg, var(--secondary), var(--accent));" onclick="game.continueWithoutWord()">Continue</button>
                    </div>
                `;
            }
        } else {
            inputSection = `
                <div style="text-align: center; color: var(--light); opacity: 0.7; padding: 1rem;">
                    Waiting for ${currentPlayerName} to ${gameMode === 'silent' ? 'type' : 'speak'}...
                </div>
            `;
        }

        div.innerHTML = `
            <div class="game-header">
                <div class="game-title-small">Round ${this.gameState.currentRound + 1}/${this.gameSettings.numRounds} • Turn ${this.gameState.currentTurn + 1}/${this.gameState.totalTurns}</div>
                <div class="game-stats-mini">
                    <div class="stat-item">
                        <div class="stat-label">Players</div>
                        <div class="stat-value">${this.players.length}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Code</div>
                        <div class="stat-value">${this.gameCode}</div>
                    </div>
                </div>
            </div>

            <div class="game-main">
                <div class="game-content">
                    <div class="word-reveal">${wordDisplay}</div>

                    <div class="turn-container">
                        <div class="current-player">🎤 ${currentPlayerName}'s Turn</div>
                        <div class="turn-number">Round ${this.gameState.currentRound + 1}, Turn ${this.gameState.currentTurn + 1} of ${this.gameState.totalTurns}</div>
                        ${isCurrentPlayer ? '<div style="color: var(--success); font-weight: bold; margin-top: 0.5rem;">⬇ Your turn!</div>' : ''}
                        ${wordsHtml}
                    </div>

                    ${inputSection}
                </div>
            </div>
        `;

        return div;
    }

    updateVotingTimer() {
        const votingStartTime = this.gameState?.votingStartTime;
        if (!votingStartTime || typeof votingStartTime !== 'number' || votingStartTime <= 0) return;
        
        const clientTimeSeconds = Math.floor(Date.now() / 1000);
        const elapsedSeconds = clientTimeSeconds - votingStartTime;
        const remainingSeconds = Math.max(0, 20 - elapsedSeconds);
        
        const timerDisplay = document.getElementById('voting-timer-display');
        const votesDisplay = document.getElementById('voting-votes-display');
        
        if (timerDisplay) {
            timerDisplay.textContent = Math.floor(remainingSeconds);
        }
        
        // Auto-advance if time expires
        if (remainingSeconds <= 0 && this.votingTimerId) {
            clearInterval(this.votingTimerId);
            this.votingTimerId = null;
            // Could add auto-transition logic here
        }
    }

    updateResultsTimer() {
        const resultStartTime = this.gameState?.resultStartTime;
        if (!resultStartTime || typeof resultStartTime !== 'number' || resultStartTime <= 0) return;
        
        const clientTimeSeconds = Math.floor(Date.now() / 1000);
        const elapsedSeconds = clientTimeSeconds - resultStartTime;
        const remainingSeconds = Math.max(0, 30 - elapsedSeconds);
        
        const timerDisplay = document.getElementById('results-timer-display');
        
        if (timerDisplay) {
            timerDisplay.textContent = Math.floor(remainingSeconds);
        }
        
        // Auto-advance to next round if time expires and not final round
        if (remainingSeconds <= 0 && this.resultsTimerId) {
            clearInterval(this.resultsTimerId);
            this.resultsTimerId = null;
            
            const isFinalRound = this.gameState.currentRound >= this.gameSettings.numRounds - 1;
            if (!isFinalRound && this.isInitiator) {
                this.startNextRound();
            }
        }
    }

    renderVoting() {
        const div = document.createElement('div');
        div.className = 'screen voting-screen active';
        div.style.cssText = 'width: 100%; height: 100%; display: flex !important; flex-direction: column; align-items: center; justify-content: center; position: relative; z-index: 10;';

        try {
            const votingStartTime = this.gameState?.votingStartTime;
            const playersArray = this.players || [];
            const votesObj = this.gameState?.votes || {};
            const votesCount = Object.keys(votesObj).length;
            
            // Calculate countdown timer (20 seconds)
            let remainingSeconds = 20;
            if (votingStartTime && typeof votingStartTime === 'number' && votingStartTime > 0) {
                const clientTimeSeconds = Math.floor(Date.now() / 1000);
                const elapsedSeconds = clientTimeSeconds - votingStartTime;
                remainingSeconds = Math.max(0, 20 - elapsedSeconds);
            }
            
            console.log('renderVoting:', { votingStartTime, playersCount: playersArray.length, votesCount, remainingSeconds });
            
            // Set up voting timer - updates ONLY the countdown, not the entire screen
            if (!this.votingTimerId && votingStartTime && typeof votingStartTime === 'number' && votingStartTime > 0) {
                this.votingTimerId = setInterval(() => {
                    if (this.currentScreen === 'voting') {
                        this.updateVotingTimer();
                    }
                }, 100);
            }

            let html = '<div class="voting-container" style="background: rgba(131, 56, 236, 0.2) !important; border: 3px solid yellow !important; display: flex !important; flex-direction: column; align-items: center; gap: 1.5rem; width: 90%; max-width: 900px; padding: 3rem;"><h2 class="voting-title">👮 Who is the Imposter?</h2>';
            
            // Check if votingStartTime is valid
            if (!votingStartTime || typeof votingStartTime !== 'number' || votingStartTime <= 0) {
                html += '<div style="text-align: center; padding: 2rem; background: rgba(255, 255, 255, 0.1); border-radius: 10px; margin: 2rem; color: var(--secondary);">';
                html += '<div style="font-size: 1.5rem; margin-bottom: 1rem;">⏳ Waiting for voting to start...</div>';
                html += '<div style="font-size: 0.9rem; color: var(--light);">votingStartTime: ' + votingStartTime + ' (type: ' + typeof votingStartTime + ')</div>';
                html += '</div>';
            } else if (playersArray.length === 0) {
                html += '<div style="text-align: center; padding: 2rem; color: var(--error);">No players loaded</div>';
            } else {
                // Render vote cards - disable self-voting
                html += '<div class="voting-grid" style="width: 100%; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1.5rem;">';
                playersArray.forEach(p => {
                    const isVoted = votesObj[this.playerId] === p.id;
                    const isSelf = p.id === this.playerId;
                    const cardStyle = isSelf ? 'opacity: 0.5; cursor: not-allowed;' : 'cursor: pointer;';
                    const onclickAttr = isSelf ? '' : 'onclick="game.vote(\'' + p.id + '\')"';
                    html += '<div class="vote-card ' + (isVoted ? 'voted' : '') + '" style="' + cardStyle + '" ' + onclickAttr + '>';
                    html += '<div class="vote-name">' + p.name + (p.isMe ? ' (You)' : '') + '</div>';
                    html += '<div class="vote-label">' + (isSelf ? 'Cannot vote for self' : 'Cast Vote') + '</div>';
                    html += '</div>';
                });
                html += '</div>';
            }
            
            html += '<div style="text-align: center; margin-top: 2rem;" id="voting-timer-container">';
            html += '<div style="font-size: 2.5rem; font-weight: bold; color: var(--secondary); margin-bottom: 0.5rem;" id="voting-timer-display">' + Math.floor(remainingSeconds) + '</div>';
            html += '<div style="font-size: 1rem; color: var(--light); opacity: 0.8;">seconds to vote</div>';
            html += '</div>';
            
            html += '<div style="text-align: center; color: var(--light); opacity: 0.7; margin-top: 1rem;" id="voting-votes-display">Votes: ' + votesCount + '/' + playersArray.length + '</div>';
            html += '</div>';
            
            console.log('renderVoting HTML length:', html.length);
            console.log('renderVoting HTML preview:', html.substring(0, 200));
            console.log('renderVoting div class:', div.className);
            
            div.innerHTML = html;
            
            console.log('After innerHTML set, div.innerHTML length:', div.innerHTML.length);
            console.log('div children count:', div.children.length);
        } catch (error) {
            console.error('Error in renderVoting:', error);
            div.innerHTML = '<div class="voting-container" style="background: red; border: 5px solid yellow;"><div style="color: white; text-align: center; padding: 2rem; font-size: 2rem;">Error rendering voting screen: ' + error.message + '</div></div>';
        }

        return div;
    }

    renderResults() {
        const div = document.createElement('div');
        div.className = 'screen results-screen active';
        div.style.cssText = 'width: 100%; height: 100%; display: flex !important; flex-direction: column; align-items: center; justify-content: flex-start; overflow-y: auto; position: relative; z-index: 10; padding-top: 2rem;';

        try {
            const resultStartTime = this.gameState?.resultStartTime;
            const playersArray = this.players || [];
            const votesObj = this.gameState?.votes || {};
            const imposterId = this.gameState?.imposterPlayer?.id;
            const imposterName = this.gameState?.imposterPlayer?.name || 'Unknown';
            const isFinalRound = this.gameState.currentRound >= this.gameSettings.numRounds - 1;
            
            console.log('renderResults:', { resultStartTime, playersCount: playersArray.length, imposter: imposterName, isFinalRound });
            
            // Clear voting timer
            if (this.votingTimerId) {
                clearInterval(this.votingTimerId);
                this.votingTimerId = null;
            }
            
            // Calculate countdown timer (30 seconds for results)
            let remainingSeconds = 30;
            if (resultStartTime && typeof resultStartTime === 'number' && resultStartTime > 0) {
                const clientTimeSeconds = Math.floor(Date.now() / 1000);
                const elapsedSeconds = clientTimeSeconds - resultStartTime;
                remainingSeconds = Math.max(0, 30 - elapsedSeconds);
            }
            
            // Set up results timer - updates ONLY the countdown, not the entire screen
            if (!this.resultsTimerId && resultStartTime && typeof resultStartTime === 'number' && resultStartTime > 0 && remainingSeconds > 0) {
                this.resultsTimerId = setInterval(() => {
                    if (this.currentScreen === 'results') {
                        this.updateResultsTimer();
                    }
                }, 100);
            }

            let html = '<div class="results-container" style="background: rgba(131, 56, 236, 0.2) !important; border: 3px solid lime !important; display: flex !important; flex-direction: column; width: 90%; max-width: 900px; padding: 3rem;\">';
            
            // Check if we have valid result data
            if (!resultStartTime || typeof resultStartTime !== 'number' || resultStartTime <= 0) {
                html += '<h2 class="results-title">🎭 Round Results</h2>';
                html += '<div style="text-align: center; padding: 2rem; background: rgba(255, 255, 255, 0.1); border-radius: 10px; margin: 2rem; color: var(--secondary);">';
                html += '<div style="font-size: 1.5rem; margin-bottom: 1rem;">⏳ Calculating Results...</div>';
                html += '<div style="font-size: 0.9rem; color: var(--light);">resultStartTime: ' + resultStartTime + ' (type: ' + typeof resultStartTime + ')</div>';
                html += '</div>';
            } else if (playersArray.length === 0) {
                html += '<h2 class="results-title">🎭 Round Results</h2>';
                html += '<div style="text-align: center; padding: 2rem; color: var(--error);">No players loaded</div>';
            } else {
                // Render full results
                html += '<h2 class="results-title">' + (isFinalRound ? '🎉 Game Complete!' : 'Round ' + (this.gameState.currentRound + 1) + ' Complete!') + '</h2>';
                
                // Imposter reveal
                html += '<div class="imposter-reveal">';
                html += '<div class="imposter-label">The Imposter Was:</div>';
                html += '<div class="imposter-name">' + imposterName + '</div>';
                html += '</div>';
                
                // Result info
                const imposterVotes = Object.values(votesObj).filter(v => v === imposterId).length;
                const resultText = imposterVotes >= Math.ceil(playersArray.length * 0.5) 
                    ? '✓ The Imposter was caught! Everyone else earns 10 points.'
                    : '✗ The Imposter escaped! The Imposter earns 20 points.';
                
                html += '<div class="result-info">';
                html += '<div class="result-description">' + resultText + '</div>';
                html += '<div style="font-size: 0.9rem; opacity: 0.8;">Votes for imposter: ' + imposterVotes + '/' + playersArray.length + '</div>';
                html += '</div>';
                
                // Voting details
                html += '<div style="margin: 1.5rem 0; padding: 1rem; background: rgba(58,134,255,0.1); border-radius: 10px;">';
                html += '<div style="font-size: 0.9rem; color: var(--accent); font-weight: bold; margin-bottom: 0.8rem;">Voting Results:</div>';
                playersArray.forEach(p => {
                    const votedForId = votesObj[p.id];
                    const votedForPlayer = playersArray.find(pl => pl.id === votedForId);
                    const votedForName = votedForPlayer ? votedForPlayer.name : 'No Vote';
                    const highlight = votedForName === imposterName ? ' style="color: var(--success); font-weight: bold;"' : '';
                    html += '<div style="margin: 0.3rem 0; font-size: 0.85rem;"><span style="opacity: 0.8;">' + p.name + ':</span> <span' + highlight + '>voted for ' + votedForName + '</span></div>';
                });
                html += '</div>';
                
                // Leaderboard
                const leaderboard = Object.entries(this.stats.playerTotals || {})
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10);
                
                html += '<div class="leaderboard">';
                html += '<h3 class="leaderboard-title">🏆 ' + (isFinalRound ? 'Final' : 'Current') + ' Leaderboard</h3>';
                html += '<div class="leaderboard-items">';
                leaderboard.forEach((entry, idx) => {
                    const name = entry[0];
                    const score = entry[1];
                    const rankClass = idx === 0 ? 'first' : idx === 1 ? 'second' : idx === 2 ? 'third' : '';
                    html += '<div class="leaderboard-item ' + rankClass + '">';
                    html += '<div class="leaderboard-rank ' + rankClass + '">' + (idx + 1) + '</div>';
                    html += '<div class="leaderboard-name">' + name + '</div>';
                    html += '<div class="leaderboard-score">' + score + '</div>';
                    html += '</div>';
                });
                html += '</div></div>';
                
                // Timer - only show if not final round
                if (!isFinalRound) {
                    html += '<div style="margin: 2rem 0; text-align: center;" id="results-timer-container">';
                    html += '<div style="font-size: 2.5rem; font-weight: bold; color: var(--secondary); margin-bottom: 0.5rem;" id="results-timer-display">' + Math.floor(remainingSeconds) + '</div>';
                    html += '<div style="font-size: 1rem; color: var(--light); opacity: 0.8;">seconds until next round</div>';
                    html += '</div>';
                }
                
                // Action buttons
                html += '<div class="results-actions">';
                if (!isFinalRound) {
                    if (this.isInitiator) {
                        html += '<button class="btn-primary" onclick="game.startNextRound()">Next Round</button>';
                    } else {
                        html += '<button class="btn-secondary" disabled>Waiting for Initiator...</button>';
                    }
                } else {
                    // Final round - show Play Again and Close Lobby
                    if (this.isInitiator) {
                        html += '<button class="btn-primary" onclick="game.resetAndRestartGame()">Play Again</button>';
                    }
                    html += '<button class="btn-danger" onclick="game.closeLobby()">Close Lobby</button>';
                }
                html += '</div>';
            }
            
            html += '</div>';
            
            console.log('renderResults HTML length:', html.length);
            console.log('renderResults HTML preview:', html.substring(0, 300));
            console.log('renderResults div class:', div.className);
            
            div.innerHTML = html;
            
            console.log('After innerHTML set, div.innerHTML length:', div.innerHTML.length);
            console.log('div children count:', div.children.length);
        } catch (error) {
            console.error('Error in renderResults:', error);
            div.innerHTML = '<div class="results-container" style="background: red; border: 5px solid yellow;"><h2 class="results-title" style="color: white;">Error</h2><div style="color: white; text-align: center; padding: 2rem; font-size: 2rem;">Error rendering results screen: ' + error.message + '</div></div>';
        }

        return div;
    }

    showGameSummary() {
        // Prevent multiple summary windows from being created
        if (document.querySelector('.summary-screen')) return;
        
        const div = document.createElement('div');
        div.className = 'screen results-screen active summary-screen';

        // Calculate final stats for each player
        const playerStats = {};
        this.players.forEach(p => {
            playerStats[p.name] = {
                finalScore: this.stats.playerTotals[p.name] || 0,
                imposterCount: 0,
                timesIdentified: 0
            };
        });

        // Count imposter appearances (would need backend data for complete tracking)
        // For now, calculate from available data
        const leaderboard = Object.entries(this.stats.playerTotals)
            .sort(([,a], [,b]) => b - a)
            .map(([name, score], idx) => ({ name, score, rank: idx + 1 }));

        div.innerHTML = `
            <div class="results-container">
                <h2 class="results-title">🎉 Game Summary</h2>
                
                <div class="summary-stats">
                    <div class="summary-stat-card">
                        <div class="stat-label">Total Rounds</div>
                        <div class="stat-value">${this.gameSettings.numRounds}</div>
                    </div>
                    <div class="summary-stat-card">
                        <div class="stat-label">Players</div>
                        <div class="stat-value">${this.players.length}</div>
                    </div>
                    <div class="summary-stat-card">
                        <div class="stat-label">Winner</div>
                        <div class="stat-value">${leaderboard[0]?.name || 'N/A'}</div>
                    </div>
                </div>

                <div class="final-leaderboard">
                    <h3 style="color: var(--secondary); margin-bottom: 1rem; text-align: center;">Final Rankings</h3>
                    <div class="leaderboard-items">
                        ${leaderboard.map(({name, score, rank}) => `
                            <div class="leaderboard-item ${rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : ''}">
                                <div class="leaderboard-rank ${rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : ''}">${rank}</div>
                                <div class="leaderboard-name">${name}</div>
                                <div class="leaderboard-score">${score}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="results-actions">
                    ${this.isInitiator ? `
                        <button class="btn-primary" onclick="game.resetAndRestartGame()">Play Again</button>
                    ` : ''}
                    <button class="btn-danger" onclick="game.closeLobby()">Close Lobby</button>
                </div>
            </div>
        `;

        document.getElementById('app').appendChild(div);
    }

    async resetAndRestartGame() {
        // Reset game state but keep players and settings
        this.gameState = {
            currentRound: 0,
            currentTurn: 0,
            totalTurns: 3,
            word: null,
            category: null,
            imposterPlayer: null,
            wordsSaid: {},
            votes: {},
            gameActive: false
        };
        this.stats = { rounds: [], playerTotals: {} };
        
        // Restart the game
        await this.startGameSession();
    }

    closeLobby() {
        this.endGame();
    }

    showCreateGame(persisted = {}) {
        // Default to ALL if not set
        if (!this.gameSettings.categories || this.gameSettings.categories.length === 0) {
            this.gameSettings.categories = ['ALL'];
        }
        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            overflow-y: auto;
        `;

        // Show selected categories summary
        let cats = this.gameSettings.categories;
        let catSummary = (cats.length === 0 || cats[0] === 'ALL') ? 'All Categories' : cats.map(c => c.replace(/_/g, ' ')).join(', ');
        if (catSummary.length > 40) catSummary = catSummary.slice(0, 40) + '...';

        // Use persisted values if provided
        const nameVal = persisted.name || '';
        const roundsVal = persisted.rounds || 3;
        const playersVal = persisted.players || 4;
        const modeVal = persisted.mode || 'online';
        const hintsVal = persisted.hints !== undefined ? persisted.hints : this.gameSettings.imposterHints;

        div.innerHTML = `
            <div style="background: var(--dark); border: 2px solid var(--secondary); border-radius: 20px; padding: 2.5rem; max-width: 500px; width: 95%; margin: 2rem auto;">
                <h2 style="color: var(--secondary); margin-bottom: 2rem; text-align: center;">Create New Game</h2>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--accent); font-weight: bold;">Your Name</label>
                    <input type="text" id="createPlayerName" placeholder="Enter name" class="name-input" maxlength="20" value="${nameVal}">
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--accent); font-weight: bold;">Game Mode</label>
                    <select id="gameMode" class="setting-select" style="width: 100%;">
                        <option value="online" ${modeVal === 'online' ? 'selected' : ''}>Mode 3: In Person (Type or Speak) - Online</option>
                        <option value="silent" ${modeVal === 'silent' ? 'selected' : ''}>Mode 2: In Person (Silent) - Multiple Devices</option>
                        <option value="passplay" ${modeVal === 'passplay' ? 'selected' : ''}>Mode 1: Pass and Play - Single Device</option>
                    </select>
                    <div style="font-size: 0.8rem; color: var(--light); opacity: 0.7; margin-top: 0.5rem;">
                        <div id="modeDescription" style="margin-top: 0.5rem;"></div>
                    </div>
                </div>

                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--accent); font-weight: bold;">Number of Rounds</label>
                    <input type="number" id="numRounds" min="1" max="10" value="${roundsVal}" class="setting-input">
                </div>

                <div style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--accent); font-weight: bold;">Number of Players</label>
                    <input type="number" id="numPlayers" min="2" max="8" value="${playersVal}" class="setting-input">
                </div>

                <div style="margin-bottom: 2rem;">
                    <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--accent); font-weight: bold; cursor: pointer;">
                        <input type="checkbox" id="imposterHints" ${hintsVal ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                        <span>Show Category Hint to Imposter</span>
                    </label>
                    <div style="font-size: 0.8rem; color: var(--light); opacity: 0.7; margin-top: 0.5rem;">When disabled, imposter only sees they are the imposter</div>
                </div>

                <div style="margin-bottom: 2rem;">
                    <label style="display: block; margin-bottom: 0.5rem; color: var(--accent); font-weight: bold;">Categories</label>
                    <button class="btn-secondary" style="width: 100%; margin-bottom: 0.5rem;" onclick="game.persistAndShowCategorySelection()">Choose Categories</button>
                    <div style="font-size: 0.95em; color: var(--light); opacity: 0.8;">${catSummary}</div>
                </div>

                <div style="display: flex; gap: 1rem;">
                    <button class="btn-primary" style="flex: 1;" onclick="game.createGameHandler()">Create</button>
                    <button class="btn-danger" style="flex: 1;" onclick="this.parentElement.parentElement.parentElement.remove(); game.render()">Cancel</button>
                </div>
            </div>
        `;

        document.getElementById('app').appendChild(div);
        
        // Update mode description on change
        const modeSelect = document.getElementById('gameMode');
        const descriptions = {
            'online': 'Each player uses their own device. Real-time sync. Type or speak words during your turn.',
            'silent': 'Each player uses their own device. Real-time sync. Type only (no speaking) during your turn.',
            'passplay': 'One device. Pass the phone to each player to see the word. Fully offline play. No typing needed.'
        };
        
        const updateDesc = () => {
            document.getElementById('modeDescription').textContent = descriptions[modeSelect.value] || '';
        };
        
        modeSelect.addEventListener('change', updateDesc);
        updateDesc();
    }


    showCategorySelection() {
        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const categories = Object.keys(WORD_DATABASE);
        const selected = new Set(this.gameSettings.categories);
        const allSelected = categories.every(cat => selected.has(cat));

        div.innerHTML = `
            <div style="background: var(--dark); border: 2px solid var(--secondary); border-radius: 20px; padding: 2rem; max-width: 600px; width: 95%; max-height: 80vh; overflow-y: auto;">
                <h2 style="color: var(--secondary); margin-bottom: 1.5rem; text-align: center;">Select Categories</h2>
                <div style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 1.2rem;">
                    <button class="btn-secondary" onclick="game.selectAllCategories()">Select All</button>
                    <button class="btn-secondary" onclick="game.deselectAllCategories()">Deselect All</button>
                </div>
                <form id="categoryForm" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.8rem; margin-bottom: 2rem;">
                    ${categories.map(cat => `
                        <label style='display: flex; align-items: center; gap: 0.5em; background: rgba(58,134,255,0.07); border-radius: 8px; padding: 0.5em 0.7em;'>
                            <input type="checkbox" name="cat" value="${cat}" ${selected.has(cat) ? 'checked' : ''} onchange="game.toggleCategoryCheckbox(this)">
                            <span>${cat.replace(/_/g, ' ')}</span>
                        </label>
                    `).join('')}
                </form>
                <div style="display: flex; gap: 1rem;">
                    <button class="btn-primary" style="flex: 1;" onclick="game.saveCategorySelection(this)">Done</button>
                </div>
            </div>
        `;
        document.getElementById('app').appendChild(div);
    }

    selectAllCategories() {
        this.gameSettings.categories = Object.keys(WORD_DATABASE);
        this.closeCategoryDialogAndReopen();
    }

    deselectAllCategories() {
        this.gameSettings.categories = [];
        this.closeCategoryDialogAndReopen();
    }

    closeCategoryDialogAndReopen() {
        // Remove the dialog and reopen to update checkboxes
        const dialogs = document.querySelectorAll('body > #app > div');
        if (dialogs.length) dialogs[dialogs.length - 1].remove();
        this.showCategorySelection();
    }

    toggleCategoryCheckbox(checkbox) {
        const cat = checkbox.value;
        if (checkbox.checked) {
            // When selecting a specific category, remove 'ALL'
            this.gameSettings.categories = this.gameSettings.categories.filter(c => c !== 'ALL');
            if (!this.gameSettings.categories.includes(cat)) this.gameSettings.categories.push(cat);
        } else {
            this.gameSettings.categories = this.gameSettings.categories.filter(c => c !== cat);
            // If no categories remain, default to ALL
            if (this.gameSettings.categories.length === 0) {
                this.gameSettings.categories = ['ALL'];
            }
        }
    }

    saveCategorySelection(btn) {
        // Save and close dialog
        const dialog = btn.closest('div[style*="background: var(--dark)"]')?.parentElement;
        if (this.gameSettings.categories.length === 0) {
            // If none selected, default to ALL
            this.gameSettings.categories = ['ALL'];
        }
        if (dialog) dialog.remove();
        // Check if we have persisted create game values first
        if (this._persistedCreateGame) {
            const persisted = this._persistedCreateGame;
            this._persistedCreateGame = null;
            this.showCreateGame(persisted);
        } else {
            // If the create game overlay is open, re-open it to reflect the new categories
            const createGameOverlay = Array.from(document.querySelectorAll('body > #app > div > div')).find(el => el.textContent.includes('Create New Game'));
            if (createGameOverlay) {
                // Grab current values before removing
                const parent = createGameOverlay.parentElement;
                const name = parent.querySelector('#createPlayerName')?.value || '';
                const rounds = parent.querySelector('#numRounds')?.value || 3;
                const players = parent.querySelector('#numPlayers')?.value || 4;
                const mode = parent.querySelector('#gameMode')?.value || 'online';
                parent.remove();
                this.showCreateGame({ name, rounds, players, mode });
            } else {
                this.render();
            }
        }
    }
    persistAndShowCategorySelection() {
        // Grab current values before opening category overlay
        const name = document.getElementById('createPlayerName')?.value || '';
        const rounds = document.getElementById('numRounds')?.value || 3;
        const players = document.getElementById('numPlayers')?.value || 4;
        const mode = document.getElementById('gameMode')?.value || 'online';
        const hints = document.getElementById('imposterHints')?.checked ?? true;
        // Remove the create game overlay
        const overlays = Array.from(document.querySelectorAll('body > #app > div > div')).filter(el => el.textContent.includes('Create New Game'));
        overlays.forEach(el => el.parentElement.remove());
        // Show category selection, and when done, restore create game with values
        this._persistedCreateGame = { name, rounds, players, mode, hints };
        this.showCategorySelection();
    }

    toggleCategory(cat) {
        this.gameSettings.categories = this.gameSettings.categories.filter(c => c !== 'ALL');

        if (this.gameSettings.categories.includes(cat)) {
            this.gameSettings.categories = this.gameSettings.categories.filter(c => c !== cat);
        } else {
            this.gameSettings.categories.push(cat);
        }

        if (this.gameSettings.categories.length === 0) {
            this.gameSettings.categories = ['ALL'];
        }
    }

    async createGameHandler() {
        const name = document.getElementById('createPlayerName')?.value?.trim();
        const rounds = parseInt(document.getElementById('numRounds')?.value || 1);
        const players = parseInt(document.getElementById('numPlayers')?.value || 4);
        const gameMode = document.getElementById('gameMode')?.value || 'online';
        const imposterHints = document.getElementById('imposterHints')?.checked ?? true;

        if (!name) {
            alert('Please enter your name');
            return;
        }

        this.playerName = name;
        this.gameSettings.numRounds = rounds;
        this.gameSettings.maxPlayers = players;
        this.gameSettings.gameMode = gameMode;
        this.gameSettings.imposterHints = imposterHints;
        // categories already set by overlay
        this.isInitiator = true;

        if (this.gameSettings.categories.length === 0) {
            this.gameSettings.categories = ['ALL'];
        }

        if (await this.startGame(players, gameMode)) {
            // Create player list with self as first
            this.players = [{
                id: this.playerId,
                name: name,
                isInitiator: true,
                isMe: true,
                ready: true
            }];
            this.playerId = this.players[0].id;
            this.currentScreen = 'lobby';
            this.render();
            this.startPolling();
        } else {
            alert('Failed to create game');
        }
    }

    joinGameHandler() {
        const code = document.getElementById('gameCode')?.value?.trim()?.toUpperCase()?.replace(/[^A-Z0-9]/g, '');
        const name = document.getElementById('playerName')?.value?.trim();

        if (!code) {
            alert('Please enter a game code');
            return;
        }

        if (code.length < 5) {
            alert('Game code should be 5 characters. You entered: ' + code.length);
            return;
        }

        if (!name) {
            alert('Please enter your name');
            return;
        }

        this.joinGame(code.substring(0, 5), name).then(success => {
            if (success) {
                this.currentScreen = 'lobby';
                this.render();
            } else {
                alert('Game not found. Double-check the code and try again.');
            }
        });
    }

    async startGameSession() {
        if (!this.isInitiator) return;

        try {
            const categoriesToSend = this.gameSettings.categories || ['ALL'];
            console.log('startGameSession - sending categories:', categoriesToSend);
            
            const response = await fetch('api/start_game.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.gameCode,
                    categories: categoriesToSend
                })
            });

            const data = await response.json();
            if (data.success) {
                console.log('Game session started with categories:', categoriesToSend);
                audio.playSound('reveal');
            }
        } catch (error) {
            console.error('Error starting game session:', error);
        }
    }

    async submitGuess() {
        const input = document.getElementById('wordInput');
        const word = input?.value?.trim();

        if (!word) {
            alert('Please enter a word');
            return;
        }

        if (await this.submitWord(word)) {
            input.value = '';
        }
    }

    async continueWithoutWord() {
        // For in-person play - player speaks their word aloud
        if (await this.submitWord('...')) {
            const input = document.getElementById('wordInput');
            if (input) input.value = '';
        }
    }

    async passToNextPlayer() {
        // For Pass and Play mode - pass device to next player
        if (await this.submitWord('[passed]')) {
            this.render();
        }
    }

    async vote(playerId) {
        if (await this.submitVote(playerId)) {
            this.gameState.votes[this.playerId] = playerId;
            this.render();
        }
    }

    async endGame() {
        this.stopPolling();
        this.gameCode = null;
        this.playerName = null;
        this.isInitiator = false;
        this.players = [];
        this.currentPlayer = null;
        this.gameState = {
            currentRound: 0,
            currentTurn: 0,
            totalTurns: 3,
            word: null,
            category: null,
            imposterPlayer: null,
            wordsSaid: {},
            votes: {},
            gameActive: false
        };
        this.stats = { rounds: [], playerTotals: {}, lastAccumulatedStats: {} };
        this.currentScreen = 'menu';
        this.render();
    }

    returnToMenu() {
        this.endGame();
    }

    leaveGame() {
        audio.playSound('notification');  // Play sound when current player leaves
        this.stopPolling();
        this.currentScreen = 'menu';
        this.gameCode = null;
        this.playerId = null;
        this.players = [];
        this.render();
    }
}

// Initialize game
const game = new ImposterGame();

// Initialize audio on user interaction
document.addEventListener('click', () => {
    audio.init();
}, { once: true });

// Render on load
game.render();
