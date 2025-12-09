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
    this.cpuBotCounter = 0; // Counter for CPU bot IDs
    this.playerAccuracy = new Map(); // playerId -> {total, correct}
    this.blitzedTeam = null; // Which team is currently blitzed
    this.blitzUsedBy = null; // Player who used blitz this round
    this.beastModeTeam = null; // Which team has Beast Mode active this round
    this.beastModeUsedBy = null; // Player who activated Beast Mode
    this.beastModeUsedInGame = new Set(); // Track which players used Beast Mode in the entire game
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

    // Check if max teams reached
    const humanTeams = Array.from(this.teams.values()).filter(t => !t.isCPU);
    if (humanTeams.length >= this.config.game.maxTeams) {
      player.socket.emit('team:error', { message: 'Maximum number of teams reached' });
      return;
    }

    // Get count of human players (not CPUs)
    const humanPlayers = Array.from(this.players.values()).filter(p => !p.isCPU);

    // Only first 2 players can create teams
    if (humanPlayers.length > 2 && humanTeams.length >= 1) {
      player.socket.emit('team:error', { message: 'Can only join existing teams' });
      return;
    }

    const teamId = `team_${Date.now()}`;
    this.teams.set(teamId, {
      id: teamId,
      name: teamName,
      members: [playerId],
      score: 0,
      isCPU: false,
      blitzAvailable: true
    });

    player.teamId = teamId;
    this.broadcastGameState();
  }

  joinTeam(playerId, teamId) {
    const player = this.players.get(playerId);
    const team = this.teams.get(teamId);

    if (!player || !team || player.teamId) return;

    // Check if team is full
    const humanMembersCount = team.members.filter(mid => {
      const member = this.players.get(mid);
      return member && !member.isCPU;
    }).length;

    if (humanMembersCount >= this.config.game.playersPerTeam) {
      player.socket.emit('team:error', { message: 'Team is full' });
      return;
    }

    player.teamId = teamId;
    team.members.push(playerId);
    this.broadcastGameState();
  }

  setTimerLength(seconds) {
    this.timerLength = seconds;
    this.broadcastToAdmins('admin:timerUpdated', { seconds });
  }

  useBlitz(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.teamId) return;

    const team = this.teams.get(player.teamId);
    if (!team || !team.blitzAvailable) {
      if (player.socket) {
        player.socket.emit('blitz:error', { message: 'Blitz already used!' });
      }
      return;
    }

    // Mark blitz as used
    team.blitzAvailable = false;

    // Find the other team
    const allTeams = Array.from(this.teams.values());
    const otherTeam = allTeams.find(t => t.id !== team.id);

    if (!otherTeam) return;

    // Set blitzed team for this round
    this.blitzedTeam = otherTeam.id;
    this.blitzUsedBy = player.name;

    // Broadcast blitz activation
    this.io.emit('blitz:activated', {
      activatedBy: player.name,
      activatedByTeam: team.name,
      targetTeam: otherTeam.name,
      targetTeamId: otherTeam.id
    });

    this.broadcastGameState();
  }

  useBeastMode(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.teamId) return;

    const team = this.teams.get(player.teamId);
    if (!team) return;

    // Check if this player has already used Beast Mode in the game
    if (this.beastModeUsedInGame.has(playerId)) {
      if (player.socket) {
        player.socket.emit('beastMode:error', { message: 'You already used Beast Mode this game!' });
      }
      return;
    }

    // Check if Beast Mode already active this round
    if (this.beastModeTeam) {
      if (player.socket) {
        player.socket.emit('beastMode:error', { message: 'Beast Mode already active this round!' });
      }
      return;
    }

    // Check if game is in playing state
    if (this.gameState !== 'playing') {
      if (player.socket) {
        player.socket.emit('beastMode:error', { message: 'Can only activate during question!' });
      }
      return;
    }

    // Activate Beast Mode
    this.beastModeTeam = team.id;
    this.beastModeUsedBy = player.name;
    this.beastModeUsedInGame.add(playerId); // Mark as used for the entire game

    // Broadcast Beast Mode activation
    this.io.emit('beastMode:activated', {
      activatedBy: player.name,
      teamName: team.name,
      teamId: team.id
    });

    this.broadcastGameState();
  }

  fillTeamsWithCPU() {
    // Ensure we have exactly 2 teams
    const humanTeams = Array.from(this.teams.values()).filter(t => !t.isCPU);

    // If no teams exist, create 2 default teams with CPUs
    if (humanTeams.length === 0) {
      const team1Id = 'team_default_1';
      const team2Id = 'team_default_2';

      this.teams.set(team1Id, {
        id: team1Id,
        name: 'Team Alpha',
        members: [],
        score: 0,
        isCPU: false,
        blitzAvailable: true
      });

      this.teams.set(team2Id, {
        id: team2Id,
        name: 'Team Beta',
        members: [],
        score: 0,
        isCPU: false,
        blitzAvailable: true
      });
    } else if (humanTeams.length === 1) {
      // Create second team if only one exists
      const team2Id = 'team_default_2';
      this.teams.set(team2Id, {
        id: team2Id,
        name: 'Team Beta',
        members: [],
        score: 0,
        isCPU: false,
        blitzAvailable: true
      });
    }

    // Get all teams (should be exactly 2 now)
    const allTeams = Array.from(this.teams.values());

    // Fill each team to 4 players with CPUs
    allTeams.forEach(team => {
      const currentMembers = team.members.length;
      const neededCPUs = this.config.game.playersPerTeam - currentMembers;

      for (let i = 0; i < neededCPUs; i++) {
        const botName = this.config.cpuPlayerNames[this.cpuBotCounter % this.config.cpuPlayerNames.length];
        const botId = `cpu_${this.cpuBotCounter}`;
        this.cpuBotCounter++;

        this.players.set(botId, {
          id: botId,
          name: botName,
          score: 0,
          teamId: team.id,
          isCPU: true,
          socket: null
        });

        team.members.push(botId);
      }
    });
  }

  startGame() {
    if (this.gameState !== 'lobby') return;

    this.currentRound = 0;
    // Reset all scores
    this.players.forEach(p => p.score = 0);
    this.teams.forEach(t => t.score = 0);

    // Fill teams with CPU players to make 4v4
    this.fillTeamsWithCPU();

    this.gameState = 'splash';

    // Send splash screen data
    const teams = Array.from(this.teams.values());
    this.io.emit('game:splash', {
      team1: teams[0],
      team2: teams[1]
    });

    // After 5 seconds, start the first round
    setTimeout(() => {
      this.gameState = 'playing';
      this.startRound();
    }, 5000);
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

    // Reset blitz state for new round
    this.blitzedTeam = null;
    this.blitzUsedBy = null;

    // Reset Beast Mode state for new round
    this.beastModeTeam = null;
    this.beastModeUsedBy = null;

    // Generate math question and answers
    const mathData = this.generateMathQuestion();
    this.correctAnswer = mathData.correctIndex;
    this.currentQuestion = mathData;

    this.roundStartTime = Date.now();
    this.roundAnswers.clear();
    this.gameState = 'playing';

    // CPU Blitz logic - check if CPUs should use blitz
    if (this.config.features.cpuTeams) {
      this.checkCPUBlitz();
    }

    // Send round data to all players
    const allTeams = Array.from(this.teams.values());
    allTeams.forEach(team => {
      team.members.forEach(memberId => {
        const player = this.players.get(memberId);
        if (player && player.socket) {
          const isBlitzed = this.blitzedTeam === team.id;
          player.socket.emit('round:started', {
            round: this.currentRound,
            totalRounds: this.config.game.roundsPerGame,
            timerLength: isBlitzed ? 3 : this.timerLength, // Blitzed players get 3 seconds
            question: mathData.question,
            answers: mathData.answers,
            isBlitzed: isBlitzed
          });
        }
      });
    });

    // CPU players answer randomly with some delay
    if (this.config.features.cpuTeams) {
      this.simulateCPUAnswers();
    }

    this.broadcastGameState();

    // Start timer
    this.roundTimer = setTimeout(() => {
      this.endRound();
    }, this.timerLength * 1000);
  }

  checkCPUBlitz() {
    // Calculate blitz probability based on round (10% per round)
    const blitzProbability = this.currentRound * 0.1;

    const allTeams = Array.from(this.teams.values());

    allTeams.forEach(team => {
      if (team.blitzAvailable) {
        // Check if any CPU on this team wants to use blitz
        const cpuMembers = team.members.filter(mid => {
          const p = this.players.get(mid);
          return p && p.isCPU;
        });

        if (cpuMembers.length > 0 && Math.random() < blitzProbability) {
          // Pick a random CPU to use blitz
          const randomCPU = cpuMembers[Math.floor(Math.random() * cpuMembers.length)];
          setTimeout(() => {
            this.useBlitz(randomCPU);
          }, 500); // Small delay for realism
        }
      }
    });
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

    // Broadcast that this player has answered (for visual highlighting)
    this.io.emit('player:answered', {
      playerId,
      playerName: player.name
    });
  }

  endRound() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    this.gameState = 'leaderboard';

    // First pass: Calculate base points and track accuracy
    const roundScores = [];
    const teamCorrectCounts = new Map(); // teamId -> count of correct answers

    this.roundAnswers.forEach((answer, playerId) => {
      const player = this.players.get(playerId);
      if (!player) return;

      // Initialize accuracy tracking if not exists
      if (!this.playerAccuracy.has(playerId)) {
        this.playerAccuracy.set(playerId, { total: 0, correct: 0 });
      }

      const accuracy = this.playerAccuracy.get(playerId);
      accuracy.total++;

      // Count correct answers by team for Beast Mode
      if (player.teamId) {
        if (!teamCorrectCounts.has(player.teamId)) {
          teamCorrectCounts.set(player.teamId, 0);
        }
        if (answer.buttonIndex === this.correctAnswer) {
          teamCorrectCounts.set(player.teamId, teamCorrectCounts.get(player.teamId) + 1);
        }
      }

      if (answer.buttonIndex === this.correctAnswer) {
        accuracy.correct++;

        const timeElapsed = (answer.timestamp - this.roundStartTime) / 1000;
        const timeRemaining = Math.max(0, this.timerLength - timeElapsed);
        const points = Math.floor(timeRemaining * this.config.game.pointsPerSecond);

        roundScores.push({
          playerId,
          playerName: player.name,
          teamId: player.teamId,
          basePoints: points,
          points: points, // Will be modified by Beast Mode if applicable
          correct: true
        });
      } else {
        roundScores.push({
          playerId,
          playerName: player.name,
          teamId: player.teamId,
          basePoints: 0,
          points: 0,
          correct: false
        });
      }
    });

    // Second pass: Apply Beast Mode scoring logic
    let beastModeMultiplier = 1;
    if (this.beastModeTeam) {
      const correctCount = teamCorrectCounts.get(this.beastModeTeam) || 0;

      if (correctCount === 4) {
        beastModeMultiplier = 2; // Double points
      } else if (correctCount === 3) {
        beastModeMultiplier = 1; // Normal points
      } else {
        beastModeMultiplier = 0; // Zero points for 0, 1, or 2 correct
      }

      // Apply Beast Mode multiplier to team members
      roundScores.forEach(score => {
        if (score.teamId === this.beastModeTeam) {
          score.points = Math.floor(score.basePoints * beastModeMultiplier);
          score.beastModeActive = true;
          score.beastModeMultiplier = beastModeMultiplier;
        }
      });
    }

    // Third pass: Apply scores to players and teams
    roundScores.forEach(score => {
      const player = this.players.get(score.playerId);
      if (!player) return;

      player.score += score.points;

      // Add to team score if in team mode
      if (this.config.features.teamVsTeam && player.teamId) {
        const team = this.teams.get(player.teamId);
        if (team) {
          team.score += score.points;
        }
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
      totalRounds: this.config.game.roundsPerGame,
      beastModeTeam: this.beastModeTeam,
      beastModeUsedBy: this.beastModeUsedBy
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
          id: team.id,
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
    this.teams.forEach(t => {
      t.score = 0;
      t.blitzAvailable = true; // Reset Blitz availability
    });

    // Reset Blitz and Beast Mode state
    this.blitzedTeam = null;
    this.blitzUsedBy = null;
    this.beastModeTeam = null;
    this.beastModeUsedBy = null;
    this.beastModeUsedInGame.clear(); // Clear game-wide Beast Mode usage

    // Reset accuracy tracking
    this.playerAccuracy.clear();

    // Remove all CPU players
    const cpuPlayers = Array.from(this.players.values()).filter(p => p.isCPU);
    cpuPlayers.forEach(cpu => {
      this.players.delete(cpu.id);
    });

    // Remove CPUs from team members
    this.teams.forEach(team => {
      team.members = team.members.filter(mid => {
        const member = this.players.get(mid);
        return member && !member.isCPU;
      });
    });

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
      beastModeTeam: this.beastModeTeam,
      beastModeUsedInGame: Array.from(this.beastModeUsedInGame), // Send list of players who used Beast Mode
      players: Array.from(this.players.values()).map(p => {
        const accuracy = this.playerAccuracy.get(p.id);
        return {
          id: p.id,
          name: p.name,
          score: p.score,
          teamId: p.teamId,
          isCPU: p.isCPU,
          accuracy: accuracy ? {
            correct: accuracy.correct,
            total: accuracy.total,
            percentage: accuracy.total > 0 ? Math.round((accuracy.correct / accuracy.total) * 100) : 0
          } : { correct: 0, total: 0, percentage: 0 }
        };
      }),
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
