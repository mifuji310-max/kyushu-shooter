// 共有ランキング（Firebase Realtime Database）。
// Nmoku(rittai-nmoku)と同じFirebaseプロジェクトを流用し、別パス kyushu_shooter/scores を使う。
// 接続キーはクライアント公開が仕様上正常（安全性はDBルールで担保）。
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBtC8za8k1UBL58zLVpstjz2zxvpI-YBFk',
  authDomain: 'rittai-nmoku.firebaseapp.com',
  databaseURL: 'https://rittai-nmoku-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'rittai-nmoku',
  storageBucket: 'rittai-nmoku.firebasestorage.app',
  messagingSenderId: '997658040554',
  appId: '1:997658040554:web:3ed344cadac60042eb1f93',
};

const RemoteScores = {
  _db: null,
  available: false,
  PATH: 'kyushu_shooter/scores',

  init() {
    try {
      if (typeof firebase === 'undefined') return; // SDK未読込
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      this._db = firebase.database();
      this.available = true;
    } catch (e) {
      console.warn('[RemoteScores] init failed', e);
      this.available = false;
    }
  },

  // スコアを1件送信。成功でtrue、失敗/未接続でfalseを返す（例外は投げない）
  submit(entry) {
    if (!this.available) return Promise.resolve(false);
    try {
      const ref = this._db.ref(this.PATH).push();
      return ref.set({
        name: (entry.name || '名無し').slice(0, 16),
        score: entry.score | 0,
        version: entry.version || '',
        difficulty: entry.difficulty || '',
        date: entry.date || new Date().toISOString(),
        ts: firebase.database.ServerValue.TIMESTAMP,
      }).then(() => true).catch(e => { console.warn('[RemoteScores] submit failed', e); return false; });
    } catch (e) {
      console.warn('[RemoteScores] submit error', e);
      return Promise.resolve(false);
    }
  },

  // 上位n件を取得。未接続/失敗ならnull（呼び出し側はローカルにフォールバック）
  fetchTop(n) {
    if (!this.available) return Promise.resolve(null);
    try {
      return this._db.ref(this.PATH).orderByChild('score').limitToLast(n).once('value')
        .then(snap => {
          const arr = [];
          snap.forEach(ch => { const v = ch.val(); v._key = ch.key; arr.push(v); });
          arr.sort((a, b) => b.score - a.score);
          return arr;
        })
        .catch(e => { console.warn('[RemoteScores] fetch failed', e); return null; });
    } catch (e) {
      console.warn('[RemoteScores] fetch error', e);
      return Promise.resolve(null);
    }
  },
};

RemoteScores.init();
