class LeaderboardScene extends Phaser.Scene {
  constructor() { super({ key: 'LeaderboardScene' }); }

  init(data) {
    this._highlight = data ? data.highlight : null;
  }

  create() {
    this.cameras.main.setZoom(DPR).centerOn(GW / 2, GH / 2); // 高解像度化（座標系は不変）

    this._stars = [];
    this._starGfx = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      this._stars.push({
        x: Phaser.Math.Between(0, GW), y: Phaser.Math.Between(0, GH),
        size: 1, speed: 0.4 + Math.random() * 0.8,
      });
    }

    TXT(this, GW / 2, 28, 'RANKING', {
      fontSize: '28px', fontFamily: 'sans-serif',
      color: '#ffcc00', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    TXT(this, GW / 2, 54, `熊本ステージ ${VERSION}`, {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#666688',
    }).setOrigin(0.5);

    // オンライン/オフライン表示
    this._statusText = TXT(this, GW / 2, 74, '', {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#8899bb',
    }).setOrigin(0.5);

    // ボタン
    const retry = TXT(this, GW / 2 - 80, GH - 50, '[ もう一度 ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaffaa',
      padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => this.scene.start('GameScene'));

    const title = TXT(this, GW / 2 + 80, GH - 50, '[ タイトル ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaaaff',
      padding: { x: 8, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    title.on('pointerdown', () => this.scene.start('TitleScene'));

    // ローカルは常に掃除して保持（オフライン用フォールバック）
    let local = this._dedupe(JSON.parse(localStorage.getItem('kyushu_scores') || '[]'));
    localStorage.setItem('kyushu_scores', JSON.stringify(local));

    this._loadingText = TXT(this, GW / 2, GH / 2, '読み込み中...', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#8888aa',
    }).setOrigin(0.5);

    // 共有ランキングを優先取得。取れなければローカルを表示
    if (typeof RemoteScores !== 'undefined' && RemoteScores.available) {
      RemoteScores.fetchTop(20).then(remote => {
        if (remote) this._render(remote, true);
        else this._render(local, false);
      });
    } else {
      this._render(local, false);
    }
  }

  _render(list, online) {
    if (this._loadingText) { this._loadingText.destroy(); this._loadingText = null; }
    this._statusText
      .setText(online ? '🌐 オンライン共有ランキング' : '📱 端末内ランキング（オフライン）')
      .setColor(online ? '#66ddaa' : '#8899bb');

    if (!list || list.length === 0) {
      TXT(this, GW / 2, GH / 2, 'まだスコアがありません', {
        fontSize: '16px', fontFamily: 'sans-serif', color: '#666666',
      }).setOrigin(0.5);
      return;
    }
    this._drawRankings(list);
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

  // 旧バージョンの不具合で生じた重複（同スコアの「名無し」と記名のダブり）を掃除。
  // 同じ(score,version)に記名エントリがある場合、名無しの方を削除する。
  _dedupe(scores) {
    const named = new Set(
      scores.filter(s => s.name).map(s => s.score + '|' + (s.version || ''))
    );
    return scores.filter(s => s.name || !named.has(s.score + '|' + (s.version || '')));
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
      TXT(this, 20, y + 8, rankStr, {
        fontSize: rank <= 3 ? '22px' : '18px',
        fontFamily: 'sans-serif',
        color: rankColor,
      });

      // 名前
      const name = entry.name || '名無し';
      TXT(this, 62, y + 6, name, {
        fontSize: '18px', fontFamily: 'sans-serif',
        color: isHi ? '#ffffff' : '#cccccc',
      });

      // スコア
      TXT(this, GW - 18, y + 6, entry.score.toLocaleString(), {
        fontSize: '20px', fontFamily: 'sans-serif',
        color: isHi ? '#ffcc00' : '#ffffff',
      }).setOrigin(1, 0);

      // 日付・難易度・バージョン
      const date = entry.date
        ? new Date(entry.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
        : '';
      const diff = entry.difficulty ? entry.difficulty + ' ' : '';
      const diffColor = entry.difficulty && DIFFICULTY[entry.difficulty]
        ? DIFFICULTY[entry.difficulty].color : '#555577';
      TXT(this, 62, y + 28, `${date}  ${entry.version || ''}`, {
        fontSize: '11px', fontFamily: 'sans-serif', color: '#555577',
      });
      if (diff) {
        TXT(this, GW - 18, y + 30, diff.trim(), {
          fontSize: '11px', fontFamily: 'sans-serif', color: diffColor,
        }).setOrigin(1, 0);
      }
    });
  }
}
