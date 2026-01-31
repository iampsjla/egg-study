import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
  onAuthStateChanged, signOut, signInAnonymously 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, onSnapshot 
} from 'firebase/firestore';
import { 
  Heart, Coins, User, Shield, Map as MapIcon, ShoppingBag, Timer, 
  Swords, Fish, ChevronRight, AlertCircle, Trophy, 
  LogOut, Mail, Lock, UserPlus, LogIn, Save, UserCircle, 
  History, Star, CheckCircle2, Settings, Plus, Trash2, Link as LinkIcon, Sparkles, XCircle
} from 'lucide-react';

// --- 1. 安全初始化 Firebase ---
const getFirebaseConfig = () => {
  // A. 預覽環境專用 (Canvas)
  if (typeof __firebase_config !== 'undefined') {
    return JSON.parse(__firebase_config);
  }

  // B. 本地開發 / GitHub (Vite)
  // 下載後，請【取消註解】下方的程式碼區塊，以便讀取 .env 檔案
  /*
  if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
  }
  */

  // 若無設定，回傳空物件 (避免白屏)
  return { apiKey: "", authDomain: "", projectId: "" }; 
};

const firebaseConfig = getFirebaseConfig();
// 只有在 config 存在時才初始化
const app = (getApps().length === 0 && firebaseConfig.apiKey) ? initializeApp(firebaseConfig) : getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// 使用固定版本 ID 確保資料一致性
const appId = "egg-adventure-fixed-v13";

// --- 2. 初始數據 ---
const GRADES = ["一上", "一下", "二上", "二下", "三上", "三下", "四上", "四下", "五上", "五下", "六上", "六下"];

const INITIAL_STATS = {
  hp: 100, maxHp: 100, gold: 100, exp: 0, lv: 1, 
  inventory: [], currentRoom: 'start', wrongQuestions: {}, 
  role: 'student', parentEmail: '',
  familyRewards: [] 
};

// --- 3. 動態題庫生成系統 ---
const gen = (subject, grade, diff) => Array.from({length: 10}, (_, i) => ({ 
  id: `${subject}_${grade}_${diff}_${i}`, 
  q: `[${grade}${diff}] ${subject}挑戰題 ${i+1}：蛋仔有幾隻腳？`, 
  a: '2隻', 
  options: ['1隻', '2隻', '3隻', '4隻'].sort(() => Math.random() - 0.5),
  difficulty: diff 
}));

const SUBJECTS_MAP = {
  math: '數學', chinese: '國語', english: '英語', social: '社會', science: '自然'
};

// 自動生成所有年級與難度的題目
const QUESTION_DATABASE = {};
Object.keys(SUBJECTS_MAP).forEach(subKey => {
  QUESTION_DATABASE[subKey] = {};
  GRADES.forEach(grade => {
    QUESTION_DATABASE[subKey][grade] = {
      simple: gen(SUBJECTS_MAP[subKey], grade, '簡易'),
      normal: gen(SUBJECTS_MAP[subKey], grade, '普通'),
      hard: gen(SUBJECTS_MAP[subKey], grade, '困難')
    };
  });
});

// 地圖資料
const ROOMS = {
  start: { id: 'start', name: '蛋仔新手村', description: '冒險起點', exits: ['math', 'chinese', 'english', 'social', 'science', 'shop', 'family', 'pond'], type: 'safe' },
  math: { id: 'math', name: '數學森林', description: '數字與運算的考驗', type: 'battle', subject: 'math', exits: ['start'] },
  chinese: { id: 'chinese', name: '語文園地', description: '文字的奧秘', type: 'battle', subject: 'chinese', exits: ['start'] },
  english: { id: 'english', name: '英語港口', description: '通往世界', type: 'battle', subject: 'english', exits: ['start'] },
  social: { id: 'social', name: '社會古道', description: '歷史人文', type: 'battle', subject: 'social', exits: ['start'] },
  science: { id: 'science', name: '自然基地', description: '科學探索', type: 'battle', subject: 'science', exits: ['start'] },
  shop: { id: 'shop', name: '商城', description: '裝備補給', type: 'shop', exits: ['start'] },
  family: { id: 'family', name: '獎勵室', description: '領取獎勵', type: 'family', exits: ['start'] },
  pond: { id: 'pond', name: '池塘', description: '休閒釣魚', type: 'fishing', exits: ['start'] }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [gameState, setGameState] = useState('explore');
  const [message, setMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedGrade, setSelectedGrade] = useState("一上"); 
  const [quizQueue, setQuizQueue] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [timer, setTimer] = useState(20);
  const [results, setResults] = useState({ correct: 0, gold: 0 });
  const [rewardInput, setRewardInput] = useState({ name: '', cost: 100 });

  const notify = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  // --- 核心：身份與資料監聽 ---
  useEffect(() => {
    if (!auth) {
      setAuthError("Firebase 未設定，請檢查 .env 檔案並重新整理");
      setLoading(false);
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // 使用 profile/gameData 結構
        const userDocRef = doc(db, 'artifacts', appId, 'users', u.uid, 'profile', 'gameData');
        
        const unsubDoc = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setPlayer({
              ...INITIAL_STATS,
              ...data,
              // 防呆檢查
              inventory: Array.isArray(data.inventory) ? data.inventory : [],
              familyRewards: Array.isArray(data.familyRewards) ? data.familyRewards : [],
              wrongQuestions: data.wrongQuestions || {}
            });
          } else {
            setDoc(userDocRef, INITIAL_STATS).catch(console.error);
            setPlayer(INITIAL_STATS);
          }
          setLoading(false);
        }, (err) => {
          console.error("Data Sync Error:", err);
          if (err.code === 'permission-denied') {
            setAuthError("存取被拒。請確認 Firebase Firestore 規則設定正確。");
          } else {
            setAuthError("資料同步錯誤: " + err.message);
          }
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

  const saveToCloud = async (data) => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'gameData'), data);
    } catch (e) { 
      console.error("Save Error:", e); 
      notify("存檔失敗 (權限不足)", "error"); 
    }
    finally { setIsSaving(false); }
  };

  const updateRewards = async (newList) => {
    if (!player) return;
    const safeList = Array.isArray(newList) ? newList : [];
    const newPlayer = { ...player, familyRewards: safeList };
    setPlayer(newPlayer); 
    await saveToCloud(newPlayer);
    notify('獎勵已更新', 'success');
  };

  // --- Auth 動作 ---
  const handleAction = async (e) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    try {
      if (authMode === 'login') await signInWithEmailAndPassword(auth, email, password);
      else await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      let msg = err.message;
      if(err.code === 'auth/operation-not-allowed') msg = "錯誤：後台未開啟登入權限。";
      else if(err.code === 'auth/weak-password') msg = "密碼太弱 (至少 6 位)。";
      else if(err.code === 'auth/email-already-in-use') msg = "此信箱已註冊。";
      setAuthError(msg);
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setAuthError('');
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (err) {
      setAuthError("訪客登入失敗: " + err.message);
      setLoading(false);
    }
  };

  // --- 遊戲邏輯 ---
  const startChallenge = (subject, diff) => {
    let pool = [];
    if (diff === 'reflection') {
      const wrongIds = player.wrongQuestions?.[subject]?.[selectedGrade] || [];
      const dbBySubject = QUESTION_DATABASE[subject]?.[selectedGrade] || {};
      
      Object.keys(dbBySubject).forEach(d => {
        const found = dbBySubject[d].filter(q => wrongIds.includes(q.id));
        pool = [...pool, ...found];
      });
      
      if (pool.length === 0) return notify('反省區目前沒有錯題！', 'success');
    } else {
      pool = QUESTION_DATABASE[subject]?.[selectedGrade]?.[diff] || [];
    }

    if (pool.length === 0) return notify(`[${selectedGrade}] 題庫準備中...`, 'info');
    
    // 從題庫中隨機選題 (若題庫不足 10 題則全選)
    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 10);
    setQuizQueue(shuffled);
    setQuizIndex(0);
    setTimer(20);
    setResults({ correct: 0, gold: 0 });
    setGameState('quiz');
  };

  const answer = (ans) => {
    const currentQ = quizQueue[quizIndex];
    if (!currentQ) return; 

    const isCorrect = ans === currentQ.a;
    if (isCorrect) {
      setResults(p => ({ ...p, correct: p.correct+1, gold: p.gold+10 }));
      if (player.wrongQuestions?.[ROOMS[player.currentRoom].subject]?.[selectedGrade]) {
         const sub = ROOMS[player.currentRoom].subject;
         const newWrong = { ...player.wrongQuestions };
         newWrong[sub][selectedGrade] = newWrong[sub][selectedGrade].filter(id => id !== currentQ.id);
         saveToCloud({ ...player, wrongQuestions: newWrong });
      }
    } else {
      const sub = ROOMS[player.currentRoom].subject;
      const newWrong = { ...player.wrongQuestions };
      if (!newWrong[sub]) newWrong[sub] = {};
      if (!newWrong[sub][selectedGrade]) newWrong[sub][selectedGrade] = [];
      if (!newWrong[sub][selectedGrade].includes(currentQ.id)) {
        newWrong[sub][selectedGrade].push(currentQ.id);
      }
      
      saveToCloud({ ...player, hp: Math.max(0, player.hp - 10), wrongQuestions: newWrong });
    }

    if (quizIndex + 1 < quizQueue.length && player.hp > 0) {
      setQuizIndex(p => p + 1);
      setTimer(20);
    } else {
      setGameState('summary');
    }
  };

  useEffect(() => {
    if (gameState !== 'quiz') return;
    if (timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    } else {
      answer(null);
    }
  }, [timer, gameState]);

  // --- 渲染 ---
  if (loading) return (
    <div className="min-h-screen bg-yellow-50 flex flex-col items-center justify-center font-bold text-yellow-600">
      <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
      連線中...
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 border-4 border-white">
        <h1 className="text-2xl font-black text-center mb-6 text-slate-800">蛋仔大冒險</h1>
        {authError && <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg border border-red-100 flex items-center gap-2"><AlertCircle size={16}/>{authError}</div>}
        <form onSubmit={handleAction} className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl outline-none border focus:border-yellow-400" required />
          <input type="password" placeholder="密碼 (6位以上)" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-3 bg-slate-50 rounded-xl outline-none border focus:border-yellow-400" required />
          <button className="w-full py-3 bg-yellow-400 text-white font-bold rounded-xl shadow-md active:scale-95 transition">{authMode === 'login' ? '登入' : '註冊'}</button>
        </form>
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={handleGuest} className="w-full py-3 border-2 border-slate-100 text-slate-500 font-bold rounded-xl active:scale-95 transition">訪客直接玩</button>
          <button onClick={() => setAuthMode(m => m === 'login' ? 'signup' : 'login')} className="text-xs text-center text-yellow-600 underline">{authMode === 'login' ? '註冊帳號' : '返回登入'}</button>
        </div>
      </div>
    </div>
  );

  if (!player) return <div className="min-h-screen bg-sky-50 flex items-center justify-center text-blue-500 font-bold">正在建立角色資料...</div>;

  const room = ROOMS[player.currentRoom] || ROOMS.start;
  const currentRewards = Array.isArray(player.familyRewards) ? player.familyRewards : [];
  const currentInventory = Array.isArray(player.inventory) ? player.inventory : [];

  return (
    <div className="min-h-screen bg-sky-50 p-4 font-sans select-none flex flex-col items-center">
      <div className="w-full max-w-md bg-white rounded-2xl p-4 mb-4 flex justify-between items-center shadow-sm">
        <div className="flex gap-3 text-xs font-bold">
          <span className="flex items-center gap-1"><Heart size={14} className="text-red-500"/> {player.hp}</span>
          <span className="flex items-center gap-1"><Coins size={14} className="text-yellow-500"/> {player.gold}</span>
        </div>
        <button onClick={() => { signOut(auth); setPlayer(null); }} className="text-slate-400 hover:text-red-500"><LogOut size={18}/></button>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg overflow-hidden min-h-[500px] relative flex flex-col border-4 border-white">
        {isSaving && <div className="absolute top-2 right-2 text-[10px] text-blue-300 font-bold animate-pulse">SAVING...</div>}

        {player.role === 'parent' ? (
          <div className="p-6 bg-indigo-50 flex-1">
            <h2 className="font-black text-indigo-600 mb-4">家長設定</h2>
            <div className="space-y-2 mb-4">
              <input type="text" placeholder="獎勵名稱" value={rewardInput.name} onChange={e=>setRewardInput({...rewardInput, name: e.target.value})} className="w-full p-2 rounded-lg" />
              <div className="flex gap-2">
                <input type="number" placeholder="金額" value={rewardInput.cost} onChange={e=>setRewardInput({...rewardInput, cost: +e.target.value})} className="flex-1 p-2 rounded-lg" />
                <button onClick={() => { 
                  updateRewards([...currentRewards, {...rewardInput, id: Date.now()}]); setRewardInput({name:'', cost:100}); 
                }} className="bg-indigo-500 text-white px-4 rounded-lg"><Plus/></button>
              </div>
            </div>
            <div className="space-y-2 overflow-auto h-[300px]">
              {currentRewards.map(r => (
                <div key={r.id} className="flex justify-between bg-white p-3 rounded-lg">
                  <span>{r.name} (${r.cost})</span>
                  <button onClick={() => updateRewards(currentRewards.filter(i=>i.id!==r.id))}><Trash2 size={16}/></button>
                </div>
              ))}
              {currentRewards.length === 0 && <div className="text-center text-slate-300 py-10">尚無獎勵，請新增</div>}
            </div>
            <button onClick={() => saveToCloud({...player, role: 'student'})} className="mt-4 w-full py-3 bg-white text-indigo-600 font-bold rounded-xl">回學生模式</button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {gameState === 'explore' && (
              <div className="p-6 flex-1">
                <h2 className="text-2xl font-black mb-2 flex items-center gap-2"><MapIcon className="text-yellow-500"/> {room.name}</h2>
                <p className="text-sm text-slate-400 mb-6">{room.description}</p>
                
                <div className="space-y-3">
                  {/* --- 年級與難度選擇 --- */}
                  {room.type === 'battle' && (
                    <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 shadow-inner">
                      <div className="grid grid-cols-4 gap-1.5 mb-6">
                        {GRADES.map(g => (
                          <button key={g} onClick={() => setSelectedGrade(g)} className={`py-1.5 rounded-lg text-[10px] font-black transition ${selectedGrade === g ? 'bg-yellow-400 text-white shadow-md' : 'bg-white text-slate-400 border border-slate-100'}`}>{g}</button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <button onClick={() => startChallenge(room.subject, 'simple')} className="py-3 bg-green-400 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition">簡易</button>
                        <button onClick={() => startChallenge(room.subject, 'normal')} className="py-3 bg-orange-400 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition">普通</button>
                        <button onClick={() => startChallenge(room.subject, 'hard')} className="py-3 bg-red-400 text-white rounded-xl font-black text-xs shadow-md active:scale-95 transition">困難</button>
                      </div>
                      <button onClick={() => startChallenge(room.subject, 'reflection')} className="w-full py-3 bg-indigo-500 text-white rounded-xl font-black text-xs flex items-center justify-center gap-2"><History size={14}/> 反省區 ({player.wrongQuestions?.[room.subject]?.[selectedGrade]?.length || 0})</button>
                    </div>
                  )}
                  
                  {room.type === 'family' && (
                    <div className="space-y-3">
                      <div className="flex gap-2 bg-slate-50 p-2 rounded-xl">
                        <input type="text" placeholder="顯示用的家長信箱" value={player.parentEmail} onChange={e=>saveToCloud({...player, parentEmail: e.target.value})} className="flex-1 bg-transparent outline-none text-xs" />
                        <LinkIcon size={16} className="text-slate-400"/>
                      </div>
                      <div className="space-y-2 overflow-auto max-h-[250px] pr-1">
                        {currentRewards.length === 0 ? <div className="p-10 text-center text-slate-300 italic text-xs border-2 border-dashed rounded-3xl">請切換至家長模式設定獎勵</div> : currentRewards.map(r => (
                          <div key={r.id} className="w-full py-3 bg-white border-2 border-pink-50 rounded-xl flex justify-between px-4 items-center">
                            <div><div className="font-bold text-slate-700">{r.name}</div><div className="text-xs text-pink-400 font-black">${r.cost}</div></div>
                            <button onClick={() => {
                              if(player.gold >= r.cost) { saveToCloud({...player, gold: player.gold-r.cost}); notify('兌換成功','success'); }
                              else notify('金幣不足','error');
                            }} className="bg-pink-400 text-white px-4 py-1.5 rounded-lg text-xs font-black shadow-md active:scale-95">兌換</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                    {(room.exits || []).map(id => (
                      <button key={id} onClick={() => saveToCloud({...player, currentRoom: id})} className="py-3 bg-slate-50 rounded-xl font-bold text-slate-500 text-xs active:scale-95 transition">
                        {ROOMS[id]?.name || id}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {gameState === 'quiz' && (
              <div className="p-6 flex-1 bg-sky-50 animate-in slide-in-from-right">
                <div className="flex justify-between mb-6 font-bold text-slate-400">
                  <span>Q{quizIndex+1}</span>
                  <span className="text-red-500">{timer}s</span>
                </div>
                <div className="bg-white p-8 rounded-3xl text-center font-black text-xl mb-6 shadow-sm">
                  {quizQueue[quizIndex]?.q}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(quizQueue[quizIndex]?.options || []).map((opt, i) => (
                    <button key={i} onClick={() => answer(opt)} className="py-4 bg-white rounded-xl font-bold shadow-sm active:scale-95 transition">{opt}</button>
                  ))}
                </div>
              </div>
            )}

            {gameState === 'summary' && (
              <div className="p-6 flex-1 flex flex-col items-center justify-center bg-white text-center animate-in zoom-in">
                <CheckCircle2 size={64} className="text-green-500 mb-4"/>
                <h2 className="text-2xl font-black mb-6">挑戰完成</h2>
                <div className="grid grid-cols-2 gap-4 w-full mb-8">
                  <div className="bg-slate-50 p-4 rounded-xl font-bold">正確 {results.correct}</div>
                  <div className="bg-slate-50 p-4 rounded-xl font-bold text-yellow-600">金幣 +{results.gold}</div>
                </div>
                <button onClick={() => {
                  saveToCloud({...player, gold: player.gold + results.gold});
                  setGameState('explore');
                }} className="w-full py-4 bg-yellow-400 text-white font-black rounded-xl shadow-lg active:scale-95 transition">領取獎勵</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2 w-full max-w-md">
        <button onClick={() => saveToCloud({...player, role: player.role==='student'?'parent':'student'})} className="p-2 bg-white rounded-full shadow-sm text-slate-400 mr-auto"><Settings size={16}/></button>
        
        <div className="flex gap-2 items-center bg-white px-4 py-2 rounded-full shadow-sm">
           {currentInventory.length === 0 ? <span className="text-xs text-slate-300">無道具</span> : currentInventory.map((i, idx) => (
             <div key={idx} className="bg-slate-100 p-1 rounded-full"><Shield size={12} className="text-indigo-400"/></div>
           ))}
        </div>
      </div>

      {message && <div className="fixed bottom-10 bg-slate-800 text-white px-6 py-2 rounded-full text-sm font-bold animate-bounce">{message.text}</div>}
    </div>
  );
};

export default App;