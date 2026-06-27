class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  create() {
    // 前回選んだ難易度を引き継ぐ（なければNORMAL）
    this._selected = this.registry.get('difficulty') || 'NORMAL';

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
    this.add.text(GW / 2, 78, '九州シューター', {
      fontSize: '36px', fontFamily: 'sans-serif',
      color: '#ffffff', stroke: '#0044ff', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GW / 2, 120, '熊本ステージ', {
      fontSize: '20px', fontFamily: 'sans-serif', color: '#ffcc00',
    }).setOrigin(0.5);

    // ジムニーのイラスト
    this._drawJimny(GW / 2, 188);

    // ─ 難易度選択 ─
    this.add.text(GW / 2, 250, '難易度を選択', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#cccccc',
    }).setOrigin(0.5);

    this._diffButtons = {};
    const cols = [120, 280];
    const rows = [296, 352];
    DIFFICULTY_ORDER.forEach((key, i) => {
      const x = cols[i % 2];
      const y = rows[Math.floor(i / 2)];
      this._diffButtons[key] = this._makeDiffButton(x, y, key);
    });

    // 難易度の説明文
    this._descText = this.add.text(GW / 2, 396, '', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#99aacc',
    }).setOrigin(0.5);

    this._refreshDiffButtons();

    // ─ スタートボタン ─
    this._startBtn = this.add.container(GW / 2, 462);
    const btnBg = this.add.rectangle(0, 0, 240, 56, 0x113322)
      .setStrokeStyle(2, 0x44ff88);
    const btnTxt = this.add.text(0, 0, '▶ ゲームスタート', {
      fontSize: '22px', fontFamily: 'sans-serif', color: '#aaffcc',
    }).setOrigin(0.5);
    this._startBtn.add([btnBg, btnTxt]);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x1a5533); btnTxt.setColor('#ffffff'); });
    btnBg.on('pointerout',  () => { btnBg.setFillStyle(0x113322); btnTxt.setColor('#aaffcc'); });
    btnBg.on('pointerdown', () => this._start());
    this.tweens.add({ targets: this._startBtn, scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1 });

    // ハイスコア
    const hi = this._getBestScore();
    this.add.text(GW / 2, 520, `BEST: ${hi.toLocaleString()}`, {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaaaaa',
    }).setOrigin(0.5);

    // ランキングボタン
    const rankBtn = this.add.text(GW / 2, 556, '[ ランキングを見る ]', {
      fontSize: '15px', fontFamily: 'sans-serif', color: '#ffcc88',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    rankBtn.on('pointerdown', () => this.scene.start('LeaderboardScene'));

    // バージョン
    this.add.text(GW - 8, GH - 8, VERSION, {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#555555',
    }).setOrigin(1, 1);

    // スペースキーでも開始
    this.input.keyboard.once('keydown-SPACE', () => this._start());
  }

  _makeDiffButton(x, y, key) {
    const d = DIFFICULTY[key];
    const cont = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 130, 44, 0x111133).setStrokeStyle(2, 0x333355);
    const txt = this.add.text(0, 0, d.label, {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#888888',
    }).setOrigin(0.5);
    cont.add([bg, txt]);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', () => {
      this._selected = key;
      this._refreshDiffButtons();
    });
    return { cont, bg, txt, color: d.color };
  }

  _refreshDiffButtons() {
    Object.entries(this._diffButtons).forEach(([key, b]) => {
      const on = key === this._selected;
      b.bg.setStrokeStyle(on ? 3 : 2, on ? Phaser.Display.Color.HexStringToColor(b.color).color : 0x333355);
      b.bg.setFillStyle(on ? 0x1c1c44 : 0x111133);
      b.txt.setColor(on ? b.color : '#888888');
      b.cont.setScale(on ? 1.06 : 1);
    });
    this._descText.setText(DIFFICULTY[this._selected].desc);
  }

  _start() {
    this.registry.set('difficulty', this._selected);
    this.scene.start('GameScene', { difficulty: this._selected });
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
    g.fillStyle(C.WHEEL).fillCircle(cx - 22, cy + 14, 13);
    g.fillStyle(C.WHEEL).fillCircle(cx + 22, cy + 14, 13);
    g.fillStyle(C.WHEEL_RIM).fillCircle(cx - 22, cy + 14, 7);
    g.fillStyle(C.WHEEL_RIM).fillCircle(cx + 22, cy + 14, 7);
    g.fillStyle(C.PLAYER).fillRoundedRect(cx - 34, cy - 8, 68, 26, 5);
    g.fillStyle(C.CAB).fillRoundedRect(cx - 22, cy - 28, 44, 24, 4);
    g.fillStyle(C.WINDOW).fillRoundedRect(cx - 19, cy - 25, 38, 16, 3);
    g.fillStyle(C.BUMPER).fillRect(cx - 30, cy + 16, 60, 5);
    g.fillStyle(0x888888).fillRect(cx - 18, cy - 32, 36, 5);
  }

  _getBestScore() {
    const data = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.score));
  }
}
