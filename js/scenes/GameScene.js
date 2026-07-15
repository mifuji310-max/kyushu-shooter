class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  // ─── LIFECYCLE ─────────────────────────────────────────

  init(data) {
    const key = (data && data.difficulty) || this.registry.get('difficulty') || 'NORMAL';
    this.diffKey = DIFFICULTY[key] ? key : 'NORMAL';
    this.diff = DIFFICULTY[this.diffKey];
    this.registry.set('difficulty', this.diffKey); // リトライ時に引き継ぐ
    // ステージ（将来の九州各県拡張はSTAGESに足すだけ）
    this.stage = STAGES[(data && data.stageIndex) || this.registry.get('stageIndex') || 0] || STAGES[0];
  }

  preload() {
    // 読み込み済みならスキップされる。画像URLにも?v=を付け、更新時にブラウザの
    // 画像キャッシュ(JSと違いキャッシュバスターが無かった)で古い絵が出続けるのを防ぐ
    const load = (k, f) => { if (!this.textures.exists(k)) this.load.image(k, f + '?v=' + VERSION); };
    load(this.stage.bgKey, this.stage.bgFile);
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
    load('boss4', 'img/boss_fase4.png');
    // アイテムアイコンはAI画像ではなくベクター描画（_makeTextures内）。32px表示でも常にクッキリで、
    // 生成ガチャの当たり外れが無い。
  }

  create() {
    this.cameras.main.setZoom(DPR).centerOn(GW / 2, GH / 2); // 高解像度化（座標系は不変）

    SFX.init(); SFX.resume();

    this.score      = 0;
    this.mode       = 'intro';  // intro → wave → boss → ...
    this.waveIndex  = 0;        // 0,1,2（各ウェーブ後にボス①②③）
    this._waveSpawnsLeft = 0;
    this.bossActive = false;
    this.playerMaxHP = this.diff.playerHP;
    this.bossMaxHP   = this.diff.bossHP;
    this.playerHP   = this.playerMaxHP;
    this.invincible = false;
    this.gameEnded  = false;
    this.powerLevel = 1;   // 団子: 本数
    this.spreadLv   = 0;   // 拡散: 扇の広がり/本数
    this.bigLv      = 0;   // 大玉: サイズ/威力/貫通
    this.heartLv    = 0;   // ほっぺ: 命中時にハートが破裂して拡散ダメージ
    this.shieldHits = 0;
    this.beamCharges = 0;  // レアアイテム: ビーム砲の残り回数
    this._beamUntil  = 0;  // ビーム発射中の終了時刻
    this._beam       = null; // 波動砲スプライト（再スタート時に破棄済み参照を残さない）
    this._nextFireAt = 0;
    this.waveTimers = {};
    this._killsSinceDrop = 0;    // 天井システム: ドロップ無し撃破数
    this._segmentDamaged = false; // 現在のウェーブ/ボス戦で被弾したか（ノーダメボーナス用）

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

    // 難易度バナーのあと最初のウェーブ開始
    this.time.delayedCall(1200, () => this._startWave(0));
  }

  update(time, delta) {
    if (this.gameEnded) return;
    this._scrollBackground(delta);
    this._movePlayer(delta);
    this._updateEnemies(time, delta);
    this._updateBoss(time, delta);
    this._checkWaveClear();
    this._updateMagnetAndGraze(delta);
    this._updateBeam(time);
    this._updateDepthScale();
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
    this._texFireball();
    this._texBeamColumn();
    this._texHeart();
    this._texScoreStar();
    this._texJintaiko();
    this._texKingyo();
    this._texKyoryu();
    this._texUma();
    this._texExplosion();
    this._texBigBullet();
    this._texShield();
    this._texItemIcons();
    // 蓮根/半導体/ボスは画像を使用（生成不要）
  }

  // 正多角形/星形の頂点座標を生成（アイテムアイコンの盾・星に使用）
  _polyPoints(cx, cy, r, sides, rotate) {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const a = rotate + (i / sides) * Math.PI * 2;
      pts.push(new Phaser.Geom.Point(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return pts;
  }

  // アイテムアイコン群をベクター描画（AI画像ではなくコードで直接描くため、
  // 32px表示でも常にクッキリ・当たり外れが無い）
  _texItemIcons() {
    const outline = (g, w) => g.lineStyle(w, 0x000000, 1);

    // いきなり団子: 紫の芋の皮＋白い餅、黄色い星バッジ
    this._gTex('item_power', 32, 32, g => {
      outline(g, 3).fillStyle(0x7b3fa0).fillRoundedRect(5, 4, 22, 24, 10).strokeRoundedRect(5, 4, 22, 24, 10);
      outline(g, 2.5).fillStyle(0xfff3d6).fillRoundedRect(8, 15, 16, 12, 6).strokeRoundedRect(8, 15, 16, 12, 6);
      outline(g, 1.5).fillStyle(0xffd400).fillCircle(24, 8, 5).strokeCircle(24, 8, 5);
    });

    // 天然水: 水色のしずく＋白い十字
    this._gTex('item_heal', 32, 32, g => {
      outline(g, 3);
      g.fillStyle(0x29b6f6);
      g.beginPath();
      g.moveTo(16, 3);
      g.lineTo(26, 18);
      g.arc(16, 18, 10, 0, Math.PI, false);
      g.lineTo(16, 3);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.fillStyle(0xffffff).fillRoundedRect(13, 13, 6, 16, 2);
      g.fillStyle(0xffffff).fillRoundedRect(7, 19, 18, 6, 2);
    });

    // 拡散ショット: オレンジの扇形3枚
    this._gTex('item_spread', 32, 32, g => {
      const cx = 16, cy = 29;
      [[-0.9, -0.35], [-0.2, 0.2], [0.5, 1.1]].forEach(([a0, a1]) => {
        const base = -Math.PI / 2;
        const p1 = { x: cx + Math.cos(base + a0) * 24, y: cy + Math.sin(base + a0) * 24 };
        const p2 = { x: cx + Math.cos(base + a1) * 24, y: cy + Math.sin(base + a1) * 24 };
        outline(g, 2.5).fillStyle(0xff9800)
          .fillTriangle(cx, cy, p1.x, p1.y, p2.x, p2.y)
          .strokeTriangle(cx, cy, p1.x, p1.y, p2.x, p2.y);
      });
      g.fillStyle(0xffd54f).fillCircle(cx, cy, 4);
    });

    // 大玉ショット: ピンクの同心円
    this._gTex('item_big', 32, 32, g => {
      outline(g, 3).fillStyle(0xffb3cf).fillCircle(16, 16, 13).strokeCircle(16, 16, 13);
      outline(g, 2).fillStyle(0xff4d94).fillCircle(16, 16, 7).strokeCircle(16, 16, 7);
      g.fillStyle(0xffffff).fillCircle(13, 13, 2);
    });

    // バリア: 水色の六角形の盾＋白い星
    this._gTex('item_barrier', 32, 32, g => {
      const hex = this._polyPoints(16, 16, 13, 6, -Math.PI / 2);
      outline(g, 3).fillStyle(0x26c6da).fillPoints(hex, true).strokePoints(hex, true);
      const star = this._polyPoints(16, 16, 6, 5, -Math.PI / 2);
      g.fillStyle(0xffffff).fillPoints(star, true);
    });

    // ビーム砲(超レア): 水色〜白の縦ビーム＋周囲にキラキラ
    this._gTex('item_beam', 32, 32, g => {
      outline(g, 2.5).fillStyle(0x00e5ff).fillRoundedRect(11, 3, 10, 26, 4).strokeRoundedRect(11, 3, 10, 26, 4);
      g.fillStyle(0xffffff).fillRoundedRect(14, 3, 4, 26, 2);
      // キラキラ（星バッジ）
      const s1 = this._polyPoints(6, 8, 3.2, 4, 0);
      const s2 = this._polyPoints(26, 22, 3.2, 4, 0);
      g.fillStyle(0xffe066).fillPoints(s1, true).fillPoints(s2, true);
    });

    // くまモンのほっぺ: 赤い丸＋白ハート（取るとハート弾＝命中時破裂）
    this._gTex('item_cheek', 32, 32, g => {
      outline(g, 3).fillStyle(0xe53946).fillCircle(16, 16, 13).strokeCircle(16, 16, 13);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(12.5, 13.5, 3.4);
      g.fillCircle(19.5, 13.5, 3.4);
      g.fillTriangle(9.3, 15.4, 22.7, 15.4, 16, 23.5);
    });
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
    if (this.textures.exists(key)) return; // リトライ時の再生成・警告を防止
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

  // レアアイテム「ビーム砲」= 波動砲。極太の縦レーザー1本（持続ビーム）
  _texBeamColumn() {
    const w = BALANCE.beamWidth, h = PLAY_H;
    this._gTex('beam_column', w, h, g => {
      g.fillStyle(0x00e5ff, 0.22).fillRect(0, 0, w, h);                 // 外グロー
      g.fillStyle(0x4df3ff, 0.55).fillRect(w * 0.16, 0, w * 0.68, h);   // 中間
      g.fillStyle(0xbff6ff, 0.9).fillRect(w * 0.34, 0, w * 0.32, h);    // 明るい層
      g.fillStyle(0xffffff, 1).fillRect(w * 0.44, 0, w * 0.12, h);      // 白い芯
    });
  }

  // ハート弾（ほっぺ効果）と破裂の破片
  _texHeart() {
    // ハート型: 2つの円 + 下向き三角
    this._gTex('bullet_heart', 16, 16, g => {
      g.fillStyle(0xff6b9d, 1);
      g.fillCircle(5.5, 5.5, 4);
      g.fillCircle(10.5, 5.5, 4);
      g.fillTriangle(1.6, 7.5, 14.4, 7.5, 8, 15);
      g.fillStyle(0xffd0e0, 1).fillCircle(5, 4.5, 1.6); // ハイライト
    });
    this._gTex('heart_frag', 8, 8, g => {
      g.fillStyle(0xff8fb3, 0.5).fillCircle(4, 4, 4);
      g.fillStyle(0xff6b9d, 1).fillCircle(4, 4, 2.5);
    });
  }

  // クリア時に敵弾が変化する得点の★
  _texScoreStar() {
    this._gTex('score_star', 14, 14, g => {
      const pts = this._polyPoints(7, 7, 6.4, 5, -Math.PI / 2);
      g.fillStyle(0xffe066, 1).fillPoints(pts, true);
      g.fillStyle(0xfff8cc, 1).fillCircle(7, 7, 2);
    });
  }

  // ボスの火の玉（大きくゆっくり飛ぶ・見た目で分かりやすく危険な弾）
  _texFireball() {
    this._gTex('boss_fireball', 32, 32, g => {
      g.fillStyle(0xff6d00, 0.25).fillCircle(16, 16, 16); // 外グロー
      g.fillStyle(0xff3d00, 0.9).fillCircle(16, 16, 11);  // 本体
      g.fillStyle(0xffca28, 0.95).fillCircle(16, 16, 6);  // 内側
      g.fillStyle(0xfff3c4, 1).fillCircle(13, 13, 2.4);   // ハイライト
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
    this._bg = this.add.tileSprite(GW / 2, PLAY_H / 2, GW, PLAY_H, this.stage.bgKey).setDepth(0);
    // 画像の実幅からタイル倍率を算出（画像を差し替えても自動追従）
    const srcW = this.textures.get(this.stage.bgKey).getSourceImage().width || 853;
    const s = GW / srcW;
    this._bg.tileScaleX = s;
    this._bg.tileScaleY = s;

    // 自機・敵・弾の視認性確保のため暗めオーバーレイ
    this.add.rectangle(GW / 2, PLAY_H / 2, GW, PLAY_H, 0x000814, 0.34).setDepth(1);

    // ─ 擬似3D演出 ─
    // 雲レイヤー: 地面より速く流して高度差の視差を出す（敵や自機の上を薄く流れる）
    this._makeCloudTexture();
    this._clouds = this.add.tileSprite(GW / 2, PLAY_H / 2, GW, PLAY_H, 'clouds_tex')
      .setDepth(14).setAlpha(BALANCE.cloudAlpha);

    // 上部の霞: 遠くが白くかすむ。敵が霞の中から現れて遠近感が出る
    if (!this.textures.exists('haze_tex')) {
      const hz = this.textures.createCanvas('haze_tex', 8, BALANCE.hazeHeight);
      const hctx = hz.context;
      const grd = hctx.createLinearGradient(0, 0, 0, BALANCE.hazeHeight);
      grd.addColorStop(0, 'rgba(207,228,255,0.36)');
      grd.addColorStop(1, 'rgba(207,228,255,0)');
      hctx.fillStyle = grd;
      hctx.fillRect(0, 0, 8, BALANCE.hazeHeight);
      hz.refresh();
    }
    this.add.image(GW / 2, 0, 'haze_tex').setOrigin(0.5, 0)
      .setDisplaySize(GW, BALANCE.hazeHeight).setDepth(15);

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
    // 雲は地面より速く流す＝カメラに近い層に見える（視差による擬似3D）
    this._clouds.tilePositionY -= BALANCE.cloudSpeed * f;
  }

  // 雲テクスチャ（放射グラデーションの白い塊を散らしたタイル）
  _makeCloudTexture() {
    if (this.textures.exists('clouds_tex')) return;
    const size = 256;
    const tex = this.textures.createCanvas('clouds_tex', size, size);
    const ctx = tex.context;
    // 固定配置（乱数だと毎回ムラが変わるため）。まばらに5つ、視界を邪魔しない濃さで
    const blobs = [
      [40, 30, 46], [190, 70, 58], [90, 140, 40], [230, 190, 50], [20, 220, 44],
    ];
    for (const [x, y, r] of blobs) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    tex.refresh();
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

    this._timerText = TXT(this, GW - 10, 10, 'WAVE 1/4', {
      fontSize: '18px', fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold',
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

    // ビーム砲(波動砲)の発動UI。メインの発動は「操作エリアの2連タップ」。
    // このボタンは残チャージ表示＆タップでも撃てる補助（プレイ画面右下）。
    const bx = GW - 42, by = PLAY_H - 96;
    this._beamBtn = this.add.container(bx, by).setDepth(37).setVisible(false);
    const bbBg = this.add.circle(0, 0, 30, 0x00394d, 0.85).setStrokeStyle(3, 0x66eaff);
    const bbTxt = TXT(this, 0, -4, '★', { fontSize: '24px', color: '#66eaff' }).setOrigin(0.5);
    const bbCnt = TXT(this, 0, 16, '', { fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const bbHint = TXT(this, 0, 40, '2回タップ', { fontSize: '11px', color: '#9fe8ff' }).setOrigin(0.5);
    this._beamBtn.add([bbBg, bbTxt, bbCnt, bbHint]);
    this._beamBtnCnt = bbCnt;
    bbBg.setInteractive({ useHandCursor: true });
    bbBg.on('pointerdown', () => this._tryStartBeam());
    this.tweens.add({ targets: this._beamBtn, scaleX: 1.1, scaleY: 1.1,
      duration: 500, yoyo: true, repeat: -1 });
  }

  _setupTouch() {
    this._touch = { id: null, startX: 0, playerStartX: GW / 2 };
    this._tap = { downAt: 0, downX: 0, downY: 0, lastTapAt: -1e6 }; // 2連タップ検出用（初期は十分過去）
    this._cursors = this.input.keyboard.createCursorKeys();
    this._fireKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // カメラズーム下では ptr.x/y はバッファ座標になるため worldX/worldY を使う
    this.input.on('pointerdown', ptr => {
      SFX.resume(); // 自動再生制限の解除
      this._tap.downAt = this.time.now;
      this._tap.downX = ptr.worldX;
      this._tap.downY = ptr.worldY;
      if (this._touch.id === null && ptr.worldY >= PLAY_H) {
        this._touch.id = ptr.id;
        this._touch.startX = ptr.worldX;
        this._touch.playerStartX = this.player.x;
      }
    });
    // ビーム(波動砲)は「操作エリアの2連タップ」で発動（PCはBキー）。以前はタップのたびに
    // 発動して移動の指置き直しでチャージを浪費していたため、素早い2連タップに限定。
    this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B)
      .on('down', () => this._tryStartBeam());
    this.input.on('pointermove', ptr => {
      if (ptr.id === this._touch.id && ptr.isDown) {
        const nx = this._touch.playerStartX + (ptr.worldX - this._touch.startX);
        this.player.x = Phaser.Math.Clamp(nx, 30, GW - 30);
      }
    });
    this.input.on('pointerup', ptr => {
      if (ptr.id === this._touch.id) this._touch.id = null;
      // タップ判定: 短時間・ほぼ動かさずに離した＝タップ。2連なら波動砲。
      const now = this.time.now;
      const dur = now - this._tap.downAt;
      const moved = Math.abs(ptr.worldX - this._tap.downX) + Math.abs(ptr.worldY - this._tap.downY);
      const inControl = this._tap.downY >= PLAY_H;
      if (inControl && dur < 220 && moved < 26) {
        if (now - this._tap.lastTapAt < BALANCE.beamDoubleTapMs) {
          this._tryStartBeam();
          this._tap.lastTapAt = 0;
        } else {
          this._tap.lastTapAt = now;
        }
      }
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
      delay: 30, callback: this._playerFire, callbackScope: this, loop: true,
    });
  }

  // ─── WAVES（4ラウンド構成の状態機械）────────────────────

  _startWave(index) {
    if (this.gameEnded) return;
    this.mode = 'wave';
    this.waveIndex = index;
    this._waveSpawnsLeft = 0;
    this.waveTimers = {};
    this._segmentDamaged = false; // ノーダメボーナスの区間開始
    this._carrierPending = true;  // このウェーブ最初の敵を「運び屋」にする（確定ドロップ）

    this._banner('WAVE ' + (index + 1), '#66ddff');

    this.stage.waves[index].forEach((grp, gi) => {
      this._waveSpawnsLeft += grp.count;
      const begin = () => {
        if (this.gameEnded || this.mode !== 'wave') return;
        this.waveTimers['w' + index + '_' + gi] = this.time.addEvent({
          delay: grp.interval, repeat: grp.count - 1,
          callback: () => { this._spawnEnemy(grp.type); this._waveSpawnsLeft--; },
        });
      };
      if (grp.startAt) this.time.delayedCall(grp.startAt, begin);
      else begin();
    });
  }

  // ウェーブの敵を出し切って画面から居なくなったらボス登場
  _checkWaveClear() {
    if (this.mode !== 'wave') return;
    if (this._waveSpawnsLeft > 0) return;
    if (this.enemies.countActive(true) > 0) return;
    this.mode = 'boss-incoming';
    this._cancelEnemyBullets();   // 残った敵弾を★に変換（危険→報酬）
    this._awardNoDamageBonus();
    this.time.delayedCall(700, () => this._startBoss(this.waveIndex + 1));
  }

  // 画面上の敵弾をすべて★に変えて自機へ吸い込み、1個ごとに加点する演出
  _cancelEnemyBullets() {
    const bullets = this.enemyBullets.getChildren().slice();
    if (bullets.length) SFX.powerup();
    bullets.forEach((b, i) => {
      const star = this.add.image(b.x, b.y, 'score_star').setDepth(20);
      b.destroy();
      this.tweens.add({
        targets: star, x: this.player.x, y: this.player.y,
        duration: 320 + i * 12, ease: 'Cubic.easeIn',
        onComplete: () => {
          star.destroy();
          this.score += this._gain(BALANCE.bulletCancelScore);
        },
      });
    });
  }

  _awardNoDamageBonus() {
    if (this._segmentDamaged) return;
    const pts = this._gain(BALANCE.noDamageBonus);
    this.score += pts;
    // 撃破ボーナスの表示と重ならないよう少し遅らせて出す
    this.time.delayedCall(1300, () => {
      if (!this.gameEnded) this._showPickupMsg('ノーダメージ +' + pts.toLocaleString(), '#aaffee');
    });
  }

  // 難易度倍率を適用したスコアを返す（全ボーナス共通）
  _gain(points) {
    return Math.round(points * this.diff.scoreMul);
  }

  // アイテム自動吸引＋敵弾グレイズ（かすり）判定
  _updateMagnetAndGraze(delta) {
    const px = this.player.x, py = this.player.y;

    // マグネット: 近くのアイテムが自機に吸い寄せられる（取り逃しストレスの解消）
    this.items.getChildren().forEach(it => {
      const d = Phaser.Math.Distance.Between(it.x, it.y, px, py);
      if (d < BALANCE.magnetRadius && d > 1) {
        const a = Phaser.Math.Angle.Between(it.x, it.y, px, py);
        it.setVelocity(Math.cos(a) * BALANCE.magnetSpeed, Math.sin(a) * BALANCE.magnetSpeed);
      }
    });

    // グレイズ: 敵弾スレスレをかわすと加点（1弾につき1回）。攻めた回避が報われる
    if (!this.invincible && !this.gameEnded) {
      this.enemyBullets.getChildren().forEach(eb => {
        if (eb._grazed) return;
        const d = Phaser.Math.Distance.Between(eb.x, eb.y, px, py);
        const radius = BALANCE.grazeRadius + (eb.isFireball ? 12 : 0);
        if (d < radius) {
          eb._grazed = true;
          this.score += this._gain(BALANCE.grazeScore);
          // 小さな金色スパークで「かすった」ことを伝える
          const sp = this.add.circle(eb.x, eb.y, 5, 0xffe066, 0.9).setDepth(21);
          this.tweens.add({ targets: sp, scale: 2.2, alpha: 0, duration: 220,
            onComplete: () => sp.destroy() });
        }
      });
    }
  }

  _banner(text, color) {
    const t = TXT(this, GW / 2, PLAY_H / 2 - 70, text, {
      fontSize: '30px', color: color || '#ffffff', stroke: '#000', strokeThickness: 5, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(41).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 900,
      onComplete: () => t.destroy() });
  }

  // ─── ENEMY SPAWNING ────────────────────────────────────

  _spawnEnemy(type) {
    if (this.gameEnded || this.mode !== 'wave') return;
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

    // 運び屋: 各ウェーブ最初の1体は金色に光り、倒すと必ず強化をドロップする。
    // 「序盤にアイテムを引けるかが完全な運」だった問題のスタートライン揃え。
    if (this._carrierPending) {
      this._carrierPending = false;
      e.isCarrier = true;
      e.setTint(0xffd54f);
      e.score = Math.round(e.score * 1.5);
    }

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

  _startBoss(phaseNum) {
    this.bossActive = true;
    this.mode = 'boss';
    this._bossY = 158; // HPゲージに被らない待機位置（やや上）
    Object.values(this.waveTimers).forEach(t => t && t.remove());
    this.enemies.clear(true, true);

    SFX.bossWarn();
    const isFinal = phaseNum >= 4;

    // フェーズ4は一度画面を完全暗転してから登場（荘厳）。①②③は暗転（半分）。
    const veil = this.add.rectangle(GW / 2, PLAY_H / 2, GW, PLAY_H, 0x000000, 0).setDepth(38);
    this.tweens.add({
      targets: veil, alpha: isFinal ? 1 : 0.5,
      duration: isFinal ? 700 : 800, yoyo: true, hold: isFinal ? 1600 : 1400,
      onComplete: () => veil.destroy(),
    });

    // 警告演出
    const warn = TXT(this, GW / 2, PLAY_H / 2 - 34, '⚠ W A R N I N G ⚠', {
      fontSize: '24px', color: '#ff3355', stroke: '#000', strokeThickness: 5, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    const nm = TXT(this, GW / 2, PLAY_H / 2 + 6, isFinal ? 'FINAL BOSS' : 'B O S S ' + phaseNum, {
      fontSize: '32px', color: '#ffffff', stroke: '#aa0000', strokeThickness: 5, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: [warn, nm], alpha: 1, duration: 450, yoyo: true, hold: 1700, delay: 250,
      onComplete: () => { warn.destroy(); nm.destroy(); } });

    this.boss = this.physics.add.sprite(GW / 2, -120, 'boss' + phaseNum);
    this.boss.setDepth(9);
    this.boss.setDisplaySize(172, 172);
    this.boss.body.setSize(this.boss.width * 0.62, this.boss.height * 0.56);
    this.boss.body.setOffset(this.boss.width * 0.19, this.boss.height * 0.22);
    this.boss.bossHP = Math.round(this.bossMaxHP * this.stage.bossHpFactors[phaseNum - 1]);
    this.boss.bossMaxHP = this.boss.bossHP; // このボスの最大HP（バー用）
    this.boss.phase = phaseNum;
    this.boss.elapsed = 0;
    this.boss.entering = true; // 降臨中は_updateBossで動かさない
    this.bossGroup.add(this.boss);
    this._bossHpContainer.setVisible(true);
    this._segmentDamaged = false; // ボス戦のノーダメ判定区間を開始

    // ジワーッと降臨（ゆっくりイージング・画面振動なし）。最終形態は暗転の頂点から現れる
    this.tweens.add({
      targets: this.boss, y: this._bossY, duration: 2800, ease: 'Sine.easeInOut',
      delay: isFinal ? 900 : 500,
      onComplete: () => {
        if (!this.boss) return;
        this.boss.entering = false;
        // 攻撃タイマーは降臨完了時刻から起算（登場直後の即撃ちを防ぐ）
        const now = this.time.now;
        this.boss.lastShot = now;
        this.boss.lastFireball = now;
        this.boss.lastCharge = now;
        this._bossStartAt = now; // 速攻ボーナス計測開始
      },
    });
  }

  _updateBoss(time, delta) {
    if (!this.bossActive || !this.boss || !this.boss.active) return;
    const b = this.boss;
    if (b.entering) return; // 降臨演出中は制御しない

    // 突進中はトゥイーンに任せる（正弦運動で上書きしない）。
    // elapsedもここで止めることで、突進から戻った瞬間に正弦運動が
    // 同じ時刻・同じ座標から連続的に再開できる（止めないと時間だけ進んで位置が飛ぶ）。
    if (b.charging) return;
    b.elapsed += delta;

    const freq = b.phase === 1 ? 0.8 : b.phase === 2 ? 1.1 : b.phase === 3 ? 1.4 : 1.7;
    const amp  = b.phase >= 3 ? 150 : 120;
    b.x = GW / 2 + Math.sin(b.elapsed / 1000 * freq) * amp;
    b.y = b.phase < 3 ? this._bossY : (this._bossY - 8) + Math.sin(b.elapsed / 700) * 18;

    const shootInterval = (b.phase === 1 ? 2200 : b.phase === 2 ? 1700 : b.phase === 3 ? 1300 : 1000) * this.diff.shootIntervalMul;
    if (time - b.lastShot > shootInterval) {
      b.lastShot = time;
      this._bossShoot(b.phase);
    }
    // 火の玉: 大きくゆっくり・自機狙い。②以降で登場し、④が最も頻繁
    if (b.phase >= 2 && time - b.lastFireball > (2600 - b.phase * 300)) {
      b.lastFireball = time;
      this._bossFireball();
    }
    if (b.phase >= 3 && time - b.lastCharge > BALANCE.bossChargeInterval) {
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

  // 大きくゆっくり飛ぶ自機狙いの火の玉。速度は遅めで見切れるが、被弾すると痛い
  _bossFireball() {
    const b = this.boss;
    if (!b) return;
    const bx = b.x, by = b.y + 50;
    const a = Phaser.Math.Angle.Between(bx, by, this.player.x, this.player.y);
    const speed = BALANCE.fireballSpeed;
    const fb = this.enemyBullets.create(bx, by, 'boss_fireball');
    fb.setDepth(7);
    fb.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    fb.body.setSize(fb.width * 0.55, fb.height * 0.55);
    fb.body.setOffset(fb.width * 0.225, fb.height * 0.225); // 見た目の中心に判定を合わせる
    fb.isFireball = true; // 通常弾より高威力
  }

  _bossCharge() {
    const b = this.boss;
    if (!b) return;
    // 突進中は_updateBossの正弦運動に上書きされないようフラグで制御し、
    // プレイヤーへ寄って戻る。elapsedは突進中止めているため、yoyoで戻る座標と
    // 正弦運動の計算結果が一致し、戻った後も連続的に動き出せる（位置飛び防止）。
    b.charging = true;
    const tx = Phaser.Math.Clamp(this.player.x, 60, GW - 60);
    this.tweens.add({
      targets: b, x: tx, y: this.player.y - 90,
      duration: 500, ease: 'Sine.easeInOut', yoyo: true, hold: 120,
      onComplete: () => { if (b && b.active) b.charging = false; },
    });
  }

  _spawnEnemyBullet(x, y, vx, vy) {
    const b = this.enemyBullets.create(x, y, 'e_bullet');
    b.setDepth(7);
    b.setVelocity(vx, vy);
    b.body.setSize(6, 6);
    b.body.setOffset((b.width - 6) / 2, (b.height - 6) / 2); // 見た目の中心に判定を合わせる
  }

  // ─── ITEMS ─────────────────────────────────────────────

  _tryDropItem(x, y) {
    // レアなビーム砲は難易度に関係ない超低確率の独立抽選（他のドロップと競合しない）
    if (Math.random() < BALANCE.beamDropRate) {
      this._spawnItem('item_beam', x, y);
      this._killsSinceDrop = 0;
      return;
    }
    const d = this.diff;
    // 天井システム: 一定数倒してドロップ無しなら次は確定（引きの波を平滑化）
    const pityHit = this._killsSinceDrop >= BALANCE.pityKills;
    const r = Math.random();
    const pool = ['item_power', 'item_power', 'item_spread', 'item_big', 'item_barrier', 'item_cheek'];
    if (!pityHit && r < d.healDrop) {
      this._spawnItem('item_heal', x, y);
      this._killsSinceDrop = 0;
    } else if (pityHit || r < d.healDrop + d.powerDrop) {
      this._spawnItem(Phaser.Utils.Array.GetRandom(pool), x, y);
      this._killsSinceDrop = 0;
    } else {
      this._killsSinceDrop++;
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

  // 拡散(spreadLv)・大玉(bigLv)・パワー(powerLevel)を合成して発射。
  // 取れば取るほど本数・威力・貫通が増え、拡散×大玉のかけ合わせも効く。
  // タップ中（操作エリアに触れている）またはスペース押下中のみ発射
  _isFiring() {
    return this._touch.id !== null || (this._fireKey && this._fireKey.isDown);
  }

  // レアアイテム「ビーム砲」= 波動砲を発射開始（ボタン/Bキー/2連タップで呼ばれる）
  _tryStartBeam() {
    if (this.gameEnded || this.beamCharges <= 0 || this.time.now < this._beamUntil) return;
    this.beamCharges--;
    this._beamUntil = this.time.now + BALANCE.beamDuration;
    SFX.barrier();
    this.cameras.main.shake(180, 0.006);
    // 極太レーザーを1本生成。自機の前方へまっすぐ伸び、持続中は追従する。
    if (!this._beam) {
      this._beam = this.add.image(this.player.x, this.player.y, 'beam_column')
        .setOrigin(0.5, 1).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    }
    this._beam.setVisible(true).setAlpha(1);
  }

  // 波動砲の持続処理: 自機に追従し、レーザーの縦帯に重なる敵/ボスへ連続ダメージ
  _updateBeam(time) {
    if (!this._beam) return;
    const active = time < this._beamUntil && !this.gameEnded;
    if (!active) {
      if (this._beam.visible) this._beam.setVisible(false);
      return;
    }
    const bx = this.player.x, topY = this.player.y - 30;
    this._beam.x = bx;
    this._beam.y = topY;
    this._beam.setAlpha(0.85 + Math.sin(time / 40) * 0.15); // 明滅で威圧感
    const half = BALANCE.beamWidth * 0.5;

    const hit = (target, hp) => {
      if (Math.abs(target.x - bx) > half + (target.displayWidth || 20) * 0.35) return;
      if (target.y > topY) return; // 自機より前方のみ
      if (!target._beamNext || time >= target._beamNext) {
        target._beamNext = time + BALANCE.beamTickMs;
        this._flashWhite(target);
        return true;
      }
      return false;
    };

    this.enemies.getChildren().forEach(e => {
      if (hit(e)) {
        e.hp -= BALANCE.beamTickDmg;
        if (e.hp <= 0) {
          this._addScore(e.score);
          this._explode(e.x, e.y);
          if (!e.isCarrier) this._tryDropItem(e.x, e.y);
          this.tweens.killTweensOf(e);
          e.destroy();
        }
      }
    });
    if (this.bossActive && this.boss && this.boss.active && !this.boss.entering && !this.boss.defeated) {
      if (hit(this.boss)) {
        this.boss.bossHP -= BALANCE.beamTickDmg;
        this.score += this._gain(BALANCE.beamTickDmg * BALANCE.bossDmgScore);
        if (this.boss.bossHP <= 0) this._bossEncounterDefeated();
      }
    }
  }

  _playerFire() {
    if (this.gameEnded) return;
    const now = this.time.now;
    if (now < this._nextFireAt) return;

    // 波動砲の発射中は通常弾を止める（レーザーが主役）
    if (now < this._beamUntil) return;

    if (!this._isFiring()) return;

    this._nextFireAt = now + (110 + this.bigLv * 45); // 大玉ほど連射は遅い
    SFX.shoot();

    const cx = this.player.x;
    const cy = this.player.y - 30;
    // 本数 = 1 + 拡散Lv + (パワーLv-1)。最大9way。
    const ways = Math.min(9, 1 + this.spreadLv + Math.max(0, this.powerLevel - 1));

    if (this.spreadLv > 0) {
      // 扇状に広げる（大玉なら大玉が扇状に飛ぶ＝かけ合わせ）
      const half = Math.min(1.0, 0.14 * (ways - 1));
      const spd = 580;
      for (let i = 0; i < ways; i++) {
        const t = ways === 1 ? 0 : (i / (ways - 1) - 0.5) * 2; // -1〜1
        const ang = -Math.PI / 2 + t * half;
        this._fireBullet(cx, cy, Math.cos(ang) * spd, Math.sin(ang) * spd);
      }
    } else {
      // 拡散無し: ほぼ平行に本数を増やす
      for (let i = 0; i < ways; i++) {
        const t = ways === 1 ? 0 : (i / (ways - 1) - 0.5) * 2; // -1〜1
        this._fireBullet(cx + t * 16, cy, t * 18, -620);
      }
    }
  }

  // 1発生成。大玉Lvでサイズ・威力・貫通が上がる。ほっぺLvがあれば命中時に破裂。
  _fireBullet(x, y, vx, vy) {
    const lv = this.bigLv;
    let b;
    if (lv > 0) {
      b = this.playerBullets.create(x, y, 'bullet_big');
      b.setDepth(6).setVelocity(vx, vy);
      b.setScale(0.7 + lv * 0.22);
      b.body.setSize(b.width * 0.62, b.height * 0.62);
      b.body.setOffset(b.width * 0.19, b.height * 0.19); // 見た目の中心に判定を合わせる
      b.damage = 1 + lv;      // 2 / 3 / 4
      b.pierceLeft = lv;      // 1 / 2 / 3 体貫通
    } else {
      // ほっぺLvがあれば弾の見た目もハートに
      b = this.playerBullets.create(x, y, this.heartLv > 0 ? 'bullet_heart' : 'bullet');
      b.setDepth(6).setVelocity(vx, vy);
      b.body.setSize(b.width * 0.5, b.height * 0.8);
      b.body.setOffset(b.width * 0.25, b.height * 0.1); // 見た目の中心に判定を合わせる
      b.damage = 1;
      b.pierceLeft = 0;
    }
    if (this.heartLv > 0) b.heartBurst = this.heartLv; // 命中時に破裂して拡散
  }

  // 擬似3D: 画面上(遠く)ほど小さく描画する。Arcade物理のボディはスプライトの
  // スケールに自動追従するため、見た目と当たり判定は常に一致する（公平性を維持）。
  // 基準スケールは初回に遅延キャプチャ（setDisplaySize/setScale後の値を基準にする）。
  // アイテムは脈動tweenとスケールを取り合うため対象外。ボスは迫力優先で対象外。
  _updateDepthScale() {
    const min = BALANCE.depth3dMinScale;
    const apply = obj => {
      if (!obj.active) return;
      if (obj._bsx === undefined) { obj._bsx = obj.scaleX; obj._bsy = obj.scaleY; }
      const t = Phaser.Math.Clamp(obj.y / PLAY_H, 0, 1);
      const k = min + (1 - min) * t;
      obj.setScale(obj._bsx * k, obj._bsy * k);
    };
    this.enemies.getChildren().forEach(apply);
    this.enemyBullets.getChildren().forEach(apply);
    this.playerBullets.getChildren().forEach(apply);
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

    // 進行表示（WAVE x/4 ・ BOSS x/4）
    if (this.bossActive && this.boss) {
      this._timerText.setText('BOSS ' + this.boss.phase + '/4').setColor('#ff5555');
    } else {
      this._timerText.setText('WAVE ' + (this.waveIndex + 1) + '/4').setColor('#ffffff');
    }

    const hpRatio = Phaser.Math.Clamp(this.playerHP / this.playerMaxHP, 0, 1);
    this._hpBar.width = 110 * hpRatio;
    this._hpBar.setFillStyle(
      hpRatio > 0.5 ? C.HP_GREEN : hpRatio > 0.25 ? C.HP_YELLOW : C.HP_RED
    );

    // パワー/拡散/大玉/ほっぺ/バリアを合成表示
    let pt = 'P' + this.powerLevel;
    if (this.spreadLv > 0) pt += ' 拡' + this.spreadLv;
    if (this.bigLv > 0) pt += ' 玉' + this.bigLv;
    if (this.heartLv > 0) pt += ' ♥' + this.heartLv;
    if (this.shieldHits > 0) pt += ' 🛡' + this.shieldHits;
    const beaming = this.time.now < this._beamUntil;
    this._powerText.setText(pt).setColor(
      beaming ? '#66eaff' : this.heartLv > 0 ? '#ff6b9d' : this.bigLv > 0 ? '#ff80ab' : this.spreadLv > 0 ? '#ffb060' : '#ffcc00'
    );

    // ビームボタン: チャージがある時だけ表示（発動中は隠す）
    const showBeam = this.beamCharges > 0 && !beaming && !this.gameEnded;
    this._beamBtn.setVisible(showBeam);
    if (showBeam) this._beamBtnCnt.setText('×' + this.beamCharges);

    if (this.bossActive && this.boss && this.boss.active) {
      const bRatio = Phaser.Math.Clamp(this.boss.bossHP / this.boss.bossMaxHP, 0, 1);
      this._bossHpBar.width = (GW - 40) * bRatio;
    }
  }

  _cleanupOffscreen() {
    const margin = 80;
    [this.playerBullets, this.enemies, this.enemyBullets, this.items].forEach(group => {
      group.getChildren().forEach(obj => {
        if (obj.y < -margin || obj.y > GH + margin ||
            obj.x < -margin || obj.x > GW + margin) {
          this.tweens.killTweensOf(obj); // 破棄前に残存tweenを止める
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

    // ほっぺ効果: 命中したハートが破裂し、破片が周囲へ拡散（1弾1破裂・破片は再破裂しない）
    if (bullet.heartBurst && !bullet.isFragment) {
      this._spawnHeartBurst(bullet.x, bullet.y, enemy);
      bullet.heartBurst = 0;
    }

    if (bullet.pierceLeft && bullet.pierceLeft > 0) {
      bullet.pierceLeft--;
      (bullet._hit || (bullet._hit = new Set())).add(enemy);
    } else {
      bullet.destroy();
    }

    if (enemy.hp <= 0) {
      this._addScore(enemy.score);
      this._explode(enemy.x, enemy.y);
      SFX.explosion();
      if (enemy.isCarrier) {
        // 運び屋は必ず強化をドロップ（スタートライン揃え）
        this._spawnItem(Phaser.Utils.Array.GetRandom(
          ['item_power', 'item_spread', 'item_big', 'item_cheek']), enemy.x, enemy.y);
        this._killsSinceDrop = 0;
      } else {
        this._tryDropItem(enemy.x, enemy.y);
      }
      this.tweens.killTweensOf(enemy);
      enemy.destroy();
    }
  }

  // ハート破裂: 命中点から破片を放射状に飛ばす（ほっぺLvで数が増える）
  _spawnHeartBurst(x, y, sourceEnemy) {
    const n = BALANCE.heartFragBase + this.heartLv * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const f = this.playerBullets.create(x, y, 'heart_frag');
      f.setDepth(6);
      f.setVelocity(Math.cos(a) * BALANCE.heartFragSpeed, Math.sin(a) * BALANCE.heartFragSpeed);
      f.body.setSize(f.width * 0.8, f.height * 0.8);
      f.body.setOffset(f.width * 0.1, f.height * 0.1);
      f.damage = 1;
      f.pierceLeft = 0;
      f.isFragment = true;
      f._hit = new Set([sourceEnemy]); // 破裂元の敵には当てない（二重取り防止）
      this.time.delayedCall(BALANCE.heartFragLifeMs, () => { if (f.active) f.destroy(); });
    }
    SFX.tick();
  }

  _onBulletHitBoss(bullet, boss) {
    if (bullet.isFragment) { bullet.destroy(); return; } // 破片はボスに無効（威力バランス）
    const dmg = bullet.damage || 1;
    bullet.destroy(); // 単体ボスでは貫通させず必ず消す（多重ヒット防止）
    if (boss.entering || boss.defeated) return; // 降臨中・撃破処理中は無敵
    boss.bossHP -= dmg;
    this.score += this._gain(dmg * BALANCE.bossDmgScore); // ボス戦もスコアになる
    this._flashWhite(boss);
    if (boss.bossHP <= 0) this._bossEncounterDefeated();
  }

  // 注意: Phaserは overlap(グループ, スプライト) のとき callback(スプライト, 要素)
  // と引数を入れ替えて渡す。引数名に頼ると自機を destroy してしまうため、
  // 必ず「this.player でない方」を相手として判定する。
  _onEnemyBulletHitPlayer(a, b) {
    if (this.invincible || this.gameEnded) return;
    const bullet = (a === this.player) ? b : a;
    const dmg = bullet.isFireball ? BALANCE.fireballDmg : 10; // 火の玉は大きく重い一撃
    bullet.destroy();
    this._damagePlayer(Math.round(dmg * this.diff.dmgMul));
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
    // 強化が既にMAXならスコアに変換（終盤に拾うアイテムも無駄にならない）
    const maxed = () => {
      const pts = this._gain(BALANCE.maxedItemScore);
      this.score += pts;
      this._showPickupMsg('MAX! +' + pts.toLocaleString(), '#ffee88');
    };
    switch (item.itemType) {
      case 'item_power':
        if (this.powerLevel >= 5) { maxed(); break; }
        this.powerLevel++;
        this._showPickupMsg('パワー Lv.' + this.powerLevel, '#ffcc00');
        break;
      case 'item_spread':
        if (this.spreadLv >= 4) { maxed(); break; }
        this.spreadLv++;
        this._showPickupMsg('拡散 Lv.' + this.spreadLv, '#ff9800');
        break;
      case 'item_big':
        if (this.bigLv >= 3) { maxed(); break; }
        this.bigLv++;
        this._showPickupMsg('大玉 Lv.' + this.bigLv, '#ff80ab');
        break;
      case 'item_cheek':
        if (this.heartLv >= BALANCE.heartMaxLv) { maxed(); break; }
        this.heartLv++;
        this._showPickupMsg('ほっぺ♥ Lv.' + this.heartLv + ' 弾が破裂!', '#ff6b9d');
        break;
      case 'item_barrier':
        this.shieldHits = 3;
        this._setShield(true);
        this._showPickupMsg('バリア展開！', '#33e0ff');
        SFX.barrier();
        this.tweens.killTweensOf(item);
        item.destroy();
        return;
      case 'item_beam':
        if (this.beamCharges >= 3) { maxed(); break; }
        this.beamCharges++;
        this._showPickupMsg('★ビーム砲 ×' + this.beamCharges, '#66eaff');
        break;
      case 'item_heal': {
        const amt = this.diff.healAmount;
        const healed = Math.min(amt, this.playerMaxHP - this.playerHP);
        this.playerHP = Math.min(this.playerMaxHP, this.playerHP + amt);
        this._showPickupMsg('+' + healed + ' HP', '#66ff66');
        break;
      }
    }
    SFX.powerup();
    this.tweens.killTweensOf(item);
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
      SFX.tick();
      this.invincible = true;
      if (this.shieldHits <= 0) this._setShield(false);
      this.time.delayedCall(500, () => { this.invincible = false; });
      return;
    }

    this.invincible = true;
    this.playerHP = Math.max(0, this.playerHP - amount);
    this._segmentDamaged = true; // このウェーブ/ボス戦のノーダメボーナスは消滅
    SFX.damage();

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
    this.score += this._gain(amount * multiplier); // 難易度倍率も適用

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

  // ボス1体撃破。フェーズ3なら本当のクリア、それ以外は次のウェーブへ。
  _bossEncounterDefeated() {
    const b = this.boss;
    if (!b || b.defeated) return;
    b.defeated = true;
    const wasPhase = b.phase;
    this.bossActive = false;
    this.boss = null;
    this.mode = 'boss-clear';
    this._bossHpContainer.setVisible(false);
    this._cancelEnemyBullets(); // 残弾を★に変換して加点（危険→報酬）

    // 撃破ボーナス＋速攻ボーナス（速く倒すほど高得点＝火力ビルドが報われる）
    const killPts = this._gain(BALANCE.bossKillBonus * wasPhase);
    const fightSec = (this.time.now - (this._bossStartAt || this.time.now)) / 1000;
    const speedPts = this._gain(Math.max(0,
      Math.round(BALANCE.bossSpeedBonusMaxSec - fightSec) * BALANCE.bossSpeedBonusPerSec));
    this.score += killPts + speedPts;
    this._showPickupMsg(
      '撃破 +' + killPts.toLocaleString() + (speedPts > 0 ? '  速攻 +' + speedPts.toLocaleString() : ''),
      '#ffd54f');
    this._awardNoDamageBonus();

    SFX.bossDefeat();
    this.cameras.main.shake(400, 0.02);
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 110, () => {
        if (b && b.active) this._explode(b.x + Phaser.Math.Between(-40, 40), b.y + Phaser.Math.Between(-30, 30));
      });
    }

    this.time.delayedCall(1100, () => {
      if (b && b.active) b.destroy();
      if (wasPhase >= 4) {
        this._banner('STAGE CLEAR!', '#ffdd44');
        SFX.clear();
        this.time.delayedCall(400, () => this._gameOver(true));
      } else {
        this._startWave(wasPhase); // phase1撃破→wave index1、phase2→index2、phase3→index3
      }
    });
  }

  _gameOver(cleared) {
    if (this.gameEnded) return;
    this.gameEnded = true;
    Object.values(this.waveTimers).forEach(t => t && t.remove());

    const finalScore = this.score + (cleared ? this._gain(BALANCE.clearBonus) : 0);
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
