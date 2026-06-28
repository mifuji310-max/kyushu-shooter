# 開発メモ（九州シューター）

ブラウザで動くスマホ向け2D縦スクロールシューティング。九州モチーフ。
タイトル画面に表示される `VERSION`（`js/config.js`）で、デプロイ反映を確認する。

## 技術構成
- **Phaser.js 3.70.0**（CDN読み込み）+ Arcade Physics
- 自機・敵・弾は `Graphics.generateTexture()` で図形から動的生成
- 画像アセットは `img/` に配置し各シーンの `preload()` で読込
  - タイトルロゴ `title_logo`（黒背景はSCREEN合成で透過して星空に重ねる）
  - 背景 `bg_kumamoto`（空撮写真。`TileSprite`で縦スクロール、`tilePositionY`を動かす）
- シーン: `TitleScene` → `GameScene` → `GameOverScene` → `LeaderboardScene`
- スコアは `localStorage`（`kyushu_scores`）に `version` 付きで保存
- デプロイ: GitHub Actions → GitHub Pages（mainブランチへのpushで自動）
  - 公開URL: https://mifuji310-max.github.io/kyushu-shooter/
  - ※ Pagesは**Publicリポジトリ**必須（無料アカウント）

## ゲーム仕様（現状）
- 操作: 画面下部 `CONTROL_H=180px` のエリアをタッチ → 相対位置で自機が追従
- 自機: ジムニー風4WD。30秒ステージ → ボス「機械くまモン」（3フェーズ）
- 敵6種: 辛子蓮根 / 陣太鼓 / 金魚 / 半導体 / 恐竜 / 馬（`ENEMY_CFG`・`WAVE_SCHEDULE`）
- 被弾後1.2秒無敵。被弾演出はカメラの赤フラッシュ＋振動（自機スプライトは触らない）

### 難易度（`DIFFICULTY` / タイトルで選択）
EASY / NORMAL / HARD / EXTREME の4段階。選択は `registry` に保存しリトライでも維持。
各モードで「自機HP・被ダメ倍率・回復ドロップ率/量・敵HP/速度/発射間隔・ボスHP」を調整。
スコアには `difficulty` も保存し、ランキングに難易度を色付き表示。

### 武器・パワーアップ（`WEAPON` + ドロップアイテム）
- **武器3種**（取得で切替）: `normal`(通常連射) / `spread`(扇状3-5way) / `big`(貫通大玉・高威力低速)
- **パワーLv 1-3**: いきなり団子(`item_power`)で上昇。現在の武器を強化
- **バリア**(`item_barrier`): 3回まで被弾を肩代わり。自機に追従するリング表示
- **天然水**(`item_heal`): HP回復（量は難易度依存）
- 発射は30ms間隔タイマー＋`_nextFireAt`で武器ごとの発射間隔をゲート制御
- 貫通弾は `bullet.pierceLeft` と `bullet._hit`(Set)で多重ヒットを防ぐ

## ファイル構成
| ファイル | 役割 |
|---|---|
| `index.html` | Phaser CDN + 各js読込。`touch-action:none` |
| `js/config.js` | 全定数（GW/GH, VERSION, 敵パラメータ, ウェーブ, 色） |
| `js/game.js` | Phaser初期化 |
| `js/scenes/GameScene.js` | 本体（描画・入力・敵・ボス・衝突・UI） |
| `js/scenes/TitleScene.js` | タイトル |
| `js/scenes/GameOverScene.js` | ニックネーム入力・スコア保存 |
| `js/scenes/LeaderboardScene.js` | TOP10表示 |

## ハマったポイントと教訓

### 1. 【最重要】被弾で自機が消える＝自機が破棄されていた
- **症状**: ダメージを受けると自機が消える。だが弾は出続け、ダメージも受けず、アイテムも取れない。
- **真因**: Phaserは `overlap(グループ, スプライト)` のとき、コールバック引数を
  **`callback(スプライト, 要素)` の順に入れ替えて**渡す。
  そのため `_onEnemyHitPlayer(enemy, player)` の `enemy` に実際は**自機**が入り、
  `enemy.destroy()` が**自機を破棄**していた。敵弾衝突 `_onEnemyBulletHitPlayer` も同様。
- **対策**: 引数名に頼らず「`this.player` でない方」を相手として判定する。
  ```js
  _onEnemyHitPlayer(a, b) {
    const enemy = (a === this.player) ? b : a;
    ...
  }
  ```
- **教訓**: 「見えない」系バグでも、まず**オブジェクトが破棄/無効化されていないか**を疑う。
  破棄済みスプライトは `active=false` になるため、`visible`/`alpha` をいくら直しても無駄。
  → 遠回りした原因。最初に当たり判定を疑うべきだった。

### 2. タッチ/指離しで画面速度が急変する
- **真因**: 背景スクロールが**フレーム数ベース**（1フレーム固定px）。
  スマホはタッチ前後でFPSが変動するため、背景速度が変わって見えた。
- **対策**: `delta`（経過ミリ秒）ベースに変更。`Math.min(delta, 34)` で
  カクつき時のスパイクも抑制（34ms≒2フレーム）。物理速度(`setVelocity`)はPhaserが
  時間補正するので元から影響なし＝手動でフレーム加算している箇所だけ要修正。

### 3. 道路の白線が弾と紛らわしい
- 白線を「短い白帯」→「細長く薄い灰白色のレーン標示」に変更し、黄色い弾と区別。
- 中央線はループ計算を均等間隔方式に修正。
- ※左右の田んぼの畦の細かい被りは未対応（リアルテクスチャ化時にまとめて対応予定）。

### 4. 描画の点滅に tint/alpha を使うと端末GPUで消えることがある（疑い）
- 動的生成テクスチャ + `setTint` で一部スマホGPUでは消えたまま戻らない報告あり。
- 結局のバグ真因は上記1（破棄）だったが、被弾演出は安全側に倒し
  **自機スプライトには触れず、カメラの赤フラッシュ + 振動**で表現している。

### 5. その他の環境ハマり（解決済み）
- **プレビューツールでrAFが動かない**: Phaserのゲームループが回らず、この環境では
  実機同等の動作確認ができない。検証は静的解析 + 実機で行う。
- **APアイソレーション**: ルーターが端末間通信を遮断し、スマホからPCのローカルサーバに
  繋がらなかった → GitHub Pagesデプロイで解決。
- **GitHub Pages 404**: Privateリポジトリだと無料アカウントでは公開不可 → Public化で解決。

## 運用ルール
- **コードを変更してpushする前に必ず `js/config.js` の `VERSION` を上げる**
  （デプロイ反映をタイトル画面で確認するため）。
  - 微修正・バグ修正: パッチ +1（例 v0.1.3 → v0.1.4）

## バージョン履歴
| Ver | 内容 |
|---|---|
| v0.1.0 | 初版（熊本ステージ・ボス・ランキング・GitHub Pages公開） |
| v0.1.1 | 被弾演出を setInterval + tint に変更（消失バグは未解決） |
| v0.1.2 | tint撤廃→setVisible点滅 + 復帰保険 / 背景・移動をdeltaベース化 |
| v0.1.3 | 自機スプライト非干渉（画面赤フラッシュ化）/ 速度スパイク低減 / 白線を弾と区別 |
| v0.1.4 | **真因修正**: overlap引数入替で自機をdestroyしていたバグを解消 |
| (tag) | `prototype-v0.1.4` — プロトタイプ確定版として保存 |
| v0.2.0 | 難易度4段階(EASY/NORMAL/HARD/EXTREME)+選択UI・スタートボタン / 武器3種・バリア追加 / 全体リバランス（HP・回復見直し） |
| v0.2.1 | 画像アセット導入: タイトルロゴ(`img/KyushuShooterTitle.png`)＋熊本空撮背景(`img/kumamoto_background.png`)。手描き背景をTileSpriteの空撮スクロールに置換 |
