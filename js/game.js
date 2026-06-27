const config = {
  type: Phaser.AUTO,
  width: GW,
  height: GH,
  backgroundColor: C.BG,
  parent: 'game-container',
  scene: [TitleScene, GameScene, GameOverScene, LeaderboardScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
};

window._game = new Phaser.Game(config);
