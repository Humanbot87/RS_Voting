import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, 
  Edit2, FileSpreadsheet, Upload, X, Info, Youtube, ExternalLink, Clock,
  FileText, ClipboardCheck, Save, ListPlus, Paperclip, Download, File, Key, Lock
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ====================================================================================
// ⚠️ DEINE DATENBANK-VERBINDUNG ⚠️
// ====================================================================================
const MY_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9sGsbG9WAQfp9xoEqOhzp_IDgMuwOYmE",
  authDomain: "ruesssuuger-voting.firebaseapp.com",
  projectId: "ruesssuuger-voting",
  storageBucket: "ruesssuuger-voting.firebasestorage.app",
  messagingSenderId: "737751466538",
  appId: "1:737751466538:web:4fe3f376738accc352f953"
};
// ====================================================================================

const isPreviewEnvironment = typeof __firebase_config !== 'undefined';
const firebaseConfig = isPreviewEnvironment && __firebase_config ? JSON.parse(__firebase_config) : MY_FIREBASE_CONFIG;
const isConfigured = isPreviewEnvironment || (firebaseConfig.apiKey !== "DEIN_API_KEY" && !!firebaseConfig.apiKey);

let app, auth, db;
let firebaseInitError = null;

try {
  if (isConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase Init Error:", e);
  firebaseInitError = e.message;
}

const appId = (typeof __app_id !== 'undefined' ? __app_id : 'ruesssuuger-app').replace(/[^a-zA-Z0-9_-]/g, '-');

const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder', 'Musik'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];
const BOARD_ROLES = ['Präsident', 'Vizepräsident', 'Tambourmajor', 'Aktuar', 'Kassier', 'Sujetchefin', 'Tourmanagerin'];

const INITIAL_USERS = [
  { id: '1', firstName: 'Admin', lastName: 'Suuger', role: 'admin', groups: ['Vorstand', 'Aktive'], password: "" },
];

export default function App() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events');
  const [fbUser, setFbUser] = useState(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [permissionsError, setPermissionsError] = useState(null);
  const [isDBReady, setIsDBReady] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  if (firebaseInitError) {
    return <FatalErrorScreen message={`Kritischer Fehler beim Starten von Firebase: ${firebaseInitError}`} />;
  }

  if (!isConfigured) return <SetupScreen />;

  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        console.error("Auth Error:", err); 
        setAuthError(err.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
        setFbUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!fbUser || !db) return;
    setPermissionsError(null);
    let unsubUsers = () => {};
    let unsubEvents = () => {};
    let unsubMinutes = () => {};
    let unsubSessions = () => {};

    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
      const minutesRef = collection(db, 'artifacts', appId, 'public', 'data', 'minutes');
      const sessionsRef = collection(db, 'artifacts', appId, 'public', 'data', 'active_sessions');

      unsubUsers = onSnapshot(usersRef, (snap) => {
          setUsers(snap.docs.map(d => d.data()));
          setIsDBReady(true);
        }, (err) => {
          if (err.code === 'permission-denied') setPermissionsError("Fehlende Berechtigungen.");
        }
      );
      unsubEvents = onSnapshot(eventsRef, (snap) => {
          setEvents(snap.docs.map(d => d.data()));
          setIsDBReady(true);
        }, (err) => {
          console.error("Event Sync Error:", err);
        }
      );
      unsubMinutes = onSnapshot(minutesRef, (snap) => {
          setMinutes(snap.docs.map(d => d.data()));
        }
      );
      unsubSessions = onSnapshot(sessionsRef, (snap) => {
          setActiveSessions(snap.docs.map(d => d.data()));
      });

    } catch (err) { console.error(err); }
    return () => { unsubUsers(); unsubEvents(); unsubMinutes(); unsubSessions(); };
  }, [fbUser]); 

  useEffect(() => {
      let timer;
      if (isDBReady && fbUser) {
          if (fbUser.displayName && !currentUser) {
              const savedUser = users.find(u => u.id === fbUser.displayName);
              if (savedUser) setCurrentUser(savedUser);
          }
          timer = setTimeout(() => setIsCheckingSession(false), 1200);
      }
      return () => clearTimeout(timer);
  }, [isDBReady, fbUser, users, currentUser]); 

  useEffect(() => {
    if (!currentUser || !db || !fbUser) return;
    const updateSession = async () => {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id), {
            id: currentUser.id,
            lastSeen: Date.now()
        });
      } catch (e) { console.error("Session heartbeat error", e); }
    };
    updateSession();
    const interval = setInterval(updateSession, 45000); 
    const handleUnload = () => {
        deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUser, fbUser]);

  const handleLogin = async (foundUser) => {
      setCurrentUser(foundUser);
      if (fbUser) await updateProfile(fbUser, { displayName: foundUser.id });
  };

  const handleLogout = async () => {
    if (currentUser) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id));
    }
    setCurrentUser(null);
    setActiveTab('events');
    if (fbUser) await updateProfile(fbUser, { displayName: "" });
  };

  const seedDatabase = async () => {
    if (!fbUser) return alert("Warte auf Verbindung...");
    setIsSeeding(true);
    try {
      for (const u of INITIAL_USERS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
    } catch (err) { alert(`Fehler: ${err.message}`); }
    setIsSeeding(false);
  };

  if (authError || permissionsError) return <FatalErrorScreen message={authError || permissionsError} />;

  if (!fbUser || !isDBReady || isCheckingSession) {
     return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
           <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
              <div className="flex flex-col items-center text-center">
                 <h1 className="text-5xl sm:text-7xl font-black tracking-tighter mb-1">
                    <span className="text-gray-400 drop-shadow-lg">Rüss</span><span className="text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)]">Suuger</span>
                 </h1>
                 <span className="text-gray-400 text-xl font-bold uppercase tracking-[0.3em] drop-shadow-md">Ämme</span>
              </div>
              <div className="flex items-center gap-3 mt-8">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
              </div>
           </div>
        </div>
     );
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} activeSessions={activeSessions} onSeed={seedDatabase} isSeeding={isSeeding} db={db} appId={appId} />;

  const isBoardMember = (currentUser.groups || []).includes('Vorstand');

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight leading-tight cursor-default">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
                <span className="text-gray-400 font-medium ml-1">Ämme</span>
              </h1>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest -mt-0.5 ml-0.5">Voting App</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{currentUser.firstName} {currentUser.lastName}</p>
              <p className="text-xs text-gray-500">{currentUser.role === 'admin' ? 'Administrator' : 'Mitglied'}</p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-orange-500"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <nav className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={18} />} label="Events" />
          <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
          {isBoardMember && <TabButton active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} icon={<FileText size={18} />} label="Protokolle" />}
          {currentUser.role === 'admin' && <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Stammdaten" />}
        </nav>

        {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived && (!e.endDate || new Date(e.endDate) > new Date()))} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
        {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived || (e.endDate && new Date(e.endDate) <= new Date()))} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
        {activeTab === 'minutes' && isBoardMember && <MinutesView minutes={minutes} users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
        {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${active ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/10' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}>
      {icon} {label}
    </button>
  );
}

// --- LOGIN SCREEN ---
function LoginScreen({ onLogin, users, activeSessions, onSeed, isSeeding, db, appId }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step, setStep] = useState('name'); // 'name', 'password', 'setup'
  const [password, setPassword] = useState('');
  const [tempUser, setTempUser] = useState(null);

  const checkName = (e) => {
    e.preventDefault();
    const user = users.find(u => 
      (u.firstName || '').toLowerCase() === firstName.trim().toLowerCase() && 
      (u.lastName || '').toLowerCase() === lastName.trim().toLowerCase()
    );

    if (!user) return alert("Mitglied nicht gefunden.");

    const session = activeSessions.find(s => s.id === user.id);
    if (session && (Date.now() - session.lastSeen < 60000)) {
        return alert("Diese Person ist bereits angemeldet.");
    }

    const isBoard = (user.groups || []).includes('Vorstand');
    if (isBoard) {
        setTempUser(user);
        if (!user.password) setStep('setup');
        else setStep('password');
    } else {
        onLogin(user);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password === tempUser.password) {
        onLogin(tempUser);
    } else {
        alert("Passwort falsch.");
    }
  };

  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return alert("Das Passwort muss mindestens 4 Zeichen lang sein.");
    const updatedUser = { ...tempUser, password: password };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', tempUser.id), updatedUser);
    onLogin(updatedUser);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-orange-500"></div>
        <div className="flex flex-col items-center mb-10 mt-4">
            <h1 className="text-4xl font-black mb-1 tracking-tighter"><span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span></h1>
            <span className="text-gray-400 text-sm font-bold uppercase tracking-[0.3em]">Ämme</span>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-6">
            <Database className="mx-auto text-gray-700 mb-4" size={48} />
            <h3 className="text-white font-medium mb-2">Datenbank einrichten</h3>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-xl mt-4">Vereinsdaten laden</button>
          </div>
        ) : (
          <>
            {step === 'name' && (
              <form onSubmit={checkName} className="space-y-4">
                <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" />
                <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" />
                <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-2xl mt-4 transition-all">Anmelden</button>
              </form>
            )}

            {step === 'password' && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-3 mb-4 p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl text-orange-400">
                    <Lock size={20} /> <span className="text-xs font-bold uppercase">Vorstand Login erforderlich</span>
                </div>
                <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Dein Vorstand-Passwort" className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors text-center tracking-widest" />
                <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-2xl mt-4 transition-all">Entsperren</button>
                <button type="button" onClick={() => setStep('name')} className="w-full text-gray-500 text-xs font-bold uppercase tracking-widest mt-4">Zurück</button>
              </form>
            )}

            {step === 'setup' && (
              <form onSubmit={handleSetupSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="flex items-center gap-3 mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-400">
                    <ShieldAlert size={20} /> <div><span className="text-xs font-bold block uppercase">Passwort einrichten</span><span className="text-[10px] opacity-70">Wähle ein Passwort für den Vorstandszugriff.</span></div>
                </div>
                <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Neues Passwort wählen" className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors text-center tracking-widest" />
                <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-2xl mt-4 transition-all">Passwort speichern & Login</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- PROTOKOLLE ---
function MinutesView({ minutes, users, dbAppId, db, fbUser }) {
  const [editingMinute, setEditingMinute] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSave = async (data) => {
    if (!fbUser) return;
    const id = data.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'minutes', id), { ...data, id });
    setIsCreating(false);
    setEditingMinute(null);
  };

  const handleDelete = async (id) => {
    if (confirm('Protokoll löschen?')) await deleteDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'minutes', id));
  };

  if (isCreating || editingMinute) {
    return <MinutesForm initialData={editingMinute} boardMembers={users.filter(u => (u.groups || []).includes('Vorstand'))} onSave={handleSave} onCancel={() => { setIsCreating(false); setEditingMinute(null); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white tracking-tight">Sitzungsprotokolle</h2><button onClick={() => setIsCreating(true)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all"><Plus size={18} /> Neue Sitzung</button></div>
      {minutes.length === 0 ? (<div className="text-center py-16 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800"><FileText size={48} className="mx-auto text-gray-700 mb-4" /><p className="text-gray-500">Noch keine Protokolle erfasst.</p></div>) : (
        <div className="grid gap-4">{minutes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(m => (
            <div key={m.id} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl flex justify-between items-center group hover:border-orange-500/30 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-950 rounded-xl flex items-center justify-center text-orange-500 border border-gray-800"><Calendar size={20} /></div>
                <div><h3 className="text-lg font-bold text-white">Sitzung vom {new Date(m.date).toLocaleDateString('de-CH')}</h3><p className="text-xs text-gray-500 uppercase font-black tracking-widest mt-1">Vorstandssitzung</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingMinute(m)} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition-all"><Edit2 size={18} /></button>
                <button onClick={() => handleDelete(m.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}</div>
      )}
    </div>
  );
}

function MinutesForm({ initialData, boardMembers, onSave, onCancel }) {
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState(initialData?.attendance || {});
  const [agenda, setAgenda] = useState(() => {
    const base = BOARD_ROLES.reduce((acc, role) => ({ ...acc, [role]: [] }), {});
    if (initialData?.agenda) {
      Object.keys(initialData.agenda).forEach(role => {
        const val = initialData.agenda[role];
        base[role] = Array.isArray(val) ? val.map(p => typeof p === 'string' ? { text: p, files: [] } : p) : [];
      });
    }
    return base;
  });

  const [newPoints, setNewPoints] = useState(BOARD_ROLES.reduce((acc, role) => ({ ...acc, [role]: '' }), {}));
  const [editingPoint, setEditingPoint] = useState({ role: null, index: null, text: '' });
  const fileInputRef = useRef(null);
  const [uploadingFor, setUploadingFor] = useState({ role: null, index: null });

  const toggleAttendance = (userId) => setAttendance(prev => ({ ...prev, [userId]: !prev[userId] }));
  const handleNewPointChange = (role, val) => setNewPoints(prev => ({ ...prev, [role]: val }));
  const addPoint = (role) => { const text = newPoints[role].trim(); if (!text) return; setAgenda(prev => ({ ...prev, [role]: [...(prev[role] || []), { text, files: [] }] })); setNewPoints(prev => ({ ...prev, [role]: '' })); };
  const removePoint = (role, index) => setAgenda(prev => ({ ...prev, [role]: prev[role].filter((_, i) => i !== index) }));
  const startEditing = (role, index, text) => setEditingPoint({ role, index, text });
  const saveEdit = () => { const { role, index, text } = editingPoint; if (!role || index === null || !text.trim()) { setEditingPoint({ role: null, index: null, text: '' }); return; } setAgenda(prev => ({ ...prev, [role]: prev[role].map((p, i) => i === index ? { ...p, text: text.trim() } : p) })); setEditingPoint({ role: null, index: null, text: '' }); };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    const { role, index } = uploadingFor;
    if (!file || !role || index === null) return;
    if (file.size > 800 * 1024) return alert("Datei zu gross (max 800KB).");
    const reader = new FileReader();
    reader.onload = (ev) => {
        setAgenda(prev => ({ ...prev, [role]: prev[role].map((p, i) => i === index ? { ...p, files: [...(p.files || []), { name: file.name, type: file.type, data: ev.target.result }] } : p) }));
        setUploadingFor({ role: null, index: null });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeFile = (role, pointIndex, fileIndex) => setAgenda(prev => ({ ...prev, [role]: prev[role].map((p, i) => i === pointIndex ? { ...p, files: p.files.filter((_, fi) => fi !== fileIndex) } : p) }));
  const downloadFile = (file) => { const link = document.createElement('a'); link.href = file.data; link.download = file.name; document.body.appendChild(link); link.click(); document.body.removeChild(link); };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ id: initialData?.id, date, attendance, agenda }); }} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4"><button type="button" onClick={onCancel} className="text-gray-400 hover:text-white bg-gray-900 p-2 rounded-lg border border-gray-800 transition-all"><ChevronRight className="rotate-180" size={20} /></button><h2 className="text-2xl font-bold text-white tracking-tight">{initialData ? 'Protokoll bearbeiten' : 'Neue Sitzung'}</h2></div>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-black px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg"><Save size={18} /> Protokoll speichern</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Datum</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 focus:outline-none transition-all" />
          </div>
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2"><ClipboardCheck size={16} className="text-orange-500" /> Anwesenheit</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {boardMembers.map(m => (
                <div key={m.id} onClick={() => toggleAttendance(m.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${attendance[m.id] ? 'bg-orange-500/10 border-orange-500/30' : 'bg-gray-950 border-gray-800 opacity-60 hover:opacity-100'}`}>
                  <span className="text-sm font-bold text-white">{m.firstName} {m.lastName}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${attendance[m.id] ? 'bg-orange-500 border-orange-500' : 'border-gray-700'}`}>{attendance[m.id] && <Check size={12} className="text-gray-950 stroke-[4]" />}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-xl">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2"><FileText size={16} className="text-orange-500" /> Traktanden</h3>
            <div className="space-y-8">
              {BOARD_ROLES.map(role => (
                <div key={role} className="space-y-4 pb-6 border-b border-gray-800 last:border-0">
                  <label className="block text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] ml-1">{role}</label>
                  <div className="space-y-3">
                    {(agenda[role] || []).map((point, idx) => (
                      <div key={idx} className="flex flex-col gap-3 p-4 bg-gray-950 border border-gray-800 rounded-xl group hover:border-gray-700 transition-all">
                        {editingPoint.role === role && editingPoint.index === idx ? (
                          <div className="flex gap-2"><textarea autoFocus value={editingPoint.text} onChange={e => setEditingPoint({...editingPoint, text: e.target.value})} className="flex-1 bg-gray-900 border border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all resize-none" rows={2} /><div className="flex flex-col gap-1"><button type="button" onClick={saveEdit} className="p-2 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/30 transition-all"><Check size={16}/></button><button type="button" onClick={() => setEditingPoint({ role: null, index: null, text: '' })} className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-all"><X size={16}/></button></div></div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-start gap-3"><div className="w-1.5 h-1.5 rounded-full bg-orange-500/50 mt-1.5 shrink-0"></div><p className="text-sm text-gray-300 flex-1 whitespace-pre-wrap">{point.text}</p>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all"><button type="button" onClick={() => { setUploadingFor({role, index: idx}); fileInputRef.current?.click(); }} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg" title="Datei anhängen"><Paperclip size={16} /></button><button type="button" onClick={() => startEditing(role, idx, point.text)} className="p-1.5 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg" title="Bearbeiten"><Edit2 size={16} /></button><button type="button" onClick={() => removePoint(role, idx)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg" title="Löschen"><Trash2 size={16} /></button></div>
                            </div>
                            {point.files && point.files.length > 0 && (<div className="flex flex-wrap gap-2 ml-4">{point.files.map((file, fi) => (<div key={fi} className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg group/file"><File size={12} className="text-orange-500/70" /><span className="text-[10px] text-gray-400 font-medium truncate max-w-[100px]">{file.name}</span><div className="flex gap-1"><button type="button" onClick={() => downloadFile(file)} className="p-1 text-gray-500 hover:text-blue-400 transition-colors"><Download size={12}/></button><button type="button" onClick={() => removeFile(role, idx, fi)} className="p-1 text-gray-500 hover:text-red-500 transition-colors"><X size={12}/></button></div></div>))}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2"><input type="text" value={newPoints[role]} onChange={e => handleNewPointChange(role, e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addPoint(role))} placeholder="Neuer Punkt..." className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none transition-all" /><button type="button" onClick={() => addPoint(role)} className="bg-gray-800 hover:bg-gray-700 text-orange-500 p-2.5 rounded-xl transition-all"><ListPlus size={20} /></button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

// --- MITGLIEDER ---
function MembersView({ users, dbAppId, db, fbUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const fileInputRef = useRef(null);

  const handleAddUser = async (user) => { if (!fbUser) return; await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', Date.now().toString()), { ...user, id: Date.now().toString() }); setShowAdd(false); };
  const handleUpdateUser = async (user) => { if (!fbUser) return; await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', user.id), user); setEditingUser(null); };
  const removeUser = async (id) => { if (!fbUser || !confirm('Löschen?')) return; await deleteDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', id)); };
  
  const resetPassword = async (user) => {
    if (!confirm(`Passwort für ${user.firstName} ${user.lastName} zurücksetzen? Die Person muss beim nächsten Login ein neues setzen.`)) return;
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', user.id), { ...user, password: "" });
    alert("Passwort wurde zurückgesetzt.");
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = async (e) => {
      const rows = e.target.result.split(/\r?\n/).filter(row => row.trim() !== '');
      const imported = rows.map((row, index) => {
        const columns = row.split(/[;,]/).map(col => col.trim()); if (columns.length < 2) return null;
        const matched = GROUPS.filter(g => columns[2]?.toLowerCase().includes(g.toLowerCase()));
        return { id: `import-${Date.now()}-${index}`, firstName: columns[0], lastName: columns[1], role: 'member', groups: matched.length > 0 ? matched : [], password: "" };
      }).filter(Boolean);
      if (confirm(`${imported.length} importieren?`)) { for (const m of imported) await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', m.id), m); setShowImport(false); }
    };
    reader.readAsText(file); event.target.value = "";
  };
  return (
    <div className="space-y-6"><div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white tracking-tight">Stammdaten</h2><div className="flex gap-2"><button onClick={() => setShowImport(!showImport)} className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"><FileSpreadsheet size={18} /> Import</button><button onClick={() => { setShowAdd(!showAdd); setEditingUser(null); }} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-4 py-2 rounded-lg transition-all">{showAdd ? 'Abbrechen' : <><UserPlus size={18} /> Hinzufügen</>}</button></div></div>
      {showImport && (<div className="bg-gray-900 border-2 border-dashed border-gray-700 p-8 rounded-2xl text-center animate-in fade-in slide-in-from-top-2 duration-300"><Upload className="mx-auto text-orange-500 mb-4" size={40} /><h3 className="text-white font-bold text-lg mb-2">CSV Import</h3><input type="file" ref={fileInputRef} accept=".csv" onChange={handleCsvUpload} className="hidden" /><button onClick={() => fileInputRef.current?.click()} className="bg-orange-500 text-gray-950 font-bold px-8 py-3 rounded-xl">Datei auswählen</button></div>)}
      {showAdd && <MemberForm onSubmit={handleAddUser} onCancel={() => setShowAdd(false)} />}{editingUser && <MemberForm initialData={editingUser} onSubmit={handleUpdateUser} onCancel={() => setEditingUser(null)} />}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl"><div className="overflow-x-auto scrollbar-hide"><table className="w-full text-left border-collapse"><thead><tr className="bg-gray-950 border-b border-gray-800 text-gray-500 text-[10px] font-bold uppercase tracking-wider"><th className="p-4">Name</th><th className="p-4">Rolle</th><th className="p-4">Gruppen</th><th className="p-4 text-right">Aktionen</th></tr></thead><tbody className="divide-y divide-gray-800/50">
        {users.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(u => (<tr key={u.id} className="hover:bg-black/20 transition-colors"><td className="p-4 text-white font-bold">{u.lastName} {u.firstName}</td><td className="p-4"><span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-widest ${u.role === 'admin' ? 'bg-orange-500/20 text-orange-500' : 'bg-gray-800/50 text-gray-500'}`}>{u.role}</span></td><td className="p-4"><div className="flex flex-wrap gap-1">{(u.groups || []).map(g => (<span key={g} className="text-[10px] bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-bold">{g}</span>))}</div></td>
                    <td className="p-4 text-right flex justify-end gap-1">
                        {(u.groups || []).includes('Vorstand') && (
                            <button onClick={() => resetPassword(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all" title="Passwort zurücksetzen"><Key size={18} /></button>
                        )}
                        <button onClick={() => setEditingUser(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all" title="Bearbeiten"><Edit2 size={18} /></button>
                        <button onClick={() => removeUser(u.id)} className="text-gray-500 hover:text-red-500 p-2 rounded-lg transition-all" title="Löschen"><Trash2 size={18} /></button>
                    </td></tr>))}
      </tbody></table></div></div></div>
  );
}

function MemberForm({ onSubmit, initialData, onCancel }) {
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [role, setRole] = useState(initialData?.role || 'member');
  const [selectedGroups, setSelectedGroups] = useState(initialData?.groups || []);
  const toggleGroup = (group) => setSelectedGroups(p => p.includes(group) ? p.filter(g => g !== group) : [...p, group]);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...initialData, firstName: firstName.trim(), lastName: lastName.trim(), role, groups: selectedGroups, password: initialData?.password || "" }); }} className="bg-gray-900 border-2 border-orange-500/10 p-6 rounded-2xl mb-8 shadow-2xl relative overflow-hidden">
      <h3 className="text-xl font-bold text-white mb-6 tracking-tight">{initialData ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"><input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none" /><input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6 border-t border-gray-800 pt-6"><div><label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Berechtigung</label><div className="bg-gray-950 border border-gray-800 p-1 rounded-xl"><select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-transparent px-3 py-2 text-white font-bold focus:ring-0 border-none outline-none"><option value="member" className="bg-gray-900">Standard Mitglied</option><option value="admin" className="bg-gray-900 text-orange-500">Administrator</option></select></div></div><div><label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Gruppen</label><div className="grid grid-cols-2 gap-2 bg-gray-950 border border-gray-800 p-4 rounded-xl">{GROUPS.map(g => (<label key={g} className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer hover:text-white transition-all"><input type="checkbox" checked={selectedGroups.includes(g)} onChange={() => toggleGroup(g)} className="w-4 h-4 accent-orange-500 rounded" />{g}</label>))}</div></div></div>
      <div className="flex justify-end gap-4 pt-4 border-t border-gray-800"><button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-bold uppercase text-[10px] tracking-widest transition-all">Abbrechen</button><button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-8 py-3 rounded-xl transition-all shadow-lg text-xs uppercase">{initialData ? 'Speichern' : 'Anlegen'}</button></div>
    </form>
  );
}

// --- EVENTS ---
function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db, fbUser, isAutoArchived }) {
  const [showCreate, setShowCreate] = useState(false); const [selectedEvent, setSelectedEvent] = useState(null); const getDbRef = (id) => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', id);
  const handleCreateEvent = async (n) => { if (!fbUser) return; const id = Date.now().toString(); await setDoc(getDbRef(id), { ...n, id, isArchived: false, surveys: [] }); setShowCreate(false); };
  const handleArchive = async (id, s) => { if (!fbUser) return; const e = events.find(ev => ev.id === id); if(e) await setDoc(getDbRef(id), { ...e, isArchived: s }); setSelectedEvent(null); };
  const handleDeleteEvent = async (id) => { if (!fbUser || !confirm('Löschen?')) return; await deleteDoc(getDbRef(id)); setSelectedEvent(null); };
  if (selectedEvent) { const evData = events.find(e => e.id === selectedEvent.id); if (!evData) return null; const isExp = evData.endDate && new Date(evData.endDate) <= new Date(); return <EventDetail event={evData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} fbUser={fbUser} isAutoArchived={isExp} />; }
  return (
    <div className="space-y-6"><div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white tracking-tight">{isArchive ? 'Archiv' : 'Aktuelle Events'}</h2>{!isArchive && currentUser.role === 'admin' && (<button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-4 py-2 rounded-lg transition-all">{showCreate ? 'Abbrechen' : <><Plus size={18} /> Neuer Event</>}</button>)}</div>
      {showCreate && <CreateEventForm onSubmit={handleCreateEvent} />}{events.length === 0 ? (<div className="text-center py-12 bg-gray-900/50 rounded-2xl border border-gray-800"><Calendar size={48} className="mx-auto text-gray-700 mb-4" /><p className="text-gray-500">Keine Events gefunden.</p></div>) : (<div className="grid gap-4 md:grid-cols-2">{events.map(e => { const isExp = e.endDate && new Date(e.endDate) <= new Date(); return (<div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl cursor-pointer hover:border-orange-500/50 transition-colors group active:scale-[0.98]"><div className="flex justify-between items-start mb-2"><div className="flex flex-wrap gap-2"><span className="text-[10px] font-bold text-orange-500 uppercase bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20">{e.category}</span>{(isExp && !e.isArchived) && <span className="text-[10px] font-bold text-red-500 uppercase bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20 flex items-center gap-1"><Clock size={10}/> Automatisch Archiviert</span>}</div><ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" /></div><h3 className="text-xl font-bold text-white mt-1 mb-4">{e.title}</h3><div className="flex justify-between text-xs text-gray-500 font-medium"><span className="flex items-center gap-1 font-bold"><Calendar size={14} className="text-orange-500" /> {new Date(e.date).toLocaleDateString('de-CH')}</span><span className="flex items-center gap-1 font-bold"><BarChart3 size={14} className="text-orange-500" /> {(e.surveys || []).length} Umfragen</span></div></div>); })}</div>)}
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const submit = (e) => { e.preventDefault(); const finalCategory = category === 'Freitext' ? customCategory.trim() : category; if (category === 'Freitext' && !finalCategory) return alert('Bitte eine eigene Kategorie eingeben.'); onSubmit({ title, category: finalCategory, date, endDate }); };
  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl mb-8 space-y-4 shadow-xl">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div><label className="block text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">Titel</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" /></div>
        <div><label className="block text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">Kategorie</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>{category === 'Freitext' && (<input type="text" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Name der Kategorie" className="w-full mt-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />)}</div>
        <div><label className="block text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">Event Datum</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" /></div>
        <div><label className="block text-xs text-gray-500 mb-1 font-bold uppercase tracking-wider">Ende (Archivierung)</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" /><p className="text-[9px] text-gray-600 mt-1 italic">Optional: Zeitgesteuerte Archivierung.</p></div>
      </div>
      <div className="flex justify-end pt-2"><button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-6 py-2 rounded-lg transition-all shadow-lg uppercase text-xs tracking-widest">Event Speichern</button></div>
    </form>
  );
}

function EventDetail({ event, onBack, currentUser, onArchive, onDelete, users, dbAppId, db, fbUser, isAutoArchived }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', event.id);
  const handleAddSurvey = async (newSurvey) => { if (!fbUser) return; const updatedSurveys = [...(event.surveys || []), { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }]; await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); setShowCreateSurvey(false); };
  const updateSurvey = async (surveyId, updates) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => s.id === surveyId ? { ...s, ...updates } : s); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  const handleVote = async (surveyId, selectedOptionIds) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => { if (s.id === surveyId) { const updatedOptions = s.options.map(opt => selectedOptionIds.includes(opt.id) ? { ...opt, votes: opt.votes + 1 } : opt); return { ...s, options: updatedOptions, votedUsers: [...(s.votedUsers || []), currentUser.id] }; } return s; }); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  const isActuallyArchived = event.isArchived || isAutoArchived;
  const surveys = event.surveys || [];
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"><div className="flex items-center gap-4"><button onClick={onBack} className="text-gray-400 hover:text-white bg-gray-900 p-2 rounded-lg border border-gray-800 transition-all active:scale-90"><ChevronRight className="rotate-180" size={20} /></button><div className="flex-1"><h2 className="text-2xl font-bold text-white tracking-tight">{event.title}</h2><div className="flex flex-wrap items-center gap-3"><p className="text-sm text-gray-500 font-bold uppercase tracking-wider">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>{isActuallyArchived && <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase px-2 py-0.5 rounded border border-orange-500/20">Archiviert</span>}</div></div></div>{currentUser.role === 'admin' && (<div className="flex gap-2"><button onClick={() => onArchive(event.id, !event.isArchived)} className="px-4 py-2 rounded-lg text-xs font-bold uppercase border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 flex items-center gap-2 transition-all"><Archive size={14} /> {event.isArchived ? 'Aktivieren' : 'Archivieren'}</button><button onClick={() => onDelete(event.id)} className="px-4 py-2 rounded-lg text-xs font-bold uppercase border bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 flex items-center gap-2 transition-all"><Trash2 size={14} /> Löschen</button></div>)}</div>
      {currentUser.role === 'admin' && !isActuallyArchived && (<div className="flex justify-end"><button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 mb-4 transition-colors shadow-lg active:scale-95 uppercase text-xs tracking-widest">{showCreateSurvey ? 'Abbrechen' : <><Plus size={18} /> Neue Umfrage</>}</button></div>)}
      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} isMusicMode={event.category === 'Liederwahl'} />}
      <div className="space-y-6">{surveys.length === 0 ? (<p className="text-gray-500 text-center py-12 bg-gray-900/50 rounded-2xl border border-dashed border-gray-800 font-bold uppercase text-[10px] tracking-widest">Keine Umfragen erfasst.</p>) : (surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(u) => updateSurvey(survey.id, u)} onVote={(o) => handleVote(survey.id, o)} users={users} isArchivedView={isActuallyArchived} />))}</div>
    </div>
  );
}

function CreateSurveyForm({ onSubmit, isMusicMode }) {
  const [title, setTitle] = useState('');
  const [maxAnswers, setMaxAnswers] = useState(1);
  const [allowedGroups, setAllowedGroups] = useState(GROUPS); 
  const [options, setOptions] = useState([{ id: '1', text: '', link: '' }, { id: '2', text: '', link: '' }]);
  const handleGroupToggle = (group) => setAllowedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  const handleOptionChange = (id, field, value) => setOptions(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  const addOption = () => { if (options.length < 10) setOptions([...options, { id: Date.now().toString(), text: '', link: '' }]); };
  const removeOption = (id) => { if (options.length > 2) setOptions(prev => prev.filter(o => o.id !== id)); };
  const submit = (e) => { e.preventDefault(); const validOptions = options.filter(o => o.text.trim() !== '').map((o, i) => ({ id: `o${i}-${Date.now()}`, text: o.text.trim(), link: o.link.trim(), votes: 0 })); if (validOptions.length < 2) return alert('Min. 2 Optionen.'); if (allowedGroups.length === 0) return alert('Bitte mindestens eine Gruppe wählen.'); onSubmit({ title, maxAnswers, allowedGroups, options: validOptions }); };
  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl mb-8 shadow-xl animate-in slide-in-from-top-4 duration-300">
      <h3 className="text-lg font-bold text-white mb-6 uppercase tracking-wider border-b border-gray-800 pb-3">Umfrage Details</h3>
      <div className="space-y-6">
        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1 ml-1 tracking-widest">Frage / Titel</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder={isMusicMode ? "Z.B. Welches Lied spielen wir?" : "Frage eingeben..."} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-orange-500 focus:outline-none transition-all font-bold" /></div>
        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-2 ml-1 tracking-widest">Antworten (Max. 10)</label><div className="space-y-3">{options.map((opt, i) => (<div key={opt.id} className="space-y-2 p-3 bg-gray-950 border border-gray-800 rounded-xl"><div className="flex gap-2"><input type="text" required value={opt.text} onChange={e => handleOptionChange(opt.id, 'text', e.target.value)} placeholder={isMusicMode ? "Name des Liedes" : `Option ${i + 1}`} className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500 text-sm focus:outline-none" /><button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 2} className="p-2 text-gray-600 hover:text-red-500 disabled:opacity-30 transition-all"><Trash2 size={20} /></button></div><div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 focus-within:border-orange-500 transition-all"><Youtube size={14} className="text-gray-600" /><input type="url" value={opt.link} onChange={e => handleOptionChange(opt.id, 'link', e.target.value)} placeholder="YouTube Link (optional)" className="flex-1 bg-transparent border-none text-[11px] text-gray-400 focus:ring-0 focus:outline-none" /></div></div>))}</div>{options.length < 10 && (<button type="button" onClick={addOption} className="text-orange-500 text-[10px] font-black uppercase tracking-widest mt-4 flex items-center gap-2 hover:text-orange-400 transition-all ml-1"><Plus size={16} className="bg-orange-500/10 rounded-full p-0.5"/> Weitere Option</button>)}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-gray-800 pt-6 mt-4"><div><label className="block text-[10px] font-black text-gray-500 uppercase mb-2 ml-1 tracking-widest">Max. Stimmen</label><input type="number" min="1" max="10" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-white focus:border-orange-500 transition-all font-bold focus:outline-none" /></div><div><label className="block text-[10px] font-black text-gray-500 uppercase mb-2 ml-1 tracking-widest">Wahlberechtigte</label><div className="grid grid-cols-2 gap-2 p-3 bg-gray-950 border border-gray-800 rounded-xl">{GROUPS.map(g => (<label key={g} className="text-[11px] text-gray-400 font-bold flex items-center gap-2 cursor-pointer hover:text-white transition-all"><input type="checkbox" checked={allowedGroups.includes(g)} onChange={() => handleGroupToggle(g)} className="w-3.5 h-3.5 accent-orange-500 rounded" />{g}</label>))}</div></div></div>
      </div>
      <div className="flex justify-end mt-8"><button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-black px-8 py-3 rounded-xl transition-all shadow-lg active:scale-95 uppercase text-xs tracking-widest">Umfrage speichern</button></div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users, isArchivedView }) {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const allowedGroups = survey.allowedGroups || [];
  const votedUsers = survey.votedUsers || [];
  const options = survey.options || [];
  const isEligible = currentUser.role === 'admin' || allowedGroups.some(g => (currentUser.groups || []).includes(g));
  const hasVoted = votedUsers.includes(currentUser.id);
  const totalVotes = options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
  const eligibleUsersCount = users.filter(u => allowedGroups.some(g => (u.groups || []).includes(g))).length;
  if (!isEligible && currentUser.role !== 'admin') return null; 
  if (currentUser.role !== 'admin' && survey.status === 'draft') return null;
  const max = survey.maxAnswers || 1;
  const toggleOption = (id) => { if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id)); else if (max === 1) setSelectedOptions([id]); else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]); };
  const showResults = survey.status === 'published' || currentUser.role === 'admin' || isArchivedView;
  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden transition-all shadow-md ${survey.status === 'active' && !isArchivedView ? 'border-orange-500/40 ring-1 ring-orange-500/10' : 'border-gray-800'}`}>
      <div className="p-5 border-b border-gray-800 bg-gray-900/50 flex flex-col sm:flex-row sm:justify-between items-start gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
             {survey.status === 'draft' && <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-bold uppercase tracking-widest">Entwurf</span>}
             {survey.status === 'active' && !isArchivedView && <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest flex items-center gap-1 border border-green-500/10"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Aktiv</span>}
             {(survey.status === 'published' || isArchivedView) && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded font-bold uppercase tracking-widest border border-orange-500/10">Abgeschlossen</span>}
             <span className="text-[10px] text-gray-600 font-black uppercase tracking-[0.1em] ml-1">{max === 1 ? 'Single Choice' : `Max. ${max} Stimmen`}</span>
          </div>
          <h4 className="text-xl font-bold text-white leading-tight">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 w-full sm:w-auto justify-between">
            {!isArchivedView && (<div className="flex gap-2">{survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-[10px] font-black uppercase tracking-widest bg-green-500 text-gray-950 px-4 py-2 rounded-lg flex items-center gap-2 transition-all active:scale-95"><CheckCircle2 size={14}/> Freigeben</button>}{survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-[10px] font-black uppercase tracking-widest bg-orange-500 hover:bg-orange-600 text-gray-950 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-orange-500/20"><Eye size={14}/> Beenden</button>}</div>)}
            <div className="text-[10px] text-gray-600 font-black uppercase tracking-wider flex items-center gap-2 bg-gray-950 px-2 py-1 rounded border border-gray-800"><Users size={12} className="text-orange-500" /> {votedUsers.length} / {eligibleUsersCount}</div>
          </div>
        )}
      </div>
      <div className="p-5">
        {showResults ? (
          <div className="space-y-3">
             {survey.status === 'active' && !isArchivedView && currentUser.role === 'admin' && (<div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-3"><AlertCircle className="text-blue-500 mt-0.5 flex-shrink-0" size={18} /><p className="text-[11px] text-blue-400 italic">Administratoren sehen die Resultate live.</p></div>)}
             {options.map(opt => { const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100); return (<div key={opt.id} className="relative w-full bg-black/20 border border-gray-800 rounded-xl overflow-hidden p-3 flex justify-between items-center group transition-all"><div className="absolute top-0 left-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} /><div className="relative z-10 flex items-center gap-3"><span className="font-bold text-sm text-white">{opt.text}</span>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gray-900 rounded-lg text-gray-500 hover:text-red-500 transition-colors shadow-lg border border-gray-800"><Youtube size={14} /></a>)}</div><span className="relative z-10 text-xs text-gray-500 font-black font-mono">{pct}% <span className="text-[10px] text-gray-700 ml-1">({opt.votes || 0})</span></span></div>); })}
          </div>
        ) : hasVoted ? (<div className="flex flex-col items-center justify-center py-8 text-center animate-in fade-in zoom-in duration-500"><div className="w-14 h-14 bg-green-500/10 text-green-500 rounded-2xl flex items-center justify-center mb-4 border border-green-500/10 shadow-[0_0_20px_rgba(34,197,94,0.1)]"><Check size={28} className="stroke-[3]" /></div><h5 className="text-xl font-bold text-white tracking-tight uppercase">Abgestimmt!</h5><p className="text-xs text-gray-600 mt-1 italic font-medium">Deine Stimme wurde gezählt.</p></div>) : (<div className="space-y-3">{options.map(opt => (<div key={opt.id} className="flex gap-2"><div onClick={() => toggleOption(opt.id)} className={`flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all active:scale-[0.99] ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg shadow-orange-500/5' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-700 hover:bg-black/20'}`}><div className={`w-5 h-5 flex items-center justify-center border-2 transition-all ${max > 1 ? 'rounded' : 'rounded-full'} ${selectedOptions.includes(opt.id) ? 'border-orange-500 bg-orange-500 text-gray-950' : 'border-gray-700'}`}>{selectedOptions.includes(opt.id) && <Check size={14} className="stroke-[4]" />}</div><span className="font-bold text-sm sm:text-base">{opt.text}</span></div>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-4 bg-gray-950 border border-gray-800 rounded-2xl flex items-center justify-center text-gray-600 hover:text-red-500 transition-all group group-hover:scale-110"><Youtube size={22} /></a>)}</div>))}<div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-800/50 mt-4"><p className="text-[10px] font-black text-gray-600 uppercase tracking-widest italic">{selectedOptions.length} / {max} Stimmen gewählt</p><button onClick={() => selectedOptions.length > 0 && onVote(selectedOptions)} disabled={selectedOptions.length === 0} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-950 font-black px-10 py-3.5 rounded-2xl transition-all shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-xs tracking-widest transition-all">Stimme jetzt abgeben</button></div></div>)}
      </div>
    </div>
  );
}

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4"><div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-2xl p-8 shadow-2xl text-center"><ShieldAlert className="mx-auto text-red-500 mb-4" size={48} /><h1 className="text-2xl font-bold text-white mb-2">Fehler</h1><p className="text-red-300 text-sm mb-6">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4"><div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-2xl p-8 shadow-2xl text-center"><Settings className="mx-auto text-orange-500 mb-4" size={48} /><h1 className="text-2xl font-bold text-white mb-2">Setup erforderlich</h1></div></div>); }
