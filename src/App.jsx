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

  // Hilfsfunktion für Word Export
  const exportToWord = (title, contentHtml) => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export</title><style>body { font-family: Arial, sans-serif; } h1 { color: #f97316; } .section { margin-bottom: 20px; } .label { font-weight: bold; color: #666; }</style></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + contentHtml + footer;
    
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = `${title.replace(/\s+/g, '_')}.doc`;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  const handleExportEvent = (event) => {
    let content = `<h1>Event: ${event.title}</h1>`;
    content += `<p>Datum: ${new Date(event.date).toLocaleDateString('de-CH')}</p>`;
    content += `<p>Kategorie: ${event.category}</p><br/>`;
    content += `<h2>Abstimmungsergebnisse</h2>`;
    
    (event.surveys || []).forEach(s => {
        content += `<div class="section"><h3>${s.title}</h3><ul>`;
        const total = s.options.reduce((acc, o) => acc + (o.votes || 0), 0);
        s.options.forEach(o => {
            const pct = total === 0 ? 0 : Math.round((o.votes / total) * 100);
            content += `<li>${o.text}: ${o.votes} Stimmen (${pct}%)</li>`;
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
    content += `</ul><br/>`;

    content += `<h2>Traktanden</h2>`;
    Object.keys(minute.agenda || {}).forEach(role => {
        const points = minute.agenda[role];
        if(points && points.length > 0) {
            content += `<h3>${role}</h3><ul>`;
            points.forEach(p => {
                content += `<li>${p.text}</li>`;
            });
            content += `</ul>`;
        }
    });

    exportToWord(`Protokoll_${minute.date}`, content);
  };

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

  const itemsCount = activeTab === 'events' ? events.filter(e => !e.isArchived).length : 
                     activeTab === 'archive' ? events.filter(e => e.isArchived).length :
                     activeTab === 'minutes' ? minutes.length : users.length;

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans selection:bg-orange-500 selection:text-white flex flex-col">
      <header className="px-6 pt-10 pb-4">
        <div className="max-w-5xl mx-auto flex justify-between items-start">
          <div className="flex flex-col">
            <h1 className="text-4xl font-bold tracking-tight text-white leading-tight">RüssSuuger</h1>
            <p className="text-sm text-gray-500 font-medium">
              {itemsCount} {activeTab === 'events' ? 'Events' : activeTab === 'archive' ? 'Archiv' : activeTab === 'minutes' ? 'Protokolle' : 'Mitglieder'} total
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
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} label="EVENTS" />
          {isBoardMember && <TabButton active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} label="PROTOKOLLE" />}
          <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} label="ARCHIV" />
        </div>
      </div>

      <main className="flex-1 px-6 pt-4 pb-24 overflow-y-auto">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} forceCreate={creationTrigger === 'event'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
          {activeTab === 'minutes' && isBoardMember && <MinutesView minutes={minutes} users={users} dbAppId={appId} db={db} fbUser={fbUser} forceCreate={creationTrigger === 'minute'} onCreated={() => setCreationTrigger(null)} />}
          {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} fbUser={fbUser} deobfuscate={deobfuscate} obfuscate={obfuscate} forceCreate={creationTrigger === 'member'} onCreated={() => setCreationTrigger(null)} />}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#121212] border-t border-gray-900 px-6 py-4 z-20">
        <div className="max-w-xl mx-auto flex justify-between items-center relative">
          <button onClick={() => setActiveTab('events')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'events' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Calendar size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">EVENTS</span>
          </button>
          <button onClick={() => setActiveTab('archive')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'archive' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Search size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">SUCHE</span>
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 -top-10">
            <button onClick={() => setShowCreateModal(true)} className="bg-orange-500 text-black w-16 h-16 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform border-4 border-black"><Plus size={32} strokeWidth={3} /></button>
          </div>
          <div className="w-12"></div>
          <button onClick={() => setActiveTab('members')} className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'members' ? 'text-orange-500' : 'text-gray-500'}`}>
            <Users size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">STAMMDATEN</span>
          </button>
          <button onClick={() => setShowExportModal(true)} className={`flex flex-col items-center gap-1 transition-colors ${showExportModal ? 'text-orange-500' : 'text-gray-500'}`}>
            <FileOutput size={22} /><span className="text-[10px] font-bold uppercase tracking-tighter">EXPORT</span>
          </button>
        </div>
      </footer>

      {/* Create Modal */}
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

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowExportModal(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black text-white tracking-tight">Dokument-Export</h3>
                <button onClick={() => setShowExportModal(false)} className="text-gray-500 hover:text-white p-2"><X size={24}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-8 scrollbar-hide">
                <section>
                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest block mb-4 ml-1">Events (Umfrageergebnisse)</label>
                    <div className="space-y-2">
                        {events.sort((a,b) => b.date.localeCompare(a.date)).map(e => (
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

                <section>
                    <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block mb-4 ml-1">Protokolle (Sitzungsnotizen)</label>
                    <div className="space-y-2">
                        {minutes.sort((a,b) => b.date.localeCompare(a.date)).map(m => (
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
                    </div> section
                </section>
            </div>
            
            <p className="text-[9px] text-gray-600 text-center uppercase font-black tracking-widest border-t border-gray-800 pt-4">Exportiert als Microsoft Word Dokument (.doc)</p>
          </div>
        </div>
      )}
    </div>
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
            <span className="text-gray-400 text-sm font-bold uppercase tracking-[0.3em]">Ämme</span>
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
                        <div className="flex flex-col items-center gap-3 mb-2 text-center">
                            <div className="w-16 h-16 bg-orange-500/10 rounded-3xl flex items-center justify-center text-orange-500 mx-auto">
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
                            <div className="text-center"><span className="text-xs font-black block uppercase text-blue-400 mb-1">Passwort einrichten</span><span className="text-[10px] text-gray-500 italic block leading-tight">Individuelles Vorstands-Passwort setzen.</span></div>
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
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex gap-2 text-left">
            <button onClick={() => setShowImport(!showImport)} className="bg-gray-900 hover:bg-gray-800 text-gray-300 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors border border-gray-800 shadow-lg">
                <FileSpreadsheet size={18} /> Import
            </button>
            <button onClick={() => setShowAdd(true)} className="bg-orange-500 hover:bg-orange-600 text-black font-black px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-xl active:scale-95">
                <UserPlus size={18} /> Neu
            </button>
        </div>
      </div>
      
      {showImport && (
        <div className="bg-[#121212] border border-gray-900 p-8 rounded-3xl text-center animate-in fade-in slide-in-from-top-2 duration-300 shadow-xl">
            <Upload className="mx-auto text-orange-500 mb-4" size={40} />
            <h3 className="text-white font-bold text-lg mb-2 text-center">CSV Import</h3>
            <input type="file" ref={fileInputRef} accept=".csv" onChange={handleCsvUpload} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="bg-orange-500 text-black font-black px-8 py-3 rounded-xl shadow-lg uppercase text-[10px] tracking-widest">Datei auswählen</button>
        </div>
      )}

      {users.length === 0 ? <EmptyPlaceholder message="Keine Mitglieder gefunden." /> : (
        <div className="bg-[#121212] border border-gray-900 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
                <thead>
                <tr className="bg-black/50 border-b border-gray-900 text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] text-left">
                    <th className="p-6">Name</th><th className="p-6">Rolle</th><th className="p-6">Sektionen</th><th className="p-6 text-right">Optionen</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 text-left">
                {users.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).map(u => (
                    <tr key={u.id} className="hover:bg-orange-500/[0.02] transition-colors group text-left">
                    <td className="p-6 text-white font-bold text-left">{u.lastName} {u.firstName}</td>
                    <td className="p-6 text-left">
                        <span className={`text-[10px] px-3 py-1.5 rounded-xl font-black uppercase tracking-widest inline-flex items-center gap-2 ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20 text-left' : 'bg-gray-900 text-gray-400'}`}>
                            {u.role}
                        </span>
                    </td>
                    <td className="p-6 text-left">
                        <div className="flex flex-wrap gap-2 text-left">
                            {(u.groups || []).map(g => (
                                <span key={g} className="text-[10px] bg-black border border-gray-900 px-3 py-1 rounded-lg text-gray-400 font-bold uppercase tracking-tighter text-left">{g}</span>
                            ))}
                        </div>
                    </td>
                    <td className="p-6 text-right flex justify-end gap-1 text-left">
                        {(u.groups || []).includes('Vorstand') && (
                            <button onClick={() => resetPassword(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all" title="Reset PW"><Key size={18} /></button>
                        )}
                        <button onClick={() => setEditingUser(u)} className="text-gray-500 hover:text-orange-500 p-2 rounded-lg transition-all" title="Edit"><Edit2 size={18} /></button>
                        <button onClick={() => removeUser(u.id)} className="text-gray-500 hover:text-red-500 p-2 rounded-lg transition-all" title="Delete"><Trash2 size={18} /></button>
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

function FatalErrorScreen({ message }) { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center"><div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-3xl p-10 shadow-2xl"><ShieldAlert className="mx-auto text-red-500 mb-6" size={60} /><h1 className="text-3xl font-black text-white mb-3 tracking-tight text-center">Systemfehler</h1><p className="text-red-300 text-sm mb-6 leading-relaxed italic text-center">{message}</p></div></div>); }
function SetupScreen() { return (<div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 text-center"><div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-3xl p-10 shadow-2xl text-center"><Settings className="mx-auto text-orange-500 mb-6" size={60} /><h1 className="text-3xl font-black text-white mb-2 tracking-tight text-center">Konfiguration fehlt</h1></div></div>); }
