import React, { useState, useEffect, useRef } from 'react';
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [creationTrigger, setCreationTrigger] = useState(null);

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

  const exportToWord = (title, contentHtml) => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title><style>body { font-family: Arial, sans-serif; padding: 20px; } h1 { color: #f97316; font-size: 24pt; border-bottom: 2px solid #eee; padding-bottom: 10px; } h2 { color: #444; font-size: 18pt; margin-top: 20pt; } h3 { color: #666; font-size: 14pt; margin-top: 15pt; } ul { margin-left: 20pt; } li { margin-bottom: 5pt; } .section { margin-bottom: 20pt; }</style></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + contentHtml + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], {
        type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportEvent = (event) => {
    let content = `<h1>Event: ${event.title}</h1>`;
    content += `<p><b>Datum:</b> ${new Date(event.date).toLocaleDateString('de-CH')}</p>`;
    content += `<p><b>Kategorie:</b> ${event.category}</p><br/>`;
    content += `<h2>Abstimmungsergebnisse</h2>`;
    (event.surveys || []).forEach(s => {
        content += `<div class="section"><h3>${s.title}</h3><ul>`;
        const total = (s.options || []).reduce((acc, o) => acc + (o.votes || 0), 0);
        (s.options || []).forEach(o => {
            const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
            content += `<li><b>${o.text}:</b> ${o.votes} Stimmen (${pct}%)</li>`;
        });
        content += `</ul><p>Total Stimmen: ${s.votedUsers?.length || 0}</p></div>`;
    });
    exportToWord(event.title, content);
  };

  const handleExportMinute = (minute) => {
    let content = `<h1>Protokoll: Sitzung vom ${new Date(minute.date).toLocaleDateString('de-CH')}</h1>`;
    content += `<h2>Anwesenheit</h2><ul>`;
    Object.keys(minute.attendance || {}).forEach(uid => {
        const u = users.find(user => user.id === uid);
        if(u && minute.attendance[uid]) content += `<li>${u.firstName} ${u.lastName}</li>`;
    });
    content += `</ul><br/><h2>Traktanden & Berichte</h2>`;
    Object.keys(minute.agenda || {}).forEach(role => {
        const points = minute.agenda[role];
        if(points && points.length > 0) {
            content += `<h3>${role}</h3><ul>`;
            points.forEach(p => { content += `<li>${p.text}</li>`; });
            content += `</ul>`;
        }
    });
    exportToWord(`Protokoll_${minute.date}`, content);
  };

  if (firebaseInitError) return <FatalErrorScreen message={`Firebase Fehler: ${firebaseInitError}`} />;
  if (authError || permissionsError) return <FatalErrorScreen message={authError || permissionsError} />;

  if (!fbUser || !isDBReady || isCheckingSession) {
     return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
           <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700 text-center">
              <h1 className="text-6xl sm:text-7xl font-black tracking-tighter mb-1">
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

  if (!currentUser) return <LoginScreen onLogin={handleLoginSuccess} users={users} activeSessions={activeSessions} onSeed={seedDatabase} isSeeding={isSeeding} db={db} appId={appId} deobfuscate={deobfuscate} obfuscate={obfuscate} />;

  const isBoardMember = (currentUser.groups || []).includes('Vorstand');
  const itemsCount = activeTab === 'events' ? events.filter(e => !e.isArchived).length : 
                     activeTab === 'archive' ? events.filter(e => e.isArchived).length :
                     activeTab === 'minutes' ? minutes.length : 
                     activeTab === 'search' ? "Global" : users.length;

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans selection:bg-orange-500 selection:text-white flex flex-col">
      <header className="px-6 pt-10 pb-4">
        <div className="max-w-5xl mx-auto flex justify-between items-start">
          <div className="flex flex-col text-left">
            <h1 className="text-4xl font-black tracking-tighter leading-tight cursor-default">
              <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
            <span className="text-gray-400 text-xs font-bold uppercase tracking-[0.3em] ml-0.5 mt-0.5">Ämme</span>
            <p className="text-[10px] text-gray-600 font-medium mt-2 uppercase tracking-widest">
              {activeTab === 'search' ? 'Suchergebnisse' : `${itemsCount} ${activeTab === 'events' ? 'Events' : activeTab === 'archive' ? 'Archiv' : activeTab === 'minutes' ? 'Protokolle' : 'Mitglieder'} total`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
             <div className="bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{activeSessions.length} aktiv</span>
             </div>
             <button onClick={handleLogout} className="text-gray-500 hover:text-orange-500 transition-colors"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <div className="px-6 py-4 overflow-x-auto scrollbar-hide">
        <div className="max-w-5xl mx-auto flex gap-3">
          <TabButton active={activeTab === 'events'} onClick={() => { setActiveTab('events'); setCreationTrigger(null); }} label="EVENTS" />
          {isBoardMember && <TabButton active={activeTab === 'minutes'} onClick={() => { setActiveTab('minutes'); setCreationTrigger(null); }} label="PROTOKOLLE" />}
          <TabButton active={activeTab === 'archive'} onClick={() => { setActiveTab('archive'); setCreationTrigger(null); }} label="ARCHIV" />
        </div>
      </div>

      <main className="flex-1 px-6 pt-4 pb-24 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'search' && <SearchView events={events} minutes={minutes} isBoardMember={isBoardMember} />}
          {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} forceCreate={creationTrigger === 'event'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
          {activeTab === 'minutes' && isBoardMember && <MinutesView minutes={minutes} users={users} dbAppId={appId} db={db} fbUser={fbUser} forceCreate={creationTrigger === 'minute'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} fbUser={fbUser} deobfuscate={deobfuscate} obfuscate={obfuscate} forceCreate={creationTrigger === 'member'} onCreated={() => setCreationTrigger(null)} />}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-gray-900 px-6 py-4 z-20">
        <div className="max-w-xl mx-auto flex justify-between items-center relative">
          <button onClick={() => { setActiveTab('events'); setCreationTrigger(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'events' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Calendar size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">EVENTS</span>
          </button>
          <button onClick={() => setActiveTab('search')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'search' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Search size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">SUCHE</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 -top-10">
            <button onClick={() => setShowCreateModal(true)} className="bg-orange-500 text-black w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform border-4 border-black"><Plus size={32} strokeWidth={3} /></button>
          </div>
          <div className="w-12"></div>
          <button onClick={() => { setActiveTab('members'); setCreationTrigger(null); }} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'members' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Users size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">STAMMDATEN</span>
          </button>
          <button onClick={() => setShowExportModal(true)} className={`flex flex-col items-center gap-1 transition-colors ${showExportModal ? 'text-orange-500' : 'text-gray-500'}`}>
            <FileOutput size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">EXPORT</span>
          </button>
        </div>
      </footer>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowCreateModal(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-3xl p-6 space-y-3 animate-in slide-in-from-bottom-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold text-lg mb-4 text-center">Neu erfassen</h3>
            <CreateOption icon={<Calendar />} label="Neuer Event" onClick={() => { setActiveTab('events'); setCreationTrigger('event'); setShowCreateModal(false); }} />
            {isBoardMember && <CreateOption icon={<FileText />} label="Neues Protokoll" onClick={() => { setActiveTab('minutes'); setCreationTrigger('minute'); setShowCreateModal(false); }} />}
            {currentUser.role === 'admin' && <CreateOption icon={<UserPlus />} label="Neues Mitglied" onClick={() => { setActiveTab('members'); setCreationTrigger('member'); setShowCreateModal(false); }} />}
            <button onClick={() => setShowCreateModal(false)} className="w-full py-4 text-gray-500 font-bold uppercase text-xs tracking-widest pt-4 mt-2 border-t border-gray-800">Abbrechen</button>
          </div>
        </div>
      )}

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowExportModal(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-white tracking-tight leading-none">Dokument-Export</h3>
                <button onClick={() => setShowExportModal(false)} className="text-gray-500 hover:text-white p-2"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-8 scrollbar-hide">
                <section className="text-left">
                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest block mb-4 ml-1">Events</label>
                    <div className="space-y-2">
                        {events.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(e => (
                            <button key={e.id} onClick={() => handleExportEvent(e)} className="w-full flex items-center justify-between p-4 bg-black border border-gray-800 rounded-2xl hover:border-orange-500/40 transition-all text-left group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-colors">
                                        <BarChart3 size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white leading-tight">{e.title}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-tighter">{new Date(e.date).toLocaleDateString('de-CH')}</p>
                                    </div>
                                </div>
                                <FileDown size={18} className="text-gray-600 group-hover:text-orange-500 transition-colors" />
                            </button>
                        ))}
                    </div>
                </section>
                <section className="text-left">
                    <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-4 ml-1">Protokolle</label>
                    <div className="space-y-2">
                        {minutes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(m => (
                            <button key={m.id} onClick={() => handleExportMinute(m)} className="w-full flex items-center justify-between p-4 bg-black border border-gray-800 rounded-2xl hover:border-blue-500/40 transition-all text-left group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <FileText size={18} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white leading-tight">Sitzung vom {new Date(m.date).toLocaleDateString('de-CH')}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-tighter">Protokoll</p>
                                    </div>
                                </div>
                                <FileDown size={18} className="text-gray-600 group-hover:text-blue-500 transition-colors" />
                            </button>
                        ))}
                    </div>
                </section>
            </div>
            <p className="text-[9px] text-gray-600 text-center uppercase font-black tracking-widest border-t border-gray-900 pt-4">Export als Word Dokument (.doc)</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- SEARCH VIEW ---
function SearchView({ events, minutes, isBoardMember }) {
    const [query, setQuery] = useState('');
    
    const filteredEvents = query.length < 2 ? [] : events.filter(e => 
        e.title?.toLowerCase().includes(query.toLowerCase()) ||
        (e.surveys || []).some(s => s.title?.toLowerCase().includes(query.toLowerCase()))
    );

    const filteredMinutes = (query.length < 2 || !isBoardMember) ? [] : minutes.filter(m => 
        new Date(m.date).toLocaleDateString('de-CH').includes(query) ||
        Object.values(m.agenda || {}).some(points => 
            points.some(p => p.text?.toLowerCase().includes(query.toLowerCase()))
        )
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            <div className="relative text-left">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input 
                    type="text" 
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Suche Events, Umfragen, Protokolle..."
                    className="w-full bg-[#121212] border border-gray-900 rounded-[1.5rem] pl-14 pr-6 py-5 text-white focus:outline-none focus:border-orange-500 font-bold transition-all shadow-xl"
                />
            </div>

            {query.length > 0 && query.length < 2 && (
                <p className="text-center text-gray-500 text-xs font-black uppercase tracking-widest">Gib mindestens 2 Zeichen ein...</p>
            )}

            {query.length >= 2 && (
                <div className="space-y-10">
                    {filteredEvents.length > 0 && (
                        <section className="text-left">
                            <h4 className="text-xs font-black text-orange-500 uppercase tracking-widest mb-4 ml-2">Events & Umfragen</h4>
                            <div className="grid gap-3">
                                {filteredEvents.map(e => (
                                    <div key={e.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left">
                                        <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center"><Calendar size={20}/></div>
                                        <div className="text-left">
                                            <p className="text-white font-bold">{e.title}</p>
                                            <p className="text-[10px] text-gray-500 uppercase font-black">{new Date(e.date).toLocaleDateString('de-CH')} • {e.category}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredMinutes.length > 0 && (
                        <section className="text-left">
                            <h4 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4 ml-2">Protokollinhalte</h4>
                            <div className="grid gap-3">
                                {filteredMinutes.map(m => (
                                    <div key={m.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left">
                                        <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center"><FileText size={20}/></div>
                                        <div className="text-left">
                                            <p className="text-white font-bold">Sitzung vom {new Date(m.date).toLocaleDateString('de-CH')}</p>
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Vorstandsprotokoll</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredEvents.length === 0 && filteredMinutes.length === 0 && (
                        <div className="text-center py-20 opacity-40">
                            <Search size={48} className="mx-auto mb-4" />
                            <p className="font-black uppercase text-xs tracking-widest">Keine Ergebnisse gefunden.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
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

function CreateOption({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-4 p-4 bg-gray-950 border border-gray-800 rounded-2xl hover:border-orange-500/50 transition-all group text-left">
      <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-colors">
        {React.cloneElement(icon, { size: 20 })}
      </div>
      <span className="text-white font-bold">{label}</span>
    </button>
  );
}

function EmptyPlaceholder({ message }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 text-center opacity-60">
            <div className="w-24 h-24 border-2 border-gray-800 rounded-3xl flex items-center justify-center mb-6 text-gray-800 mx-auto">
                <Package size={40} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Noch nix da.</h3>
            <p className="text-sm text-gray-500">{message || 'Drück den orangen Knopf.'}</p>
        </div>
    );
}

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
        <div className="flex flex-col items-center mb-12 text-center mx-auto">
            <h1 className="text-6xl font-black mb-1 tracking-tighter leading-none text-center">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
            <span className="text-gray-400 text-lg font-bold uppercase tracking-[0.4em] ml-2 text-center">Ämme</span>
        </div>

        <div className="bg-[#121212] border border-gray-900 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden text-left">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-orange-500"></div>
            {users.length === 0 ? (
                <div className="py-6 flex flex-col items-center text-center">
                    <Database className="text-gray-700 mb-6" size={56} />
                    <h3 className="text-white font-bold text-xl mb-6 tracking-tight">Datenbank bereitstellen</h3>
                    <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 text-black font-black py-4 rounded-2xl uppercase text-xs tracking-widest shadow-lg">Vereinsdaten laden</button>
                </div>
            ) : (
                <>
                {step === 'name' && (
                    <form onSubmit={checkName} className="space-y-5 text-left">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Vorname</label>
                            <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest mb-1 block">Nachname</label>
                            <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors font-bold" />
                        </div>
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl mt-4 uppercase text-xs tracking-[0.2em] shadow-xl active:scale-[0.98] transition-all">Anmelden</button>
                    </form>
                )}
                {step === 'password' && (
                    <form onSubmit={handlePasswordSubmit} className="space-y-6 text-center">
                        <div className="flex flex-col items-center gap-3 mb-2 text-center mx-auto">
                            <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center text-orange-500 mx-auto">
                                <Lock size={32} />
                            </div>
                            <span className="text-[11px] font-black text-orange-500 uppercase tracking-widest">Vorstand Login</span>
                        </div>
                        <input type="password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" className="w-full bg-black border border-gray-800 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-orange-500 transition-colors text-center text-2xl tracking-[0.5em] font-black" />
                        <button type="submit" className="w-full bg-orange-500 text-black font-black py-5 rounded-2xl uppercase text-xs tracking-[0.2em] shadow-lg active:scale-95 transition-all">Entsperren</button>
                        <button type="button" onClick={() => setStep('name')} className="text-gray-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors mt-2 mx-auto block">Zurück</button>
                    </form>
                )}
                {step === 'setup' && (
                    <form onSubmit={handleSetupSubmit} className="space-y-6 text-left">
                        <div className="flex flex-col items-center gap-3 text-center mx-auto">
                            <ShieldAlert size={40} className="text-blue-500 mx-auto" />
                            <div className="text-center mx-auto"><span className="text-xs font-black block uppercase text-blue-400 mb-1">Passwort einrichten</span><span className="text-[10px] text-gray-500 italic block leading-tight">Privater Vorstandszugang.</span></div>
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

function MinutesView({ minutes, users, dbAppId, db, fbUser, forceCreate, onCreated }) {
  const [editingMinute, setEditingMinute] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => { if(forceCreate) setIsCreating(true); }, [forceCreate]);

  const handleSave = async (data) => {
    if (!fbUser) return;
    const id = data.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...data, id });
    setIsCreating(false);
    setEditingMinute(null);
    if(onCreated) onCreated();
  };

  const handleDelete = async (id) => {
    if (!fbUser || !confirm('Protokoll unwiderruflich löschen?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id));
  };

  if (isCreating || editingMinute) {
    return <MinutesForm initialData={editingMinute} boardMembers={users.filter(u => (u.groups || []).includes('Vorstand'))} onSave={handleSave} onCancel={() => { setIsCreating(false); setEditingMinute(null); if(onCreated) onCreated(); }} />;
  }

  return (
    <div className="space-y-4 text-left">
      {minutes.length === 0 ? <EmptyPlaceholder message="Erfasse das erste Protokoll." /> : (
        <div className="grid gap-3 text-left">{minutes.sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(m => (
            <div key={m.id} className="bg-[#121212] border border-gray-900 p-5 rounded-3xl flex justify-between items-center group hover:border-orange-500/30 transition-all shadow-lg text-left">
              <div className="flex items-center gap-4 text-left">
                <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center text-orange-500 border border-gray-900">
                  <FileText size={24} />
                </div>
                <div className="text-left">
                   <h3 className="text-lg font-bold text-white text-left leading-tight">Sitzung vom {new Date(m.date).toLocaleDateString('de-CH')}</h3>
                   <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1 text-left">Vorstandsprotokoll</p>
                </div>
              </div>
              <div className="flex gap-1 text-left">
                <button onClick={() => setEditingMinute(m)} className="p-3 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition-all" title="Bearbeiten"><Edit2 size={18} /></button>
                <button onClick={() => handleDelete(m.id)} className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Löschen"><Trash2 size={18} /></button>
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
    <form onSubmit={(e) => { e.preventDefault(); onSave({ id: initialData?.id, date, attendance, agenda }); }} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20 text-left">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div className="flex items-center gap-4 text-left"><button type="button" onClick={onCancel} className="text-gray-400 hover:text-white bg-[#121212] p-2 rounded-lg border border-gray-800 transition-all shadow-lg active:scale-90"><ChevronRight className="rotate-180" size={20} /></button><h2 className="text-2xl font-bold text-white tracking-tight text-left leading-none">{initialData ? 'Protokoll bearbeiten' : 'Neue Sitzung'}</h2></div>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-black px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg active:scale-95 text-left"><Save size={18} /> Speichern</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
        <div className="lg:col-span-1 space-y-6 text-left">
          <div className="bg-[#121212] border border-gray-900 p-6 rounded-2xl shadow-xl text-left">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1 text-left">Datum</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 focus:outline-none font-bold text-left" />
          </div>
          <div className="bg-[#121212] border border-gray-900 p-6 rounded-2xl shadow-xl text-left">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2 text-left"><ClipboardCheck size={16} className="text-orange-500" /> Anwesenheit</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide text-left">
              {boardMembers.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(m => (
                <div key={m.id} onClick={() => toggleAttendance(m.id)} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${attendance[m.id] ? 'bg-orange-500/10 border-orange-500/30' : 'bg-black border-gray-900 opacity-60'} text-left`}>
                  <span className="text-sm font-bold text-white text-left">{m.firstName} {m.lastName}</span>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${attendance[m.id] ? 'bg-orange-500 border-orange-500' : 'border-gray-700'} text-left`}>{attendance[m.id] && <Check size={12} className="text-black stroke-[4]" />}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4 text-left">
          <div className="bg-[#121212] border border-gray-900 p-6 rounded-2xl shadow-xl text-left">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-6 flex items-center gap-2 text-left"><FileText size={16} className="text-orange-500" /> Traktanden</h3>
            <div className="space-y-8 text-left">
              {BOARD_ROLES.map(role => (
                <div key={role} className="space-y-4 pb-6 border-b border-gray-900 last:border-0 text-left">
                  <label className="block text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] ml-1 text-left">{role}</label>
                  <div className="space-y-3 text-left">
                    {(agenda[role] || []).map((point, idx) => (
                      <div key={idx} className="flex flex-col gap-3 p-4 bg-black border border-gray-900 rounded-xl group hover:border-gray-700 transition-all shadow-sm text-left">
                        {editingPoint.role === role && editingPoint.index === idx ? (
                          <div className="flex gap-2 text-left"><textarea autoFocus value={editingPoint.text} onChange={e => setEditingPoint({...editingPoint, text: e.target.value})} className="flex-1 bg-gray-900 border border-orange-500/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all resize-none font-medium text-left" rows={2} /><div className="flex flex-col gap-1 text-left"><button type="button" onClick={saveEdit} className="p-2 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/30 transition-all text-left"><Check size={16}/></button><button type="button" onClick={() => setEditingPoint({ role: null, index: null, text: '' })} className="p-2 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-all text-left"><X size={16}/></button></div></div>
                        ) : (
                          <div className="space-y-2 text-left text-left">
                            <div className="flex items-start gap-3 text-left">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50 mt-1.5 shrink-0 text-left"></div>
                                <p className="text-sm text-gray-300 flex-1 whitespace-pre-wrap leading-relaxed text-left leading-relaxed">{point.text}</p>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all text-left">
                                    <button type="button" onClick={() => { setUploadingFor({role, index: idx}); fileInputRef.current?.click(); }} className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg text-left" title="Datei anhängen"><Paperclip size={16} /></button>
                                    <button type="button" onClick={() => startEditing(role, idx, point.text)} className="p-1.5 text-gray-500 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg text-left" title="Bearbeiten"><Edit2 size={16} /></button>
                                    <button type="button" onClick={() => removePoint(role, index)} className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg text-left" title="Löschen"><Trash2 size={16} /></button>
                                </div>
                            </div>
                            {point.files && point.files.length > 0 && (<div className="flex flex-wrap gap-2 ml-4 text-left">{point.files.map((file, fi) => (<div key={fi} className="flex items-center gap-2 bg-[#121212] border border-gray-900 px-3 py-1.5 rounded-lg group/file shadow-sm text-left"><File size={12} className="text-orange-500/70" /><span className="text-[10px] text-gray-400 font-medium truncate max-w-[120px] uppercase text-left">{file.name}</span><div className="flex gap-1 text-left text-left"><button type="button" onClick={() => downloadFile(file)} className="p-1 text-gray-500 hover:text-orange-400 transition-colors text-left"><Download size={12}/></button><button type="button" onClick={() => removeFile(role, idx, fi)} className="p-1 text-gray-500 hover:text-red-500 transition-colors text-left text-left"><X size={12}/></button></div></div>))}</div>)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4 text-left text-left text-left text-left"><input type="text" value={newPoints[role]} onChange={e => handleNewPointChange(role, e.target.value)} onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addPoint(role))} placeholder="Punkt erfassen..." className="flex-1 bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none transition-all shadow-inner font-bold text-left" /><button type="button" onClick={() => addPoint(role)} className="bg-gray-800 hover:bg-gray-700 text-orange-500 p-2.5 rounded-xl transition-all shadow-sm text-left"><Plus size={20} /></button></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function MembersView({ users, dbAppId, db, fbUser, deobfuscate, obfuscate, forceCreate, onCreated }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { if(forceCreate) setShowAdd(true); }, [forceCreate]);

  const handleAddUser = async (user) => { 
    if (!fbUser) return; 
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...user, id }); 
    setShowAdd(false); 
    if(onCreated) onCreated();
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
      return <MemberForm onSubmit={editingUser ? handleUpdateUser : handleAddUser} initialData={editingUser} onCancel={() => { setShowAdd(false); setEditingUser(null); if(onCreated) onCreated(); }} />;
  }

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-wrap justify-between items-center gap-4 text-left">
        <div className="flex gap-2 text-left">
            <button onClick={() => setShowImport(!showImport)} className="bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors border border-gray-800 shadow-lg text-left">
                <FileSpreadsheet size={18} /> Import
            </button>
            <button onClick={() => setShowAdd(true)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-xl active:scale-95 text-left text-left">
                <UserPlus size={18} /> Neu
            </button>
        </div>
      </div>
      
      {showImport && (
        <div className="bg-[#121212] border border-gray-900 p-8 rounded-3xl text-center animate-in fade-in slide-in-from-top-2 duration-300 shadow-xl text-center">
            <Upload className="mx-auto text-orange-500 mb-4 text-center" size={40} />
            <h3 className="text-white font-bold text-lg mb-2 text-center leading-none">CSV Import</h3>
            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleCsvUpload} className="hidden text-center" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-orange-500 text-black font-black px-8 py-3 rounded-xl shadow-lg uppercase text-[10px] tracking-widest text-center mt-4">Datei auswählen</button>
        </div>
      )}

      {users.length === 0 ? <EmptyPlaceholder message="Keine Mitglieder gefunden." /> : (
        <div className="bg-[#121212] border border-gray-900 rounded-3xl overflow-hidden shadow-2xl text-left">
            <div className="overflow-x-auto scrollbar-hide text-left">
            <table className="w-full text-left border-collapse text-left text-left">
                <thead>
                <tr className="bg-black/50 border-b border-gray-900 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] text-left">
                    <th className="p-6">Name</th><th className="p-6">Rolle</th><th className="p-6">Sektionen</th><th className="p-6 text-right">Optionen</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 text-left">
                {users.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(u => (
                    <tr key={u.id} className="hover:bg-orange-500/[0.02] transition-colors group text-left text-left text-left">
                    <td className="p-6 text-white font-bold text-left leading-tight text-left">{u.lastName} {u.firstName}</td>
                    <td className="p-6 text-left">
                        <span className={`text-[10px] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest inline-flex items-center gap-2 ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20 text-left' : 'bg-gray-900 text-gray-400'}`}>
                            {u.role}
                        </span>
                    </td>
                    <td className="p-6 text-left">
                        <div className="flex flex-wrap gap-2 text-left text-left">
                            {(u.groups || []).map(g => (
                                <span key={g} className="text-[10px] bg-black border border-gray-900 px-3 py-1 rounded-lg text-gray-400 font-bold uppercase tracking-tighter text-left">{g}</span>
                            ))}
                        </div>
                    </td>
                    <td className="p-6 text-right flex justify-end gap-1 text-left text-left">
                        {(u.groups || []).includes('Vorstand') && (
                            <button onClick={() => resetPassword(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all text-left" title="Reset PW"><Key size={18} /></button>
                        )}
                        <button onClick={() => setEditingUser(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all text-left" title="Edit"><Edit2 size={18} /></button>
                        <button onClick={() => removeUser(u.id)} className="text-gray-500 hover:text-red-500 p-2 rounded-lg transition-all text-left" title="Delete"><Trash2 size={18} /></button>
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

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center"><div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-3xl p-10 shadow-2xl text-center shadow-red-500/10"><ShieldAlert className="mx-auto text-red-500 mb-6 text-center" size={60} /><h1 className="text-3xl font-black text-white mb-3 tracking-tight text-center leading-none text-center">Systemfehler</h1><p className="text-red-300 text-sm mb-6 leading-relaxed italic text-center text-center">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center text-center"><div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-3xl p-10 shadow-2xl text-center"><Settings className="mx-auto text-orange-500 mb-6 text-center animate-spin-slow" size={60} /><h1 className="text-3xl font-black text-white mb-2 tracking-tight text-center text-center leading-none text-center">Konfiguration fehlt</h1><p className="text-gray-400 text-center text-center">Bitte Firebase-Daten in der App.jsx eintragen.</p></div></div>); }
