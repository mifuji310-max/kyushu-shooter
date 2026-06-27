// ゲーム定数
const GW = 400;
const GH = 700;
const CONTROL_H = 180; // 下部タッチ操作エリアの高さ
const PLAY_H = GH - CONTROL_H;

const VERSION = 'v0.1.3';

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

// ステージ時間（秒）
const STAGE_DURATION = 30;

// 敵ウェーブスケジュール（30秒ステージ）
const WAVE_SCHEDULE = [
  { startTime: 0,  type: 'renkon',   interval: 2000 },
  { startTime: 5,  type: 'renkon',   interval: 1500 },
  { startTime: 8,  type: 'jintaiko', interval: 3500 },
  { startTime: 12, type: 'kingyo',   interval: 1800 },
  { startTime: 16, type: 'chip',     interval: 1200 },
  { startTime: 20, type: 'kyoryu',   interval: 2500 },
  { startTime: 24, type: 'uma',      interval: 1200 },
  { startTime: 27, type: 'uma',      interval: 800  },
];

// 敵パラメータ
const ENEMY_CFG = {
  renkon:   { hp: 2,  score: 100, w: 32, h: 32, speed: 110, label: '辛子蓮根' },
  jintaiko: { hp: 6,  score: 200, w: 38, h: 30, speed: 75,  label: '陣太鼓',  shootInterval: 2800 },
  kingyo:   { hp: 2,  score: 130, w: 36, h: 24, speed: 135, label: '金魚' },
  chip:     { hp: 4,  score: 180, w: 36, h: 26, speed: 230, label: '半導体' },
  kyoryu:   { hp: 8,  score: 300, w: 44, h: 40, speed: 90,  label: '恐竜', shootInterval: 3200 },
  uma:      { hp: 3,  score: 250, w: 34, h: 46, speed: 290, label: '馬' },
};

const BOSS_MAX_HP = 200;
const PLAYER_MAX_HP = 100;
