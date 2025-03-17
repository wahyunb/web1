document.addEventListener('DOMContentLoaded', () => {
    // Connect to Socket.IO
    const socket = io();
    
    // DOM Elements
    const setupScreen = document.getElementById('setup-screen');
    const gameScreen = document.getElementById('game-screen');
    const finalScreen = document.getElementById('final-screen');
    
    const gameIdDisplay = document.getElementById('game-id-display');
    const questionForm = document.getElementById('question-form');
    const questionsList = document.getElementById('questions-list');
    const playerList = document.getElementById('player-list');
    const startGameBtn = document.getElementById('start-game');
    
    // JSON Import Elements
    const jsonFileInput = document.getElementById('json-file');
    const importJsonBtn = document.getElementById('import-json');
    
    const currentQuestionNumber = document.getElementById('current-question-number');
    const currentQuestionText = document.getElementById('current-question-text');
    const currentOptions = document.getElementById('current-options');
    const correctAnswerDisplay = document.getElementById('correct-answer-display');
    const buzzerStatus = document.getElementById('buzzer-status');
    const resetBuzzerBtn = document.getElementById('reset-buzzer');
    const nextQuestionBtn = document.getElementById('next-question');
    const scoreList = document.getElementById('score-list');
    
    const finalScoreList = document.getElementById('final-score-list');
    const newGameBtn = document.getElementById('new-game');
    
    // Game state
    let gameId = null;
    let questions = [];
    let currentQuestionIndex = -1;
    let players = [];
    
    // Create a new game
    socket.emit('host-create-game');
    
    // Game created event
    socket.on('game-created', (data) => {
        gameId = data.gameId;
        gameIdDisplay.textContent = gameId;
    });
    
    // Player joined event
    socket.on('player-joined', ({ players: updatedPlayers }) => {
        players = updatedPlayers;
        updatePlayerList();
    });
    
    // Player left event
    socket.on('player-left', ({ players: updatedPlayers }) => {
        players = updatedPlayers;
        updatePlayerList();
    });
    
    // Questions updated event
    socket.on('questions-updated', ({ questions: updatedQuestions }) => {
        questions = updatedQuestions;
        updateQuestionsList();
    });
    
    // Buzzer hit event
    socket.on('buzzer-hit', ({ playerId, playerName }) => {
        buzzerStatus.textContent = `${playerName} has buzzed in!`;
        buzzerStatus.className = 'buzzer-status active';
        resetBuzzerBtn.disabled = false;
    });
    
    // Answer result event
    socket.on('answer-result', (data) => {
        const { playerName, isCorrect, scores } = data;
        
        if (isCorrect) {
            buzzerStatus.textContent = `${playerName} answered correctly!`;
            // Update scores
            if (scores) {
                players = scores;
                updateScoreList();
            }
            // Disable reset buzzer since we'll move to next question
            resetBuzzerBtn.disabled = true;
            // Enable next question button
            nextQuestionBtn.disabled = false;
        } else {
            buzzerStatus.textContent = `${playerName} answered incorrectly. Buzzer reset.`;
        }
    });
    
    // Add question form submit
    questionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const questionText = document.getElementById('question-text').value;
        const optionInputs = document.querySelectorAll('.option-text');
        const correctAnswer = document.getElementById('correct-answer').value;
        
        const question = {
            text: questionText,
            optionA: optionInputs[0].value,
            optionB: optionInputs[1].value,
            optionC: optionInputs[2].value,
            optionD: optionInputs[3].value,
            correctAnswer: correctAnswer
        };
        
        socket.emit('add-question', { gameId, question });
        
        // Reset form
        questionForm.reset();
    });
    
    // Import JSON button click
    importJsonBtn.addEventListener('click', () => {
        const file = jsonFileInput.files[0];
        if (!file) {
            alert('Please select a JSON file first.');
            return;
        }
        
        // Show loading indicator or message
        const originalButtonText = importJsonBtn.textContent;
        importJsonBtn.textContent = 'Importing...';
        importJsonBtn.disabled = true;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const questions = JSON.parse(e.target.result);
                
                // Validate the JSON structure
                if (!Array.isArray(questions)) {
                    throw new Error('JSON must be an array of questions');
                }
                
                // Validate each question
                questions.forEach((question, index) => {
                    if (!question.text || !question.optionA || !question.optionB || 
                        !question.optionC || !question.optionD || !question.correctAnswer) {
                        throw new Error(`Question at index ${index} is missing required fields`);
                    }
                    
                    if (!['A', 'B', 'C', 'D'].includes(question.correctAnswer)) {
                        throw new Error(`Question at index ${index} has an invalid correctAnswer. Must be A, B, C, or D`);
                    }
                });
                
                // Add each question to the game with better error handling
                let importedCount = 0;
                const totalQuestions = questions.length;
                
                // Function to add questions one by one with feedback
                function addNextQuestion(index) {
                    if (index >= totalQuestions) {
                        // All questions added successfully
                        alert(`Successfully imported ${importedCount} questions!`);
                        jsonFileInput.value = ''; // Reset file input
                        importJsonBtn.textContent = originalButtonText;
                        importJsonBtn.disabled = false;
                        return;
                    }
                    
                    // Add current question
                    socket.emit('add-question', { gameId, question: questions[index] });
                    importedCount++;
                    
                    // Process next question (slight delay to avoid overwhelming the socket)
                    setTimeout(() => addNextQuestion(index + 1), 50);
                }
                
                // Start adding questions
                addNextQuestion(0);
            } catch (error) {
                alert(`Error importing questions: ${error.message}`);
                importJsonBtn.textContent = originalButtonText;
                importJsonBtn.disabled = false;
            }
        };
        
        reader.onerror = function() {
            alert('Error reading the file. Please try again.');
            importJsonBtn.textContent = originalButtonText;
            importJsonBtn.disabled = false;
        };
        
        try {
            reader.readAsText(file);
        } catch (error) {
            alert(`Error accessing the file: ${error.message}. This may be restricted in some environments.`);
            importJsonBtn.textContent = originalButtonText;
            importJsonBtn.disabled = false;
        }
    };
    });
    
    // Start game button click
    startGameBtn.addEventListener('click', () => {
        if (questions.length === 0) {
            alert('Please add at least one question before starting the game.');
            return;
        }
        
        if (Object.keys(players).length === 0) {
            alert('Please wait for at least one player to join before starting the game.');
            return;
        }
        
        socket.emit('start-game', { gameId });
        showScreen(gameScreen);
        currentQuestionIndex = 0;
        showCurrentQuestion();
    });
    
    // Reset buzzer button click
    resetBuzzerBtn.addEventListener('click', () => {
        socket.emit('reset-buzzer', { gameId });
        buzzerStatus.textContent = 'Buzzer has been reset. Waiting for players to buzz in...';
        resetBuzzerBtn.disabled = true;
    });
    
    // Next question button click
    nextQuestionBtn.addEventListener('click', () => {
        socket.emit('next-question', { gameId });
        nextQuestionBtn.disabled = true;
    });
    
    // New game button click
    newGameBtn.addEventListener('click', () => {
        window.location.reload();
    });
    
    // New question event
    socket.on('new-question', ({ question }) => {
        currentQuestionIndex++;
        showCurrentQuestion();
        buzzerStatus.textContent = 'Waiting for players to buzz in...';
        resetBuzzerBtn.disabled = true;
    });
    
    // Game ended event
    socket.on('game-ended', ({ finalScores }) => {
        showScreen(finalScreen);
        updateFinalScoreList(finalScores);
    });
    
    // Helper functions
    function showScreen(screen) {
        // Hide all screens
        setupScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        finalScreen.classList.add('hidden');
        
        // Show the requested screen
        screen.classList.remove('hidden');
    }
    
    function updatePlayerList() {
        playerList.innerHTML = '';
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.username;
            playerList.appendChild(li);
        });
    }
    
    function updateQuestionsList() {
        questionsList.innerHTML = '';
        questions.forEach((question, index) => {
            const li = document.createElement('li');
            li.textContent = `${index + 1}. ${question.text}`;
            questionsList.appendChild(li);
        });
        
        // Enable start button if we have questions
        startGameBtn.disabled = questions.length === 0;
    }
    
    function updateScoreList() {
        scoreList.innerHTML = '';
        players.sort((a, b) => b.score - a.score);
        players.forEach(player => {
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
    
    function showCurrentQuestion() {
        const question = questions[currentQuestionIndex];
        currentQuestionNumber.textContent = `${currentQuestionIndex + 1} / ${questions.length}`;
        currentQuestionText.textContent = question.text;
        
        // Display options
        currentOptions.innerHTML = '';
        const options = ['A', 'B', 'C', 'D'];
        options.forEach(option => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = `${option}: ${question[`option${option}`]}`;
            currentOptions.appendChild(optionDiv);
        });
        
        correctAnswerDisplay.textContent = `${question.correctAnswer}: ${question[`option${question.correctAnswer}`]}`;
        
        // Reset buzzer status
        buzzerStatus.textContent = 'Waiting for players to buzz in...';
        resetBuzzerBtn.disabled = true;
        nextQuestionBtn.disabled = true;
    }
});