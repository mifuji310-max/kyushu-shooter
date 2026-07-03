// ゲーム定数
const GW = 400;
const GH = 700;
const CONTROL_H = 100; // 下部タッチ操作エリアの高さ（半分に縮小）
const PLAY_H = GH - CONTROL_H;

// 描画解像度の倍率（高DPI端末で滲まないようにする）。
// ゲーム本体は GW×GH 座標で動かし、各シーンでカメラを DPR 倍ズームして
// 実バッファだけを高解像度化する（座標系は不変）。
const DPR = Math.min(window.devicePixelRatio || 1, 3);

// 全テキスト共通のフォント（少し引き締まった見た目に）
const FONT = '"Trebuchet MS", "Segoe UI", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

// テキスト生成ヘルパー: 解像度をDPR以上にして「滲み」を解消し、既定フォントを適用。
// 各シーンで this.add.text(...) の代わりに TXT(this, ...) を使う。
function TXT(scene, x, y, str, style) {
  style = Object.assign({}, style || {});
  if (style.resolution === undefined) style.resolution = Math.max(2, Math.ceil(DPR));
  if (!style.fontFamily || style.fontFamily === 'sans-serif') style.fontFamily = FONT;
  return scene.add.text(x, y, str, style);
}

// スタイリッシュなボタン（角丸・枠・ホバー）。container を返し .bg/.txt を持つ。
function mkButton(scene, x, y, label, opts) {
  opts = opts || {};
  const w = opts.w || 150, h = opts.h || 46, rad = opts.rad || 10;
  const bg = opts.bg ?? 0x16233f, bgHover = opts.bgHover ?? 0x27406e;
  const border = opts.border ?? 0x4a86ff, fg = opts.fg || '#dbe8ff';
  const cont = scene.add.container(x, y);
  if (opts.depth !== undefined) cont.setDepth(opts.depth);
  const g = scene.add.graphics();
  const draw = (fill) => {
    g.clear();
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, rad);
    g.lineStyle(2, border, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, rad);
  };
  draw(bg);
  const t = TXT(scene, 0, 0, label, {
    fontSize: opts.fontSize || '17px', color: fg, fontStyle: 'bold',
  }).setOrigin(0.5);
  cont.add([g, t]);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  cont.add(hit);
  hit.on('pointerover', () => draw(bgHover));
  hit.on('pointerout', () => draw(bg));
  if (opts.onClick) hit.on('pointerdown', opts.onClick);
  cont.bg = g; cont.txt = t; cont.hit = hit;
  cont.redraw = draw;
  return cont;
}

const VERSION = 'v0.5.1';

// カラーパレット
const C = {
  BG:          0x0d0d2b,
  STAR:        0xffffff,
  ROAD:        0x1a1a3a,

  // Player
  PLAYER:      0x9e9e9e,
  CAB:         0x546e7a,
  WINDOW:      0xb3e5fc,
  WHEEL:       0x212121,
  WHEEL_RIM:   0x757575,
  BUMPER:      0x424242,

  // Bullets
  P_BULLET:    0xffeb3b,
  E_BULLET:    0xff1744,

  // Enemies
  RENKON:      0xaed581,
  RENKON_D:    0x33691e,
  JINTAIKO:    0x8d6e63,
  JINTAIKO_D:  0x3e2723,
  KINGYO:      0xff7043,
  KINGYO_D:    0xbf360c,
  CHIP:        0x78909c,
  CHIP_D:      0x263238,
  CHIP_GREEN:  0x00e676,
  KYORYU:      0x81c784,
  KYORYU_D:    0x1b5e20,
  UMA:         0x795548,
  UMA_D:       0x3e2723,

  // Boss
  BOSS:        0x212121,
  BOSS_EAR:    0x1a1a1a,
  BOSS_EYE:    0xff1744,
  BOSS_METAL:  0x607d8b,
  BOSS_GLOW:   0xff6d00,
  BOSS_BOLT:   0x90a4ae,

  // UI
  HP_BG:       0x333333,
  HP_GREEN:    0x4caf50,
  HP_YELLOW:   0xffc107,
  HP_RED:      0xf44336,
  BOSS_HP_BAR: 0xf44336,
  CTRL_BG:     0x0a0a1e,
  TEXT:        0xffffff,
  TEXT_DIM:    0xaaaaaa,
};

// 3ラウンド構成: 各ウェーブ(通常敵)を全滅させるとボス①②③が登場。
// 各グループ = { type, count(出現数), interval(出現間隔ms), startAt(ウェーブ開始からの遅延ms) }
const STAGE_WAVES = [
  [ { type: 'renkon', count: 12, interval: 900 },
    { type: 'kingyo', count: 8,  interval: 1000, startAt: 1500 } ],
  [ { type: 'chip',     count: 12, interval: 800 },
    { type: 'jintaiko', count: 6,  interval: 1600, startAt: 800 },
    { type: 'renkon',   count: 10, interval: 800,  startAt: 2600 } ],
  [ { type: 'kyoryu', count: 8,  interval: 1500 },
    { type: 'uma',    count: 12, interval: 700, startAt: 1200 },
    { type: 'kingyo', count: 10, interval: 700, startAt: 3200 } ],
];

// 各ボス(①②③)のHP係数（難易度のbossHPに乗算・段階的に強化）
const BOSS_HP_FACTORS = [1.2, 1.6, 2.0];

// 敵パラメータ（w/h は表示・出現位置の基準サイズ＝正方フレーム）
const ENEMY_CFG = {
  renkon:   { hp: 2,  score: 100, w: 40, h: 40, speed: 110, label: '辛子蓮根' },
  jintaiko: { hp: 6,  score: 200, w: 46, h: 46, speed: 75,  label: '陣太鼓',  shootInterval: 2800 },
  kingyo:   { hp: 2,  score: 130, w: 44, h: 44, speed: 135, label: '金魚' },
  chip:     { hp: 4,  score: 180, w: 38, h: 38, speed: 230, label: '半導体' },
  kyoryu:   { hp: 8,  score: 300, w: 52, h: 52, speed: 90,  label: '恐竜', shootInterval: 3200 },
  uma:      { hp: 3,  score: 250, w: 50, h: 50, speed: 290, label: '馬' },
};

// 画像を使う敵（cw/ch は画像内の中身の占有率＝当たり判定の基準）
const ENEMY_IMG = {
  renkon:   { key: 'enemy_renkon_img',   cw: 0.81, ch: 0.76 },
  chip:     { key: 'enemy_chip_img',     cw: 0.68, ch: 0.68 },
  jintaiko: { key: 'enemy_jintaiko_img', cw: 0.88, ch: 0.75 },
  kingyo:   { key: 'enemy_kingyo_img',   cw: 0.63, ch: 0.82 },
  kyoryu:   { key: 'enemy_kyoryu_img',   cw: 0.42, ch: 0.97 },
  uma:      { key: 'enemy_uma_img',      cw: 0.35, ch: 0.94 },
};

const BOSS_MAX_HP = 200;   // NORMAL基準（難易度で上書き）
const PLAYER_MAX_HP = 100;  // NORMAL基準（難易度で上書き）

// 難易度設定
// dmgMul: 被ダメージ倍率 / healDrop: 回復ドロップ率 / powerDrop: 強化ドロップ率
// enemyHpMul: 敵HP倍率 / enemySpeedMul: 敵速度倍率 / shootIntervalMul: 敵発射間隔倍率(小=高頻度)
const DIFFICULTY = {
  EASY: {
    key: 'EASY', label: 'EASY', color: '#5fd35f', desc: 'のんびり練習。回復多め',
    playerHP: 120, healAmount: 35, dmgMul: 0.6,
    healDrop: 0.12, powerDrop: 0.16, bossHP: 140,
    enemyHpMul: 0.8, enemySpeedMul: 0.85, shootIntervalMul: 1.35,
  },
  NORMAL: {
    key: 'NORMAL', label: 'NORMAL', color: '#4fb0ff', desc: '標準的なバランス',
    playerHP: 100, healAmount: 25, dmgMul: 1.0,
    healDrop: 0.05, powerDrop: 0.11, bossHP: 200,
    enemyHpMul: 1.0, enemySpeedMul: 1.0, shootIntervalMul: 1.0,
  },
  HARD: {
    key: 'HARD', label: 'HARD', color: '#ff9d3a', desc: '歯ごたえあり。回復少なめ',
    playerHP: 80, healAmount: 18, dmgMul: 1.4,
    healDrop: 0.03, powerDrop: 0.09, bossHP: 280,
    enemyHpMul: 1.2, enemySpeedMul: 1.15, shootIntervalMul: 0.8,
  },
  EXTREME: {
    key: 'EXTREME', label: 'EXTREME', color: '#ff4466', desc: '死を覚悟せよ',
    playerHP: 60, healAmount: 12, dmgMul: 1.8,
    healDrop: 0.018, powerDrop: 0.07, bossHP: 380,
    enemyHpMul: 1.5, enemySpeedMul: 1.3, shootIntervalMul: 0.62,
  },
};
const DIFFICULTY_ORDER = ['EASY', 'NORMAL', 'HARD', 'EXTREME'];

// 武器タイプ（fire: 発射間隔ms）
const WEAPON = {
  normal: { label: '通常', color: '#ffeb3b', fire: 110 },
  spread: { label: '拡散', color: '#ff9800', fire: 150 },
  big:    { label: '大玉', color: '#ff4081', fire: 280 },
};
