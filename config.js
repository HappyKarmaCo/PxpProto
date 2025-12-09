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
    defaultTimerSeconds: 30,
    maxTeams: 2,           // Maximum number of teams allowed
    playersPerTeam: 4      // Players per team (CPUs fill remaining spots)
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
  // CPU player names to use when filling teams
  cpuPlayerNames: [
    "Bot Alpha", "Bot Beta", "Bot Gamma", "Bot Delta",
    "Bot Epsilon", "Bot Zeta", "Bot Eta", "Bot Theta"
  ]
};
