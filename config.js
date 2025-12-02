// Feature flags - easily enable/disable features for testing
module.exports = {
  features: {
    teams: true,           // Enable team creation
    cpuTeams: true,        // Enable CPU teams
    trashTalk: true,       // Enable trash talk chat
    teamVsTeam: true       // Enable team-based scoring
  },
  game: {
    roundsPerGame: 10,
    buttonCount: 3,
    pointsPerSecond: 1,
    defaultTimerSeconds: 30
  },
  trashTalkPhrases: [
    "Nice try!",
    "We got this!",
    "Bring it on!",
    "Too slow!",
    "Easy win!",
    "Good luck!",
    "Is that all?",
    "Watch and learn!",
    "Game on!",
    "You'll get 'em next time!"
  ],
  cpuTeams: [
    { name: "CPU Crushers", players: ["BotAlpha", "BotBeta"] },
    { name: "AI Avengers", players: ["RoboOne"] }
  ]
};
