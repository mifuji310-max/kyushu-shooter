class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─── LIFECYCLE ─────────────────────────────────────────

  init(data) {
    const key = (data && data.difficulty) || this.registry.get('difficulty') || 'NORMAL';
    this.diffKey = DIFFICULTY[key] ? key : 'NORMAL';
    this.diff = DIFFICULTY[this.diffKey];
    this.registry.set('difficulty', this.diffKey); // リトライ時に引き継ぐ
  }

  preload() {
    // 読み込み済みならスキップされる
    const load = (k, f) => { if (!this.textures.exists(k)) this.load.image(k, f); };
    load('bg_kumamoto3', 'img/kumamoto_background3.png');
    load('player_img', 'img/player.png');
    load('enemy_renkon_img', 'img/enemy_renkon.png');
    load('enemy_chip_img', 'img/enemy_IC.png');
    load('enemy_jintaiko_img', 'img/enemy_jintaiko.png');
    load('enemy_kingyo_img', 'img/enemy_kingyo.png');
    load('enemy_kyoryu_img', 'img/enemy_kyoryu.png');
    load('enemy_uma_img', 'img/enemy_uma.png');
    load('boss1', 'img/boss_fase1.png');
    load('boss2', 'img/boss_fase2.png');
    load('boss3', 'img/boss_fase3.png');
    load('item_power', 'img/item_power.png');
    load('item_heal', 'img/item_heal.png');
    load('item_spread', 'img/item_spread.png');
    load('item_big', 'img/item_big.png');
    load('item_barrier', 'img/item_barrier.png');
  }

  create() {
    this.cameras.main.setZoom(DPR).centerOn(GW / 2, GH / 2); // 高解像度化（座標系は不変）

    this.score      = 0;
    this.stageTime  = 0;
    this.bossActive = false;
    this.bossDefeated = false;
    this.playerMaxHP = this.diff.playerHP;
    this.bossMaxHP   = this.diff.bossHP;
    this.playerHP   = this.playerMaxHP;
    this.invincible = false;
    this.gameEnded  = false;
    this.weapon     = 'normal';
    this.powerLevel = 1;   // 1〜3
    this.shieldHits = 0;
    this._nextFireAt = 0;
    this.waveTimers = {};

    this._makeTextures();
    this._makeBackground();
    this._makePlayer();
    this._makeGroups();
    this._makeUI();
    this._setupTouch();
    this._setupColliders();
    this._setupTimers();

    // 難易度バナー
    const dt = TXT(this, GW / 2, PLAY_H / 2 - 40, this.diff.label, {
      fontSize: '32px', fontFamily: 'sans-serif',
      color: this.diff.color, stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: dt, alpha: 0, delay: 900, duration: 500,
      onComplete: () => dt.destroy() });
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

    // バリアを自機に追従させる
    if (this._shieldSprite && this._shieldSprite.visible) {
      this._shieldSprite.x = this.player.x;
      this._shieldSprite.y = this.player.y;
    }
  }

  // ─── TEXTURE GENERATION ────────────────────────────────

  _makeTextures() {
    this._texPlayer();
    this._texBullet();
    this._texEnemyBullet();
    this._texJintaiko();
    this._texKingyo();
    this._texKyoryu();
    this._texUma();
    this._texExplosion();
    this._texBigBullet();
    this._texShield();
    // 蓮根/半導体/ボス/アイテムは画像を使用（生成不要）
  }

  _texBigBullet() {
    // プラズマ大玉
    this._gTex('bullet_big', 24, 28, g => {
      g.fillStyle(0xff2d6f, 0.28).fillCircle(12, 14, 12);
      g.fillStyle(0xff4081, 0.85).fillCircle(12, 14, 8.5);
      g.fillStyle(0xffd54f, 0.95).fillCircle(12, 14, 4.5);
      g.fillStyle(0xffffff, 1).fillCircle(10, 12, 2.2);
    });
  }

  _texShield() {
    this._gTex('shield', 84, 84, g => {
      g.lineStyle(4, 0x33e0ff, 0.85).strokeCircle(42, 42, 36);
      g.lineStyle(2, 0xffffff, 0.55).strokeCircle(42, 42, 31);
      g.lineStyle(2, 0x33e0ff, 0.4).strokeCircle(42, 42, 40);
    });
  }

  // 拡散ショット
  _texSpreadItem() {
    this._gTex('item_spread', 28, 28, g => {
      g.fillStyle(0xe65100).fillCircle(14, 14, 12);
      g.lineStyle(2, 0xfff3e0).strokeCircle(14, 14, 12);
      g.lineStyle(2, 0xffffff);
      g.lineBetween(14, 19, 8, 8);
      g.lineBetween(14, 19, 14, 6);
      g.lineBetween(14, 19, 20, 8);
    });
  }

  // 大玉ショット
  _texBigItem() {
    this._gTex('item_big', 28, 28, g => {
      g.fillStyle(0xad1457).fillCircle(14, 14, 12);
      g.lineStyle(2, 0xfce4ec).strokeCircle(14, 14, 12);
      g.fillStyle(0xff80ab).fillCircle(14, 14, 6.5);
      g.fillStyle(0xffffff, 0.85).fillCircle(11.5, 11.5, 2.2);
    });
  }

  // バリア
  _texBarrierItem() {
    this._gTex('item_barrier', 28, 28, g => {
      g.fillStyle(0x006064).fillCircle(14, 14, 12);
      g.lineStyle(2, 0xb2ebf2).strokeCircle(14, 14, 12);
      g.fillStyle(0x33e0ff);
      g.fillRoundedRect(9, 7, 10, 9, 2);
      g.fillTriangle(9, 15, 19, 15, 14, 22);
      g.fillStyle(0xffffff, 0.7).fillRect(13, 9, 2, 9);
    });
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
    // 青白いエネルギー弾（グロー＋白コア）
    this._gTex('bullet', 10, 24, g => {
      g.fillStyle(0x00e5ff, 0.30).fillRoundedRect(1, 1, 8, 22, 4); // 外グロー
      g.fillStyle(0x4df3ff, 0.9).fillRoundedRect(3, 2, 4, 20, 2);  // 本体
      g.fillStyle(0xffffff, 1).fillRoundedRect(4, 3, 2, 14, 1);    // 白い芯
    });
  }

  _texEnemyBullet() {
    // 禍々しい赤オーブ（グロー付き）
    this._gTex('e_bullet', 14, 14, g => {
      g.fillStyle(0xff1744, 0.28).fillCircle(7, 7, 7);   // 外グロー
      g.fillStyle(0xff3060, 0.95).fillCircle(7, 7, 4.5); // 本体
      g.fillStyle(0xffd9d9, 0.95).fillCircle(5.6, 5.6, 1.8); // ハイライト
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
    // 熊本の空撮写真を縦スクロール（TileSpriteでシームレスにループ）
    this._bg = this.add.tileSprite(GW / 2, PLAY_H / 2, GW, PLAY_H, 'bg_kumamoto3').setDepth(0);
    const s = GW / 724; // 画像幅(724px)をゲーム幅に合わせる
    this._bg.tileScaleX = s;
    this._bg.tileScaleY = s;

    // 自機・敵・弾の視認性確保のため暗めオーバーレイ
    this.add.rectangle(GW / 2, PLAY_H / 2, GW, PLAY_H, 0x000814, 0.34).setDepth(1);

    // 操作エリア背景
    this.add.rectangle(GW / 2, GH - CONTROL_H / 2, GW, CONTROL_H, C.CTRL_BG, 0.95).setDepth(20);
    TXT(this, GW / 2, GH - CONTROL_H + 14, '◀  ここでタッチ操作  ▶', {
      fontSize: '13px', fontFamily: 'sans-serif', color: '#5577aa',
    }).setOrigin(0.5).setDepth(21);

    const div = this.add.graphics().setDepth(22);
    div.lineStyle(1, 0x334488, 0.8).lineBetween(0, PLAY_H, GW, PLAY_H);
  }

  _scrollBackground(delta) {
    // FPSに依存しないよう時間ベースで進める。capを26ms(≒1.5フレーム)に絞り、
    // 指を離した瞬間のカクつきによる速度スパイクを抑える。
    const f = Math.min(delta, 26) / 16.667;
    // 前進感を出すため背景を下方向へ流す（tilePositionはテクスチャ座標なのでtileScaleで割る）
    this._bg.tilePositionY -= (2.0 * f) / this._bg.tileScaleY;
  }

  // ─── SETUP ─────────────────────────────────────────────

  _makePlayer() {
    this.player = this.physics.add.sprite(GW / 2, PLAY_H - 60, 'player_img');
    this.player.setCollideWorldBounds(false);
    this.player.setDepth(10);
    this.player.setScale(0.0586); // 1024px → 約60px表示
    // 当たり判定は車体に合わせ控えめに（テクスチャ座標で指定）
    this.player.body.setSize(560, 760);
    this.player.body.setOffset(232, 132);
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
    this._scoreText = TXT(this, 10, 10, 'SCORE: 0', {
      fontSize: '16px', fontFamily: 'sans-serif', color: '#ffffff',
    }).setDepth(30);

    this._timerText = TXT(this, GW - 10, 10, String(STAGE_DURATION), {
      fontSize: '24px', fontFamily: 'sans-serif', color: '#ffffff',
    }).setOrigin(1, 0).setDepth(30);

    // ─ ボスHPバー（上部・非表示待機）
    this._bossHpContainer = this.add.container(0, 0).setDepth(30).setVisible(false);
    const bossLabel = TXT(this, GW / 2, 32, 'B O S S', {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#ff6666', fontStyle: 'bold',
    }).setOrigin(0.5);
    const bossHpBg = this.add.rectangle(GW / 2, 46, GW - 40, 12, C.HP_BG).setOrigin(0.5);
    this._bossHpBar = this.add.rectangle(20, 46, GW - 40, 12, C.BOSS_HP_BAR).setOrigin(0, 0.5);
    this._bossHpContainer.add([bossLabel, bossHpBg, this._bossHpBar]);

    // ─ プレイヤーHP（プレイエリア下部）
    const hpY = PLAY_H - 18;
    TXT(this, 10, hpY - 10, 'HP', {
      fontSize: '12px', fontFamily: 'sans-serif', color: '#aaaaaa',
    }).setDepth(30);
    this._hpBarBg = this.add.rectangle(32, hpY, 110, 11, C.HP_BG).setOrigin(0, 0.5).setDepth(30);
    this._hpBar   = this.add.rectangle(32, hpY, 110, 11, C.HP_GREEN).setOrigin(0, 0.5).setDepth(31);

    // パワーレベル表示
    this._powerText = TXT(this, GW - 10, hpY, 'Lv.1', {
      fontSize: '14px', fontFamily: 'sans-serif', color: '#ffcc00',
    }).setOrigin(1, 0.5).setDepth(30);

    // コンボ（画面中央だと邪魔なので上部に小さく）
    this._comboText = TXT(this, GW / 2, 100, '', {
      fontSize: '19px', fontFamily: 'sans-serif', color: '#ffcc00',
      stroke: '#000000', strokeThickness: 4, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(35).setAlpha(0);
    this._combo = 0;
    this._comboTimer = null;

    // ピックアップメッセージ
    this._pickupText = TXT(this, GW / 2, PLAY_H - 50, '', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#ffcc00',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(36).setAlpha(0);
  }

  _setupTouch() {
    this._touch = { id: null, startX: 0, playerStartX: GW / 2 };
    this._cursors = this.input.keyboard.createCursorKeys();

    // カメラズーム下では ptr.x/y はバッファ座標になるため worldX/worldY を使う
    this.input.on('pointerdown', ptr => {
      if (this._touch.id === null && ptr.worldY >= PLAY_H) {
        this._touch.id = ptr.id;
        this._touch.startX = ptr.worldX;
        this._touch.playerStartX = this.player.x;
      }
    });
    this.input.on('pointermove', ptr => {
      if (ptr.id === this._touch.id && ptr.isDown) {
        const nx = this._touch.playerStartX + (ptr.worldX - this._touch.startX);
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
      delay: 30, callback: this._playerFire, callbackScope: this, loop: true,
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

    const imgInfo = ENEMY_IMG[type];
    const isImg = !!imgInfo;
    const e = this.enemies.create(x, y, isImg ? imgInfo.key : 'enemy_' + type);
    e.setDepth(8);
    e.enemyType = type;
    e.hp = Math.max(1, Math.round(cfg.hp * this.diff.enemyHpMul));
    e.score = cfg.score;
    e.elapsed = 0;
    e.lastShot = 0;
    e.baseX = x;

    if (isImg) {
      // 表示サイズを cfg に合わせ、当たり判定は画像内の中身(cw/ch)に合わせて中央配置
      e.setDisplaySize(cfg.w, cfg.h);
      const k = 0.82;
      const fw = e.width, fh = e.height;
      e.body.setSize(fw * imgInfo.cw * k, fh * imgInfo.ch * k);
      e.body.setOffset(fw * (1 - imgInfo.cw * k) / 2, fh * (1 - imgInfo.ch * k) / 2);
    } else {
      e.body.setSize(cfg.w * 0.8, cfg.h * 0.8);
    }

    const sp = cfg.speed * this.diff.enemySpeedMul; // 難易度で速度補正

    switch (type) {
      case 'renkon':
        e.setVelocityY(sp);
        e.moveType = 'zigzag';
        break;
      case 'jintaiko':
        e.setVelocity(Phaser.Math.Between(-50, 50), sp);
        e.moveType = 'wiggle';
        break;
      case 'kingyo':
        e.setVelocityY(sp);
        e.moveType = 'sine';
        break;
      case 'chip':
        e.setVelocityY(sp);
        e.moveType = 'straight';
        break;
      case 'kyoryu':
        e.setVelocity(sp * (Math.random() > 0.5 ? 1 : -1), 55);
        e.moveType = 'bounce';
        break;
      case 'uma': {
        const dx = this.player.x - x;
        const len = Math.sqrt(dx * dx + sp * sp);
        e.setVelocity((dx / len) * sp * 0.25, sp);
        e.moveType = 'charge';
        break;
      }
    }
    return e;
  }

  // ─── BOSS ──────────────────────────────────────────────

  _startBoss() {
    this.bossActive = true;
    this._bossY = 158; // HPゲージに被らない待機位置（やや上）
    Object.values(this.waveTimers).forEach(t => t && t.remove());
    this.enemies.clear(true, true);

    // 荘厳な暗転（画面全体の振動はしない）
    const veil = this.add.rectangle(GW / 2, PLAY_H / 2, GW, PLAY_H, 0x000000, 0).setDepth(38);
    this.tweens.add({ targets: veil, alpha: 0.5, duration: 800, yoyo: true, hold: 1400,
      onComplete: () => veil.destroy() });

    // 警告演出
    const warn = TXT(this, GW / 2, PLAY_H / 2 - 34, '⚠ W A R N I N G ⚠', {
      fontSize: '24px', color: '#ff3355', stroke: '#000', strokeThickness: 5, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    const nm = TXT(this, GW / 2, PLAY_H / 2 + 6, 'B O S S', {
      fontSize: '34px', color: '#ffffff', stroke: '#aa0000', strokeThickness: 5, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: [warn, nm], alpha: 1, duration: 450, yoyo: true, hold: 1700, delay: 250,
      onComplete: () => { warn.destroy(); nm.destroy(); } });

    this.boss = this.physics.add.sprite(GW / 2, -120, 'boss1');
    this.boss.setDepth(9);
    this.boss.setDisplaySize(172, 172);
    this.boss.body.setSize(this.boss.width * 0.62, this.boss.height * 0.56);
    this.boss.body.setOffset(this.boss.width * 0.19, this.boss.height * 0.22);
    this.boss.bossHP = this.bossMaxHP;
    this.boss.phase = 1;
    this.boss.elapsed = 0;
    this.boss.lastShot = 0;
    this.boss.lastCharge = 0;
    this.boss.entering = true; // 降臨中は_updateBossで動かさない
    this.bossGroup.add(this.boss);
    this._bossHpContainer.setVisible(true);

    // ジワーッと降臨（ゆっくりイージング・画面振動なし）
    this.tweens.add({
      targets: this.boss, y: this._bossY, duration: 2800, ease: 'Sine.easeInOut', delay: 500,
      onComplete: () => { if (this.boss) this.boss.entering = false; },
    });
  }

  _updateBoss(time, delta) {
    if (!this.bossActive || !this.boss || !this.boss.active) return;
    const b = this.boss;
    if (b.entering) return; // 降臨演出中は制御しない
    b.elapsed += delta;

    const hpRatio = b.bossHP / this.bossMaxHP;
    if (hpRatio <= 0.5 && b.phase === 1) this._bossPhaseChange(b, 2, 'boss2', 'PHASE 2', time);
    if (hpRatio <= 0.25 && b.phase === 2) this._bossPhaseChange(b, 3, 'boss3', 'FINAL PHASE', time);

    // フェーズ移行のクッション中は攻撃せず、ゆっくり中央へ戻す（無敵）
    if (b.transitionUntil && time < b.transitionUntil) {
      b.x += (GW / 2 - b.x) * 0.05;
      b.y += (this._bossY - b.y) * 0.05;
      return;
    }

    const freq = b.phase === 1 ? 0.8 : b.phase === 2 ? 1.2 : 1.5;
    const amp  = b.phase === 3 ? 150 : 120;
    b.x = GW / 2 + Math.sin(b.elapsed / 1000 * freq) * amp;
    b.y = b.phase < 3 ? this._bossY : (this._bossY - 8) + Math.sin(b.elapsed / 700) * 18;

    const shootInterval = (b.phase === 1 ? 2200 : b.phase === 2 ? 1600 : 1100) * this.diff.shootIntervalMul;
    if (time - b.lastShot > shootInterval) {
      b.lastShot = time;
      this._bossShoot(b.phase);
    }
    if (b.phase === 3 && time - b.lastCharge > 4000) {
      b.lastCharge = time;
      this._bossCharge();
    }
  }

  // フェーズ移行に1クッション（無敵・光る・拡大脈動・バナー）
  _bossPhaseChange(b, phase, tex, label, time) {
    b.phase = phase;
    b.transitionUntil = time + 1500;
    this.cameras.main.flash(220, 255, 230, 190);
    this._explode(b.x, b.y);
    b.setTexture(tex);
    b.setTintFill(0xffffff); // 白く光って「変身」
    const base = b.scaleX;
    this.tweens.add({ targets: b, scaleX: base * 1.12, scaleY: base * 1.12,
      duration: 220, yoyo: true, repeat: 2 });
    this.time.delayedCall(900, () => { if (b && b.active) b.clearTint(); });
    this._bossPhaseBanner(label);
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
    const txt = TXT(this, GW / 2, PLAY_H / 2 - 40, msg, {
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
    const d = this.diff;
    if (r < d.healDrop) {
      this._spawnItem('item_heal', x, y);
    } else if (r < d.healDrop + d.powerDrop) {
      // 強化系をランダム抽選（団子=強化を出やすめに）
      const pool = ['item_power', 'item_power', 'item_spread', 'item_big', 'item_barrier'];
      this._spawnItem(Phaser.Utils.Array.GetRandom(pool), x, y);
    }
  }

  _spawnItem(key, x, y) {
    const item = this.items.create(x, y, key);
    item.itemType = key;
    item.setDepth(7);
    item.setDisplaySize(32, 32); // 画像アイコン
    item.setVelocityY(70);
    item.body.setSize(item.width * 0.72, item.height * 0.72);
    item.body.setOffset(item.width * 0.14, item.height * 0.14);
    // 光るアニメ（表示スケール基準で脈動）
    const base = item.scaleX;
    this.tweens.add({
      targets: item, scaleX: base * 1.14, scaleY: base * 1.14,
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
    const now = this.time.now;
    if (now < this._nextFireAt) return;
    this._nextFireAt = now + WEAPON[this.weapon].fire;

    const cx = this.player.x;
    const cy = this.player.y - 30;
    const lv = this.powerLevel;

    if (this.weapon === 'normal') {
      if (lv === 1) {
        this._spawnBullet(cx, cy, 0);
      } else if (lv === 2) {
        this._spawnBullet(cx - 11, cy, -25);
        this._spawnBullet(cx + 11, cy,  25);
      } else {
        this._spawnBullet(cx - 18, cy, -40);
        this._spawnBullet(cx,      cy,   0);
        this._spawnBullet(cx + 18, cy,  40);
      }
    } else if (this.weapon === 'spread') {
      const ways = lv + 2;               // 3 / 4 / 5 way
      const span = 0.5;                  // 片側の最大角(rad)
      for (let i = 0; i < ways; i++) {
        const t = ways === 1 ? 0 : (i / (ways - 1) - 0.5) * 2; // -1〜1
        const ang = -Math.PI / 2 + t * span;
        this._spawnBullet(cx, cy, Math.cos(ang) * 560, Math.sin(ang) * 560);
      }
    } else { // big（貫通大玉）
      if (lv === 1) {
        this._spawnBigBullet(cx, cy, 0);
      } else if (lv === 2) {
        this._spawnBigBullet(cx - 14, cy, 0);
        this._spawnBigBullet(cx + 14, cy, 0);
      } else {
        this._spawnBigBullet(cx - 20, cy, 0);
        this._spawnBigBullet(cx,      cy, 0);
        this._spawnBigBullet(cx + 20, cy, 0);
      }
    }
  }

  _spawnBullet(x, y, vx, vy) {
    const b = this.playerBullets.create(x, y, 'bullet');
    b.setDepth(6);
    b.setVelocity(vx, vy === undefined ? -620 : vy);
    b.body.setSize(4, 14);
    b.damage = 1;
    b.pierceLeft = 0;
  }

  _spawnBigBullet(x, y, vx) {
    const b = this.playerBullets.create(x, y, 'bullet_big');
    b.setDepth(6);
    b.setVelocity(vx, -520);
    b.body.setSize(14, 18);
    b.damage = 2;
    b.pierceLeft = 2;   // 2体まで貫通
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
          if (time - e.lastShot > ENEMY_CFG.kyoryu.shootInterval * this.diff.shootIntervalMul) {
            e.lastShot = time;
            this._enemyAimedShot(e, 16, 200);
          }
          break;
        case 'wiggle':
          if (time - e.lastShot > ENEMY_CFG.jintaiko.shootInterval * this.diff.shootIntervalMul) {
            e.lastShot = time;
            this._enemyAimedShot(e, 14, 190);
          }
          break;
      }
    });
  }

  // 自機に狙いを付けた敵弾。ただし自機より上にいる時だけ、かつ下向きコーンに限定
  // （横・後方からの避けられない弾を撃たせない）
  _enemyAimedShot(e, offY, speed) {
    if (e.y > this.player.y - 30) return;
    let a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
    a = Phaser.Math.Clamp(a, Math.PI * 0.28, Math.PI * 0.72); // 下向き±約40°に制限
    this._spawnEnemyBullet(e.x, e.y + offY, Math.cos(a) * speed, Math.sin(a) * speed);
  }

  _updateUI() {
    this._scoreText.setText('SCORE: ' + this.score.toLocaleString());

    const remain = Math.max(0, STAGE_DURATION - this.stageTime);
    this._timerText.setText(this.bossActive ? 'BOSS!' : String(remain));
    if (remain <= 10 && !this.bossActive) this._timerText.setColor('#ff4444');

    const hpRatio = Phaser.Math.Clamp(this.playerHP / this.playerMaxHP, 0, 1);
    this._hpBar.width = 110 * hpRatio;
    this._hpBar.setFillStyle(
      hpRatio > 0.5 ? C.HP_GREEN : hpRatio > 0.25 ? C.HP_YELLOW : C.HP_RED
    );

    const w = WEAPON[this.weapon];
    let pt = w.label + ' Lv.' + this.powerLevel;
    if (this.shieldHits > 0) pt += '  🛡' + this.shieldHits;
    this._powerText.setText(pt).setColor(w.color);

    if (this.bossActive && this.boss && this.boss.active) {
      const bRatio = Phaser.Math.Clamp(this.boss.bossHP / this.bossMaxHP, 0, 1);
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
    // 貫通弾が同じ敵を毎フレーム多重ヒットしないようガード
    if (bullet._hit && bullet._hit.has(enemy)) return;
    enemy.hp -= (bullet.damage || 1);
    this._flashWhite(enemy);

    if (bullet.pierceLeft && bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      (bullet._hit || (bullet._hit = new Set())).add(enemy);
    } else {
      bullet.destroy();
    }

    if (enemy.hp <= 0) {
      this._addScore(enemy.score);
      this._explode(enemy.x, enemy.y);
      this._tryDropItem(enemy.x, enemy.y);
      enemy.destroy();
    }
  }

  _onBulletHitBoss(bullet, boss) {
    bullet.destroy(); // 単体ボスでは貫通させず必ず消す（多重ヒット防止）
    // フェーズ移行のクッション中や降臨中は無敵
    if (boss.entering || (boss.transitionUntil && this.time.now < boss.transitionUntil)) return;
    boss.bossHP -= (bullet.damage || 1);
    this._flashWhite(boss);
    if (boss.bossHP <= 0) this._bossDefeated();
  }

  // 注意: Phaserは overlap(グループ, スプライト) のとき callback(スプライト, 要素)
  // と引数を入れ替えて渡す。引数名に頼ると自機を destroy してしまうため、
  // 必ず「this.player でない方」を相手として判定する。
  _onEnemyBulletHitPlayer(a, b) {
    if (this.invincible || this.gameEnded) return;
    const bullet = (a === this.player) ? b : a;
    bullet.destroy();
    this._damagePlayer(Math.round(10 * this.diff.dmgMul));
  }

  _onEnemyHitPlayer(a, b) {
    if (this.invincible || this.gameEnded) return;
    const enemy = (a === this.player) ? b : a;
    this._explode(enemy.x, enemy.y);
    if (enemy !== this.boss) enemy.destroy();
    this._damagePlayer(Math.round(20 * this.diff.dmgMul));
  }

  _onPlayerGetItem(a, b) {
    const item = (a === this.player) ? b : a;
    switch (item.itemType) {
      case 'item_power':
        this.powerLevel = Math.min(3, this.powerLevel + 1);
        this._showPickupMsg('パワーアップ Lv.' + this.powerLevel, '#ffcc00');
        break;
      case 'item_spread':
        this.weapon = 'spread';
        this._showPickupMsg('拡散ショット！', '#ff9800');
        break;
      case 'item_big':
        this.weapon = 'big';
        this._showPickupMsg('大玉ショット！', '#ff80ab');
        break;
      case 'item_barrier':
        this.shieldHits = 3;
        this._setShield(true);
        this._showPickupMsg('バリア展開！', '#33e0ff');
        break;
      case 'item_heal': {
        const amt = this.diff.healAmount;
        const healed = Math.min(amt, this.playerMaxHP - this.playerHP);
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + amt);
        this._showPickupMsg('+' + healed + ' HP', '#66ff66');
        break;
      }
    }
    item.destroy();
  }

  _setShield(on) {
    if (!this._shieldSprite) {
      this._shieldSprite = this.add.sprite(this.player.x, this.player.y, 'shield')
        .setDepth(11).setVisible(false);
    }
    this._shieldSprite.setVisible(on);
  }

  // ─── DAMAGE / SCORE / EFFECTS ──────────────────────────

  _damagePlayer(amount) {
    if (this.invincible || this.gameEnded) return;

    // バリアがあれば1ヒット肩代わり（HPは減らない）
    if (this.shieldHits > 0) {
      this.shieldHits--;
      this.cameras.main.flash(90, 0, 150, 255); // 青フラッシュ
      this.invincible = true;
      if (this.shieldHits <= 0) this._setShield(false);
      this.time.delayedCall(500, () => { this.invincible = false; });
      return;
    }

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

  // 被弾フラッシュ: alphaを使わずtintで一瞬白く。連続被弾でも半透明のまま固まらない。
  _flashWhite(sprite) {
    if (!sprite || !sprite.active) return;
    if (sprite._flashUntil && this.time.now < sprite._flashUntil) return; // 過剰点滅を抑制
    sprite._flashUntil = this.time.now + 110;
    sprite.setTintFill(0xffffff);
    this.time.delayedCall(45, () => { if (sprite && sprite.active) sprite.clearTint(); });
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
    const scoreId = this._saveScore(finalScore);

    this.time.delayedCall(cleared ? 1600 : 800, () => {
      this.scene.start('GameOverScene', { score: finalScore, cleared, scoreId });
    });
  }

  _saveScore(score) {
    // 一意IDを付けて1件だけ保存。名前は後でGameOverSceneがこのIDで上書きする
    // （以前は無名で保存→別途追加していたため重複していた）
    const id = Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const scores = JSON.parse(localStorage.getItem('kyushu_scores') || '[]');
    scores.push({ id, score, name: '', version: VERSION, difficulty: this.diffKey, date: new Date().toISOString() });
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('kyushu_scores', JSON.stringify(scores.slice(0, 100)));
    return id;
  }
}
