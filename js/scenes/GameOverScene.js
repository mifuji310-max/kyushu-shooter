class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this._score   = data.score   || 0;
    this._cleared = data.cleared || false;
    this._scoreId = (data && data.scoreId) || null;
    this._submitted = false;
  }

  create() {
    this.cameras.main.setZoom(DPR).centerOn(GW / 2, GH / 2); // 高解像度化（座標系は不変）

    this._stars = [];
    this._starGfx = this.add.graphics();
    for (let i = 0; i < 60; i++) {
      this._stars.push({
        x: Phaser.Math.Between(0, GW), y: Phaser.Math.Between(0, GH),
        size: Math.random() < 0.25 ? 2 : 1, speed: 0.4 + Math.random(),
      });
    }

    const titleColor = this._cleared ? '#ffcc00' : '#ff4444';
    const titleText  = this._cleared ? 'STAGE CLEAR!' : 'GAME OVER';

    this.add.text(GW / 2, 100, titleText, {
      fontSize: '40px', fontFamily: 'sans-serif',
      color: titleColor, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(GW / 2, 170, `SCORE: ${this._score.toLocaleString()}`, {
      fontSize: '26px', fontFamily: 'sans-serif', color: '#ffffff',
    }).setOrigin(0.5);

    if (this._cleared) {
      this.add.text(GW / 2, 210, '+ ボーナス 10,000点', {
        fontSize: '16px', fontFamily: 'sans-serif', color: '#aaffaa',
      }).setOrigin(0.5);
    }

    // ハイスコア表示
    const best = this._getBestScore();
    const isNewRecord = this._score >= best;
    if (isNewRecord) {
      const rec = this.add.text(GW / 2, 248, '★ NEW RECORD! ★', {
        fontSize: '20px', fontFamily: 'sans-serif', color: '#ffcc00',
      }).setOrigin(0.5);
      this.tweens.add({ targets: rec, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 500 });
    } else {
      this.add.text(GW / 2, 248, `BEST: ${best.toLocaleString()}`, {
        fontSize: '18px', fontFamily: 'sans-serif', color: '#aaaaaa',
      }).setOrigin(0.5);
    }

    // ニックネーム入力エリア
    this.add.text(GW / 2, 300, 'ニックネームを入力', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#cccccc',
    }).setOrigin(0.5);

    // 入力ボックス（HTML input要素でオーバーレイ）
    this._nameInput = this._createInputOverlay();

    // 登録ボタン
    this._submitBtn = this.add.text(GW / 2, 420, '[ スコアを登録 ]', {
      fontSize: '20px', fontFamily: 'sans-serif',
      color: '#00ccff', backgroundColor: '#001133',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    this._submitBtn.on('pointerover', () => this._submitBtn.setColor('#ffffff'));
    this._submitBtn.on('pointerout',  () => this._submitBtn.setColor('#00ccff'));
    this._submitBtn.on('pointerdown', () => this._submit());

    // ボタン群
    const retryBtn = this.add.text(GW / 2 - 80, 490, '[ もう一度 ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#aaffaa',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retryBtn.on('pointerdown', () => { this._cleanup(); this.scene.start('GameScene'); });

    const rankBtn = this.add.text(GW / 2 + 80, 490, '[ ランキング ]', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#ffcc88',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    rankBtn.on('pointerdown', () => { this._cleanup(); this.scene.start('LeaderboardScene'); });

    const titleBtn = this.add.text(GW / 2, 540, '[ タイトルへ ]', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#888888',
      padding: { x: 10, y: 6 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    titleBtn.on('pointerdown', () => { this._cleanup(); this.scene.start('TitleScene'); });
  }

  update() {
    this._starGfx.clear();
    this._starGfx.fillStyle(C.STAR, 0.7);
    for (const s of this._stars) {
      s.y += s.speed;
      if (s.y > GH) s.y -= GH;
      this._starGfx.fillRect(s.x, s.y, s.size, s.size);
    }
  }

  _createInputOverlay() {
    // Phaser の上に HTML input を重ねる
    const canvas  = this.game.canvas;
    const rect    = canvas.getBoundingClientRect();
    const scaleX  = rect.width  / GW;
    const scaleY  = rect.height / GH;

    // 入力フィールドの背景
    this.add.rectangle(GW / 2, 358, 240, 38, 0x111133).setStrokeStyle(1, 0x4466cc);
    this.add.text(GW / 2, 360, '（ここに表示されます）', {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#666688',
    }).setOrigin(0.5).setName('placeholder');

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 16;
    inp.placeholder = 'ニックネーム';
    inp.style.cssText = [
      `position:fixed`,
      `left:${rect.left + (GW / 2 - 112) * scaleX}px`,
      `top:${rect.top  + 340 * scaleY}px`,
      `width:${224 * scaleX}px`,
      `height:${36 * scaleY}px`,
      `font-size:${16 * Math.min(scaleX, scaleY)}px`,
      `text-align:center`,
      `background:#1a1a44`,
      `color:#ffffff`,
      `border:1px solid #4466cc`,
      `border-radius:4px`,
      `padding:2px 8px`,
      `outline:none`,
      `z-index:999`,
    ].join(';');

    document.body.appendChild(inp);
    inp.focus();
    return inp;
  }

  _submit() {
    if (this._submitted) return; // 二重登録防止
    this._submitted = true;

    const name = (this._nameInput ? this._nameInput.value.trim() : '') || '名無し';
    const scores = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');

    // 保存済みエントリをIDで特定して名前を上書き（重複を作らない）
    let entry = this._scoreId ? scores.find(s => s.id === this._scoreId) : null;
    if (!entry) {
      // 旧データ用フォールバック: 同点で名前未設定の最新エントリ
      entry = scores.find(s => s.score === this._score && !s.name);
    }
    if (entry) {
      entry.name = name;
    } else {
      entry = { id: 'g' + Date.now(), score: this._score, name, version: VERSION,
        difficulty: this.registry.get('difficulty') || '', date: new Date().toISOString() };
      scores.push(entry);
    }
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('kyushu_scores', JSON.stringify(scores.slice(0, 100)));

    // 共有ランキングへ送信（オフライン/失敗時はローカルのみで続行）
    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      this._cleanup();
      this.scene.start('LeaderboardScene', { highlight: this._score });
    };

    const remoteEntry = {
      name, score: this._score, version: entry.version || VERSION,
      difficulty: entry.difficulty || '', date: entry.date || new Date().toISOString(),
    };

    if (typeof RemoteScores !== 'undefined' && RemoteScores.available) {
      this._submitBtn.setText('[ 登録中... ]').disableInteractive();
      RemoteScores.submit(remoteEntry).then(go).catch(go);
      this.time.delayedCall(4000, go); // 通信が遅い場合の保険
    } else {
      go();
    }
  }

  _cleanup() {
    if (this._nameInput && this._nameInput.parentNode) {
      this._nameInput.parentNode.removeChild(this._nameInput);
    }
  }

  _getBestScore() {
    const data = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    if (data.length === 0) return 0;
    return Math.max(...data.map(d => d.score));
  }
}
