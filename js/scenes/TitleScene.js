class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  create() {
    this._stars = [];
    this._starGfx = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      this._stars.push({
        x: Phaser.Math.Between(0, GW),
        y: Phaser.Math.Between(0, GH),
        size: Math.random() < 0.25 ? 2 : 1,
        speed: 0.4 + Math.random() * 1.2,
      });
    }

    // タイトルロゴ
    this.add.text(GW / 2, 120, '九州シューター', {
      fontSize: '36px',
      fontFamily: 'sans-serif',
      color: '#ffffff',
      stroke: '#0044ff',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GW / 2, 168, '熊本ステージ', {
      fontSize: '22px',
      fontFamily: 'sans-serif',
      color: '#ffcc00',
    }).setOrigin(0.5);

    // ジムニーのイラスト（図形）
    this._drawJimny(GW / 2, 300);

    // 点滅テキスト
    const tap = this.add.text(GW / 2, 460, 'タップしてスタート', {
      fontSize: '20px',
      fontFamily: 'sans-serif',
      color: '#ffffff',
    }).setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0, duration: 700, yoyo: true, repeat: -1 });

    // ハイスコア表示
    const hi = this._getBestScore();
    this.add.text(GW / 2, 520, `BEST: ${hi.toLocaleString()}`, {
      fontSize: '18px',
      fontFamily: 'sans-serif',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // バージョン
    this.add.text(GW - 8, GH - 8, VERSION, {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#555555',
    }).setOrigin(1, 1);

    // スタートアクション
    this.input.once('pointerdown', () => this.scene.start('GameScene'));
    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('GameScene'));
  }

  update() {
    this._starGfx.clear();
    this._starGfx.fillStyle(C.STAR, 0.8);
    for (const s of this._stars) {
      s.y += s.speed;
      if (s.y > GH) s.y -= GH;
      this._starGfx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  _drawJimny(cx, cy) {
    const g = this.add.graphics();
    // ホイール
    g.fillStyle(C.WHEEL).fillCircle(cx - 22, cy + 14, 13);
    g.fillStyle(C.WHEEL).fillCircle(cx + 22, cy + 14, 13);
    g.fillStyle(C.WHEEL_RIM).fillCircle(cx - 22, cy + 14, 7);
    g.fillStyle(C.WHEEL_RIM).fillCircle(cx + 22, cy + 14, 7);
    // ボディ
    g.fillStyle(C.PLAYER).fillRoundedRect(cx - 34, cy - 8, 68, 26, 5);
    // キャビン
    g.fillStyle(C.CAB).fillRoundedRect(cx - 22, cy - 28, 44, 24, 4);
    // ウィンドウ
    g.fillStyle(C.WINDOW).fillRoundedRect(cx - 19, cy - 25, 38, 16, 3);
    // バンパー
    g.fillStyle(C.BUMPER).fillRect(cx - 30, cy + 16, 60, 5);
    // ルーフラック
    g.fillStyle(0x888888).fillRect(cx - 18, cy - 32, 36, 5);
  }

  _getBestScore() {
    const data = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.score));
  }
}
