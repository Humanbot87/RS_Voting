import React, { useState, useEffect } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert, Edit2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';

// --- Firebase Configuration ---
const MY_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB9sGsbG9WAQfp9xoEqOhzp_IDgMuwOYmE",
  authDomain: "ruesssuuger-voting.firebaseapp.com",
  projectId: "ruesssuuger-voting",
  storageBucket: "ruesssuuger-voting.firebasestorage.app",
  messagingSenderId: "737751466538",
  appId: "1:737751466538:web:4fe3f376738accc352f953"
};

const isPreviewEnvironment = typeof __firebase_config !== 'undefined';
const firebaseConfig = isPreviewEnvironment ? JSON.parse(__firebase_config) : MY_FIREBASE_CONFIG;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruesssuuger-app-v1';

// Initialize Firebase services outside the component
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];

// Definierter Admin für das Initial-Setup
const INITIAL_USERS = [
  { 
    id: 'admin_suuger', 
    firstName: 'Admin', 
    lastName: 'Suuger', 
    role: 'admin', 
    groups: ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder'] 
  },
  { id: '2', firstName: 'Max', lastName: 'Muster', role: 'member', groups: ['Aktive', 'Wagenbau'] },
  { id: '3', firstName: 'Anna', lastName: 'Beispiel', role: 'member', groups: ['Passiv'] },
];

const INITIAL_EVENTS = [
  {
    id: 'e1',
    title: 'Generalversammlung 2026',
    category: 'Generalversammlung',
    date: '2026-04-15',
    isArchived: false,
    surveys: [
      {
        id: 's1',
        title: 'Wahl des neuen Präsidenten',
        maxAnswers: 1,
        allowedGroups: ['Vorstand', 'Aktive', 'Ehrenmitglieder'],
        status: 'active',
        options: [
          { id: 'o1', text: 'Köbi Meier', votes: 1 },
          { id: 'o2', text: 'Hans Müller', votes: 0 },
        ],
        votedUsers: ['3']
      }
    ]
  }
];

export default function App() {
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('events');
  const [isSeeding, setIsSeeding] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState(null);

  // --- Rule 3: Auth Before Queries ---
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
        setError("Verbindung zum Authentifizierungsserver fehlgeschlagen.");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  // --- Rule 1 & 2: Data Fetching with correct paths ---
  useEffect(() => {
    if (!user) return;

    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');

    const unsubUsers = onSnapshot(usersRef, 
      (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        setDbReady(true);
      },
      (err) => {
        console.error("Snapshot Error Users:", err);
        if (err.code === 'permission-denied') {
          setError("Fehlende Berechtigungen. Bitte stellen Sie sicher, dass die Firestore-Regeln korrekt veröffentlicht wurden.");
        }
      }
    );

    const unsubEvents = onSnapshot(eventsRef, 
      (snapshot) => {
        setEvents(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        setDbReady(true);
      },
      (err) => {
        console.error("Snapshot Error Events:", err);
        if (err.code === 'permission-denied') {
          setError("Fehlende Berechtigungen. Bitte stellen Sie sicher, dass die Firestore-Regeln korrekt veröffentlicht wurden.");
        }
      }
    );

    return () => {
      unsubUsers();
      unsubEvents();
    };
  }, [user]);

  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      // Erstellt den Admin und die Testbenutzer
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      }
      // Erstellt einen Initial-Event
      for (const e of INITIAL_EVENTS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', e.id), e);
      }
      console.log("Admin 'Suuger' erfolgreich angelegt.");
    } catch (err) {
      console.error("Seeding error:", err);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleLogin = (firstName, lastName) => {
    const foundUser = users.find(u => 
      u.firstName.toLowerCase() === firstName.toLowerCase() && 
      u.lastName.toLowerCase() === lastName.toLowerCase()
    );
    if (foundUser) {
      setCurrentUser(foundUser);
    } else {
      setError("Mitglied nicht gefunden. Bitte prüfen Sie Vor- und Nachnamen.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('events');
  };

  if (error && error.includes("Berechtigungen")) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="text-red-500 mb-4" size={64} />
        <h1 className="text-2xl font-bold text-white mb-2">Verbindungsfehler</h1>
        <p className="text-gray-400 max-w-md mb-6">{error}</p>
        <div className="bg-gray-900 p-4 rounded-xl border border-gray-800 text-left text-xs font-mono text-gray-300 w-full max-w-lg">
          <p className="mb-2 text-orange-400 font-sans font-bold uppercase">Lösungsschritt:</p>
          <p>Gehen Sie in die Firebase Console zu "Firestore Database" &gt; "Rules" und fügen Sie folgendes ein:</p>
          <pre className="mt-2 bg-black p-3 rounded overflow-x-auto">
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
          </pre>
          <p className="mt-2 font-sans text-orange-400">Klicken Sie auf "Publish" und laden Sie diese Seite neu.</p>
        </div>
      </div>
    );
  }

  if (!user || (!dbReady && users.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mb-4"></div>
        <p className="text-gray-400 animate-pulse">Verbindung zur Datenbank wird aufgebaut...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} usersCount={users.length} onSeed={seedDatabase} isSeeding={isSeeding} loginError={error} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400 text-sm font-normal">Voting</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">{currentUser.firstName} {currentUser.lastName}</p>
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">{currentUser.role}</p>
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
            <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Mitglieder" />
          </nav>
        )}

        {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} />}
        {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} />}
        {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} />}
      </main>
    </div>
  );
}

function LoginScreen({ onLogin, usersCount, onSeed, isSeeding, loginError }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black mb-2"><span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span></h1>
          <p className="text-gray-500">Exklusives Voting-Portal für Mitglieder</p>
        </div>

        {usersCount === 0 ? (
          <div className="text-center py-6">
            <Database className="mx-auto text-gray-700 mb-4" size={48} />
            <h3 className="text-white font-bold mb-2">Datenbank leer</h3>
            <p className="text-sm text-gray-500 mb-6">Es wurden keine Mitglieder in der Datenbank gefunden.</p>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-xl transition-all disabled:opacity-50">
              {isSeeding ? 'Initialisierung...' : 'Initial-Setup (Admin Suuger erstellen)'}
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onLogin(firstName, lastName); }} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase ml-1">Mitgliedschaft prüfen</label>
              <input 
                type="text" 
                required 
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" 
                placeholder="Vorname"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
              />
              <input 
                type="text" 
                required 
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-orange-500 transition-colors" 
                placeholder="Nachname"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs font-bold mt-2 text-center">{loginError}</p>
            )}
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-4 rounded-xl mt-4 transition-all shadow-lg shadow-orange-500/20 active:scale-95">
              Anmelden
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all whitespace-nowrap ${active ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/10' : 'bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
      {icon} {label}
    </button>
  );
}

function EventsView({ events, currentUser, isArchive = false, users }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const handleCreateEvent = async (newEvent) => {
    const id = Date.now().toString();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), {
        ...newEvent,
        id,
        isArchived: false,
        surveys: [],
        createdAt: new Date().toISOString()
      });
      setShowCreate(false);
    } catch (e) { console.error(e); }
  };

  const handleUpdateEvent = async (id, data) => {
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...data }, { merge: true });
    } catch (e) { console.error(e); }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id));
      setSelectedEvent(null);
    } catch (e) { console.error(e); }
  };

  if (selectedEvent) {
    const current = events.find(e => e.id === selectedEvent.id);
    if (!current) { setSelectedEvent(null); return null; }
    return (
      <EventDetail 
        event={current} 
        onBack={() => setSelectedEvent(null)} 
        currentUser={currentUser} 
        onUpdate={(data) => handleUpdateEvent(current.id, data)}
        onDelete={() => handleDeleteEvent(current.id)}
        users={users}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white">{isArchive ? 'Archiv' : 'Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all active:scale-95">
            {showCreate ? 'Schliessen' : <><Plus size={20} /> Neu</>}
          </button>
        )}
      </div>

      {showCreate && <CreateEventForm onSubmit={handleCreateEvent} />}

      {events.length === 0 ? (
        <div className="text-center py-20 bg-gray-900 border border-gray-800 rounded-3xl">
          <Calendar size={64} className="mx-auto text-gray-800 mb-4" />
          <p className="text-gray-500 text-lg font-medium">Keine Events in dieser Kategorie.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map(event => (
            <div key={event.id} onClick={() => setSelectedEvent(event)} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl cursor-pointer hover:border-orange-500/40 transition-all group active:scale-[0.98]">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black text-orange-500 uppercase bg-orange-500/10 px-3 py-1 rounded-full">{event.category}</span>
                <ChevronRight className="text-gray-700 group-hover:text-orange-500 transition-colors" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{event.title}</h3>
              <div className="flex gap-4 text-xs text-gray-500 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-orange-500" /> {new Date(event.date).toLocaleDateString('de-CH')}</span>
                <span className="flex items-center gap-1.5"><BarChart3 size={14} className="text-orange-500" /> {event.surveys?.length || 0} Umfragen</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], date: '', customCategory: '' });

  const submit = (e) => {
    e.preventDefault();
    const category = form.category === 'Freitext' ? form.customCategory : form.category;
    onSubmit({ ...form, category });
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Titel</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:border-orange-500 outline-none transition-colors" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Kategorie</label>
          <select className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:border-orange-500 outline-none transition-colors" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {form.category === 'Freitext' && (
            <input required placeholder="Kategorie Name" className="w-full mt-2 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:border-orange-500 outline-none transition-colors" value={form.customCategory} onChange={e => setForm({...form, customCategory: e.target.value})} />
          )}
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Datum</label>
          <input type="date" required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white focus:border-orange-500 outline-none transition-colors" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-black px-8 py-3 rounded-xl transition-all shadow-lg shadow-orange-500/10 active:scale-95">Event Speichern</button>
      </div>
    </form>
  );
}

function EventDetail({ event, onBack, currentUser, onUpdate, onDelete, users }) {
  const [showSurveyForm, setShowSurveyForm] = useState(false);

  const addSurvey = (survey) => {
    const newSurveys = [...(event.surveys || []), { ...survey, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
    onUpdate({ surveys: newSurveys });
    setShowSurveyForm(false);
  };

  const updateSurvey = (surveyId, updates) => {
    const newSurveys = event.surveys.map(s => s.id === surveyId ? { ...s, ...updates } : s);
    onUpdate({ surveys: newSurveys });
  };

  const handleVote = (surveyId, selectedOptions) => {
    const newSurveys = event.surveys.map(s => {
      if (s.id === surveyId) {
        const updatedOptions = s.options.map(o => selectedOptions.includes(o.id) ? { ...o, votes: (o.votes || 0) + 1 } : o);
        return { ...s, options: updatedOptions, votedUsers: [...s.votedUsers, currentUser.id] };
      }
      return s;
    });
    onUpdate({ surveys: newSurveys });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-6 mb-8">
        <button onClick={onBack} className="bg-gray-900 border border-gray-800 p-3 rounded-2xl hover:text-orange-500 transition-colors">
          <ChevronRight className="rotate-180" size={24} />
        </button>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-white">{event.title}</h2>
          <p className="text-sm font-bold text-orange-500 uppercase tracking-widest">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => onUpdate({ isArchived: !event.isArchived })} className="bg-gray-900 border border-gray-800 p-3 rounded-2xl hover:text-orange-500" title="Archivieren">
              <Archive size={20} />
            </button>
            <button onClick={onDelete} className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl text-red-500 hover:bg-red-500/20" title="Löschen">
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>

      {currentUser.role === 'admin' && !event.isArchived && (
        <div className="flex justify-end mb-4">
          <button onClick={() => setShowSurveyForm(!showSurveyForm)} className="bg-orange-500 text-gray-950 font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 active:scale-95 transition-all">
            {showSurveyForm ? 'Abbrechen' : <><Plus size={20} /> Neue Umfrage</>}
          </button>
        </div>
      )}

      {showSurveyForm && <CreateSurveyForm onSubmit={addSurvey} />}

      <div className="space-y-6">
        {(event.surveys || []).length === 0 ? (
          <div className="text-center py-12 bg-gray-900/50 rounded-3xl border border-gray-800 border-dashed">
            <p className="text-gray-600 font-medium">Keine Umfragen für diesen Event vorhanden.</p>
          </div>
        ) : (
          event.surveys.map(s => (
            <SurveyCard 
              key={s.id} 
              survey={s} 
              currentUser={currentUser} 
              onUpdate={(u) => updateSurvey(s.id, u)} 
              onVote={(opts) => handleVote(s.id, opts)}
              users={users}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CreateSurveyForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [maxAnswers, setMaxAnswers] = useState(1);
  const [allowedGroups, setAllowedGroups] = useState(GROUPS);
  const [options, setOptions] = useState([{ id: '1', text: '' }, { id: '2', text: '' }]);

  const toggleGroup = (g) => setAllowedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  
  const submit = (e) => {
    e.preventDefault();
    const validOptions = options.filter(o => o.text.trim()).map((o, idx) => ({ id: `o${idx}`, text: o.text.trim(), votes: 0 }));
    if (validOptions.length < 2) return alert("Mindestens 2 Optionen nötig.");
    onSubmit({ title, maxAnswers, allowedGroups, options: validOptions });
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl space-y-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Umfrage-Frage</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" placeholder="Worüber wird abgestimmt?" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Optionen</label>
          {options.map((opt, i) => (
            <div key={opt.id} className="flex gap-2">
              <input required className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" value={opt.text} onChange={e => {
                const n = [...options];
                n[i].text = e.target.value;
                setOptions(n);
              }} />
              <button type="button" onClick={() => setOptions(options.filter(o => o.id !== opt.id))} disabled={options.length <= 2} className="p-3 text-gray-600 hover:text-red-500 disabled:opacity-30">
                <Trash2 size={20} />
              </button>
            </div>
          ))}
          {options.length < 10 && (
            <button type="button" onClick={() => setOptions([...options, { id: Date.now().toString(), text: '' }])} className="text-orange-500 text-sm font-bold flex items-center gap-1 mt-2">
              <Plus size={16} /> Option hinzufügen
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8 pt-4 border-t border-gray-800">
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Max. Antworten pro Person</label>
            <input type="number" min="1" max="10" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Wahlberechtigte Gruppen</label>
            <div className="grid grid-cols-2 gap-2">
              {GROUPS.map(g => (
                <label key={g} className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={allowedGroups.includes(g)} onChange={() => toggleGroup(g)} className="accent-orange-500" />
                  {g}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg shadow-orange-500/10 active:scale-95 transition-all">Umfrage Erstellen</button>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users }) {
  const [selected, setSelected] = useState([]);
  const hasVoted = survey.votedUsers?.includes(currentUser.id);
  const isEligible = survey.allowedGroups?.some(g => currentUser.groups.includes(g)) || currentUser.role === 'admin';
  const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const eligibleCount = users.filter(u => survey.allowedGroups?.some(g => u.groups.includes(g))).length;

  if (!isEligible && currentUser.role !== 'admin') return null;
  if (survey.status === 'draft' && currentUser.role !== 'admin') return null;

  const toggle = (id) => {
    if (selected.includes(id)) setSelected(prev => prev.filter(x => x !== id));
    else if (survey.maxAnswers === 1) setSelected([id]);
    else if (selected.length < survey.maxAnswers) setSelected([...selected, id]);
  };

  return (
    <div className={`bg-gray-900 border rounded-3xl overflow-hidden transition-all ${survey.status === 'active' ? 'border-orange-500/50' : 'border-gray-800'}`}>
      <div className="p-6 border-b border-gray-800 bg-gray-950/20 flex justify-between items-start">
        <div>
          <div className="flex gap-2 mb-2">
            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
              survey.status === 'draft' ? 'bg-gray-800 text-gray-500' :
              survey.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
            }`}>
              {survey.status}
            </span>
            <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">{survey.maxAnswers === 1 ? 'Single Choice' : `Max ${survey.maxAnswers} Stimmen`}</span>
          </div>
          <h4 className="text-xl font-bold text-white">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="text-right">
            <div className="flex gap-2 mb-2">
              {survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-[10px] font-black uppercase bg-green-500 text-gray-950 px-3 py-1.5 rounded-lg active:scale-95 transition-all">Freigeben</button>}
              {survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-[10px] font-black uppercase bg-orange-500 text-gray-950 px-3 py-1.5 rounded-lg active:scale-95 transition-all">Publizieren</button>}
            </div>
            <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter"><Users size={12} className="inline mr-1" /> {survey.votedUsers?.length || 0} / {eligibleCount}</p>
          </div>
        )}
      </div>

      <div className="p-6">
        {hasVoted || survey.status === 'published' || (currentUser.role === 'admin' && survey.status !== 'draft') ? (
          <div className="space-y-4">
            {survey.options.map(o => {
              const pct = totalVotes === 0 ? 0 : Math.round(((o.votes || 0) / totalVotes) * 100);
              return (
                <div key={o.id} className="relative h-14 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex items-center px-4 justify-between">
                  <div className="absolute top-0 left-0 h-full bg-orange-500/15 transition-all duration-1000" style={{ width: `${pct}%` }} />
                  <span className="relative font-bold text-white">{o.text}</span>
                  <div className="relative text-right">
                    <p className="text-sm font-bold text-white">{pct}%</p>
                    <p className="text-[10px] font-bold text-gray-600 uppercase tracking-tighter">{o.votes || 0} Stimmen</p>
                  </div>
                </div>
              );
            })}
            {hasVoted && survey.status === 'active' && (
              <p className="text-center text-xs font-bold text-green-500 uppercase tracking-widest mt-4">✓ Stimme abgegeben</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {survey.options.map(o => (
              <div 
                key={o.id} 
                onClick={() => toggle(o.id)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                  selected.includes(o.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'
                }`}
              >
                <span className="font-bold">{o.text}</span>
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                  selected.includes(o.id) ? 'bg-orange-500 border-orange-500 text-gray-950' : 'border-gray-800'
                }`}>
                  {selected.includes(o.id) && <Check size={16} strokeWidth={4} />}
                </div>
              </div>
            ))}
            <button 
              disabled={selected.length === 0}
              onClick={() => onVote(selected)}
              className="w-full mt-4 bg-orange-500 text-gray-950 font-black py-4 rounded-2xl disabled:opacity-30 transition-all active:scale-95 shadow-lg shadow-orange-500/10"
            >
              Abstimmung absenden
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MembersView({ users }) {
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  const saveMember = async (m) => {
    const id = m.id || Date.now().toString();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...m, id });
      setShowAdd(false);
      setEditing(null);
    } catch (e) { console.error(e); }
  };

  const deleteMember = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-white">Stammdaten</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-gray-950 font-bold px-4 py-2 rounded-xl flex items-center gap-2 active:scale-95 transition-all">
          {showAdd ? 'Abbrechen' : <><UserPlus size={20} /> Neu</>}
        </button>
      </div>

      {showAdd && <MemberForm onSubmit={saveMember} onCancel={() => setShowAdd(false)} />}
      {editing && <MemberForm initialData={editing} onSubmit={saveMember} onCancel={() => setEditing(null)} />}

      <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-gray-950/50 text-[10px] font-black text-gray-600 uppercase tracking-widest border-b border-gray-800">
                <th className="px-6 py-4">Mitglied</th>
                <th className="px-6 py-4">Rolle</th>
                <th className="px-6 py-4">Gruppen</th>
                <th className="px-6 py-4 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{u.firstName} {u.lastName}</p>
                    <p className="text-[10px] text-gray-600 font-mono">{u.id}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-800 text-gray-500'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {u.groups?.map(g => <span key={g} className="text-[9px] font-bold bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-500 uppercase">{g}</span>)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(u)} className="p-2 text-gray-500 hover:text-orange-500 transition-colors"><Edit2 size={16} /></button>
                      <button onClick={() => deleteMember(u.id)} className="p-2 text-gray-500 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                    </div>
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
  const [form, setForm] = useState(initialData || { firstName: '', lastName: '', role: 'member', groups: [] });

  const toggleGroup = (g) => {
    const next = form.groups.includes(g) ? form.groups.filter(x => x !== g) : [...form.groups, g];
    setForm({ ...form, groups: next });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-8 rounded-3xl mb-8 space-y-6 animate-in slide-in-from-top-4 duration-300">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Vorname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Nachname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-8 pt-4 border-t border-gray-800">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-500 uppercase">Rolle</label>
          <select className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="member">Mitglied</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase">Gruppen</label>
          <div className="grid grid-cols-2 gap-2">
            {GROUPS.map(g => (
              <label key={g} className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={form.groups.includes(g)} onChange={() => toggleGroup(g)} className="accent-orange-500" />
                {g}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-gray-500 font-bold px-4 py-2 hover:text-gray-300 transition-colors">Abbrechen</button>
        <button type="submit" className="bg-orange-500 text-gray-950 font-black px-8 py-3 rounded-xl active:scale-95 transition-all">Speichern</button>
      </div>
    </form>
  );
}
