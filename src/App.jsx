import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, Edit2,
  FileText, Youtube, Lock, Unlock, Send, ExternalLink,
  ClipboardList, UserCheck, Paperclip, Save, X, RefreshCw,
  UploadCloud, Loader2, Search, Download, ArrowUp, ArrowDown
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, updateDoc } from 'firebase/firestore';

// --- Sichere Konfigurations-Initialisierung ---
const MY_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9sGsbG9WAQfp9xoEqOhzp_IDgMuwOYmE",
  authDomain: "ruesssuuger-voting.firebaseapp.com",
  projectId: "ruesssuuger-voting",
  storageBucket: "ruesssuuger-voting.firebasestorage.app",
  messagingSenderId: "737751466538",
  appId: "1:737751466538:web:4fe3f376738accc352f953"
};

let firebaseConfig = MY_FIREBASE_CONFIG;
try {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase Config Error:", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruesssuuger-app-v1';

// Initialisierung der Firebase-Dienste
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Hilfsfunktion zum Hashen von Passwörtern (SHA-256)
const hashPassword = async (password) => {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Hilfsfunktion für die Datei-Vorschau (Google Docs Viewer für Office Dateien)
const getPreviewUrl = (url, fileName) => {
  if (!url) return '#';
  const name = (fileName || '').toLowerCase();
  if (name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=false`;
  }
  return url;
};

const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];
const TRAKTANDEN = [
  'Präsident', 'Vizepräsident', 'Tambourmajor', 'Tourmanager', 'Sujetchef', 'Kassier', 'Aktuar'
];

const INITIAL_USERS = [
  { 
    id: 'admin_suuger', 
    firstName: 'Admin', 
    lastName: 'Suuger', 
    role: 'admin', 
    groups: ['Vorstand', 'Aktive'],
    password: '' 
  }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [activeTab, setActiveTab] = useState('events');
  const [dbReady, setDbReady] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [connError, setConnError] = useState(null);
  const [hasCheckedAutoLogin, setHasCheckedAutoLogin] = useState(false);

  // --- Authentifizierung ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setConnError("Authentifizierung fehlgeschlagen. Bitte Seite neu laden.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, u => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- Daten-Subscription ---
  useEffect(() => {
    if (!user) return;
    
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    const minutesRef = collection(db, 'artifacts', appId, 'public', 'data', 'minutes');

    const unsubUsers = onSnapshot(usersRef, 
      (s) => {
        setUsers(s.docs.map(d => ({ ...d.data(), id: d.id })));
        setDbReady(true);
        setConnError(null);
      },
      (err) => {
        console.error("Users Snapshot Error:", err);
        setDbReady(true);
        if (err.code === 'permission-denied') {
          setConnError("Keine Berechtigung zum Lesen der Daten. Prüfe die Firestore Regeln.");
        } else {
          setConnError("Verbindungsfehler: " + err.message);
        }
      }
    );

    const unsubEvents = onSnapshot(eventsRef, 
      (s) => setEvents(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Events Error:", err)
    );

    const unsubMinutes = onSnapshot(minutesRef, 
      (s) => setMinutes(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Minutes Error:", err)
    );

    return () => {
      unsubUsers();
      unsubEvents();
      unsubMinutes();
    };
  }, [user]);

  // --- Auto-Login prüfen ---
  useEffect(() => {
    if (dbReady && !hasCheckedAutoLogin) {
      const savedUserId = localStorage.getItem('ruesssuuger_userId');
      const savedSessionId = localStorage.getItem('ruesssuuger_sessionId');
      if (savedUserId && savedSessionId) {
        const u = users.find(x => x.id === savedUserId);
        if (u) {
          setCurrentUser({ ...u, sessionId: savedSessionId });
        }
      }
      setHasCheckedAutoLogin(true);
    }
  }, [dbReady, hasCheckedAutoLogin, users]);

  // --- Sitzungs-Heartbeat (Presence-Tracking) ---
  useEffect(() => {
    if (!currentUser) return;

    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.id), {
          isOnline: true,
          lastSeen: Date.now(),
          sessionId: currentUser.sessionId
        });
      } catch(e) { console.error("Presence Error", e); }
    };

    updatePresence(); // Sofort senden
    const interval = setInterval(updatePresence, 5000); // Alle 5 Sekunden erneuern

    return () => clearInterval(interval);
  }, [currentUser]);

  // --- Konflikt-Check (Session-Stealing verhindern/übernehmen) ---
  useEffect(() => {
    if (!currentUser) return;
    const u = users.find(x => x.id === currentUser.id);
    
    // Wenn die DB eine andere aktive Session-ID hat und das Mitglied online ist, wurden wir gekickt
    if (u && u.sessionId && u.sessionId !== currentUser.sessionId && u.isOnline) {
      const timeSinceLastSeen = Date.now() - (u.lastSeen || 0);
      if (timeSinceLastSeen < 15000) {
        // Eine neue Sitzung hat übernommen
        localStorage.removeItem('ruesssuuger_userId');
        localStorage.removeItem('ruesssuuger_sessionId');
        setCurrentUser(null);
        alert("Sitzung beendet: Du wurdest auf einem anderen Gerät angemeldet.");
      }
    }
  }, [users, currentUser]);

  // --- Auto-Archivierung von abgelaufenen Events ---
  useEffect(() => {
    if (!user || currentUser?.role !== 'admin') return;
    
    const now = new Date();
    events.forEach(e => {
      if (!e.isArchived && e.autoArchive && e.endDate) {
        const endDate = new Date(e.endDate);
        if (now > endDate) {
          const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'events', e.id);
          updateDoc(eventRef, { isArchived: true }).catch(err => console.error("Auto-Archive Error:", err));
        }
      }
    });
  }, [events, user, currentUser]);

  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      }
    } catch (e) { 
      console.error(e);
      setConnError("Fehler beim Initialisieren der Datenbank.");
    }
    setIsSeeding(false);
  };

  const handleLogout = async () => {
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUser.id), { isOnline: false });
      } catch(e) {}
    }
    localStorage.removeItem('ruesssuuger_userId');
    localStorage.removeItem('ruesssuuger_sessionId');
    setCurrentUser(null);
    setActiveTab('events');
  };

  const isVorstand = useMemo(() => currentUser?.groups?.includes('Vorstand'), [currentUser]);

  if (connError) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="text-red-500 mb-4" size={64} />
        <h2 className="text-2xl font-bold text-white mb-2">Verbindungsproblem</h2>
        <p className="text-gray-400 max-w-md mb-8">{connError}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="flex items-center gap-2 bg-orange-500 text-gray-950 font-black px-6 py-3 rounded-2xl active:scale-95 transition-all"
        >
          <RefreshCw size={20} /> Seite neu laden
        </button>
      </div>
    );
  }

  if (!user || !dbReady || !hasCheckedAutoLogin) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-orange-500"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 bg-gray-950 rounded-full"></div>
          </div>
        </div>
        <p className="text-gray-400 font-bold mt-6 tracking-widest animate-pulse uppercase text-xs">Verbindung wird aufgebaut...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen users={users} onLogin={u => setCurrentUser(u)} onSeed={seedDatabase} isSeeding={isSeeding} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black italic tracking-tighter">
              <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">{currentUser.firstName} {currentUser.lastName}</p>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">{currentUser.role}</p>
            </div>
            <button onClick={handleLogout} className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all active:scale-95 group">
              <LogOut size={20} className="text-gray-400 group-hover:text-orange-500 transition-colors" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <nav className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={18} />} label="Events" />
          {isVorstand && (
            <TabButton active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} icon={<ClipboardList size={18} />} label="Protokolle" />
          )}
          {currentUser.role === 'admin' && (
            <>
              <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
              <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Mitglieder" />
            </>
          )}
        </nav>

        <div className="animate-in fade-in duration-500">
          {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} />}
          {activeTab === 'minutes' && isVorstand && <ProtocolView minutes={minutes} users={users} currentUser={currentUser} />}
          {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} />}
          {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} />}
        </div>
      </main>
    </div>
  );
}

// --- Login Screen Komponente ---
function LoginScreen({ users, onLogin, onSeed, isSeeding }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [step, setStep] = useState('name'); 
  const [foundUser, setFoundUser] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const finalizeLogin = (u) => {
    const newSession = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('ruesssuuger_sessionId', newSession);
    localStorage.setItem('ruesssuuger_userId', u.id);
    onLogin({ ...u, sessionId: newSession });
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const u = users.find(x => x.firstName.toLowerCase() === firstName.toLowerCase() && x.lastName.toLowerCase() === lastName.toLowerCase());
    if (!u) {
      setError("Mitglied nicht gefunden.");
      return;
    }
    
    // Anwesenheits-Check: Verhindern von doppelten Logins
    const timeSinceLastSeen = Date.now() - (u.lastSeen || 0);
    const savedSession = localStorage.getItem('ruesssuuger_sessionId');
    
    if (u.isOnline && timeSinceLastSeen < 15000 && u.sessionId !== savedSession) {
      setError("Dieses Mitglied ist bereits aktiv angemeldet. Bei Verbindungsabbruch bitte ca. 15 Sekunden warten.");
      return;
    }
    
    if (u.groups?.includes('Vorstand')) {
      setFoundUser(u);
      setStep(!u.password ? 'setPassword' : 'password');
      setError('');
    } else {
      finalizeLogin(u);
    }
  };

  const handlePasswordAction = async (e, type) => {
    e.preventDefault();
    if (type === 'set') {
      if (password.length < 4) {
        setError("Passwort zu kurz (min. 4 Zeichen).");
        return;
      }
      try {
        const hashedPw = await hashPassword(password);
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.id), { password: hashedPw });
        finalizeLogin({ ...foundUser, password: hashedPw });
      } catch (err) {
        setError("Fehler beim Speichern.");
      }
    } else {
      const hashedInput = await hashPassword(password);
      if (hashedInput === foundUser.password || password === foundUser.password) {
        finalizeLogin(foundUser);
      } else {
        setError("Falsches Passwort.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black mb-2 italic tracking-tighter">
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
          </h1>
          <p className="text-gray-500 font-medium tracking-wide">Internes Portal & Voting</p>
        </div>

        {users.length === 0 ? (
          <div className="space-y-6 text-center animate-in fade-in">
            <Database className="mx-auto text-gray-800" size={48} />
            <p className="text-gray-400 text-sm">Die Datenbank ist neu oder leer. Möchtest du den Administrator-Account jetzt erstellen?</p>
            <button 
              onClick={onSeed} 
              disabled={isSeeding} 
              className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl transition-all shadow-lg shadow-orange-500/10 disabled:opacity-50 active:scale-95"
            >
              {isSeeding ? 'Wird erstellt...' : 'Admin Suuger jetzt erstellen'}
            </button>
          </div>
        ) : (
          <form onSubmit={step === 'name' ? handleNameSubmit : e => handlePasswordAction(e, step === 'setPassword' ? 'set' : 'check')} className="space-y-4">
            {step === 'name' ? (
              <div className="space-y-4">
                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            ) : (
              <div className="animate-in slide-in-from-right-4 duration-300">
                <p className="text-xs text-center text-orange-500 font-bold uppercase mb-4 tracking-widest flex items-center justify-center gap-2">
                  <Lock size={12}/> {step === 'setPassword' ? 'Passwort festlegen' : 'Vorstand-Passwort'}
                </p>
                <input autoFocus type="password" required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none text-center text-3xl tracking-[0.5em]" placeholder="••••" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
            )}
            <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all text-lg">
              {step === 'name' ? 'Weiter' : 'Anmelden'}
            </button>
            {error && <p className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-3 rounded-xl animate-in shake duration-300 mt-2">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}

// --- Protokoll View (inkl. Lese-Modus) & Editor ---
function ProtocolView({ minutes, users, currentUser }) {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [enlargedPoint, setEnlargedPoint] = useState(null);

  const vorstandMembers = useMemo(() => users.filter(u => u.groups?.includes('Vorstand')), [users]);

  const filteredMinutes = useMemo(() => {
    let sorted = [...minutes].sort((a,b) => b.date.localeCompare(a.date));
    if (!searchTerm.trim()) return sorted;

    const term = searchTerm.toLowerCase();
    return sorted.filter(m => {
      if (m.title?.toLowerCase().includes(term)) return true;
      if (m.traktanden) {
        for (const points of Object.values(m.traktanden)) {
          if (points.some(p => p.text?.toLowerCase().includes(term) || p.docName?.toLowerCase().includes(term))) {
            return true;
          }
        }
      }
      return false;
    });
  }, [minutes, searchTerm]);

  const saveProtocol = async (p) => {
    const id = p.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...p, id });
    setShowAdd(false);
    setEditing(null);
  };

  const renderSnippets = (m) => {
    if (!searchTerm.trim()) return null;
    const term = searchTerm.toLowerCase();
    const snippets = [];
    if (m.traktanden) {
      for (const [tName, points] of Object.entries(m.traktanden)) {
        points.forEach(p => {
          if (p.text?.toLowerCase().includes(term) || p.docName?.toLowerCase().includes(term)) {
            snippets.push(
              <div key={p.id} className="mt-3 bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl text-sm">
                <span className="font-bold text-orange-500 mr-2 uppercase tracking-tighter text-[10px]">{tName}:</span>
                <span className="text-gray-300 break-words">{p.text}</span>
                {p.docName && p.docName.toLowerCase().includes(term) && (
                  <span className="ml-2 italic text-orange-400 text-xs break-words">({p.docName})</span>
                )}
              </div>
            );
          }
        });
      }
    }
    return snippets.slice(0, 3);
  };

  if (editing || showAdd) {
    return (
      <ProtocolEditor 
        vorstand={vorstandMembers} 
        onSave={saveProtocol} 
        onCancel={() => { setShowAdd(false); setEditing(null); }} 
        initialData={editing}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Vorstands-Protokolle</h2>
          <p className="text-gray-500 text-sm mt-1">Interne Sitzungsprotokolle und Beschlüsse</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3.5 sm:py-3 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 whitespace-nowrap w-full md:w-auto mt-2 md:mt-0">
          <Plus size={20} /> Neues Protokoll
        </button>
      </div>

      {minutes.length > 0 && (
        <div className="relative animate-in fade-in">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
          <input 
            type="text" 
            placeholder="Protokolle durchsuchen..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-4 pl-12 pr-12 text-white focus:border-orange-500 outline-none shadow-lg transition-all"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-1">
              <X size={18} />
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {filteredMinutes.map(m => {
          const isExpanded = expandedId === m.id;

          return (
            <div key={m.id} className="bg-gray-900 border border-gray-800 p-5 sm:p-6 rounded-3xl flex flex-col hover:border-gray-700 transition-all group">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : m.id)}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black px-2 py-1 rounded-md border border-orange-500/20 uppercase tracking-widest">{new Date(m.date).toLocaleDateString('de-CH')}</span>
                    <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic opacity-50 group-hover:opacity-100 transition-opacity">Archiviert</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-white break-words">{m.title}</h3>
                  <p className="text-sm text-gray-500 mt-2 line-clamp-1 italic">Vorsitz: {m.traktanden?.['Präsident']?.[0]?.text || 'Nicht angegeben'}</p>
                </div>
                <div className="flex gap-2 shrink-0 mt-3 sm:mt-0 justify-end" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setExpandedId(isExpanded ? null : m.id)} className="p-3.5 sm:p-4 bg-gray-800 text-gray-400 hover:text-white rounded-2xl transition-all active:scale-90" title="Lesen">
                    {isExpanded ? <ChevronRight className="-rotate-90" size={20} /> : <Eye size={20} />}
                  </button>
                  <button onClick={() => setEditing(m)} className="p-3.5 sm:p-4 bg-gray-800 text-gray-400 hover:text-white rounded-2xl transition-all active:scale-90" title="Bearbeiten">
                    <Edit2 size={20} />
                  </button>
                  <button onClick={() => { if(confirm('Möchtest du dieses Protokoll wirklich löschen?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', m.id)); }} className="p-3.5 sm:p-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-2xl transition-all active:scale-90" title="Löschen">
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
              
              {!isExpanded && renderSnippets(m)}

              {/* LESE-ANSICHT (EXPANDED) */}
              {isExpanded && (
                <div className="mt-6 border-t border-gray-800 pt-6 space-y-8 animate-in slide-in-from-top-2 duration-300">
                  {/* Anwesenheit */}
                  {m.attendance && Object.keys(m.attendance).length > 0 && (
                    <div>
                      <h4 className="text-orange-500 font-black uppercase text-[10px] tracking-widest mb-3 flex items-center gap-2">
                        <UserCheck size={14}/> Anwesenheit
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {users.filter(u => u.groups?.includes('Vorstand')).map(u => {
                          const status = m.attendance?.[u.id];
                          if (!status) return null;
                          const label = status === 'present' ? 'Anwesend' : status === 'absent' ? 'Unentschuldigt' : 'Entschuldigt';
                          const color = status === 'present' ? 'bg-green-500/10 text-green-500 border-green-500/20' : status === 'absent' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20';
                          return (
                            <span key={u.id} className={`text-[10px] font-bold px-2 py-1 rounded-md border ${color}`}>
                              {u.firstName} {u.lastName}: {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Traktanden */}
                  <div className="space-y-6">
                    {TRAKTANDEN.map(t => {
                      const points = m.traktanden?.[t];
                      if (!points || points.length === 0) return null;
                      return (
                        <div key={t} className="bg-gray-950 p-5 sm:p-6 rounded-3xl border border-gray-800">
                          <h4 className="text-white font-black text-lg sm:text-xl mb-4 italic tracking-tight underline decoration-orange-500 decoration-2 underline-offset-4">{t}</h4>
                          <ul className="space-y-4">
                            {points.map(p => (
                              <li key={p.id} className="bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-800 shadow-sm relative">
                                <div className="pr-12">
                                  <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{p.text}</p>
                                  {p.docUrl && (
                                    <a href={getPreviewUrl(p.docUrl, p.docName)} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-2 text-[11px] font-bold text-orange-500 hover:text-orange-400 bg-orange-500/10 w-fit px-3.5 py-2.5 rounded-xl border border-orange-500/20 transition-all hover:scale-105 active:scale-95">
                                      <Paperclip size={16} /> {p.docName || 'Dokument ansehen'}
                                    </a>
                                  )}
                                </div>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEnlargedPoint({ traktandum: t, ...p }); }} 
                                  className="absolute top-4 right-4 p-2.5 bg-gray-950 border border-gray-700 text-gray-400 hover:text-orange-500 hover:border-orange-500 rounded-xl transition-all shadow-md"
                                  title="Punkt vergrössern"
                                >
                                  <Eye size={18} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredMinutes.length === 0 && searchTerm && (
          <div className="text-center py-10 text-gray-500 bg-gray-900/50 border border-gray-800 border-dashed rounded-3xl">
            Keine passenden Protokolle oder Beschlüsse für "{searchTerm}" gefunden.
          </div>
        )}

        {minutes.length === 0 && !searchTerm && (
          <div className="text-center py-20 bg-gray-900/50 border border-gray-800 border-dashed rounded-3xl">
            <ClipboardList className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-600 font-bold uppercase tracking-widest text-sm">Keine Protokolle vorhanden</p>
          </div>
        )}
      </div>

      {/* MODAL FÜR VERGRÖSSERTEN PUNKT (LESE-MODUS) */}
      {enlargedPoint && (
        <div className="fixed inset-0 z-[100] bg-gray-950/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl max-h-[90vh]">
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50 rounded-t-3xl">
              <h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">{enlargedPoint.traktandum}</h3>
              <button onClick={() => setEnlargedPoint(null)} className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all active:scale-90">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-white text-base sm:text-lg whitespace-pre-wrap leading-relaxed">{enlargedPoint.text}</p>
            </div>
            {enlargedPoint.docUrl && (
              <div className="p-5 border-t border-gray-800 bg-gray-950/50 rounded-b-3xl">
                <a href={getPreviewUrl(enlargedPoint.docUrl, enlargedPoint.docName)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 text-sm font-bold text-gray-950 bg-orange-500 hover:bg-orange-600 w-full py-4 rounded-xl transition-all active:scale-95 shadow-lg">
                  <Paperclip size={18} /> {enlargedPoint.docName || 'Dokument öffnen'}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProtocolEditor({ vorstand, onSave, onCancel, initialData }) {
  const [form, setForm] = useState(initialData || {
    title: '',
    date: new Date().toISOString().split('T')[0],
    attendance: {}, 
    traktanden: TRAKTANDEN.reduce((acc, curr) => ({ ...acc, [curr]: [] }), {})
  });
  
  const [uploading, setUploading] = useState({});
  const [enlargedEditPoint, setEnlargedEditPoint] = useState(null); // Für die Vollbild-Eingabe

  const updateAttendance = (userId, status) => {
    setForm(prev => ({
      ...prev,
      attendance: { ...prev.attendance, [userId]: status }
    }));
  };

  const addPoint = (traktandum) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    setForm(prev => ({
      ...prev,
      traktanden: {
        ...prev.traktanden,
        [traktandum]: [...(prev.traktanden[traktandum] || []), { id, text: '', docUrl: '', docName: '' }]
      }
    }));
  };

  const removePoint = (traktandum, pointId) => {
    setForm(prev => ({
      ...prev,
      traktanden: {
        ...prev.traktanden,
        [traktandum]: prev.traktanden[traktandum].filter(p => p.id !== pointId)
      }
    }));
  };

  const updatePoint = (traktandum, pointId, field, value) => {
    setForm(prev => ({
      ...prev,
      traktanden: {
        ...prev.traktanden,
        [traktandum]: prev.traktanden[traktandum].map(p => p.id === pointId ? { ...p, [field]: value } : p)
      }
    }));
  };

  const updatePointFields = (traktandum, pointId, fieldsObj) => {
    setForm(prev => ({
      ...prev,
      traktanden: {
        ...prev.traktanden,
        [traktandum]: prev.traktanden[traktandum].map(p => p.id === pointId ? { ...p, ...fieldsObj } : p)
      }
    }));
  };

  const movePointUp = (traktandum, index) => {
    if (index === 0) return;
    setForm(prev => {
      const list = [...prev.traktanden[traktandum]];
      const temp = list[index - 1];
      list[index - 1] = list[index];
      list[index] = temp;
      return { ...prev, traktanden: { ...prev.traktanden, [traktandum]: list } };
    });
  };

  const movePointDown = (traktandum, index) => {
    if (index === form.traktanden[traktandum].length - 1) return;
    setForm(prev => {
      const list = [...prev.traktanden[traktandum]];
      const temp = list[index + 1];
      list[index + 1] = list[index];
      list[index] = temp;
      return { ...prev, traktanden: { ...prev.traktanden, [traktandum]: list } };
    });
  };

  const handleFileUpload = (e, traktandum, pointId) => {
    const file = e.target.files[0];
    if (!file) return;

    e.target.value = '';

    if (file.size > 500 * 1024) {
      alert(`Die Datei "${file.name}" ist zu gross!\n\nDas Limit beträgt 500 KB, da Dokumente direkt in der Datenbank gespeichert werden. Bitte komprimiere die Datei.`);
      return;
    }

    setUploading(prev => ({ ...prev, [pointId]: 50 }));

    const reader = new FileReader();
    
    reader.onload = (event) => {
      const base64Data = event.target.result;
      updatePointFields(traktandum, pointId, { docUrl: base64Data, docName: file.name });
      setUploading(prev => { const n = {...prev}; delete n[pointId]; return n; });
    };

    reader.onerror = (error) => {
      console.error("FileReader Error:", error);
      alert("Es gab einen Fehler beim Einlesen der Datei.");
      setUploading(prev => { const n = {...prev}; delete n[pointId]; return n; });
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 bg-gray-900 p-5 sm:p-8 rounded-3xl border border-gray-800 shadow-2xl">
        <div className="flex-1 space-y-4 w-full">
          <input 
            className="w-full bg-transparent text-2xl sm:text-4xl font-black text-white border-b-2 border-gray-800 focus:border-orange-500 outline-none transition-all placeholder:text-gray-800" 
            placeholder="Sitzungstitel..." 
            value={form.title} 
            onChange={e => setForm({...form, title: e.target.value})} 
          />
          <div className="flex items-center gap-4">
            <Calendar className="text-orange-500 shrink-0" size={20} />
            <input 
              type="date" 
              className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 sm:py-2 text-white focus:border-orange-500 outline-none w-full sm:w-auto" 
              value={form.date} 
              onChange={e => setForm({...form, date: e.target.value})} 
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-2 md:mt-0">
          <button onClick={onCancel} className="w-full sm:w-auto px-6 py-3.5 sm:py-3 text-gray-500 font-bold hover:text-white transition-colors bg-gray-950 md:bg-transparent rounded-2xl md:rounded-none">Abbrechen</button>
          <button onClick={() => { if(!form.title) return alert("Bitte Titel eingeben."); onSave(form); }} className="w-full sm:w-auto justify-center px-8 py-3.5 sm:py-3 bg-orange-500 text-gray-950 font-black rounded-2xl flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all">
            <Save size={20} /> Speichern
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 p-5 sm:p-8 rounded-3xl h-fit lg:sticky top-24 shadow-xl">
          <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
            <UserCheck className="text-orange-500" /> Anwesenheit
          </h3>
          <div className="space-y-3 sm:space-y-4">
            {vorstand.map(m => (
              <div key={m.id} className="p-4 bg-gray-950 rounded-2xl border border-gray-800">
                <p className="font-bold text-white mb-3 text-sm">{m.firstName} {m.lastName}</p>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-1">
                  {[
                    { id: 'present', label: 'Anw.', color: 'bg-green-500/20 text-green-500 border-green-500/50' },
                    { id: 'absent', label: 'Unen.', color: 'bg-red-500/20 text-red-500 border-red-500/50' },
                    { id: 'excused', label: 'Ents.', color: 'bg-blue-500/20 text-blue-500 border-blue-500/50' }
                  ].map(status => (
                    <button
                      key={status.id}
                      onClick={() => updateAttendance(m.id, status.id)}
                      className={`text-[10px] sm:text-[9px] font-black uppercase py-2.5 sm:py-2 rounded-lg border transition-all ${
                        form.attendance[m.id] === status.id ? status.color : 'bg-gray-900 text-gray-600 border-gray-800 hover:border-gray-600'
                      }`}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {TRAKTANDEN.map(traktandum => (
            <div key={traktandum} className="bg-gray-900 border border-gray-800 p-5 sm:p-8 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-6 gap-2">
                <h3 className="text-xl sm:text-2xl font-black text-white italic tracking-tight underline decoration-orange-500 decoration-4 underline-offset-8 break-words">
                  {traktandum}
                </h3>
                <button 
                  onClick={() => addPoint(traktandum)} 
                  className="p-3 bg-gray-950 border border-gray-800 text-orange-500 hover:bg-orange-500 hover:text-gray-950 rounded-xl transition-all active:scale-90 shrink-0"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {form.traktanden[traktandum]?.map((point, index) => (
                  <div key={point.id} className="p-4 sm:p-6 bg-gray-950 border border-gray-800 rounded-2xl space-y-4 group">
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                      <textarea 
                        className="w-full flex-1 bg-transparent text-gray-200 border-none focus:ring-0 outline-none resize-none placeholder:text-gray-800 text-sm font-medium leading-relaxed overflow-hidden min-h-[44px]" 
                        placeholder="Beschluss oder Notiz schreiben..."
                        value={point.text}
                        onChange={e => {
                          e.target.style.height = 'auto';
                          e.target.style.height = `${e.target.scrollHeight}px`;
                          updatePoint(traktandum, point.id, 'text', e.target.value);
                        }}
                        ref={el => {
                          if (el) {
                            requestAnimationFrame(() => {
                              el.style.height = 'auto';
                              el.style.height = `${el.scrollHeight}px`;
                            });
                          }
                        }}
                      />
                      <div className="flex justify-end sm:self-start gap-2 shrink-0">
                        <button 
                          onClick={(e) => { e.preventDefault(); setEnlargedEditPoint({ traktandum, id: point.id, text: point.text }); }}
                          className="p-2 sm:p-1.5 text-gray-600 hover:text-orange-500 transition-colors bg-gray-900 rounded-lg border border-gray-800"
                          title="Im Vollbild bearbeiten"
                        >
                          <Eye size={18} className="sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.preventDefault(); movePointUp(traktandum, index); }} 
                          disabled={index === 0}
                          className="p-2 sm:p-1.5 text-gray-600 hover:text-orange-500 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors bg-gray-900 rounded-lg border border-gray-800"
                          title="Nach oben"
                        >
                          <ArrowUp size={18} className="sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.preventDefault(); movePointDown(traktandum, index); }} 
                          disabled={index === form.traktanden[traktandum].length - 1}
                          className="p-2 sm:p-1.5 text-gray-600 hover:text-orange-500 disabled:opacity-30 disabled:hover:text-gray-600 transition-colors bg-gray-900 rounded-lg border border-gray-800"
                          title="Nach unten"
                        >
                          <ArrowDown size={18} className="sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={(e) => { e.preventDefault(); removePoint(traktandum, point.id); }} 
                          className="p-2 sm:p-1.5 text-gray-600 hover:text-red-500 transition-colors bg-gray-900 rounded-lg border border-gray-800 ml-2"
                          title="Punkt löschen"
                        >
                          <X size={18} className="sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-900">
                      <div className="w-full flex-1 flex items-center gap-3 bg-gray-900 px-4 py-3 rounded-xl border border-gray-800 relative overflow-hidden">
                        {uploading[point.id] !== undefined && (
                          <div className="absolute left-0 top-0 h-full bg-orange-500/20 transition-all" style={{ width: `${uploading[point.id]}%` }} />
                        )}
                        <Paperclip size={16} className="text-orange-500 shrink-0 z-10" />
                        
                        <div className="flex-1 z-10 flex items-center overflow-hidden">
                          {uploading[point.id] !== undefined ? (
                            <span className="text-[11px] text-orange-500 font-bold">Wird hochgeladen... {Math.round(uploading[point.id])}%</span>
                          ) : point.docUrl ? (
                            <div className="flex items-center justify-between w-full">
                              <a href={getPreviewUrl(point.docUrl, point.docName)} target="_blank" rel="noreferrer" className="text-[11px] text-white hover:text-orange-500 truncate font-bold max-w-[150px] sm:max-w-[250px]">
                                {point.docName || 'Dokument ansehen'}
                              </a>
                              <button type="button" onClick={() => updatePointFields(traktandum, point.id, { docUrl: '', docName: '' })} className="text-gray-500 hover:text-red-500 ml-2 bg-gray-950 p-1 rounded-md shrink-0" title="Datei entfernen">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer text-[11px] text-gray-500 hover:text-white w-full block font-bold transition-colors truncate">
                              <UploadCloud size={14} className="inline mr-2" />
                              Datei anhängen (Max. 500 KB)
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={e => handleFileUpload(e, traktandum, point.id)} />
                            </label>
                          )}
                        </div>
                      </div>
                      
                      <input 
                        className="w-full sm:w-48 bg-gray-900 px-4 py-3 rounded-xl border border-gray-800 text-[11px] text-gray-500 focus:text-white outline-none" 
                        placeholder="Anzeige-Name (optional)"
                        value={point.docName}
                        onChange={e => updatePoint(traktandum, point.id, 'docName', e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                {(!form.traktanden[traktandum] || form.traktanden[traktandum].length === 0) && (
                  <p className="text-center text-gray-700 text-xs py-4 font-bold uppercase tracking-widest italic opacity-50">Keine Einträge</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL FÜR VERGRÖSSERTEN PUNKT (EDITOR-MODUS) */}
      {enlargedEditPoint && (
        <div className="fixed inset-0 z-[100] bg-gray-950/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-3xl flex flex-col shadow-2xl h-[80vh] max-h-[800px]">
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50 rounded-t-3xl">
              <h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">{enlargedEditPoint.traktandum} - Bearbeiten</h3>
              <button onClick={() => setEnlargedEditPoint(null)} className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all active:scale-90">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <textarea 
                className="flex-1 w-full bg-gray-950 border border-gray-800 rounded-2xl p-6 text-white focus:border-orange-500 outline-none resize-none leading-relaxed text-lg"
                value={enlargedEditPoint.text}
                onChange={e => setEnlargedEditPoint({...enlargedEditPoint, text: e.target.value})}
                placeholder="Beschluss oder Notiz..."
                autoFocus
              />
            </div>
            <div className="p-5 border-t border-gray-800 bg-gray-950/50 rounded-b-3xl flex justify-end">
              <button 
                onClick={(e) => { 
                  e.preventDefault(); 
                  updatePoint(enlargedEditPoint.traktandum, enlargedEditPoint.id, 'text', enlargedEditPoint.text); 
                  setEnlargedEditPoint(null); 
                }} 
                className="w-full sm:w-auto px-8 py-4 bg-orange-500 text-gray-950 font-black rounded-xl active:scale-95 transition-all shadow-lg"
              >
                Text übernehmen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Hilfskomponenten ---
function TabButton({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick} 
      className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all whitespace-nowrap active:scale-95 ${
        active ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/20' : 'bg-gray-900 text-gray-500 hover:text-gray-300 hover:bg-gray-800'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function EventsView({ events, currentUser, isArchive = false, users }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  if (selectedEvent) {
    const current = events.find(e => e.id === selectedEvent.id);
    if (!current) { setSelectedEvent(null); return null; }
    return (
      <EventDetail 
        event={current} 
        onBack={() => setSelectedEvent(null)} 
        currentUser={currentUser} 
        onUpdate={data => setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', current.id), data, { merge: true })}
        onDelete={() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', current.id))}
        users={users}
        isArchived={isArchive}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white">{isArchive ? 'Archiv' : 'Aktuelle Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3 rounded-2xl flex items-center gap-2 active:scale-95 transition-all">
            {showCreate ? 'Schliessen' : <><Plus size={20} /> Neuer Event</>}
          </button>
        )}
      </div>
      {showCreate && <CreateEventForm onSubmit={e => {
        const id = Date.now().toString();
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...e, id, isArchived: false, surveys: [], createdAt: new Date().toISOString() });
        setShowCreate(false);
      }} />}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.map(e => (
          <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl cursor-pointer hover:border-orange-500 transition-all group shadow-lg active:scale-95 transition-transform">
            <span className="text-[9px] font-black text-orange-500 uppercase bg-orange-500/10 px-3 py-1 rounded-full mb-4 inline-block tracking-widest">{e.category}</span>
            <h3 className="text-xl font-bold text-white mb-2">{e.title}</h3>
            <div className="flex flex-col gap-2 text-xs text-gray-500">
               <span className="flex items-center gap-1.5"><Calendar size={14} className="text-orange-500" /> Start: {new Date(e.date).toLocaleString('de-CH', {dateStyle: 'short', timeStyle: 'short'})}</span>
               {e.autoArchive && e.endDate && <span className="flex items-center gap-1.5"><Archive size={14} className="text-orange-500" /> Auto-Archiv: {new Date(e.endDate).toLocaleString('de-CH', {dateStyle: 'short', timeStyle: 'short'})}</span>}
               <div className="flex items-center gap-1 mt-2 border-t border-gray-800 pt-2"><BarChart3 size={14}/> {e.surveys?.length || 0} Umfragen</div>
            </div>
          </div>
        ))}
        {events.length === 0 && !showCreate && (
          <div className="md:col-span-2 lg:col-span-3 text-center py-20 bg-gray-900/30 border border-gray-800 border-dashed rounded-3xl">
            <p className="text-gray-600 font-bold uppercase tracking-widest text-sm">Keine Events geplant</p>
          </div>
        )}
      </div>
    </div>
  );
}

function EventDetail({ event, onBack, currentUser, onUpdate, onDelete, users, isArchived }) {
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState(null);

  const saveSurvey = (s) => {
    if (editingSurvey) {
      const newSurveys = event.surveys.map(x => x.id === editingSurvey.id ? { ...x, ...s } : x);
      onUpdate({ surveys: newSurveys });
      setEditingSurvey(null);
    } else {
      const newSurveys = [...(event.surveys || []), { ...s, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
      onUpdate({ surveys: newSurveys });
      setShowSurveyForm(false);
    }
  };

  const deleteSurvey = (id) => {
    if (confirm('Soll diese Umfrage wirklich gelöscht werden?')) {
      onUpdate({ surveys: event.surveys.filter(x => x.id !== id) });
    }
  };

  const exportToExcel = () => {
    let csv = '\uFEFF'; // BOM für saubere UTF-8 Darstellung in Excel
    csv += `Event:;${event.title}\n`;
    csv += `Datum:;${new Date(event.date).toLocaleDateString('de-CH')}\n`;
    csv += `Kategorie:;${event.category}\n\n`;
    csv += `Umfrage;Option;Stimmen;Prozent\n`;

    if (event.surveys) {
      event.surveys.forEach(survey => {
        const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);
        survey.options.forEach(opt => {
          const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100);
          const safeTitle = survey.title.replace(/"/g, '""');
          const safeOpt = opt.text.replace(/"/g, '""');
          csv += `"${safeTitle}";"${safeOpt}";${opt.votes || 0};${pct}%\n`;
        });
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${event.title.replace(/\s+/g, '_')}_Resultate.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-6">
        <button onClick={onBack} className="bg-gray-900 p-3 rounded-2xl hover:text-orange-500 transition-all active:scale-90"><ChevronRight className="rotate-180" size={24} /></button>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            {event.title}
            {isArchived && <span className="bg-red-500/10 text-red-500 text-[10px] uppercase font-black px-2 py-1 rounded-md border border-red-500/20">Archiviert (Read-Only)</span>}
          </h2>
          <p className="text-orange-500 text-xs font-bold uppercase">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={exportToExcel} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl hover:text-green-500 transition-all" title="Als Excel (CSV) exportieren"><Download size={20}/></button>
            {!isArchived && <button onClick={() => onUpdate({ isArchived: !event.isArchived })} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl hover:text-orange-500 transition-all" title="Manuell Archivieren"><Archive size={20}/></button>}
            <button onClick={() => { if(confirm('Achtung: Soll dieser Event wirklich komplett und unwiderruflich gelöscht werden? Alle Daten gehen verloren!')) onDelete(); }} className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-500/20" title="Event komplett löschen"><Trash2 size={20}/></button>
          </div>
        )}
      </div>

      {currentUser.role === 'admin' && !isArchived && !editingSurvey && (
        <button onClick={() => setShowSurveyForm(!showSurveyForm)} className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all">
          {showSurveyForm ? 'Abbrechen' : 'Neue Umfrage hinzufügen'}
        </button>
      )}

      {(showSurveyForm || editingSurvey) && (
        <CreateSurveyForm 
          initialData={editingSurvey} 
          onSubmit={saveSurvey} 
          onCancel={() => { setShowSurveyForm(false); setEditingSurvey(null); }} 
        />
      )}

      <div className="space-y-6">
        {event.surveys?.map(s => (
          <SurveyCard 
            key={s.id} 
            survey={s} 
            currentUser={currentUser} 
            isArchived={isArchived} 
            onEdit={() => setEditingSurvey(s)}
            onDelete={() => deleteSurvey(s.id)}
            onVote={opts => {
              const newSurveys = event.surveys.map(x => {
                if (x.id === s.id) {
                  const optMap = x.options.map(o => opts.includes(o.id) ? { ...o, votes: (o.votes || 0) + 1 } : o);
                  return { ...x, options: optMap, votedUsers: [...x.votedUsers, currentUser.id] };
                }
                return x;
              });
              onUpdate({ surveys: newSurveys });
            }} 
            onStatusChange={st => onUpdate({ surveys: event.surveys.map(x => x.id === s.id ? {...x, status: st} : x) })} 
            users={users} 
          />
        ))}
      </div>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [form, setForm] = useState({ 
    title: '', 
    category: CATEGORIES[0], 
    date: new Date().toISOString().slice(0,16), 
    endDate: '',
    autoArchive: false
  });

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Event Titel</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" placeholder="z.B. GV 2026" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Kategorie</label>
          <select className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Start-Datum & Zeit</label>
          <input type="datetime-local" required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.autoArchive} onChange={e => setForm({...form, autoArchive: e.target.checked})} className="accent-orange-500 w-4 h-4" />
            Auto-Archivierung am:
          </label>
          <input type="datetime-local" required={form.autoArchive} disabled={!form.autoArchive} className={`w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none transition-all ${!form.autoArchive && 'opacity-50 cursor-not-allowed'}`} value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
        </div>
      </div>
      <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg mt-2">Event speichern</button>
    </form>
  );
}

function CreateSurveyForm({ onSubmit, initialData, onCancel }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [maxAnswers, setMaxAnswers] = useState(initialData?.maxAnswers || 1);
  const [options, setOptions] = useState(initialData?.options || [{ id: '1', text: '', youtubeUrl: '' }, { id: '2', text: '', youtubeUrl: '' }]);
  const [allowedGroups, setAllowedGroups] = useState(initialData?.allowedGroups || GROUPS);

  const removeOption = (id) => {
    if (options.length > 2) {
      setOptions(options.filter(o => o.id !== id));
    }
  };

  const toggleGroup = g => setAllowedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ title, maxAnswers, allowedGroups, options: options.filter(o => o.text.trim()) }); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6 animate-in slide-in-from-top-4 duration-300">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white focus:border-orange-500 outline-none" placeholder="Was ist die Frage?" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 bg-gray-950 border border-gray-800 px-4 py-2 rounded-xl shrink-0">
          <label className="text-xs font-bold text-gray-500 uppercase">Max. Stimmen:</label>
          <input type="number" min="1" max="10" className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none text-center font-bold" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} />
        </div>
      </div>
      
      {options.map((o, i) => (
        <div key={o.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-950 border border-gray-800 rounded-2xl relative group">
          <input required className="bg-transparent border-b border-gray-800 px-2 py-2 text-white outline-none focus:border-orange-500 font-bold" placeholder={`Option ${i+1}`} value={o.text} onChange={e => { const n = [...options]; n[i].text = e.target.value; setOptions(n); }} />
          <div className="flex items-center gap-2">
            <Youtube size={18} className="text-red-500 shrink-0" />
            <input className="w-full bg-transparent border-b border-gray-800 px-2 py-2 text-gray-500 outline-none focus:border-orange-500 text-xs" placeholder="YouTube Link..." value={o.youtubeUrl} onChange={e => { const n = [...options]; n[i].youtubeUrl = e.target.value; setOptions(n); }} />
            {options.length > 2 && (
              <button type="button" onClick={() => removeOption(o.id)} className="p-2 text-gray-700 hover:text-red-500 transition-colors bg-gray-900 rounded-lg ml-2 shrink-0" title="Option entfernen">
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setOptions([...options, { id: Date.now().toString(), text: '', youtubeUrl: '' }])} className="text-orange-500 text-xs font-bold hover:underline transition-all">+ Option hinzufügen</button>
      
      <div className="space-y-3 pt-4 border-t border-gray-800">
        <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Wer darf an dieser Umfrage teilnehmen?</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {GROUPS.map(g => (
            <label key={g} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${allowedGroups.includes(g) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <input type="checkbox" className="hidden" checked={allowedGroups.includes(g)} onChange={() => toggleGroup(g)} />
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${allowedGroups.includes(g) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'}`}>
                {allowedGroups.includes(g) && <Check size={12} className="text-gray-950" strokeWidth={4} />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter truncate">{g}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="text-gray-500 font-bold px-4 py-2 hover:text-gray-300">Abbrechen</button>
        <button type="submit" className="flex-1 bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg active:scale-[0.99] transition-all">Umfrage speichern</button>
      </div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onVote, onStatusChange, isArchived, onEdit, onDelete, users }) {
  const [selected, setSelected] = useState([]);
  const hasVoted = survey.votedUsers?.includes(currentUser.id);
  const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);

  const surveyAllowedGroups = survey.allowedGroups || GROUPS;
  const isEligible = currentUser.role === 'admin' || surveyAllowedGroups.some(g => currentUser.groups?.includes(g));
  const eligibleUsersCount = users.filter(u => surveyAllowedGroups.some(g => u.groups?.includes(g))).length;

  if (!isEligible) return null;
  if (survey.status === 'draft' && currentUser.role !== 'admin') return null;

  const toggle = (id) => {
    if (selected.includes(id)) {
      setSelected(selected.filter(x => x !== id));
    } else {
      if ((survey.maxAnswers || 1) === 1) {
        setSelected([id]);
      } else if (selected.length < (survey.maxAnswers || 1)) {
        setSelected([...selected, id]);
      }
    }
  };

  return (
    <div className={`bg-gray-900 border rounded-3xl overflow-hidden shadow-xl transition-all ${survey.status === 'active' && !isArchived ? 'border-orange-500/50' : 'border-gray-800 opacity-80'}`}>
      <div className="p-6 border-b border-gray-800 bg-gray-950/20 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase text-orange-500 block mb-1">
            {isArchived ? 'Abstimmung Beendet' : survey.status} • {(survey.maxAnswers || 1) > 1 ? `Max. ${survey.maxAnswers} Stimmen` : '1 Stimme'}
          </span>
          <h4 className="text-xl font-bold text-white leading-tight">{survey.title}</h4>
        </div>
        <div className="flex flex-col sm:items-end gap-3 shrink-0">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800 flex items-center w-fit shadow-inner">
            <Users size={12} className="mr-1.5 text-orange-500" />
            {survey.votedUsers?.length || 0} / {eligibleUsersCount} haben abgestimmt
          </div>
          {currentUser.role === 'admin' && !isArchived && (
            <div className="flex gap-2 items-center">
              {survey.status === 'draft' && <button onClick={() => onStatusChange('active')} className="bg-green-500 text-gray-950 text-[10px] font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">Starten</button>}
              {survey.status === 'active' && <button onClick={() => onStatusChange('published')} className="bg-orange-500 text-gray-950 text-[10px] font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">Publizieren</button>}
              
              <button onClick={onEdit} className="p-2 bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors ml-2" title="Bearbeiten"><Edit2 size={16}/></button>
              <button onClick={onDelete} className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors" title="Löschen"><Trash2 size={16}/></button>
            </div>
          )}
        </div>
      </div>
      <div className="p-6 space-y-3">
        {hasVoted || survey.status === 'published' || isArchived ? (
          survey.options.map(o => {
            const pct = totalVotes === 0 ? 0 : Math.round(((o.votes || 0) / totalVotes) * 100);
            return (
              <div key={o.id} className="relative h-14 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex items-center px-4 group/opt">
                <div className="absolute left-0 top-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} />
                <div className="flex-1 font-bold text-white z-10 flex items-center gap-3">
                  <span className="truncate">{o.text}</span>
                  {o.youtubeUrl && <a href={o.youtubeUrl} target="_blank" rel="noreferrer" className="text-red-500 hover:scale-110 transition-transform"><Youtube size={16}/></a>}
                </div>
                <div className="text-right z-10">
                  <p className="text-sm font-black">{pct}%</p>
                  <p className="text-[9px] text-gray-600 font-bold tracking-tighter uppercase">{o.votes || 0} Stimmen</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="space-y-3">
            {survey.options.map(o => (
              <div key={o.id} onClick={() => toggle(o.id)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${selected.includes(o.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                   <span className="font-bold">{o.text}</span>
                   {o.youtubeUrl && <a href={o.youtubeUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-red-500 p-1 hover:scale-110 transition-transform"><Youtube size={18}/></a>}
                </div>
                <div className={`w-6 h-6 rounded-lg border-2 ${selected.includes(o.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'} flex items-center justify-center transition-all`}>
                  {selected.includes(o.id) && <Check size={16} strokeWidth={4} className="text-gray-950" />}
                </div>
              </div>
            ))}
            <button disabled={selected.length === 0} onClick={() => onVote(selected)} className="w-full mt-2 bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-30">Abstimmung senden</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MembersView({ users }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const saveMember = async (m) => {
    const id = m.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...m, id });
    setShowAdd(false);
    setEditingUser(null);
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      let count = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Trennzeichen-Erkennung für Komma oder Semikolon (Standard-CSV aus Excel ist oft Semikolon)
        const parts = line.split(/[,;]/);
        if (parts.length >= 2) {
          const firstName = parts[0].trim();
          const lastName = parts[1].trim();
          
          // Header-Zeile überspringen, falls "Vorname" drin steht
          if (firstName && lastName && firstName.toLowerCase() !== 'vorname') {
            const id = Date.now().toString() + i; // Sicherstellen, dass die ID unique ist
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), {
              id, 
              firstName, 
              lastName, 
              role: 'member', 
              groups: [] 
            });
            count++;
          }
        }
      }
      alert(`${count} Mitglieder wurden erfolgreich importiert.`);
      e.target.value = ''; // Input zurücksetzen
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white">Mitglieder</h2>
          <p className="text-gray-500 text-sm mt-1">Verwalte Rollen und Gruppenberechtigungen</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-3 rounded-2xl flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-lg" title="CSV/Excel Import (Format: Vorname;Nachname)">
            <UploadCloud size={20} /> <span className="hidden sm:inline">CSV Import</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </label>
          <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/10">
            {showAdd ? 'Abbrechen' : <><UserPlus size={20} /> Mitglied hinzufügen</>}
          </button>
        </div>
      </div>
      
      {showAdd && <MemberForm onSubmit={saveMember} onCancel={() => setShowAdd(false)} />}
      {editingUser && <MemberForm initialData={editingUser} onSubmit={saveMember} onCancel={() => setEditingUser(null)} />}

      <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-950 text-[10px] font-black text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="px-6 py-5">Name & Gruppen</th>
                <th className="px-6 py-5">Rolle</th>
                <th className="px-6 py-5">Sicherheit</th>
                <th className="px-6 py-5 text-right">Optionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-5">
                    <p className="font-bold text-white text-lg">{u.firstName} {u.lastName}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                       {u.groups?.map(g => <span key={g} className="text-[8px] bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-500 uppercase font-black">{g}</span>)}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                     <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-800 text-gray-400'}`}>
                        {u.role === 'admin' ? 'Administrator' : 'Mitglied'}
                     </span>
                  </td>
                  <td className="px-6 py-5">
                    {u.groups?.includes('Vorstand') ? (
                       u.password ? <span className="text-green-500 flex items-center gap-1 text-[10px] font-black"><Lock size={12}/> PASSWORT AKTIV</span> : <span className="text-orange-500 flex items-center gap-1 text-[10px] font-black animate-pulse"><Unlock size={12}/> EINRICHTUNG NÖTIG</span>
                    ) : <span className="text-gray-700 text-[10px] font-black uppercase">Standard-Login</span>}
                  </td>
                  <td className="px-6 py-5 text-right whitespace-nowrap">
                     <button onClick={() => setEditingUser(u)} className="text-gray-700 hover:text-orange-500 transition-colors p-2 hover:bg-orange-500/10 rounded-xl active:scale-90 mr-1" title="Bearbeiten"><Edit2 size={18}/></button>
                     <button onClick={() => { if(confirm('Soll dieses Mitglied entfernt werden?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id)); }} className="text-gray-700 hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-xl active:scale-90" title="Löschen"><Trash2 size={18}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MemberForm({ onSubmit, onCancel, initialData }) {
  const [form, setForm] = useState(initialData || { firstName: '', lastName: '', role: 'member', groups: [] });
  
  const toggleGroup = g => setForm(f => ({ ...f, groups: f.groups.includes(g) ? f.groups.filter(x => x !== g) : [...f.groups, g] }));
  
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-6 animate-in slide-in-from-top-4 duration-300 shadow-2xl">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Vorname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="z.B. Max" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Nachname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="z.B. Muster" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Rolle</label>
          <select required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all appearance-none" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="member">Mitglied</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Gruppen-Berechtigungen</label>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {GROUPS.map(g => (
            <label key={g} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.groups.includes(g) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <input type="checkbox" className="hidden" checked={form.groups.includes(g)} onChange={() => toggleGroup(g)} />
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all ${form.groups.includes(g) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'}`}>
                {form.groups.includes(g) && <Check size={12} className="text-gray-950" strokeWidth={4} />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter truncate">{g}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-4 pt-6 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-bold transition-colors">Abbrechen</button>
        <button type="submit" className="bg-orange-500 text-gray-950 font-black px-10 py-4 rounded-2xl shadow-lg active:scale-95 transition-all">Mitglied speichern</button>
      </div>
    </form>
  );
}
