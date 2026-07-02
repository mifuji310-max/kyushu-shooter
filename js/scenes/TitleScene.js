class TitleScene extends Phaser.Scene {
  constructor() { super({ key: 'TitleScene' }); }

  preload() {
    this.load.image('title_logo', 'img/KyushuShooterTitle.png');
  }

  create() {
    this.cameras.main.setZoom(DPR).centerOn(GW / 2, GH / 2); // 高解像度化（座標系は不変）

    SFX.init();
    this.input.once('pointerdown', () => SFX.resume()); // 自動再生制限の解除

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

    // タイトルロゴ画像（背景透過済み。通常合成で星空に重ねる）
    this.add.image(GW / 2, 118, 'title_logo').setScale(0.26);

    TXT(this, GW / 2, 212, '熊本ステージ', {
      fontSize: '20px', fontFamily: 'sans-serif', color: '#ffcc00',
    }).setOrigin(0.5);

    // ─ 難易度選択 ─
    TXT(this, GW / 2, 250, '難易度を選択', {
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
    this._descText = TXT(this, GW / 2, 396, '', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#99aacc',
    }).setOrigin(0.5);

    this._refreshDiffButtons();

    // ─ スタートボタン ─
    this._startBtn = mkButton(this, GW / 2, 466, 'GAME START', {
      w: 244, h: 58, fontSize: '25px',
      bg: 0x0f3d24, bgHover: 0x1a6b3f, border: 0x44ff88, fg: '#c7ffdd',
      onClick: () => this._start(),
    });
    this.tweens.add({ targets: this._startBtn, scaleX: 1.04, scaleY: 1.04,
      duration: 700, yoyo: true, repeat: -1 });

    // ハイスコア
    const hi = this._getBestScore();
    TXT(this, GW / 2, 520, `BEST: ${hi.toLocaleString()}`, {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaaaaa',
    }).setOrigin(0.5);

    // ランキングボタン
    mkButton(this, GW / 2, 558, 'ランキング', {
      w: 170, h: 40, fontSize: '16px',
      bg: 0x3a2c12, bgHover: 0x62481e, border: 0xffbb66, fg: '#ffe6c2',
      onClick: () => this.scene.start('LeaderboardScene'),
    });

    // 音量UI
    this._makeVolumeUI(612);

    // バージョン
    TXT(this, GW - 8, GH - 8, VERSION, {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#555555',
    }).setOrigin(1, 1);

    // スペースキーでも開始
    this.input.keyboard.once('keydown-SPACE', () => this._start());
  }

  _makeVolumeUI(y) {
    const w = 150;
    const x0 = GW / 2 - w / 2 + 16;      // トラック左端（=音量0）
    const x1 = GW / 2 + w / 2 + 16;      // トラック右端（=音量1）

    // ミュート/スピーカー アイコン（タップで切替）
    this._muteIcon = TXT(this, GW / 2 - w / 2 - 24, y, SFX.isMuted() ? '🔇' : '🔊', {
      fontSize: '22px',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this._muteIcon.on('pointerdown', () => {
      SFX.init(); SFX.resume();
      SFX.setMuted(!SFX.isMuted());
      this._muteIcon.setText(SFX.isMuted() ? '🔇' : '🔊');
      this._refreshVol();
      if (!SFX.isMuted()) SFX.powerup();
    });

    // トラック・フィル・ノブ
    this.add.rectangle((x0 + x1) / 2, y, w, 6, 0x333355).setOrigin(0.5);
    this._volFill = this.add.rectangle(x0, y, 0, 6, 0x66ccff).setOrigin(0, 0.5);
    this._volKnob = this.add.circle(x0, y, 11, 0xffffff).setInteractive({ useHandCursor: true });
    this._volTrack = { x0, x1 };
    this.input.setDraggable(this._volKnob);
    this._volKnob.on('drag', (p, dx) => this._setVolFromX(dx));
    // トラックをタップしても設定できるようゾーンを敷く
    const zone = this.add.zone((x0 + x1) / 2, y, w + 30, 30).setOrigin(0.5).setInteractive();
    zone.on('pointerdown', p => this._setVolFromX(p.worldX));

    this._refreshVol();
  }

  _setVolFromX(px) {
    const { x0, x1 } = this._volTrack;
    const v = Phaser.Math.Clamp((px - x0) / (x1 - x0), 0, 1);
    SFX.init(); SFX.resume();
    if (SFX.isMuted() && v > 0) { SFX.setMuted(false); this._muteIcon.setText('🔊'); }
    SFX.setVolume(v);
    this._refreshVol();
  }

  _refreshVol() {
    const { x0, x1 } = this._volTrack;
    const v = SFX.isMuted() ? 0 : SFX.volume;
    const px = x0 + (x1 - x0) * v;
    this._volKnob.x = px;
    this._volFill.width = px - x0;
  }

  _makeDiffButton(x, y, key) {
    const d = DIFFICULTY[key];
    const cont = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 130, 44, 0x111133).setStrokeStyle(2, 0x333355);
    const txt = TXT(this, 0, 0, d.label, {
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
