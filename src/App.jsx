import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, UserPlus, Eye, Check, Database, ShieldAlert, Edit2,
  Youtube, Lock, Unlock, ClipboardList, UserCheck, Paperclip, Save, X, RefreshCw,
  UploadCloud, Search, Download, ArrowUp, ArrowDown, Maximize2, Minimize2,
  Folder, FolderPlus, FileText, File, CalendarDays, MapPin, Clock,
  Printer, CheckCircle2, AlertTriangle, Info, Filter, Sparkles, Share2, QrCode, Play
} from 'lucide-react';
import { 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updatePassword 
} from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, runTransaction } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, db, storage, appId } from './firebase';

const GROUPS = ['Vorstand', 'Aktiv Musig', 'Aktiv Wagenbau', 'Passiv', 'Ehrenmitglieder', 'Neumitglied Musig', 'Neumitglied Wagenbau'];
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
    groups: ['Vorstand', 'Aktiv Musig'],
    password: '' 
  }
];

const toAuthEmail = (firstName, lastName) =>
  `${firstName.toLowerCase().replace(/\s+/g, '')}.${lastName.toLowerCase().replace(/\s+/g, '')}@ruesssuuger.internal`;

const generateSessionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

const hashPassword = async (password, userId) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${password}::ruesssuuger::${userId}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const sanitizeName = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>"'`]/g, '').slice(0, 100);
};

const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const triggerFileDownload = (url, fileName = 'Dokument') => {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const copyTextToClipboard = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
};

const StandardQRCodeImage = ({ value, size = 220 }) => {
  const [useFallback, setUseFallback] = useState(false);
  const targetUrl = value || 'https://ruesssuuger-aemme.ch';
  const encoded = encodeURIComponent(targetUrl);

  const primarySrc = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&color=030712&bgcolor=ffffff&data=${encoded}`;
  const fallbackSrc = `https://quickchart.io/qr?size=${size}&margin=2&dark=030712&light=ffffff&text=${encoded}`;

  return (
    <img
      src={useFallback ? fallbackSrc : primarySrc}
      alt="QR Code zum Portal"
      width={size}
      height={size}
      onError={() => {
        if (!useFallback) setUseFallback(true);
      }}
      className="bg-white p-2 rounded-2xl shadow-xl mx-auto block select-none"
    />
  );
};

const escapeICS = (str = '') =>
  String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

const formatICSDateTime = (dateStr, timeStr) => {
  const cleanDate = (dateStr || '').slice(0, 10).replace(/-/g, '');
  if (!timeStr) {
    return { startProp: `DTSTART;VALUE=DATE:${cleanDate}`, endProp: null };
  }
  const [hh = '00', mm = '00'] = timeStr.split(':');
  const start = `${cleanDate}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
  const endHour = String((parseInt(hh, 10) + 2) % 24).padStart(2, '0');
  const end = `${cleanDate}T${endHour}${mm.padStart(2, '0')}00`;
  return {
    startProp: `DTSTART:${start}`,
    endProp: `DTEND:${end}`
  };
};

const generateICSContent = (items) => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const eventsBlocks = items.map(item => {
    const { startProp, endProp } = formatICSDateTime(item.date, item.time);
    const lines = [
      'BEGIN:VEVENT',
      `UID:${item.id || Date.now()}@ruesssuuger-aemme.ch`,
      `DTSTAMP:${stamp}`,
      startProp,
    ];
    if (endProp) lines.push(endProp);
    lines.push(`SUMMARY:${escapeICS(item.title || 'RüssSuuger Termin')}`);
    if (item.location) lines.push(`LOCATION:${escapeICS(item.location)}`);
    if (item.description) lines.push(`DESCRIPTION:${escapeICS(item.description)}`);
    lines.push('END:VEVENT');
    return lines.join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RuessSuuger Aemme//Vereinsportal//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:RüssSuuger Ämme',
    ...eventsBlocks,
    'END:VCALENDAR'
  ].join('\r\n');
};

const downloadICSFile = (items, filename = 'ruesssuuger_kalender.ics') => {
  const list = Array.isArray(items) ? items : [items];
  const content = generateICSContent(list);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [minutes, setMinutes] = useState([]);
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [calItems, setCalItems] = useState([]);
  const [activeTab, setActiveTab] = useState('events');
  const [dbReady, setDbReady] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [connError, setConnError] = useState(null);
  const [hasCheckedAutoLogin, setHasCheckedAutoLogin] = useState(false);

  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const notify = (message, type = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  };

  const askConfirm = (title, message, onConfirm, confirmLabel = 'Bestätigen', danger = true) => {
    setConfirmDialog({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: async () => {
        setConfirmDialog(null);
        await onConfirm();
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (auth.currentUser) {
          setUser(auth.currentUser);
          return;
        }
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/admin-restricted-operation') {
          setUser({ uid: 'local-fallback-user', isAnonymous: true });
        } else {
          setConnError("Authentifizierung fehlgeschlagen. Bitte Seite neu laden.");
        }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, u => {
      if (u) setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    const usersRef   = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const eventsRef  = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    const minutesRef = collection(db, 'artifacts', appId, 'public', 'data', 'minutes');
    const foldersRef = collection(db, 'artifacts', appId, 'public', 'data', 'folders');
    const filesRef   = collection(db, 'artifacts', appId, 'public', 'data', 'files');
    const calRef     = collection(db, 'artifacts', appId, 'public', 'data', 'calendar');

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
    const unsubFolders = onSnapshot(foldersRef,
      (s) => setFolders(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Folders Error:", err)
    );
    const unsubFiles = onSnapshot(filesRef,
      (s) => setFiles(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Files Error:", err)
    );
    const unsubCal = onSnapshot(calRef,
      (s) => setCalItems(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Calendar Error:", err)
    );

    return () => { unsubUsers(); unsubEvents(); unsubMinutes(); unsubFolders(); unsubFiles(); unsubCal(); };
  }, [user]);

  useEffect(() => {
    if (dbReady && !hasCheckedAutoLogin) {
      const savedUserId  = localStorage.getItem('ruesssuuger_userId');
      const savedSession = localStorage.getItem('ruesssuuger_sessionId');
      if (savedUserId && savedSession) {
        const u = users.find(x => x.id === savedUserId);
        if (u) setCurrentUser({ ...u, sessionId: savedSession });
      }
      setHasCheckedAutoLogin(true);
    }
  }, [dbReady, hasCheckedAutoLogin, users]);

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
    updatePresence();
    const interval = setInterval(updatePresence, 30000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const seedDatabase = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      for (const u of INITIAL_USERS) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), u);
      }
      notify("Administrator-Account erfolgreich erstellt.", "success");
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
          className="flex items-center gap-2 bg-orange-500 text-gray-950 font-black px-6 py-3 rounded-2xl active:scale-95 transition-all min-h-[44px]"
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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 selection:bg-orange-500 selection:text-white">
      <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3.5 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300 ${
              t.type === 'success'
                ? 'bg-gray-900/95 border-green-500/40 text-green-400'
                : t.type === 'error'
                ? 'bg-gray-900/95 border-red-500/40 text-red-400'
                : 'bg-gray-900/95 border-orange-500/40 text-orange-400'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 size={18} className="shrink-0" />}
            {t.type === 'error' && <AlertTriangle size={18} className="shrink-0" />}
            {t.type !== 'success' && t.type !== 'error' && <Info size={18} className="shrink-0" />}
            <p className="text-xs font-bold text-white flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-gray-500 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      {confirmDialog && (
        <div className="fixed inset-0 z-[250] bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl shrink-0 ${confirmDialog.danger ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'}`}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">{confirmDialog.title}</h3>
                <p className="text-sm text-gray-400 mt-1 leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                onClick={confirmDialog.onCancel}
                className="px-5 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-sm transition-all min-h-[44px]"
              >
                Abbrechen
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-6 py-3 rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg min-h-[44px] ${
                  confirmDialog.danger
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20'
                    : 'bg-orange-500 hover:bg-orange-600 text-gray-950 shadow-orange-500/20'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {!currentUser ? (
        <LoginScreen users={users} onLogin={u => setCurrentUser(u)} onSeed={seedDatabase} isSeeding={isSeeding} />
      ) : (
        <>
          <header className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 sticky top-0 z-50 shadow-2xl">
            <div className="max-w-6xl mx-auto px-4 py-3.5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-8 bg-orange-500 rounded-full hidden sm:block" />
                <h1 className="text-lg sm:text-2xl font-black italic tracking-tighter">
                  <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-white leading-tight">{currentUser.firstName} {currentUser.lastName}</p>
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest">
                      {currentUser.role === 'admin' ? 'Administrator' : isVorstand ? 'Vorstand' : 'Mitglied'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Abmelden"
                  className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all active:scale-95 group border border-gray-700/50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <LogOut size={20} className="text-gray-400 group-hover:text-orange-500 transition-colors" />
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
            <nav className="flex gap-2 mb-6 sm:mb-8 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabButton active={activeTab === 'events'}   onClick={() => setActiveTab('events')}   icon={<Calendar size={18} />}      label="Events" />
              {isVorstand && (
                <TabButton active={activeTab === 'minutes'}  onClick={() => setActiveTab('minutes')}  icon={<ClipboardList size={18} />} label="Protokolle" />
              )}
              {isVorstand && (
                <TabButton active={activeTab === 'files'}    onClick={() => setActiveTab('files')}    icon={<Folder size={18} />}        label="Dateien" />
              )}
              {isVorstand && (
                <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarDays size={18} />}  label="Kalender" />
              )}
              {currentUser.role === 'admin' && (
                <>
                  <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
                  <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />}   label="Mitglieder" />
                </>
              )}
            </nav>

            <div className="animate-in fade-in duration-500">
              {activeTab === 'events'   && <EventsView events={events.filter(e => !e.isArchived)} currentUser={currentUser} users={users} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'minutes'  && isVorstand && <ProtocolView minutes={minutes} users={users} currentUser={currentUser} calItems={calItems} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'files'    && isVorstand && <FilesView folders={folders} files={files} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'calendar' && isVorstand && <CalendarView calItems={calItems} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'archive'  && <EventsView events={events.filter(e => e.isArchived)} currentUser={currentUser} isArchive users={users} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'members'  && currentUser.role === 'admin' && <MembersView users={users} notify={notify} askConfirm={askConfirm} />}
            </div>
          </main>
        </>
      )}
    </div>
  );
}

function LoginScreen({ users, onLogin, onSeed, isSeeding }) {
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [step,      setStep]      = useState('name');
  const [foundUser, setFoundUser] = useState(null);
  const [password,  setPassword]  = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const finalizeLogin = (u) => {
    const newSession = generateSessionId();
    localStorage.setItem('ruesssuuger_sessionId', newSession);
    localStorage.setItem('ruesssuuger_userId',    u.id);
    onLogin({ ...u, sessionId: newSession });
  };

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const u = users.find(
      x => x.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
           x.lastName.trim().toLowerCase()  === lastName.trim().toLowerCase()
    );
    if (!u) { setError("Mitglied nicht gefunden."); return; }

    const timeSinceLastSeen = Date.now() - (u.lastSeen || 0);
    const savedSession = localStorage.getItem('ruesssuuger_sessionId');
    const isMultiLoginAllowed = u.role === 'admin' || u.groups?.includes('Vorstand');
    if (!isMultiLoginAllowed && u.isOnline && timeSinceLastSeen < 15000 && u.sessionId !== savedSession) {
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
    setLoading(true);
    setError('');

    const email = toAuthEmail(foundUser.firstName, foundUser.lastName);

    try {
      if (type === 'set') {
        if (password.length < 6) {
          setError("Passwort zu kurz (min. 6 Zeichen).");
          setLoading(false);
          return;
        }
        const hashed = await hashPassword(password, foundUser.id);
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (createErr) {
          if (createErr.code === 'auth/email-already-in-use') {
            try {
              const cred = await signInWithEmailAndPassword(auth, email, password);
              await updatePassword(cred.user, password);
            } catch (_) {}
          } else if (
            createErr.code === 'auth/operation-not-allowed' ||
            createErr.code === 'auth/admin-restricted-operation'
          ) {
            // Firebase Auth Provider deactivated -> Firestore Hash sufficient
          } else {
            throw createErr;
          }
        }
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.id), { password: hashed });
        finalizeLogin({ ...foundUser, password: hashed });

      } else {
        const hashed = await hashPassword(password, foundUser.id);
        if (foundUser.password && foundUser.password.startsWith('sha256:')) {
          if (foundUser.password === hashed) {
            finalizeLogin(foundUser);
          } else {
            setError("Falsches Passwort.");
          }
        } else {
          try {
            await signInWithEmailAndPassword(auth, email, password);
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.id), { password: hashed });
            finalizeLogin({ ...foundUser, password: hashed });
          } catch (signInErr) {
            if (
              signInErr.code === 'auth/operation-not-allowed' ||
              signInErr.code === 'auth/admin-restricted-operation'
            ) {
              if (foundUser.password === password) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', foundUser.id), { password: hashed });
                finalizeLogin({ ...foundUser, password: hashed });
              } else {
                setError("E-Mail/Passwort-Login ist in Firebase nicht aktiviert. Bitte Passwort neu festlegen.");
                setStep('setPassword');
              }
            } else {
              throw signInErr;
            }
          }
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Falsches Passwort.");
      } else if (err.code === 'auth/too-many-requests') {
        setError("Zu viele Versuche. Bitte kurz warten.");
      } else {
        setError("Fehler bei der Anmeldung: " + err.message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-black mb-2 italic tracking-tighter">
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
          </h1>
          <p className="text-gray-500 font-medium tracking-wide text-sm">Internes Portal & Voting</p>
        </div>

        {users.length === 0 ? (
          <div className="space-y-6 text-center animate-in fade-in">
            <Database className="mx-auto text-gray-800" size={48} />
            <p className="text-gray-400 text-sm">Die Datenbank ist neu oder leer. Möchtest du den Administrator-Account jetzt erstellen?</p>
            <button 
              onClick={onSeed} 
              disabled={isSeeding} 
              className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl transition-all shadow-lg shadow-orange-500/10 disabled:opacity-50 active:scale-95 min-h-[44px]"
            >
              {isSeeding ? 'Wird erstellt...' : 'Admin Suuger jetzt erstellen'}
            </button>
          </div>
        ) : (
          <form
            onSubmit={step === 'name' ? handleNameSubmit : e => handlePasswordAction(e, step === 'setPassword' ? 'set' : 'check')}
            className="space-y-4"
          >
            {step === 'name' ? (
              <div className="space-y-4">
                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all text-base min-h-[44px]" placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all text-base min-h-[44px]" placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            ) : (
              <div className="animate-in slide-in-from-right-4 duration-300 space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => { setStep('name'); setPassword(''); setError(''); }}
                    className="text-xs text-gray-500 hover:text-white font-bold flex items-center gap-1 min-h-[44px] py-2"
                  >
                    <ChevronRight size={14} className="rotate-180" /> Zurück
                  </button>
                  <p className="text-xs text-orange-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <Lock size={12}/> {step === 'setPassword' ? 'Passwort festlegen' : 'Vorstand-Passwort'}
                  </p>
                </div>
                <input
                  autoFocus
                  type="password"
                  required
                  className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none text-center text-3xl tracking-[0.5em] min-h-[56px]"
                  placeholder="••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all text-lg disabled:opacity-60 min-h-[48px]"
            >
              {loading ? 'Bitte warten...' : step === 'name' ? 'Weiter' : 'Anmelden'}
            </button>
            {error && (
              <p className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-3 px-4 rounded-xl animate-in shake duration-300 mt-2">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function ProtocolView({ minutes, users, currentUser, calItems = [], notify, askConfirm }) {
  const [editing,        setEditing]        = useState(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [liveDraft,      setLiveDraft]      = useState(null);
  const [watchingLive,   setWatchingLive]   = useState(false);
  const [searchTerm,     setSearchTerm]     = useState('');
  const [roleFilter,     setRoleFilter]     = useState('Alle');
  const [yearFilter,     setYearFilter]     = useState('Alle');
  const [onlyOpenTasks,  setOnlyOpenTasks]  = useState(false);
  const [onlyMyTasks,    setOnlyMyTasks]    = useState(false);
  const [expandedId,     setExpandedId]     = useState(null);
  const [enlargedPoint,  setEnlargedPoint]  = useState(null);
  const [readingMinute,  setReadingMinute]  = useState(null);
  const [previewDoc,     setPreviewDoc]     = useState(null);

  const vorstandMembers = useMemo(() => users.filter(u => u.groups?.includes('Vorstand')), [users]);
  const myFullName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();

  useEffect(() => {
    const liveRef = doc(db, 'artifacts', appId, 'public', 'data', 'minutes', '__live_session__');
    const unsub = onSnapshot(
      liveRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.isActive && Date.now() - (data.updatedAt || 0) < 15 * 60 * 1000) {
            setLiveDraft(data);
          } else {
            setLiveDraft(null);
          }
        } else {
          setLiveDraft(null);
        }
      },
      (err) => console.error("Live Session Error:", err)
    );
    return () => unsub();
  }, []);

  const traktandumMeta = {
    'Präsident':     { badge: 'bg-orange-500/15 text-orange-400 border-orange-500/30', dot: 'bg-orange-500' },
    'Vizepräsident': { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',   dot: 'bg-amber-500' },
    'Tambourmajor':  { badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30', dot: 'bg-purple-500' },
    'Tourmanager':   { badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',       dot: 'bg-cyan-500' },
    'Sujetchef':     { badge: 'bg-pink-500/15 text-pink-400 border-pink-500/30',       dot: 'bg-pink-500' },
    'Kassier':       { badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500' },
    'Aktuar':        { badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',       dot: 'bg-blue-500' },
  };

  const pointTypeMeta = {
    'info':     { label: 'Info',      style: 'bg-gray-800 text-gray-300 border-gray-700' },
    'decision': { label: 'Beschluss', style: 'bg-green-500/15 text-green-400 border-green-500/30' },
    'todo':     { label: 'Pendenz',   style: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
    'done':     { label: 'Erledigt',  style: 'bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20' },
  };

  const availableYears = useMemo(() => {
    const years = new Set();
    minutes.forEach(m => {
      if (m.date && m.id !== '__live_session__') years.add(m.date.slice(0, 4));
    });
    return ['Alle', ...Array.from(years).sort((a, b) => b.localeCompare(a))];
  }, [minutes]);

  const { stats, openTasksList } = useMemo(() => {
    let totalPoints = 0;
    let totalAttachments = 0;
    let openTodos = 0;
    let myOpenTodos = 0;
    const tasks = [];

    const validMinutes = minutes.filter(m => m.id !== '__live_session__');
    const sortedMins = [...validMinutes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    sortedMins.forEach(m => {
      if (m.traktanden) {
        TRAKTANDEN.forEach(tName => {
          const list = m.traktanden[tName] || [];
          totalPoints += list.length;
          list.forEach(p => {
            if (p.docUrl) totalAttachments++;
            if (p.type === 'todo' && !p.done) {
              openTodos++;
              const isMine = p.assignee === myFullName || p.assignee === 'Gesamtvorstand';
              if (isMine) myOpenTodos++;
              tasks.push({
                minuteId: m.id,
                minuteTitle: m.title,
                minuteDate: m.date,
                traktandum: tName,
                isMine,
                point: p
              });
            }
          });
        });
      }
    });
    return {
      stats: { totalMinutes: validMinutes.length, totalPoints, totalAttachments, openTodos, myOpenTodos },
      openTasksList: tasks
    };
  }, [minutes, myFullName]);

  const displayedTasks = useMemo(() => {
    if (onlyMyTasks) return openTasksList.filter(t => t.isMine);
    return openTasksList;
  }, [openTasksList, onlyMyTasks]);

  const filteredMinutes = useMemo(() => {
    let sorted = [...minutes]
      .filter(m => m.id !== '__live_session__')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (yearFilter !== 'Alle') {
      sorted = sorted.filter(m => (m.date || '').startsWith(yearFilter));
    }
    if (roleFilter !== 'Alle') {
      sorted = sorted.filter(m => (m.traktanden?.[roleFilter]?.length || 0) > 0);
    }
    if (onlyOpenTasks) {
      sorted = sorted.filter(m =>
        m.traktanden && Object.values(m.traktanden).some(pts => pts?.some(p => p.type === 'todo' && !p.done))
      );
    }
    if (onlyMyTasks) {
      sorted = sorted.filter(m =>
        m.traktanden && Object.values(m.traktanden).some(pts =>
          pts?.some(p => p.type === 'todo' && !p.done && (p.assignee === myFullName || p.assignee === 'Gesamtvorstand'))
        )
      );
    }
    if (!searchTerm.trim()) return sorted;
    const term = searchTerm.toLowerCase();
    return sorted.filter(m => {
      if (m.title?.toLowerCase().includes(term)) return true;
      if (m.traktanden) {
        for (const points of Object.values(m.traktanden)) {
          if (points.some(p =>
            p.text?.toLowerCase().includes(term) ||
            p.docName?.toLowerCase().includes(term) ||
            p.assignee?.toLowerCase().includes(term)
          )) return true;
        }
      }
      return false;
    });
  }, [minutes, searchTerm, roleFilter, yearFilter, onlyOpenTasks, onlyMyTasks, myFullName]);

  const saveProtocol = async (p) => {
    const id = p.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', id), { ...p, id });
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', '__live_session__'));
    } catch (e) {}
    localStorage.removeItem('ruesssuuger_protocol_draft');
    setShowAdd(false);
    setEditing(null);
    notify("Protokoll erfolgreich gespeichert.", "success");
  };

  const toggleTaskDone = async (minute, traktandum, pointId) => {
    const updatedList = (minute.traktanden?.[traktandum] || []).map(p =>
      p.id === pointId ? { ...p, done: !p.done } : p
    );
    const updatedMinute = {
      ...minute,
      traktanden: { ...minute.traktanden, [traktandum]: updatedList }
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', minute.id), updatedMinute);
    notify("Pendenzen-Status aktualisiert.", "success");
  };

  const copyProtocolSummary = (m) => {
    const dateStr = m.date ? new Date(m.date).toLocaleDateString('de-CH') : '';
    const lines = [
      `📋 *RüssSuuger Ämme – ${m.title}* (${dateStr})`,
      ''
    ];
    const presentNames = users
      .filter(u => u.groups?.includes('Vorstand') && m.attendance?.[u.id] === 'present')
      .map(u => u.firstName);
    if (presentNames.length > 0) {
      lines.push(`👥 *Anwesend:* ${presentNames.join(', ')}`, '');
    }
    TRAKTANDEN.forEach(t => {
      const pts = m.traktanden?.[t] || [];
      if (pts.length > 0) {
        lines.push(`*${t}:*`);
        pts.forEach((p) => {
          const prefix = p.type === 'decision' ? '✅ [Beschluss] ' : p.type === 'todo' ? (p.done ? '☑️ [Erledigt] ' : '⏳ [Pendenz] ') : '• ';
          const who = p.assignee ? ` (@${p.assignee})` : '';
          const due = p.dueDate ? ` [bis ${new Date(p.dueDate).toLocaleDateString('de-CH')}]` : '';
          lines.push(`${prefix}${p.text}${who}${due}`);
        });
        lines.push('');
      }
    });
    if (copyTextToClipboard(lines.join('\n').trim())) {
      notify("Zusammenfassung für WhatsApp / E-Mail kopiert!", "success");
    } else {
      notify("Kopieren fehlgeschlagen.", "error");
    }
  };

  const highlightText = (text = '', highlight = '') => {
    if (!highlight.trim()) return text;
    const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <mark key={i} className="bg-orange-500/30 text-orange-300 px-1 rounded font-bold">{part}</mark>
      ) : (
        part
      )
    );
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  if (editing || showAdd) {
    return (
      <ProtocolEditor
        vorstand={vorstandMembers}
        currentUser={currentUser}
        liveDraft={liveDraft}
        openTasksList={openTasksList}
        calItems={calItems}
        onSave={saveProtocol}
        onCancel={() => { setShowAdd(false); setEditing(null); }}
        initialData={editing}
        notify={notify}
      />
    );
  }

  return (
    <div className="space-y-6">
      {liveDraft && (
        <div className="bg-gradient-to-r from-orange-500/20 via-orange-500/10 to-gray-900 border-2 border-orange-500/60 rounded-3xl p-5 sm:p-6 shadow-2xl animate-in fade-in duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative flex h-4 w-4 shrink-0 mt-1 sm:mt-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-orange-500"></span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-2.5 py-0.5 rounded-full">
                  LIVE-PROTOKOLL AKTIV
                </span>
                <span className="text-xs font-bold text-orange-300">
                  {liveDraft.activeEditorName || 'Ein Vorstandsmitglied'} tippt gerade
                  {liveDraft.activeTraktandum ? ` in «${liveDraft.activeTraktandum}»...` : '...'}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                {liveDraft.form?.title || 'Unbenannte Vorstandssitzung'}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setWatchingLive(true)}
              className="px-5 py-3 bg-gray-950 hover:bg-gray-900 text-white border border-orange-500/40 font-black rounded-2xl text-xs flex items-center gap-2 transition-all active:scale-95 min-h-[44px]"
            >
              <Eye size={16} className="text-orange-500" /> Live mitlesen
            </button>
            <button
              onClick={() => {
                setWatchingLive(false);
                if (liveDraft.form?.id) {
                  setEditing(liveDraft.form);
                } else {
                  setShowAdd(true);
                }
              }}
              className="px-5 py-3 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-2xl text-xs flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-orange-500/20 min-h-[44px]"
            >
              <Edit2 size={16} /> Gemeinsam tippen
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 border border-gray-800 rounded-3xl p-5 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20 mb-3">
              <ClipboardList size={12} /> Vorstands-Dokumentation
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Vorstands-Protokolle</h2>
            <p className="text-gray-400 text-sm mt-1">Strukturierte Sitzungsprotokolle, Beschlüsse & Pendenzen-Tracking</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="bg-orange-500 hover:bg-orange-400 text-gray-950 font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 whitespace-nowrap w-full md:w-auto min-h-[48px]"
          >
            <Plus size={20} strokeWidth={2.5} /> Neues Protokoll erfassen
          </button>
        </div>

        {minutes.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-gray-800/80">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-950/70 border border-gray-800/80 rounded-2xl p-3.5 sm:p-4 animate-pulse">
                <div className="h-3 bg-gray-800 rounded w-1/2 mb-3"></div>
                <div className="h-6 bg-gray-800 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : (
          stats.totalMinutes > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-gray-800/80">
              <div className="bg-gray-950/70 border border-gray-800/80 rounded-2xl p-3.5 sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Sitzungen</p>
                <p className="text-xl sm:text-2xl font-black text-white mt-1">{stats.totalMinutes}</p>
              </div>
              <div
                onClick={() => { setOnlyOpenTasks(!onlyOpenTasks); setOnlyMyTasks(false); }}
                className={`rounded-2xl p-3.5 sm:p-4 border cursor-pointer transition-all ${
                  onlyOpenTasks && !onlyMyTasks
                    ? 'bg-orange-500/15 border-orange-500'
                    : 'bg-gray-950/70 border-gray-800/80 hover:border-orange-500/40'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center justify-between">
                  <span>Alle Pendenzen</span>
                  {onlyOpenTasks && !onlyMyTasks && <span className="text-[9px] bg-orange-500 text-gray-950 px-1.5 py-0.5 rounded font-black">Aktiv</span>}
                </p>
                <p className="text-xl sm:text-2xl font-black text-orange-500 mt-1">{stats.openTodos}</p>
              </div>
              <div
                onClick={() => { setOnlyMyTasks(!onlyMyTasks); setOnlyOpenTasks(false); }}
                className={`rounded-2xl p-3.5 sm:p-4 border cursor-pointer transition-all ${
                  onlyMyTasks
                    ? 'bg-amber-500/15 border-amber-500'
                    : 'bg-gray-950/70 border-gray-800/80 hover:border-amber-500/40'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center justify-between">
                  <span>Meine Pendenzen</span>
                  {onlyMyTasks && <span className="text-[9px] bg-amber-500 text-gray-950 px-1.5 py-0.5 rounded font-black">Aktiv</span>}
                </p>
                <p className="text-xl sm:text-2xl font-black text-amber-400 mt-1">{stats.myOpenTodos}</p>
              </div>
              <div className="bg-gray-950/70 border border-gray-800/80 rounded-2xl p-3.5 sm:p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Beilagen / Dateien</p>
                <p className="text-xl sm:text-2xl font-black text-white mt-1">{stats.totalAttachments}</p>
              </div>
            </div>
          )
        )}
      </div>

      {(onlyOpenTasks || onlyMyTasks) && displayedTasks.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/30 rounded-3xl p-5 sm:p-6 space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-widest text-orange-400 flex items-center gap-2">
              <Sparkles size={16} /> {onlyMyTasks ? `Meine offenen Pendenzen (${displayedTasks.length})` : `Alle offenen Vorstands-Pendenzen (${displayedTasks.length})`}
            </h3>
            <button
              onClick={() => { setOnlyOpenTasks(false); setOnlyMyTasks(false); }}
              className="text-xs text-gray-400 hover:text-white font-bold min-h-[44px] flex items-center"
            >
              Filter zurücksetzen
            </button>
          </div>
          <div className="grid gap-2.5">
            {displayedTasks.map(item => {
              const targetMinute = minutes.find(x => x.id === item.minuteId);
              const isOverdue = item.point.dueDate && item.point.dueDate < todayIso;
              return (
                <div
                  key={item.point.id}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => targetMinute && toggleTaskDone(targetMinute, item.traktandum, item.point.id)}
                      title="Als erledigt markieren"
                      className="mt-0.5 w-6 h-6 rounded-lg border-2 border-orange-500 flex items-center justify-center hover:bg-orange-500/20 shrink-0 transition-all min-h-[36px] min-w-[36px]"
                    />
                    <div>
                      <p className="text-sm font-bold text-white leading-snug">{item.point.text}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[10px] font-black uppercase text-orange-400">{item.traktandum}</span>
                        {item.point.assignee && (
                          <span className="text-[10px] font-bold bg-gray-950 border border-gray-800 px-2.5 py-1 rounded text-gray-300">
                            Verantwortlich: {item.point.assignee}
                          </span>
                        )}
                        {item.point.dueDate && (
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded border ${
                            isOverdue
                              ? 'bg-red-500/15 text-red-400 border-red-500/30'
                              : 'bg-gray-950 text-gray-400 border-gray-800'
                          }`}>
                            Frist: {new Date(item.point.dueDate).toLocaleDateString('de-CH')} {isOverdue ? '(Überfällig)' : ''}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-500">
                          aus «{item.minuteTitle}» ({new Date(item.minuteDate).toLocaleDateString('de-CH')})
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setExpandedId(item.minuteId);
                      setOnlyOpenTasks(false);
                      setOnlyMyTasks(false);
                    }}
                    className="text-xs font-bold text-orange-500 hover:underline self-end sm:self-center shrink-0 min-h-[44px] flex items-center"
                  >
                    Zum Protokoll →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stats.totalMinutes > 0 && (
        <div className="space-y-3 animate-in fade-in">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
              <input
                type="text"
                placeholder="Nach Stichworten, Beschlüssen, Verantwortlichen oder Dateien suchen..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-4 pl-12 pr-12 text-white focus:border-orange-500 outline-none shadow-lg transition-all text-sm min-h-[48px]"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
                  <X size={18} />
                </button>
              )}
            </div>

            {availableYears.length > 2 && (
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded-2xl p-1.5 shrink-0 overflow-x-auto scrollbar-hide">
                {availableYears.map(yr => (
                  <button
                    key={yr}
                    onClick={() => setYearFilter(yr)}
                    className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-all min-h-[44px] flex items-center ${
                      yearFilter === yr ? 'bg-orange-500 text-gray-950' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {yr === 'Alle' ? 'Alle Jahre' : yr}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 flex items-center gap-1 mr-1 shrink-0">
              <Filter size={12} /> Ressort:
            </span>
            {['Alle', ...TRAKTANDEN].map(role => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap active:scale-95 min-h-[44px] flex items-center ${
                  roleFilter === role
                    ? 'bg-orange-500 text-gray-950 shadow-md shadow-orange-500/15'
                    : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {minutes.length === 0 ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-16 h-16 bg-gray-800 rounded-2xl"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-4 bg-gray-800 rounded w-1/4"></div>
                    <div className="h-6 bg-gray-800 rounded w-3/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          filteredMinutes.map(m => {
            const isExpanded = expandedId === m.id;
            const dateObj = m.date ? new Date(m.date) : new Date();
            const dayNum = dateObj.toLocaleDateString('de-CH', { day: '2-digit' });
            const monthShort = dateObj.toLocaleDateString('de-CH', { month: 'short' });
            const yearNum = dateObj.getFullYear();

            const activeTraktanden = TRAKTANDEN.filter(t => (m.traktanden?.[t]?.length || 0) > 0);
            const totalPointsCount = activeTraktanden.reduce((sum, t) => sum + (m.traktanden?.[t]?.length || 0), 0);
            const totalDocsCount = activeTraktanden.reduce(
              (sum, t) => sum + (m.traktanden?.[t]?.filter(p => p.docUrl)?.length || 0),
              0
            );
            const openTodoCount = activeTraktanden.reduce(
              (sum, t) => sum + (m.traktanden?.[t]?.filter(p => p.type === 'todo' && !p.done)?.length || 0),
              0
            );
            const presentCount = Object.values(m.attendance || {}).filter(s => s === 'present').length;

            return (
              <div
                key={m.id}
                className={`bg-gray-900 border rounded-3xl flex flex-col transition-all duration-300 overflow-hidden shadow-xl ${
                  isExpanded ? 'border-orange-500/50 ring-1 ring-orange-500/20' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div
                  className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 cursor-pointer hover:bg-gray-800/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                >
                  <div className="flex items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gray-950 border border-gray-800 flex flex-col items-center justify-center shrink-0 shadow-inner">
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">{monthShort}</span>
                      <span className="text-xl sm:text-2xl font-black text-white leading-none my-0.5">{dayNum}</span>
                      <span className="text-[10px] font-bold text-gray-600">{yearNum}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                          {totalPointsCount} {totalPointsCount === 1 ? 'Eintrag' : 'Einträge'}
                        </span>
                        {openTodoCount > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/30">
                            {openTodoCount} {openTodoCount === 1 ? 'Pendenz offen' : 'Pendenzen offen'}
                          </span>
                        )}
                        {presentCount > 0 && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                            <UserCheck size={11} /> {presentCount} Anwesend
                          </span>
                        )}
                        {totalDocsCount > 0 && (
                          <span className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                            <Paperclip size={11} /> {totalDocsCount} {totalDocsCount === 1 ? 'Anhang' : 'Anhänge'}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg sm:text-2xl font-black text-white break-words leading-snug">
                        {highlightText(m.title, searchTerm)}
                      </h3>

                      {activeTraktanden.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {activeTraktanden.map(t => (
                            <span
                              key={t}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${traktandumMeta[t]?.badge || 'bg-gray-800 text-gray-400 border-gray-700'}`}
                            >
                              {t} ({m.traktanden[t].length})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 justify-end pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-800/80" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => copyProtocolSummary(m)}
                      title="Zusammenfassung für WhatsApp / E-Mail kopieren"
                      className="p-3 bg-gray-950 border border-gray-800 text-gray-400 hover:text-orange-500 hover:border-orange-500/40 rounded-2xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Share2 size={18} />
                    </button>
                    <button
                      onClick={() => setReadingMinute(m)}
                      title="Lese- & Druckansicht (PDF)"
                      className="p-3 bg-gray-950 border border-gray-800 text-gray-400 hover:text-orange-500 hover:border-orange-500/40 rounded-2xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Printer size={18} />
                    </button>
                    <button
                      onClick={() => setEditing(m)}
                      title="Protokoll bearbeiten"
                      className="p-3 bg-gray-950 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 rounded-2xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() =>
                        askConfirm(
                          'Protokoll löschen?',
                          `Möchtest du das Protokoll "${m.title}" wirklich unwiderruflich löschen?`,
                          async () => {
                            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', m.id));
                            notify('Protokoll gelöscht.', 'info');
                          },
                          'Löschen'
                        )
                      }
                      title="Protokoll löschen"
                      className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 rounded-2xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 size={18} />
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : m.id)}
                      className={`p-3 rounded-2xl border transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center ${
                        isExpanded
                          ? 'bg-orange-500 text-gray-950 border-orange-500'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'
                      }`}
                    >
                      <ChevronRight className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} size={18} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-800 bg-gray-950/60 p-5 sm:p-8 space-y-8 animate-in slide-in-from-top-2 duration-300">
                    {m.attendance && Object.keys(m.attendance).length > 0 && (
                      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-5">
                        <h4 className="text-orange-500 font-black uppercase text-[10px] tracking-widest mb-3 flex items-center gap-2">
                          <UserCheck size={14}/> Anwesenheitskontrolle
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {users.filter(u => u.groups?.includes('Vorstand')).map(u => {
                            const status = m.attendance?.[u.id];
                            if (!status) return null;
                            const label = status === 'present' ? 'Anwesend' : status === 'absent' ? 'Unentschuldigt' : 'Entschuldigt';
                            const color = status === 'present'
                              ? 'bg-green-500/10 text-green-400 border-green-500/30'
                              : status === 'absent'
                              ? 'bg-red-500/10 text-red-400 border-red-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30';
                            return (
                              <span key={u.id} className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${color}`}>
                                {u.firstName} {u.lastName} <span className="opacity-70 font-normal">• {label}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="grid gap-5">
                      {TRAKTANDEN.map(t => {
                        const points = m.traktanden?.[t];
                        if (!points || points.length === 0) return null;
                        const meta = traktandumMeta[t] || { badge: 'bg-gray-800 text-gray-300 border-gray-700', dot: 'bg-orange-500' };

                        return (
                          <div key={t} className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-lg">
                            <div className="px-5 sm:px-6 py-4 bg-gray-950/60 border-b border-gray-800 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                                <h4 className="text-white font-black text-base sm:text-lg tracking-tight">{t}</h4>
                              </div>
                              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${meta.badge}`}>
                                {points.length} {points.length === 1 ? 'Eintrag' : 'Einträge'}
                              </span>
                            </div>

                            <div className="p-4 sm:p-6 space-y-3">
                              {points.map((p, idx) => {
                                const pType = p.type === 'todo' && p.done ? 'done' : (p.type || 'info');
                                const typeBadge = pointTypeMeta[pType] || pointTypeMeta.info;
                                const isOverdue = p.type === 'todo' && !p.done && p.dueDate && p.dueDate < todayIso;

                                return (
                                  <div
                                    key={p.id}
                                    className={`bg-gray-950 p-4 sm:p-5 rounded-2xl border transition-all relative group flex gap-3.5 ${
                                      isOverdue
                                        ? 'border-red-500/50'
                                        : p.type === 'todo' && !p.done
                                        ? 'border-orange-500/40'
                                        : p.type === 'decision'
                                        ? 'border-green-500/30'
                                        : 'border-gray-800/90 hover:border-gray-700'
                                    }`}
                                  >
                                    {p.type === 'todo' ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleTaskDone(m, t, p.id)}
                                        title={p.done ? 'Als offen markieren' : 'Pendenz als erledigt abhaken'}
                                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all min-h-[36px] min-w-[36px] ${
                                          p.done
                                            ? 'bg-emerald-500 border-emerald-500 text-gray-950'
                                            : 'border-orange-500 hover:bg-orange-500/20 text-transparent'
                                        }`}
                                      >
                                        <Check size={15} strokeWidth={3.5} />
                                      </button>
                                    ) : (
                                      <span className="text-xs font-black text-gray-600 bg-gray-900 border border-gray-800 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                                        {idx + 1}
                                      </span>
                                    )}

                                    <div className="flex-1 min-w-0 pr-8">
                                      {(p.type && p.type !== 'info') || p.assignee || p.dueDate ? (
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                          {p.type && p.type !== 'info' && (
                                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${typeBadge.style}`}>
                                              {typeBadge.label}
                                            </span>
                                          )}
                                          {p.assignee && (
                                            <span className="text-[10px] font-bold bg-gray-900 border border-gray-800 text-gray-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                                              <Users size={10} className="text-orange-500" /> {highlightText(p.assignee, searchTerm)}
                                            </span>
                                          )}
                                          {p.dueDate && (
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                              isOverdue
                                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                                : 'bg-gray-900 border-gray-800 text-gray-400'
                                            }`}>
                                              <Clock size={10} /> Bis {new Date(p.dueDate).toLocaleDateString('de-CH')}
                                            </span>
                                          )}
                                        </div>
                                      ) : null}

                                      <p className={`text-sm sm:text-base whitespace-pre-wrap leading-relaxed break-words ${p.done ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                                        {highlightText(p.text, searchTerm)}
                                      </p>

                                      {p.docUrl && (
                                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => setPreviewDoc({ url: p.docUrl, name: p.docName || 'Protokoll-Anhang' })}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-white hover:text-orange-300 bg-gray-900 px-3.5 py-2.5 rounded-xl border border-gray-800 transition-all active:scale-95 min-h-[44px]"
                                          >
                                            <Eye size={14} className="text-orange-500" /> Vorschau
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => triggerFileDownload(p.docUrl, p.docName || 'Protokoll-Anhang')}
                                            className="inline-flex items-center gap-2 text-xs font-bold text-orange-400 hover:text-orange-300 bg-orange-500/10 px-3.5 py-2.5 rounded-xl border border-orange-500/20 transition-all hover:scale-[1.02] active:scale-95 min-h-[44px]"
                                          >
                                            <Paperclip size={14} /> {p.docName || 'Dokument herunterladen'}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEnlargedPoint({ traktandum: t, index: idx + 1, ...p }); }}
                                      title="Grossansicht"
                                      className="absolute top-3.5 right-3.5 p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-orange-500 rounded-xl transition-all sm:opacity-0 sm:group-hover:opacity-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                    >
                                      <Maximize2 size={15} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {filteredMinutes.length === 0 && (searchTerm || roleFilter !== 'Alle' || yearFilter !== 'Alle' || onlyOpenTasks || onlyMyTasks) && (
          <div className="text-center py-12 text-gray-500 bg-gray-900/50 border border-gray-800 border-dashed rounded-3xl">
            Keine passenden Protokolle für deine aktuelle Filterauswahl gefunden.
          </div>
        )}
        {stats.totalMinutes === 0 && !searchTerm && minutes.length > 0 && (
          <div className="text-center py-20 bg-gray-900/50 border border-gray-800 border-dashed rounded-3xl">
            <ClipboardList className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-600 font-bold uppercase tracking-widest text-sm">Noch keine Protokolle vorhanden</p>
          </div>
        )}
      </div>

      {previewDoc && (
        <FilePreviewModal docItem={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}

      {readingMinute && (
        <ReadingViewModal minute={readingMinute} users={users} onClose={() => setReadingMinute(null)} />
      )}

      {enlargedPoint && (
        <div className="fixed inset-0 z-[220] bg-gray-950/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-2xl flex flex-col shadow-2xl max-h-[90vh]">
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50 rounded-t-3xl">
              <h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">{enlargedPoint.traktandum}</h3>
              <button onClick={() => setEnlargedPoint(null)} className="p-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <p className="text-white text-base sm:text-lg whitespace-pre-wrap leading-relaxed">{enlargedPoint.text}</p>
              {enlargedPoint.docUrl && (
                <div className="pt-4 border-t border-gray-800 flex flex-wrap gap-2">
                  <button
                    onClick={() => setPreviewDoc({ url: enlargedPoint.docUrl, name: enlargedPoint.docName || 'Anhang' })}
                    className="px-5 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 min-h-[44px]"
                  >
                    <Eye size={16} className="text-orange-500" /> Vorschau
                  </button>
                  <button
                    onClick={() => triggerFileDownload(enlargedPoint.docUrl, enlargedPoint.docName || 'Anhang')}
                    className="px-6 py-3 bg-orange-500 text-gray-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg min-h-[44px]"
                  >
                    <Download size={16} /> Herunterladen
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtocolEditor({ vorstand, currentUser, liveDraft, openTasksList = [], calItems = [], onSave, onCancel, initialData, notify }) {
  const [form, setForm] = useState(() => {
    if (initialData) return initialData;
    if (liveDraft?.form) return liveDraft.form;
    const savedDraft = localStorage.getItem('ruesssuuger_protocol_draft');
    if (savedDraft) {
      try {
        const parsed = JSON.parse(savedDraft);
        if (parsed && (parsed.title || Object.values(parsed.traktanden || {}).some(arr => arr?.length > 0))) {
          return parsed;
        }
      } catch (e) {}
    }
    return {
      title: '',
      date: new Date().toISOString().split('T')[0],
      attendance: {},
      traktanden: TRAKTANDEN.reduce((acc, curr) => ({ ...acc, [curr]: [] }), {})
    };
  });
  const [uploading,         setUploading]         = useState({});
  const [enlargedEditPoint, setEnlargedEditPoint] = useState(null);
  const [activeTraktandum,  setActiveTraktandum]  = useState('Alle');
  const [draftSavedAt,      setDraftSavedAt]      = useState(null);
  const [liveSyncEnabled,   setLiveSyncEnabled]   = useState(true);
  const [focusedField,      setFocusedField]      = useState({ traktandum: null, pointId: null });
  const [nextMeetingDate,   setNextMeetingDate]   = useState('');
  const [nextMeetingTime,   setNextMeetingTime]   = useState('19:30');
  const [nextMeetingLoc,    setNextMeetingLoc]    = useState('Vereinslokal Ämme');
  const [sessionSeconds,    setSessionSeconds]    = useState(0);

  const isRemoteUpdateRef = useRef(false);
  const lastLocalEditRef  = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setSessionSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatSessionTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!liveSyncEnabled || !liveDraft?.form) return;
    const isFromOtherSession = liveDraft.sessionId && liveDraft.sessionId !== currentUser?.sessionId;
    const timeSinceMyLastKeystroke = Date.now() - lastLocalEditRef.current;

    if (isFromOtherSession && timeSinceMyLastKeystroke > 400) {
      isRemoteUpdateRef.current = true;
      setForm(liveDraft.form);
    }
  }, [liveDraft, liveSyncEnabled, currentUser?.sessionId]);

  useEffect(() => {
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (!initialData) {
          localStorage.setItem('ruesssuuger_protocol_draft', JSON.stringify(form));
        }
        setDraftSavedAt(new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        if (liveSyncEnabled) {
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', '__live_session__'), {
            isActive: true,
            form,
            activeEditorId: currentUser?.id || 'unknown',
            activeEditorName: `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim(),
            sessionId: currentUser?.sessionId || 'local',
            activeTraktandum: focusedField.traktandum || null,
            activePointId: focusedField.pointId || null,
            updatedAt: Date.now()
          });
        }
      } catch (e) {
        console.error("Live Sync Write Error:", e);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [form, initialData, liveSyncEnabled, currentUser, focusedField]);

  const markLocalEdit = (traktandum = null, pointId = null) => {
    lastLocalEditRef.current = Date.now();
    if (traktandum || pointId) {
      setFocusedField({ traktandum, pointId });
    }
  };

  const importOpenTasks = () => {
    if (!openTasksList || openTasksList.length === 0) {
      notify("Keine offenen Pendenzen aus früheren Protokollen vorhanden.", "info");
      return;
    }
    markLocalEdit('Pendenzen-Import', null);
    let importedCount = 0;
    setForm(prev => {
      const nextTraktanden = { ...prev.traktanden };
      openTasksList.forEach(item => {
        const list = [...(nextTraktanden[item.traktandum] || [])];
        const alreadyExists = list.some(p => p.text.trim() === item.point.text.trim());
        if (!alreadyExists) {
          list.push({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: `[Pendenz aus ${item.minuteTitle}] ${item.point.text}`,
            type: 'todo',
            assignee: item.point.assignee || '',
            dueDate: item.point.dueDate || '',
            done: false,
            docUrl: item.point.docUrl || '',
            docName: item.point.docName || ''
          });
          nextTraktanden[item.traktandum] = list;
          importedCount++;
        }
      });
      return { ...prev, traktanden: nextTraktanden };
    });
    if (importedCount > 0) {
      notify(`${importedCount} offene Pendenz(en) ins aktuelle Protokoll übernommen!`, "success");
    } else {
      notify("Alle offenen Pendenzen sind bereits im aktuellen Protokoll enthalten.", "info");
    }
  };

  const scheduleNextMeeting = async () => {
    if (!nextMeetingDate) {
      notify("Bitte zuerst ein Datum für die nächste Sitzung wählen.", "error");
      return;
    }
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', id), {
      id,
      title: 'Vorstandssitzung',
      date: nextMeetingDate,
      time: nextMeetingTime || '19:30',
      location: nextMeetingLoc || 'Vereinslokal Ämme',
      description: `Geplant in Sitzung «${form.title || 'Vorstandssitzung'}»`
    });
    notify(`Nächste Vorstandssitzung (${new Date(nextMeetingDate).toLocaleDateString('de-CH')}) im Kalender eingetragen!`, "success");
    setNextMeetingDate('');
  };

  const handleCancelEditor = async () => {
    if (liveDraft?.sessionId === currentUser?.sessionId) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', '__live_session__'));
      } catch (e) {}
    }
    onCancel();
  };

  const updateAttendance = (userId, status) => {
    markLocalEdit('Anwesenheit', null);
    setForm(prev => ({ ...prev, attendance: { ...prev.attendance, [userId]: status } }));
  };

  const markAllPresent = () => {
    markLocalEdit('Anwesenheit', null);
    const next = {};
    vorstand.forEach(m => { next[m.id] = 'present'; });
    setForm(prev => ({ ...prev, attendance: next }));
  };

  const addPoint = (traktandum, defaultType = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    markLocalEdit(traktandum, id);
    setForm(prev => ({
      ...prev,
      traktanden: {
        ...prev.traktanden,
        [traktandum]: [
          ...(prev.traktanden[traktandum] || []),
          { id, text: '', type: defaultType, assignee: '', dueDate: '', done: false, docUrl: '', docName: '' }
        ]
      }
    }));
  };

  const removePoint = (traktandum, pointId) => {
    markLocalEdit(traktandum, null);
    setForm(prev => ({
      ...prev,
      traktanden: { ...prev.traktanden, [traktandum]: prev.traktanden[traktandum].filter(p => p.id !== pointId) }
    }));
  };

  const updatePoint = (traktandum, pointId, field, value) => {
    markLocalEdit(traktandum, pointId);
    setForm(prev => ({
      ...prev,
      traktanden: { ...prev.traktanden, [traktandum]: prev.traktanden[traktandum].map(p => p.id === pointId ? { ...p, [field]: value } : p) }
    }));
  };

  const updatePointFields = (traktandum, pointId, fieldsObj) => {
    markLocalEdit(traktandum, pointId);
    setForm(prev => ({
      ...prev,
      traktanden: { ...prev.traktanden, [traktandum]: prev.traktanden[traktandum].map(p => p.id === pointId ? { ...p, ...fieldsObj } : p) }
    }));
  };

  const movePoint = (traktandum, index, dir) => {
    markLocalEdit(traktandum, null);
    const newIndex = index + dir;
    setForm(prev => {
      const list = [...prev.traktanden[traktandum]];
      if (newIndex < 0 || newIndex >= list.length) return prev;
      [list[index], list[newIndex]] = [list[newIndex], list[index]];
      return { ...prev, traktanden: { ...prev.traktanden, [traktandum]: list } };
    });
  };

  const handleFileUpload = async (e, traktandum, pointId) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    setUploading(prev => ({ ...prev, [pointId]: 10 }));

    const fallbackToDataUrl = async () => {
      try {
        if (file.size > 750 * 1024) {
          notify("Storage nicht erreichbar & Datei grösser als 750 KB. Bitte kleinere Datei wählen.", "error");
          setUploading(prev => { const n = { ...prev }; delete n[pointId]; return n; });
          return;
        }
        const dataUrl = await readFileAsDataURL(file);
        updatePointFields(traktandum, pointId, { docUrl: dataUrl, docName: file.name });
        notify(`"${file.name}" direkt im Protokoll hinterlegt.`, "success");
      } catch (err) {
        console.error("Fallback Error:", err);
        notify("Datei konnte nicht verarbeitet werden.", "error");
      } finally {
        setUploading(prev => { const n = { ...prev }; delete n[pointId]; return n; });
      }
    };

    try {
      const storageRef = ref(storage, `artifacts/${appId}/public/uploads/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploading(prev => ({ ...prev, [pointId]: progress || 15 }));
        },
        async (error) => {
          await fallbackToDataUrl();
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            updatePointFields(traktandum, pointId, { docUrl: url, docName: file.name });
            notify(`Anhang "${file.name}" hochgeladen.`, "success");
          } catch (err) {
            await fallbackToDataUrl();
          } finally {
            setUploading(prev => { const n = { ...prev }; delete n[pointId]; return n; });
          }
        }
      );
    } catch (err) {
      await fallbackToDataUrl();
    }
  };

  const visibleTraktanden = activeTraktandum === 'Alle'
    ? TRAKTANDEN
    : TRAKTANDEN.filter(t => t === activeTraktandum);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gray-900 p-5 sm:p-8 rounded-3xl border border-gray-800 shadow-2xl">
        <div className="flex-1 space-y-4 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full border border-orange-500/20 inline-block">
              {initialData ? 'Protokoll bearbeiten' : 'Neues Sitzungsprotokoll'}
            </span>
            <div className="text-[10px] font-bold text-gray-400 bg-gray-950 px-3 py-1 rounded-full border border-gray-800 flex items-center gap-1">
              <Clock size={12} className="text-orange-500" /> Sitzungsdauer: {formatSessionTime(sessionSeconds)}
            </div>
            <button
              type="button"
              onClick={() => setLiveSyncEnabled(!liveSyncEnabled)}
              className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border flex items-center gap-1.5 transition-all min-h-[32px] ${
                liveSyncEnabled
                  ? 'bg-orange-500/15 text-orange-400 border-orange-500/40'
                  : 'bg-gray-950 text-gray-500 border-gray-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${liveSyncEnabled ? 'bg-orange-500 animate-ping' : 'bg-gray-600'}`} />
              {liveSyncEnabled ? 'Live aktiv' : 'Live pausiert'}
            </button>
            {draftSavedAt && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                ✓ Gesichert ({draftSavedAt})
              </span>
            )}
            {liveDraft && liveDraft.sessionId !== currentUser?.sessionId && (
              <span className="text-[10px] font-black text-amber-300 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 animate-pulse">
                ✍️ {liveDraft.activeEditorName} tippt gerade...
              </span>
            )}
          </div>
          <input
            className="w-full bg-transparent text-2xl sm:text-4xl font-black text-white border-b-2 border-gray-800 focus:border-orange-500 outline-none pb-2 transition-all placeholder:text-gray-700 min-h-[48px]"
            placeholder="z.B. 4. Vorstandssitzung 2026..."
            value={form.title}
            onChange={e => {
              markLocalEdit('Titel', null);
              setForm({...form, title: e.target.value});
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase text-gray-600 mr-1">Schnell-Titel:</span>
            {['Vorstandssitzung', 'Sujetsitzung', 'Kader- & Musikkommission', 'GV-Vorbereitung'].map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  markLocalEdit('Titel', null);
                  setForm(prev => ({ ...prev, title: `${preset} vom ${new Date(prev.date || Date.now()).toLocaleDateString('de-CH')}` }));
                }}
                className="text-[10px] font-bold bg-gray-950 hover:bg-gray-800 text-gray-400 hover:text-white border border-gray-800 px-3 py-2 rounded-lg transition-all min-h-[36px]"
              >
                + {preset}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-2">
              <Calendar className="text-orange-500 shrink-0" size={18} />
              <span className="text-xs font-bold text-gray-500 uppercase">Sitzungsdatum:</span>
              <input
                type="date"
                className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:border-orange-500 outline-none min-h-[44px]"
                value={form.date}
                onChange={e => {
                  markLocalEdit('Datum', null);
                  setForm({...form, date: e.target.value});
                }}
              />
            </div>

            {openTasksList.length > 0 && (
              <button
                type="button"
                onClick={importOpenTasks}
                className="text-xs font-black bg-orange-500/10 hover:bg-orange-500 hover:text-gray-950 text-orange-400 border border-orange-500/30 px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 min-h-[44px]"
              >
                <Sparkles size={14} /> Offene Pendenzen übernehmen ({openTasksList.length})
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <button
            onClick={handleCancelEditor}
            className="w-full sm:w-auto px-6 py-3.5 text-gray-400 font-bold hover:text-white transition-colors bg-gray-950 border border-gray-800 rounded-2xl min-h-[48px]"
          >
            Abbrechen
          </button>
          <button
            onClick={() => {
              if (!form.title.trim()) {
                notify("Bitte einen Sitzungstitel eingeben.", "error");
                return;
              }
              onSave(form);
            }}
            className="w-full sm:w-auto justify-center px-8 py-3.5 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-2xl flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all min-h-[48px]"
          >
            <Save size={20} /> Protokoll speichern
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 p-2.5 sm:p-3 rounded-2xl flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-3">
        <button
          type="button"
          onClick={() => setActiveTraktandum('Alle')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 min-h-[40px] flex items-center ${
            activeTraktandum === 'Alle'
              ? 'bg-orange-500 text-gray-950'
              : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
          }`}
        >
          Alle Ämter ({TRAKTANDEN.length})
        </button>
        {TRAKTANDEN.map(t => {
          const count = form.traktanden[t]?.length || 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTraktandum(t)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 min-h-[40px] ${
                activeTraktandum === t
                  ? 'bg-orange-500 text-gray-950 font-black'
                  : 'bg-gray-950 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              <span>{t}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                activeTraktandum === t ? 'bg-gray-950/20 text-gray-950' : count > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-900 text-gray-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto pr-1 scrollbar-thin">
          <div className="bg-gray-900 border border-gray-800 p-5 sm:p-6 rounded-3xl shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-black text-white flex items-center gap-2.5">
                <UserCheck className="text-orange-500" size={20} /> Anwesenheit
              </h3>
              <button
                type="button"
                onClick={markAllPresent}
                className="text-[10px] font-black uppercase tracking-wider text-orange-500 hover:underline min-h-[44px] flex items-center"
              >
                Alle anwesend
              </button>
            </div>
            <div className="space-y-3">
              {vorstand.map(m => (
                <div key={m.id} className="p-3.5 bg-gray-950 rounded-2xl border border-gray-800">
                  <p className="font-bold text-white mb-2.5 text-sm">{m.firstName} {m.lastName}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'present', label: 'Anw.',  color: 'bg-green-500/20 text-green-400 border-green-500/50' },
                      { id: 'excused', label: 'Ents.', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
                      { id: 'absent',  label: 'Unen.', color: 'bg-red-500/20 text-red-400 border-red-500/50' }
                    ].map(status => (
                      <button
                        type="button"
                        key={status.id}
                        onClick={() => updateAttendance(m.id, status.id)}
                        className={`text-[10px] font-black uppercase py-2.5 rounded-xl border transition-all min-h-[40px] flex items-center justify-center ${
                          form.attendance[m.id] === status.id
                            ? status.color
                            : 'bg-gray-900 text-gray-600 border-gray-800 hover:border-gray-700 hover:text-gray-400'
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

          <div className="bg-gray-900 border border-gray-800 p-5 sm:p-6 rounded-3xl shadow-xl space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest text-orange-500 flex items-center gap-2">
              <CalendarDays size={16} /> Nächste Sitzung planen
            </h3>
            <p className="text-xs text-gray-500">Trage den nächsten Termin direkt in den Vereinskalender ein:</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={nextMeetingDate}
                onChange={e => setNextMeetingDate(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:border-orange-500 outline-none min-h-[44px]"
              />
              <input
                type="time"
                value={nextMeetingTime}
                onChange={e => setNextMeetingTime(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:border-orange-500 outline-none min-h-[44px]"
              />
            </div>
            <input
              type="text"
              placeholder="Ort (z.B. Vereinslokal Ämme)"
              value={nextMeetingLoc}
              onChange={e => setNextMeetingLoc(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:border-orange-500 outline-none min-h-[44px]"
            />
            <button
              type="button"
              onClick={scheduleNextMeeting}
              className="w-full py-3 bg-gray-950 hover:bg-orange-500 text-orange-400 hover:text-gray-950 border border-orange-500/30 font-black text-xs rounded-xl transition-all active:scale-95 min-h-[44px]"
            >
              + In Kalender eintragen
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6 lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto pr-1 scrollbar-thin">
          {visibleTraktanden.map(traktandum => {
            const points = form.traktanden[traktandum] || [];
            return (
              <div key={traktandum} className="bg-gray-900 border border-gray-800 rounded-3xl shadow-xl overflow-hidden">
                <div className="px-5 sm:px-7 py-5 bg-gray-950/50 border-b border-gray-800 flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2.5">
                      <span className="w-2 h-5 bg-orange-500 rounded-full" />
                      {traktandum}
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {points.length === 0 ? 'Noch keine Einträge' : `${points.length} ${points.length === 1 ? 'Traktandenpunkt' : 'Traktandenpunkte'}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => addPoint(traktandum, 'info')}
                      className="px-3.5 py-2.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 hover:bg-orange-500 hover:text-gray-950 font-black text-xs rounded-xl transition-all active:scale-95 flex items-center gap-1 min-h-[40px]"
                    >
                      <Plus size={15} /> Punkt
                    </button>
                    <button
                      type="button"
                      onClick={() => addPoint(traktandum, 'decision')}
                      className="px-3.5 py-2.5 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-gray-950 font-black text-xs rounded-xl transition-all active:scale-95 flex items-center gap-1 min-h-[40px]"
                    >
                      + Beschluss
                    </button>
                    <button
                      type="button"
                      onClick={() => addPoint(traktandum, 'todo')}
                      className="px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-gray-950 font-black text-xs rounded-xl transition-all active:scale-95 flex items-center gap-1 min-h-[40px]"
                    >
                      + Pendenz
                    </button>
                  </div>
                </div>

                <div className="p-4 sm:p-7 space-y-4">
                  {points.map((point, index) => {
                    const otherTypingThisPoint =
                      liveDraft &&
                      liveDraft.sessionId !== currentUser?.sessionId &&
                      liveDraft.activePointId === point.id;

                    return (
                    <div
                      key={point.id}
                      className={`p-4 sm:p-5 bg-gray-950 border rounded-2xl space-y-4 group transition-colors ${
                        otherTypingThisPoint
                          ? 'border-amber-500/70 ring-1 ring-amber-500/20'
                          : 'border-gray-800 focus-within:border-orange-500/50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-gray-900 border border-gray-800 text-orange-500 font-black text-[11px] flex items-center justify-center shrink-0 mr-1">
                            #{index + 1}
                          </span>
                          {otherTypingThisPoint && (
                            <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-md animate-pulse mr-1">
                              ✍️ {liveDraft.activeEditorName} tippt...
                            </span>
                          )}
                          {[
                            { id: 'info',     label: 'Info',      activeClass: 'bg-gray-800 text-white border-gray-600' },
                            { id: 'decision', label: 'Beschluss', activeClass: 'bg-green-500/20 text-green-400 border-green-500/50' },
                            { id: 'todo',     label: 'Pendenz',   activeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
                          ].map(tOpt => (
                            <button
                              key={tOpt.id}
                              type="button"
                              onClick={() => updatePoint(traktandum, point.id, 'type', tOpt.id)}
                              className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-lg border transition-all min-h-[36px] flex items-center ${
                                (point.type || 'info') === tOpt.id
                                  ? tOpt.activeClass
                                  : 'bg-gray-900/50 text-gray-600 border-gray-800 hover:text-gray-400'
                              }`}
                            >
                              {tOpt.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <select
                            value={point.assignee || ''}
                            onChange={e => updatePoint(traktandum, point.id, 'assignee', e.target.value)}
                            className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-gray-300 focus:border-orange-500 outline-none min-h-[36px]"
                          >
                            <option value="">Verantwortlich...</option>
                            {vorstand.map(v => (
                              <option key={v.id} value={`${v.firstName} ${v.lastName}`}>
                                {v.firstName} {v.lastName}
                              </option>
                            ))}
                            <option value="Gesamtvorstand">Gesamtvorstand</option>
                          </select>

                          {point.type === 'todo' && (
                            <input
                              type="date"
                              value={point.dueDate || ''}
                              onChange={e => updatePoint(traktandum, point.id, 'dueDate', e.target.value)}
                              title="Fälligkeitsdatum (Bis wann?)"
                              className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-2 text-[11px] font-bold text-orange-400 focus:border-orange-500 outline-none min-h-[36px]"
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => setEnlargedEditPoint({ traktandum, id: point.id, text: point.text })}
                            title="Im Vollbild bearbeiten"
                            className="p-2 text-gray-500 hover:text-orange-500 transition-colors bg-gray-900 rounded-lg border border-gray-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <Maximize2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePoint(traktandum, index, -1)}
                            disabled={index === 0}
                            className="p-2 text-gray-500 hover:text-orange-500 disabled:opacity-30 transition-colors bg-gray-900 rounded-lg border border-gray-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePoint(traktandum, index, 1)}
                            disabled={index === points.length - 1}
                            className="p-2 text-gray-500 hover:text-orange-500 disabled:opacity-30 transition-colors bg-gray-900 rounded-lg border border-gray-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePoint(traktandum, point.id)}
                            className="p-2 text-gray-500 hover:text-red-500 transition-colors bg-gray-900 rounded-lg border border-gray-800 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <textarea
                          className="w-full flex-1 bg-transparent text-gray-100 border-none focus:ring-0 outline-none resize-none placeholder:text-gray-700 text-sm sm:text-base font-medium leading-relaxed overflow-hidden min-h-[56px]"
                          placeholder={`Notiz, Beschluss oder Pendenz für ${traktandum} eingeben...`}
                          value={point.text}
                          onFocus={() => setFocusedField({ traktandum, pointId: point.id })}
                          onChange={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                            updatePoint(traktandum, point.id, 'text', e.target.value);
                          }}
                          ref={el => { if (el) { requestAnimationFrame(() => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }); } }}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-gray-900">
                        <div className="w-full flex-1 flex items-center gap-3 bg-gray-900 px-4 py-3 rounded-xl border border-gray-800 relative overflow-hidden">
                          {uploading[point.id] !== undefined && (
                            <div className="absolute left-0 top-0 h-full bg-orange-500/20 transition-all" style={{ width: `${uploading[point.id]}%` }} />
                          )}
                          <Paperclip size={15} className="text-orange-500 shrink-0 z-10" />
                          <div className="flex-1 z-10 flex items-center overflow-hidden">
                            {uploading[point.id] !== undefined ? (
                              <span className="text-[11px] text-orange-500 font-bold">Wird gespeichert... {Math.round(uploading[point.id])}%</span>
                            ) : point.docUrl ? (
                              <div className="flex items-center justify-between w-full">
                                <button
                                  type="button"
                                  onClick={() => triggerFileDownload(point.docUrl, point.docName || 'Dokument')}
                                  className="text-xs text-white hover:text-orange-400 truncate font-bold max-w-[180px] sm:max-w-[280px] text-left"
                                >
                                  {point.docName || 'Dokument herunterladen'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updatePointFields(traktandum, point.id, { docUrl: '', docName: '' })}
                                  className="text-gray-500 hover:text-red-500 ml-2 bg-gray-950 p-2 rounded-md shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <label className="cursor-pointer text-xs text-gray-400 hover:text-white w-full block font-bold transition-colors truncate py-1">
                                <UploadCloud size={14} className="inline mr-2 text-orange-500" />
                                Datei anhängen (PDF, Word, Excel, Bild)
                                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={e => handleFileUpload(e, traktandum, point.id)} />
                              </label>
                            )}
                          </div>
                        </div>
                        <input
                          className="w-full sm:w-48 bg-gray-900 px-3.5 py-3 rounded-xl border border-gray-800 text-xs text-gray-300 focus:border-orange-500 outline-none min-h-[44px]"
                          placeholder="Anzeige-Name (optional)"
                          value={point.docName}
                          onChange={e => updatePoint(traktandum, point.id, 'docName', e.target.value)}
                        />
                      </div>
                    </div>
                    );
                  })}

                  {points.length === 0 && (
                    <button
                      type="button"
                      onClick={() => addPoint(traktandum)}
                      className="w-full py-6 border-2 border-dashed border-gray-800 hover:border-orange-500/40 rounded-2xl text-gray-600 hover:text-orange-400 text-xs font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 min-h-[56px]"
                    >
                      <Plus size={16} /> Ersten Eintrag für {traktandum} erfassen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {enlargedEditPoint && (
        <div className="fixed inset-0 z-[100] bg-gray-950/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-3xl flex flex-col shadow-2xl h-[80vh] max-h-[800px]">
            <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-950/50 rounded-t-3xl">
              <h3 className="text-orange-500 font-black uppercase tracking-widest text-sm">{enlargedEditPoint.traktandum} – Vollbild</h3>
              <button onClick={() => setEnlargedEditPoint(null)} className="p-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"><X size={20} /></button>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <textarea
                className="flex-1 w-full bg-gray-950 border border-gray-800 rounded-2xl p-6 text-white focus:border-orange-500 outline-none resize-none leading-relaxed text-base sm:text-lg"
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
                className="w-full sm:w-auto px-8 py-4 bg-orange-500 text-gray-950 font-black rounded-xl active:scale-95 transition-all shadow-lg min-h-[48px]"
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

function ReadingViewModal({ minute, users, onClose }) {
  const presentCount = Object.values(minute.attendance || {}).filter(s => s === 'present').length;

  return (
    <div className="fixed inset-0 z-[220] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Printer size={18} className="text-orange-500 shrink-0" />
            <h3 className="font-black text-white text-sm sm:text-base truncate">Sitzungsprotokoll (Druckansicht)</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => window.print()}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 shadow-lg min-h-[44px]"
            >
              <Printer size={14} /> Drucken / PDF
            </button>
            <button
              onClick={onClose}
              className="p-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 sm:p-12 flex-1 overflow-auto bg-white text-gray-900 space-y-8 select-text">
          <div className="border-b-2 border-gray-900 pb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-600 mb-1">RüssSuuger Ämme • Vorstandsprotokoll</p>
              <h1 className="text-2xl sm:text-4xl font-black text-gray-950 tracking-tight">{minute.title}</h1>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm font-bold text-gray-700">{minute.date ? new Date(minute.date).toLocaleDateString('de-CH', { dateStyle: 'long' }) : ''}</p>
            </div>
          </div>

          {minute.attendance && Object.keys(minute.attendance).length > 0 && (
            <div className="bg-gray-100 p-4 rounded-2xl border border-gray-200">
              <p className="text-xs font-black uppercase tracking-wider text-gray-700 mb-2">Anwesenheit ({presentCount} anwesend)</p>
              <div className="flex flex-wrap gap-2">
                {users.filter(u => u.groups?.includes('Vorstand')).map(u => {
                  const status = minute.attendance?.[u.id];
                  if (!status) return null;
                  const label = status === 'present' ? 'Anwesend' : status === 'absent' ? 'Unentschuldigt' : 'Entschuldigt';
                  return (
                    <span key={u.id} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg font-medium text-gray-800">
                      <b>{u.firstName} {u.lastName}</b>: {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {TRAKTANDEN.map(t => {
              const points = minute.traktanden?.[t];
              if (!points || points.length === 0) return null;
              return (
                <div key={t} className="space-y-3">
                  <h3 className="text-lg font-black text-gray-950 border-b border-gray-300 pb-1">{t}</h3>
                  <div className="space-y-3 pl-2">
                    {points.map((p, idx) => (
                      <div key={p.id} className="space-y-1">
                        <div className="flex items-start gap-2 text-sm">
                          <span className="font-bold text-gray-500 shrink-0">{idx + 1}.</span>
                          <div className="flex-1">
                            {p.type && p.type !== 'info' && (
                              <span className="inline-block text-[10px] font-black uppercase bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded mr-2">
                                {p.type === 'decision' ? 'Beschluss' : 'Pendenz'}
                              </span>
                            )}
                            {p.assignee && <span className="text-xs font-bold text-gray-600 mr-2">(@{p.assignee})</span>}
                            <span className="whitespace-pre-wrap leading-relaxed">{p.text}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-12 border-t border-gray-300 flex justify-between text-xs text-gray-500 font-medium">
            <span>Protokoll RüssSuuger Ämme</span>
            <span>Generiert am {new Date().toLocaleDateString('de-CH')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilePreviewModal({ docItem, onClose }) {
  if (!docItem?.url) return null;
  const lowerName = (docItem.name || '').toLowerCase();
  const isImage =
    docItem.type?.startsWith('image/') ||
    /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lowerName) ||
    docItem.url.startsWith('data:image/');
  const isPdf =
    docItem.type?.includes('pdf') ||
    /\.pdf$/i.test(lowerName) ||
    docItem.url.startsWith('data:application/pdf');

  return (
    <div
      className="fixed inset-0 z-[220] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-gray-950 border-b border-gray-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={18} className="text-orange-500 shrink-0" />
            <h3 className="font-black text-white text-sm sm:text-base truncate">{docItem.name || 'Dokument-Vorschau'}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => triggerFileDownload(docItem.url, docItem.name || 'Dokument')}
              className="px-4 py-2.5 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 min-h-[44px]"
            >
              <Download size={14} /> Herunterladen
            </button>
            <button
              onClick={onClose}
              className="p-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-auto flex items-center justify-center bg-gray-950/50 min-h-[320px]">
          {isImage ? (
            <img
              src={docItem.url}
              alt={docItem.name}
              className="max-h-[72vh] max-w-full object-contain rounded-2xl shadow-lg"
            />
          ) : isPdf ? (
            <iframe
              src={docItem.url}
              title={docItem.name}
              className="w-full h-[72vh] rounded-2xl border border-gray-800 bg-white"
            />
          ) : (
            <div className="text-center py-12 space-y-4">
              <File size={48} className="mx-auto text-orange-500/60" />
              <p className="text-gray-300 font-bold text-sm">
                Für diesen Dateityp ist keine direkte Browser-Vorschau verfügbar.
              </p>
              <button
                onClick={() => triggerFileDownload(docItem.url, docItem.name || 'Dokument')}
                className="px-6 py-3.5 bg-orange-500 text-gray-950 font-black rounded-2xl text-xs inline-flex items-center gap-2 shadow-lg min-h-[44px]"
              >
                <Download size={16} /> Datei jetzt herunterladen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold transition-all whitespace-nowrap active:scale-95 min-h-[44px] ${active ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/20' : 'bg-gray-900 text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
      {icon} {label}
    </button>
  );
}

function EventsView({ events, currentUser, isArchive = false, users, notify, askConfirm }) {
  const [showCreate,    setShowCreate]    = useState(false);
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
        onDelete={() => {
          deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', current.id));
          setSelectedEvent(null);
          notify("Event wurde gelöscht.", "info");
        }}
        users={users}
        isArchived={isArchive}
        notify={notify}
        askConfirm={askConfirm}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-2xl sm:text-3xl font-black text-white">{isArchive ? 'Archiv' : 'Aktuelle Events'}</h2>
        {!isArchive && currentUser.role === 'admin' && (
          <button onClick={() => setShowCreate(!showCreate)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[48px]">
            {showCreate ? 'Schliessen' : <><Plus size={20} /> Neuer Event</>}
          </button>
        )}
      </div>
      {showCreate && <CreateEventForm onSubmit={e => {
        const id = Date.now().toString();
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), { ...e, id, isArchived: false, surveys: [], createdAt: new Date().toISOString() });
        setShowCreate(false);
        notify("Event erfolgreich erstellt.", "success");
      }} />}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.length === 0 ? (
          <div className="col-span-full space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl animate-pulse">
                <div className="h-4 bg-gray-800 rounded w-1/4 mb-4"></div>
                <div className="h-6 bg-gray-800 rounded w-3/4 mb-3"></div>
                <div className="h-4 bg-gray-800 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          events.map(e => (
            <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl cursor-pointer hover:border-orange-500 transition-all group shadow-lg active:scale-95">
              <span className="text-[9px] font-black text-orange-500 uppercase bg-orange-500/10 px-3 py-1 rounded-full mb-4 inline-block tracking-widest">{e.category}</span>
              <h3 className="text-xl font-bold text-white mb-2">{e.title}</h3>
              <div className="flex flex-col gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-orange-500" /> Start: {new Date(e.date).toLocaleString('de-CH', {dateStyle: 'short', timeStyle: 'short'})}</span>
                {e.autoArchive && e.endDate && <span className="flex items-center gap-1.5"><Archive size={14} className="text-orange-500" /> Auto-Archiv: {new Date(e.endDate).toLocaleString('de-CH', {dateStyle: 'short', timeStyle: 'short'})}</span>}
                <div className="flex items-center gap-1 mt-2 border-t border-gray-800 pt-2"><BarChart3 size={14}/> {e.surveys?.length || 0} Umfragen</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EventDetail({ event, onBack, currentUser, onUpdate, onDelete, users, isArchived, notify, askConfirm }) {
  const [showSurveyForm,   setShowSurveyForm]   = useState(false);
  const [editingSurvey,    setEditingSurvey]    = useState(null);
  const [presentingSurvey, setPresentingSurvey] = useState(null);

  const saveSurvey = (s) => {
    if (editingSurvey) {
      onUpdate({ surveys: event.surveys.map(x => x.id === editingSurvey.id ? { ...x, ...s } : x) });
      setEditingSurvey(null);
      notify("Umfrage aktualisiert.", "success");
    } else {
      onUpdate({ surveys: [...(event.surveys || []), { ...s, id: Date.now().toString(), status: 'draft', votedUsers: [] }] });
      setShowSurveyForm(false);
      notify("Neue Umfrage hinzugefügt.", "success");
    }
  };

  const moveSurvey = (index, dir) => {
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= event.surveys.length) return;
    const reordered = [...event.surveys];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    onUpdate({ surveys: reordered });
  };

  const deleteSurvey = (id) => {
    askConfirm(
      'Umfrage löschen?',
      'Soll diese Umfrage wirklich gelöscht werden?',
      () => {
        onUpdate({ surveys: event.surveys.filter(x => x.id !== id) });
        notify("Umfrage gelöscht.", "info");
      },
      'Löschen'
    );
  };

  const exportToExcel = () => {
    let csv = '\uFEFF';
    csv += `Event:;${event.title}\n`;
    csv += `Datum:;${new Date(event.date).toLocaleDateString('de-CH')}\n`;
    csv += `Kategorie:;${event.category}\n\n`;
    csv += `Umfrage;Option;Stimmen;Prozent\n`;
    if (event.surveys) {
      event.surveys.forEach(survey => {
        const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);
        survey.options.forEach(opt => {
          const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100);
          csv += `"${survey.title.replace(/"/g, '""')}";"${opt.text.replace(/"/g, '""')}";${opt.votes || 0};${pct}%\n`;
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
      <div className="flex items-center gap-4 sm:gap-6">
        <button onClick={onBack} className="bg-gray-900 p-3 rounded-2xl hover:text-orange-500 transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center"><ChevronRight className="rotate-180" size={24} /></button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-3xl font-black text-white flex flex-wrap items-center gap-2">
            <span className="truncate">{event.title}</span>
            {isArchived && <span className="bg-red-500/10 text-red-500 text-[10px] uppercase font-black px-2 py-1 rounded-md border border-red-500/20">Archiviert</span>}
          </h2>
          <p className="text-orange-500 text-xs font-bold uppercase">{event.category} • {new Date(event.date).toLocaleDateString('de-CH')}</p>
        </div>
        {currentUser.role === 'admin' && (
          <div className="flex gap-2 shrink-0">
            <button onClick={exportToExcel} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl hover:text-green-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center" title="Als Excel (CSV) exportieren"><Download size={20}/></button>
            {!isArchived && <button onClick={() => onUpdate({ isArchived: !event.isArchived })} className="p-3 bg-gray-900 border border-gray-800 rounded-2xl hover:text-orange-500 transition-all min-h-[44px] min-w-[44px] flex items-center justify-center" title="Manuell Archivieren"><Archive size={20}/></button>}
            <button
              onClick={() =>
                askConfirm(
                  'Event komplett löschen?',
                  'Achtung: Soll dieser Event wirklich komplett und unwiderruflich gelöscht werden?',
                  onDelete,
                  'Unwiderruflich löschen'
                )
              }
              className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-500/20 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <Trash2 size={20}/>
            </button>
          </div>
        )}
      </div>

      {currentUser.role === 'admin' && !isArchived && (
        <button onClick={() => setShowSurveyForm(!showSurveyForm)} className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all min-h-[48px]">
          {showSurveyForm ? 'Abbrechen' : 'Neue Umfrage hinzufügen'}
        </button>
      )}

      {showSurveyForm && (
        <CreateSurveyForm onSubmit={saveSurvey} onCancel={() => setShowSurveyForm(false)} />
      )}

      <div className="space-y-6">
        {event.surveys?.map((s, index) => (
          <div key={s.id} className="transition-all">
            <SurveyCard
              survey={s}
              currentUser={currentUser}
              isArchived={isArchived}
              onEdit={() => setEditingSurvey(editingSurvey?.id === s.id ? null : s)}
              onDelete={() => deleteSurvey(s.id)}
              onPresent={setPresentingSurvey}
              onMoveUp={index > 0 ? () => moveSurvey(index, -1) : null}
              onMoveDown={index < event.surveys.length - 1 ? () => moveSurvey(index, 1) : null}
              isEditing={editingSurvey?.id === s.id}
              onSaveEdit={saveSurvey}
              onCancelEdit={() => setEditingSurvey(null)}
              onVote={async (opts) => {
                const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
                try {
                  await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(eventRef);
                    if (!snap.exists()) throw new Error("Event nicht gefunden.");
                    const data = snap.data();
                    const srv = data.surveys?.find(x => x.id === s.id);
                    if (!srv) throw new Error("Umfrage nicht gefunden.");
                    if (srv.votedUsers?.includes(currentUser.id)) throw new Error("Bereits abgestimmt.");
                    const updatedSurveys = data.surveys.map(x => {
                      if (x.id !== s.id) return x;
                      return {
                        ...x,
                        options: x.options.map(o => opts.includes(o.id) ? { ...o, votes: (o.votes || 0) + 1 } : o),
                        votedUsers: [...(x.votedUsers || []), currentUser.id]
                      };
                    });
                    transaction.update(eventRef, { surveys: updatedSurveys });
                  });
                } catch (err) {
                  console.error("Vote Error:", err);
                  if (err.message === "Bereits abgestimmt.") notify("Du hast bereits abgestimmt.", "error");
                }
              }}
              onStatusChange={st => {
                let updated = event.surveys.map(x => x.id === s.id ? {...x, status: st} : x);
                if (st === 'published') {
                  const idx = updated.findIndex(x => x.id === s.id);
                  const [moved] = updated.splice(idx, 1);
                  updated.push(moved);
                }
                onUpdate({ surveys: updated });
              }}
              users={users}
            />
          </div>
        ))}
      </div>

      {presentingSurvey && (
        <PresentationModal
          survey={event.surveys.find(s => s.id === presentingSurvey.id) || presentingSurvey}
          users={users}
          onClose={() => setPresentingSurvey(null)}
          onPublish={() => {
            const s = event.surveys.find(x => x.id === presentingSurvey.id);
            if (!s) return;
            let updated = event.surveys.map(x => x.id === s.id ? {...x, status: 'published'} : x);
            const idx = updated.findIndex(x => x.id === s.id);
            const [moved] = updated.splice(idx, 1);
            updated.push(moved);
            onUpdate({ surveys: updated });
          }}
        />
      )}
    </div>
  );
}

function PresentationModal({ survey, users, onClose, onPublish }) {
  const [step, setStep] = useState('welcome'); // 'welcome' | 'voting'

  const surveyAllowedGroups = survey.allowedGroups || GROUPS;
  const eligibleUsers = users.filter(u => surveyAllowedGroups.some(g => u.groups?.includes(g)));
  const eligibleUsersCount = eligibleUsers.length;
  
  const onlineCount = eligibleUsers.filter(u => u.isOnline && Date.now() - (u.lastSeen || 0) < 45000).length;
  const pctOnline = eligibleUsersCount === 0 ? 0 : Math.round((onlineCount / eligibleUsersCount) * 100);

  const totalVotes = survey.options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const votedCount = survey.votedUsers?.length || 0;
  const pctVoted = eligibleUsersCount === 0 ? 0 : Math.round((votedCount / eligibleUsersCount) * 100);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://ruesssuuger-aemme.ch';

  const leadingOption = totalVotes > 0 ? survey.options.reduce((max, o) => (o.votes || 0) > (max.votes || 0) ? o : max, survey.options[0]) : null;
  const leadingVotes = leadingOption?.votes || 0;
  const quorumReached = survey.majorityType === 'two_thirds' 
    ? (leadingVotes / (totalVotes || 1)) >= (2 / 3) 
    : survey.majorityType === 'simple' 
    ? (leadingVotes / (totalVotes || 1)) > 0.5 
    : true;

  return (
    <div className="fixed inset-0 z-[200] bg-gray-950 flex flex-col animate-in fade-in duration-300">
      <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <h1 className="text-xl sm:text-2xl font-black italic tracking-tighter">
            <span className="text-gray-400">Rüss</span><span className="text-orange-500">Suuger</span> <span className="text-gray-400">Ämme</span>
          </h1>
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20 hidden sm:inline-block">
            {step === 'welcome' ? 'Willkommen & QR-Code' : 'Live Abstimmung'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {step === 'welcome' ? (
            <button onClick={() => {
              if (survey.status === 'draft' && onPublish) {
                onPublish();
              }
              setStep('voting');
            }} className="px-6 py-3 bg-orange-500 text-gray-950 font-black rounded-xl text-sm active:scale-95 transition-all shadow-lg shadow-orange-500/20 min-h-[44px]">
              Zur Abstimmung starten →
            </button>
          ) : (
            survey.status === 'active' && onPublish && (
              <button onClick={onPublish} className="px-5 py-3 bg-orange-500 text-gray-950 font-black rounded-xl text-sm active:scale-95 transition-all shadow-lg shadow-orange-500/20 min-h-[44px]">
                Resultate publizieren
              </button>
            )
          )}
          <button onClick={onClose} className="p-3 bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <Minimize2 size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-8 py-10 max-w-4xl mx-auto w-full">
        {step === 'welcome' ? (
          <div className="w-full text-center space-y-8 animate-in fade-in duration-300">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-xs font-black uppercase px-4 py-1.5 rounded-full">
                <QrCode size={16} /> QR-Code scannen & Einloggen
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
                Herzlich Willkommen zur Abstimmung!
              </h2>
              <p className="text-gray-400 text-sm sm:text-base max-w-xl mx-auto">
                Bitte scanne den QR-Code mit der Handykamera, öffne das Portal und melde dich an. Sobald alle bereit sind, starten wir den Durchgang.
              </p>
            </div>

            <div className="inline-block p-4 bg-white rounded-3xl shadow-2xl">
              <StandardQRCodeImage value={currentUrl} size={220} />
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-950 mt-3">Portal öffnen</p>
            </div>

            <div className="max-w-md mx-auto w-full bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl space-y-3">
              <div className="flex justify-between text-sm font-bold text-gray-400">
                <span>Mitglieder online im System</span>
                <span className="text-orange-500 font-black">{onlineCount} von {eligibleUsersCount}</span>
              </div>
              <div className="w-full h-3 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-700"
                  style={{ width: `${pctOnline}%` }}
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  if (survey.status === 'draft' && onPublish) {
                    onPublish();
                  }
                  setStep('voting');
                }}
                className="px-8 py-4 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-2xl text-base shadow-xl active:scale-95 transition-all"
              >
                Zur Abstimmung starten →
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row items-center justify-between w-full gap-8">
              <div className="flex-1 text-center md:text-left">
                <button onClick={() => setStep('welcome')} className="text-xs text-gray-500 hover:text-orange-400 font-bold mb-2 inline-flex items-center gap-1">
                  ← Zurück zur Startseite / QR-Code
                </button>
                <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight mb-2">
                  {survey.title}
                </h2>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">
                  {survey.majorityType === 'two_thirds' ? '⅔ Zwei-Drittel-Mehrheit erforderlich' : survey.majorityType === 'simple' ? 'Einfache Mehrheit (50%+1)' : ''}
                </p>
              </div>
            </div>

            <div className="w-full space-y-4">
              {survey.status === 'published' ? (
                <>
                  {survey.options.map(o => {
                    const pct = totalVotes === 0 ? 0 : Math.round(((o.votes || 0) / totalVotes) * 100);
                    const isLeading = totalVotes > 0 && (o.votes || 0) === Math.max(...survey.options.map(x => x.votes || 0)) && (o.votes || 0) > 0;
                    return (
                      <div key={o.id} className={`relative h-20 rounded-2xl overflow-hidden flex items-center px-6 border-2 transition-all ${isLeading ? 'border-orange-500' : 'border-gray-800 bg-gray-900'}`}>
                        <div
                          className={`absolute left-0 top-0 h-full transition-all duration-1000 ease-out ${isLeading ? 'bg-orange-500/20' : 'bg-gray-800/60'}`}
                          style={{ width: `${pct}%` }}
                        />
                        <span className="flex-1 font-black text-white text-lg sm:text-xl z-10 truncate">{o.text}</span>
                        <div className="z-10 text-right ml-4">
                          <p className="text-2xl sm:text-3xl font-black text-white">{o.votes || 0}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Stimmen ({pct}%)</p>
                        </div>
                      </div>
                    );
                  })}
                  {survey.majorityType && survey.majorityType !== 'none' && (
                    <div className={`p-4 rounded-2xl border text-center font-bold text-sm ${quorumReached ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                      {quorumReached ? '✓ Quorum / Mehrheit erfolgreich erreicht!' : '⚠ Erforderliche Mehrheit noch nicht erreicht'}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 bg-gray-900 border border-gray-800 rounded-3xl w-full">
                  <p className="text-orange-400 font-bold uppercase tracking-widest text-sm mb-2">Abstimmung läuft noch</p>
                  <p className="text-gray-500 text-xs">Resultate werden nach der Veröffentlichung eingeblendet.</p>
                </div>
              )}
            </div>

            <div className="w-full bg-gray-900 border border-gray-800 p-6 rounded-3xl shadow-xl space-y-3">
              <div className="flex justify-between text-sm font-bold text-gray-400">
                <span>{votedCount} von {eligibleUsersCount} haben abgestimmt</span>
                <span className="text-orange-500 font-black">{pctVoted}%</span>
              </div>
              <div className="w-full h-3 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-700"
                  style={{ width: `${pctVoted}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateEventForm({ onSubmit }) {
  const [form, setForm] = useState({ title: '', category: CATEGORIES[0], date: new Date().toISOString().slice(0,16), endDate: '', autoArchive: false });
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="bg-gray-900 border border-gray-800 p-6 sm:p-8 rounded-3xl mb-8 space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Event Titel</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[44px]" placeholder="z.B. GV 2026" value={form.title} onChange={e => setForm({...form, title: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Kategorie</label>
          <select className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white min-h-[44px]" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1">Start-Datum & Zeit</label>
          <input type="datetime-local" required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[44px]" value={form.date} onChange={e => setForm({...form, date: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold text-gray-600 uppercase ml-1 flex items-center gap-2 cursor-pointer py-1">
            <input type="checkbox" checked={form.autoArchive} onChange={e => setForm({...form, autoArchive: e.target.checked})} className="accent-orange-500 w-5 h-5" />
            Auto-Archivierung am:
          </label>
          <input type="datetime-local" required={form.autoArchive} disabled={!form.autoArchive} className={`w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none transition-all min-h-[44px] ${!form.autoArchive && 'opacity-50 cursor-not-allowed'}`} value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} />
        </div>
      </div>
      <button type="submit" className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg mt-2 min-h-[48px]">Event speichern</button>
    </form>
  );
}

function CreateSurveyForm({ onSubmit, initialData, onCancel, inline = false }) {
  const [title,         setTitle]         = useState(initialData?.title || '');
  const [maxAnswers,    setMaxAnswers]    = useState(initialData?.maxAnswers || 1);
  const [majorityType,  setMajorityType]  = useState(initialData?.majorityType || 'none');
  const [options,       setOptions]       = useState(initialData?.options || [{ id: '1', text: '', youtubeUrl: '' }, { id: '2', text: '', youtubeUrl: '' }]);
  const [allowedGroups, setAllowedGroups] = useState(initialData?.allowedGroups || GROUPS);
  const [isAnonymous,   setIsAnonymous]   = useState(initialData?.isAnonymous || false);

  const toggleGroup = g => setAllowedGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit({ title, maxAnswers, majorityType, allowedGroups, isAnonymous, options: options.filter(o => o.text.trim()) }); }} className={`space-y-6 animate-in slide-in-from-top-2 duration-200 ${inline ? "p-2" : "bg-gray-900 border border-gray-800 p-6 sm:p-8 rounded-3xl"}`}>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-4 text-white focus:border-orange-500 outline-none min-h-[48px]" placeholder="Was ist die Frage?" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 bg-gray-950 border border-gray-800 px-4 py-3 rounded-xl shrink-0">
          <label className="text-xs font-bold text-gray-500 uppercase">Max. Stimmen:</label>
          <input type="number" min="1" max="10" className="w-16 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-orange-500 outline-none text-center font-bold min-h-[40px]" value={maxAnswers} onChange={e => setMaxAnswers(parseInt(e.target.value) || 1)} />
        </div>
        <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 px-4 py-3 rounded-xl shrink-0">
          <label className="text-xs font-bold text-gray-500 uppercase">Mehrheit:</label>
          <select className="bg-transparent text-white text-xs font-bold outline-none min-h-[36px]" value={majorityType} onChange={e => setMajorityType(e.target.value)}>
            <option value="none" className="bg-gray-900">Keine Angabe</option>
            <option value="simple" className="bg-gray-900">Einfach (50%+1)</option>
            <option value="two_thirds" className="bg-gray-900">Zwei Drittel (⅔)</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 px-4 py-3 rounded-xl">
        <input type="checkbox" id="anonCheck" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} className="accent-orange-500 w-4 h-4" />
        <label htmlFor="anonCheck" className="text-xs font-bold text-gray-300 cursor-pointer">
          Anonyme Abstimmung (Es wird nur gezählt, wer abgestimmt hat, aber nicht welche Stimme von wem stammt)
        </label>
      </div>
      {options.map((o, i) => (
        <div key={o.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-950 border border-gray-800 rounded-2xl relative group">
          <input required className="bg-transparent border-b border-gray-800 px-2 py-3 text-white outline-none focus:border-orange-500 font-bold min-h-[40px]" placeholder={`Option ${i+1}`} value={o.text} onChange={e => { const n = [...options]; n[i].text = e.target.value; setOptions(n); }} />
          <div className="flex items-center gap-2">
            <Youtube size={18} className="text-red-500 shrink-0" />
            <input className="w-full bg-transparent border-b border-gray-800 px-2 py-3 text-gray-500 outline-none focus:border-orange-500 text-xs min-h-[40px]" placeholder="YouTube Link..." value={o.youtubeUrl} onChange={e => { const n = [...options]; n[i].youtubeUrl = e.target.value; setOptions(n); }} />
            {options.length > 2 && (
              <button type="button" onClick={() => setOptions(options.filter(x => x.id !== o.id))} className="p-3 text-gray-700 hover:text-red-500 transition-colors bg-gray-900 rounded-lg ml-2 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"><Trash2 size={16} /></button>
            )}
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setOptions([...options, { id: Date.now().toString(), text: '', youtubeUrl: '' }])} className="text-orange-500 text-xs font-bold hover:underline transition-all py-2 inline-block">+ Option hinzufügen</button>
      <div className="space-y-3 pt-4 border-t border-gray-800">
        <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Wer darf an dieser Umfrage teilnehmen?</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {GROUPS.map(g => (
            <label key={g} className={`flex items-center gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition-all min-h-[48px] ${allowedGroups.includes(g) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <input type="checkbox" className="hidden" checked={allowedGroups.includes(g)} onChange={() => toggleGroup(g)} />
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${allowedGroups.includes(g) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'}`}>
                {allowedGroups.includes(g) && <Check size={12} className="text-gray-950" strokeWidth={4} />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter truncate">{g}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex gap-4 pt-4 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="text-gray-500 font-bold px-4 py-3 hover:text-gray-300 min-h-[44px]">Abbrechen</button>
        <button type="submit" className="flex-1 bg-orange-500 text-gray-950 font-black py-4 rounded-xl shadow-lg active:scale-[0.99] transition-all min-h-[48px]">Umfrage speichern</button>
      </div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onVote, onStatusChange, isArchived, onEdit, onDelete, onPresent, onMoveUp, onMoveDown, isEditing, onSaveEdit, onCancelEdit, users }) {
  const [selected, setSelected] = useState([]);
  const [voting,   setVoting]   = useState(false);
  const [activePlayerUrl, setActivePlayerUrl] = useState(null);

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
    } else if ((survey.maxAnswers || 1) === 1) {
      setSelected([id]);
    } else if (selected.length < (survey.maxAnswers || 1)) {
      setSelected([...selected, id]);
    }
  };

  const getEmbedUrl = (rawUrl) => {
    if (!rawUrl) return null;
    let videoId = '';
    if (rawUrl.includes('youtu.be/')) {
      videoId = rawUrl.split('youtu.be/')[1]?.split('?')[0];
    } else if (rawUrl.includes('watch?v=')) {
      videoId = rawUrl.split('watch?v=')[1]?.split('&')[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
  };

  const isPublished = survey.status === 'published' || isArchived;

  return (
    <div className={`bg-gray-900 border rounded-3xl overflow-hidden shadow-xl transition-all ${survey.status === 'active' && !isArchived ? 'border-orange-500/50' : 'border-gray-800 opacity-80'}`}>
      <div className="p-5 sm:p-6 border-b border-gray-800 bg-gray-950/20 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase text-orange-500 block mb-1">
            {isArchived ? 'Abstimmung Beendet' : survey.status} • {(survey.maxAnswers || 1) > 1 ? `Max. ${survey.maxAnswers} Stimmen` : '1 Stimme'} • {survey.majorityType === 'two_thirds' ? '⅔ Mehrheit' : survey.majorityType === 'simple' ? 'Einfache Mehrheit' : ''} {survey.isAnonymous ? '• 🔒 Anonym' : ''}
          </span>
          <h4 className="text-lg sm:text-xl font-bold text-white leading-tight">{survey.title}</h4>
        </div>
        <div className="flex flex-col sm:items-end gap-3 shrink-0">
          <div className="text-[10px] font-bold text-gray-400 bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800 flex items-center w-fit shadow-inner">
            <Users size={12} className="mr-1.5 text-orange-500" />
            {survey.votedUsers?.length || 0} / {eligibleUsersCount} haben abgestimmt
          </div>
          {currentUser.role === 'admin' && !isArchived && (
            <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap">
              {survey.status === 'draft'  && <button onClick={() => onStatusChange('active')}    className="bg-green-500 text-gray-950 text-[10px] font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-all min-h-[38px]">Starten</button>}
              {survey.status === 'active' && <button onClick={() => onStatusChange('published')} className="bg-orange-500 text-gray-950 text-[10px] font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-all min-h-[38px]">Publizieren</button>}
              <button onClick={() => onPresent(survey)} className="p-2.5 bg-gray-800 text-gray-400 hover:text-orange-500 rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center" title="Präsentationsmodus"><Maximize2 size={16}/></button>
              <button onClick={onMoveUp} disabled={!onMoveUp} className="p-2.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors disabled:opacity-30 min-h-[38px] min-w-[38px] flex items-center justify-center" title="Nach oben"><ArrowUp size={16}/></button>
              <button onClick={onMoveDown} disabled={!onMoveDown} className="p-2.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors disabled:opacity-30 min-h-[38px] min-w-[38px] flex items-center justify-center" title="Nach unten"><ArrowDown size={16}/></button>
              <button onClick={onEdit}   className="p-2.5 bg-gray-800 text-gray-400 hover:text-white rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"><Edit2 size={16}/></button>
              <button onClick={onDelete} className="p-2.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"><Trash2 size={16}/></button>
            </div>
          )}
        </div>
      </div>
      <div className="p-5 sm:p-6 space-y-3">
        {activePlayerUrl && (
          <div className="bg-gray-950 p-3 rounded-2xl border border-orange-500/40 relative animate-in fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase text-orange-400 flex items-center gap-1.5"><Play size={14}/> Track Live-Anhören</span>
              <button onClick={() => setActivePlayerUrl(null)} className="text-gray-400 hover:text-white p-1"><X size={16}/></button>
            </div>
            <div className="relative w-full pt-[56.25%] rounded-xl overflow-hidden bg-black">
              <iframe
                src={getEmbedUrl(activePlayerUrl)}
                title="YouTube Player"
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {isPublished && survey.options.map(o => {
          const pct = totalVotes === 0 ? 0 : Math.round(((o.votes || 0) / totalVotes) * 100);
          return (
            <div key={o.id} className="relative h-14 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden flex items-center px-4">
              <div className="absolute left-0 top-0 h-full bg-orange-500/10 transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} />
              <div className="flex-1 font-bold text-white z-10 flex items-center gap-3">
                <span className="truncate">{o.text}</span>
                {o.youtubeUrl && (
                  <button
                    type="button"
                    onClick={() => setActivePlayerUrl(activePlayerUrl === o.youtubeUrl ? null : o.youtubeUrl)}
                    className="text-orange-400 hover:text-orange-300 bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20 text-xs flex items-center gap-1.5 transition-all"
                  >
                    <Play size={12}/> Anhören
                  </button>
                )}
              </div>
              <div className="text-right z-10">
                <p className="text-sm font-black">{o.votes || 0}</p>
                <p className="text-[9px] text-gray-600 font-bold tracking-tighter uppercase">Stimmen</p>
              </div>
            </div>
          );
        })}
        {(!isPublished && (!hasVoted || survey.status === 'active')) ? (
          <div className="space-y-3">
            {!hasVoted && survey.options.map(o => (
              <div key={o.id} onClick={() => toggle(o.id)} className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between min-h-[52px] ${selected.includes(o.id) ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-bold text-sm sm:text-base truncate">{o.text}</span>
                  {o.youtubeUrl && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActivePlayerUrl(activePlayerUrl === o.youtubeUrl ? null : o.youtubeUrl); }}
                      className="text-orange-400 hover:text-orange-300 bg-orange-500/10 px-2.5 py-1 rounded-lg border border-orange-500/20 text-xs flex items-center gap-1.5 shrink-0 transition-all"
                    >
                      <Play size={12}/> Anhören
                    </button>
                  )}
                </div>
                <div className={`w-6 h-6 rounded-lg border-2 ${selected.includes(o.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'} flex items-center justify-center transition-all shrink-0 ml-3`}>
                  {selected.includes(o.id) && <Check size={16} strokeWidth={4} className="text-gray-950" />}
                </div>
              </div>
            ))}
            {!hasVoted && (
              <button
                disabled={selected.length === 0 || voting}
                onClick={async () => { setVoting(true); await onVote(selected); setVoting(false); }}
                className="w-full mt-3 bg-orange-500 text-gray-950 font-black py-4 rounded-2xl shadow-lg transition-all active:scale-95 disabled:opacity-30 min-h-[48px]"
              >
                {voting ? 'Wird gesendet...' : 'Abstimmung senden'}
              </button>
            )}
          </div>
        ) : null}
        {hasVoted && !isPublished && (
          <div className="text-center py-8 space-y-2">
            <p className="text-green-500 font-black text-lg">✓ Stimme erfasst</p>
            <p className="text-gray-500 text-sm">Die Resultate werden erst nach der offiziellen Veröffentlichung durch den Vorstand angezeigt.</p>
          </div>
        )}
      </div>
      {isEditing && (
        <div className="border-t border-gray-800 p-4 bg-gray-950/50">
          <CreateSurveyForm
            initialData={survey}
            onSubmit={onSaveEdit}
            onCancel={onCancelEdit}
            inline
          />
        </div>
      )}
    </div>
  );
}

function MembersView({ users, notify, askConfirm }) {
  const [showAdd,     setShowAdd]     = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [filterGroup, setFilterGroup] = useState('Alle');
  const [searchTerm,  setSearchTerm]  = useState('');

  const filteredUsers = useMemo(() => {
    let result = users;
    if (filterGroup === 'Keine Gruppe') result = result.filter(u => !u.groups || u.groups.length === 0);
    else if (filterGroup !== 'Alle') result = result.filter(u => u.groups?.includes(filterGroup));
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(u =>
        u.firstName?.toLowerCase().includes(term) ||
        u.lastName?.toLowerCase().includes(term) ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(term)
      );
    }
    return result;
  }, [users, filterGroup, searchTerm]);

  const saveMember = async (m) => {
    const id = m.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), { ...m, id });
    setShowAdd(false);
    setEditingUser(null);
    notify("Mitglied gespeichert.", "success");
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
        const parts = line.split(/[,;]/);
        if (parts.length >= 2) {
          const firstName = sanitizeName(parts[0]);
          const lastName  = sanitizeName(parts[1]);
          if (firstName && lastName && firstName.toLowerCase() !== 'vorname') {
            const alreadyExists = users.some(
              u => u.firstName.toLowerCase() === firstName.toLowerCase() &&
                   u.lastName.toLowerCase()  === lastName.toLowerCase()
            );
            if (!alreadyExists) {
              const id = `${Date.now()}_${i}`;
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), {
                id, firstName, lastName, role: 'member', groups: []
              });
              count++;
            }
          }
        }
      }
      notify(`${count} Mitglieder wurden erfolgreich importiert.`, "success");
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Mitglieder</h2>
          <p className="text-gray-500 text-sm mt-1">Verwalte Rollen und Gruppenberechtigungen</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold px-4 py-3.5 rounded-2xl flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-lg min-h-[48px]" title="CSV Import (Format: Vorname;Nachname)">
            <UploadCloud size={20} /> <span className="hidden sm:inline">CSV Import</span>
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </label>
          <button onClick={() => setShowAdd(!showAdd)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/10 min-h-[48px]">
            {showAdd ? 'Abbrechen' : <><UserPlus size={20} /> Neu</>}
          </button>
        </div>
      </div>

      {showAdd && <MemberForm onSubmit={saveMember} onCancel={() => setShowAdd(false)} />}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <input
          type="text"
          placeholder="Mitglied suchen..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3.5 pl-11 pr-10 text-white focus:border-orange-500 outline-none transition-all min-h-[48px]"
        />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {['Alle', ...GROUPS, 'Keine Gruppe'].map(g => (
          <button
            key={g}
            onClick={() => setFilterGroup(g)}
            className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 min-h-[40px] flex items-center ${
              filterGroup === g
                ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/20'
                : 'bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700'
            }`}
          >
            {g} {g !== 'Alle' ? `(${g === 'Keine Gruppe' ? users.filter(u => !u.groups || u.groups.length === 0).length : users.filter(u => u.groups?.includes(g)).length})` : `(${users.length})`}
          </button>
        ))}
      </div>

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
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8">
                    <div className="space-y-3 animate-pulse">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-10 bg-gray-800 rounded-xl w-full"></div>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <React.Fragment key={u.id}>
                    <tr className="hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <p className="font-bold text-white text-base sm:text-lg">{u.firstName} {u.lastName}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {u.groups?.map(g => <span key={g} className="text-[8px] bg-gray-950 border border-gray-800 px-2 py-0.5 rounded text-gray-500 uppercase font-black">{g}</span>)}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-md ${u.role === 'admin' ? 'bg-orange-500/10 text-orange-500' : 'bg-gray-800 text-gray-400'}`}>
                          {u.role === 'admin' ? 'Admin' : 'Mitglied'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {u.groups?.includes('Vorstand') ? (
                          u.password ? <span className="text-green-500 flex items-center gap-1 text-[10px] font-black"><Lock size={12}/> AKTIV</span> : <span className="text-orange-500 flex items-center gap-1 text-[10px] font-black animate-pulse"><Unlock size={12}/> OFFEN</span>
                        ) : <span className="text-gray-700 text-[10px] font-black uppercase">—</span>}
                      </td>
                      <td className="px-6 py-5 text-right whitespace-nowrap">
                        <button onClick={() => setEditingUser(editingUser?.id === u.id ? null : u)} className={`transition-colors p-3 rounded-xl active:scale-90 mr-1 min-h-[44px] min-w-[44px] inline-flex items-center justify-center ${editingUser?.id === u.id ? 'text-orange-500 bg-orange-500/10' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-500/10'}`}><Edit2 size={18}/></button>
                        <button
                          onClick={() =>
                            askConfirm(
                              'Mitglied entfernen?',
                              `Soll ${u.firstName} ${u.lastName} wirklich entfernt werden?`,
                              async () => {
                                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id));
                                notify("Mitglied entfernt.", "info");
                              },
                              'Entfernen'
                            )
                          }
                          className="text-gray-400 hover:text-red-500 transition-colors p-3 hover:bg-red-500/10 rounded-xl active:scale-90 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Trash2 size={18}/>
                        </button>
                      </td>
                    </tr>
                    {editingUser?.id === u.id && (
                      <tr>
                        <td colSpan={4} className="px-4 pb-4 bg-gray-900">
                          <MemberForm
                            initialData={editingUser}
                            onSubmit={async (m) => { await saveMember(m); }}
                            onCancel={() => setEditingUser(null)}
                            inline
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MemberForm({ onSubmit, onCancel, initialData, inline = false }) {
  const [form, setForm] = useState(initialData || { firstName: '', lastName: '', role: 'member', groups: [] });
  const toggleGroup = g => setForm(f => ({ ...f, groups: f.groups.includes(g) ? f.groups.filter(x => x !== g) : [...f.groups, g] }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className={`space-y-6 animate-in slide-in-from-top-2 duration-200 ${inline ? "p-4 pt-2" : "bg-gray-900 border border-gray-800 p-6 sm:p-8 rounded-3xl mb-8 shadow-2xl"}`}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Vorname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all min-h-[48px]" placeholder="z.B. Max" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Nachname</label>
          <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all min-h-[48px]" placeholder="z.B. Muster" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Rolle</label>
          <select required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all min-h-[48px]" value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
            <option value="member" className="bg-gray-900">Mitglied</option>
            <option value="admin" className="bg-gray-900">Administrator</option>
          </select>
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-[10px] font-black text-gray-500 uppercase ml-2">Gruppen-Berechtigungen</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {GROUPS.map(g => (
            <label key={g} className={`flex items-center gap-2 p-3.5 rounded-xl border-2 cursor-pointer transition-all min-h-[48px] ${form.groups.includes(g) ? 'bg-orange-500/10 border-orange-500 text-white shadow-lg' : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <input type="checkbox" className="hidden" checked={form.groups.includes(g)} onChange={() => toggleGroup(g)} />
              <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${form.groups.includes(g) ? 'bg-orange-500 border-orange-500' : 'border-gray-800'}`}>
                {form.groups.includes(g) && <Check size={12} className="text-gray-950" strokeWidth={4} />}
              </div>
              <span className="text-[10px] font-black uppercase tracking-tighter truncate">{g}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-4 pt-6 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white font-bold transition-colors min-h-[44px]">Abbrechen</button>
        <button type="submit" className="bg-orange-500 text-gray-950 font-black px-8 py-3.5 rounded-2xl shadow-lg active:scale-95 transition-all min-h-[48px]">Mitglied speichern</button>
      </div>
    </form>
  );
}

function FilesView({ folders, files, currentUser, notify, askConfirm }) {
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [showNewFolder,  setShowNewFolder]  = useState(false);
  const [folderName,     setFolderName]     = useState('');
  const [uploading,      setUploading]      = useState({});
  const [dragOver,       setDragOver]       = useState(false);
  const [fileSearch,     setFileSearch]     = useState('');
  const [previewDoc,     setPreviewDoc]     = useState(null);

  const folderFiles = useMemo(() =>
    selectedFolder ? files.filter(f => f.folderId === selectedFolder.id) : [],
    [files, selectedFolder]
  );

  const globalMatchedFiles = useMemo(() => {
    if (!fileSearch.trim()) return [];
    const term = fileSearch.toLowerCase();
    return files.filter(f => f.name?.toLowerCase().includes(term));
  }, [files, fileSearch]);

  const createFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    const id = Date.now().toString();
    const newFolder = {
      id, name: folderName.trim(), createdAt: new Date().toISOString(), createdBy: currentUser.id
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'folders', id), newFolder);
    setFolderName('');
    setShowNewFolder(false);
    setSelectedFolder(newFolder);
    notify(`Ordner "${newFolder.name}" erstellt.`, "success");
  };

  const deleteFolder = (folder) => {
    askConfirm(
      'Ordner löschen?',
      `Ordner "${folder.name}" und alle enthaltenen Dateien wirklich löschen?`,
      async () => {
        const folderFilesList = files.filter(f => f.folderId === folder.id);
        for (const f of folderFilesList) {
          if (f.storagePath) {
            try { await deleteObject(ref(storage, f.storagePath)); } catch(e) {}
          }
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', f.id));
        }
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'folders', folder.id));
        if (selectedFolder?.id === folder.id) setSelectedFolder(null);
        notify(`Ordner "${folder.name}" gelöscht.`, "info");
      },
      'Ordner löschen'
    );
  };

  const handleUpload = (fileList) => {
    if (!selectedFolder || !fileList) return;
    Array.from(fileList).forEach(file => {
      const uploadId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
      const storagePath = `artifacts/${appId}/public/files/${selectedFolder.id}/${Date.now()}_${file.name}`;
      setUploading(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 10 } }));

      const saveFallbackToFirestore = async () => {
        try {
          if (file.size > 750 * 1024) {
            notify(`"${file.name}" ist grösser als 750 KB.`, "error");
            setUploading(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
            return;
          }
          const dataUrl = await readFileAsDataURL(file);
          const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', fileId), {
            id: fileId,
            name: file.name,
            url: dataUrl,
            storagePath: null,
            folderId: selectedFolder.id,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString(),
            uploadedBy: currentUser.id
          });
          notify(`"${file.name}" in Dateiablage gespeichert.`, "success");
        } catch (err) {
          console.error(err);
          notify(`Fehler beim Speichern von "${file.name}".`, "error");
        } finally {
          setUploading(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
        }
      };

      try {
        const storageRef = ref(storage, storagePath);
        const task = uploadBytesResumable(storageRef, file);
        task.on('state_changed',
          snap => setUploading(prev => ({
            ...prev,
            [uploadId]: { name: file.name, progress: Math.round((snap.bytesTransferred / snap.totalBytes) * 100) || 20 }
          })),
          async () => {
            await saveFallbackToFirestore();
          },
          async () => {
            try {
              const url = await getDownloadURL(task.snapshot.ref);
              const fileId = Date.now().toString() + Math.random().toString(36).substr(2, 4);
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', fileId), {
                id: fileId, name: file.name, url, storagePath, folderId: selectedFolder.id,
                size: file.size, type: file.type, uploadedAt: new Date().toISOString(), uploadedBy: currentUser.id
              });
              notify(`"${file.name}" hochgeladen.`, "success");
              setUploading(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
            } catch (_) {
              await saveFallbackToFirestore();
            }
          }
        );
      } catch (_) {
        saveFallbackToFirestore();
      }
    });
  };

  const deleteFile = (f) => {
    askConfirm(
      'Datei löschen?',
      `Möchtest du die Datei "${f.name}" wirklich löschen?`,
      async () => {
        if (f.storagePath) {
          try { await deleteObject(ref(storage, f.storagePath)); } catch(e) {}
        }
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', f.id));
        notify(`Datei "${f.name}" gelöscht.`, "info");
      },
      'Löschen'
    );
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (type) => {
    if (type?.includes('pdf')) return '📄';
    if (type?.includes('image')) return '🖼️';
    if (type?.includes('word') || type?.includes('document')) return '📝';
    if (type?.includes('excel') || type?.includes('sheet')) return '📊';
    return '📁';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Dateiablage</h2>
          <p className="text-gray-500 text-sm mt-1">Dokumente, Reglemente und Vorlagen geordnet verwalten</p>
        </div>
        <button onClick={() => setShowNewFolder(!showNewFolder)} className="bg-orange-500 text-gray-950 font-bold px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 w-full sm:w-auto min-h-[48px]">
          <FolderPlus size={20} /> Neuer Ordner
        </button>
      </div>

      {showNewFolder && (
        <form onSubmit={createFolder} className="flex flex-col sm:flex-row gap-3 bg-gray-900 border border-gray-800 p-4 rounded-2xl animate-in slide-in-from-top-2">
          <input
            autoFocus required value={folderName} onChange={e => setFolderName(e.target.value)}
            placeholder="Ordnername eingeben..."
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[48px]"
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 sm:flex-none px-6 py-3.5 bg-orange-500 text-gray-950 font-black rounded-xl active:scale-95 transition-all min-h-[48px] flex items-center justify-center"><Save size={18}/></button>
            <button type="button" onClick={() => setShowNewFolder(false)} className="px-5 py-3.5 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-all min-h-[48px] flex items-center justify-center"><X size={18}/></button>
          </div>
        </form>
      )}

      {files.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={fileSearch}
            onChange={e => setFileSearch(e.target.value)}
            placeholder="In allen Ordnern nach Dateinamen suchen..."
            className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3.5 pl-11 pr-10 text-white focus:border-orange-500 outline-none transition-all text-sm min-h-[48px]"
          />
          {fileSearch && (
            <button onClick={() => setFileSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {fileSearch.trim() && (
        <div className="bg-gray-900 border border-orange-500/30 rounded-3xl p-4 space-y-2 animate-in fade-in">
          <p className="text-xs font-black uppercase tracking-widest text-orange-500 px-2 mb-2">
            Suchergebnisse ({globalMatchedFiles.length})
          </p>
          {globalMatchedFiles.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-4">Keine Datei mit «{fileSearch}» gefunden.</p>
          ) : (
            globalMatchedFiles.map(f => {
              const parentFolder = folders.find(fl => fl.id === f.folderId);
              return (
                <div key={f.id} className="flex items-center gap-3 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5">
                  <span className="text-xl shrink-0">{getFileIcon(f.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">{f.name}</p>
                    <p className="text-[10px] text-gray-500">
                      Ordner: <span className="text-orange-400 font-bold">{parentFolder?.name || 'Unbekannt'}</span> • {formatSize(f.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(f)}
                    className="p-3 text-gray-400 hover:text-orange-500 bg-gray-900 rounded-xl transition-all border border-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Vorschau"
                  >
                    <Eye size={16}/>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerFileDownload(f.url, f.name)}
                    className="p-3 text-gray-400 hover:text-orange-500 bg-gray-900 rounded-xl transition-all border border-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Herunterladen"
                  >
                    <Download size={16}/>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {folders.length === 0 ? (
          <div className="col-span-full space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-gray-900 border border-gray-800 p-4 rounded-2xl animate-pulse">
                <div className="h-8 w-8 bg-gray-800 rounded-lg mb-2"></div>
                <div className="h-4 bg-gray-800 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : (
          folders.map(folder => (
            <div
              key={folder.id}
              onClick={() => setSelectedFolder(selectedFolder?.id === folder.id ? null : folder)}
              className={`bg-gray-900 border rounded-2xl p-4 cursor-pointer transition-all active:scale-95 group relative ${selectedFolder?.id === folder.id ? 'border-orange-500 bg-orange-500/5 shadow-lg shadow-orange-500/5' : 'border-gray-800 hover:border-gray-700'}`}
            >
              <Folder size={32} className={`mb-2 ${selectedFolder?.id === folder.id ? 'text-orange-500' : 'text-gray-600 group-hover:text-gray-400'}`} />
              <p className="font-bold text-white text-sm truncate">{folder.name}</p>
              <p className="text-[10px] text-gray-600 mt-1">{files.filter(f => f.folderId === folder.id).length} Dateien</p>
              <button
                onClick={e => { e.stopPropagation(); deleteFolder(folder); }}
                className="absolute top-2 right-2 p-2.5 text-gray-700 hover:text-red-500 opacity-0 group-hover:opacity-100 bg-gray-950 rounded-lg transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
              ><Trash2 size={14}/></button>
            </div>
          ))
        )}
      </div>

      {selectedFolder && (
        <div className="bg-gray-900 border border-orange-500/30 rounded-3xl overflow-hidden animate-in slide-in-from-top-2 duration-300 shadow-2xl">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-orange-500/5">
            <div className="flex items-center gap-3 min-w-0">
              <Folder size={20} className="text-orange-500 shrink-0"/>
              <h3 className="font-black text-white text-lg truncate">{selectedFolder.name}</h3>
              <span className="text-[10px] text-gray-500 font-bold shrink-0">{folderFiles.length} Dateien</span>
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
            className={`mx-4 mt-4 border-2 border-dashed rounded-2xl p-6 text-center transition-all ${dragOver ? 'border-orange-500 bg-orange-500/10' : 'border-gray-800 hover:border-gray-700'}`}
          >
            <UploadCloud size={28} className="mx-auto text-orange-500/70 mb-2"/>
            <p className="text-gray-400 text-sm font-bold">Dateien per Drag & Drop hier ablegen oder</p>
            <label className="mt-2 inline-block cursor-pointer text-orange-500 font-black text-sm hover:underline py-1">
              Dateien vom Gerät auswählen
              <input type="file" multiple className="hidden" onChange={e => { handleUpload(e.target.files); e.target.value = ''; }} />
            </label>
          </div>

          {Object.entries(uploading).map(([id, u]) => (
            <div key={id} className="mx-4 mt-2 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs font-bold text-white truncate">{u.name}</p>
                <div className="w-full h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${u.progress}%` }}/>
                </div>
              </div>
              <span className="text-[11px] text-orange-500 font-bold shrink-0">{u.progress}%</span>
            </div>
          ))}

          <div className="p-4 space-y-2">
            {folderFiles.length === 0 && Object.keys(uploading).length === 0 && (
              <p className="text-center text-gray-700 text-xs py-6 font-bold uppercase tracking-widest">Noch keine Dateien in diesem Ordner</p>
            )}
            {folderFiles.map(f => (
              <div key={f.id} className="flex items-center gap-3 bg-gray-950 border border-gray-800 hover:border-gray-700 rounded-xl px-4 py-3.5 group transition-all">
                <span className="text-xl shrink-0">{getFileIcon(f.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-500">{formatSize(f.size)} • {new Date(f.uploadedAt).toLocaleDateString('de-CH')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(f)}
                  className="p-3 text-gray-400 hover:text-orange-500 bg-gray-900 rounded-xl transition-all shrink-0 border border-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Vorschau öffnen"
                >
                  <Eye size={16}/>
                </button>
                <button
                  type="button"
                  onClick={() => triggerFileDownload(f.url, f.name)}
                  className="p-3 text-gray-400 hover:text-orange-500 bg-gray-900 rounded-xl transition-all shrink-0 border border-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Herunterladen"
                >
                  <Download size={16}/>
                </button>
                <button
                  type="button"
                  onClick={() => deleteFile(f)}
                  className="p-3 text-gray-500 hover:text-red-500 bg-gray-900 rounded-xl transition-all shrink-0 border border-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Löschen"
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewDoc && (
        <FilePreviewModal docItem={previewDoc} onClose={() => setPreviewDoc(null)} />
      )}
    </div>
  );
}

function CalendarView({ calItems, currentUser, notify, askConfirm }) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [viewMonth,    setViewMonth]    = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const saveItem = async (item) => {
    const id = item.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', id), { ...item, id });
    setShowAdd(false);
    setEditing(null);
    notify("Termin erfolgreich gespeichert.", "success");
  };

  const deleteItem = (id) => {
    askConfirm(
      'Termin löschen?',
      'Möchtest du diesen Kalendereintrag wirklich löschen?',
      async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', id));
        notify("Termin gelöscht.", "info");
      },
      'Löschen'
    );
  };

  const year  = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const itemsByDate = useMemo(() => {
    const map = {};
    calItems.forEach(item => {
      const key = item.date?.slice(0, 10);
      if (key) { if (!map[key]) map[key] = []; map[key].push(item); }
    });
    return map;
  }, [calItems]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];

  const upcomingItems = useMemo(() =>
    [...calItems]
      .filter(i => i.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8),
    [calItems, todayStr]
  );

  const selectedDayItems = selectedDate ? (itemsByDate[selectedDate] || []) : [];

  const handleICSExport = () => {
    downloadICSFile(calItems, 'ruesssuuger_kalender.ics');
    notify("Kalender als .ics-Datei heruntergeladen! Du kannst sie nun in Apple Kalender oder Google Calendar öffnen.", "success");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-white">Vereinskalender</h2>
          <p className="text-gray-500 text-sm mt-1">ICS-Export & Live-Terminsynchronisation</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            onClick={handleICSExport}
            className="bg-orange-500 hover:bg-orange-400 text-gray-950 font-black px-5 py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 min-h-[48px]"
            title="Alle Termine als .ics-Datei exportieren"
          >
            <CalendarDays size={18} /> Kalender exportieren (.ics)
          </button>
          <button
            onClick={() => { setEditing(null); setShowAdd(!showAdd); }}
            className="bg-gray-900 hover:bg-gray-800 text-white border border-gray-800 font-bold px-6 py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[48px]"
          >
            <Plus size={20} /> Neuer Termin
          </button>
        </div>
      </div>

      {(showAdd || editing) && (
        <CalendarItemForm
          initialData={editing || (selectedDate ? { title: '', date: selectedDate, time: '', location: '', description: '' } : null)}
          onSave={saveItem}
          onCancel={() => { setShowAdd(false); setEditing(null); }}
        />
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950/40">
            <button onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="p-3 bg-gray-800 rounded-xl hover:text-orange-500 transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ChevronRight className="rotate-180" size={18}/>
            </button>
            <div className="flex items-center gap-3">
              <h3 className="font-black text-white text-base sm:text-lg">{monthNames[month]} {year}</h3>
              <button
                onClick={() => setViewMonth(new Date())}
                className="text-[10px] font-black uppercase px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white min-h-[36px] flex items-center"
              >
                Heute
              </button>
            </div>
            <button onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="p-3 bg-gray-800 rounded-xl hover:text-orange-500 transition-all active:scale-90 min-h-[44px] min-w-[44px] flex items-center justify-center">
              <ChevronRight size={18}/>
            </button>
          </div>

          <div className="p-3 sm:p-4">
            <div className="grid grid-cols-7 mb-2">
              {dayNames.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-gray-600 uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`}/>)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayItems = itemsByDate[dateStr] || [];
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                return (
                  <div
                    key={day}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`min-h-[64px] sm:min-h-[72px] rounded-xl p-1.5 border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-orange-500 bg-orange-500/15'
                        : isToday
                        ? 'border-orange-500/60 bg-orange-500/5'
                        : 'border-gray-800/40 hover:border-gray-700 bg-gray-950/30'
                    }`}
                  >
                    <p className={`text-xs font-black text-center mb-1 ${isToday || isSelected ? 'text-orange-500' : 'text-gray-400'}`}>{day}</p>
                    {dayItems.slice(0, 2).map(item => (
                      <div
                        key={item.id}
                        onClick={(e) => { e.stopPropagation(); setEditing(item); }}
                        className="text-[9px] font-bold truncate px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 mb-0.5"
                      >
                        {item.time ? `${item.time} ` : ''}{item.title}
                      </div>
                    ))}
                    {dayItems.length > 2 && <p className="text-[9px] text-orange-400 font-bold text-center">+{dayItems.length - 2}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDate && (
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-orange-500 uppercase">
                  Ausgewählter Tag: {new Date(selectedDate).toLocaleDateString('de-CH', { dateStyle: 'full' })}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedDayItems.length === 0 ? 'Keine Termine an diesem Tag' : `${selectedDayItems.length} Termin(e) eingetragen`}
                </p>
              </div>
              <button
                onClick={() => { setEditing(null); setShowAdd(true); }}
                className="px-4 py-2.5 bg-orange-500 text-gray-950 font-black rounded-xl text-xs active:scale-95 transition-all min-h-[40px]"
              >
                + Termin an diesem Tag
              </button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-black text-white text-lg flex items-center gap-2">
            <Clock size={18} className="text-orange-500"/> Kommende Termine
          </h3>
          {calItems.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse">
                  <div className="h-4 bg-gray-800 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-800 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : upcomingItems.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-6 text-center">
              <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">Keine kommenden Termine</p>
            </div>
          ) : upcomingItems.map(item => (
            <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all group shadow-lg">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-black text-white truncate">{item.title}</p>
                  <p className="text-[11px] text-orange-500 font-bold mt-1 flex items-center gap-1">
                    <CalendarDays size={12}/> {new Date(item.date).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {item.time && <><Clock size={12} className="ml-2"/>{item.time}</>}
                  </p>
                  {item.location && <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><MapPin size={12} className="text-gray-500"/>{item.location}</p>}
                  {item.description && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.description}</p>}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      downloadICSFile(item, `${item.title.replace(/\s+/g, '_')}.ics`);
                      notify(`"${item.title}" als .ics heruntergeladen.`, "success");
                    }}
                    title="Diesen Termin als .ics herunterladen"
                    className="p-3 bg-gray-950 border border-gray-800 text-orange-500 hover:bg-orange-500 hover:text-gray-950 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Download size={14}/>
                  </button>
                  <button
                    onClick={() => setEditing(item)}
                    title="Bearbeiten"
                    className="p-3 bg-gray-950 border border-gray-800 text-gray-400 hover:text-white rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Edit2 size={14}/>
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    title="Löschen"
                    className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarItemForm({ initialData, onSave, onCancel }) {
  const [form, setForm] = useState(initialData || {
    title: '', date: new Date().toISOString().slice(0, 10), time: '', location: '', description: ''
  });

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="bg-gray-900 border border-gray-800 p-6 rounded-3xl space-y-4 animate-in slide-in-from-top-2 duration-200 shadow-2xl">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Titel</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="z.B. Vorstandssitzung" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[48px]"/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Datum</label>
          <input required type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[48px]"/>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Uhrzeit (optional)</label>
          <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[48px]"/>
        </div>
        <div className="md:col-span-2 space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Ort (optional)</label>
          <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="z.B. Vereinslokal Ämme" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none min-h-[48px]"/>
        </div>
        <div className="md:col-span-2 space-y-1">
          <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Beschreibung (optional)</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Weitere Details..." rows={3} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3.5 text-white focus:border-orange-500 outline-none resize-none"/>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="px-6 py-3.5 text-gray-500 hover:text-white font-bold transition-colors min-h-[48px]">Abbrechen</button>
        <button type="submit" className="px-8 py-3.5 bg-orange-500 text-gray-950 font-black rounded-xl active:scale-95 transition-all shadow-lg flex items-center gap-2 min-h-[48px]"><Save size={18}/> Speichern</button>
      </div>
    </form>
  );
}
