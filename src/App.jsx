import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, Edit2,
  FileText, Youtube, Lock, Unlock, Send, ExternalLink,
  ClipboardList, UserCheck, Paperclip, Save, X, RefreshCw
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, updateDoc } from 'firebase/firestore';

// --- Sichere Konfigurations-Initialisierung ---
let firebaseConfig = {};
try {
  firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
} catch (e) {
  console.error("Firebase Config Error:", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruesssuuger-app-v1';

// Initialisierung der Firebase-Dienste
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

  // --- Authentifizierung (Rule 3) ---
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

  // --- Daten-Subscription (Rule 1 & 2) ---
  useEffect(() => {
    if (!user) return;
    
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    const minutesRef = collection(db, 'artifacts', appId, 'public', 'data', 'minutes');

    // Subscription für Benutzer
    const unsubUsers = onSnapshot(usersRef, 
      (s) => {
        setUsers(s.docs.map(d => ({ ...d.data(), id: d.id })));
        setDbReady(true);
        setConnError(null);
      },
      (err) => {
        console.error("Users Snapshot Error:", err);
        if (err.code === 'permission-denied') {
          setConnError("Keine Berechtigung zum Lesen der Daten. Prüfe die Firestore Regeln.");
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

  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      }
      // Optional: Ein Beispiel-Event anlegen
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', 'init-event'), {
        id: 'init-event',
        title: 'Erste Sitzung',
        category: 'Generalversammlung',
        date: new Date().toISOString().split('T')[0],
        isArchived: false,
        surveys: [],
        createdAt: new Date().toISOString()
      });
    } catch (e) { 
      console.error(e);
      setConnError("Fehler beim Initialisieren der Datenbank.");
    }
    setIsSeeding(false);
  };

  const isVorstand = useMemo(() => currentUser?.groups?.includes('Vorstand'), [currentUser]);

  // --- Fehlerbildschirm ---
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

  // Warte NUR auf die grundlegende Authentifizierung
  if (!user || !dbReady) {
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

  // --- Login Screen ---
  if (!currentUser) {
    return <LoginScreen users={users} onLogin={u => setCurrentUser(u)} onSeed={seedDatabase} isSeeding={isSeeding} />;
  }

  // --- Haupt-UI ---
  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black italic tracking-tighter">
              <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">{currentUser.firstName} {currentUser.lastName}</p>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">{currentUser.role}</p>
            </div>
            <button onClick={() => setCurrentUser(null)} className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all active:scale-95 group">
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
          {activeTab === 'archive' && currentUser.role === 'admin' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} />}
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

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const u = users.find(x => x.firstName.toLowerCase() === firstName.toLowerCase() && x.lastName.toLowerCase() === lastName.toLowerCase());
    if (!u) {
      setError("Mitglied nicht gefunden.");
      return;
    }
    
    if (u.groups?.includes('Vorstand')) {
      setFoundUser(u);
      setStep(!u.password ? 'setPassword' : 'password');
      setError('');
    } else {
      onLogin(u);
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
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.id), { password });
        onLogin({ ...foundUser, password });
      } catch (err) {
        setError("Fehler beim Speichern.");
      }
    } else {
      if (password === foundUser.password) {
        onLogin(foundUser);
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
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span>
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

// --- Protokoll View & Editor ---
function ProtocolView({ minutes, users, currentUser }) {
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const vorstandMembers = useMemo(() => users.filter(u => u.groups?.includes('Vorstand')), [users]);

  const saveProtocol = async (p) => {
    const id = p.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...p, id });
    setShowAdd(false);
    setEditing(null);
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-white">Vorstands-Protokolle</h2>
          <p className="text-gray-500 text-sm mt-1">Interne Sitzungsprotokolle und Beschlüsse</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
          <Plus size={20} /> Neues Protokoll
        </button>
      </div>

      <div className="grid gap-4">
        {minutes.sort((a,b) => b.date.localeCompare(a.date)).map(m => (
          <div key={m.id} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-gray-700 transition-all group">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-orange-500/10 text-orange-500 text-[10px] font-black px-2 py-1 rounded-md border border-orange-500/20 uppercase tracking-widest">{new Date(m.date).toLocaleDateString('de-CH')}</span>
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic opacity-50 group-hover:opacity-100 transition-opacity">Archiviert</span>
              </div>
              <h3 className="text-2xl font-black text-white">{m.title}</h3>
              <p className="text-sm text-gray-500 mt-2 line-clamp-1 italic">Vorsitz: {m.traktanden?.['Präsident']?.[0]?.text || 'Nicht angegeben'}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEditing(m)} className="p-4 bg-gray-800 text-gray-400 hover:text-white rounded-2xl transition-all active:scale-90" title="Bearbeiten">
                <Edit2 size={20} />
              </button>
              <button onClick={() => { if(confirm('Möchtest du dieses Protokoll wirklich löschen?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', m.id)); }} className="p-4 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-2xl transition-all active:scale-90" title="Löschen">
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        ))}
        {minutes.length === 0 && (
          <div className="text-center py-20 bg-gray-900/50 border border-gray-800 border-dashed rounded-3xl">
            <ClipboardList className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-600 font-bold uppercase tracking-widest text-sm">Keine Protokolle vorhanden</p>
          </div>
        )}
      </div>
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

  const updateAttendance = (userId, status) => {
    setForm(prev => ({
      ...prev,
      attendance: { ...prev.attendance, [userId]: status }
    }));
  };

  const addPoint = (traktandum) => {
    const id = Date.now().toString();
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

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl">
        <div className="flex-1 space-y-4">
          <input 
            className="w-full bg-transparent text-4xl font-black text-white border-b-2 border-gray-800 focus:border-orange-500 outline-none transition-all placeholder:text-gray-800" 
            placeholder="Sitzungstitel..." 
            value={form.title} 
            onChange={e => setForm({...form, title: e.target.value})} 
          />
          <div className="flex items-center gap-4">
            <Calendar className="text-orange-500" size={20} />
            <input 
              type="date" 
              className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-white focus:border-orange-500 outline-none" 
              value={form.date} 
              onChange={e => setForm({...form, date: e.target.value})} 
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="px-6 py-3 text-gray-500 font-bold hover:text-white transition-colors">Abbrechen</button>
          <button onClick={() => { if(!form.title) return alert("Bitte Titel eingeben."); onSave(form); }} className="px-8 py-3 bg-orange-500 text-gray-950 font-black rounded-2xl flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all">
            <Save size={20} /> Speichern
          </button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1 bg-gray-900 border border-gray-800 p-8 rounded-3xl h-fit sticky top-24 shadow-xl">
          <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
            <UserCheck className="text-orange-500" /> Anwesenheit
          </h3>
          <div className="space-y-4">
            {vorstand.map(m => (
              <div key={m.id} className="p-4 bg-gray-950 rounded-2xl border border-gray-800">
                <p className="font-bold text-white mb-3 text-sm">{m.firstName} {m.lastName}</p>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: 'present', label: 'Anw.', color: 'bg-green-500/20 text-green-500 border-green-500/50' },
                    { id: 'absent', label: 'Unen.', color: 'bg-red-500/20 text-red-500 border-red-500/50' },
                    { id: 'excused', label: 'Ents.', color: 'bg-blue-500/20 text-blue-500 border-blue-500/50' }
                  ].map(status => (
                    <button
                      key={status.id}
                      onClick={() => updateAttendance(m.id, status.id)}
                      className={`text-[9px] font-black uppercase py-2 rounded-lg border transition-all ${
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
            <div key={traktandum} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-black text-white italic tracking-tight underline decoration-orange-500 decoration-4 underline-offset-8">
                  {traktandum}
                </h3>
                <button 
                  onClick={() => addPoint(traktandum)} 
                  className="p-3 bg-gray-950 border border-gray-800 text-orange-500 hover:bg-orange-500 hover:text-gray-950 rounded-xl transition-all active:scale-90"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {form.traktanden[traktandum]?.map((point) => (
                  <div key={point.id} className="p-6 bg-gray-950 border border-gray-800 rounded-2xl space-y-4 group">
                    <div className="flex justify-between gap-4">
                      <textarea 
                        className="flex-1 bg-transparent text-gray-200 border-none focus:ring-0 outline-none resize-none placeholder:text-gray-800 text-sm font-medium leading-relaxed" 
                        placeholder="Beschluss oder Notiz schreiben..."
                        rows={2}
                        value={point.text}
                        onChange={e => updatePoint(traktandum, point.id, 'text', e.target.value)}
                      />
                      <button 
                        onClick={() => removePoint(traktandum, point.id)} 
                        className="text-gray-700 hover:text-red-500 self-start transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-900">
                      <div className="w-full flex items-center gap-3 bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-800">
                        <Paperclip size={16} className="text-orange-500 shrink-0" />
                        <input 
                          className="w-full bg-transparent text-[11px] text-gray-500 focus:text-white outline-none" 
                          placeholder="Link (PDF/Word/Excel)..."
                          value={point.docUrl}
                          onChange={e => updatePoint(traktandum, point.id, 'docUrl', e.target.value)}
                        />
                      </div>
                      <input 
                        className="w-full sm:w-48 bg-gray-900 px-4 py-2.5 rounded-xl border border-gray-800 text-[11px] text-gray-500 focus:text-white outline-none" 
                        placeholder="Dokument-Name..."
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
            <div className="flex justify-between items-center text-xs text-gray-500">
               <span>{new Date(e.date).toLocaleDateString('de-CH')}</span>
               <div className="flex items-center gap-1"><BarChart3 size={14}/> {e.surveys?.length || 0} Umfragen</div>
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

function EventDetail({ event, onBack, currentUser, onUpdate, onDelete, users }) {
  const [showSurveyForm, setShowSurveyForm] = useState(false);

  const addSurvey = (s) => {
    const newSurveys = [...(event.surveys || []), { ...s, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
    onUpdate({ surveys: newSurveys });
    setShowSurveyForm(false);
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4">
      <div className="flex items-center gap-6">
        <button onClick={onBack} className="bg-gray-900 p-3 rounded-2xl hover:text-orange-500 transition-all active:scale-90"><ChevronRight className="rotate-180" size={24} /></button>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-white">{event.title}</h2>
          <p className="text-orange-500 text-xs font-bold uppercase">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => onUpdate({ isArchived: !event.isArchived })} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl hover:text-orange-500 transition-all" title="Archivieren"><Archive size={20}/></button>
            <button onClick={() => { if(confirm('Soll dieser Event gelöscht werden?')) onDelete(); }} className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-500/20"><Trash2 size={20}/></button>
          </div>
        )}
      </div>

      {currentUser.role === 'admin' && !event.isArchived && (
        <button onClick={() => setShowSurveyForm(!showSurveyForm)} className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all">
          {showSurveyForm ? 'Abbrechen' : 'Neue Umfrage hinzufügen'}
        </button>
      )}

      {showSurveyForm && <CreateSurveyForm onSubmit={addSurvey} />}

      <div className="space-y-6">
        {event.surveys?.map(s => (
          <SurveyCard key={s.id} survey={s} currentUser={currentUser} onVote={opts => {
            const newSurveys = event.surveys.map(x => {
              if (x.id === s.id) {
                const optMap = x.options.map(o => opts.includes(o.id) ? { ...o, votes: (o.votes || 0) + 1 } : o);
                return { ...x, options: optMap, votedUsers: [...x.votedUsers, currentUser.id] };
              }
              return x;
            });
            onUpdate({ surveys: newSurveys });
          }} onStatusChange={st => onUpdate({ surveys: event.surveys.map(x => x.id === s.id ? {...x, status: st} : x) })} users={users} />
        ))}
      </div>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], date: '' });
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <input required className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" placeholder="Titel" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        <select className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" required className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
      </div>
      <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg">Event speichern</button>
    </form>
  );
}

function CreateSurveyForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState([{ id: '1', text: '', youtubeUrl: '' }, { id: '2', text: '', youtubeUrl: '' }]);
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ title, options: options.filter(o => o.text.trim()), maxAnswers: 1 }); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
      <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white focus:border-orange-500 outline-none" placeholder="Was ist die Frage?" value={title} onChange={e => setTitle(e.target.value)} />
      {options.map((o, i) => (
        <div key={o.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-950 border border-gray-800 rounded-2xl">
          <input required className="bg-transparent border-b border-gray-800 px-2 py-2 text-white outline-none focus:border-orange-500 font-bold" placeholder={`Option ${i+1}`} value={o.text} onChange={e => { const n = [...options]; n[i].text = e.target.value; setOptions(n); }} />
          <div className="flex items-center gap-2">
            <Youtube size={18} className="text-red-500 shrink-0" />
            <input className="w-full bg-transparent border-b border-gray-800 px-2 py-2 text-gray-500 outline-none focus:border-orange-500 text-xs" placeholder="YouTube Link..." value={o.youtubeUrl} onChange={e => { const n = [...options]; n[i].youtubeUrl = e.target.value; setOptions(n); }} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setOptions([...options, { id: Date.now().toString(), text: '', youtubeUrl: '' }])} className="text-orange-500 text-xs font-bold hover:underline transition-all">+ Option hinzufügen</button>
      <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg active:scale-[0.99] transition-all">Umfrage im Entwurf speichern</button>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onVote, onStatusChange }) {
  const [selected, setSelected] = useState([]);
  const hasVoted = survey.votedUsers?.includes(currentUser.id);
  const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);

  if (survey.status === 'draft' && currentUser.role !== 'admin') return null;

  return (
    <div className={`bg-gray-900 border rounded-3xl overflow-hidden shadow-xl transition-all ${survey.status === 'active' ? 'border-orange-500/50' : 'border-gray-800'}`}>
      <div className="p-6 border-b border-gray-800 bg-gray-950/20 flex justify-between items-start">
        <div>
          <span className="text-[10px] font-black uppercase text-orange-500 block mb-1">{survey.status}</span>
          <h4 className="text-xl font-bold text-white leading-tight">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            {survey.status === 'draft' && <button onClick={() => onStatusChange('active')} className="bg-green-500 text-gray-950 text-[10px] font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">Starten</button>}
            {survey.status === 'active' && <button onClick={() => onStatusChange('published')} className="bg-orange-500 text-gray-950 text-[10px] font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">Publizieren</button>}
          </div>
        )}
      </div>
      <div className="p-6 space-y-3">
        {hasVoted || survey.status === 'published' ? (
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
              <div key={o.id} onClick={() => setSelected([o.id])} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${selected.includes(o.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
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
  const saveMember = async (m) => {
    const id = m.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...m, id });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white">Mitglieder</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/10">
          {showAdd ? 'Abbrechen' : <><UserPlus size={20} /> Mitglied hinzufügen</>}
        </button>
      </div>
      {showAdd && <MemberForm onSubmit={saveMember} onCancel={() => setShowAdd(false)} />}
      <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-950 text-[10px] font-black text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="px-6 py-5">Name & Gruppen</th>
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
                    {u.groups?.includes('Vorstand') ? (
                       u.password ? <span className="text-green-500 flex items-center gap-1 text-[10px] font-black"><Lock size={12}/> PASSWORT AKTIV</span> : <span className="text-orange-500 flex items-center gap-1 text-[10px] font-black animate-pulse"><Unlock size={12}/> EINRICHTUNG NÖTIG</span>
                    ) : <span className="text-gray-700 text-[10px] font-black uppercase">Standard-Login</span>}
                  </td>
                  <td className="px-6 py-5 text-right">
                     <button onClick={() => { if(confirm('Soll dieses Mitglied entfernt werden?')) deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id)); }} className="text-gray-700 hover:text-red-500 transition-colors p-2 hover:bg-red-500/10 rounded-xl active:scale-90"><Trash2 size={18}/></button>
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

function MemberForm({ onSubmit, onCancel }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', role: 'member', groups: [] });
  const toggleGroup = g => setForm(f => ({ ...f, groups: f.groups.includes(g) ? f.groups.filter(x => x !== g) : [...f.groups, g] }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-6 animate-in slide-in-from-top-4 duration-300 shadow-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Vorname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="z.B. Max" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Nachname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all" placeholder="z.B. Muster" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
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
