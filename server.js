const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game state
const games = {};

// Create a new game
function createGame(hostId) {
  const gameId = uuidv4();
  games[gameId] = {
    id: gameId,
    hostId: hostId,
    players: {},
    questions: [],
    currentQuestion: null,
    currentQuestionIndex: -1,
    buzzerEnabled: false,
    currentBuzzer: null,
    state: 'waiting' // waiting, question, results
  };
  return gameId;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Host creates a new game
  socket.on('host-create-game', () => {
    const gameId = createGame(socket.id);
    socket.join(gameId);
    socket.emit('game-created', { gameId });
    console.log(`Host created game: ${gameId}`);
  });

  // Host adds a question
  socket.on('add-question', ({ gameId, question }) => {
    if (games[gameId] && games[gameId].hostId === socket.id) {
      games[gameId].questions.push(question);
      io.to(gameId).emit('questions-updated', { questions: games[gameId].questions });
    }
  });

  // Host starts the game
  socket.on('start-game', ({ gameId }) => {
    if (games[gameId] && games[gameId].hostId === socket.id) {
      games[gameId].state = 'question';
      games[gameId].currentQuestionIndex = 0;
      games[gameId].currentQuestion = games[gameId].questions[0];
      games[gameId].buzzerEnabled = true;
      games[gameId].currentBuzzer = null;
      
      io.to(gameId).emit('game-started', { 
        question: games[gameId].currentQuestion,
        buzzerEnabled: true
      });
    }
  });

  // Host moves to next question
  socket.on('next-question', ({ gameId }) => {
    if (games[gameId] && games[gameId].hostId === socket.id) {
      const game = games[gameId];
      game.currentQuestionIndex++;
      
      if (game.currentQuestionIndex < game.questions.length) {
        game.currentQuestion = game.questions[game.currentQuestionIndex];
        game.buzzerEnabled = true;
        game.currentBuzzer = null;
        game.state = 'question';
        
        io.to(gameId).emit('new-question', { 
          question: game.currentQuestion,
          buzzerEnabled: true
        });
      } else {
        // End of game
        game.state = 'results';
        io.to(gameId).emit('game-ended', { 
          finalScores: Object.values(game.players).map(p => ({ 
            username: p.username, 
            score: p.score 
          }))
        });
      }
    }
  });

  // Player joins a game
  socket.on('player-join', ({ gameId, username }) => {
    if (games[gameId]) {
      socket.join(gameId);
      games[gameId].players[socket.id] = {
        id: socket.id,
        username,
        score: 0
      };
      
      // Notify host and other players
      io.to(gameId).emit('player-joined', { 
        players: Object.values(games[gameId].players).map(p => ({ 
          username: p.username, 
          score: p.score 
        }))
      });
      
      // Send current game state to the new player
      socket.emit('game-state', {
        state: games[gameId].state,
        question: games[gameId].currentQuestion,
        buzzerEnabled: games[gameId].buzzerEnabled && !games[gameId].currentBuzzer,
        currentBuzzer: games[gameId].currentBuzzer ? 
          games[gameId].players[games[gameId].currentBuzzer]?.username : null
      });
    } else {
      socket.emit('error', { message: 'Game not found' });
    }
  });

  // Player hits the buzzer
  socket.on('buzz', ({ gameId }) => {
    const game = games[gameId];
    if (game && 
        game.state === 'question' && 
        game.buzzerEnabled && 
        !game.currentBuzzer) {
      
      game.currentBuzzer = socket.id;
      game.buzzerEnabled = false;
      
      // Notify all players who hit the buzzer
      io.to(gameId).emit('buzzer-hit', { 
        playerId: socket.id,
        playerName: game.players[socket.id].username 
      });
    }
  });

  // Player submits an answer
  socket.on('submit-answer', ({ gameId, answer }) => {
    const game = games[gameId];
    if (game && 
        game.state === 'question' && 
        game.currentBuzzer === socket.id) {
      
      const isCorrect = answer === game.currentQuestion.correctAnswer;
      
      if (isCorrect) {
        // Award points for correct answer
        game.players[socket.id].score += 100;
        
        // Notify all players of the result
        io.to(gameId).emit('answer-result', { 
          playerId: socket.id,
          playerName: game.players[socket.id].username,
          isCorrect,
          scores: Object.values(game.players).map(p => ({ 
            username: p.username, 
            score: p.score 
          }))
        });
      } else {
        // Wrong answer, re-enable buzzer for others
        game.currentBuzzer = null;
        game.buzzerEnabled = true;
        
        // Notify all players of the result
        io.to(gameId).emit('answer-result', { 
          playerId: socket.id,
          playerName: game.players[socket.id].username,
          isCorrect,
          buzzerEnabled: true
        });
      }
    }
  });

  // Host resets the buzzer
  socket.on('reset-buzzer', ({ gameId }) => {
    if (games[gameId] && games[gameId].hostId === socket.id) {
      games[gameId].buzzerEnabled = true;
      games[gameId].currentBuzzer = null;
      io.to(gameId).emit('buzzer-reset', { buzzerEnabled: true });
    }
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Check if this was a host of any game
    for (const gameId in games) {
      if (games[gameId].hostId === socket.id) {
        // Host disconnected, end the game
        io.to(gameId).emit('host-disconnected');
        delete games[gameId];
      } else if (games[gameId].players[socket.id]) {
        // Player disconnected, remove from the game
        delete games[gameId].players[socket.id];
        
        // Notify remaining players
        io.to(gameId).emit('player-left', { 
          players: Object.values(games[gameId].players).map(p => ({ 
            username: p.username, 
            score: p.score 
          }))
        });
        
        // If this player had the buzzer, reset it
        if (games[gameId].currentBuzzer === socket.id) {
          games[gameId].buzzerEnabled = true;
          games[gameId].currentBuzzer = null;
          io.to(gameId).emit('buzzer-reset', { buzzerEnabled: true });
        }
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});