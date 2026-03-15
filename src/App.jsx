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
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
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
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center">
           <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
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

  const isExpired = (event) => {
    if (!event.endDate) return false;
    return new Date(event.endDate) < new Date();
  };

  const filteredItemsCount = () => {
    if (activeTab === 'events') return events.filter(e => !e.isArchived && !isExpired(e)).length;
    if (activeTab === 'archive') return events.filter(e => e.isArchived || isExpired(e)).length;
    if (activeTab === 'minutes') return minutes.length;
    return users.length;
  };

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
              {activeTab === 'search' ? 'Suchergebnisse' : `${filteredItemsCount()} ${activeTab === 'events' ? 'Events' : activeTab === 'archive' ? 'Archiv' : activeTab === 'minutes' ? 'Protokolle' : 'Mitglieder'} total`}
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
          {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived && !isExpired(e))} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} forceCreate={creationTrigger === 'event'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived || isExpired(e))} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
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
                            <button key={e.id} onClick={() => handleExportEvent(e)} className="w-full flex items-center justify-between p-4 bg-black border border-gray-800 rounded-2xl hover:border-orange-500/40 transition-all text-left group text-left">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-10 h-10 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center group-hover:bg-orange-500 group-hover:text-black transition-colors">
                                        <BarChart3 size={18} />
                                    </div>
                                    <div className="text-left">
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
                            <button key={m.id} onClick={() => handleExportMinute(m)} className="w-full flex items-center justify-between p-4 bg-black border border-gray-800 rounded-2xl hover:border-blue-500/40 transition-all text-left group text-left">
                                <div className="flex items-center gap-4 text-left">
                                    <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                        <FileText size={18} />
                                    </div>
                                    <div className="text-left text-left">
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
                        <section className="text-left text-left">
                            <h4 className="text-xs font-black text-orange-500 uppercase tracking-widest mb-4 ml-2">Events & Umfragen</h4>
                            <div className="grid gap-3 text-left text-left">
                                {filteredEvents.map(e => (
                                    <div key={e.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left">
                                        <div className="w-12 h-12 bg-orange-500/10 text-orange-500 rounded-xl flex items-center justify-center"><Calendar size={20}/></div>
                                        <div className="text-left text-left">
                                            <p className="text-white font-bold">{e.title}</p>
                                            <p className="text-[10px] text-gray-500 uppercase font-black">{new Date(e.date).toLocaleDateString('de-CH')} • {e.category}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredMinutes.length > 0 && (
                        <section className="text-left text-left text-left text-left text-left">
                            <h4 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-4 ml-2">Protokollinhalte</h4>
                            <div className="grid gap-3 text-left text-left text-left">
                                {filteredMinutes.map(m => (
                                    <div key={m.id} className="bg-[#121212] border border-gray-900 p-5 rounded-2xl flex items-center gap-4 text-left">
                                        <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center"><FileText size={20}/></div>
                                        <div className="text-left text-left text-left text-left">
                                            <p className="text-white font-bold">{new Date(m.date).toLocaleDateString('de-CH')}</p>
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Vorstandsprotokoll</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredEvents.length === 0 && filteredMinutes.length === 0 && (
                        <div className="text-center py-20 opacity-40 text-center mx-auto text-center">
                            <Search size={48} className="mx-auto mb-4 text-center" />
                            <p className="font-black uppercase text-xs tracking-widest text-center text-center">Keine Ergebnisse gefunden.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// --- EVENTS & SURVEY COMPONENTS ---

function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db, fbUser, forceCreate, onCreated }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  
  useEffect(() => { if(forceCreate) setShowCreate(true); }, [forceCreate]);

  const handleCreateOrUpdate = async (n) => {
    if (!fbUser) return;
    const id = n.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...n, id, isArchived: n.isArchived || false, surveys: n.surveys || [] });
    setShowCreate(false);
    setEditingEvent(null);
    if(onCreated) onCreated();
  };

  const handleArchive = async (id, s) => {
    if (!fbUser) return;
    const e = events.find(ev => ev.id === id);
    if(e) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...e, isArchived: s });
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async (id) => {
    if (!fbUser || !confirm('Event wirklich löschen?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id));
    setSelectedEvent(null);
  };
  
  if (selectedEvent) { 
      const evData = events.find(e => e.id === selectedEvent.id); 
      if (evData) {
          return <EventDetail event={evData} onBack={() => setSelectedEvent(null)} onEdit={() => { setEditingEvent(evData); setSelectedEvent(null); }} onArchive={handleArchive} onDelete={handleDeleteEvent} currentUser={currentUser} users={users} dbAppId={dbAppId} db={db} fbUser={fbUser} />; 
      } else {
          setSelectedEvent(null);
          return null;
      }
  }
  
  return (
    <div className="space-y-6 text-left">
      {(showCreate || editingEvent) && <CreateEventForm initialData={editingEvent} onSubmit={handleCreateOrUpdate} onCancel={() => { setShowCreate(false); setEditingEvent(null); if(onCreated) onCreated(); }} />}
      {events.length === 0 ? <EmptyPlaceholder message={isArchive ? "Archiv leer." : "Keine aktuellen Events."} /> : (
        <div className="grid gap-4 md:grid-cols-2">
            {events.map(e => (
                <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-[#121212] border border-gray-900 p-6 rounded-3xl cursor-pointer hover:border-orange-500/50 transition-all group active:scale-[0.98] shadow-lg text-left relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2 text-left">
                        <div className="flex flex-wrap gap-2 text-left">
                            <span className="text-[10px] font-bold text-orange-500 uppercase bg-orange-500/10 px-2 py-1 rounded-md border border-orange-500/20 text-left">{e.category}</span>
                            {(e.endDate && new Date(e.endDate) < new Date() && !e.isArchived) && <span className="text-[10px] font-bold text-red-500 uppercase bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20 flex items-center gap-1 text-left"><Clock size={10}/> ABGELAUFEN</span>}
                        </div>
                        <ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <h3 className="text-xl font-bold text-white mt-1 mb-4 group-hover:text-orange-50 transition-colors text-left leading-tight">{e.title}</h3>
                    <div className="flex justify-between text-xs text-gray-500 font-bold pt-4 border-t border-gray-800/50 text-left">
                        <span className="flex items-center gap-1 text-left"><Calendar size={14} className="text-orange-500" /> {new Date(e.date).toLocaleDateString('de-CH')}</span>
                        <span className="flex items-center gap-1 text-left"><BarChart3 size={14} className="text-orange-500" /> {(e.surveys || []).length} Umfragen</span>
                    </div>
                </div>
            ))}
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
  const submit = (e) => { e.preventDefault(); const finalCategory = category === 'Freitext' ? customCategory.trim() : category; onSubmit({ ...initialData, title, category: finalCategory, date, endDate }); };
  return (
    <form onSubmit={submit} className="bg-[#121212] border border-gray-900 p-8 rounded-3xl mb-8 space-y-6 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-top-4 text-left">
      <div className="absolute top-0 left-0 w-full h-2 bg-orange-500"></div>
      <h3 className="text-2xl font-black text-white tracking-tight leading-none mb-6">{initialData ? 'Event bearbeiten' : 'Neuen Event erfassen'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest text-left">Titel</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" className="w-full bg-black border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest text-left">Kategorie</label><select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>{category === 'Freitext' && (<input type="text" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Kategorie Name" className="w-full mt-2 bg-black border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-orange-500 font-bold" />)}</div>
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest text-left">Datum</label><input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
        <div className="space-y-1"><label className="block text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest text-left">Ende (Archiv)</label><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-4 py-3 text-white focus:border-orange-500 font-bold focus:outline-none" /></div>
      </div>
      <div className="flex justify-end gap-4 pt-2 text-left">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-bold text-xs uppercase tracking-widest text-left">Abbrechen</button>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-xs tracking-widest text-left">Speichern</button>
      </div>
    </form>
  );
}

function EventDetail({ event, onBack, onEdit, onArchive, onDelete, currentUser, users, dbAppId, db, fbUser }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
  const handleAddSurvey = async (newSurvey) => { if (!fbUser) return; const updatedSurveys = [...(event.surveys || []), { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }]; await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); setShowCreateSurvey(false); };
  const updateSurvey = async (surveyId, updates) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => s.id === surveyId ? { ...s, ...updates } : s); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  const handleVote = async (surveyId, selectedOptionIds) => { if (!fbUser) return; const updatedSurveys = (event.surveys || []).map(s => { if (s.id === surveyId) { const updatedOptions = s.options.map(opt => selectedOptionIds.includes(opt.id) ? { ...opt, votes: (opt.votes || 0) + 1 } : opt); return { ...s, options: updatedOptions, votedUsers: [...(s.votedUsers || []), currentUser.id] }; } return s; }); await setDoc(getDbRef(), { ...event, surveys: updatedSurveys }); };
  
  const isExp = event.endDate && new Date(event.endDate) < new Date();
  const isActuallyArchived = event.isArchived || isExp;
  const surveys = event.surveys || [];
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 text-left text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 text-left text-left"><div className="flex items-center gap-5 text-left text-left"><button onClick={onBack} className="text-gray-400 hover:text-white bg-[#121212] p-3 rounded-2xl border border-gray-800 transition-all hover:bg-gray-800 active:scale-90 shadow-lg text-left"><ChevronRight className="rotate-180" size={24} /></button><div className="flex-1 text-left text-left text-left text-left"><h2 className="text-3xl font-black text-white tracking-tight text-left text-left leading-tight">{event.title}</h2><div className="flex flex-wrap items-center gap-3 text-left text-left"><p className="text-sm text-gray-500 font-bold uppercase tracking-widest text-left">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>{isActuallyArchived && <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black uppercase px-3 py-1 rounded-lg border border-orange-500/20 tracking-wider text-left text-left">Archiviert</span>}</div></div></div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2 text-left">
            <button onClick={onEdit} className="p-3 bg-black border border-gray-800 rounded-2xl text-gray-400 hover:text-blue-500 transition-all"><Edit2 size={18} /></button>
            <button onClick={() => onArchive(event.id, !event.isArchived)} className="p-3 bg-black border border-gray-800 rounded-2xl text-gray-400 hover:text-orange-500 transition-all"><Archive size={18} /></button>
            <button onClick={() => onDelete(event.id)} className="p-3 bg-black border border-gray-800 rounded-2xl text-gray-400 hover:text-red-500 transition-all"><Trash2 size={18} /></button>
            {!isActuallyArchived && <button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-6 py-3 rounded-2xl shadow-xl active:scale-95 text-[10px] uppercase tracking-widest ml-2 transition-all">{showCreateSurvey ? 'Abbruch' : <><Plus size={16} className="mr-1"/> Umfrage</>}</button>}
          </div>
        )}
      </div>
      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} isMusicMode={event.category === 'Liederwahl'} />}
      <div className="space-y-8 text-left text-left text-left">{surveys.length === 0 ? <p className="text-gray-500 text-center py-20 bg-gray-900/30 rounded-[2.5rem] border border-dashed border-gray-800 font-bold uppercase text-[10px] tracking-[0.2em] italic text-center">Keine Umfragen.</p> : (surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(u) => updateSurvey(survey.id, u)} onVote={(o) => handleVote(survey.id, o)} users={users} isArchivedView={isActuallyArchived} />))}</div>
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
  const submit = (e) => { e.preventDefault(); const validOptions = options.filter(o => o.text.trim() !== '').map((o, i) => ({ id: `o${i}-${Date.now()}`, text: o.text.trim(), link: o.link.trim(), votes: 0 })); onSubmit({ title, maxAnswers, allowedGroups, options: validOptions }); };
  return (
    <form onSubmit={submit} className="bg-[#121212] border border-gray-900 p-8 rounded-[2.5rem] mb-8 shadow-xl animate-in slide-in-from-top-4 duration-300 text-left">
      <h3 className="text-xl font-bold text-white mb-6 uppercase tracking-wider border-b border-gray-800 pb-4 text-left">Umfrage Details</h3>
      <div className="space-y-6 text-left">
        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-1 ml-1 tracking-widest text-left">Frage / Titel</label><input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder={isMusicMode ? "Z.B. Welches Lied?" : "Frage eingeben..."} className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 focus:outline-none transition-all font-bold text-left text-left" /></div>
        <div><label className="block text-[10px] font-black text-gray-500 uppercase mb-3 ml-1 tracking-widest text-left">Optionen (Max. 10)</label>
            <div className="space-y-4 text-left">
                {options.map((opt, i) => (
                    <div key={opt.id} className="space-y-3 p-4 bg-black border border-gray-800 rounded-2xl text-left">
                        <div className="flex gap-2 text-left">
                            <input type="text" required value={opt.text} onChange={e => handleOptionChange(opt.id, 'text', e.target.value)} placeholder={`Option ${i + 1}`} className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:border-orange-500 text-sm font-bold text-left" />
                            <button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 2} className="p-2.5 text-gray-600 hover:text-red-500 disabled:opacity-30 transition-all"><Trash2 size={20} /></button>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-950 border border-gray-900 px-4 py-2 rounded-xl focus-within:border-orange-500/50 transition-all">
                            <Youtube size={16} className="text-gray-600" />
                            <input type="url" value={opt.link} onChange={e => handleOptionChange(opt.id, 'link', e.target.value)} placeholder="YouTube Link (optional)" className="flex-1 bg-transparent border-none text-[10px] text-gray-400 focus:ring-0 font-mono" />
                        </div>
                    </div>
                ))}
            </div>
            <button type="button" onClick={addOption} className="text-orange-500 text-[10px] font-black uppercase tracking-widest mt-4 flex items-center gap-2 hover:text-orange-400 transition-all ml-1 text-left"><Plus size={16} className="bg-orange-500/10 rounded-full p-0.5 text-left"/> Weitere Option</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-gray-800 pt-6 mt-4 text-left text-left"><div><label className="block text-[10px] font-black text-gray-500 uppercase mb-2 ml-1 tracking-widest text-left text-left">Max. Stimmen</label><input type="number" min="1" max="10" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-3 text-white focus:border-orange-500 transition-all font-bold focus:outline-none text-left text-left" /></div><div><label className="block text-[10px] font-black text-gray-500 uppercase mb-2 ml-1 tracking-widest text-left text-left text-left">Wahlberechtigte</label><div className="grid grid-cols-2 gap-2 text-left text-left text-left">{GROUPS.map(g => (<label key={g} className="text-[11px] text-gray-400 font-bold flex items-center gap-2 cursor-pointer hover:text-white transition-all text-left text-left text-left text-left"><input type="checkbox" checked={allowedGroups.includes(g)} onChange={() => handleGroupToggle(g)} className="w-4 h-4 accent-orange-500 rounded text-left text-left text-left" />{g}</label>))}</div></div></div>
      </div>
      <div className="flex justify-end mt-8 text-left text-left text-left text-left"><button type="submit" className="bg-orange-500 hover:bg-orange-600 text-black font-black px-10 py-4 rounded-2xl transition-all shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-xs tracking-widest text-left">Speichern</button></div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users, isArchivedView }) {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const votedUsers = survey.votedUsers || [];
  const totalVotes = survey.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
  const eligibleUsersCount = users.filter(u => survey.allowedGroups.some(g => (u.groups || []).includes(g))).length;
  const hasVoted = votedUsers.includes(currentUser.id);
  const isEligible = currentUser.role === 'admin' || survey.allowedGroups.some(g => (currentUser.groups || []).includes(g));
  if (!isEligible && currentUser.role !== 'admin') return null; 
  if (currentUser.role !== 'admin' && survey.status === 'draft') return null;
  const max = survey.maxAnswers || 1;
  const toggleOption = (id) => { if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id)); else if (max === 1) setSelectedOptions([id]); else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]); };
  const showResults = survey.status === 'published' || isArchivedView || (currentUser.role === 'admin' && hasVoted);
  return (
    <div className={`bg-[#121212] border rounded-[2rem] overflow-hidden transition-all shadow-md ${survey.status === 'active' && !isArchivedView ? 'border-orange-500/40' : 'border-gray-900'} text-left text-left text-left text-left`}>
      <div className="p-6 border-b border-gray-900 bg-black/30 flex flex-col sm:flex-row sm:justify-between items-start gap-4 text-left text-left text-left text-left">
        <div className="text-left text-left text-left text-left text-left">
          <div className="flex flex-wrap items-center gap-2 mb-2 text-left text-left text-left">
             {survey.status === 'draft' && <span className="text-[10px] bg-gray-800 text-gray-400 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-gray-700 text-left text-left">Entwurf</span>}
             {survey.status === 'active' && !isArchivedView && <span className="text-[10px] bg-green-500/10 text-green-500 px-3 py-1 rounded-full font-black uppercase tracking-widest flex items-center gap-2 border border-green-500/10 text-left text-left"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse text-left text-left"></span> Aktiv</span>}
             {(survey.status === 'published' || isArchivedView) && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-orange-500/10 text-left text-left text-left">Abgeschlossen</span>}
             <span className="text-[10px] text-gray-600 font-black uppercase tracking-[0.1em] ml-1 text-left text-left text-left">{max === 1 ? 'Single Choice' : `Max. ${max} Stimmen`}</span>
          </div>
          <h4 className="text-xl font-bold text-white leading-tight text-left text-left text-left text-left text-left">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 w-full sm:w-auto justify-between text-left text-left text-left">
            {!isArchivedView && (<div className="flex gap-2 text-left text-left text-left">{survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-[10px] font-black uppercase bg-green-500 text-black px-4 py-2 rounded-xl active:scale-95 transition-all text-left text-left"><CheckCircle2 size={14}/> Freigeben</button>}{survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-[10px] font-black uppercase bg-orange-500 hover:bg-orange-600 text-black px-4 py-2 rounded-xl active:scale-95 shadow-lg transition-all text-left text-left"><Eye size={14}/> Beenden</button>}</div>)}
            <div className="text-[10px] text-gray-600 font-black uppercase tracking-wider flex items-center gap-2 bg-black px-3 py-1.5 rounded-xl border border-gray-900 text-left text-left"><Users size={12} className="text-orange-500 text-left text-left" /> {votedUsers.length} / {eligibleUsersCount}</div>
          </div>
        )}
      </div>
      <div className="p-6 text-left text-left text-left">
        {showResults ? (
          <div className="space-y-4 text-left text-left text-left">
             {survey.status === 'active' && !isArchivedView && currentUser.role === 'admin' && (<div className="mb-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-start gap-3 text-left text-left text-left"><AlertCircle className="text-blue-500 mt-0.5 flex-shrink-0 text-left text-left" size={18} /><p className="text-[11px] text-blue-400 italic text-left text-left text-left text-left">Administratoren sehen die Resultate live.</p></div>)}
             {survey.options.map(opt => { const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100); return (<div key={opt.id} className="relative w-full bg-black border border-gray-900 rounded-2xl overflow-hidden p-4 flex justify-between items-center group transition-all text-left text-left"><div className="absolute top-0 left-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out text-left text-left" style={{ width: `${pct}%` }} /><div className="relative z-10 flex items-center gap-3 text-left text-left text-left text-left text-left"><span className="font-bold text-sm text-white text-left text-left leading-tight text-left">{opt.text}</span>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gray-900 rounded-lg text-gray-600 hover:text-red-500 transition-colors shadow-lg border border-gray-800"><Youtube size={14} /></a>)}</div><span className="relative z-10 text-xs text-gray-500 font-black font-mono text-left text-left">{pct}% <span className="text-[10px] text-gray-700 ml-1 text-left text-left">({opt.votes || 0})</span></span></div>); })}
          </div>
        ) : hasVoted ? (<div className="flex flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-500 text-left text-left mx-auto"><div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-[1.5rem] flex items-center justify-center mb-6 border border-green-500/10 shadow-[0_0_40px_rgba(34,197,94,0.1)] mx-auto"><Check size={32} className="stroke-[3]" /></div><h5 className="text-xl font-black text-white tracking-tight uppercase text-center text-center mb-2">Abgestimmt!</h5><p className="text-xs text-gray-500 mt-1 italic font-medium tracking-wide text-center text-center text-center text-center">Deine Stimme wurde gezählt.</p></div>) : (<div className="space-y-3 text-left text-left text-left text-left text-left text-left">
            {survey.options.map(opt => (<div key={opt.id} className="flex gap-2 text-left"><div onClick={() => toggleOption(opt.id)} className={`flex-1 flex items-center gap-4 p-5 rounded-[1.5rem] border-2 cursor-pointer transition-all active:scale-[0.99] text-left text-left text-left ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg shadow-orange-500/5' : 'bg-black border-gray-900 text-gray-400 hover:border-gray-800'}`}><div className={`w-6 h-6 flex items-center justify-center border-2 transition-all ${max > 1 ? 'rounded-lg' : 'rounded-full'} ${selectedOptions.includes(opt.id) ? 'border-orange-500 bg-orange-500 text-black' : 'border-gray-700'}`}>{selectedOptions.includes(opt.id) && <Check size={16} className="stroke-[4]" />}</div><span className="font-bold text-sm sm:text-base text-left text-left text-left leading-tight">{opt.text}</span></div>{opt.link && (<a href={opt.link} target="_blank" rel="noopener noreferrer" className="p-5 bg-black border border-gray-900 rounded-[1.5rem] flex items-center justify-center text-gray-600 hover:text-red-500 transition-all group group-hover:scale-110 shadow-lg text-left text-left"><Youtube size={24} /></a>)}</div>))}<div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-6 border-t border-gray-900 mt-6 text-left text-left text-left"><p className="text-[10px] font-black text-gray-500 uppercase tracking-widest italic text-left text-left text-left">{selectedOptions.length} / {max} Stimmen gewählt</p><button onClick={() => selectedOptions.length > 0 && onVote(selectedOptions)} disabled={selectedOptions.length === 0} className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 disabled:bg-gray-900 disabled:text-gray-700 text-black font-black px-12 py-5 rounded-[1.5rem] transition-all shadow-xl shadow-orange-500/20 active:scale-95 uppercase text-xs tracking-widest text-left text-left text-left">Stimme abgeben</button></div></div>)}
      </div>
    </div>
  );
}

// --- STANDARD FEHLERSEITEN ---

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center mx-auto text-center"><div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-3xl p-10 shadow-2xl text-center shadow-red-500/10 mx-auto text-center"><ShieldAlert className="mx-auto text-red-500 mb-6 text-center" size={60} /><h1 className="text-3xl font-black text-white mb-3 tracking-tight text-center leading-none text-center">Systemfehler</h1><p className="text-red-300 text-sm mb-6 leading-relaxed italic text-center text-center text-center">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center mx-auto text-center text-center text-center"><div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-3xl p-10 shadow-2xl text-center mx-auto text-center text-center text-center"><Settings className="mx-auto text-orange-500 mb-6 text-center animate-spin-slow text-center text-center" size={60} /><h1 className="text-3xl font-black text-white mb-2 tracking-tight text-center text-center leading-none text-center text-center text-center">Konfiguration fehlt</h1><p className="text-gray-400 text-center mx-auto text-center text-center text-center text-center">Bitte Firebase-Daten eintragen.</p></div></div>); }
