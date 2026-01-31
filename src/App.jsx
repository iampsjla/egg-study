import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, onSnapshot 
} from 'firebase/firestore';
import { 
  Heart, Coins, Map as MapIcon, AlertCircle, LogOut, Settings, CheckCircle2, History, ChevronRight
} from 'lucide-react';

// --- 1. 強化版 Firebase 初始化 ---
const getFirebaseConfig = () => {
  // 優先檢查環境注入的變數
  try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {}

  // 讀取 Vite 環境變數 (.env)
  let env = {};
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      env = import.meta.env;
    }
  } catch (e) {}

  return { 
    apiKey: env.VITE_FIREBASE_API_KEY || "", 
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "", 
    projectId: env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.VITE_FIREBASE_APP_ID || ""
  }; 
};

const config = getFirebaseConfig();

// 初始化 Firebase
let app, auth, db;
if (config.apiKey && config.apiKey !== "") {
  try {
    app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

const appId = "egg-adventure-prod-v1";

const INITIAL_STATS = {
  hp: 100, maxHp: 100, gold: 100, exp: 0, lv: 1, 
  inventory: [], currentRoom: 'start', wrongQuestions: {}, 
  role: 'student', parentEmail: '', familyRewards: [] 
};

const App = () => {
  const [user, setUser] = useState(null);
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configMissing, setConfigMissing] = useState(!auth);
  const [authError, setAuthError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');

  // 監聽登入狀態
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // 取得玩家資料
        const userDocRef = doc(db, 'artifacts', appId, 'users', u.uid, 'profile', 'gameData');
        const unsubDoc = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            setPlayer({ ...INITIAL_STATS, ...snap.data() });
          } else {
            setDoc(userDocRef, INITIAL_STATS);
            setPlayer(INITIAL_STATS);
          }
          setLoading(false);
        }, (err) => {
          console.error("Firestore Error:", err);
          setLoading(false);
        });
        return () => unsubDoc();
      } else {
        setPlayer(null);
        setLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!auth) return;
    setLoading(true);
    setAuthError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setAuthError("認證失敗: " + err.message);
      setLoading(false);
    }
  };

  // 1. 如果 Firebase 設定缺失
  if (configMissing) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-6 text-center">
      <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-red-100 max-w-sm w-full">
        <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-black text-slate-800 mb-2">Firebase 未設定</h2>
        <p className="text-sm text-slate-500 mb-6">請檢查您的 .env 檔案並確保執行了 npm run deploy。</p>
        <div className="text-[10px] bg-slate-100 p-2 rounded text-left overflow-auto font-mono">
           API KEY: {config.apiKey ? "已填寫" : "未偵測到"}
        </div>
      </div>
    </div>
  );

  // 2. 讀取中
  if (loading) return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center font-bold text-yellow-600">
      載入中...
    </div>
  );

  // 3. 登入/註冊畫面
  if (!user) return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border-4 border-white">
        <h1 className="text-2xl font-black text-center mb-6 text-slate-800">蛋仔大冒險</h1>
        {authError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg flex items-center gap-2">
            <AlertCircle size={14}/> {authError}
          </div>
        )}
        <form onSubmit={handleAuth} className="space-y-4">
          <input 
            type="email" placeholder="電子信箱" 
            value={email} onChange={e=>setEmail(e.target.value)} 
            className="w-full p-3 bg-slate-50 rounded-xl border outline-none focus:border-yellow-400" 
            required 
          />
          <input 
            type="password" placeholder="密碼" 
            value={password} onChange={e=>setPassword(e.target.value)} 
            className="w-full p-3 bg-slate-50 rounded-xl border outline-none focus:border-yellow-400" 
            required 
          />
          <button className="w-full py-3 bg-yellow-400 text-white font-bold rounded-xl shadow-md transition active:scale-95">
            {authMode === 'login' ? '登入遊戲' : '註冊帳號'}
          </button>
        </form>
        <button 
          onClick={() => setAuthMode(m => m === 'login' ? 'signup' : 'login')} 
          className="w-full mt-4 text-xs text-yellow-600 underline"
        >
          {authMode === 'login' ? '還沒有帳號？點此註冊' : '已有帳號？返回登入'}
        </button>
      </div>
    </div>
  );

  // 4. 遊戲主畫面 (連線成功後)
  return (
    <div className="min-h-screen bg-sky-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-md bg-white rounded-2xl p-4 mb-4 flex justify-between items-center shadow-sm">
        <div className="flex gap-4 text-xs font-bold">
          <span className="flex items-center gap-1"><Heart size={14} className="text-red-500"/> {player?.hp}</span>
          <span className="flex items-center gap-1"><Coins size={14} className="text-yellow-500"/> {player?.gold}</span>
        </div>
        <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-500 transition">
          <LogOut size={18}/>
        </button>
      </div>
      
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8 min-h-[400px] flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
          <MapIcon size={40} className="text-yellow-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">連線成功！</h2>
        <p className="text-slate-500 text-sm">歡迎回來，蛋仔冒險者。您的資料已成功從雲端同步。</p>
        <button className="mt-8 px-8 py-3 bg-sky-500 text-white font-bold rounded-full shadow-lg active:scale-95 transition">
          開始冒險
        </button>
      </div>
    </div>
  );
};

export default App;