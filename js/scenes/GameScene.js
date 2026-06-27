class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─── LIFECYCLE ─────────────────────────────────────────

  create() {
    this.score      = 0;
    this.stageTime  = 0;
    this.bossActive = false;
    this.bossDefeated = false;
    this.playerHP   = PLAYER_MAX_HP;
    this.invincible = false;
    this.gameEnded  = false;
    this.powerLevel = 1;   // 1〜3
    this.waveTimers = {};

    this._makeTextures();
    this._makeBackground();
    this._makePlayer();
    this._makeGroups();
    this._makeUI();
    this._setupTouch();
    this._setupColliders();
    this._setupTimers();
  }

  update(time, delta) {
    if (this.gameEnded) return;
    this._scrollBackground(delta);
    this._movePlayer(delta);
    this._updateEnemies(time, delta);
    this._updateBoss(time, delta);
    this._updateUI();
    this._cleanupOffscreen();

    // 最終防衛線: 自機は決して隠さない方針なので、もし何かで消えていたら
    // 毎フレーム無条件に復活させる（端末GPU依存の消失事故を物理的に不可能にする）
    if (this.player && this.player.active &&
        (!this.player.visible || this.player.alpha < 1)) {
      this.player.setVisible(true).clearTint().setAlpha(1);
    }
  }

  // ─── TEXTURE GENERATION ────────────────────────────────

  _makeTextures() {
    this._texPlayer();
    this._texBullet();
    this._texEnemyBullet();
    this._texRenkon();
    this._texJintaiko();
    this._texKingyo();
    this._texChip();
    this._texKyoryu();
    this._texUma();
    this._texBoss();
    this._texExplosion();
    this._texIkinaridango();
    this._texTennensui();
  }

  _gTex(key, w, h, fn) {
    const g = this.add.graphics();
    fn(g);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  _texPlayer() {
    this._gTex('player', 56, 52, g => {
      const cx = 28, cy = 28;
      g.fillStyle(C.WHEEL).fillCircle(cx - 20, cy + 16, 12);
      g.fillStyle(C.WHEEL).fillCircle(cx + 20, cy + 16, 12);
      g.fillStyle(C.WHEEL_RIM).fillCircle(cx - 20, cy + 16, 7);
      g.fillStyle(C.WHEEL_RIM).fillCircle(cx + 20, cy + 16, 7);
      g.fillStyle(C.PLAYER).fillRoundedRect(cx - 26, cy - 4, 52, 24, 5);
      g.fillStyle(C.CAB).fillRoundedRect(cx - 18, cy - 22, 36, 22, 4);
      g.fillStyle(C.WINDOW).fillRoundedRect(cx - 15, cy - 19, 30, 14, 3);
      g.fillStyle(C.BUMPER).fillRect(cx - 22, cy + 18, 44, 5);
      g.fillStyle(0x999999).fillRect(cx - 14, cy - 26, 28, 5);
    });
  }

  _texBullet() {
    this._gTex('bullet', 6, 16, g => {
      g.fillStyle(C.P_BULLET).fillRoundedRect(0, 0, 6, 16, 3);
      g.fillStyle(0xffffff, 0.7).fillRect(2, 2, 2, 6);
    });
  }

  _texEnemyBullet() {
    this._gTex('e_bullet', 8, 8, g => {
      g.fillStyle(C.E_BULLET).fillCircle(4, 4, 4);
      g.fillStyle(0xff8888, 0.6).fillCircle(3, 3, 2);
    });
  }

  _texRenkon() {
    this._gTex('enemy_renkon', 34, 34, g => {
      const cx = 17, cy = 17;
      g.fillStyle(C.RENKON).fillCircle(cx, cy, 15);
      g.lineStyle(2, C.RENKON_D).strokeCircle(cx, cy, 15);
      g.fillStyle(C.RENKON_D).fillCircle(cx, cy, 4);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.fillStyle(C.RENKON_D).fillCircle(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 3);
      }
      g.fillStyle(0xff0000).fillCircle(cx - 5, cy - 2, 2);
      g.fillStyle(0xff0000).fillCircle(cx + 5, cy - 2, 2);
    });
  }

  _texJintaiko() {
    this._gTex('enemy_jintaiko', 40, 32, g => {
      g.fillStyle(C.JINTAIKO).fillEllipse(20, 16, 38, 28);
      g.lineStyle(3, C.JINTAIKO_D).strokeEllipse(20, 16, 38, 28);
      g.fillStyle(0xd7ccc8).fillEllipse(20, 16, 26, 18);
      g.lineStyle(2, C.JINTAIKO).strokeEllipse(20, 16, 26, 18);
      g.lineStyle(2, C.JINTAIKO_D).strokeEllipse(20, 16, 38, 4);
      g.fillStyle(0xff0000).fillCircle(15, 13, 2);
      g.fillStyle(0xff0000).fillCircle(25, 13, 2);
    });
  }

  _texKingyo() {
    this._gTex('enemy_kingyo', 40, 28, g => {
      g.fillStyle(C.KINGYO_D);
      g.fillTriangle(30, 14, 40, 4, 40, 24);
      g.fillStyle(C.KINGYO).fillEllipse(18, 14, 34, 20);
      g.fillStyle(0xff8a65).fillCircle(6, 14, 9);
      g.fillStyle(0xffffff).fillCircle(4, 11, 3);
      g.fillStyle(0x000000).fillCircle(4, 11, 1.5);
      g.fillStyle(C.KINGYO_D);
      g.fillTriangle(15, 14, 22, 4, 28, 14);
    });
  }

  _texChip() {
    this._gTex('enemy_chip', 40, 28, g => {
      g.fillStyle(C.CHIP_D);
      for (let i = 0; i < 4; i++) {
        g.fillRect(0, 4 + i * 6, 6, 4);
        g.fillRect(34, 4 + i * 6, 6, 4);
      }
      g.fillStyle(C.CHIP).fillRoundedRect(6, 0, 28, 28, 3);
      g.lineStyle(1, C.CHIP_D).strokeRoundedRect(6, 0, 28, 28, 3);
      g.lineStyle(1, C.CHIP_GREEN, 0.8);
      g.strokeRect(10, 4, 20, 20);
      g.strokeRect(14, 8, 12, 12);
      g.lineBetween(10, 14, 6, 14);
      g.lineBetween(30, 14, 34, 14);
      g.fillStyle(C.CHIP_GREEN).fillRect(16, 11, 8, 6);
    });
  }

  _texKyoryu() {
    this._gTex('enemy_kyoryu', 48, 44, g => {
      g.fillStyle(C.KYORYU_D);
      g.fillTriangle(30, 30, 48, 20, 44, 40);
      g.fillStyle(C.KYORYU).fillEllipse(22, 26, 36, 28);
      g.fillStyle(C.KYORYU).fillEllipse(10, 14, 22, 18);
      g.fillStyle(C.KYORYU_D);
      g.fillTriangle(16, 12, 20, 0, 24, 12);
      g.fillTriangle(24, 14, 28, 2, 32, 14);
      g.fillStyle(0xffcc00).fillCircle(6, 12, 3);
      g.fillStyle(0x000000).fillCircle(6, 12, 1.5);
      g.fillStyle(0xffffff);
      g.fillTriangle(2, 18, 6, 18, 4, 22);
      g.fillTriangle(8, 18, 12, 18, 10, 22);
    });
  }

  _texUma() {
    this._gTex('enemy_uma', 36, 50, g => {
      g.fillStyle(C.UMA_D);
      g.fillRect(8, 38, 6, 12);
      g.fillRect(22, 38, 6, 12);
      g.fillStyle(C.UMA).fillRoundedRect(4, 18, 28, 24, 5);
      g.fillStyle(C.UMA).fillRoundedRect(10, 6, 12, 18, 4);
      g.fillStyle(C.UMA).fillRoundedRect(6, 0, 18, 14, 4);
      g.fillStyle(C.UMA_D).fillRect(10, 0, 4, 16);
      g.fillStyle(0xffffff).fillCircle(9, 5, 3);
      g.fillStyle(0x000000).fillCircle(9, 5, 1.5);
      g.fillStyle(0x1a1a1a);
      g.fillRect(7, 48, 8, 4);
      g.fillRect(21, 48, 8, 4);
    });
  }

  _texBoss() {
    this._gTex('boss', 120, 110, g => {
      const cx = 60, cy = 58;
      g.fillStyle(C.BOSS_METAL);
      g.fillRoundedRect(cx - 58, cy - 10, 18, 40, 4);
      g.fillRoundedRect(cx + 40, cy - 10, 18, 40, 4);
      g.fillCircle(cx - 49, cy + 30, 10);
      g.fillCircle(cx + 49, cy + 30, 10);
      g.fillStyle(C.BOSS_EAR).fillCircle(cx - 30, cy - 36, 18);
      g.fillStyle(C.BOSS_EAR).fillCircle(cx + 30, cy - 36, 18);
      g.fillStyle(C.BOSS_METAL).fillCircle(cx - 30, cy - 36, 10);
      g.fillStyle(C.BOSS_METAL).fillCircle(cx + 30, cy - 36, 10);
      g.fillStyle(C.BOSS).fillEllipse(cx, cy, 98, 88);
      g.lineStyle(2, 0x333333).strokeEllipse(cx, cy, 98, 88);
      g.fillStyle(C.BOSS_METAL).fillRoundedRect(cx - 40, cy + 8, 80, 30, { bl: 20, br: 20, tl: 0, tr: 0 });
      g.lineStyle(1, 0x90a4ae).strokeRoundedRect(cx - 40, cy + 8, 80, 30, { bl: 20, br: 20, tl: 0, tr: 0 });
      g.fillStyle(C.BOSS_BOLT);
      [[-32, 18], [32, 18], [-20, 30], [20, 30]].forEach(([dx, dy]) => {
        g.fillCircle(cx + dx, cy + dy, 3);
      });
      g.fillStyle(0x000000).fillRoundedRect(cx - 34, cy - 20, 26, 16, 3);
      g.fillStyle(0x000000).fillRoundedRect(cx + 8, cy - 20, 26, 16, 3);
      g.fillStyle(C.BOSS_EYE, 0.9).fillRoundedRect(cx - 32, cy - 18, 22, 12, 2);
      g.fillStyle(C.BOSS_EYE, 0.9).fillRoundedRect(cx + 10, cy - 18, 22, 12, 2);
      g.fillStyle(0xff8888, 0.7).fillRect(cx - 28, cy - 15, 14, 6);
      g.fillStyle(0xff8888, 0.7).fillRect(cx + 14, cy - 15, 14, 6);
      g.fillStyle(C.BOSS_METAL).fillEllipse(cx, cy + 6, 20, 12);
      g.fillStyle(0x444444).fillCircle(cx - 5, cy + 6, 3);
      g.fillStyle(0x444444).fillCircle(cx + 5, cy + 6, 3);
      g.lineStyle(1, C.BOSS_GLOW, 0.5);
      g.lineBetween(cx - 48, cy - 10, cx - 40, cy - 10);
      g.lineBetween(cx + 48, cy - 10, cx + 40, cy - 10);
    });
  }

  _texExplosion() {
    this._gTex('explosion', 40, 40, g => {
      g.fillStyle(0xff6d00, 0.8).fillCircle(20, 20, 18);
      g.fillStyle(0xffcc00, 0.9).fillCircle(20, 20, 12);
      g.fillStyle(0xffffff, 0.8).fillCircle(20, 20, 6);
    });
  }

  // いきなり団子（パワーアップ）
  _texIkinaridango() {
    this._gTex('item_power', 28, 28, g => {
      // 饅頭の土台（いも）
      g.fillStyle(0xc8860a).fillEllipse(14, 18, 24, 14);
      // 饅頭（丸）
      g.fillStyle(0xd4a017).fillCircle(14, 13, 11);
      g.lineStyle(1, 0x8b6400).strokeCircle(14, 13, 11);
      // あんこ（上部の暗い部分）
      g.fillStyle(0x3e1f00, 0.5).fillCircle(14, 10, 7);
      // ハイライト
      g.fillStyle(0xffe57f, 0.6).fillEllipse(10, 8, 8, 5);
      // P マーク
      g.fillStyle(0xffffff);
      g.fillRect(12, 11, 2, 6);
      g.fillRect(12, 11, 5, 2);
      g.fillRect(12, 14, 5, 2);
      g.fillRect(17, 11, 2, 3);
    });
  }

  // 天然水ボトル（回復）
  _texTennensui() {
    this._gTex('item_heal', 18, 30, g => {
      // キャップ
      g.fillStyle(0x1565c0).fillRoundedRect(5, 0, 8, 7, 2);
      // ボトル本体
      g.fillStyle(0xe3f2fd, 0.85).fillRoundedRect(2, 6, 14, 22, 4);
      g.lineStyle(1, 0x90caf9).strokeRoundedRect(2, 6, 14, 22, 4);
      // 水（中身）
      g.fillStyle(0x64b5f6, 0.7).fillRoundedRect(3, 8, 12, 18, 3);
      // ラベル（白帯）
      g.fillStyle(0xffffff, 0.9).fillRect(3, 14, 12, 8);
      // ＋マーク
      g.fillStyle(0x43a047);
      g.fillRect(8, 16, 2, 4);
      g.fillRect(6, 17, 6, 2);
      // ハイライト
      g.fillStyle(0xffffff, 0.5).fillRect(4, 9, 3, 8);
    });
  }

  // ─── BACKGROUND ────────────────────────────────────────

  _makeBackground() {
    // 空（夜明け前の暗い空）
    this.add.rectangle(GW / 2, 60, GW, 120, 0x1a1a35).setDepth(0);
    this.add.rectangle(GW / 2, 160, GW, 80, 0x1a2a1a).setDepth(0);

    // 田んぼ（左右）
    const fieldW = (GW - 130) / 2;
    this.add.rectangle(fieldW / 2, PLAY_H / 2, fieldW, PLAY_H, 0x1c3a10).setDepth(0);
    this.add.rectangle(GW - fieldW / 2, PLAY_H / 2, fieldW, PLAY_H, 0x1c3a10).setDepth(0);

    // 田んぼの畦（横線）スクロール用
    this._fieldLines = [];
    const fieldLX = fieldW / 2;
    const fieldRX = GW - fieldW / 2;
    for (let i = 0; i < 12; i++) {
      const y = i * (PLAY_H / 10);
      const lLine = this.add.rectangle(fieldLX, y, fieldW - 4, 2, 0x2a5a18, 0.7).setDepth(1);
      const rLine = this.add.rectangle(fieldRX, y, fieldW - 4, 2, 0x2a5a18, 0.7).setDepth(1);
      this._fieldLines.push({ obj: lLine, y, x: fieldLX });
      this._fieldLines.push({ obj: rLine, y, x: fieldRX });
    }

    // 道路（中央）
    this.add.rectangle(GW / 2, PLAY_H / 2, 130, PLAY_H, 0x2e2e2e).setDepth(1);
    // 歩道（道路縁石）
    this.add.rectangle(GW / 2 - 65, PLAY_H / 2, 6, PLAY_H, 0x8a8878).setDepth(2);
    this.add.rectangle(GW / 2 + 65, PLAY_H / 2, 6, PLAY_H, 0x8a8878).setDepth(2);

    // 道路中央ライン（スクロール）
    // 弾(黄色・短い丸帯)と紛れないよう、長く・細く・薄い灰白色のレーン標示にする
    this._roadDashes = [];
    const dashSpacing = 90;
    const dashCount = Math.ceil((PLAY_H + 180) / dashSpacing);
    this._roadLoopH = dashCount * dashSpacing;
    for (let i = 0; i < dashCount; i++) {
      const y = i * dashSpacing - 90;
      const dash = this.add.rectangle(GW / 2, y, 5, 46, 0xb0ad95, 0.32).setDepth(3);
      this._roadDashes.push({ obj: dash, y });
    }

    // 操作エリア背景
    this.add.rectangle(GW / 2, GH - CONTROL_H / 2, GW, CONTROL_H, C.CTRL_BG, 0.9).setDepth(20);
    this.add.text(GW / 2, GH - CONTROL_H + 14, '◀  ここでタッチ操作  ▶', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#334488',
    }).setOrigin(0.5).setDepth(21);

    const div = this.add.graphics().setDepth(22);
    div.lineStyle(1, 0x334488, 0.8).lineBetween(0, PLAY_H, GW, PLAY_H);
  }

  _scrollBackground(delta) {
    // FPSに依存しないよう時間ベースで進める（タッチ操作時の速度急変を防ぐ）
    // capを34ms(≒2フレーム)に絞り、指を離した瞬間のカクつきによる速度スパイクを抑える
    const f = Math.min(delta, 34) / 16.667;
    const speed = 2.5 * f;
    // 道路ダッシュ（均等間隔を保ってループ）
    for (const d of this._roadDashes) {
      d.y += speed * 2;
      if (d.y > this._roadLoopH - 90) d.y -= this._roadLoopH;
      d.obj.y = d.y;
    }
    // 田んぼ畦
    for (const l of this._fieldLines) {
      l.y += speed;
      if (l.y > PLAY_H + 10) l.y -= PLAY_H + 20;
      l.obj.y = l.y;
    }
  }

  // ─── SETUP ─────────────────────────────────────────────

  _makePlayer() {
    this.player = this.physics.add.sprite(GW / 2, PLAY_H - 60, 'player');
    this.player.setCollideWorldBounds(false);
    this.player.setDepth(10);
    this.player.body.setSize(44, 32);
    this.player.body.setOffset(6, 8);
  }

  _makeGroups() {
    this.playerBullets = this.physics.add.group();
    this.enemies       = this.physics.add.group();
    this.enemyBullets  = this.physics.add.group();
    this.bossGroup     = this.physics.add.group();
    this.items         = this.physics.add.group();
  }

  _makeUI() {
    // ─ スコア・タイマー（上部）
    this._scoreText = this.add.text(10, 10, 'SCORE: 0', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#ffffff',
    }).setDepth(30);

    this._timerText = this.add.text(GW - 10, 10, String(STAGE_DURATION), {
      fontSize: '24px', fontFamily: 'sans-serif', color: '#ffffff',
    }).setOrigin(1, 0).setDepth(30);

    // ─ ボスHPバー（上部・非表示待機）
    this._bossHpContainer = this.add.container(0, 0).setDepth(30).setVisible(false);
    const bossLabel = this.add.text(GW / 2, 32, '機械くまモン', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#ff6666',
    }).setOrigin(0.5);
    const bossHpBg = this.add.rectangle(GW / 2, 46, GW - 40, 12, C.HP_BG).setOrigin(0.5);
    this._bossHpBar = this.add.rectangle(20, 46, GW - 40, 12, C.BOSS_HP_BAR).setOrigin(0, 0.5);
    this._bossHpContainer.add([bossLabel, bossHpBg, this._bossHpBar]);

    // ─ プレイヤーHP（プレイエリア下部）
    const hpY = PLAY_H - 18;
    this.add.text(10, hpY - 10, 'HP', {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#aaaaaa',
    }).setDepth(30);
    this._hpBarBg = this.add.rectangle(32, hpY, 110, 11, C.HP_BG).setOrigin(0, 0.5).setDepth(30);
    this._hpBar   = this.add.rectangle(32, hpY, 110, 11, C.HP_GREEN).setOrigin(0, 0.5).setDepth(31);

    // パワーレベル表示
    this._powerText = this.add.text(GW - 10, hpY, 'Lv.1', {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#ffcc00',
    }).setOrigin(1, 0.5).setDepth(30);

    // コンボ
    this._comboText = this.add.text(GW / 2, PLAY_H / 2, '', {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ffcc00',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(35).setAlpha(0);
    this._combo = 0;
    this._comboTimer = null;

    // ピックアップメッセージ
    this._pickupText = this.add.text(GW / 2, PLAY_H - 50, '', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#ffcc00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(36).setAlpha(0);
  }

  _setupTouch() {
    this._touch = { id: null, startX: 0, playerStartX: GW / 2 };
    this._cursors = this.input.keyboard.createCursorKeys();

    this.input.on('pointerdown', ptr => {
      if (this._touch.id === null && ptr.y >= PLAY_H) {
        this._touch.id = ptr.id;
        this._touch.startX = ptr.x;
        this._touch.playerStartX = this.player.x;
      }
    });
    this.input.on('pointermove', ptr => {
      if (ptr.id === this._touch.id && ptr.isDown) {
        const nx = this._touch.playerStartX + (ptr.x - this._touch.startX);
        this.player.x = Phaser.Math.Clamp(nx, 30, GW - 30);
      }
    });
    this.input.on('pointerup', ptr => {
      if (ptr.id === this._touch.id) this._touch.id = null;
    });
  }

  _setupColliders() {
    this.physics.add.overlap(this.playerBullets, this.enemies,
      this._onBulletHitEnemy, null, this);
    this.physics.add.overlap(this.playerBullets, this.bossGroup,
      this._onBulletHitBoss, null, this);
    this.physics.add.overlap(this.enemyBullets, this.player,
      this._onEnemyBulletHitPlayer, null, this);
    this.physics.add.overlap(this.enemies, this.player,
      this._onEnemyHitPlayer, null, this);
    this.physics.add.overlap(this.bossGroup, this.player,
      this._onEnemyHitPlayer, null, this);
    this.physics.add.overlap(this.player, this.items,
      this._onPlayerGetItem, null, this);
  }

  _setupTimers() {
    this.time.addEvent({
      delay: 1000, callback: this._onSecondTick, callbackScope: this, loop: true,
    });
    this.time.addEvent({
      delay: 110, callback: this._playerFire, callbackScope: this, loop: true,
    });
  }

  // ─── TIMERS & WAVES ────────────────────────────────────

  _onSecondTick() {
    if (this.gameEnded) return;
    this.stageTime++;

    if (!this.bossActive) {
      if (this.stageTime >= STAGE_DURATION) {
        this._startBoss();
        return;
      }
      WAVE_SCHEDULE.forEach(w => {
        const key = w.type + '_' + w.startTime;
        if (w.startTime === this.stageTime && !this.waveTimers[key]) {
          this._spawnEnemy(w.type);
          this.waveTimers[key] = this.time.addEvent({
            delay: w.interval,
            callback: () => this._spawnEnemy(w.type),
            loop: true,
          });
        }
      });
    }
  }

  // ─── ENEMY SPAWNING ────────────────────────────────────

  _spawnEnemy(type) {
    if (this.gameEnded || this.bossActive) return;
    const cfg = ENEMY_CFG[type];
    const x = Phaser.Math.Between(cfg.w / 2 + 10, GW - cfg.w / 2 - 10);
    const y = -cfg.h / 2 - 10;

    const e = this.enemies.create(x, y, 'enemy_' + type);
    e.setDepth(8);
    e.enemyType = type;
    e.hp = cfg.hp;
    e.score = cfg.score;
    e.elapsed = 0;
    e.lastShot = 0;
    e.baseX = x;
    e.body.setSize(cfg.w * 0.8, cfg.h * 0.8);

    switch (type) {
      case 'renkon':
        e.setVelocityY(cfg.speed);
        e.moveType = 'zigzag';
        break;
      case 'jintaiko':
        e.setVelocity(Phaser.Math.Between(-50, 50), cfg.speed);
        e.moveType = 'wiggle';
        break;
      case 'kingyo':
        e.setVelocityY(cfg.speed);
        e.moveType = 'sine';
        break;
      case 'chip':
        e.setVelocityY(cfg.speed);
        e.moveType = 'straight';
        break;
      case 'kyoryu':
        e.setVelocity(cfg.speed * (Math.random() > 0.5 ? 1 : -1), 55);
        e.moveType = 'bounce';
        break;
      case 'uma': {
        const dx = this.player.x - x;
        const len = Math.sqrt(dx * dx + cfg.speed * cfg.speed);
        e.setVelocity((dx / len) * cfg.speed * 0.25, cfg.speed);
        e.moveType = 'charge';
        break;
      }
    }
    return e;
  }

  // ─── BOSS ──────────────────────────────────────────────

  _startBoss() {
    this.bossActive = true;
    Object.values(this.waveTimers).forEach(t => t && t.remove());
    this.enemies.clear(true, true);

    const txt = this.add.text(GW / 2, PLAY_H / 2, '機械くまモン\n出現!!', {
      fontSize: '28px', fontFamily: 'sans-serif', color: '#ff4444',
      stroke: '#000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: txt, alpha: 0, delay: 2000, duration: 600,
      onComplete: () => txt.destroy() });

    this.boss = this.physics.add.sprite(GW / 2, -70, 'boss');
    this.boss.setDepth(9);
    this.boss.bossHP = BOSS_MAX_HP;
    this.boss.phase = 1;
    this.boss.elapsed = 0;
    this.boss.lastShot = 0;
    this.boss.lastCharge = 0;
    this.boss.setVelocityY(80);
    this.bossGroup.add(this.boss);
    this._bossHpContainer.setVisible(true);

    this.time.delayedCall(1800, () => {
      if (this.boss && this.boss.active) {
        this.boss.setVelocityY(0);
        this.boss.y = 100;
      }
    });
  }

  _updateBoss(time, delta) {
    if (!this.bossActive || !this.boss || !this.boss.active) return;
    const b = this.boss;
    b.elapsed += delta;

    const hpRatio = b.bossHP / BOSS_MAX_HP;
    if (hpRatio <= 0.5 && b.phase === 1) {
      b.phase = 2;
      this._bossPhaseBanner('フェーズ2');
    }
    if (hpRatio <= 0.25 && b.phase === 2) {
      b.phase = 3;
      this._bossPhaseBanner('フェーズ3（最終）');
    }

    const freq = b.phase === 1 ? 0.8 : b.phase === 2 ? 1.2 : 1.5;
    const amp  = b.phase === 3 ? 160 : 130;
    b.x = GW / 2 + Math.sin(b.elapsed / 1000 * freq) * amp;
    b.y = b.phase < 3 ? 100 : 90 + Math.sin(b.elapsed / 700) * 20;

    const shootInterval = b.phase === 1 ? 2200 : b.phase === 2 ? 1600 : 1100;
    if (time - b.lastShot > shootInterval) {
      b.lastShot = time;
      this._bossShoot(b.phase);
    }
    if (b.phase === 3 && time - b.lastCharge > 4000) {
      b.lastCharge = time;
      this._bossCharge();
    }
  }

  _bossShoot(phase) {
    if (!this.boss) return;
    const bx = this.boss.x, by = this.boss.y + 50;
    if (phase === 1) {
      for (let i = -2; i <= 2; i++) {
        const a = Math.PI / 2 + i * 0.18;
        this._spawnEnemyBullet(bx, by, Math.cos(a) * 220, Math.sin(a) * 220);
      }
    } else if (phase === 2) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this._spawnEnemyBullet(bx, by, Math.cos(a) * 180, Math.sin(a) * 180);
      }
      const pa = Phaser.Math.Angle.Between(bx, by, this.player.x, this.player.y);
      this._spawnEnemyBullet(bx, by, Math.cos(pa) * 260, Math.sin(pa) * 260);
    } else {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this._spawnEnemyBullet(bx, by, Math.cos(a) * 200, Math.sin(a) * 200);
      }
      for (let s = -1; s <= 1; s++) {
        const pa = Phaser.Math.Angle.Between(bx, by, this.player.x, this.player.y) + s * 0.15;
        this._spawnEnemyBullet(bx, by, Math.cos(pa) * 280, Math.sin(pa) * 280);
      }
    }
  }

  _bossCharge() {
    if (!this.boss) return;
    this.tweens.add({
      targets: this.boss, x: this.player.x, y: this.player.y - 80,
      duration: 400, ease: 'Power2',
      onComplete: () => { if (this.boss) this.cameras.main.shake(200, 0.01); },
    });
  }

  _bossPhaseBanner(msg) {
    const txt = this.add.text(GW / 2, PLAY_H / 2 - 40, msg, {
      fontSize: '22px', fontFamily: 'sans-serif', color: '#ff6600',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: txt, alpha: 0, delay: 1500, duration: 500,
      onComplete: () => txt.destroy() });
  }

  _spawnEnemyBullet(x, y, vx, vy) {
    const b = this.enemyBullets.create(x, y, 'e_bullet');
    b.setDepth(7);
    b.setVelocity(vx, vy);
    b.body.setSize(6, 6);
  }

  // ─── ITEMS ─────────────────────────────────────────────

  _tryDropItem(x, y) {
    const r = Math.random();
    if (r < 0.10) {
      this._spawnItem('item_heal', x, y);
    } else if (r < 0.18) {
      this._spawnItem('item_power', x, y);
    }
  }

  _spawnItem(key, x, y) {
    const item = this.items.create(x, y, key);
    item.itemType = key;
    item.setDepth(7);
    item.setVelocityY(70);
    item.body.setSize(20, 24);
    // 光るアニメ
    this.tweens.add({
      targets: item, scaleX: 1.15, scaleY: 1.15,
      duration: 400, yoyo: true, repeat: -1,
    });
  }

  // ─── UPDATE HELPERS ────────────────────────────────────

  _movePlayer(delta) {
    const step = 320 * (Math.min(delta, 34) / 1000);
    if (this._cursors.left.isDown) {
      this.player.x = Math.max(30, this.player.x - step);
    } else if (this._cursors.right.isDown) {
      this.player.x = Math.min(GW - 30, this.player.x + step);
    }
    this.player.x = Phaser.Math.Clamp(this.player.x, 30, GW - 30);
  }

  _playerFire() {
    if (this.gameEnded) return;
    const cx = this.player.x;
    const cy = this.player.y - 30;

    if (this.powerLevel === 1) {
      this._spawnBullet(cx, cy, 0);
    } else if (this.powerLevel === 2) {
      this._spawnBullet(cx - 11, cy, -25);
      this._spawnBullet(cx + 11, cy,  25);
    } else {
      this._spawnBullet(cx - 18, cy, -40);
      this._spawnBullet(cx,      cy,   0);
      this._spawnBullet(cx + 18, cy,  40);
    }
  }

  _spawnBullet(x, y, vx) {
    const b = this.playerBullets.create(x, y, 'bullet');
    b.setDepth(6);
    b.setVelocity(vx, -620);
    b.body.setSize(4, 14);
  }

  _updateEnemies(time, delta) {
    const dt = delta / 1000;
    this.enemies.getChildren().forEach(e => {
      e.elapsed += dt;
      switch (e.moveType) {
        case 'zigzag':
          e.x = e.baseX + Math.sin(e.elapsed * 2.8) * 75;
          break;
        case 'sine':
          e.x = e.baseX + Math.sin(e.elapsed * 2.2) * 55;
          break;
        case 'bounce':
          if (e.x < 20)       { e.setVelocityX( Math.abs(e.body.velocity.x)); }
          else if (e.x > GW - 20) { e.setVelocityX(-Math.abs(e.body.velocity.x)); }
          if (time - e.lastShot > ENEMY_CFG.kyoryu.shootInterval) {
            e.lastShot = time;
            const a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
            this._spawnEnemyBullet(e.x, e.y + 16, Math.cos(a) * 200, Math.sin(a) * 200);
          }
          break;
        case 'wiggle':
          if (time - e.lastShot > ENEMY_CFG.jintaiko.shootInterval) {
            e.lastShot = time;
            const a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
            this._spawnEnemyBullet(e.x, e.y + 14, Math.cos(a) * 190, Math.sin(a) * 190);
          }
          break;
      }
    });
  }

  _updateUI() {
    this._scoreText.setText('SCORE: ' + this.score.toLocaleString());

    const remain = Math.max(0, STAGE_DURATION - this.stageTime);
    this._timerText.setText(this.bossActive ? 'BOSS!' : String(remain));
    if (remain <= 10 && !this.bossActive) this._timerText.setColor('#ff4444');

    const hpRatio = this.playerHP / PLAYER_MAX_HP;
    this._hpBar.width = 110 * hpRatio;
    this._hpBar.setFillStyle(
      hpRatio > 0.5 ? C.HP_GREEN : hpRatio > 0.25 ? C.HP_YELLOW : C.HP_RED
    );

    this._powerText.setText('Lv.' + this.powerLevel);
    const pvColors = ['#aaaaaa', '#ffcc00', '#ff6600'];
    this._powerText.setColor(pvColors[this.powerLevel - 1]);

    if (this.bossActive && this.boss && this.boss.active) {
      const bRatio = this.boss.bossHP / BOSS_MAX_HP;
      this._bossHpBar.width = (GW - 40) * bRatio;
    }
  }

  _cleanupOffscreen() {
    const margin = 80;
    [this.playerBullets, this.enemies, this.enemyBullets, this.items].forEach(group => {
      group.getChildren().forEach(obj => {
        if (obj.y < -margin || obj.y > GH + margin ||
            obj.x < -margin || obj.x > GW + margin) {
          obj.destroy();
        }
      });
    });
  }

  // ─── COLLISION HANDLERS ────────────────────────────────

  _onBulletHitEnemy(bullet, enemy) {
    bullet.destroy();
    enemy.hp--;
    this._flashWhite(enemy);
    if (enemy.hp <= 0) {
      this._addScore(enemy.score);
      this._explode(enemy.x, enemy.y);
      this._tryDropItem(enemy.x, enemy.y);
      enemy.destroy();
    }
  }

  _onBulletHitBoss(bullet, boss) {
    bullet.destroy();
    boss.bossHP--;
    this._flashWhite(boss);
    if (boss.bossHP <= 0) this._bossDefeated();
  }

  _onEnemyBulletHitPlayer(bullet, player) {
    if (this.invincible) return;
    bullet.destroy();
    this._damagePlayer(10);
  }

  _onEnemyHitPlayer(enemy, player) {
    if (this.invincible) return;
    this._explode(enemy.x, enemy.y);
    if (enemy !== this.boss) enemy.destroy();
    this._damagePlayer(20);
  }

  _onPlayerGetItem(player, item) {
    if (item.itemType === 'item_power') {
      this.powerLevel = Math.min(3, this.powerLevel + 1);
      this._showPickupMsg('パワーアップ！ Lv.' + this.powerLevel, '#ffcc00');
    } else if (item.itemType === 'item_heal') {
      const healed = Math.min(30, PLAYER_MAX_HP - this.playerHP);
      this.playerHP = Math.min(PLAYER_MAX_HP, this.playerHP + 30);
      this._showPickupMsg('+' + healed + ' HP 回復！', '#66ff66');
    }
    item.destroy();
  }

  // ─── DAMAGE / SCORE / EFFECTS ──────────────────────────

  _damagePlayer(amount) {
    if (this.invincible || this.gameEnded) return;
    this.invincible = true;

    this.playerHP = Math.max(0, this.playerHP - amount);

    // ダメージ表現は画面側のみで行い、自機スプライトには一切触れない。
    // （visible/alpha/tint を触ると端末GPUによっては自機が消えて戻らないため）
    this.cameras.main.shake(180, 0.009);
    this.cameras.main.flash(160, 150, 0, 0); // 画面を一瞬赤く

    // 無敵時間（1.2秒）。終了処理はフラグを戻すだけ。
    if (this._invTimer) this._invTimer.remove();
    this._invTimer = this.time.delayedCall(1200, () => { this.invincible = false; });

    if (this.playerHP <= 0) {
      this.time.delayedCall(500, () => { if (!this.gameEnded) this._gameOver(false); });
    }
  }

  _addScore(amount) {
    this._combo++;
    const multiplier = Math.min(this._combo, 8);
    this.score += amount * multiplier;

    if (this._combo >= 3) {
      this._comboText.setText(`${this._combo} COMBO! x${multiplier}`);
      this.tweens.add({ targets: this._comboText, alpha: 1, duration: 80 });
      if (this._comboTimer) this._comboTimer.remove();
      this._comboTimer = this.time.delayedCall(1200, () => {
        this.tweens.add({ targets: this._comboText, alpha: 0, duration: 300 });
        this._combo = 0;
      });
    }
  }

  _showPickupMsg(msg, color) {
    this._pickupText.setText(msg).setColor(color).setAlpha(1);
    this.tweens.add({ targets: this._pickupText, alpha: 0, delay: 1000, duration: 500 });
  }

  _flashWhite(sprite) {
    this.tweens.add({
      targets: sprite, alpha: 0.4, duration: 50, yoyo: true, repeat: 1,
      onComplete: () => sprite && sprite.active && sprite.setAlpha(1),
    });
  }

  _explode(x, y) {
    const exp = this.add.sprite(x, y, 'explosion').setDepth(15);
    this.tweens.add({
      targets: exp, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 350,
      onComplete: () => exp.destroy(),
    });
  }

  // ─── GAME END ──────────────────────────────────────────

  _bossDefeated() {
    if (this.bossDefeated) return;
    this.bossDefeated = true;
    this.cameras.main.shake(400, 0.02);

    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 120, () => {
        if (this.boss) {
          this._explode(
            this.boss.x + Phaser.Math.Between(-40, 40),
            this.boss.y + Phaser.Math.Between(-30, 30)
          );
        }
      });
    }
    this.time.delayedCall(1200, () => {
      if (this.boss) { this.boss.destroy(); this.boss = null; }
      this._gameOver(true);
    });
  }

  _gameOver(cleared) {
    if (this.gameEnded) return;
    this.gameEnded = true;
    Object.values(this.waveTimers).forEach(t => t && t.remove());

    const finalScore = this.score + (cleared ? 10000 : 0);
    if (cleared) this.score = finalScore;
    this._saveScore(finalScore);

    this.time.delayedCall(cleared ? 1600 : 800, () => {
      this.scene.start('GameOverScene', { score: finalScore, cleared });
    });
  }

  _saveScore(score) {
    const scores = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    scores.push({ score, version: VERSION, date: new Date().toISOString() });
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('kyushu_scores', JSON.stringify(scores.slice(0, 100)));
  }
}
