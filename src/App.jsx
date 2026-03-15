import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, 
  Edit2, FileSpreadsheet, Upload, X, Info, Youtube, ExternalLink, Clock,
  FileText, ClipboardCheck, Save, ListPlus, Paperclip, Download, File, Key, Lock,
  Search, Package, FileOutput, LayoutGrid
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

const obfuscate = (str) => btoa(str || "");
const deobfuscate = (str) => {
    try { return atob(str || ""); } catch(e) { return ""; }
};

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
  const [showCreateModal, setShowCreateModal] = useState(false);

  // 1. Firebase Auth
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

  // 2. Realtime Sync
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
          if (err.code === 'permission-denied') setPermissionsError("Berechtigungsfehler.");
        }
      );
      unsubEvents = onSnapshot(eventsRef, (snap) => {
          setEvents(snap.docs.map(d => d.data()));
          setIsDBReady(true);
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

  // 3. Auto-Login & Heartbeat
  useEffect(() => {
      let timer;
      if (isDBReady && fbUser) {
          if (fbUser.displayName && !currentUser) {
              const savedUser = users.find(u => u.id === fbUser.displayName);
              if (savedUser) {
                  const session = activeSessions.find(s => s.id === savedUser.id);
                  const isBoard = (savedUser.groups || []).includes('Vorstand');
                  if (!isBoard || (session && Date.now() - session.lastSeen < 300000)) { 
                      setCurrentUser(savedUser);
                  }
              }
          }
          timer = setTimeout(() => setIsCheckingSession(false), 800);
      }
      return () => clearTimeout(timer);
  }, [isDBReady, fbUser, users, currentUser, activeSessions]); 

  useEffect(() => {
    if (!currentUser || !db || !fbUser) return;
    const updateSession = async () => {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id), {
            id: currentUser.id,
            lastSeen: Date.now()
        });
      } catch (e) { console.error("Heartbeat error", e); }
    };
    updateSession();
    const interval = setInterval(updateSession, 45000); 
    return () => clearInterval(interval);
  }, [currentUser, fbUser]);

  const handleLoginSuccess = async (foundUser) => {
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

  if (firebaseInitError) return <FatalErrorScreen message={`Firebase Fehler: ${firebaseInitError}`} />;
  if (authError || permissionsError) return <FatalErrorScreen message={authError || permissionsError} />;

  // Splash Screen
  if (!fbUser || !isDBReady || isCheckingSession) {
     return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
           <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
              <div className="flex flex-col items-center text-center">
                 <h1 className="text-6xl sm:text-7xl font-black tracking-tighter mb-1">
                    <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
                 </h1>
                 <span className="text-gray-400 text-xl font-bold uppercase tracking-[0.3em] mt-2">Ämme</span>
              </div>
              <div className="flex items-center gap-3 mt-12">
                <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"></div>
              </div>
           </div>
        </div>
     );
  }

  if (!currentUser) return <LoginScreen onLogin={handleLoginSuccess} users={users} activeSessions={activeSessions} onSeed={seedDatabase} isSeeding={isSeeding} db={db} appId={appId} deobfuscate={deobfuscate} obfuscate={obfuscate} />;

  const isBoardMember = (currentUser.groups || []).includes('Vorstand');
  const itemsCount = activeTab === 'events' ? events.filter(e => !e.isArchived).length : 
                     activeTab === 'archive' ? events.filter(e => e.isArchived).length :
                     activeTab === 'minutes' ? minutes.length : users.length;

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans selection:bg-orange-500 selection:text-white flex flex-col">
      {/* Header Bereich - Wie im Bild */}
      <header className="px-6 pt-10 pb-4">
        <div className="max-w-5xl mx-auto flex justify-between items-start">
          <div className="flex flex-col">
            <h1 className="text-4xl font-bold tracking-tight text-white leading-tight">
              RüssSuuger
            </h1>
            <p className="text-sm text-gray-500 font-medium">
              {itemsCount} {activeTab === 'events' ? 'Events' : activeTab === 'archive' ? 'Archiv' : activeTab === 'minutes' ? 'Protokolle' : 'Mitglieder'} total
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
             <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{activeSessions.length} aktiv</span>
             </div>
             <button onClick={handleLogout} className="text-gray-500 hover:text-orange-500 transition-colors">
                <LogOut size={20} />
             </button>
          </div>
        </div>
      </header>

      {/* Pillen-Navigation - Wie im Bild */}
      <div className="px-6 py-4 overflow-x-auto scrollbar-hide">
        <div className="max-w-5xl mx-auto flex gap-3">
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} label="EVENTS" />
          {isBoardMember && <TabButton active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} label="PROTOKOLLE" />}
          {currentUser.role === 'admin' && <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} label="STAMMDATEN" />}
          <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} label="ARCHIV" />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-6 pt-4 pb-24 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
          {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
          {activeTab === 'minutes' && isBoardMember && <MinutesView minutes={minutes} users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
          {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} fbUser={fbUser} deobfuscate={deobfuscate} obfuscate={obfuscate} />}
        </div>
      </main>

      {/* Bottom Nav Bar - Wie im Bild */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-gray-900 px-6 py-4 z-20">
        <div className="max-w-xl mx-auto flex justify-between items-center relative">
          <button onClick={() => setActiveTab('events')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'events' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Package size={22} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">INVENTAR</span>
          </button>
          
          <button onClick={() => setActiveTab('archive')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'archive' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Search size={22} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">SUCHE</span>
          </button>

          {/* Central Action Button */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-10">
            <button 
              onClick={() => setShowCreateModal(true)}
              className="bg-orange-500 text-black w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)] active:scale-95 transition-transform border-4 border-black"
            >
              <Plus size={32} strokeWidth={3} />
            </button>
          </div>

          <div className="w-12"></div> {/* Spacer for central button */}

          <button onClick={() => setActiveTab('minutes')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'minutes' ? 'text-orange-500' : 'text-gray-500'}`}>
            <LayoutGrid size={22} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">BOARD</span>
          </button>

          <button onClick={() => setActiveTab('members')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'members' ? 'text-orange-500' : 'text-gray-500'}`}>
            <FileOutput size={22} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">EXPORT</span>
          </button>
        </div>
      </footer>

      {/* Simple Creation Router for Central Button */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowCreateModal(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-3xl p-6 space-y-3 animate-in slide-in-from-bottom-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-4 text-center">Was möchtest du erstellen?</h3>
            <CreateOption icon={<Calendar />} label="Neuer Event" onClick={() => { setActiveTab('events'); setShowCreateModal(false); }} />
            {isBoardMember && <CreateOption icon={<FileText />} label="Neues Protokoll" onClick={() => { setActiveTab('minutes'); setShowCreateModal(false); }} />}
            {currentUser.role === 'admin' && <CreateOption icon={<UserPlus />} label="Neues Mitglied" onClick={() => { setActiveTab('members'); setShowCreateModal(false); }} />}
            <button onClick={() => setShowCreateModal(false)} className="w-full py-4 text-gray-500 font-bold uppercase text-xs tracking-widest pt-4 mt-2 border-t border-gray-800">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateOption({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 p-4 bg-gray-950 border border-gray-800 rounded-2xl hover:border-orange-500/50 transition-all group">
      <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-colors">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <span className="text-white font-bold">{label}</span>
    </button>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group min-w-[100px]">
      <div className={`px-5 py-2 rounded-full font-black text-[11px] tracking-widest transition-all ${active ? 'bg-orange-500 text-black' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
        {label}
      </div>
      {active && <div className="h-0.5 w-8 bg-orange-500 rounded-full"></div>}
    </button>
  );
}

// --- PLACEHOLDER ---
function EmptyPlaceholder({ message }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center opacity-60">
            <div className="w-24 h-24 border-2 border-gray-800 rounded-3xl flex items-center justify-center mb-6">
                <LayoutGrid size={40} className="text-gray-800" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Noch nix da.</h3>
            <p className="text-sm text-gray-500">{message || 'Drück den orangen Knopf.'}</p>
        </div>
    );
}

// --- LOGIN SCREEN ---
function LoginScreen({ onLogin, users, activeSessions, onSeed, isSeeding, db, appId, deobfuscate, obfuscate }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step, setStep] = useState('name'); 
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
    if (session && (Date.now() - session.lastSeen < 60000)) return alert("Account bereits aktiv.");

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
    if (password === deobfuscate(tempUser.password)) onLogin(tempUser);
    else alert("Passwort falsch.");
  };

  const handleSetupSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 4) return alert("Min. 4 Zeichen.");
    const updatedUser = { ...tempUser, password: obfuscate(password) };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', tempUser.id), updatedUser);
    onLogin(updatedUser);
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-12">
            <h1 className="text-6xl font-black mb-1 tracking-tighter leading-none">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
            <span className="text-gray-400 text-lg font-bold uppercase tracking-[0.4em] ml-2">Ämme</span>
        </div>

        <div className="bg-[#121212] border border-gray-900 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500"></div>
            {users.length === 0 ? (
                <div className="py-6 flex flex-col items-center">
                    <Database className="text-gray-700 mb-6" size={56} />
                    <h3 className="text-white font-bold text-xl mb-6 tracking-tight">Datenbank bereitstellen</h3>
                    <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 text-black font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-lg shadow-orange-500/20">Vereinsdaten laden</button>
                </div>
            ) : (
                <>
                {step === 'name' && (
                    <form onSubmit={checkName} className="space-y-5 text-left">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Vorname</label>
                            <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Max" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Nachname</label>
                            <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Muster" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors font-bold" />
                        </div>
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl mt-4 uppercase text-xs tracking-[0.2em] shadow-xl shadow-orange-500/10 active:scale-[0.98] transition-all">Anmelden</button>
                    </form>
                )}
                {step === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-6">
                        <div className="flex flex-col items-center gap-3 mb-2">
                            <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center text-orange-500">
                                <Lock size={32} />
                            </div>
                            <span className="text-[11px] font-black text-orange-500 uppercase tracking-widest">Vorstand Authentifizierung</span>
                        </div>
                        <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-orange-500 transition-colors text-center text-2xl tracking-[0.5em] font-black" />
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl uppercase text-xs tracking-[0.2em] shadow-lg active:scale-95 transition-all">Entsperren</button>
                        <button type="button" onClick={() => setStep('name')} className="text-gray-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors mt-2">Zurück</button>
                    </form>
                )}
                {step === 'setup' && (
                    <form onSubmit={handleSetupSubmit} className="space-y-6">
                        <div className="flex flex-col items-center gap-3">
                            <ShieldAlert size={40} className="text-blue-500" />
                            <div className="text-center"><span className="text-xs font-black block uppercase text-blue-400 mb-1">Passwort einrichten</span><span className="text-[10px] text-gray-500 italic block leading-tight">Als Vorstandsmitglied benötigst du ein individuelles Passwort.</span></div>
                        </div>
                        <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Neues Passwort" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-orange-500 transition-colors text-center font-bold" />
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl uppercase text-xs tracking-widest">Speichern & Weiter</button>
                    </form>
                )}
                </>
            )}
        </div>
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
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...data, id });
    setIsCreating(false);
    setEditingMinute(null);
  };

  const handleDelete = async (id) => {
    if (!fbUser || !confirm('Protokoll unwiderruflich löschen?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id));
  };

  if (isCreating || editingMinute) {
    return <MinutesForm initialData={editingMinute} boardMembers={users.filter(u => (u.groups || []).includes('Vorstand'))} onSave={handleSave} onCancel={() => { setIsCreating(false); setEditingMinute(null); }} />;
  }

  return (
    <div className="space-y-4">
      {minutes.length === 0 ? <EmptyPlaceholder message="Erfasse das erste Protokoll für den Vorstand." /> : (
        <div className="grid gap-3">{minutes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(m => (
            <div key={m.id} className="bg-[#121212] border border-gray-900 p-5 rounded-3xl flex justify-between items-center group hover:border-orange-500/30 transition-all shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center text-orange-500 border border-gray-900 group-hover:border-orange-500/20 transition-colors">
                  <FileText size={24} />
                </div>
                <div>
                   <h3 className="text-lg font-bold text-white leading-tight">Sitzung vom {new Date(m.date).toLocaleDateString('de-CH')}</h3>
                   <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">Interne Dokumentation</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditingMinute(m)} className="p-3 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-2xl transition-all" title="Bearbeiten"><Edit2 size={20} /></button>
                <button onClick={() => handleDelete(m.id)} className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all" title="Löschen"><Trash2 size={20} /></button>
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
        if (Array.isArray(val)) {
            base[role] = val.map(p => {
                if (typeof p === 'string') return { text: p, files: [] };
                return { text: p?.text || "", files: p?.files || [] };
            });
        }
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
    <form onSubmit={(e) => { e.preventDefault(); onSave({ id: initialData?.id, date, attendance, agenda }); }} className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500 pb-20">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-5">
            <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white bg-[#121212] p-4 rounded-[1.2rem] border border-gray-900 transition-all shadow-lg active:scale-90">
                <ChevronRight className="rotate-180" size={24} />
            </button>
            <h2 className="text-3xl font-black text-white tracking-tight leading-none">{initialData ? 'Sitzung bearbeiten' : 'Neue Sitzung'}</h2>
        </div>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-black px-8 py-4 rounded-[1.2rem] flex items-center gap-3 shadow-xl shadow-orange-500/20 uppercase text-xs tracking-widest active:scale-95 transition-all">
            <Save size={20} /> Protokoll speichern
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[2rem] shadow-xl">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 ml-2">Sitzungsdatum</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 focus:outline-none transition-all font-bold" />
          </div>
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[2rem] shadow-xl">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                <ClipboardCheck size={20} className="text-orange-500" /> Anwesenheit
            </h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {boardMembers.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(m => (
                <div key={m.id} onClick={() => toggleAttendance(m.id)} className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border ${attendance[m.id] ? 'bg-orange-500/10 border-orange-500/30 shadow-inner' : 'bg-black border-gray-900 opacity-60'}`}>
                  <span className="text-sm font-bold text-white">{m.firstName} {m.lastName}</span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${attendance[m.id] ? 'bg-orange-500 border-orange-500' : 'border-gray-700'}`}>
                    {attendance[m.id] && <Check size={14} className="text-black stroke-[4]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[2.5rem] shadow-xl text-left">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-8 flex items-center gap-3">
                <FileText size={20} className="text-orange-500" /> Traktanden
            </h3>
            <div className="space-y-10">
              {BOARD_ROLES.map(role => (
                <div key={role} className="space-y-4 pb-10 border-b border-gray-900 last:border-0 last:pb-0">
                  <label className="block text-[10px] font-black text-orange-500 uppercase tracking-[0.3em] ml-2">{role}</label>
                  <div className="space-y-3">
                    {(agenda[role] || []).map((point, idx) => (
                      <div key={idx} className="flex flex-col gap-4 p-5 bg-black border border-gray-900 rounded-[1.5rem] group hover:border-gray-800 transition-all shadow-lg">
                        {editingPoint.role === role && editingPoint.index === idx ? (
                          <div className="flex gap-2">
                             <textarea autoFocus value={editingPoint.text} onChange={e => setEditingPoint({...editingPoint, text: e.target.value})} className="flex-1 bg-gray-900 border border-orange-500/50 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none transition-all resize-none font-medium" rows={3} />
                             <div className="flex flex-col gap-2">
                                <button type="button" onClick={saveEdit} className="p-3 bg-green-500/20 text-green-500 rounded-xl hover:bg-green-500/30"><Check size={20}/></button>
                                <button type="button" onClick={() => setEditingPoint({ role: null, index: null, text: '' })} className="p-3 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500/30"><X size={20}/></button>
                             </div>
                          </div>
                        ) : (
                          <div className="space-y-3 text-left">
                            <div className="flex items-start gap-4">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0"></div>
                                <p className="text-sm text-gray-300 flex-1 whitespace-pre-wrap leading-relaxed font-medium">{point.text}</p>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button type="button" onClick={() => { setUploadingFor({role, index: idx}); fileInputRef.current?.click(); }} className="p-2.5 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl" title="Datei anhängen"><Paperclip size={18} /></button>
                                    <button type="button" onClick={() => startEditing(role, idx, point.text)} className="p-2.5 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl" title="Bearbeiten"><Edit2 size={18} /></button>
                                    <button type="button" onClick={() => removePoint(role, idx)} className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl" title="Löschen"><Trash2 size={18} /></button>
                                </div>
                            </div>
                            {point.files && point.files.length > 0 && (
                                <div className="flex flex-wrap gap-2 ml-5">
                                    {point.files.map((file, fi) => (
                                        <div key={fi} className="flex items-center gap-3 bg-[#121212] border border-gray-900 px-4 py-2 rounded-xl group/file shadow-sm hover:border-gray-700 transition-colors">
                                            <File size={14} className="text-orange-500/70" />
                                            <span className="text-[10px] text-gray-400 font-black truncate max-w-[120px] uppercase tracking-wider">{file.name}</span>
                                            <div className="flex gap-1">
                                                <button type="button" onClick={() => downloadFile(file)} className="p-1.5 text-gray-500 hover:text-orange-400 transition-colors"><Download size={14}/></button>
                                                <button type="button" onClick={() => removeFile(role, idx, fi)} className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"><X size={14}/></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-6">
                    <input type="text" value={newPoints[role]} onChange={e => handleNewPointChange(role, e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addPoint(role))} placeholder="Punkt hinzufügen..." className="flex-1 bg-black border border-gray-900 rounded-2xl px-6 py-4 text-sm text-white focus:border-orange-500 focus:outline-none transition-all shadow-inner font-bold" />
                    <button type="button" onClick={() => addPoint(role)} className="bg-gray-900 hover:bg-gray-800 text-orange-500 w-14 h-14 rounded-2xl transition-all shadow-lg flex items-center justify-center border border-gray-800 active:scale-90">
                        <Plus size={24} />
                    </button>
                  </div>
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
function MembersView({ users, dbAppId, db, fbUser, deobfuscate, obfuscate }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const fileInputRef = useRef(null);

  const handleAddUser = async (user) => { 
    if (!fbUser) return; 
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...user, id }); 
    setShowAdd(false); 
  };

  const handleUpdateUser = async (user) => { 
    if (!fbUser) return; 
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), user); 
    setEditingUser(null); 
  };

  const removeUser = async (id) => { 
    if (!fbUser || !confirm('Mitglied wirklich löschen?')) return; 
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id)); 
  };
  
  const resetPassword = async (user) => {
    if (!fbUser || !confirm(`Passwort für ${user.firstName} ${user.lastName} zurücksetzen?`)) return;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), { ...user, password: "" });
    alert("Passwort wurde zurückgesetzt.");
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = async (e) => {
      const text = e.target.result;
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
      const imported = rows.map((row, index) => {
        const columns = row.split(/[;,]/).map(col => col.trim()); if (columns.length < 2) return null;
        const matched = GROUPS.filter(g => (columns[2] || '').toLowerCase().includes(g.toLowerCase()));
        return { id: `import-${Date.now()}-${index}`, firstName: columns[0], lastName: columns[1], role: 'member', groups: matched.length > 0 ? matched : [], password: "" };
      }).filter(Boolean);
      for (const m of imported) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', m.id), m);
      setShowImport(false);
    };
    reader.readAsText(file); event.target.value = "";
  };

  if (showAdd || editingUser) {
      return <MemberForm onSubmit={editingUser ? handleUpdateUser : handleAddUser} initialData={editingUser} onCancel={() => { setShowAdd(false); setEditingUser(null); }} />;
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2">
            <button onClick={() => setShowImport(!showImport)} className="bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold px-5 py-3 rounded-2xl flex items-center gap-2 transition-colors border border-gray-800 shadow-lg">
                <FileSpreadsheet size={18} /> Import
            </button>
            <button onClick={() => setShowAdd(true)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-5 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-xl shadow-orange-500/10 active:scale-95">
                <UserPlus size={18} /> Neu
            </button>
        </div>
      </div>
      
      {showImport && (
        <div className="bg-[#121212] border border-gray-900 p-12 rounded-[2.5rem] text-center animate-in fade-in slide-in-from-top-4 duration-500 shadow-2xl">
            <div className="w-20 h-20 bg-orange-500/10 text-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Upload size={32} />
            </div>
            <h3 className="text-white font-black text-2xl mb-2 tracking-tight">CSV Mitglieder-Import</h3>
            <p className="text-gray-500 text-sm mb-10 max-w-sm mx-auto font-medium">Lade eine CSV-Datei mit Vorname, Nachname und Gruppe hoch.</p>
            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleCsvUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-orange-500 text-black font-black px-12 py-5 rounded-[1.5rem] shadow-xl shadow-orange-500/20 uppercase text-xs tracking-widest active:scale-95 transition-all">Datei auswählen</button>
        </div>
      )}

      {users.length === 0 ? <EmptyPlaceholder message="Keine Mitglieder in der Sektion gefunden." /> : (
        <div className="bg-[#121212] border border-gray-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
                <thead>
                <tr className="bg-black/50 border-b border-gray-900 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em]">
                    <th className="p-6">Name</th><th className="p-6">Rolle</th><th className="p-6">Sektionen</th><th className="p-6 text-right">Optionen</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-900">
                {users.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(u => (
                    <tr key={u.id} className="hover:bg-orange-500/[0.02] transition-colors group">
                    <td className="p-6 text-white font-bold">{u.lastName} {u.firstName}</td>
                    <td className="p-6">
                        <span className={`text-[10px] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest inline-flex items-center gap-2 ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-gray-900 text-gray-500'}`}>
                            {u.role}
                        </span>
                    </td>
                    <td className="p-6">
                        <div className="flex flex-wrap gap-2">
                            {(u.groups || []).map(g => (
                                <span key={g} className="text-[10px] bg-black border border-gray-900 px-3 py-1 rounded-lg text-gray-400 font-bold uppercase tracking-tighter">{g}</span>
                            ))}
                        </div>
                    </td>
                    <td className="p-6 text-right flex justify-end gap-2">
                        {(u.groups || []).includes('Vorstand') && (
                            <button onClick={() => resetPassword(u)} className="text-gray-500 hover:text-orange-500 p-3 rounded-2xl bg-black border border-gray-900 hover:border-orange-500/30 transition-all" title="Reset PW"><Key size={18} /></button>
                        )}
                        <button onClick={() => setEditingUser(u)} className="text-gray-500 hover:text-orange-500 p-3 rounded-2xl bg-black border border-gray-900 hover:border-orange-500/30 transition-all" title="Edit"><Edit2 size={18} /></button>
                        <button onClick={() => removeUser(u.id)} className="text-gray-500 hover:text-red-500 p-3 rounded-2xl bg-black border border-gray-900 hover:border-red-500/30 transition-all" title="Delete"><Trash2 size={18} /></button>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        </div>
      )}
    </div>
  );
}

function MemberForm({ onSubmit, initialData, onCancel }) {
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [role, setRole] = useState(initialData?.role || 'member');
  const [selectedGroups, setSelectedGroups] = useState(initialData?.groups || []);
  const toggleGroup = (group) => setSelectedGroups(p => p.includes(group) ? p.filter(g => g !== group) : [...p, group]);
  
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...(initialData || {}), firstName: firstName.trim(), lastName: lastName.trim(), role, groups: selectedGroups, password: initialData?.password || "" }); }} className="bg-[#121212] border border-gray-900 p-10 rounded-[3rem] mb-8 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-8 text-left max-w-2xl mx-auto">
      <div className="absolute top-0 left-0 w-full h-2 bg-orange-500"></div>
      <div className="flex items-center gap-5 mb-10">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white transition-colors p-2">
            <X size={28} />
        </button>
        <h3 className="text-3xl font-black text-white tracking-tight leading-none">{initialData ? 'Profil bearbeiten' : 'Neues Mitglied'}</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div>
            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Vorname</label>
            <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Max" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 font-bold transition-all shadow-inner" />
        </div>
        <div>
            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Nachname</label>
            <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Muster" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 font-bold transition-all shadow-inner" />
        </div>
      </div>

      <div className="space-y-8 border-t border-gray-900 pt-8">
        <div>
            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-4 block">Berechtigung & Rang</label>
            <div className="bg-black border border-gray-900 p-2 rounded-2xl inline-flex gap-2">
                <button type="button" onClick={() => setRole('member')} className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'member' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Mitglied</button>
                <button type="button" onClick={() => setRole('admin')} className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'admin' ? 'bg-orange-500 text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Admin</button>
            </div>
        </div>
        
        <div>
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-4 block">Sektionen</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {GROUPS.map(g => (
              <label key={g} className={`flex items-center justify-center p-4 rounded-2xl border-2 cursor-pointer transition-all font-black text-[10px] uppercase tracking-widest text-center h-16 leading-tight ${selectedGroups.includes(g) ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-black border-gray-900 text-gray-600 hover:border-gray-700'}`}>
                <input type="checkbox" checked={selectedGroups.includes(g)} onChange={() => toggleGroup(g)} className="hidden" />
                {g}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-6 pt-10 mt-6 border-t border-gray-900">
        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-5 rounded-2xl transition-all shadow-xl shadow-orange-500/20 text-xs uppercase tracking-[0.2em] active:scale-95">
            {initialData ? 'Änderungen speichern' : 'Mitglied hinzufügen'}
        </button>
      </div>
    </form>
  );
}

// --- EVENTS ---
function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db, fbUser, isAutoArchived }) {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const getDbRef = (id) => doc(db, 'artifacts', appId, 'public', 'data', 'events', id);
  const handleArchive = async (id, s) => { if (!fbUser) return; const e = events.find(ev => ev.id === id); if(e) await setDoc(getDbRef(id), { ...e, isArchived: s }); setSelectedEvent(null); };
  const handleDeleteEvent = async (id) => { if (!fbUser || !confirm('Event wirklich löschen?')) return; await deleteDoc(getDbRef(id)); setSelectedEvent(null); };
  
  if (selectedEvent) { 
      const evData = events.find(e => e.id === selectedEvent.id); 
      if (evData) {
          const isExp = evData.endDate && new Date(evData.endDate) <= new Date(); 
          return <EventDetail event={evData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} fbUser={fbUser} isAutoArchived={isExp} />; 
      } else {
          setSelectedEvent(null);
          return null;
      }
  }
  
  return (
    <div className="space-y-4">
      {events.length === 0 ? <EmptyPlaceholder message={isArchive ? "Dein Archiv ist aktuell leer." : "Keine anstehenden Termine vorhanden."} /> : (
        <div className="grid gap-4 md:grid-cols-2">
            {events.map(e => {
                const isExp = e.endDate && new Date(e.endDate) <= new Date();
                return (
                    <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-[#121212] border border-gray-900 p-6 rounded-[2.5rem] cursor-pointer hover:border-orange-500/50 transition-all group active:scale-[0.98] shadow-xl text-left relative overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex flex-wrap gap-2">
                                <span className="text-[10px] font-black text-orange-500 uppercase bg-orange-500/10 px-3 py-1.5 rounded-full border border-orange-500/20 tracking-widest">{e.category}</span>
                                {(isExp && !e.isArchived) && <span className="text-[10px] font-black text-red-500 uppercase bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20 flex items-center gap-2"><Clock size={10}/> ABGELAUFEN</span>}
                            </div>
                            <ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" />
                        </div>
                        <h3 className="text-2xl font-black text-white mt-1 mb-6 group-hover:text-orange-50 transition-colors leading-tight">{e.title}</h3>
                        <div className="flex justify-between text-xs text-gray-500 font-black pt-6 border-t border-gray-900/50 uppercase tracking-widest">
                            <span className="flex items-center gap-2"><Calendar size={14} className="text-orange-500" /> {new Date(e.date).toLocaleDateString('de-CH')}</span>
                            <span className="flex items-center gap-2"><BarChart3 size={14} className="text-orange-500" /> {(e.surveys || []).length} UMFRAGEN</span>
                        </div>
                        {/* Background Decoration */}
                        <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl group-hover:bg-orange-500/10 transition-all"></div>
                    </div>
                );
            })}
        </div>
      )}
    </div>
  );
}

function EventDetail({ event, onBack, currentUser, onArchive, onDelete, users, dbAppId, db, fbUser, isAutoArchived }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
  const handleAddSurvey = async (newSurvey) => { if (!fbUser) return; const updatedSurveys = [...(event.surveys || []), { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }]; await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); setShowCreateSurvey(false); };
  const updateSurvey = async (surveyId, updates) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => s.id === surveyId ? { ...s, ...updates } : s); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  const handleVote = async (surveyId, selectedOptionIds) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => { if (s.id === surveyId) { const updatedOptions = s.options.map(opt => selectedOptionIds.includes(opt.id) ? { ...opt, votes: (opt.votes || 0) + 1 } : opt); return { ...s, options: updatedOptions, votedUsers: [...(s.votedUsers || []), currentUser.id] }; } return s; }); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  const isActuallyArchived = event.isArchived || isAutoArchived;
  const surveys = event.surveys || [];
  
  if (showCreateSurvey) {
      return (
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="flex items-center gap-5 mb-10">
                <button type="button" onClick={() => setShowCreateSurvey(false)} className="text-gray-500 hover:text-white transition-colors p-2">
                    <X size={28} />
                </button>
                <h2 className="text-3xl font-black text-white tracking-tight leading-none">Neue Umfrage</h2>
            </div>
            <CreateSurveyForm onSubmit={handleAddSurvey} isMusicMode={event.category === 'Liederwahl'} />
        </div>
      );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 text-left">
        <div className="flex items-center gap-5">
            <button onClick={onBack} className="text-gray-400 hover:text-white bg-[#121212] p-4 rounded-[1.2rem] border border-gray-900 transition-all hover:bg-gray-800 active:scale-90 shadow-lg">
                <ChevronRight className="rotate-180" size={24} />
            </button>
            <div className="flex-1 text-left">
                <h2 className="text-3xl font-black text-white tracking-tight leading-tight">{event.title}</h2>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
                    {isActuallyArchived && <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase px-3 py-1 rounded-full border border-orange-500/20 tracking-widest">ARCHIV</span>}
                </div>
            </div>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2 self-end sm:self-auto">
            <button onClick={() => onArchive(event.id, !event.isArchived)} className="w-12 h-12 rounded-2xl flex items-center justify-center border border-gray-900 bg-black text-gray-400 hover:text-orange-500 hover:border-orange-500/30 transition-all"><Archive size={18} /></button>
            <button onClick={() => onDelete(event.id)} className="w-12 h-12 rounded-2xl flex items-center justify-center border border-gray-900 bg-black text-gray-400 hover:text-red-500 hover:border-red-500/30 transition-all"><Trash2 size={18} /></button>
            {!isActuallyArchived && <button onClick={() => setShowCreateSurvey(true)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-6 py-3 rounded-2xl flex items-center gap-2 shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-[10px] tracking-widest ml-2 transition-all"><Plus size={18} /> Umfrage</button>}
          </div>
        )}
      </div>

      <div className="space-y-8">
        {surveys.length === 0 ? <EmptyPlaceholder message="Erstelle die erste Abstimmung für dieses Event." /> : (
            surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(u) => updateSurvey(survey.id, u)} onVote={(o) => handleVote(survey.id, o)} users={users} isArchivedView={isActuallyArchived} />)
        )}
      </div>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const submit = (e) => { e.preventDefault(); const finalCategory = category === 'Freitext' ? customCategory.trim() : category; if (category === 'Freitext' && !finalCategory) return; onSubmit({ title, category: finalCategory, date, endDate }); };
  return (
    <form onSubmit={submit} className="bg-[#121212] border border-gray-900 p-10 rounded-[3rem] mb-8 space-y-8 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-top-8 text-left max-w-2xl mx-auto">
      <div className="absolute top-0 left-0 w-full h-2 bg-orange-500"></div>
      <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-10">Event erfassen</h3>
      <div className="space-y-6">
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Titel des Events</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Z.B. Fasnacht 2026" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none transition-all" /></div>
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Kategorie</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none transition-all cursor-pointer">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>{category === 'Freitext' && (<input type="text" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Kategorie Name" className="w-full mt-3 bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold" />)}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Datum</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none transition-all" /></div>
            <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Autom. Archiv (Ende)</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none transition-all" /></div>
        </div>
      </div>
      <div className="flex justify-end pt-10 border-t border-gray-900 mt-6">
        <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-5 rounded-2xl transition-all shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-xs tracking-widest">Event veröffentlichen</button>
      </div>
    </form>
  );
}

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center"><div className="max-w-md w-full bg-red-950/20 border border-red-900/50 rounded-[2.5rem] p-12 shadow-2xl"><ShieldAlert className="mx-auto text-red-500 mb-8" size={64} /><h1 className="text-4xl font-black text-white mb-4 tracking-tighter">Systemfehler</h1><p className="text-red-300 text-sm mb-6 leading-relaxed italic">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center"><div className="max-w-2xl w-full bg-[#121212] border border-gray-900 rounded-[3rem] p-16 shadow-2xl text-center"><Settings className="mx-auto text-orange-500 mb-8 animate-spin-slow" size={64} /><h1 className="text-4xl font-black text-white mb-3 tracking-tighter">Setup erforderlich</h1><p className="text-gray-500 text-lg">Firebase Konfiguration fehlt in der App.jsx.</p></div></div>); }
