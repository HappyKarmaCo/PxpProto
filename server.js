const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');
const config = require('./config');
const GameManager = require('./game/GameManager');

const PORT = 3000;

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Initialize game manager
const gameManager = new GameManager(io, config);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Player events
  socket.on('player:join', (data) => {
    gameManager.addPlayer(socket, data.name);
  });

  socket.on('player:answer', (data) => {
    gameManager.submitAnswer(socket.id, data.buttonIndex);
  });

  socket.on('player:createTeam', (data) => {
    if (config.features.teams) {
      gameManager.createTeam(socket.id, data.teamName);
    }
  });

  socket.on('player:joinTeam', (data) => {
    if (config.features.teams) {
      gameManager.joinTeam(socket.id, data.teamId);
    }
  });

  socket.on('player:trashTalk', (data) => {
    if (config.features.trashTalk) {
      gameManager.sendTrashTalk(socket.id, data.phraseIndex);
    }
  });

  // Admin events
  socket.on('admin:join', () => {
    gameManager.addAdmin(socket);
  });

  socket.on('admin:setTimer', (data) => {
    gameManager.setTimerLength(data.seconds);
  });

  socket.on('admin:startRound', () => {
    gameManager.startRound();
  });

  socket.on('admin:startGame', () => {
    gameManager.startGame();
  });

  socket.on('admin:resetGame', () => {
    gameManager.resetGame();
  });

  // Disconnect
  socket.on('disconnect', () => {
    gameManager.removePlayer(socket.id);
    console.log('Disconnected:', socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log('\nFeatures enabled:');
  Object.entries(config.features).forEach(([feature, enabled]) => {
    console.log(`  ${feature}: ${enabled ? '✓' : '✗'}`);
  });
});
