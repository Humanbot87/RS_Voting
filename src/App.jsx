import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, UserPlus, Eye, Check, Database, ShieldAlert, Edit2,
  Youtube, Lock, Unlock, ClipboardList, UserCheck, Paperclip, Save, X, RefreshCw,
  UploadCloud, Search, Download, ArrowUp, ArrowDown, Maximize2, Minimize2,
  Folder, FolderPlus, FileText, File, CalendarDays, MapPin, Clock,
  Printer, CheckCircle2, AlertTriangle, Info, Filter, Sparkles, Share2, QrCode, Play,
  Zap, Lightbulb
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

const SCHMUDO_DATES = [
  { year: 2025, date: '2025-02-27T05:00:00' },
  { year: 2026, date: '2026-02-12T05:00:00' },
  { year: 2027, date: '2027-02-04T05:00:00' },
  { year: 2028, date: '2028-02-24T05:00:00' },
  { year: 2029, date: '2029-02-08T05:00:00' },
  { year: 2030, date: '2030-02-28T05:00:00' },
  { year: 2031, date: '2031-02-20T05:00:00' },
  { year: 2032, date: '2032-02-05T05:00:00' },
  { year: 2033, date: '2033-02-24T05:00:00' },
  { year: 2034, date: '2034-02-16T05:00:00' },
  { year: 2035, date: '2035-02-01T05:00:00' },
  { year: 2036, date: '2036-02-21T05:00:00' },
  { year: 2037, date: '2037-02-12T05:00:00' },
  { year: 2038, date: '2038-03-04T05:00:00' },
  { year: 2039, date: '2039-02-17T05:00:00' },
  { year: 2040, date: '2040-02-09T05:00:00' }
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

const ConfettiOverlay = ({ active }) => {
  if (!active) return null;
  const pieces = Array.from({ length: 36 });
  return (
    <div className="fixed inset-0 pointer-events-none z-[280] overflow-hidden">
      {pieces.map((_, idx) => {
        const left = (idx * 97) % 100;
        const delay = (idx % 9) * 0.08;
        const duration = 2.2 + (idx % 5) * 0.35;
        const colors = ['#f97316', '#fbbf24', '#ffffff', '#10b981', '#fb923c'];
        const bg = colors[idx % colors.length];
        return (
          <span
            key={idx}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              backgroundColor: bg,
            }}
            className="absolute -top-4 w-2.5 h-4 rounded-sm opacity-90 animate-bounce"
          />
        );
      })}
    </div>
  );
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
      localStorage.setItem('ruesssuuger_lastUserId', currentUser.id);
    }
    localStorage.removeItem('ruesssuuger_userId');
    localStorage.removeItem('ruesssuuger_sessionId');
    setCurrentUser(null);
    setActiveTab('events');
  };

  const isVorstand = useMemo(() => currentUser?.groups?.includes('Vorstand'), [currentUser]);

  const myOpenTodosCount = useMemo(() => {
    if (!currentUser || !isVorstand) return 0;
    const myFullName = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
    let count = 0;
    minutes.forEach(m => {
      if (m.id === '__live_session__' || !m.traktanden) return;
      Object.values(m.traktanden).forEach(pts => {
        (pts || []).forEach(p => {
          if (p.type === 'todo' && !p.done && (p.assignee === myFullName || p.assignee === 'Gesamtvorstand')) {
            count++;
          }
        });
      });
    });
    return count;
  }, [minutes, currentUser, isVorstand]);

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
    <div className="min-h-screen bg-gray-950 text-gray-200 selection:bg-orange-500 selection:text-white pb-24 sm:pb-0">
      <div className="fixed bottom-20 sm:bottom-5 right-5 z-[300] flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0 pointer-events-none">
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
            <nav className="hidden sm:flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
              <TabButton active={activeTab === 'events'}   onClick={() => setActiveTab('events')}   icon={<Calendar size={18} />}      label="Events" />
              {isVorstand && (
                <TabButton active={activeTab === 'minutes'}  onClick={() => setActiveTab('minutes')}  icon={<ClipboardList size={18} />} label="Protokolle" badge={myOpenTodosCount} />
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

            {/* Mobile Bottom Navigation Bar */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-[150] bg-gray-900/95 backdrop-blur-xl border-t border-gray-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
              <MobileTabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={20} />} label="Events" />
              {isVorstand && (
                <MobileTabButton active={activeTab === 'minutes'} onClick={() => setActiveTab('minutes')} icon={<ClipboardList size={20} />} label="Protokolle" badge={myOpenTodosCount} />
              )}
              {isVorstand && (
                <MobileTabButton active={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Folder size={20} />} label="Dateien" />
              )}
              {isVorstand && (
                <MobileTabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarDays size={20} />} label="Kalender" />
              )}
              {currentUser.role === 'admin' && (
                <>
                  <MobileTabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={20} />} label="Archiv" />
                  <MobileTabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />} label="Mitglieder" />
                </>
              )}
            </nav>

            <div className="animate-in fade-in duration-500">
              {activeTab === 'events'   && <EventsView events={events.filter(e => !e.isArchived)} calItems={calItems} currentUser={currentUser} users={users} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'minutes'  && isVorstand && <ProtocolView minutes={minutes} users={users} currentUser={currentUser} calItems={calItems} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'files'    && isVorstand && <FilesView folders={folders} files={files} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'calendar' && isVorstand && <CalendarView calItems={calItems} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'archive'  && <EventsView events={events.filter(e => e.isArchived)} calItems={calItems} currentUser={currentUser} isArchive users={users} notify={notify} askConfirm={askConfirm} />}
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

  const lastRememberedUser = useMemo(() => {
    const lastId = localStorage.getItem('ruesssuuger_lastUserId');
    if (!lastId) return null;
    return users.find(u => u.id === lastId) || null;
  }, [users]);

  const matchingSuggestions = useMemo(() => {
    const qFirst = firstName.trim().toLowerCase();
    const qLast  = lastName.trim().toLowerCase();
    if (qFirst.length < 2 && qLast.length < 2) return [];
    return users
      .filter(u => {
        const f = (u.firstName || '').toLowerCase();
        const l = (u.lastName || '').toLowerCase();
        if (qFirst && qLast) return f.startsWith(qFirst) && l.startsWith(qLast);
        if (qFirst) return f.startsWith(qFirst) || l.startsWith(qFirst);
        return l.startsWith(qLast);
      })
      .slice(0, 5);
  }, [users, firstName, lastName]);

  const finalizeLogin = (u) => {
    const newSession = generateSessionId();
    localStorage.setItem('ruesssuuger_sessionId', newSession);
    localStorage.setItem('ruesssuuger_userId',    u.id);
    localStorage.setItem('ruesssuuger_lastUserId', u.id);
    onLogin({ ...u, sessionId: newSession });
  };

  const proceedWithUser = (u) => {
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

  const handleNameSubmit = (e) => {
    e.preventDefault();
    const u = users.find(
      x => x.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
           x.lastName.trim().toLowerCase()  === lastName.trim().toLowerCase()
    );
    proceedWithUser(u);
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
                {lastRememberedUser && !firstName && !lastName && (
                  <button
                    type="button"
                    onClick={() => proceedWithUser(lastRememberedUser)}
                    className="w-full p-3.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-2xl flex items-center justify-between transition-all active:scale-95 group"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-xl bg-orange-500 text-gray-950 font-black flex items-center justify-center text-sm">
                        {lastRememberedUser.firstName?.[0]}{lastRememberedUser.lastName?.[0]}
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Schnell-Anmeldung</p>
                        <p className="text-sm font-black text-white">Als {lastRememberedUser.firstName} {lastRememberedUser.lastName} weiterfahren 👋</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-orange-500 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                )}

                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all text-base min-h-[44px]" placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} />
                <input required className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 text-white focus:border-orange-500 outline-none transition-all text-base min-h-[44px]" placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} />

                {matchingSuggestions.length > 0 && (
                  <div className="bg-gray-950 border border-gray-800 rounded-2xl p-2 space-y-1 animate-in fade-in">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-2.5 py-1">Vorschläge (Antippen zum Auswählen)</p>
                    {matchingSuggestions.map(sug => (
                      <button
                        key={sug.id}
                        type="button"
                        onClick={() => {
                          setFirstName(sug.firstName);
                          setLastName(sug.lastName);
                          proceedWithUser(sug);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl hover:bg-orange-500/15 text-left flex items-center justify-between transition-colors group"
                      >
                        <span className="text-sm font-bold text-white group-hover:text-orange-400">
                          {sug.firstName} {sug.lastName}
                        </span>
                        <span className="text-[10px] font-black uppercase text-gray-500 group-hover:text-orange-500">
                          Auswählen →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
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
  const [tasksViewMode,  setTasksViewMode]  = useState('kanban'); // 'list' | 'kanban'
  const [showKanbanBoard, setShowKanbanBoard] = useState(false);
  const [draggedTask,    setDraggedTask]    = useState(null);
  const [compactFactsOnly, setCompactFactsOnly] = useState(false);
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

  const { stats, openTasksList, allTodoTasksList } = useMemo(() => {
    let totalPoints = 0;
    let totalAttachments = 0;
    let openTodos = 0;
    let inProgressTodos = 0;
    let myOpenTodos = 0;
    const tasks = [];
    const allTodos = [];

    const validMinutes = minutes.filter(m => m.id !== '__live_session__');
    const sortedMins = [...validMinutes].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    sortedMins.forEach(m => {
      if (m.traktanden) {
        TRAKTANDEN.forEach(tName => {
          const list = m.traktanden[tName] || [];
          totalPoints += list.length;
          list.forEach(p => {
            if (p.docUrl) totalAttachments++;
            if (p.type === 'todo') {
              const status = p.done ? 'done' : (p.status === 'in_progress' ? 'in_progress' : 'open');
              const isMine = p.assignee === myFullName || p.assignee === 'Gesamtvorstand';
              const taskObj = {
                minuteId: m.id,
                minuteTitle: m.title,
                minuteDate: m.date,
                traktandum: tName,
                isMine,
                status,
                point: p
              };
              allTodos.push(taskObj);
              if (!p.done) {
                openTodos++;
                if (status === 'in_progress') inProgressTodos++;
                if (isMine) myOpenTodos++;
                tasks.push(taskObj);
              }
            }
          });
        });
      }
    });
    return {
      stats: { totalMinutes: validMinutes.length, totalPoints, totalAttachments, openTodos, inProgressTodos, myOpenTodos, totalTodos: allTodos.length },
      openTasksList: tasks,
      allTodoTasksList: allTodos
    };
  }, [minutes, myFullName]);

  const displayedTasks = useMemo(() => {
    if (onlyMyTasks) return openTasksList.filter(t => t.isMine);
    return openTasksList;
  }, [openTasksList, onlyMyTasks]);

  const displayedKanbanTasks = useMemo(() => {
    if (onlyMyTasks) return allTodoTasksList.filter(t => t.isMine);
    return allTodoTasksList;
  }, [allTodoTasksList, onlyMyTasks]);

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

  const updateTaskStatus = async (minute, traktandum, pointId, newStatus) => {
    if (!minute) return;
    const isDone = newStatus === 'done';
    const updatedList = (minute.traktanden?.[traktandum] || []).map(p =>
      p.id === pointId ? { ...p, status: newStatus, done: isDone } : p
    );
    const updatedMinute = {
      ...minute,
      traktanden: { ...minute.traktanden, [traktandum]: updatedList }
    };
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', minute.id), updatedMinute);
    const label = newStatus === 'done' ? 'Erledigt ✓' : newStatus === 'in_progress' ? 'In Arbeit ⚡' : 'Offen 📋';
    notify(`Pendenz verschoben nach «${label}».`, "success");
  };

  const toggleTaskDone = async (minute, traktandum, pointId) => {
    const targetPoint = (minute.traktanden?.[traktandum] || []).find(p => p.id === pointId);
    const nextDone = !targetPoint?.done;
    await updateTaskStatus(minute, traktandum, pointId, nextDone ? 'done' : 'open');
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
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={() => {
                const nextState = !showKanbanBoard;
                setShowKanbanBoard(nextState);
                if (nextState) setTasksViewMode('kanban');
              }}
              className={`font-black px-5 py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all border whitespace-nowrap min-h-[48px] ${
                showKanbanBoard || onlyOpenTasks || onlyMyTasks
                  ? 'bg-orange-500/15 border-orange-500 text-orange-400 shadow-lg shadow-orange-500/10'
                  : 'bg-gray-950 hover:bg-gray-800 border-gray-800 text-gray-300'
              }`}
            >
              <BarChart3 size={18} className="text-orange-500 rotate-90" />
              <span>Kanban-Board ({stats.openTodos})</span>
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="bg-orange-500 hover:bg-orange-400 text-gray-950 font-black px-6 py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-500/20 whitespace-nowrap min-h-[48px]"
            >
              <Plus size={20} strokeWidth={2.5} /> Neues Protokoll erfassen
            </button>
          </div>
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
                onClick={() => {
                  const next = !onlyOpenTasks;
                  setOnlyOpenTasks(next);
                  setOnlyMyTasks(false);
                  if (next) setShowKanbanBoard(true);
                }}
                className={`rounded-2xl p-3.5 sm:p-4 border cursor-pointer transition-all ${
                  onlyOpenTasks && !onlyMyTasks
                    ? 'bg-orange-500/15 border-orange-500'
                    : 'bg-gray-950/70 border-gray-800/80 hover:border-orange-500/40'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 flex items-center justify-between">
                  <span>Offene Pendenzen</span>
                  {onlyOpenTasks && !onlyMyTasks && <span className="text-[9px] bg-orange-500 text-gray-950 px-1.5 py-0.5 rounded font-black">Aktiv</span>}
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-xl sm:text-2xl font-black text-orange-500">{stats.openTodos}</p>
                  {stats.inProgressTodos > 0 && (
                    <span className="text-[10px] font-bold text-amber-400">({stats.inProgressTodos} in Arbeit)</span>
                  )}
                </div>
              </div>
              <div
                onClick={() => {
                  const next = !onlyMyTasks;
                  setOnlyMyTasks(next);
                  setOnlyOpenTasks(false);
                  if (next) setShowKanbanBoard(true);
                }}
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

      {(showKanbanBoard || onlyOpenTasks || onlyMyTasks) && stats.totalTodos > 0 && (
        <div className="bg-gray-900/90 border border-orange-500/30 rounded-3xl p-5 sm:p-6 space-y-5 animate-in fade-in shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Sparkles size={18} className="text-orange-500" />
              <h3 className="text-sm sm:text-base font-black uppercase tracking-widest text-white">
                {onlyMyTasks ? 'Meine Vorstands-Pendenzen' : 'Vorstands-Pendenzen Board'}
              </h3>
              <button
                onClick={() => setOnlyMyTasks(!onlyMyTasks)}
                className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border transition-all ${
                  onlyMyTasks
                    ? 'bg-amber-500 text-gray-950 border-amber-500'
                    : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
                }`}
              >
                {onlyMyTasks ? '✓ Nur Meine' : 'Alle zeigen / Nur Meine'}
              </button>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <div className="bg-gray-950 border border-gray-800 p-1 rounded-xl flex items-center">
                <button
                  type="button"
                  onClick={() => setTasksViewMode('kanban')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all ${
                    tasksViewMode === 'kanban' ? 'bg-orange-500 text-gray-950' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Kanban-Board
                </button>
                <button
                  type="button"
                  onClick={() => setTasksViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all ${
                    tasksViewMode === 'list' ? 'bg-orange-500 text-gray-950' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Liste
                </button>
              </div>
              <button
                onClick={() => {
                  setShowKanbanBoard(false);
                  setOnlyOpenTasks(false);
                  setOnlyMyTasks(false);
                }}
                className="p-2 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center"
                title="Board schliessen"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {tasksViewMode === 'kanban' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'open',        title: 'Offen',     badgeColor: 'bg-orange-500/15 text-orange-400 border-orange-500/30', borderAccent: 'border-orange-500/30' },
                { id: 'in_progress', title: 'In Arbeit', badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',   borderAccent: 'border-amber-500/30' },
                { id: 'done',        title: 'Erledigt',  badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', borderAccent: 'border-emerald-500/30' }
              ].map(col => {
                const colTasks = displayedKanbanTasks.filter(t => t.status === col.id);
                return (
                  <div
                    key={col.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (draggedTask && draggedTask.status !== col.id) {
                        const targetMin = minutes.find(m => m.id === draggedTask.minuteId);
                        if (targetMin) {
                          updateTaskStatus(targetMin, draggedTask.traktandum, draggedTask.point.id, col.id);
                        }
                      }
                      setDraggedTask(null);
                    }}
                    className={`bg-gray-950/90 border rounded-2xl p-3.5 flex flex-col min-h-[260px] transition-all ${
                      draggedTask && draggedTask.status !== col.id ? `border-dashed ${col.borderAccent} bg-gray-950` : 'border-gray-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3 px-1">
                      <span className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${col.id === 'done' ? 'bg-emerald-500' : col.id === 'in_progress' ? 'bg-amber-400 animate-pulse' : 'bg-orange-500'}`} />
                        {col.title}
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${col.badgeColor}`}>
                        {colTasks.length}
                      </span>
                    </div>

                    <div className="space-y-2.5 flex-1">
                      {colTasks.length === 0 ? (
                        <div className="h-32 border border-dashed border-gray-800/80 rounded-xl flex items-center justify-center text-[11px] text-gray-600 font-bold">
                          Keine Pendenzen in «{col.title}»
                        </div>
                      ) : (
                        colTasks.map(item => {
                          const targetMinute = minutes.find(x => x.id === item.minuteId);
                          const isOverdue = item.status !== 'done' && item.point.dueDate && item.point.dueDate < todayIso;
                          return (
                            <div
                              key={item.point.id}
                              draggable
                              onDragStart={() => setDraggedTask(item)}
                              onDragEnd={() => setDraggedTask(null)}
                              className={`bg-gray-900 border rounded-xl p-3.5 space-y-2.5 shadow-md cursor-grab active:cursor-grabbing transition-all hover:border-gray-700 ${
                                isOverdue ? 'border-red-500/50' : item.isMine && item.status !== 'done' ? 'border-orange-500/40' : 'border-gray-800'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-gray-950 text-orange-400 border border-gray-800">
                                  {item.traktandum}
                                </span>
                                {item.point.dueDate && (
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                    isOverdue ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-gray-950 text-gray-400 border-gray-800'
                                  }`}>
                                    Bis {new Date(item.point.dueDate).toLocaleDateString('de-CH')}
                                  </span>
                                )}
                              </div>

                              <p className={`text-xs sm:text-sm font-bold leading-snug break-words ${item.status === 'done' ? 'line-through text-gray-500' : 'text-white'}`}>
                                {item.point.text}
                              </p>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800/80">
                                <div className="min-w-0">
                                  {item.point.assignee ? (
                                    <span className="text-[10px] font-bold text-gray-300 bg-gray-950 px-2 py-0.5 rounded border border-gray-800 inline-block truncate max-w-[140px]">
                                      @{item.point.assignee}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-gray-600">Unzugewiesen</span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1">
                                  {col.id !== 'open' && (
                                    <button
                                      type="button"
                                      onClick={() => targetMinute && updateTaskStatus(targetMinute, item.traktandum, item.point.id, col.id === 'done' ? 'in_progress' : 'open')}
                                      title={col.id === 'done' ? 'Zurück auf In Arbeit' : 'Zurück auf Offen'}
                                      className="px-2 py-1 rounded-lg bg-gray-950 hover:bg-gray-800 text-gray-400 hover:text-white text-[10px] font-black border border-gray-800 transition-colors"
                                    >
                                      ←
                                    </button>
                                  )}
                                  {col.id === 'open' && (
                                    <button
                                      type="button"
                                      onClick={() => targetMinute && updateTaskStatus(targetMinute, item.traktandum, item.point.id, 'in_progress')}
                                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-gray-950 text-[10px] font-black border border-amber-500/30 transition-all"
                                    >
                                      In Arbeit →
                                    </button>
                                  )}
                                  {col.id !== 'done' && (
                                    <button
                                      type="button"
                                      onClick={() => targetMinute && updateTaskStatus(targetMinute, item.traktandum, item.point.id, 'done')}
                                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-gray-950 text-[10px] font-black border border-emerald-500/30 transition-all"
                                    >
                                      ✓ Erledigt
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-2.5">
              {displayedTasks.map(item => {
                const targetMinute = minutes.find(x => x.id === item.minuteId);
                const isOverdue = item.point.dueDate && item.point.dueDate < todayIso;
                return (
                  <div
                    key={item.point.id}
                    className="bg-gray-950 border border-gray-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                          {item.status === 'in_progress' && (
                            <span className="text-[10px] font-black uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">
                              In Arbeit
                            </span>
                          )}
                          {item.point.assignee && (
                            <span className="text-[10px] font-bold bg-gray-900 border border-gray-800 px-2.5 py-1 rounded text-gray-300">
                              Verantwortlich: {item.point.assignee}
                            </span>
                          )}
                          {item.point.dueDate && (
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded border ${
                              isOverdue
                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                : 'bg-gray-900 text-gray-400 border-gray-800'
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
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {item.status !== 'in_progress' && (
                        <button
                          onClick={() => targetMinute && updateTaskStatus(targetMinute, item.traktandum, item.point.id, 'in_progress')}
                          className="text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-3 py-2 rounded-xl hover:bg-amber-500 hover:text-gray-950 transition-all"
                        >
                          In Arbeit
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setExpandedId(item.minuteId);
                          setShowKanbanBoard(false);
                          setOnlyOpenTasks(false);
                          setOnlyMyTasks(false);
                        }}
                        className="text-xs font-bold text-orange-500 hover:underline min-h-[44px] flex items-center px-2"
                      >
                        Zum Protokoll →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
          <div
