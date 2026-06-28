// バッファはDPR倍の高解像度（GW*DPR × GH*DPR）。
// 各シーンで camera.setZoom(DPR).centerOn(...) して座標系を GW×GH に保つ。
const config = {
  type: Phaser.AUTO,
  width: GW * DPR,
  height: GH * DPR,
  backgroundColor: C.BG,
  parent: 'game-container',
  scene: [TitleScene, GameScene, GameOverScene, LeaderboardScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
};

window._game = new Phaser.Game(config);
