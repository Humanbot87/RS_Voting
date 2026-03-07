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

// Ensure appId is safe for Firestore paths (no slashes)
const appId = typeof __app_id !== 'undefined' ? __app_id.replace(/[^a-zA-Z0-9_-]/g, '-') : 'ruesssuuger-app';

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
  const [permissionsError, setPermissionsError] = useState(null);

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
    // ONLY run this effect if we have a valid authenticated user
    if (!fbUser || !db) return;
    
    setPermissionsError(null); // Reset previous errors

    let unsubUsers = () => {};
    let unsubEvents = () => {};

    try {
      const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');

      unsubUsers = onSnapshot(usersRef, 
        (snap) => {
          setUsers(snap.docs.map(d => d.data()));
        }, 
        (err) => {
          console.error("Users Snapshot Error:", err);
          if (err.code === 'permission-denied') {
             setPermissionsError("Fehlende Berechtigungen für Firestore. Bitte überprüfe die Security Rules in der Firebase Console.");
          }
        }
      );
      
      unsubEvents = onSnapshot(eventsRef, 
        (snap) => {
          setEvents(snap.docs.map(d => d.data()));
        }, 
        (err) => {
          console.error("Events Snapshot Error:", err);
          if (err.code === 'permission-denied') {
             setPermissionsError("Fehlende Berechtigungen für Firestore. Bitte überprüfe die Security Rules in der Firebase Console.");
          }
        }
      );

    } catch (err) {
      console.error("Firestore Listeners Setup Error:", err);
    }
    
    return () => { 
        if (unsubUsers) unsubUsers(); 
        if (unsubEvents) unsubEvents(); 
    };
  }, [fbUser]); // The dependency array now correctly tracks changes to fbUser

  const seedDatabase = async () => {
    if (!fbUser) return alert("Bitte warte auf die Firebase-Verbindung.");
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
  
  if (permissionsError) {
      return <FatalErrorScreen message={permissionsError} />
  }

  // Show a loading screen while we wait for auth to finish or the database to load its first batch
  // This prevents the "white screen" if the initial data fetch takes a moment.
  if (!fbUser) {
     return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
           <div className="animate-pulse flex flex-col items-center">
              <Database className="text-orange-500 mb-4" size={48} />
              <p className="text-gray-400">Verbinde zur Datenbank...</p>
           </div>
        </div>
     );
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
        <h1 className="text-2xl font-bold text-white mb-2">Systemfehler</h1>
        <p className="text-red-300 text-sm mb-6">{message}</p>
        <div className="text-left bg-red-900/50 p-4 rounded-lg border border-red-800 text-xs text-red-200 mt-4">
            <p className="font-bold mb-2">Lösungshilfe für Vercel:</p>
            <ol className="list-decimal pl-4 space-y-1">
                <li>Gehe in die Firebase Console.</li>
                <li>Gehe zu Firestore Database -{'>'} Rules (Regeln).</li>
                <li>Ersetze den Code dort mit: <br/><code>match /&#123;document=**&#125; &#123; allow read, write: if true; &#125;</code></li>
                <li>Klicke auf Publish (Veröffentlichen).</li>
            </ol>
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
            <p className="text-sm text-gray-400 mb-4">Es wurden noch keine Daten gefunden.</p>
            <button onClick={onSeed} disabled={isSeeding} className="w-full bg-orange-500 hover:bg-orange-600 text-gray-950 font-bold py-3 rounded-lg mt-4 disabled:opacity-50">
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
    if (!fbUser) return;
    if (confirm('Event unwiderruflich löschen?')) {
      await deleteDoc(getDbRef(eventId));
      setSelectedEvent(null);
    }
  };

  if (selectedEvent) {
    const currentEventData = events.find(e => e.id === selectedEvent.id);
    if (!currentEventData) { setSelectedEvent(null); return null; }
    return <EventDetail event={currentEventData} onBack={() => setSelectedEvent(null)} currentUser={currentUser} onArchive={handleArchive} onDelete={handleDeleteEvent} users={users} dbAppId={dbAppId} db={db} fbUser={fbUser} />;
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

function MembersView({ users, dbAppId, db, fbUser }) {
  const [showAdd, setShowAdd] = useState(false);

  const handleAddUser = async (user) => {
    if (!fbUser) return;
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
}
