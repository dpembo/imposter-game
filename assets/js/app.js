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
        this.players = null;
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
            playerStats: {}  // Track per-player stats: imposterCount, thinkTimes[], etc.
        };
        this.pollInterval = null;
        this.revealTimerId = null;
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

                    // Update game state
                    this.gameState = data.state;
                    this.players = data.players;
                    this.gameSettings.numRounds = data.numRounds || this.gameSettings.numRounds;
                    this.gameSettings.gameMode = data.gameMode || this.gameSettings.gameMode;
                    this.gameSettings.imposterHints = data.imposterHints !== undefined ? data.imposterHints : this.gameSettings.imposterHints;
                    lastState = currentState;
                    lastPlayersCount = currentPlayersCount;

                    // Determine current screen based on game state
                    if (data.state.gameActive) {
                        if (data.state.phase === 'voting') {
                            this.currentScreen = 'voting';
                        } else if (data.state.phase === 'reveal') {
                            this.currentScreen = 'reveal';
                        } else if (data.state.phase === 'results') {
                            this.currentScreen = 'results';
                            audio.playSound('caught');
                        } else {
                            this.currentScreen = 'game';
                        }
                    } else if (data.state.gameStarted) {
                        this.currentScreen = 'lobby';
                    }

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
        if (this.revealTimerId) {
            clearInterval(this.revealTimerId);
            this.revealTimerId = null;
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
            case 'reveal':
                app.appendChild(this.renderReveal());
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
        
        // If none selected or 'ALL' is selected, show 'All Categories Selected'
        if (!selected.length || selected[0] === 'ALL') {
            categoryHTML += '<span style="grid-column: 1 / -1; text-align: center; color: var(--success);">✓ All Categories Selected</span>';
        } else {
            const isAll = selected.length === allCategories.length && allCategories.every(cat => selected.includes(cat));
            if (isAll) {
                categoryHTML += '<span style="grid-column: 1 / -1; text-align: center; color: var(--success);">✓ All Categories Selected</span>';
            } else {
                selected.filter(cat => cat !== 'ALL').forEach(cat => {
                    categoryHTML += `<div class="category-btn selected">${cat.replace(/_/g, ' ')}</div>`;
                });
            }
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

    renderVoting() {
        const div = document.createElement('div');
        div.className = 'screen voting-screen active';

        div.innerHTML = `
            <div class="voting-container">
                <h2 class="voting-title">👮 Who is the Imposter?</h2>
                <div class="voting-grid">
                    ${this.players.map(p => `
                        <div class="vote-card ${this.gameState.votes[this.playerId] === p.id ? 'voted' : ''}" 
                             onclick="game.vote('${p.id}')">
                            <div class="vote-name">${p.name}${p.isMe ? ' (You)' : ''}</div>
                            <div class="vote-label">${this.gameState.imposterPlayer?.id === p.id && Object.values(this.gameState.votes).length === this.players.length ? 'IMPOSTER 🎯' : 'Cast Vote'}</div>
                        </div>
                    `).join('')}
                </div>
                <div style="text-align: center; color: var(--light); opacity: 0.7;">
                    Votes: ${Object.keys(this.gameState.votes).length}/${this.players.length}
                </div>
            </div>
        `;

        return div;
    }

    renderReveal() {
        const div = document.createElement('div');
        div.className = 'screen reveal-screen active';

        const imposterName = this.gameState.imposterPlayer?.name || 'Unknown';
        const imposterVotes = Object.values(this.gameState.votes).filter(v => v === this.gameState.imposterPlayer?.id).length;
        const revealStartTime = this.gameState.revealStartTime || Date.now() / 1000;
        const elapsedSeconds = Math.floor(Date.now() / 1000) - revealStartTime;
        const remainingSeconds = Math.max(0, 20 - elapsedSeconds);
        const isFinalRound = this.gameState.currentRound >= this.gameSettings.numRounds;

        // Set up auto-advance if not already set up
        if (!this.revealTimerId && remainingSeconds > 0) {
            this.revealTimerId = setInterval(() => {
                if (this.currentScreen === 'reveal') {
                    this.render();
                    // Check if time has expired
                    const currentElapsed = Math.floor(Date.now() / 1000) - revealStartTime;
                    if (currentElapsed >= 20) {
                        clearInterval(this.revealTimerId);
                        this.revealTimerId = null;
                        // Auto-advance to results
                        if (this.isInitiator) {
                            this.startNextRound();
                        } else {
                            // Poll will update when initiator advances
                        }
                    }
                }
            }, 100);
        } else if (remainingSeconds === 0 && this.revealTimerId) {
            clearInterval(this.revealTimerId);
            this.revealTimerId = null;
        }

        // Build voting details
        let votingDetails = '<div style="margin: 1.5rem 0; padding: 1rem; background: rgba(58,134,255,0.1); border-radius: 10px;">';
        votingDetails += '<div style="font-size: 0.9rem; color: var(--accent); font-weight: bold; margin-bottom: 0.8rem;">Voting Results:</div>';
        this.players.forEach(p => {
            const votedFor = Object.entries(this.gameState.votes).find(([voter, votee]) => voter === p.id);
            const votedForName = votedFor ? this.players.find(pl => pl.id === votedFor[1])?.name || 'Unknown' : 'No Vote';
            const isHighlighted = votedForName === imposterName ? 'style="color: var(--success); font-weight: bold;"' : '';
            votingDetails += `<div style="margin: 0.3rem 0; font-size: 0.85rem;"><span style="opacity: 0.8;">${p.name}:</span> <span ${isHighlighted}>voted for ${votedForName}</span></div>`;
        });
        votingDetails += '</div>';

        div.innerHTML = `
            <div class="results-container">
                <h2 class="results-title">👀 IMPOSTER REVEALED!</h2>

                <div class="imposter-reveal" style="animation: imposterPulse 0.5s ease-in-out;">
                    <div class="imposter-label">The Imposter Was:</div>
                    <div class="imposter-name" style="font-size: 3.5rem; color: var(--primary); text-shadow: 0 0 20px var(--primary);">${imposterName}</div>
                </div>

                <div class="result-info">
                    <div style="font-size: 1.1rem; margin-bottom: 0.5rem;">Votes for imposter: <strong>${imposterVotes}/${this.players.length}</strong></div>
                </div>

                ${votingDetails}

                <div style="margin: 2rem 0; text-align: center;">
                    <div style="font-size: 2.5rem; font-weight: bold; color: var(--secondary); margin-bottom: 0.5rem;">${remainingSeconds}</div>
                    <div style="font-size: 1rem; color: var(--light); opacity: 0.8;">seconds until auto-advance</div>
                </div>

                <div class="results-actions">
                    ${this.isInitiator && !isFinalRound ? `
                        <button class="btn-primary" onclick="game.startNextRound()">Next Round</button>
                    ` : isFinalRound && this.isInitiator ? `
                        <button class="btn-primary" onclick="game.showGameSummary()">View Summary</button>
                    ` : `
                        <button class="btn-secondary" disabled>Waiting for Initiator...</button>
                    `}
                </div>
            </div>
        `;

        return div;
    }

    renderResults() {
        const div = document.createElement('div');
        div.className = 'screen results-screen active';

        const imposterName = this.gameState.imposterPlayer?.name || 'Unknown';
        const roundStats = this.stats.rounds[this.gameState.currentRound - 1] || {};
        const imposterVotes = Object.values(this.gameState.votes).filter(v => v === this.gameState.imposterPlayer?.id).length;
        const isFinalRound = this.gameState.currentRound >= this.gameSettings.numRounds;

        let resultText = '';
        let resultPoints = {};

        // Calculate points
        if (imposterVotes >= Math.ceil(this.players.length * 0.5)) {
            resultText = `✓ The Imposter was caught! Everyone else earns 10 points.`;
            this.players.forEach(p => {
                if (p.id !== this.gameState.imposterPlayer?.id) {
                    resultPoints[p.name] = 10;
                    if (!this.stats.playerTotals[p.name]) this.stats.playerTotals[p.name] = 0;
                    this.stats.playerTotals[p.name] += 10;
                }
            });
        } else {
            resultText = `✗ The Imposter escaped! The Imposter earns 20 points.`;
            resultPoints[imposterName] = 20;
            if (!this.stats.playerTotals[imposterName]) this.stats.playerTotals[imposterName] = 0;
            this.stats.playerTotals[imposterName] += 20;
        }

        // Build voting details
        let votingDetails = '<div style="margin: 1.5rem 0; padding: 1rem; background: rgba(58,134,255,0.1); border-radius: 10px;">';
        votingDetails += '<div style="font-size: 0.9rem; color: var(--accent); font-weight: bold; margin-bottom: 0.8rem;">Voting Results:</div>';
        this.players.forEach(p => {
            const votedFor = Object.entries(this.gameState.votes).find(([voter, votee]) => voter === p.id);
            const votedForName = votedFor ? this.players.find(pl => pl.id === votedFor[1])?.name || 'Unknown' : 'No Vote';
            const isHighlighted = votedForName === imposterName ? 'style="color: var(--success); font-weight: bold;"' : '';
            votingDetails += `<div style="margin: 0.3rem 0; font-size: 0.85rem;"><span style="opacity: 0.8;">${p.name}:</span> <span ${isHighlighted}>voted for ${votedForName}</span></div>`;
        });
        votingDetails += '</div>';

        // Sort leaderboard
        const leaderboard = Object.entries(this.stats.playerTotals)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        div.innerHTML = `
            <div class="results-container">
                <h2 class="results-title">${isFinalRound ? '🎉 Game Complete!' : `Round ${this.gameState.currentRound + 1} Complete!`}</h2>

                <div class="imposter-reveal">
                    <div class="imposter-label">The Imposter Was:</div>
                    <div class="imposter-name">${imposterName}</div>
                </div>

                <div class="result-info">
                    <div class="result-description">${resultText}</div>
                    <div style="font-size: 0.9rem; opacity: 0.8;">Votes for imposter: ${imposterVotes}/${this.players.length}</div>
                </div>

                ${votingDetails}

                ${Object.keys(resultPoints).length > 0 ? `
                    <div class="result-points">
                        ${Object.entries(resultPoints).map(([name, points]) => `
                            <div class="points-card">
                                <div class="points-player">${name}</div>
                                <div class="points-value">+${points}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="leaderboard">
                    <h3 class="leaderboard-title">🏆 ${isFinalRound ? 'Final' : 'Current'} Leaderboard</h3>
                    <div class="leaderboard-items">
                        ${leaderboard.map(([name, score], idx) => `
                            <div class="leaderboard-item ${idx === 0 ? 'first' : idx === 1 ? 'second' : idx === 2 ? 'third' : ''}">
                                <div class="leaderboard-rank ${idx === 0 ? 'first' : idx === 1 ? 'second' : idx === 2 ? 'third' : ''}">${idx + 1}</div>
                                <div class="leaderboard-name">${name}</div>
                                <div class="leaderboard-score">${score}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="results-actions">
                    ${this.isInitiator && !isFinalRound ? `
                        <button class="btn-primary" onclick="game.startNextRound()">Next Round</button>
                    ` : isFinalRound ? `
                        <button class="btn-primary" onclick="game.showGameSummary()">View Summary</button>
                    ` : `
                        <button class="btn-secondary" disabled>Waiting for Initiator...</button>
                    `}
                </div>
            </div>
        `;

        return div;
    }

    showGameSummary() {
        const div = document.createElement('div');
        div.className = 'screen results-screen active';

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
            if (!this.gameSettings.categories.includes(cat)) this.gameSettings.categories.push(cat);
        } else {
            this.gameSettings.categories = this.gameSettings.categories.filter(c => c !== cat);
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
            const response = await fetch('api/start_game.php', {
                method: 'POST',
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: this.gameCode,
                    categories: this.gameSettings.categories
                })
            });

            const data = await response.json();
            if (data.success) {
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
        this.currentScreen = 'menu';
        this.render();
    }

    returnToMenu() {
        this.endGame();
    }

    leaveGame() {
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
