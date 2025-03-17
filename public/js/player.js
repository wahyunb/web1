document.addEventListener('DOMContentLoaded', () => {
    // Get game info from sessionStorage
    const gameId = sessionStorage.getItem('gameId');
    const username = sessionStorage.getItem('username');
    
    // If no game info, redirect to home
    if (!gameId || !username) {
        window.location.href = '/';
        return;
    }
    
    // Connect to Socket.IO with reconnection options
    const socket = io({
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    // DOM Elements
    const connectionStatus = document.getElementById('connection-status');
    const waitingScreen = document.getElementById('waiting-screen');
    const questionScreen = document.getElementById('question-screen');
    const answerScreen = document.getElementById('answer-screen');
    const resultScreen = document.getElementById('result-screen');
    const finalScreen = document.getElementById('final-screen');
    
    const gameIdDisplay = document.getElementById('game-id-display');
    const playerList = document.getElementById('player-list');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const answerOptionsContainer = document.getElementById('answer-options-container');
    const buzzer = document.getElementById('buzzer');
    const buzzerStatus = document.getElementById('buzzer-status');
    const resultMessage = document.getElementById('result-message');
    const scoreList = document.getElementById('score-list');
    const finalScoreList = document.getElementById('final-score-list');
    const backToHomeBtn = document.getElementById('back-to-home');
    
    // Set game ID in the UI
    gameIdDisplay.textContent = gameId;
    
    // Track if player has answered incorrectly for current question
    let hasAnsweredIncorrectly = false;
    let currentQuestion = null;
    
    // Load saved state from sessionStorage
    const loadSavedState = () => {
        const savedState = sessionStorage.getItem(`gameState_${gameId}`);
        if (savedState) {
            const state = JSON.parse(savedState);
            hasAnsweredIncorrectly = state.hasAnsweredIncorrectly || false;
            currentQuestion = state.currentQuestion || null;
            
            // If we have a saved question, show it
            if (currentQuestion) {
                showQuestion(currentQuestion);
                updateBuzzerState(state.buzzerEnabled, state.currentBuzzer);
            }
        }
    };
    
    // Save current state to sessionStorage
    const saveState = () => {
        const state = {
            hasAnsweredIncorrectly,
            currentQuestion,
            buzzerEnabled: !buzzer.disabled,
            currentBuzzer: buzzerStatus.textContent
        };
        sessionStorage.setItem(`gameState_${gameId}`, JSON.stringify(state));
    };
    
    // Load any saved state
    loadSavedState();
    
    // Socket connection events
    socket.on('connect', () => {
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'connection-status connected';
    });
    
    socket.on('disconnect', () => {
        connectionStatus.textContent = 'Disconnected - Trying to reconnect...';
        connectionStatus.className = 'connection-status disconnected';
    });
    
    socket.on('reconnect', () => {
        connectionStatus.textContent = 'Reconnected!';
        connectionStatus.className = 'connection-status connected';
        // Reload game state after reconnection
        socket.emit('player-join', { gameId, username });
    });
    
    // Join the game
    socket.emit('player-join', { gameId, username });
    
    // Update player list when players join/leave
    socket.on('player-joined', ({ players }) => {
        updatePlayerList(players);
    });
    
    // Handle player leaving
    socket.on('player-left', ({ players }) => {
        updatePlayerList(players);
    });
    
    // Handle game state updates
    socket.on('game-state', (state) => {
        if (state.state === 'waiting') {
            showScreen(waitingScreen);
        } else if (state.state === 'question') {
            showQuestion(state.question);
            updateBuzzerState(state.buzzerEnabled, state.currentBuzzer);
        } else if (state.state === 'results') {
            showScreen(finalScreen);
        }
        saveState();
    });
    
    // Game started event
    socket.on('game-started', ({ question, buzzerEnabled }) => {
        hasAnsweredIncorrectly = false; // Reset flag for new game
        showQuestion(question);
        updateBuzzerState(buzzerEnabled);
    });
    
    // New question event
    socket.on('new-question', ({ question, buzzerEnabled, scores }) => {
        hasAnsweredIncorrectly = false; // Reset flag for new question
        showQuestion(question);
        updateBuzzerState(buzzerEnabled);
        
        // Update scores if provided
        if (scores) {
            updateScoreList(scores);
        }
    });
    
    // Buzzer hit event
    socket.on('buzzer-hit', ({ playerId, playerName }) => {
        if (socket.id === playerId) {
            // This player got the buzzer
            showScreen(answerScreen);
            createAnswerOptions(currentQuestion);
            buzzerStatus.textContent = 'You have the buzzer! Select your answer.';
        } else {
            // Another player got the buzzer
            buzzer.disabled = true;
            buzzerStatus.textContent = `${playerName} has the buzzer!`;
        }
        saveState();
    });
    
    // Answer result event
    socket.on('answer-result', ({ playerId, playerName, isCorrect, scores, buzzerEnabled }) => {
        if (scores) {
            updateScoreList(scores);
        }
        
        if (socket.id === playerId) {
            showScreen(questionScreen);
            resultMessage.textContent = isCorrect ? 'Your answer was correct!' : 'Your answer was incorrect!';
            resultMessage.className = isCorrect ? 'correct' : 'incorrect';
            
            // If player answered incorrectly, permanently disable their buzzer for this question
            if (!isCorrect) {
                hasAnsweredIncorrectly = true;
                buzzer.disabled = true;
                buzzerStatus.textContent = 'You answered incorrectly and cannot buzz again for this question.';
            }
        }
        
        // Only update buzzer state if player hasn't answered incorrectly
        if (buzzerEnabled && !hasAnsweredIncorrectly) {
            updateBuzzerState(true);
        }
        
        // Save state to persist across refreshes
        saveState();
    });
    
    // Game ended event
    socket.on('game-ended', ({ finalScores }) => {
        showScreen(finalScreen);
        updateFinalScoreList(finalScores);
    });
    
    // Host disconnected event
    socket.on('host-disconnected', () => {
        alert('The host has disconnected. Returning to home screen.');
        window.location.href = '/';
    });
    
    // Buzzer reset event
    socket.on('buzzer-reset', ({ buzzerEnabled }) => {
        // Reset the incorrectly answered flag when host explicitly resets the buzzer
        hasAnsweredIncorrectly = false;
        updateBuzzerState(buzzerEnabled);
        saveState();
    });
    
    // Buzzer button click
    buzzer.addEventListener('click', () => {
        socket.emit('buzz', { gameId });
        buzzer.disabled = true;
        buzzerStatus.textContent = 'You buzzed in! Waiting for confirmation...';
        saveState();
    });
    
    // Back to home button click
    backToHomeBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
    
    // Helper functions
    
    function showScreen(screen) {
        // Hide all screens
        waitingScreen.classList.add('hidden');
        questionScreen.classList.add('hidden');
        answerScreen.classList.add('hidden');
        resultScreen.classList.add('hidden');
        finalScreen.classList.add('hidden');
        
        // Show the requested screen
        screen.classList.remove('hidden');
    }
    
    function updatePlayerList(players) {
        playerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.username;
            playerList.appendChild(li);
        });
    }
    
    function updateScoreList(scores) {
        scoreList.innerHTML = '';
        scores.sort((a, b) => b.score - a.score);
        scores.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.username}: ${player.score}`;
            scoreList.appendChild(li);
        });
    }
    
    function updateFinalScoreList(scores) {
        finalScoreList.innerHTML = '';
        scores.sort((a, b) => b.score - a.score);
        scores.forEach((player, index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}. ${player.username}: ${player.score}`;
            if (index === 0) {
                li.classList.add('winner');
            }
            finalScoreList.appendChild(li);
        });
    }
    
    function showQuestion(question) {
        currentQuestion = question;
        showScreen(questionScreen);
        questionText.textContent = question.text;
        
        // Display options
        optionsContainer.innerHTML = '';
        const options = ['A', 'B', 'C', 'D'];
        options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = `${option}: ${question[`option${option}`]}`;
            optionsContainer.appendChild(optionDiv);
        });
    }
    
    function createAnswerOptions(question) {
        answerOptionsContainer.innerHTML = '';
        const options = ['A', 'B', 'C', 'D'];
        options.forEach(option => {
            const button = document.createElement('button');
            button.className = 'btn answer-option';
            button.textContent = `${option}: ${question[`option${option}`]}`;
            button.addEventListener('click', () => {
                // Add visual feedback when answer is submitted
                answerOptionsContainer.querySelectorAll('.answer-option').forEach(btn => {
                    btn.disabled = true;
                    btn.classList.remove('selected');
                });
                button.classList.add('selected');
                
                // Show feedback message
                const feedbackDiv = document.createElement('div');
                feedbackDiv.className = 'answer-feedback';
                feedbackDiv.textContent = 'Answer submitted! Waiting for result...';
                answerOptionsContainer.appendChild(feedbackDiv);
                
                socket.emit('submit-answer', { gameId, answer: option });
            });
            answerOptionsContainer.appendChild(button);
        });
    }
    
    function updateBuzzerState(enabled, currentBuzzer) {
        // If player has answered incorrectly, keep buzzer disabled regardless
        if (hasAnsweredIncorrectly) {
            buzzer.disabled = true;
            buzzer.classList.remove('active');
            buzzerStatus.textContent = 'You answered incorrectly and cannot buzz again for this question.';
            return;
        }
        
        buzzer.disabled = !enabled;
        if (enabled) {
            buzzerStatus.textContent = 'Buzzer is active! Click to answer!';
            buzzer.classList.add('active');
        } else {
            buzzer.classList.remove('active');
            if (currentBuzzer) {
                buzzerStatus.textContent = `${currentBuzzer} has the buzzer!`;
            } else {
                buzzerStatus.textContent = 'Buzzer is disabled.';
            }
        }
    }
});