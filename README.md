# Game Prototype

A modular online multiplayer game prototype for testing features including team creation, team vs team battles, and trash talk chat system.

## Features

### Core Game
- **Player Experience**: Name entry → Lobby → Game rounds → Leaderboard
- **10 Rounds**: Each round presents 4 buttons, one is randomly correct
- **Scoring**: 1 point per second remaining when correct answer is submitted
- **Real-time Updates**: All players see updates simultaneously via WebSocket

### Testable Features (Toggle in config.js)
- **Team Creation**: Players can create and join teams
- **CPU Teams**: Bot teams for testing team features
- **Team vs Team**: Aggregate team scoring and team leaderboards
- **Trash Talk Chat**: 10 predetermined chat phrases for player interaction

### Admin Panel
- View all players and scores in real-time
- Set timer length (5-120 seconds)
- Start game and control rounds
- Reset game at any time
- Monitor team formations and scores

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```

The server will start on `http://localhost:3000`

### 3. Access the Game

**Player Interface:**
- Open `http://localhost:3000` in a browser
- Enter your name to join the lobby

**Admin Panel:**
- Open `http://localhost:3000/admin` in a separate browser window/tab
- Control the game from here

### 4. Testing with Multiple Players
Open multiple browser windows/tabs to `http://localhost:3000` to simulate multiple players.

## Configuration

Edit `config.js` to toggle features and adjust settings:

```javascript
features: {
  teams: true,           // Enable team creation
  cpuTeams: true,        // Enable CPU teams
  trashTalk: true,       // Enable trash talk chat
  teamVsTeam: true       // Enable team-based scoring
}
```

### Game Settings
- `roundsPerGame`: Number of rounds (default: 10)
- `buttonCount`: Number of buttons per round (default: 4)
- `pointsPerSecond`: Points awarded per second remaining (default: 1)
- `defaultTimerSeconds`: Default timer length (default: 30)

### Trash Talk Phrases
Edit the `trashTalkPhrases` array in `config.js` to customize chat options.

### CPU Teams
Edit the `cpuTeams` array in `config.js` to add/remove bot teams:
```javascript
cpuTeams: [
  { name: "CPU Crushers", players: ["BotAlpha", "BotBeta"] },
  { name: "AI Avengers", players: ["RoboOne"] }
]
```

## How to Play

### For Players
1. Enter your name and join the lobby
2. **(Optional)** Create or join a team
3. Wait for the admin to start the game
4. Each round: Click one of the 4 buttons
5. You can change your answer before time runs out
6. Correct answers earn points (faster = more points)
7. View your ranking on the leaderboard between rounds
8. **(Optional)** Use trash talk to engage with other players

### For Admins
1. Open the admin panel
2. Set the desired timer length
3. Wait for players to join
4. Click "Start Game" to begin
5. After each round ends, click "Start Round" for the next round
6. Monitor player/team progress in real-time
7. Use "Reset Game" to start over

## Project Structure

```
pxp/
├── config.js              # Feature flags and game configuration
├── server.js              # Express + Socket.io server
├── game/
│   └── GameManager.js     # Core game logic and state management
├── public/
│   ├── player.html        # Player interface
│   └── admin.html         # Admin panel
├── package.json
└── README.md
```

## Adding/Removing Features

The prototype is designed for easy feature testing:

1. **Toggle features** in `config.js` (set to `true` or `false`)
2. **No code changes needed** - features automatically enable/disable
3. **Modular design** - each feature is self-contained

## Technical Details

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Communication**: Real-time WebSocket connections
- **State**: In-memory (resets on server restart)
- **Scale**: Optimized for 5-10 concurrent players

## Deployment

### Local Testing
Already configured! Just run `npm start`.

### Online Testing
Deploy to any Node.js hosting service:
- Heroku
- Railway
- Render
- DigitalOcean App Platform
- Fly.io

**Note**: Update the Socket.io connection in HTML files if deploying to a different domain.

## Troubleshooting

**Players not connecting?**
- Check that the server is running on port 3000
- Verify no firewall is blocking the connection

**Timer not syncing?**
- This is expected with minor network latency
- Client-side timers are for display only

**CPU teams not appearing?**
- Verify `cpuTeams: true` in `config.js`
- Check console for any errors

## Future Enhancement Ideas

- Persistent database for score history
- User authentication
- Multiple game rooms
- Custom question types beyond random buttons
- Power-ups and special abilities
- Tournament brackets
- Replay system
- Analytics dashboard
