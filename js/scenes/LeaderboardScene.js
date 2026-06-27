class LeaderboardScene extends Phaser.Scene {
  constructor() { super({ key: 'LeaderboardScene' }); }

  init(data) {
    this._highlight = data ? data.highlight : null;
  }

  create() {
    this._stars = [];
    this._starGfx = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      this._stars.push({
        x: Phaser.Math.Between(0, GW), y: Phaser.Math.Between(0, GH),
        size: 1, speed: 0.4 + Math.random() * 0.8,
      });
    }

    this.add.text(GW / 2, 28, 'RANKING', {
      fontSize: '28px', fontFamily: 'sans-serif',
      color: '#ffcc00', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(GW / 2, 58, `熊本ステージ ${VERSION}`, {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#666688',
    }).setOrigin(0.5);

    const scores = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    this._drawRankings(scores);

    // ボタン
    const retry = this.add.text(GW / 2 - 80, GH - 50, '[ もう一度 ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaffaa',
      padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => this.scene.start('GameScene'));

    const title = this.add.text(GW / 2 + 80, GH - 50, '[ タイトル ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaaaff',
      padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    title.on('pointerdown', () => this.scene.start('TitleScene'));

    // スコアなし
    if (scores.length === 0) {
      this.add.text(GW / 2, GH / 2, 'まだスコアがありません', {
        fontSize: '16px', fontFamily: 'sans-serif', color: '#666666',
      }).setOrigin(0.5);
    }
  }

  update() {
    this._starGfx.clear();
    this._starGfx.fillStyle(C.STAR, 0.5);
    for (const s of this._stars) {
      s.y += s.speed;
      if (s.y > GH) s.y -= GH;
      this._starGfx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  _drawRankings(scores) {
    const top = scores.slice(0, 10);
    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];

    top.forEach((entry, i) => {
      const y    = 92 + i * 52;
      const rank = i + 1;
      const isHi = entry.score === this._highlight;

      // 背景ハイライト
      if (isHi) {
        this.add.rectangle(GW / 2, y + 14, GW - 20, 46, 0x1a1a44, 0.8)
          .setStrokeStyle(1, 0x4466ff);
      } else if (i % 2 === 0) {
        this.add.rectangle(GW / 2, y + 14, GW - 20, 46, 0x0a0a22, 0.5);
      }

      // 順位
      const rankColor = rank <= 3 ? rankColors[rank - 1] : '#888888';
      const rankStr = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `${rank}.`;
      this.add.text(20, y + 8, rankStr, {
        fontSize: rank <= 3 ? '22px' : '18px',
        fontFamily: 'sans-serif',
        color: rankColor,
      });

      // 名前
      const name = entry.name || '名無し';
      this.add.text(62, y + 6, name, {
        fontSize: '18px', fontFamily: 'sans-serif',
        color: isHi ? '#ffffff' : '#cccccc',
      });

      // スコア
      this.add.text(GW - 18, y + 6, entry.score.toLocaleString(), {
        fontSize: '20px', fontFamily: 'sans-serif',
        color: isHi ? '#ffcc00' : '#ffffff',
      }).setOrigin(1, 0);

      // 日付・バージョン
      const date = entry.date
        ? new Date(entry.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
        : '';
      this.add.text(62, y + 28, `${date}  ${entry.version || ''}`, {
        fontSize: '11px', fontFamily: 'sans-serif', color: '#555577',
      });
    });
  }
}
