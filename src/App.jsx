import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, 
  Edit2, FileSpreadsheet, Upload, X, Info
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

const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];

const INITIAL_USERS = [
  { id: '1', firstName: 'Admin', lastName: 'Suuger', role: 'admin', groups: ['Vorstand', 'Aktive'] },
];

const INITIAL_EVENTS = [
  {
    id: 'e1',
    title: 'Generalversammlung 2026',
    category: 'Generalversammlung',
    date: '2026-04-15',
    isArchived: false,
    surveys: []
  }
];

export default function App() {
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
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
    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
      unsubUsers = onSnapshot(usersRef, (snap) => {
          setUsers(snap.docs.map(d => d.data()));
          setIsDBReady(true);
        }, (err) => {
          if (err.code === 'permission-denied') setPermissionsError("Fehlende Berechtigungen für Firestore.");
        }
      );
      unsubEvents = onSnapshot(eventsRef, (snap) => {
          setEvents(snap.docs.map(d => d.data()));
          setIsDBReady(true);
        }, (err) => {
          if (err.code === 'permission-denied') setPermissionsError("Fehlende Berechtigungen für Firestore.");
        }
      );
    } catch (err) { console.error(err); }
    return () => { unsubUsers(); unsubEvents(); };
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

  const seedDatabase = async () => {
    if (!fbUser) return alert("Bitte warte auf die Firebase-Verbindung.");
    setIsSeeding(true);
    try {
      if (!db) throw new Error("Datenbank nicht initialisiert");
      for (const u of INITIAL_USERS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      for (const e of INITIAL_EVENTS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', e.id), e);
    } catch (err) { alert(`Fehler: ${err.message}`); }
    setIsSeeding(false);
  };

  const handleLogin = async (firstName, lastName) => {
    const user = users.find(u => u.firstName.toLowerCase() === firstName.toLowerCase() && u.lastName.toLowerCase() === lastName.toLowerCase());
    if (user) {
        setCurrentUser(user);
        if (fbUser) await updateProfile(fbUser, { displayName: user.id });
    } else {
        alert("Mitglied nicht gefunden. Bitte Vor- und Nachname prüfen.");
    }
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    setActiveTab('events');
    if (fbUser) await updateProfile(fbUser, { displayName: "" });
  };

  if (authError) return <FatalErrorScreen message={`Anmeldefehler: ${authError}`} />;
  if (permissionsError) return <FatalErrorScreen message={permissionsError} />;

  if (!fbUser || !isDBReady || isCheckingSession) {
     return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
           <div className="flex flex-col items-center animate-in fade-in zoom-in duration-700">
              <div className="text-5xl sm:text-7xl font-black tracking-tighter mb-6 flex flex-col items-center">
                 <span className="text-gray-400 drop-shadow-lg">Rüss</span>
                 <span className="text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.4)] -mt-2">Suuger</span>
                 <span className="text-gray-600 text-xl font-bold uppercase tracking-[0.3em] mt-2 drop-shadow-md">Ämme</span>
              </div>
              <div className="flex items-center gap-3 mt-4">
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
              </div>
           </div>
        </div>
     );
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} onSeed={seedDatabase} isSeeding={isSeeding} />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-tight">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
              </h1>
              <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Voting Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{currentUser.firstName} {currentUser.lastName}</p>
              <p className="text-xs text-gray-400">{currentUser.role === 'admin' ? 'Administrator' : 'Mitglied'}</p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400 hover:text-orange-500" title="Abmelden">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {currentUser.role === 'admin' && (
          <nav className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
            <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={18} />} label="Events" />
            <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
            <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Stammdaten" />
          </nav>
        )}

        {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
        {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
        {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} fbUser={fbUser} />}
      </main>
    </div>
  );
}

function FatalErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-2xl p-8 shadow-2xl text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white mb-2">Fehler</h1>
        <p className="text-red-300 text-sm mb-6">{message}</p>
        <div className="text-left bg-red-900/50 p-4 rounded-lg border border-red-800 text-xs text-red-200 mt-4">
            <p className="font-bold mb-2 font-sans text-white text-xs">Prüfe deine Firestore-Regeln!</p>
        </div>
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-2xl p-8 shadow-2xl text-center">
        <Settings className="mx-auto text-orange-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white mb-2">Setup erforderlich</h1>
        <p className="text-gray-400 text-sm">Bitte trage deine Konfiguration in der App.jsx ein.</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, users, onSeed, isSeeding }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const onSubmit = (e) => { e.preventDefault(); if (firstName && lastName) onLogin(firstName.trim(), lastName.trim()); };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-orange-500"></div>
        <div className="flex flex-col items-center mb-10 mt-4">
          <h1 className="text-4xl font-black mb-1 text-center tracking-tighter">
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
          </h1>
          <p className="text-gray-500 uppercase text-[10px] font-bold tracking-[0.3em] ml-1">Ämme • Portal</p>
        </div>
        {users.length === 0 ? (
          <div className="text-center py-6">
            <Database className="mx-auto text-gray-700 mb-4" size={48} />
            <h3 className="text-white font-medium mb-2">Datenbank einrichten</h3>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-xl mt-4">Vereinsdaten laden</button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" />
            <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" />
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-2xl mt-4">Anmelden</button>
          </form>
        )}
      </div>
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

function MembersView({ users, dbAppId, db, fbUser }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const fileInputRef = useRef(null);

  const handleAddUser = async (user) => {
    if (!fbUser) return;
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', Date.now().toString()), { ...user, id: Date.now().toString() });
    setShowAdd(false);
  };

  const handleUpdateUser = async (user) => {
    if (!fbUser) return;
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', user.id), user);
    setEditingUser(null);
  };

  const removeUser = async (id) => {
    if (!fbUser || !confirm('Mitglied wirklich löschen?')) return;
    await deleteDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', id));
  };

  const handleCsvUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
      
      const importedMembers = rows.map((row, index) => {
        // Erkennt Komma oder Semikolon als Trenner
        const columns = row.split(/[;,]/).map(col => col.trim());
        if (columns.length < 2) return null;

        const firstName = columns[0];
        const lastName = columns[1];
        const groupRaw = columns[2] || '';
        
        // Versucht die Gruppe in der Liste der erlaubten Gruppen zu finden
        const matchedGroups = GROUPS.filter(g => 
          groupRaw.toLowerCase().includes(g.toLowerCase()) || 
          g.toLowerCase().includes(groupRaw.toLowerCase())
        );

        return {
          id: `import-${Date.now()}-${index}`,
          firstName,
          lastName,
          role: 'member',
          groups: matchedGroups.length > 0 ? matchedGroups : []
        };
      }).filter(Boolean);

      if (importedMembers.length === 0) {
        alert("Keine gültigen Daten gefunden. Bitte prüfe das Format (Vorname, Nachname, Gruppe).");
        return;
      }

      if (confirm(`${importedMembers.length} Mitglieder wurden erkannt. Jetzt importieren?`)) {
        for (const member of importedMembers) {
          await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', member.id), member);
        }
        alert("Import erfolgreich abgeschlossen!");
        setShowImport(false);
      }
    };
    reader.readAsText(file);
    // Reset file input
    event.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-white tracking-tight">Stammdaten</h2>
        <div className="flex gap-2">
            <button 
                onClick={() => setShowImport(!showImport)} 
                className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
                <FileSpreadsheet size={18} /> Import
            </button>
            <button 
                onClick={() => { setShowAdd(!showAdd); setEditingUser(null); }} 
                className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
                {showAdd ? 'Abbrechen' : <><UserPlus size={18} /> Hinzufügen</>}
            </button>
        </div>
      </div>
      
      {showImport && (
        <div className="bg-gray-900 border-2 border-dashed border-gray-700 p-8 rounded-2xl text-center">
            <Upload className="mx-auto text-orange-500 mb-4" size={40} />
            <h3 className="text-white font-bold text-lg mb-2">Excel / CSV Mitglieder-Import</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                Erstelle eine Excel-Liste mit den Spalten: <br/>
                <span className="text-orange-400 font-mono">Vorname, Nachname, Gruppe</span><br/>
                Speichere diese als <b>.csv</b> und lade sie hier hoch.
            </p>
            <div className="flex flex-col items-center gap-4">
                <input 
                    type="file" 
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="hidden" 
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-orange-500 text-gray-950 font-bold px-8 py-3 rounded-xl hover:bg-orange-600 transition-colors"
                >
                    Datei auswählen (.csv)
                </button>
                <button onClick={() => setShowImport(false)} className="text-gray-500 hover:text-gray-300 text-xs uppercase tracking-widest font-bold">Schliessen</button>
            </div>
            <div className="mt-6 p-4 bg-gray-950/50 rounded-xl border border-gray-800 text-left flex items-start gap-3">
                <Info className="text-blue-500 shrink-0" size={18} />
                <p className="text-[10px] text-gray-500 italic">Hinweis: Falls ein Mitglied bereits existiert, wird ein Duplikat erstellt (basierend auf neuer ID). Die Gruppenerkennung ist flexibel (z.B. "aktiv" wird als "Aktive" erkannt).</p>
            </div>
        </div>
      )}

      {showAdd && <MemberForm onSubmit={handleAddUser} onCancel={() => setShowAdd(false)} />}
      {editingUser && <MemberForm initialData={editingUser} onSubmit={handleUpdateUser} onCancel={() => setEditingUser(null)} />}
      
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-950 border-b border-gray-800 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                    <th className="p-4">Name</th>
                    <th className="p-4">Rolle</th>
                    <th className="p-4">Gruppen</th>
                    <th className="p-4 text-right">Verwaltung</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
                {users.sort((a,b) => a.lastName.localeCompare(b.lastName)).map(u => (
                <tr key={u.id} className="hover:bg-black/20 transition-colors">
                    <td className="p-4 text-white font-bold whitespace-nowrap">{u.lastName} {u.firstName}</td>
                    <td className="p-4">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-widest inline-flex items-center gap-2 ${u.role === 'admin' ? 'bg-orange-500/20 text-orange-500 border border-orange-500/20' : 'bg-gray-800/50 text-gray-500'}`}>
                            {u.role === 'admin' && <ShieldAlert size={10}/>} {u.role}
                        </span>
                    </td>
                    <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                            {u.groups.map(g => (
                                <span key={g} className="text-[10px] bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-400 font-bold">{g}</span>
                            ))}
                        </div>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-1">
                        <button onClick={() => { setEditingUser(u); setShowAdd(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-gray-500 hover:text-orange-500 transition-colors p-2 rounded-lg" title="Bearbeiten">
                            <Edit2 size={18} />
                        </button>
                        <button onClick={() => removeUser(u.id)} className="text-gray-500 hover:text-red-500 transition-colors p-2 rounded-lg" title="Löschen">
                            <Trash2 size={18} />
                        </button>
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

function MemberForm({ onSubmit, initialData, onCancel }) {
  const [firstName, setFirstName] = useState(initialData?.firstName || '');
  const [lastName, setLastName] = useState(initialData?.lastName || '');
  const [role, setRole] = useState(initialData?.role || 'member');
  const [selectedGroups, setSelectedGroups] = useState(initialData?.groups || []);

  const toggleGroup = (group) => {
      setSelectedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  };

  const submit = (e) => { 
      e.preventDefault(); 
      onSubmit({ ...initialData, firstName: firstName.trim(), lastName: lastName.trim(), role, groups: selectedGroups }); 
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border-2 border-orange-500/10 p-6 rounded-2xl mb-8 shadow-2xl relative overflow-hidden">
      <h3 className="text-xl font-bold text-white mb-6 tracking-tight">{initialData ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 font-bold" />
        <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 font-bold" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6 border-t border-gray-800 pt-6">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Berechtigungs-Level</label>
          <div className="bg-gray-950 border border-gray-800 p-1 rounded-xl">
              <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-transparent border-none px-3 py-2 text-white font-bold focus:ring-0 cursor-pointer">
                <option value="member" className="bg-gray-900">Standard Mitglied</option>
                <option value="admin" className="bg-gray-900 text-orange-500">Administrator</option>
              </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase block mb-2">Sektionen / Gruppen</label>
          <div className="grid grid-cols-2 gap-2 bg-gray-950 border border-gray-800 p-4 rounded-xl">
            {GROUPS.map(group => (
              <label key={group} className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-pointer hover:text-white transition-all">
                <input type="checkbox" checked={selectedGroups.includes(group)} onChange={() => toggleGroup(group)} className="w-4 h-4 accent-orange-500 rounded" />
                {group}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end items-center pt-4 gap-4 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-bold uppercase text-[10px] tracking-widest transition-all">Abbrechen</button>
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-8 py-3 rounded-xl transition-all shadow-lg active:scale-95 text-xs">
            {initialData ? 'Speichern' : 'Anlegen'}
        </button>
      </div>
    </form>
  );
}

function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db, fbUser }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const getDbRef = (id) => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', id);

  const handleCreateEvent = async (newEvent) => {
    if (!fbUser) return;
    const id = Date.now().toString();
    await setDoc(getDbRef(id), { ...newEvent, id, isArchived: false, surveys: [] });
    setShowCreate(false);
  };

  const handleArchive = async (eventId, archiveStatus) => {
    if (!fbUser) return;
    const event = events.find(e => e.id === eventId);
    if(event) await setDoc(getDbRef(eventId), { ...event, isArchived: archiveStatus });
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async (eventId) => {
    if (!fbUser || !confirm('Event unwiderruflich löschen?')) return;
    await deleteDoc(getDbRef(eventId));
    setSelectedEvent(null);
  };

  if (selectedEvent) {
    const currentEventData = events.find(e => e.id === selectedEvent.id);
    if (!currentEventData) { setSelectedEvent(null); return null; }
    return <EventDetail event={currentEventData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} fbUser={fbUser} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white tracking-tight">{isArchive ? 'Archiv' : 'Aktuelle Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
            {showCreate ? 'Abbrechen' : <><Plus size={18} /> Neuer Event</>}
          </button>
        )}
      </div>
      {showCreate && <CreateEventForm onSubmit={handleCreateEvent} />}
      {events.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
          <Calendar size={48} className="mx-auto text-gray-700 mb-4" />
          <p className="text-gray-500">Keine Events gefunden.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map(event => (
            <div key={event.id} onClick={() => setSelectedEvent(event)} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl cursor-pointer hover:border-orange-500/50 transition-colors group active:scale-[0.98]">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-orange-500 uppercase bg-orange-500/10 px-2 py-1 rounded-md">{event.category}</span>
                <ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-white mt-1 mb-4">{event.title}</h3>
              <div className="flex justify-between text-xs text-gray-500 font-medium">
                <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(event.date).toLocaleDateString('de-CH')}</span>
                <span className="flex items-center gap-1"><BarChart3 size={14} /> {event.surveys.length} Umfragen</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState('');
  const [customCategory, setCustomCategory] = useState('');

  const submit = (e) => { 
      e.preventDefault(); 
      const finalCategory = category === 'Freitext' ? customCategory.trim() : category;
      if (category === 'Freitext' && !finalCategory) return alert('Bitte eigene Kategorie eingeben.');
      onSubmit({ title, category: finalCategory, date }); 
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl mb-8 space-y-4 shadow-xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
           <label className="block text-xs text-gray-500 mb-1 font-bold">Titel</label>
           <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Z.B. Fasnacht 2026" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
        </div>
        <div>
           <label className="block text-xs text-gray-500 mb-1 font-bold">Kategorie</label>
           <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
           {category === 'Freitext' && (
               <input type="text" required value={customCategory} onChange={e => setCustomCategory(e.target.value)} placeholder="Name der Kategorie" className="w-full mt-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
           )}
        </div>
        <div>
           <label className="block text-xs text-gray-500 mb-1 font-bold">Datum</label>
           <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500 focus:outline-none" />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-6 py-2 rounded-lg transition-colors shadow-lg">Speichern</button>
      </div>
    </form>
  );
}

function EventDetail({ event, onBack, currentUser, onArchive, onDelete, users, dbAppId, db, fbUser }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', event.id);

  const handleAddSurvey = async (newSurvey) => {
    if (!fbUser) return;
    const updatedSurveys = [...event.surveys, { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
    setShowCreateSurvey(false);
  };

  const updateSurvey = async (surveyId, updates) => {
    if (!fbUser) return;
    const updatedSurveys = event.surveys.map(s => s.id === surveyId ? { ...s, ...updates } : s);
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
  };

  const handleVote = async (surveyId, selectedOptionIds) => {
    if (!fbUser) return;
    const updatedSurveys = event.surveys.map(s => {
      if (s.id === surveyId) {
        const updatedOptions = s.options.map(opt => selectedOptionIds.includes(opt.id) ? { ...opt, votes: opt.votes + 1 } : opt);
        return { ...s, options: updatedOptions, votedUsers: [...s.votedUsers, currentUser.id] };
      }
      return s;
    });
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
            <button onClick={onBack} className="text-gray-400 hover:text-white bg-gray-900 p-2 rounded-lg border border-gray-800"><ChevronRight className="rotate-180" size={20} /></button>
            <div className="flex-1">
                <h2 className="text-2xl font-bold text-white">{event.title}</h2>
                <p className="text-sm text-gray-400">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
            </div>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => onArchive(event.id, !event.isArchived)} className="px-4 py-2 rounded-lg text-sm border bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700 flex items-center gap-2"><Archive size={16} /> {event.isArchived ? 'Aktivieren' : 'Archivieren'}</button>
            <button onClick={() => onDelete(event.id)} className="px-4 py-2 rounded-lg text-sm border bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 flex items-center gap-2"><Trash2 size={16} /> Löschen</button>
          </div>
        )}
      </div>
      {currentUser.role === 'admin' && !event.isArchived && (
        <div className="flex justify-end">
            <button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 mb-4 transition-colors">
            {showCreateSurvey ? 'Abbrechen' : <><Plus size={18} /> Neue Umfrage</>}
            </button>
        </div>
      )}
      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} />}
      <div className="space-y-6">
        {event.surveys.length === 0 ? <p className="text-gray-500 text-center py-8">Keine Umfragen in diesem Event.</p> : 
            event.surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(u) => updateSurvey(survey.id, u)} onVote={(o) => handleVote(survey.id, o)} users={users} />)}
      </div>
    </div>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users }) {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const isEligible = currentUser.role === 'admin' || survey.allowedGroups.some(g => currentUser.groups.includes(g));
  const hasVoted = survey.votedUsers.includes(currentUser.id);
  const totalVotes = survey.options.reduce((sum, opt) => sum + opt.votes, 0);
  const eligibleUsersCount = users.filter(u => survey.allowedGroups.some(g => u.groups.includes(g))).length;

  if (!isEligible && currentUser.role !== 'admin') return null; 
  if (currentUser.role !== 'admin' && survey.status === 'draft') return null;

  const max = survey.maxAnswers || 1;
  const toggleOption = (id) => {
    if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id));
    else if (max === 1) setSelectedOptions([id]);
    else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]);
  };

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden transition-colors shadow-md ${survey.status === 'active' ? 'border-orange-500/50' : 'border-gray-800'}`}>
      <div className="p-5 border-b border-gray-800 bg-gray-900/50 flex flex-col sm:flex-row sm:justify-between items-start gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
             {survey.status === 'draft' && <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded font-bold uppercase tracking-wider">Entwurf</span>}
             {survey.status === 'active' && <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-1 rounded font-bold uppercase tracking-wider flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Aktiv</span>}
             {survey.status === 'published' && <span className="text-[10px] bg-orange-500/10 text-orange-500 px-2 py-1 rounded font-bold uppercase tracking-wider">Veröffentlicht</span>}
             <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{max === 1 ? 'Single Choice' : `Max. ${max} Stimmen`}</span>
          </div>
          <h4 className="text-xl font-bold text-white leading-tight">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 w-full sm:w-auto justify-between">
            <div className="flex gap-2">
                {survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-sm bg-green-500/20 text-green-500 hover:bg-green-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1"><CheckCircle2 size={16}/> Freigeben</button>}
                {survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-sm bg-orange-500 hover:bg-orange-600 text-gray-950 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"><Eye size={16}/> Beenden</button>}
            </div>
            <div className="text-[10px] text-gray-500 font-bold flex items-center gap-1"><Users size={12} /> {survey.votedUsers.length} / {eligibleUsersCount}</div>
          </div>
        )}
      </div>
      <div className="p-5">
        {survey.status === 'published' || currentUser.role === 'admin' ? (
          <div className="space-y-3">
             {survey.status === 'active' && currentUser.role === 'admin' && (
                 <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg flex items-start gap-3">
                     <AlertCircle className="text-blue-500 mt-0.5 flex-shrink-0" size={18} />
                     <p className="text-[11px] text-blue-400 italic">Resultate live nur für Admins sichtbar.</p>
                 </div>
             )}
             {survey.options.map(opt => {
                const pct = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
                return (
                  <div key={opt.id} className="relative w-full bg-black/20 border border-gray-800 rounded-xl overflow-hidden p-3 flex justify-between items-center group">
                    <div className="absolute top-0 left-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} />
                    <span className="relative z-10 font-medium text-sm text-white">{opt.text}</span>
                    <span className="relative z-10 text-xs text-gray-500 font-bold">{pct}% ({opt.votes})</span>
                  </div>
                )
             })}
          </div>
        ) : hasVoted ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-3"><Check size={24} /></div>
              <h5 className="text-lg font-bold text-white">Abgestimmt!</h5>
          </div>
        ) : (
          <div className="space-y-2">
            {survey.options.map(opt => (
              <div key={opt.id} onClick={() => toggleOption(opt.id)} className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all active:scale-[0.99] ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-400 hover:border-gray-600'}`}>
                <div className={`w-5 h-5 flex items-center justify-center border transition-colors ${max > 1 ? 'rounded' : 'rounded-full'} ${selectedOptions.includes(opt.id) ? 'border-orange-500 bg-orange-500 text-gray-950' : 'border-gray-600'}`}>
                    {selectedOptions.includes(opt.id) && <Check size={14} className="stroke-[3]" />}
                </div>
                <span className="font-bold">{opt.text}</span>
              </div>
            ))}
            <div className="pt-4 flex justify-between gap-4">
                <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest italic">{selectedOptions.length} / {max} Stimmen</p>
                <button onClick={() => selectedOptions.length > 0 && onVote(selectedOptions)} disabled={selectedOptions.length === 0} className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-950 font-bold px-8 py-3 rounded-xl shadow-lg active:scale-95">Stimme abgeben</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
