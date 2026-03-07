import React, { useState, useEffect } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, AlertCircle, CheckCircle2, 
  UserPlus, Eye, Check, Database, Settings, ShieldAlert
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

const appId = typeof __app_id !== 'undefined' ? __app_id : 'ruesssuuger-app';

const GROUPS = ['Vorstand', 'Aktive', 'Passiv', 'Wagenbau', 'Ehrenmitglieder', 'Neumitglieder'];
const CATEGORIES = ['Generalversammlung', 'Sujetsitzung', 'Liederwahl', 'Freitext'];

const INITIAL_USERS = [
  { id: '1', firstName: 'Admin', lastName: 'Suuger', role: 'admin', groups: ['Vorstand', 'Aktive'] },
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
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('events');
  const [fbUser, setFbUser] = useState(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [authError, setAuthError] = useState(null);

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
    const unsubscribe = onAuthStateChanged(auth, setFbUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!fbUser || !db) return;
    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');

      const unsubUsers = onSnapshot(usersRef, (snap) => setUsers(snap.docs.map(d => d.data())), err => console.error("Users Snapshot Error:", err));
      const unsubEvents = onSnapshot(eventsRef, (snap) => setEvents(snap.docs.map(d => d.data())), err => console.error("Events Snapshot Error:", err));

      return () => { unsubUsers(); unsubEvents(); };
    } catch (err) {
      console.error("Firestore Listeners Error:", err);
    }
  }, [fbUser]);

  const seedDatabase = async () => {
    setIsSeeding(true);
    try {
      if (!db) throw new Error("Datenbank nicht initialisiert");
      for (const u of INITIAL_USERS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      for (const e of INITIAL_EVENTS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', e.id), e);
    } catch (err) {
      console.error(err);
      alert(`Fehler beim Initialisieren der Datenbank: ${err.message}`);
    }
    setIsSeeding(false);
  };

  const handleLogin = (firstName, lastName) => {
    const user = users.find(u => u.firstName.toLowerCase() === firstName.toLowerCase() && u.lastName.toLowerCase() === lastName.toLowerCase());
    if (user) setCurrentUser(user);
    else alert("Mitglied nicht gefunden. Bitte Vor- und Nachname prüfen.");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('events');
  };

  if (authError) {
    return <FatalErrorScreen message={`Anmeldefehler bei Firebase: ${authError}. Bitte prüfe, ob die Anonymous-Anmeldung in der Firebase Console aktiviert ist.`} />;
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} onSeed={seedDatabase} isSeeding={isSeeding} />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
              </h1>
              <p className="text-xs text-orange-400 font-medium">Voting Portal</p>
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
            <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={18} />} label="Aktive Events" />
            <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
            <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Stammdaten" />
          </nav>
        )}

        {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} />}
        {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} />}
        {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} />}
      </main>
    </div>
  );
}

function FatalErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-2xl p-8 shadow-2xl text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white mb-2">Systemfehler</h1>
        <p className="text-red-300 text-sm mb-6">{message}</p>
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
        <p className="text-gray-400">Bitte Firebase Konfiguration in der App.jsx eintragen.</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, users, onSeed, isSeeding }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const onSubmit = (e) => {
    e.preventDefault();
    if (firstName && lastName) onLogin(firstName.trim(), lastName.trim());
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl font-bold mb-2 text-center"><span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span></h1>
          <p className="text-gray-400">Voting Portal</p>
        </div>
        {users.length === 0 ? (
          <div className="text-center py-6">
            <Database className="mx-auto text-gray-600 mb-4" size={48} />
            <h3 className="text-white font-medium mb-2">Datenbank wird eingerichtet</h3>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-lg mt-4">
              {isSeeding ? 'Wird geladen...' : 'Testdaten laden'}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-orange-500" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" />
            <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-orange-500" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" />
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-lg mt-2">Anmelden</button>
          </form>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${active ? 'bg-orange-500 text-gray-950' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'}`}>
      {icon} {label}
    </button>
  );
}

function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const getDbRef = (id) => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', id);

  const handleCreateEvent = async (newEvent) => {
    const id = Date.now().toString();
    await setDoc(getDbRef(id), { ...newEvent, id, isArchived: false, surveys: [] });
    setShowCreate(false);
  };

  const handleArchive = async (eventId, archiveStatus) => {
    const event = events.find(e => e.id === eventId);
    if(event) await setDoc(getDbRef(eventId), { ...event, isArchived: archiveStatus });
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async (eventId) => {
    if (confirm('Event unwiderruflich löschen?')) {
      await deleteDoc(getDbRef(eventId));
      setSelectedEvent(null);
    }
  };

  if (selectedEvent) {
    const currentEventData = events.find(e => e.id === selectedEvent.id);
    if (!currentEventData) { setSelectedEvent(null); return null; }
    return <EventDetail event={currentEventData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">{isArchive ? 'Archiv' : 'Aktuelle Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
            {showCreate ? 'Abbrechen' : <><Plus size={18} /> Neuer Event</>}
          </button>
        )}
      </div>
      {showCreate && <CreateEventForm onSubmit={handleCreateEvent} />}
      <div className="grid gap-4 md:grid-cols-2">
        {events.map(event => (
          <div key={event.id} onClick={() => setSelectedEvent(event)} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl cursor-pointer hover:border-orange-500/50">
            <span className="text-xs font-bold text-orange-500 uppercase bg-orange-500/10 px-2 py-1 rounded-md">{event.category}</span>
            <h3 className="text-xl font-bold text-white mt-3 mb-4">{event.title}</h3>
            <div className="flex justify-between text-sm text-gray-400">
              <span className="flex items-center gap-1"><Calendar size={14} /> {new Date(event.date).toLocaleDateString('de-CH')}</span>
              <span className="flex items-center gap-1"><BarChart3 size={14} /> {event.surveys.length} Umfragen</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState('');

  const submit = (e) => { e.preventDefault(); onSubmit({ title, category, date }); };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl mb-8 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Titel" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
        <select value={category} onChange={e => setCategory(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
      </div>
      <button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Speichern</button>
    </form>
  );
}

function EventDetail({ event, onBack, currentUser, onArchive, onDelete, users, dbAppId, db }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', event.id);

  const handleAddSurvey = async (newSurvey) => {
    const updatedSurveys = [...event.surveys, { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
    setShowCreateSurvey(false);
  };

  const updateSurvey = async (surveyId, updates) => {
    const updatedSurveys = event.surveys.map(s => s.id === surveyId ? { ...s, ...updates } : s);
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
  };

  const handleVote = async (surveyId, selectedOptionIds) => {
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
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white bg-gray-900 p-2 rounded-lg border border-gray-800"><ChevronRight className="rotate-180" size={20} /></button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{event.title}</h2>
          <p className="text-sm text-gray-400">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            <button onClick={() => onArchive(event.id, !event.isArchived)} className="px-3 py-2 rounded-lg text-sm border bg-gray-800 text-gray-300 border-gray-700">{event.isArchived ? 'Aktivieren' : 'Archivieren'}</button>
            <button onClick={() => onDelete(event.id)} className="px-3 py-2 rounded-lg text-sm border bg-red-500/10 text-red-500 border-red-500/20"><Trash2 size={16} /></button>
          </div>
        )}
      </div>
      {currentUser.role === 'admin' && !event.isArchived && (
        <button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 mb-4">
          {showCreateSurvey ? 'Abbrechen' : <><Plus size={18} /> Neue Umfrage</>}
        </button>
      )}
      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} />}
      <div className="space-y-6">
        {event.surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(u) => updateSurvey(survey.id, u)} onVote={(o) => handleVote(survey.id, o)} users={users} />)}
      </div>
    </div>
  );
}

function CreateSurveyForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [maxAnswers, setMaxAnswers] = useState(1);
  const [allowedGroups, setAllowedGroups] = useState(GROUPS); 
  const [options, setOptions] = useState([{ id: '1', text: '' }, { id: '2', text: '' }]);

  const handleGroupToggle = (group) => setAllowedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  const handleOptionChange = (id, text) => setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  const addOption = () => setOptions([...options, { id: Date.now().toString(), text: '' }]);

  const submit = (e) => {
    e.preventDefault();
    const validOptions = options.filter(o => o.text.trim() !== '').map((o, i) => ({ id: `o${i}`, text: o.text.trim(), votes: 0 }));
    if (validOptions.length < 2) return alert('Min. 2 Optionen.');
    onSubmit({ title, maxAnswers, allowedGroups, options: validOptions });
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl">
      <input type="text" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Frage..." className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white mb-4" />
      <div className="space-y-2 mb-4">
        {options.map((opt, i) => (
          <input key={opt.id} type="text" required value={opt.text} onChange={e => handleOptionChange(opt.id, e.target.value)} placeholder={`Option ${i + 1}`} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
        ))}
        <button type="button" onClick={addOption} className="text-orange-500 text-sm mt-2">+ Option</button>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-sm text-gray-400">Max Antworten</label>
          <input type="number" min="1" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
        </div>
        <div>
          <label className="text-sm text-gray-400">Gruppen</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {GROUPS.map(g => <label key={g} className="text-xs text-gray-300 flex items-center gap-1"><input type="checkbox" checked={allowedGroups.includes(g)} onChange={() => handleGroupToggle(g)} />{g}</label>)}
          </div>
        </div>
      </div>
      <button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Speichern</button>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onUpdate, onVote, users }) {
  const [selectedOptions, setSelectedOptions] = useState([]);
  const isEligible = currentUser.role === 'admin' || survey.allowedGroups.some(g => currentUser.groups.includes(g));
  const hasVoted = survey.votedUsers.includes(currentUser.id);
  const totalVotes = survey.options.reduce((sum, opt) => sum + opt.votes, 0);

  if (!isEligible && currentUser.role !== 'admin') return null; 
  if (currentUser.role !== 'admin' && survey.status === 'draft') return null;

  const max = survey.maxAnswers || 1;

  const toggleOption = (id) => {
    if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id));
    else if (max === 1) setSelectedOptions([id]);
    else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]);
  };

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden ${survey.status === 'active' ? 'border-orange-500/50' : 'border-gray-800'}`}>
      <div className="p-5 border-b border-gray-800 bg-gray-900/50 flex justify-between">
        <div>
          <span className="text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded-md uppercase">{survey.status}</span>
          <h4 className="text-xl font-bold text-white mt-2">{survey.title}</h4>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2">
            {survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-sm bg-green-500/20 text-green-500 px-3 py-1 rounded-lg">Freigeben</button>}
            {survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-sm bg-orange-500 text-gray-950 px-3 py-1 rounded-lg font-bold">Beenden</button>}
          </div>
        )}
      </div>
      <div className="p-5">
        {survey.status === 'published' || currentUser.role === 'admin' ? (
          <div className="space-y-3">
             {survey.options.map(opt => {
                const pct = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
                return (
                  <div key={opt.id} className="relative w-full bg-gray-950 rounded-lg overflow-hidden border border-gray-800 p-3 flex justify-between">
                    <div className="absolute top-0 left-0 h-full bg-orange-500/20" style={{ width: `${pct}%` }} />
                    <span className="relative z-10 font-medium text-white">{opt.text}</span>
                    <span className="relative z-10 text-sm text-gray-400">{opt.votes} Stimmen ({pct}%)</span>
                  </div>
                )
             })}
          </div>
        ) : hasVoted ? (
          <div className="text-center text-green-500 py-4"><CheckCircle2 className="mx-auto mb-2" />Danke für deine Stimme!</div>
        ) : (
          <div className="space-y-3">
            {survey.options.map(opt => (
              <div key={opt.id} onClick={() => toggleOption(opt.id)} className={`p-4 rounded-lg border cursor-pointer ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-300'}`}>
                {opt.text}
              </div>
            ))}
            <button onClick={() => selectedOptions.length > 0 && onVote(selectedOptions)} className="w-full bg-orange-500 text-gray-950 font-bold py-3 rounded-lg mt-2">Jetzt abstimmen</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MembersView({ users, dbAppId, db }) {
  const [showAdd, setShowAdd] = useState(false);

  const handleAddUser = async (user) => {
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', Date.now().toString()), { ...user, id: Date.now().toString() });
    setShowAdd(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Stammdaten</h2>
        <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-gray-950 px-4 py-2 rounded-lg">{showAdd ? 'Abbrechen' : '+ Mitglied'}</button>
      </div>
      {showAdd && <AddMemberForm onSubmit={handleAddUser} />}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead><tr className="bg-gray-950/50 border-b border-gray-800 text-gray-400 text-sm"><th className="p-4">Name</th><th className="p-4">Rolle</th><th className="p-4">Gruppen</th></tr></thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(u => (
              <tr key={u.id}><td className="p-4 text-white">{u.firstName} {u.lastName}</td><td className="p-4 text-gray-400 text-sm">{u.role}</td><td className="p-4 text-gray-400 text-sm">{u.groups.join(', ')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddMemberForm({ onSubmit }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('member');
  const [selectedGroups, setSelectedGroups] = useState([]);

  const submit = (e) => { e.preventDefault(); onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), role, groups: selectedGroups }); };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl mb-8">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Vorname" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
        <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nachname" className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white" />
      </div>
      <button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Speichern</button>
    </form>
  );
}  const [fbUser, setFbUser] = useState(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Wenn Firebase schon beim Starten crasht, zeige eine saubere Fehlermeldung statt weißer Seite
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
    const unsubscribe = onAuthStateChanged(auth, setFbUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!fbUser || !db) return;
    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');

      const unsubUsers = onSnapshot(usersRef, (snap) => setUsers(snap.docs.map(d => d.data())), err => console.error("Users Snapshot Error:", err));
      const unsubEvents = onSnapshot(eventsRef, (snap) => setEvents(snap.docs.map(d => d.data())), err => console.error("Events Snapshot Error:", err));

      return () => { unsubUsers(); unsubEvents(); };
    } catch (err) {
      console.error("Firestore Listeners Error:", err);
    }
  }, [fbUser]);

  const seedDatabase = async () => {
    setIsSeeding(true);
    try {
      if (!db) throw new Error("Datenbank nicht initialisiert");
      for (const u of INITIAL_USERS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      for (const e of INITIAL_EVENTS) await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', e.id), e);
    } catch (err) {
      console.error(err);
      alert(`Fehler beim Initialisieren der Datenbank: ${err.message}`);
    }
    setIsSeeding(false);
  };

  const handleLogin = (firstName, lastName) => {
    const user = users.find(u => u.firstName.toLowerCase() === firstName.toLowerCase() && u.lastName.toLowerCase() === lastName.toLowerCase());
    if (user) setCurrentUser(user);
    else alert("Mitglied nicht gefunden. Bitte Vor- und Nachname prüfen.");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveTab('events');
  };

  if (authError) {
    return <FatalErrorScreen message={`Anmeldefehler bei Firebase: ${authError}. Bitte prüfe, ob die Anonymous-Anmeldung in der Firebase Console aktiviert ist.`} />;
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} users={users} onSeed={seedDatabase} isSeeding={isSeeding} />;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
              </h1>
              <p className="text-xs text-orange-400 font-medium">Voting Portal</p>
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
            <TabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={18} />} label="Aktive Events" />
            <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
            <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />} label="Stammdaten" />
          </nav>
        )}

        {activeTab === 'events' && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} dbAppId={appId} db={db} />}
        {activeTab === 'archive' && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} dbAppId={appId} db={db} />}
        {activeTab === 'members' && currentUser.role === 'admin' && <MembersView users={users} dbAppId={appId} db={db} />}
      </main>
    </div>
  );
}

function FatalErrorScreen({ message }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-red-950 border border-red-500/50 rounded-2xl p-8 shadow-2xl text-center">
        <ShieldAlert className="mx-auto text-red-500 mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white mb-2">Systemfehler</h1>
        <p className="text-red-300 text-sm mb-6">{message}</p>
        <p className="text-gray-400 text-xs">Bitte öffne die Entwickler-Konsole (F12) in deinem Browser für mehr Details.</p>
      </div>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-gray-900 border border-orange-500/50 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-800">
          <div className="w-12 h-12 bg-orange-500/20 text-orange-500 rounded-xl flex items-center justify-center"><Settings size={28} /></div>
          <div><h1 className="text-2xl font-bold text-white">Fast geschafft!</h1><p className="text-gray-400">Es fehlt noch deine Datenbank.</p></div>
        </div>
        <div className="space-y-4 text-gray-300">
          <ol className="list-decimal pl-5 space-y-3 mt-4 text-sm">
            <li>Gehe auf <a href="[https://console.firebase.google.com/](https://console.firebase.google.com/)" target="_blank" rel="noreferrer" className="text-orange-500 hover:underline font-bold">console.firebase.google.com</a>, erstelle ein Projekt.</li>
            <li>Aktiviere <strong>Firestore Database</strong> (im "Test Mode" starten).</li>
            <li>Aktiviere <strong>Authentication</strong> -> Methode "Anonymous" (Anonym).</li>
            <li>Gehe zu Projekteinstellungen, füge eine "Web App" `</>` hinzu.</li>
            <li>Kopiere den Code-Block <code>firebaseConfig = &#123; ... &#125;</code></li>
            <li>Ersetze den Block ganz oben in dieser <code>App.jsx</code> Datei mit deinen Werten. <strong>Pushe es zu Vercel, fertig!</strong></li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, users, onSeed, isSeeding }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const onSubmit = (e) => {
    e.preventDefault();
    if (firstName && lastName) onLogin(firstName.trim(), lastName.trim());
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-3xl font-bold mb-2 text-center"><span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span></h1>
          <p className="text-gray-400">Internes Voting Portal</p>
        </div>

        {users.length === 0 ? (
          <div className="text-center py-6">
            <Database className="mx-auto text-gray-600 mb-4" size={48} />
            <h3 className="text-white font-medium mb-2">Datenbank wird eingerichtet</h3>
            <p className="text-sm text-gray-400 mb-6">Bitte initialisiere die Datenbank mit den Testdaten.</p>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2">
              {isSeeding ? 'Wird geladen...' : 'Testdaten laden'}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vorname</label>
              <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="z.B. Max" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Nachname</label>
              <input type="text" required className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="z.B. Muster" />
            </div>
            <button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-lg mt-2">Anmelden</button>
          </form>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap ${active ? 'bg-orange-500 text-gray-950' : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
      {icon} {label}
    </button>
  );
}

function EventsView({ events, currentUser, isArchive = false, users, dbAppId, db }) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const getDbRef = (id) => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', id);

  const handleCreateEvent = async (newEvent) => {
    const id = Date.now().toString();
    await setDoc(getDbRef(id), { ...newEvent, id, isArchived: false, surveys: [] });
    setShowCreate(false);
  };

  const handleArchive = async (eventId, archiveStatus) => {
    const event = events.find(e => e.id === eventId);
    if(event) await setDoc(getDbRef(eventId), { ...event, isArchived: archiveStatus });
    setSelectedEvent(null);
  };

  const handleDeleteEvent = async (eventId) => {
    if (confirm('Möchtest du diesen Event wirklich unwiderruflich löschen?')) {
      await deleteDoc(getDbRef(eventId));
      setSelectedEvent(null);
    }
  };

  if (selectedEvent) {
    const currentEventData = events.find(e => e.id === selectedEvent.id);
    if (!currentEventData) { setSelectedEvent(null); return null; }
    return <EventDetail event={currentEventData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">{isArchive ? 'Archivierte Events' : 'Aktuelle Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
            {showCreate ? 'Abbrechen' : <><Plus size={18} /> Neuer Event</>}
          </button>
        )}
      </div>

      {showCreate && <CreateEventForm onSubmit={handleCreateEvent} />}

      {events.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-2xl border border-gray-800">
          <Calendar size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 text-lg">Keine Events gefunden.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map(event => (
            <div key={event.id} onClick={() => setSelectedEvent(event)} className="bg-gray-900 border border-gray-800 p-5 rounded-2xl hover:border-orange-500/50 hover:bg-gray-800/80 cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-xs font-bold text-orange-500 uppercase bg-orange-500/10 px-2 py-1 rounded-md">{event.category}</span>
                  <h3 className="text-xl font-bold text-white mt-2">{event.title}</h3>
                </div>
                <ChevronRight className="text-gray-600 group-hover:text-orange-500" />
              </div>
              <div className="flex justify-between items-center text-sm text-gray-400">
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
  const [customCategory, setCustomCategory] = useState('');
  const [date, setDate] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const finalCategory = category === 'Freitext' ? customCategory.trim() : category;
    if (category === 'Freitext' && !finalCategory) return alert('Bitte eine eigene Kategorie eingeben.');
    onSubmit({ title, category: finalCategory, date });
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-800 p-6 rounded-2xl mb-8 space-y-4">
      <h3 className="text-lg font-bold text-white mb-4">Neuen Event erstellen</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Titel</label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Kategorie</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {category === 'Freitext' && <input type="text" required placeholder="Eigene Kategorie..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="mt-2 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />}
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Datum</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />
        </div>
      </div>
      <div className="flex justify-end pt-2">
        <button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Speichern</button>
      </div>
    </form>
  );
}

function EventDetail({ event, onBack, currentUser, onArchive, onDelete, users, dbAppId, db }) {
  const [showCreateSurvey, setShowCreateSurvey] = useState(false);
  const getDbRef = () => doc(db, 'artifacts', dbAppId, 'public', 'data', 'events', event.id);

  const handleAddSurvey = async (newSurvey) => {
    const updatedSurveys = [...event.surveys, { ...newSurvey, id: Date.now().toString(), status: 'draft', votedUsers: [] }];
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
    setShowCreateSurvey(false);
  };

  const updateSurvey = async (surveyId, updates) => {
    const updatedSurveys = event.surveys.map(s => s.id === surveyId ? { ...s, ...updates } : s);
    await setDoc(getDbRef(), { ...event, surveys: updatedSurveys });
  };

  const handleVote = async (surveyId, selectedOptionIds) => {
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
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white bg-gray-900 p-2 rounded-lg border border-gray-800"><ChevronRight className="rotate-180" size={20} /></button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white">{event.title}</h2>
          <p className="text-sm text-gray-400">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex items-center gap-2">
            <button onClick={() => onArchive(event.id, !event.isArchived)} className={`px-3 py-2 sm:px-4 rounded-lg text-sm flex items-center gap-2 border bg-gray-800 text-gray-300 border-gray-700`}><Archive size={16} /><span className="hidden sm:inline">{event.isArchived ? 'Aus Archiv holen' : 'Archivieren'}</span></button>
            <button onClick={() => onDelete(event.id)} className="px-3 py-2 sm:px-4 rounded-lg text-sm flex items-center gap-2 border bg-red-500/10 text-red-500 border-red-500/20" title="Event löschen"><Trash2 size={16} /><span className="hidden sm:inline">Löschen</span></button>
          </div>
        )}
      </div>

      {currentUser.role === 'admin' && !event.isArchived && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreateSurvey(!showCreateSurvey)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">
            {showCreateSurvey ? 'Abbrechen' : <><Plus size={18} /> Neue Umfrage</>}
          </button>
        </div>
      )}

      {showCreateSurvey && <CreateSurveyForm onSubmit={handleAddSurvey} />}

      <div className="space-y-6">
        {event.surveys.length === 0 ? <p className="text-gray-500 text-center py-8">Keine Umfragen in diesem Event.</p> : event.surveys.map(survey => <SurveyCard key={survey.id} survey={survey} currentUser={currentUser} onUpdate={(updates) => updateSurvey(survey.id, updates)} onVote={(optionIds) => handleVote(survey.id, optionIds)} users={users} />)}
      </div>
    </div>
  );
}

function CreateSurveyForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [maxAnswers, setMaxAnswers] = useState(1);
  const [allowedGroups, setAllowedGroups] = useState(GROUPS); 
  const [options, setOptions] = useState([{ id: '1', text: '' }, { id: '2', text: '' }]);

  const handleGroupToggle = (group) => setAllowedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  const handleOptionChange = (id, text) => setOptions(prev => prev.map(o => o.id === id ? { ...o, text } : o));
  const addOption = () => { if (options.length < 10) setOptions([...options, { id: Date.now().toString(), text: '' }]); };
  const removeOption = (id) => { if (options.length > 2) setOptions(prev => prev.filter(o => o.id !== id)); };

  const submit = (e) => {
    e.preventDefault();
    const validOptions = options.filter(o => o.text.trim() !== '').map((o, i) => ({ id: `o${i}`, text: o.text.trim(), votes: 0 }));
    if (validOptions.length < 2) return alert('Bitte mindestens 2 Antwortmöglichkeiten eingeben.');
    if (allowedGroups.length === 0) return alert('Bitte mindestens eine Gruppe auswählen.');
    onSubmit({ title, maxAnswers, allowedGroups, options: validOptions });
  };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl">
      <h3 className="text-lg font-bold text-white mb-4">Neue Umfrage erstellen</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Frage / Titel der Umfrage</label>
          <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Antwortmöglichkeiten (Max 10)</label>
          {options.map((opt, i) => (
            <div key={opt.id} className="flex gap-2 mb-2">
              <input type="text" required value={opt.text} onChange={e => handleOptionChange(opt.id, e.target.value)} placeholder={`Option ${i + 1}`} className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />
              <button type="button" onClick={() => removeOption(opt.id)} disabled={options.length <= 2} className="p-2 text-gray-500 hover:text-red-500 disabled:opacity-50"><Trash2 size={20} /></button>
            </div>
          ))}
          {options.length < 10 && <button type="button" onClick={addOption} className="text-orange-500 text-sm font-medium flex items-center gap-1 mt-2 hover:text-orange-400"><Plus size={16} /> Weitere Option</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-800">
          <div>
             <label className="block text-sm text-gray-400 mb-2">Mögliche Antworten (1-10)</label>
             <input type="number" min="1" max="10" value={maxAnswers} onChange={e => { let val = parseInt(e.target.value); if (isNaN(val) || val < 1) val = 1; if (val > 10) val = 10; setMaxAnswers(val); }} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" />
             <p className="text-xs text-gray-500 mt-2">{maxAnswers === 1 ? 'Single Choice (1 Antwort)' : `Multiple Choice (bis zu ${maxAnswers} Antworten)`}</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Berechtigte Gruppen</label>
            <div className="grid grid-cols-2 gap-2">
              {GROUPS.map(group => (
                <label key={group} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={allowedGroups.includes(group)} onChange={() => handleGroupToggle(group)} className="accent-orange-500 rounded" />{group}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-6 mt-2"><button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Umfrage speichern</button></div>
    </form>
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

  const max = survey.maxAnswers || (survey.isMultiple ? 10 : 1);

  const handleVoteSubmit = () => { if (selectedOptions.length > 0) onVote(selectedOptions); };

  const toggleOption = (id) => {
    if (selectedOptions.includes(id)) setSelectedOptions(prev => prev.filter(x => x !== id));
    else {
      if (max === 1) setSelectedOptions([id]);
      else if (selectedOptions.length < max) setSelectedOptions([...selectedOptions, id]);
      else alert(`Du kannst maximal ${max} Antworten auswählen.`);
    }
  };

  return (
    <div className={`bg-gray-900 border rounded-2xl overflow-hidden ${survey.status === 'active' ? 'border-orange-500/50' : 'border-gray-800'}`}>
      <div className="p-5 border-b border-gray-800 bg-gray-900/50">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {survey.status === 'draft' && <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-md font-medium uppercase">Entwurf</span>}
              {survey.status === 'active' && <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded-md font-medium uppercase flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Aktiv</span>}
              {survey.status === 'published' && <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-1 rounded-md font-medium uppercase">Veröffentlicht</span>}
              <span className="text-xs text-gray-500 ml-2">{max === 1 ? 'Single Choice' : `Max. ${max} Antworten`}</span>
            </div>
            <h4 className="text-xl font-bold text-white">{survey.title}</h4>
          </div>
          {currentUser.role === 'admin' && (
            <div className="flex flex-col items-end gap-2">
              {survey.status === 'draft' && <button onClick={() => onUpdate({ status: 'active' })} className="text-sm bg-green-500/20 text-green-500 px-3 py-1.5 rounded-lg flex items-center gap-1"><CheckCircle2 size={16} /> Freigeben</button>}
              {survey.status === 'active' && <button onClick={() => onUpdate({ status: 'published' })} className="text-sm bg-orange-500 text-gray-950 px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold"><Eye size={16} /> Beenden</button>}
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Users size={14} /> {survey.votedUsers.length} / {eligibleUsersCount}</div>
            </div>
          )}
        </div>
      </div>
      <div className="p-5">
        {(survey.status === 'published' || currentUser.role === 'admin') ? (
          <div className="space-y-3">
             {survey.status === 'active' && currentUser.role === 'admin' && (
               <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3"><AlertCircle className="text-blue-500 mt-0.5" size={18} /><p className="text-sm text-blue-400">Mitglieder stimmen ab. Resultate sind nur für Admins sichtbar.</p></div>
             )}
             {survey.options.map(opt => {
                const percentage = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
                return (
                  <div key={opt.id} className="relative w-full bg-gray-950 rounded-lg overflow-hidden border border-gray-800">
                    <div className="absolute top-0 left-0 h-full bg-orange-500/20" style={{ width: `${percentage}%` }} />
                    <div className="relative z-10 p-3 flex justify-between items-center"><span className="font-medium text-white">{opt.text}</span><span className="text-sm text-gray-400">{opt.votes} Stimmen ({percentage}%)</span></div>
                  </div>
                )
             })}
          </div>
        ) : (
          <>
            {hasVoted ? (
               <div className="flex flex-col items-center justify-center py-6 text-center"><div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-3"><Check size={24} /></div><h5 className="text-lg font-bold text-white">Danke für deine Stimme!</h5></div>
            ) : (
              <div className="space-y-3">
                {survey.options.map(opt => (
                  <div key={opt.id} onClick={() => toggleOption(opt.id)} className={`block w-full p-4 rounded-lg border cursor-pointer ${selectedOptions.includes(opt.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-600'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 flex items-center justify-center border ${max > 1 ? 'rounded' : 'rounded-full'} ${selectedOptions.includes(opt.id) ? 'border-orange-500 bg-orange-500 text-gray-950' : 'border-gray-600'}`}>
                        {selectedOptions.includes(opt.id) && <Check size={14} className="stroke-[3]" />}
                      </div><span className="font-medium">{opt.text}</span>
                    </div>
                  </div>
                ))}
                <div className="pt-4 flex justify-end"><button onClick={handleVoteSubmit} disabled={selectedOptions.length === 0} className="bg-orange-500 disabled:bg-gray-800 disabled:text-gray-600 text-gray-950 font-bold px-8 py-3 rounded-lg">Jetzt abstimmen</button></div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MembersView({ users, dbAppId, db }) {
  const [showAdd, setShowAdd] = useState(false);

  const handleAddUser = async (user) => {
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', id), { ...user, id });
    setShowAdd(false);
  };

  const removeUser = async (id) => {
    if (confirm('Mitglied wirklich löschen?')) await deleteDoc(doc(db, 'artifacts', dbAppId, 'public', 'data', 'users', id));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-white">Stammdaten</h2><button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 hover:bg-orange-600 text-gray-950 font-semibold px-4 py-2 rounded-lg flex items-center gap-2">{showAdd ? 'Abbrechen' : <><UserPlus size={18} /> Mitglied hinzufügen</>}</button></div>
      {showAdd && <AddMemberForm onSubmit={handleAddUser} />}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-gray-950/50 border-b border-gray-800 text-sm text-gray-400"><th className="p-4 font-medium">Name</th><th className="p-4 font-medium">Rolle</th><th className="p-4 font-medium">Gruppen</th><th className="p-4 font-medium text-right">Aktionen</th></tr></thead>
            <tbody className="divide-y divide-gray-800">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-800/50"><td className="p-4 text-white font-medium">{user.firstName} {user.lastName}</td><td className="p-4"><span className={`text-xs px-2 py-1 rounded-md font-bold uppercase ${user.role === 'admin' ? 'bg-orange-500/20 text-orange-500' : 'bg-gray-800 text-gray-400'}`}>{user.role}</span></td><td className="p-4"><div className="flex flex-wrap gap-1">{user.groups.map(g => (<span key={g} className="text-xs bg-gray-950 border border-gray-700 px-2 py-1 rounded-md text-gray-300">{g}</span>))}</div></td><td className="p-4 text-right"><button onClick={() => removeUser(user.id)} className="p-2 text-gray-500 hover:text-red-500"><Trash2 size={18} /></button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddMemberForm({ onSubmit }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('member');
  const [selectedGroups, setSelectedGroups] = useState([]);

  const toggleGroup = (group) => setSelectedGroups(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  const submit = (e) => { e.preventDefault(); onSubmit({ firstName: firstName.trim(), lastName: lastName.trim(), role, groups: selectedGroups }); };

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-gray-700 p-6 rounded-2xl mb-8">
      <h3 className="text-lg font-bold text-white mb-4">Neues Mitglied</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div><label className="block text-sm text-gray-400 mb-1">Vorname</label><input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" /></div>
        <div><label className="block text-sm text-gray-400 mb-1">Nachname</label><input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500" /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        <div><label className="block text-sm text-gray-400 mb-2">Rolle</label><select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:border-orange-500"><option value="member">Mitglied</option><option value="admin">Administrator</option></select></div>
        <div>
          <label className="block text-sm text-gray-400 mb-2">Gruppen</label>
          <div className="grid grid-cols-2 gap-2">{GROUPS.map(group => (<label key={group} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"><input type="checkbox" checked={selectedGroups.includes(group)} onChange={() => toggleGroup(group)} className="accent-orange-500 rounded" />{group}</label>))}</div>
        </div>
      </div>
      <div className="flex justify-end pt-4 border-t border-gray-800"><button type="submit" className="bg-orange-500 text-gray-950 font-bold px-6 py-2 rounded-lg">Speichern</button></div>
    </form>
  );
}
