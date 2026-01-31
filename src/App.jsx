import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signOut, signInAnonymously,
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
  // 優先檢查 Canvas 預覽環境變數 (由環境注入)
  try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {}

  // 讀取 Vite 環境變數 (.env)
  // 透過 try-catch 處理，以防在不支援 import.meta 的舊型編譯環境中出現錯誤
  let env = {};
  try {
    // 檢查 import.meta 是否存在且包含 env
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      env = import.meta.env;
    }
  } catch (e) {
    // 環境不支援 import.meta，保持 env 為空物件
  }

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

// 只有在 API Key 存在時才初始化，避免 Null 錯誤
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
  const [gameState, setGameState] = useState('explore');

  // 監聽登入狀態
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
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
          console.error(err);