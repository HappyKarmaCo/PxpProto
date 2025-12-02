class GameManager {
  constructor(io, config) {
    this.io = io;
    this.config = config;
    this.players = new Map(); // socketId -> player object
    this.teams = new Map(); // teamId -> team object
    this.admins = new Set();

    this.gameState = 'lobby'; // lobby, playing, leaderboard, finished
    this.currentRound = 0;
    this.timerLength = config.game.defaultTimerSeconds;
    this.roundTimer = null;
    this.correctAnswer = null;
    this.roundStartTime = null;
    this.roundAnswers = new Map(); // socketId -> {buttonIndex, timestamp}

    // Initialize CPU teams if enabled
    if (config.features.cpuTeams) {
      this.initializeCPUTeams();
    }
  }

  initializeCPUTeams() {
    this.config.cpuTeams.forEach((cpuTeam, index) => {
      const teamId = `cpu_team_${index}`;
      this.teams.set(teamId, {
        id: teamId,
        name: cpuTeam.name,
        members: [],
        score: 0,
        isCPU: true
      });

      // Add CPU players
      cpuTeam.players.forEach((botName, botIndex) => {
        const botId = `cpu_${index}_${botIndex}`;
        this.players.set(botId, {
          id: botId,
          name: botName,
          score: 0,
          teamId: teamId,
          isCPU: true,
          socket: null
        });
        this.teams.get(teamId).members.push(botId);
      });
    });
  }

  addPlayer(socket, name) {
    const player = {
      id: socket.id,
      name: name,
      score: 0,
      teamId: null,
      isCPU: false,
      socket: socket
    };
    this.players.set(socket.id, player);

    socket.emit('player:joined', {
      playerId: socket.id,
      config: this.config
    });

    this.broadcastGameState();
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (player && !player.isCPU) {
      // Remove from team if in one
      if (player.teamId) {
        const team = this.teams.get(player.teamId);
        if (team) {
          team.members = team.members.filter(id => id !== socketId);
          if (team.members.length === 0 && !team.isCPU) {
            this.teams.delete(player.teamId);
          }
        }
      }
      this.players.delete(socketId);
      this.broadcastGameState();
    }
  }

  addAdmin(socket) {
    this.admins.add(socket.id);
    socket.emit('admin:initialized', {
      config: this.config
    });
    this.broadcastGameState();
  }

  createTeam(playerId, teamName) {
    const player = this.players.get(playerId);
    if (!player || player.teamId) return;

    const teamId = `team_${Date.now()}`;
    this.teams.set(teamId, {
      id: teamId,
      name: teamName,
      members: [playerId],
      score: 0,
      isCPU: false
    });

    player.teamId = teamId;
    this.broadcastGameState();
  }

  joinTeam(playerId, teamId) {
    const player = this.players.get(playerId);
    const team = this.teams.get(teamId);

    if (!player || !team || player.teamId || team.isCPU) return;

    player.teamId = teamId;
    team.members.push(playerId);
    this.broadcastGameState();
  }

  setTimerLength(seconds) {
    this.timerLength = seconds;
    this.broadcastToAdmins('admin:timerUpdated', { seconds });
  }

  startGame() {
    if (this.gameState !== 'lobby') return;

    this.currentRound = 0;
    // Reset all scores
    this.players.forEach(p => p.score = 0);
    this.teams.forEach(t => t.score = 0);

    this.gameState = 'playing';
    this.startRound();
  }

  generateMathQuestion() {
    // Generate two random numbers for a simple math question
    const num1 = Math.floor(Math.random() * 20) + 1;
    const num2 = Math.floor(Math.random() * 20) + 1;
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];

    let correctAnswer;
    let question;

    switch(operation) {
      case '+':
        correctAnswer = num1 + num2;
        question = `${num1} + ${num2}`;
        break;
      case '-':
        correctAnswer = num1 - num2;
        question = `${num1} - ${num2}`;
        break;
      case '*':
        correctAnswer = num1 * num2;
        question = `${num1} × ${num2}`;
        break;
    }

    // Generate 2 wrong answers that are close to the correct answer
    const wrongAnswers = new Set();
    while (wrongAnswers.size < 2) {
      const offset = Math.floor(Math.random() * 10) - 5; // -5 to +5
      const wrongAnswer = correctAnswer + offset;
      if (wrongAnswer !== correctAnswer && !wrongAnswers.has(wrongAnswer)) {
        wrongAnswers.add(wrongAnswer);
      }
    }

    // Create array of all answers and shuffle
    const answers = [correctAnswer, ...Array.from(wrongAnswers)];
    for (let i = answers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [answers[i], answers[j]] = [answers[j], answers[i]];
    }

    // Find position of correct answer (1-indexed)
    const correctIndex = answers.indexOf(correctAnswer) + 1;

    return {
      question,
      answers,
      correctAnswer,
      correctIndex
    };
  }

  startRound() {
    if (this.currentRound >= this.config.game.roundsPerGame) {
      this.endGame();
      return;
    }

    this.currentRound++;

    // Generate math question and answers
    const mathData = this.generateMathQuestion();
    this.correctAnswer = mathData.correctIndex;
    this.currentQuestion = mathData;

    this.roundStartTime = Date.now();
    this.roundAnswers.clear();
    this.gameState = 'playing';

    // CPU players answer randomly with some delay
    if (this.config.features.cpuTeams) {
      this.simulateCPUAnswers();
    }

    this.io.emit('round:started', {
      round: this.currentRound,
      totalRounds: this.config.game.roundsPerGame,
      timerLength: this.timerLength,
      question: mathData.question,
      answers: mathData.answers
    });

    this.broadcastGameState();

    // Start timer
    this.roundTimer = setTimeout(() => {
      this.endRound();
    }, this.timerLength * 1000);
  }

  simulateCPUAnswers() {
    this.players.forEach((player, playerId) => {
      if (player.isCPU) {
        const delay = Math.random() * this.timerLength * 0.7 * 1000; // Answer within 70% of time
        setTimeout(() => {
          if (this.gameState === 'playing') {
            const randomButton = Math.floor(Math.random() * this.config.game.buttonCount) + 1;
            this.submitAnswer(playerId, randomButton);
          }
        }, delay);
      }
    });
  }

  submitAnswer(playerId, buttonIndex) {
    if (this.gameState !== 'playing') return;

    const player = this.players.get(playerId);
    if (!player) return;

    const timestamp = Date.now();
    this.roundAnswers.set(playerId, { buttonIndex, timestamp });

    if (!player.isCPU) {
      player.socket.emit('answer:recorded', { buttonIndex });
    }
  }

  endRound() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    this.gameState = 'leaderboard';

    // Calculate scores
    const roundScores = [];
    this.roundAnswers.forEach((answer, playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;

      if (answer.buttonIndex === this.correctAnswer) {
        const timeElapsed = (answer.timestamp - this.roundStartTime) / 1000;
        const timeRemaining = Math.max(0, this.timerLength - timeElapsed);
        const points = Math.floor(timeRemaining * this.config.game.pointsPerSecond);

        player.score += points;

        // Add to team score if in team mode
        if (this.config.features.teamVsTeam && player.teamId) {
          const team = this.teams.get(player.teamId);
          if (team) {
            team.score += points;
          }
        }

        roundScores.push({
          playerId,
          playerName: player.name,
          points,
          correct: true
        });
      } else {
        roundScores.push({
          playerId,
          playerName: player.name,
          points: 0,
          correct: false
        });
      }
    });

    // Generate leaderboard
    const leaderboard = this.generateLeaderboard();

    this.io.emit('round:ended', {
      correctAnswer: this.correctAnswer,
      correctAnswerValue: this.currentQuestion.correctAnswer,
      roundScores,
      leaderboard,
      currentRound: this.currentRound,
      totalRounds: this.config.game.roundsPerGame
    });

    this.broadcastGameState();
  }

  generateLeaderboard() {
    const playerLeaderboard = Array.from(this.players.values())
      .sort((a, b) => b.score - a.score)
      .map((player, index) => ({
        rank: index + 1,
        name: player.name,
        score: player.score,
        teamId: player.teamId,
        isCPU: player.isCPU
      }));

    let teamLeaderboard = null;
    if (this.config.features.teamVsTeam) {
      teamLeaderboard = Array.from(this.teams.values())
        .sort((a, b) => b.score - a.score)
        .map((team, index) => ({
          rank: index + 1,
          name: team.name,
          score: team.score,
          memberCount: team.members.length,
          isCPU: team.isCPU
        }));
    }

    return { playerLeaderboard, teamLeaderboard };
  }

  endGame() {
    this.gameState = 'finished';
    const leaderboard = this.generateLeaderboard();

    this.io.emit('game:finished', {
      leaderboard
    });

    this.broadcastGameState();
  }

  resetGame() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    this.currentRound = 0;
    this.gameState = 'lobby';
    this.correctAnswer = null;
    this.roundStartTime = null;
    this.roundAnswers.clear();

    // Reset scores
    this.players.forEach(p => p.score = 0);
    this.teams.forEach(t => t.score = 0);

    this.io.emit('game:reset');
    this.broadcastGameState();
  }

  sendTrashTalk(playerId, phraseIndex) {
    const player = this.players.get(playerId);
    if (!player || phraseIndex >= this.config.trashTalkPhrases.length) return;

    const phrase = this.config.trashTalkPhrases[phraseIndex];
    const message = {
      playerId,
      playerName: player.name,
      phrase,
      timestamp: Date.now()
    };

    this.io.emit('chat:trashTalk', message);
  }

  broadcastGameState() {
    const state = {
      gameState: this.gameState,
      currentRound: this.currentRound,
      totalRounds: this.config.game.roundsPerGame,
      timerLength: this.timerLength,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        teamId: p.teamId,
        isCPU: p.isCPU
      })),
      teams: Array.from(this.teams.values())
    };

    this.io.emit('game:state', state);
    this.broadcastToAdmins('admin:state', state);
  }

  broadcastToAdmins(event, data) {
    this.admins.forEach(adminId => {
      const socket = this.io.sockets.sockets.get(adminId);
      if (socket) {
        socket.emit(event, data);
      }
    });
  }
}

module.exports = GameManager;
