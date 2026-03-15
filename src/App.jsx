import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, 
  Edit2, FileSpreadsheet, Upload, X, Info, Youtube, ExternalLink, Clock,
  FileText, ClipboardCheck, Save, ListPlus, Paperclip, Download, File, Key, Lock,
  Search, Package, FileOutput, LayoutGrid, FileDown
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, updateProfile } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ====================================================================================
// ⚠️ FIREBASE KONFIGURATION
// ====================================================================================
const MY_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9sGsbG9WAQfp9xoEqOhzp_IDgMuwOYmE",
  authDomain: "ruesssuuger-voting.firebaseapp.com",
  projectId: "ruesssuuger-voting",
  storageBucket: "ruesssuuger-voting.firebasestorage.app",
  messagingSenderId: "737751466538",
  appId: "1:737751466538:web:4fe3f376738accc352f953"
};

const isPreviewEnvironment = typeof __firebase_config !== 'undefined';
const firebaseConfig = isPreviewEnvironment && __firebase_config ? JSON.parse(__firebase_config) : MY_FIREBASE_CONFIG;
const isConfigured = isPreviewEnvironment || (firebaseConfig.apiKey !== "DEIN_API_KEY" && !!firebaseConfig.apiKey);

const app = isConfigured ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id.replace(/[^a-zA-Z0-9_-]/g, '-') : 'ruesssuuger-app';

// ====================================================================================
// KONSTANTEN & HELFER
// ====================================================================================
const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder', 'Musik'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];
const BOARD_ROLES = ['Präsident', 'Vizepräsident', 'Tambourmajor', 'Aktuar', 'Kassier', 'Sujetchefin', 'Tourmanagerin'];

const obfuscate = (str) => btoa(str || "");
const deobfuscate = (str) => { try { return atob(str || ""); } catch(e) { return ""; } };

const INITIAL_USERS = [
  { id: '1', firstName: 'Admin', lastName: 'Suuger', role: 'admin', groups: ['Vorstand', 'Aktive'], password: "" },
];

// ====================================================================================
// HAUPTKOMPONENTE
// ====================================================================================
export default function App() {
  const [user, setUser] = useState(null); // Firebase User
  const [currentUser, setCurrentUser] = useState(null); // App Profile
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  
  const [activeTab, setActiveTab] = useState('events');
  const [isDBReady, setIsDBReady] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [isSeeding, setIsSeeding] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [creationTrigger, setCreationTrigger] = useState(null);

  if (!isConfigured) return <SetupScreen />;

  // 1. Auth Init (Rule 3)
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
        setAuthError(err.message);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. Data Fetching (Rule 1 & 2)
  useEffect(() => {
    if (!user || !db) return;

    const createUnsub = (colName, setter) => {
      const q = collection(db, 'artifacts', appId, 'public', 'data', colName);
      return onSnapshot(q, (snap) => {
        setter(snap.docs.map(d => ({ ...d.data(), id: d.id })));
        setIsDBReady(true);
      }, (err) => {
        console.error(`Snapshot Error ${colName}:`, err);
      });
    };

    const unsubs = [
      createUnsub('users', setUsers),
      createUnsub('events', setEvents),
      createUnsub('minutes', setMinutes),
      createUnsub('active_sessions', setActiveSessions)
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  // 3. Session Recovery & Heartbeat
  useEffect(() => {
    if (isDBReady && user) {
      if (user.displayName && !currentUser) {
        const profile = users.find(u => u.id === user.displayName);
        if (profile) {
          const session = activeSessions.find(s => s.id === profile.id);
          const isBoard = (profile.groups || []).includes('Vorstand');
          if (!isBoard || (session && Date.now() - session.lastSeen < 300000)) {
            setCurrentUser(profile);
          }
        }
      }
      const timer = setTimeout(() => setIsCheckingSession(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isDBReady, user, users, activeSessions, currentUser]);

  useEffect(() => {
    if (!currentUser || !db || !user) return;
    const heartbeat = async () => {
      try {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id), {
          id: currentUser.id,
          lastSeen: Date.now()
        });
      } catch (e) { console.error("Heartbeat error", e); }
    };
    heartbeat();
    const interval = setInterval(heartbeat, 45000);
    return () => clearInterval(interval);
  }, [currentUser, user]);

  const handleLoginSuccess = async (foundUser) => {
    setCurrentUser(foundUser);
    if (user) await updateProfile(user, { displayName: foundUser.id });
  };

  const handleLogout = async () => {
    if (currentUser) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'active_sessions', currentUser.id)); } catch(e){}
    }
    setCurrentUser(null);
    if (user) await updateProfile(user, { displayName: "" });
  };

  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      }
    } catch (err) { alert(err.message); }
    setIsSeeding(false);
  };

  if (authError) return <FatalErrorScreen message={authError} />;

  if (!user || !isDBReady || isCheckingSession) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700 text-center">
          <h1 className="text-6xl sm:text-7xl font-black tracking-tighter mb-1 leading-none">
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <span className="text-gray-400 text-xl font-bold uppercase tracking-[0.3em] mt-2">Ämme</span>
          <div className="flex items-center gap-3 mt-12">
            <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLoginSuccess} users={users} activeSessions={activeSessions} onSeed={seedDatabase} isSeeding={isSeeding} db={db} appId={appId} deobfuscate={deobfuscate} obfuscate={obfuscate} />;
  }

  const isBoardMember = (currentUser.groups || []).includes('Vorstand');
  const isExpired = (e) => e.endDate && new Date(e.endDate) < new Date();
  
  const activeEvents = events.filter(e => !e.isArchived && !isExpired(e));
  const archivedEvents = events.filter(e => e.isArchived || isExpired(e));

  const itemsCount = activeTab === 'events' ? activeEvents.length : 
                     activeTab === 'archive' ? archivedEvents.length :
                     activeTab === 'minutes' ? minutes.length : users.length;

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans selection:bg-orange-500/30 flex flex-col overflow-hidden">
      {/* HEADER */}
      <header className="px-6 pt-10 pb-4 shrink-0">
        <div className="max-w-5xl mx-auto flex justify-between items-start">
          <div className="flex flex-col text-left">
            <h1 className="text-4xl font-black tracking-tighter leading-tight cursor-default">
              <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
            <span className="text-gray-400 text-xs font-bold uppercase tracking-[0.3em] ml-0.5 mt-0.5 text-left">Ämme</span>
            <p className="text-[10px] text-gray-600 font-medium mt-4 uppercase tracking-widest text-left">
              {activeTab === 'search' ? 'Suchergebnisse' : `${itemsCount} Einträge total`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
             <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{activeSessions.length} aktiv</span>
             </div>
             <button onClick={handleLogout} className="text-gray-600 hover:text-orange-500 transition-colors"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      {/* PILL TABS */}
      <div className="px-6 py-4 overflow-x-auto scrollbar-hide shrink-0">
        <div className="max-w-5xl mx-auto flex gap-3">
          <TabButton active={activeTab === 'events'} onClick={() => { setActiveTab('events'); setCreationTrigger(null); }} label="EVENTS" />
          {isBoardMember && <TabButton active={activeTab === 'minutes'} onClick={() => { setActiveTab('minutes'); setCreationTrigger(null); }} label="PROTOKOLLE" />}
          <TabButton active={activeTab === 'archive'} onClick={() => { setActiveTab('archive'); setCreationTrigger(null); }} label="ARCHIV" />
        </div>
      </div>

      {/* CONTENT AREA */}
      <main className="flex-1 px-6 pt-2 pb-32 overflow-y-auto scrollbar-hide">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'search' && <SearchView events={events} minutes={minutes} isBoardMember={isBoardMember} />}
          {activeTab === 'events' && <EventsView events={activeEvents} currentUser={currentUser} users={users} db={db} appId={appId} forceCreate={creationTrigger === 'event'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'archive' && <EventsView events={archivedEvents} currentUser={currentUser} isArchive users={users} db={db} appId={appId} />}
          {activeTab === 'minutes' && isBoardMember && <MinutesView minutes={minutes} users={users} db={db} appId={appId} forceCreate={creationTrigger === 'minute'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} db={db} appId={appId} forceCreate={creationTrigger === 'member'} onCreated={() => setCreationTrigger(null)} />}
        </div>
      </main>

      {/* BOTTOM NAVIGATION */}
      <footer className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-gray-900 px-6 py-4 z-20">
        <div className="max-w-xl mx-auto flex justify-between items-center relative">
          <button onClick={() => { setActiveTab('events'); setCreationTrigger(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'events' ? 'text-orange-500' : 'text-gray-600'}`}>
            <Calendar size={22} /><span className="text-[10px] font-black uppercase tracking-tighter">EVENTS</span>
          </button>
          <button onClick={() => setActiveTab('search')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-orange-500' : 'text-gray-600'}`}>
            <Search size={22} /><span className="text-[10px] font-black uppercase tracking-tighter">SUCHE</span>
          </button>

          {/* QUICK PLUS */}
          <div className="absolute left-1/2 -translate-x-1/2 -top-10">
            <button onClick={() => setShowCreateModal(true)} className="bg-orange-500 text-black w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_25px_rgba(249,115,22,0.3)] active:scale-95 transition-transform border-4 border-black">
              <Plus size={32} strokeWidth={3} />
            </button>
          </div>

          <div className="w-12"></div>

          <button onClick={() => { setActiveTab('members'); setCreationTrigger(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'members' ? 'text-orange-500' : 'text-gray-600'}`}>
            <Users size={22} /><span className="text-[10px] font-black uppercase tracking-tighter">STAMMDATEN</span>
          </button>
          <button onClick={() => setShowExportModal(true)} className={`flex flex-col items-center gap-1 transition-colors ${showExportModal ? 'text-orange-500' : 'text-gray-600'}`}>
            <FileOutput size={22} /><span className="text-[10px] font-black uppercase tracking-tighter">EXPORT</span>
          </button>
        </div>
      </footer>

      {/* MODALS */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[#111] border border-gray-800 w-full max-w-sm rounded-[2.5rem] p-8 space-y-4 animate-in slide-in-from-bottom-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-black text-xl mb-6 text-center tracking-tight">Erstellen</h3>
            <QuickActionButton icon={<Calendar/>} label="Neuer Event" onClick={() => { setActiveTab('events'); setCreationTrigger('event'); setShowCreateModal(false); }} />
            {isBoardMember && <QuickActionButton icon={<FileText/>} label="Sitzungsprotokoll" onClick={() => { setActiveTab('minutes'); setCreationTrigger('minute'); setShowCreateModal(false); }} />}
            {currentUser.role === 'admin' && <QuickActionButton icon={<UserPlus/>} label="Neues Mitglied" onClick={() => { setActiveTab('members'); setCreationTrigger('member'); setShowCreateModal(false); }} />}
            <button onClick={() => setShowCreateModal(false)} className="w-full py-4 text-gray-500 font-bold uppercase text-xs tracking-widest mt-4">Abbrechen</button>
          </div>
        </div>
      )}

      {showExportModal && (
        <ExportModal 
          isOpen={showExportModal} 
          onClose={() => setShowExportModal(false)} 
          events={events} 
          minutes={minutes} 
          users={users} 
          onExportEvent={handleExportEvent}
          onExportMinute={handleExportMinute}
        />
      )}
    </div>
  );
}

// ====================================================================================
// SUB-KOMPONENTEN
// ====================================================================================

function TabButton({ active, onClick, label }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2 group min-w-[110px]">
      <div className={`px-6 py-2.5 rounded-full font-black text-[11px] tracking-widest transition-all ${active ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'bg-gray-900/50 text-gray-500 hover:text-gray-300'}`}>
        {label}
      </div>
      {active && <div className="h-0.5 w-8 bg-orange-500 rounded-full animate-in zoom-in duration-300"></div>}
    </button>
  );
}

function QuickActionButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 p-5 bg-black border border-gray-800 rounded-3xl hover:border-orange-500/50 transition-all group text-left">
      <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-colors">
        {React.cloneElement(icon, { size: 22 })}
      </div>
      <span className="text-white font-black text-sm tracking-tight">{label}</span>
    </button>
  );
}

// --- LOGIN ---
function LoginScreen({ onLogin, users, activeSessions, onSeed, isSeeding, db, appId, deobfuscate, obfuscate }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step, setStep] = useState('name'); 
  const [password, setPassword] = useState('');
  const [tempUser, setTempUser] = useState(null);

  const checkName = (e) => {
    e.preventDefault();
    const userMatch = users.find(u => 
      (u.firstName || '').toLowerCase() === firstName.trim().toLowerCase() && 
      (u.lastName || '').toLowerCase() === lastName.trim().toLowerCase()
    );
    if (!userMatch) return alert("Mitglied nicht gefunden.");
    const session = activeSessions.find(s => s.id === userMatch.id);
    if (session && (Date.now() - session.lastSeen < 60000)) return alert("Account bereits auf anderem Gerät aktiv.");

    const isBoard = (userMatch.groups || []).includes('Vorstand');
    if (isBoard) {
        setTempUser(userMatch);
        if (!userMatch.password) setStep('setup');
        else setStep('password');
    } else {
        onLogin(userMatch);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full">
        <div className="flex flex-col items-center mb-12 text-center">
            <h1 className="text-6xl font-black mb-1 tracking-tighter leading-none">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
            <span className="text-gray-400 text-lg font-bold uppercase tracking-[0.4em] ml-2">Ämme</span>
        </div>

        <div className="bg-[#121212] border border-gray-900 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden text-left">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500"></div>
            {users.length === 0 ? (
                <div className="py-6 flex flex-col items-center text-center">
                    <Database className="text-gray-800 mb-6" size={56} />
                    <h3 className="text-white font-bold text-xl mb-4 tracking-tight">Datenbank bereitstellen</h3>
                    <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 text-black font-black py-4 rounded-2xl uppercase text-xs tracking-widest active:scale-95 transition-all">Basisdaten laden</button>
                </div>
            ) : (
                <>
                {step === 'name' && (
                    <form onSubmit={checkName} className="space-y-6 text-left">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Vorname</label>
                            <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Max" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 transition-all font-bold" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Nachname</label>
                            <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Muster" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 transition-all font-bold" />
                        </div>
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl mt-4 uppercase text-xs tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all">Anmelden</button>
                    </form>
                )}
                {step === 'password' && (
                    <form onSubmit={(e) => { e.preventDefault(); if(password === deobfuscate(tempUser.password)) onLogin(tempUser); else alert("Falsch."); }} className="space-y-6 text-center">
                        <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center text-orange-500 mx-auto"><Lock size={32} /></div>
                        <span className="text-[11px] font-black text-orange-500 uppercase tracking-widest block">Vorstand Login</span>
                        <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white text-center text-2xl tracking-[0.5em] font-black focus:border-orange-500 outline-none transition-all" />
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl uppercase text-xs tracking-widest active:scale-95">Entsperren</button>
                        <button type="button" onClick={() => setStep('name')} className="text-gray-500 text-[10px] font-black uppercase hover:text-white transition-colors">Abbrechen</button>
                    </form>
                )}
                {step === 'setup' && (
                    <form onSubmit={async (e) => { e.preventDefault(); if(password.length < 4) return alert("Min. 4"); const up = {...tempUser, password: obfuscate(password)}; await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', tempUser.id), up); onLogin(up); }} className="space-y-6 text-center">
                        <ShieldAlert size={48} className="text-blue-500 mx-auto" />
                        <span className="text-xs font-black block uppercase text-blue-400">Passwort festlegen</span>
                        <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Neues Passwort" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white text-center font-bold focus:border-orange-500 outline-none transition-all" />
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl uppercase text-xs tracking-widest">Speichern & Login</button>
                    </form>
                )}
                </>
            )}
        </div>
      </div>
    </div>
  );
}

// --- GLOBAL SEARCH ---
function SearchView({ events, minutes, isBoardMember }) {
    const [q, setQ] = useState('');
    const filteredEvents = q.length < 2 ? [] : events.filter(e => e.title?.toLowerCase().includes(q.toLowerCase()) || (e.surveys || []).some(s => s.title?.toLowerCase().includes(q.toLowerCase())));
    const filteredMinutes = (q.length < 2 || !isBoardMember) ? [] : minutes.filter(m => new Date(m.date).toLocaleDateString('de-CH').includes(q) || Object.values(m.agenda || {}).some(points => points.some(p => p.text?.toLowerCase().includes(q.toLowerCase()))));

    return (
        <div className="space-y-10 animate-in fade-in duration-300 text-left">
            <div className="relative text-left">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Events, Umfragen, Protokolle..." className="w-full bg-[#121212] border border-gray-900 rounded-3xl pl-14 pr-6 py-5 text-white focus:outline-none focus:border-orange-500 font-bold transition-all shadow-xl text-left" />
            </div>
            {q.length >= 2 && (
                <div className="space-y-10">
                    {filteredEvents.length > 0 && (
                        <section><h4 className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-4 ml-2">Gefundene Events</h4><div className="grid gap-3">{filteredEvents.map(e => (<div key={e.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left"><div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center shrink-0"><Calendar size={20}/></div><div className="text-left"><p className="text-white font-bold">{e.title}</p><p className="text-[10px] text-gray-500 uppercase font-black">{new Date(e.date).toLocaleDateString('de-CH')} • {e.category}</p></div></div>))}</div></section>
                    )}
                    {filteredMinutes.length > 0 && (
                        <section><h4 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4 ml-2">Gefundene Protokolle</h4><div className="grid gap-3">{filteredMinutes.map(m => (<div key={m.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left"><div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center shrink-0"><FileText size={20}/></div><div className="text-left text-left"><p className="text-white font-bold">{new Date(m.date).toLocaleDateString('de-CH')}</p><p className="text-[10px] text-gray-500 uppercase font-black">Vorstandsprotokoll</p></div></div>))}</div></section>
                    )}
                    {filteredEvents.length === 0 && filteredMinutes.length === 0 && <div className="text-center py-20 opacity-40 mx-auto text-center"><Search size={48} className="mx-auto mb-4 text-center" /><p className="font-black uppercase text-xs tracking-widest">Nix gefunden.</p></div>}
                </div>
            )}
        </div>
    );
}

// --- EVENTS VIEW ---
function EventsView({ events, currentUser, isArchive = false, users, db, appId, forceCreate, onCreated }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => { if(forceCreate) setShowCreate(true); }, [forceCreate]);

  const handleSave = async (n) => {
    const id = n.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...n, id, isArchived: n.isArchived || false, surveys: n.surveys || [] });
    setShowCreate(false); setEditingEvent(null); if(onCreated) onCreated();
  };

  const handleArchive = async (id, s) => {
    const e = events.find(ev => ev.id === id);
    if(e) await setDoc(doc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id)), { ...e, isArchived: s });
    setSelectedEvent(null);
  };

  const handleDelete = async (id) => {
    if (confirm('Löschen?')) { await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id)); setSelectedEvent(null); }
  };

  if (selectedEvent) {
    const evData = events.find(e => e.id === selectedEvent.id);
    if (!evData) { return <button onClick={() => setSelectedEvent(null)} className="text-orange-500 underline">Zurück</button>; }
    return <EventDetail event={evData} onBack={() => setSelectedEvent(null)} onEdit={() => { setEditingEvent(evData); setSelectedEvent(null); }} onArchive={handleArchive} onDelete={handleDelete} currentUser={currentUser} users={users} db={db} appId={appId} />;
  }

  return (
    <div className="space-y-6 text-left">
      {(showCreate || editingEvent) && <CreateEventForm initialData={editingEvent} onSubmit={handleSave} onCancel={() => { setShowCreate(false); setEditingEvent(null); if(onCreated) onCreated(); }} />}
      {events.length === 0 ? <EmptyPlaceholder message={isArchive ? "Archiv leer." : "Keine aktuellen Events."} /> : (
        <div className="grid gap-4 md:grid-cols-2">
            {events.map(e => (<div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-[#121212] border border-gray-900 p-7 rounded-[2.5rem] cursor-pointer hover:border-orange-500/50 transition-all group active:scale-[0.98] shadow-lg text-left relative overflow-hidden">
                <div className="flex justify-between items-start mb-6"><div className="flex flex-wrap gap-2"><span className="text-[10px] font-black text-orange-500 uppercase bg-orange-500/10 px-3 py-1.5 rounded-full border border-orange-500/20 tracking-widest">{e.category}</span></div><ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" /></div>
                <h3 className="text-2xl font-black text-white group-hover:text-orange-50 leading-tight mb-8 text-left">{e.title}</h3>
                <div className="flex justify-between text-xs text-gray-500 font-black pt-6 border-t border-gray-900/50 uppercase tracking-widest"><span className="flex items-center gap-2"><Calendar size={14} className="text-orange-500" /> {new Date(e.date).toLocaleDateString('de-CH')}</span><span className="flex items-center gap-2"><BarChart3 size={14} className="text-orange-500" /> {(e.surveys || []).length} UMFRAGEN</span></div>
            </div>))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onSubmit, onCancel, initialData }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [category, setCategory] = useState(initialData?.category || CATEGORIES[0]);
  const [date, setDate] = useState(initialData?.date || '');
  const [endDate, setEndDate] = useState(initialData?.endDate || '');
  const [customCategory, setCustomCategory] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); const final = category === 'Freitext' ? customCategory.trim() : category; onSubmit({ ...initialData, title, category: final, date, endDate }); }} className="bg-[#121212] border border-gray-900 p-10 rounded-[3rem] mb-10 space-y-8 shadow-2xl relative overflow-hidden text-left">
      <div className="absolute top-0 left-0 w-full h-2 bg-orange-500"></div>
      <h3 className="text-3xl font-black text-white tracking-tight leading-none mb-8">{initialData ? 'Event bearbeiten' : 'Neuer Event'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left text-left text-left">
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Titel</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
        <div className="space-y-1 text-left"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Kategorie</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>{category === 'Freitext' && <input type="text" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Eigene Kategorie" className="w-full mt-3 bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold" />}</div>
        <div className="space-y-1 text-left"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Datum</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
        <div className="space-y-1 text-left"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1">Autom. Archiv</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
      </div>
      <div className="flex justify-end gap-6 pt-6 border-t border-gray-900 mt-6 text-left"><button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-black uppercase text-xs tracking-widest">Abbrechen</button><button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-black px-10 py-5 rounded-2xl active:scale-95 uppercase text-xs tracking-[0.2em] shadow-xl shadow-orange-500/20">Speichern</button></div>
    </form>
  );
}

function EventDetail({ event, onBack, onEdit, onArchive, onDelete, currentUser, users, db, appId }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
  const handleAddSurvey = async (s) => { const surveys = [...(event.surveys || []), { ...s, id: Date.now().toString(), status: 'draft', votedUsers: [] }]; await setDoc(getDbRef(), { ...event, surveys }); setShowCreateSurvey(false); };
  const updateSurvey = async (sid, up) => { const surveys = event.surveys.map(s => s.id === sid ? { ...s, ...up } : s); await setDoc(getDbRef(), { ...event, surveys }); };
  const handleVote = async (sid, oids) => { const surveys = event.surveys.map(s => { if (s.id === sid) { const options = s.options.map(opt => oids.includes(opt.id) ? { ...opt, votes: (opt.votes || 0) + 1 } : opt); return { ...s, options, votedUsers: [...(s.votedUsers || []), currentUser.id] }; } return s; }); await setDoc(getDbRef(), { ...event, surveys }); };
  const isExp = event.endDate && new Date(event.endDate) < new Date();
  const archived = event.isArchived || isExp;
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-12 text-left"><div className="flex items-center gap-6 text-left"><button onClick={onBack} className="text-gray-400 hover:text-white bg-[#121212] p-4 rounded-[1.2rem] border border-gray-900 transition-all hover:bg-gray-800 shadow-lg text-left"><ChevronRight className="rotate-180" size={24} /></button><div className="flex-1 text-left"><h2 className="text-3xl font-black text-white text-left leading-tight text-left">{event.title}</h2><div className="flex flex-wrap items-center gap-3 mt-2 text-left"><p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] text-left">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>{archived && <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase px-3 py-1 rounded-full border border-orange-500/20 tracking-widest text-left">ARCHIV</span>}</div></div></div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2 self-end sm:self-auto text-left"><button onClick={onEdit} className="p-3.5 bg-black border border-gray-900 rounded-2xl text-gray-400 hover:text-blue-400 hover:border-blue-400/20 transition-all"><Edit2 size={20} /></button><button onClick={() => onArchive(event.id, !event.isArchived)} className="p-3.5 bg-black border border-gray-900 rounded-2xl text-gray-400 hover:text-orange-500 hover:border-orange-500/20 transition-all"><Archive size={20} /></button><button onClick={() => onDelete(event.id)} className="p-3.5 bg-black border border-gray-900 rounded-2xl text-gray-400 hover:text-red-500 hover:border-red-500/20 transition-all"><Trash2 size={20} /></button>
            {!archived && <button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-6 py-3 rounded-2xl shadow-xl active:scale-95 text-xs uppercase tracking-widest ml-2 transition-all">{showCreateSurvey ? 'Abbruch' : <><Plus size={18} className="mr-1"/> Umfrage</>}</button>}
          </div>
        )}
      </div>
      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} isMusicMode={event.category === 'Liederwahl'} />}
      <div className="space-y-10 text-left">{surveys.length === 0 ? <p className="text-gray-500 text-center py-20 bg-gray-900/20 rounded-[3rem] border border-dashed border-gray-900 font-black uppercase text-[10px] tracking-widest italic text-center">Keine Umfragen erfasst.</p> : (surveys.map(s => <SurveyCard key={s.id} survey={s} currentUser={currentUser} onUpdate={(u) => updateSurvey(s.id, u)} onVote={(o) => handleVote(s.id, o)} users={users} isArchivedView={archived} />))}</div>
    </div>
  );
}

function CreateSurveyForm({ onSubmit, isMusicMode }) {
  const [title, setTitle] = useState('');
  const [maxAnswers, setMaxAnswers] = useState(1);
  const [allowedGroups, setAllowedGroups] = useState(GROUPS); 
  const [options, setOptions] = useState([{ id: '1', text: '', link: '' }, { id: '2', text: '', link: '' }]);
  const handleGroupToggle = (group) => setAllowedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  const handleOptionChange = (id, f, v) => setOptions(prev => prev.map(o => o.id === id ? { ...o, [f]: v } : o));
  const addOption = () => { if (options.length < 10) setOptions([...options, { id: Date.now().toString(), text: '', link: '' }]); };
  const removeOption = (id) => { if (options.length > 2) setOptions(prev => prev.filter(o => o.id !== id)); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); const valid = options.filter(o => o.text.trim() !== '').map((o, i) => ({ ...o, id: `o${i}-${Date.now()}`, votes: 0 })); onSubmit({ title, maxAnswers, allowedGroups, options: valid }); }} className="bg-[#121212] border border-gray-900 p-10 rounded-[3rem] mb-10 shadow-2xl relative overflow-hidden text-left animate-in fade-in slide-in-from-top-6">
      <h3 className="text-2xl font-black text-white mb-10 uppercase tracking-wider border-b border-gray-900 pb-6 text-left">Umfrage Details</h3>
      <div className="space-y-8 text-left text-left text-left">
        <div className="text-left text-left"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Frage</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder={isMusicMode ? "Welches Lied?" : "Titel"} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold text-left text-left text-left" /></div>
        <div className="text-left text-left text-left text-left"><label className="block text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-4 block">Antwortoptionen</label>
            <div className="space-y-4 text-left text-left text-left text-left">
                {options.map((opt, i) => (
                    <div key={opt.id} className="space-y-3 p-5 bg-black border border-gray-800 rounded-[1.5rem] text-left text-left">
                        <div className="flex gap-2 text-left text-left text-left"><input type="text" required value={opt.text} onChange={e => handleOptionChange(opt.id, 'text', e.target.value)} placeholder={`Option ${i + 1}`} className="flex-1 bg-[#0a0a0a] border border-gray-900 rounded-xl px-5 py-3 text-white focus:border-orange-500 text-sm font-bold text-left" /><button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 2} className="p-3 text-gray-700 hover:text-red-500 active:scale-90 transition-all text-left"><Trash2 size={22} /></button></div>
                        <div className="flex items-center gap-3 bg-[#0a0a0a] border border-gray-900 px-5 py-2.5 rounded-xl text-left text-left text-left text-left text-left"><Youtube size={18} className="text-gray-700 text-left text-left text-left text-left" /><input type="url" value={opt.link} onChange={e => handleOptionChange(opt.id, 'link', e.target.value)} placeholder="YouTube Link (optional)" className="flex-1 bg-transparent border-none text-[10px] text-gray-500 font-mono text-left text-left" /></div>
                    </div>
                ))}
            </div>
            <button type="button" onClick={addOption} className="text-orange-500 text-[11px] font-black uppercase tracking-widest mt-6 flex items-center gap-3 hover:text-orange-400 transition-all ml-2 text-left text-left"><div className="w-8 h-8 bg-orange-500/10 rounded-xl flex items-center justify-center"><Plus size={18}/></div> Weitere Option</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-gray-900 pt-10 text-left text-left text-left text-left text-left text-left"><div><label className="block text-[10px] font-black text-gray-500 uppercase mb-3 ml-2 tracking-widest text-left text-left">Max. Stimmen</label><input type="number" min="1" max="10" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold text-left text-left" /></div><div className="text-left text-left text-left"><label className="block text-[10px] font-black text-gray-500 uppercase mb-4 ml-2 tracking-widest text-left text-left">Wahlberechtigt</label><div className="grid grid-cols-2 gap-3 text-left text-left text-left text-left text-left">{GROUPS.map(g => (<label key={g} className="text-[11px] text-gray-400 font-bold flex items-center gap-3 cursor-pointer hover:text-white transition-all text-left text-left"><input type="checkbox" checked={allowedGroups.includes(g)} onChange={() => handleGroupToggle(g)} className="w-4 h-4 accent-orange-500 rounded text-left text-left" />{g}</label>))}</div></div></div>
      </div>
      <div className="flex justify-end pt-10 border-t border-gray-900 mt-10 text-left"><button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-black font-black py-5 rounded-[1.5rem] active:scale-95 uppercase text-sm tracking-[0.2em] shadow-xl shadow-orange-500/20 text-center">Umfrage Veröffentlichen</button></div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users, isArchivedView }) {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const votedUsers = survey.votedUsers || [];
  const totalVotes = (survey.options || []).reduce((sum, opt) => sum + (opt.votes || 0), 0);
  const eligibleCount = users.filter(u => survey.allowedGroups.some(g => (u.groups || []).includes(g))).length;
  const hasVoted = votedUsers.includes(currentUser.id);
  const isEligible = currentUser.role === 'admin' || survey.allowedGroups.some(g => (currentUser.groups || []).includes(g));
  if (!isEligible && currentUser.role !== 'admin') return null; 
  if (currentUser.role !== 'admin' && survey.status === 'draft') return null;
  const max = survey.maxAnswers || 1;
  const toggleOption = (id) => { if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id)); else if (max === 1) setSelectedOptions([id]); else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]); };
  const showResults = survey.status === 'published' || isArchivedView || (currentUser.role === 'admin' && hasVoted);
  return (
    <div className={`bg-[#121212] border rounded-[2.5rem] overflow-hidden transition-all shadow-xl ${survey.status === 'active' && !isArchivedView ? 'border-orange-500/40 ring-1 ring-orange-500/5' : 'border-gray-900'} text-left text-left text-left text-left`}>
      <div className="p-8 border-b border-gray-900 bg-black/40 flex flex-col sm:flex-row sm:justify-between items-start gap-6 text-left">
        <div className="text-left text-left">
          <div className="flex flex-wrap items-center gap-3 mb-3 text-left">
             {survey.status === 'draft' && <span className="text-[10px] bg-gray-800 text-gray-400 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-gray-800 text-left">Entwurf</span>}
             {survey.status === 'active' && !isArchivedView && <span className="text-[10px] bg-green-500/10 text-green-500 px-3 py-1 rounded-full font-black uppercase tracking-widest flex items-center gap-2 border border-green-500/20 text-left"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> AKTIV</span>}
             {(survey.status === 'published' || isArchivedView) && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-orange-500/20 text-left text-left text-left">Beendet</span>}
             <span className="text-[10px] text-gray-600 font-black uppercase tracking-[0.15em] ml-2 text-left">{max === 1 ? 'Single Choice' : `Max. ${max} Stimmen`}</span>
          </div>
          <h4 className="text-2xl font-black text-white leading-tight text-left text-left text-left">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-3 w-full sm:w-auto justify-between text-left">
            {!isArchivedView && (<div className="flex gap-2 text-left text-left">{survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-[11px] font-black uppercase bg-green-500 text-black px-6 py-2.5 rounded-xl active:scale-95 transition-all text-left">Freigeben</button>}{survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-[11px] font-black uppercase bg-orange-500 hover:bg-orange-600 text-black px-6 py-2.5 rounded-xl active:scale-95 shadow-lg shadow-orange-500/10 transition-all text-left">Beenden</button>}</div>)}
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest flex items-center gap-3 bg-black px-4 py-2 rounded-xl border border-gray-900 text-left text-left"><Users size={14} className="text-orange-500" /> {votedUsers.length} / {eligibleCount}</div>
          </div>
        )}
      </div>
      <div className="p-8 text-left text-left">
        {showResults ? (
          <div className="space-y-5 text-left text-left">
             {survey.status === 'active' && !isArchivedView && currentUser.role === 'admin' && (<div className="mb-6 p-5 bg-blue-500/5 border border-blue-500/10 rounded-[1.5rem] flex items-start gap-4 text-left text-left text-left"><AlertCircle className="text-blue-500 mt-0.5 shrink-0 text-left" size={20} /><p className="text-xs text-blue-400/80 italic text-left text-left text-left">Administratoren sehen die Live-Resultate.</p></div>)}
             {(survey.options || []).map(opt => { const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100); return (<div key={opt.id} className="relative w-full bg-black border border-gray-900 rounded-2xl overflow-hidden p-5 flex justify-between items-center group transition-all text-left text-left"><div className="absolute top-0 left-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out text-left" style={{ width: `${pct}%` }} /><div className="relative z-10 flex items-center gap-4 text-left text-left text-left text-left"><span className="font-bold text-base text-white text-left text-left leading-tight text-left">{opt.text}</span>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-2 bg-gray-950 rounded-xl text-gray-600 hover:text-red-500 transition-all border border-gray-800 text-left text-left"><Youtube size={16} /></a>)}</div><span className="relative z-10 text-xs text-gray-600 font-black font-mono text-left text-left">{pct}% <span className="text-[10px] text-gray-800 ml-2">({opt.votes || 0})</span></span></div>); })}
          </div>
        ) : hasVoted ? (<div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in zoom-in duration-700 text-left mx-auto text-center"><div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-[2rem] flex items-center justify-center mb-8 border border-green-500/10 shadow-[0_0_50px_rgba(34,197,94,0.1)] mx-auto"><Check size={40} className="stroke-[4]" /></div><h5 className="text-2xl font-black text-white tracking-tight uppercase text-center mb-3">Abgestimmt!</h5><p className="text-sm text-gray-500 mt-1 italic font-medium tracking-wide text-center text-center">Deine Stimme wurde bei den RüssSuugern gezählt.</p></div>) : (<div className="space-y-4 text-left text-left text-left text-left text-left text-left">
            {(survey.options || []).map(opt => (<div key={opt.id} className="flex gap-3 text-left text-left"><div onClick={() => toggleOption(opt.id)} className={`flex-1 flex items-center gap-5 p-6 rounded-[2rem] border-2 cursor-pointer transition-all active:scale-[0.99] text-left text-left text-left ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white shadow-xl shadow-orange-500/5' : 'bg-black border-gray-900 text-gray-500 hover:text-gray-300 hover:border-gray-800'}`}><div className={`w-7 h-7 flex items-center justify-center border-2 transition-all ${max > 1 ? 'rounded-xl' : 'rounded-full'} ${selectedOptions.includes(opt.id) ? 'border-orange-500 bg-orange-500 text-black' : 'border-gray-800'}`}>{selectedOptions.includes(opt.id) && <Check size={18} className="stroke-[4]" />}</div><span className="font-bold text-lg text-left text-left leading-tight">{opt.text}</span></div>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-6 bg-black border border-gray-900 rounded-[2rem] flex items-center justify-center text-gray-700 hover:text-red-500 transition-all group group-hover:scale-105 shadow-lg text-left text-left"><Youtube size={28} /></a>)}</div>))}<div className="pt-10 flex flex-col sm:flex-row items-center justify-between gap-8 border-t border-gray-900 mt-8 text-left text-left text-left"><p className="text-xs font-black text-gray-600 uppercase tracking-widest italic text-left text-left">{selectedOptions.length} / {max} gewählt</p><button onClick={() => selectedOptions.length > 0 && onVote(selectedOptions)} disabled={selectedOptions.length === 0} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 disabled:bg-gray-900 disabled:text-gray-800 text-black font-black px-14 py-5 rounded-[1.5rem] active:scale-95 uppercase text-sm tracking-[0.2em] shadow-2xl shadow-orange-500/20 transition-all">Stimme abgeben</button></div></div>)}
      </div>
    </div>
  );
}

// --- MINUTES ---
function MinutesView({ minutes, users, db, appId, forceCreate, onCreated }) {
  const [editing, setEditing] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  useEffect(() => { if(forceCreate) setIsCreating(true); }, [forceCreate]);
  const handleSave = async (data) => {
    const id = data.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...data, id });
    setIsCreating(false); setEditing(null); if(onCreated) onCreated();
  };
  const handleDelete = async (id) => {
    if (!confirm('Protokoll löschen?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id));
  };
  if (isCreating || editing) return <MinutesForm initialData={editing} boardMembers={users.filter(u => (u.groups || []).includes('Vorstand'))} onSave={handleSave} onCancel={() => { setIsCreating(false); setEditing(null); if(onCreated) onCreated(); }} />;
  return (
    <div className="space-y-4 text-left">
      {minutes.length === 0 ? <EmptyPlaceholder message="Noch keine Protokolle." /> : (
        <div className="grid gap-3 text-left">{minutes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(m => (
            <div key={m.id} className="bg-[#121212] border border-gray-900 p-6 rounded-[2.5rem] flex justify-between items-center group hover:border-orange-500/30 transition-all shadow-xl text-left">
              <div className="flex items-center gap-6 text-left">
                <div className="w-16 h-16 bg-black rounded-3xl flex items-center justify-center text-orange-500 border border-gray-900 shrink-0"><FileText size={30} /></div>
                <div className="text-left"><h3 className="text-xl font-bold text-white text-left leading-tight">Sitzung {new Date(m.date).toLocaleDateString('de-CH')}</h3><p className="text-[10px] text-gray-600 uppercase font-black tracking-widest mt-1 text-left">Vorstandsprotokoll</p></div>
              </div>
              <div className="flex gap-2 text-left"><button onClick={() => setEditing(m)} className="p-3 text-gray-500 hover:text-orange-500 transition-all"><Edit2 size={20} /></button><button onClick={() => handleDelete(m.id)} className="p-3 text-gray-500 hover:text-red-500 transition-all"><Trash2 size={20} /></button></div>
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
    if (initialData?.agenda) { Object.keys(initialData.agenda).forEach(r => { base[r] = initialData.agenda[r] || []; }); }
    return base;
  });
  const [newPoints, setNewPoints] = useState(BOARD_ROLES.reduce((acc, role) => ({ ...acc, [role]: '' }), {}));
  const [editingPoint, setEditingPoint] = useState({ role: null, index: null, text: '' });
  const fileInputRef = useRef(null);
  const [uploadingFor, setUploadingFor] = useState({ role: null, index: null });

  const toggleAtt = (id) => setAttendance(p => ({ ...p, [id]: !p[id] }));
  const addP = (role) => { const t = newPoints[role].trim(); if (!t) return; setAgenda(p => ({ ...p, [role]: [...(p[role] || []), { text: t, files: [] }] })); setNewPoints(p => ({ ...p, [role]: '' })); };
  const removeP = (role, idx) => setAgenda(p => ({ ...p, [role]: p[role].filter((_, i) => i !== idx) }));
  const saveP = () => { const { role, index, text } = editingPoint; if (!role || index === null || !text.trim()) return setEditingPoint({ role: null, index: null, text: '' }); setAgenda(p => ({ ...p, [role]: p[role].map((pt, i) => i === index ? { ...pt, text: text.trim() } : pt) })); setEditingPoint({ role: null, index: null, text: '' }); };

  const handleFile = async (e) => {
    const file = e.target.files[0]; const { role, index } = uploadingFor; if (!file || !role || index === null) return;
    if (file.size > 800 * 1024) return alert("Zu groß (max 800KB).");
    const reader = new FileReader(); reader.onload = (ev) => {
        setAgenda(p => ({ ...p, [role]: p[role].map((pt, i) => i === index ? { ...pt, files: [...(pt.files || []), { name: file.name, type: file.type, data: ev.target.result }] } : pt) }));
        setUploadingFor({ role: null, index: null });
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ id: initialData?.id, date, attendance, agenda }); }} className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-500 pb-20 text-left">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFile} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-6"><button type="button" onClick={onCancel} className="text-gray-400 hover:text-white bg-[#121212] p-4 rounded-[1.5rem] border border-gray-900 transition-all active:scale-90"><ChevronRight className="rotate-180" size={24} /></button><h2 className="text-3xl font-black text-white tracking-tight leading-none">{initialData ? 'Bearbeiten' : 'Neues Protokoll'}</h2></div>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-black px-10 py-5 rounded-[1.5rem] flex items-center gap-4 shadow-2xl active:scale-95 transition-all uppercase text-xs tracking-widest"><Save size={20} /> Speichern</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 text-left text-left">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[2.5rem] shadow-xl"><label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 ml-2">Datum</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:border-orange-500 font-bold outline-none" /></div>
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[2.5rem] shadow-xl"><h3 className="text-sm font-black text-white uppercase tracking-widest mb-8 flex items-center gap-4 text-left"><ClipboardCheck size={22} className="text-orange-500" /> Anwesenheit</h3>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-3 scrollbar-hide">{boardMembers.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(m => (<div key={m.id} onClick={() => toggleAtt(m.id)} className={`flex items-center justify-between p-5 rounded-[1.5rem] cursor-pointer transition-all border ${attendance[m.id] ? 'bg-orange-500/10 border-orange-500/30' : 'bg-black border-gray-900 opacity-60'}`}><span className="text-sm font-bold text-white text-left">{m.firstName} {m.lastName}</span><div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${attendance[m.id] ? 'bg-orange-500 border-orange-500 shadow-lg shadow-orange-500/20' : 'border-gray-800'}`}>{attendance[m.id] && <Check size={16} className="text-black stroke-[4]" />}</div></div>))}</div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#121212] border border-gray-900 p-8 rounded-[3rem] shadow-xl text-left"><h3 className="text-sm font-black text-white uppercase tracking-widest mb-10 flex items-center gap-4 text-left"><FileText size={22} className="text-orange-500" /> Ressort-Berichte</h3>
            <div className="space-y-12">
              {BOARD_ROLES.map(role => (
                <div key={role} className="space-y-6 pb-12 border-b border-gray-900 last:border-0 last:pb-0 text-left text-left">
                  <label className="block text-[11px] font-black text-orange-500 uppercase tracking-[0.3em] ml-3 text-left">{role}</label>
                  <div className="space-y-4 text-left">
                    {(agenda[role] || []).map((pt, idx) => (
                      <div key={idx} className="flex flex-col gap-4 p-6 bg-black border border-gray-900 rounded-[1.5rem] group hover:border-gray-800 transition-all shadow-xl text-left text-left">
                        {editingPoint.role === role && editingPoint.index === idx ? (
                          <div className="flex gap-3 text-left text-left"><textarea autoFocus value={editingPoint.text} onChange={e => setEditingPoint({...editingPoint, text: e.target.value})} className="flex-1 bg-gray-900 border border-orange-500/50 rounded-2xl px-6 py-4 text-sm text-white focus:outline-none resize-none font-medium" rows={3} /><div className="flex flex-col gap-2"><button type="button" onClick={saveP} className="p-4 bg-green-500/20 text-green-500 rounded-2xl"><Check size={22}/></button><button type="button" onClick={() => setEditingPoint({ role: null, index: null, text: '' })} className="p-4 bg-red-500/20 text-red-500 rounded-2xl"><X size={22}/></button></div></div>
                        ) : (
                          <div className="space-y-4 text-left text-left text-left">
                            <div className="flex items-start gap-5 text-left text-left">
                                <div className="w-2 h-2 rounded-full bg-orange-500 mt-2 shrink-0 text-left"></div>
                                <p className="text-base text-gray-300 flex-1 whitespace-pre-wrap leading-relaxed font-medium text-left">{pt.text}</p>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all text-left text-left">
                                    <button type="button" onClick={() => { setUploadingFor({role, index: idx}); fileInputRef.current?.click(); }} className="p-3 text-gray-600 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl" title="Anhang"><Paperclip size={20} /></button>
                                    <button type="button" onClick={() => setEditingPoint({role, index: idx, text: pt.text})} className="p-3 text-gray-600 hover:text-orange-500 hover:bg-orange-500/10 rounded-xl" title="Edit"><Edit2 size={20} /></button>
                                    <button type="button" onClick={() => removeP(role, idx)} className="p-3 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl" title="Lösch"><Trash2 size={20} /></button>
                                </div>
                            </div>
                            {pt.files && pt.files.length > 0 && (<div className="flex flex-wrap gap-3 ml-7">{pt.files.map((f, fi) => (<div key={fi} className="flex items-center gap-3 bg-[#111] border border-gray-900 px-5 py-2.5 rounded-2xl group/file shadow-md hover:border-gray-700 transition-all"><File size={16} className="text-orange-500/70" /><span className="text-[10px] text-gray-400 font-black uppercase tracking-widest max-w-[150px] truncate">{f.name}</span><div className="flex gap-2"><button type="button" onClick={() => { const l=document.createElement('a'); l.href=f.data; l.download=f.name; l.click(); }} className="p-1.5 text-gray-500 hover:text-orange-400"><Download size={14}/></button><button type="button" onClick={() => setAgenda(p => ({ ...p, [role]: p[role].map((point, i) => i === idx ? { ...point, files: point.files.filter((_, x) => x !== fi) } : point) }))} className="p-1.5 text-gray-500 hover:text-red-500"><X size={14}/></button></div></div>))}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-8 text-left text-left"><input type="text" value={newPoints[role]} onChange={e => setNewPoints(p => ({ ...p, [role]: e.target.value }))} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addP(role))} placeholder="Bericht erfassen..." className="flex-1 bg-black border border-gray-900 rounded-[1.5rem] px-8 py-5 text-sm text-white focus:border-orange-500 outline-none font-bold shadow-inner" /><button type="button" onClick={() => addP(role)} className="bg-gray-900 hover:bg-gray-800 text-orange-500 w-16 h-16 rounded-[1.5rem] transition-all shadow-xl flex items-center justify-center border border-gray-800 active:scale-90"><Plus size={30} /></button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

// --- MEMBERS ---
function MembersView({ users, db, appId, forceCreate, onCreated }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  useEffect(() => { if(forceCreate) setShowAdd(true); }, [forceCreate]);
  const handleSave = async (u) => { const id = u.id || Date.now().toString(); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...u, id }); setShowAdd(false); setEditing(null); if(onCreated) onCreated(); };
  const handleDel = async (id) => { if (confirm('Löschen?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id)); };
  if (showAdd || editing) return <MemberForm initialData={editing} onSubmit={handleSave} onCancel={() => { setShowAdd(false); setEditing(null); if(onCreated) onCreated(); }} />;
  return (
    <div className="space-y-6 text-left">
      <div className="flex gap-3 text-left"><button onClick={() => setShowAdd(true)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-6 py-4 rounded-[1.5rem] flex items-center gap-3 shadow-xl active:scale-95 transition-all text-left"><UserPlus size={20} /> Neues Mitglied</button></div>
      <div className="bg-[#121212] border border-gray-900 rounded-[3rem] overflow-hidden shadow-2xl text-left"><div className="overflow-x-auto scrollbar-hide text-left"><table className="w-full text-left border-collapse text-left"><thead className="text-left text-left text-left"><tr className="bg-black/50 border-b border-gray-900 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] text-left text-left text-left"><th className="p-8">Name</th><th className="p-8">Rolle</th><th className="p-8 text-right">Optionen</th></tr></thead><tbody className="divide-y divide-gray-900 text-left text-left text-left">
          {users.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(u => (
            <tr key={u.id} className="hover:bg-orange-500/[0.02] transition-colors group text-left text-left text-left">
              <td className="p-8 text-white font-bold text-left text-left leading-tight">{u.lastName} {u.firstName}</td>
              <td className="p-8 text-left text-left text-left"><span className={`text-[10px] px-3 py-2 rounded-xl font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 'bg-gray-900 text-gray-500'}`}>{u.role}</span></td>
              <td className="p-8 text-right flex justify-end gap-2 text-left text-left text-left">
                <button onClick={() => setEditing(u)} className="p-3 text-gray-600 hover:text-orange-500 transition-all text-left text-left"><Edit2 size={20}/></button>
                <button onClick={() => handleDel(u.id)} className="p-3 text-gray-600 hover:text-red-500 transition-all text-left text-left"><Trash2 size={20}/></button>
              </td>
            </tr>
          ))}
      </tbody></table></div></div>
    </div>
  );
}

function MemberForm({ onSubmit, initialData, onCancel }) {
  const [fn, setFn] = useState(initialData?.firstName || '');
  const [ln, setLn] = useState(initialData?.lastName || '');
  const [role, setRole] = useState(initialData?.role || 'member');
  const [grps, setGrps] = useState(initialData?.groups || []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...initialData, firstName: fn.trim(), lastName: ln.trim(), role, groups: grps, password: initialData?.password || "" }); }} className="bg-[#121212] border border-gray-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden text-left animate-in fade-in slide-in-from-top-8 max-w-2xl mx-auto">
      <div className="absolute top-0 left-0 w-full h-2 bg-orange-500 text-left"></div><h3 className="text-3xl font-black text-white mb-10 tracking-tight leading-none text-left">{initialData ? 'Bearbeiten' : 'Mitglied hinzufügen'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 text-left text-left text-left"><input type="text" required value={fn} onChange={e => setFn(e.target.value)} placeholder="Vorname" className="bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white font-bold text-left" /><input type="text" required value={ln} onChange={e => setLn(e.target.value)} placeholder="Nachname" className="bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white font-bold text-left" /></div>
      <div className="space-y-8 border-t border-gray-900 pt-10 text-left text-left">
        <div className="text-left"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 block text-left">Rolle</label><div className="bg-black border border-gray-900 p-2 rounded-2xl inline-flex gap-2 text-left"><button type="button" onClick={() => setRole('member')} className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'member' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Mitglied</button><button type="button" onClick={() => setRole('admin')} className={`px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${role === 'admin' ? 'bg-orange-500 text-black shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>Admin</button></div></div>
        <div className="text-left"><label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 block text-left">Sektionen</label><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">{GROUPS.map(g => (<label key={g} className={`flex items-center justify-center p-5 rounded-[1.5rem] border-2 cursor-pointer transition-all font-black text-[10px] uppercase tracking-widest text-center leading-none ${grps.includes(g) ? 'bg-orange-500/10 border-orange-500 text-orange-500' : 'bg-black border-gray-900 text-gray-600 hover:border-gray-800'}`}><input type="checkbox" checked={grps.includes(g)} onChange={() => setGrps(p => p.includes(g) ? p.filter(x => x !== g) : [...p, g])} className="hidden text-left" />{g}</label>))}</div></div>
      </div>
      <div className="flex justify-end gap-6 pt-12 mt-8 border-t border-gray-900 text-left"><button type="button" onClick={onCancel} className="text-gray-500 font-black uppercase text-xs tracking-widest px-4 text-left">Abbrechen</button><button type="submit" className="flex-1 bg-orange-500 text-black font-black py-5 rounded-[1.5rem] uppercase text-sm tracking-[0.2em] active:scale-95 transition-all text-center">Speichern</button></div>
    </form>
  );
}

// --- EXPORT MODAL ---
function ExportModal({ isOpen, onClose, events, minutes, onExportEvent, onExportMinute }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-[3rem] p-10 space-y-8 animate-in slide-in-from-bottom-8 flex flex-col max-h-[85vh] text-left text-left text-left text-left" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center text-left text-left text-left"><h3 className="text-3xl font-black text-white tracking-tight leading-none text-left">Dokument-Export</h3><button onClick={onClose} className="text-gray-500 hover:text-white p-2 text-left text-left text-left"><X size={28}/></button></div>
            <div className="flex-1 overflow-y-auto pr-3 space-y-10 scrollbar-hide text-left text-left text-left">
                <section className="text-left text-left text-left"><label className="text-[11px] font-black text-orange-500 uppercase tracking-[0.3em] block mb-6 ml-1 text-left text-left">Events & Resultate</label><div className="space-y-3 text-left text-left text-left text-left text-left">{events.sort((a,b) => b.date.localeCompare(a.date)).map(e => (<button key={e.id} onClick={() => onExportEvent(e)} className="w-full flex items-center justify-between p-5 bg-black border border-gray-800 rounded-[1.5rem] hover:border-orange-500/40 group transition-all text-left text-left text-left"><div className="flex items-center gap-5 text-left text-left text-left text-left"><div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-all text-left text-left"><BarChart3 size={22}/></div><div className="text-left text-left text-left text-left"><p className="text-base font-bold text-white leading-tight text-left">{e.title}</p><p className="text-[10px] text-gray-500 font-black uppercase mt-1 tracking-widest text-left">{new Date(e.date).toLocaleDateString('de-CH')}</p></div></div><FileDown size={22} className="text-gray-700 group-hover:text-orange-500 transition-colors text-left" /></button>))}</div></section>
                <section className="text-left text-left text-left"><label className="text-[11px] font-black text-blue-500 uppercase tracking-[0.3em] block mb-6 ml-1 text-left text-left text-left">Sitzungsprotokolle</label><div className="space-y-3 text-left text-left text-left text-left text-left">{minutes.sort((a,b) => b.date.localeCompare(a.date)).map(m => (<button key={m.id} onClick={() => onExportMinute(m)} className="w-full flex items-center justify-between p-5 bg-black border border-gray-800 rounded-[1.5rem] hover:border-blue-500/40 group transition-all text-left text-left text-left text-left"><div className="flex items-center gap-5 text-left text-left text-left text-left text-left"><div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all text-left text-left"><FileText size={22}/></div><div className="text-left text-left text-left text-left text-left"><p className="text-base font-bold text-white leading-tight text-left">Sitzung {new Date(m.date).toLocaleDateString('de-CH')}</p><p className="text-[10px] text-gray-500 font-black uppercase mt-1 tracking-widest text-left text-left">Protokoll</p></div></div><FileDown size={22} className="text-gray-700 group-hover:text-blue-500 transition-colors text-left" /></button>))}</div></section>
            </div>
            <p className="text-[10px] text-gray-600 text-center uppercase font-black tracking-widest border-t border-gray-900 pt-6 text-center text-center text-center text-center">Export als Microsoft Word (.doc)</p>
          </div>
        </div>
    );
}

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center mx-auto text-center text-center text-center text-center"><div className="max-w-md w-full bg-red-950/20 border border-red-900/50 rounded-[3rem] p-12 shadow-2xl text-center mx-auto text-center text-center text-center"><ShieldAlert className="mx-auto text-red-500 mb-8 text-center text-center text-center" size={64} /><h1 className="text-3xl font-black text-white mb-4 tracking-tight text-center leading-none text-center text-center">Systemfehler</h1><p className="text-red-300 text-sm mb-6 leading-relaxed italic text-center text-center text-center">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center mx-auto text-center text-center text-center text-center"><div className="max-w-2xl w-full bg-[#121212] border border-gray-900 rounded-[3.5rem] p-16 shadow-2xl text-center mx-auto text-center text-center text-center text-center"><Settings className="mx-auto text-orange-500 mb-10 text-center animate-spin-slow text-center text-center text-center" size={64} /><h1 className="text-4xl font-black text-white mb-4 tracking-tighter text-center leading-none text-center text-center">Setup erforderlich</h1><p className="text-gray-500 text-lg text-center text-center">Bitte Firebase-Daten eintragen.</p></div></div>); }
