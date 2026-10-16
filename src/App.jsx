import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, Calendar, Archive, LogOut, Plus, Trash2, 
  ChevronRight, BarChart3, UserPlus, Eye, Check, Database, ShieldAlert, Edit2,
  Youtube, Lock, Unlock, ClipboardList, UserCheck, Paperclip, Save, X, RefreshCw,
  UploadCloud, Search, Download, ArrowUp, ArrowDown, Maximize2, Minimize2,
  Folder, FolderPlus, FileText, File, CalendarDays, MapPin, Clock,
  Printer, CheckCircle2, AlertTriangle, Info, Filter, Sparkles, Share2, QrCode, Play,
  Zap, Lightbulb, Trophy, HelpCircle, ExternalLink, Image as ImageIcon, EyeOff
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

const DEFAULT_QUIZ_DATA = {
  title: '10-Tage SchmuDo-Countdown Quiz',
  subtitle: 'Jeden Tag eine neue knifflige Frage rund um die RüssSuuger Ämme & Fasnacht! Die Gewinner und Lösungen werden erst ganz am Schluss enthüllt.',
  isVisibleToMembers: false,
  isResultsPublished: false,
  questions: [],
  submissions: {}
};

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

const getYouTubeEmbedUrl = (url = '') => {
  if (!url) return null;
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return match && match[1] ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : null;
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
  const [helperShifts, setHelperShifts] = useState([]);
  const [quizData, setQuizData] = useState(DEFAULT_QUIZ_DATA);
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
    const shiftsRef  = collection(db, 'artifacts', appId, 'public', 'data', 'helper_shifts');
    const quizRef    = doc(db, 'artifacts', appId, 'public', 'data', 'quiz', 'main');

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
    const unsubShifts = onSnapshot(shiftsRef,
      (s) => setHelperShifts(s.docs.map(d => ({ ...d.data(), id: d.id }))),
      (err) => console.error("Helper Shifts Error:", err)
    );
    const unsubQuiz = onSnapshot(quizRef,
      (snap) => {
        if (snap.exists()) {
          setQuizData({ ...DEFAULT_QUIZ_DATA, ...snap.data() });
        } else {
          setQuizData(DEFAULT_QUIZ_DATA);
        }
      },
      (err) => console.error("Quiz Error:", err)
    );

    return () => { unsubUsers(); unsubEvents(); unsubMinutes(); unsubFolders(); unsubFiles(); unsubCal(); unsubShifts(); unsubQuiz(); };
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
  const isAdmin = currentUser?.role === 'admin';
  const canSeeQuizTab = isAdmin || Boolean(quizData?.isVisibleToMembers);

  useEffect(() => {
    if (activeTab === 'quiz' && !canSeeQuizTab) {
      setActiveTab('events');
    }
  }, [activeTab, canSeeQuizTab]);

  const openQuizQuestionsForMe = useMemo(() => {
    if (!currentUser || !quizData?.isVisibleToMembers || quizData?.isResultsPublished) return 0;
    const mySubs = quizData?.submissions?.[currentUser.id] || {};
    return (quizData?.questions || []).filter(q => q.status === 'active' && !mySubs[q.id]).length;
  }, [quizData, currentUser]);

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
              {canSeeQuizTab && (
                <TabButton
                  active={activeTab === 'quiz'}
                  onClick={() => setActiveTab('quiz')}
                  icon={<Trophy size={18} />}
                  label={isAdmin && !quizData?.isVisibleToMembers ? 'Quiz (Versteckt)' : 'Quiz'}
                  badge={openQuizQuestionsForMe}
                />
              )}
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
                  <TabButton active={activeTab === 'helpers'} onClick={() => setActiveTab('helpers')} icon={<UserCheck size={18} />} label="Helfereinsätze" />
                  <TabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={18} />} label="Archiv" />
                  <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={18} />}   label="Mitglieder" />
                </>
              )}
            </nav>

            {/* Mobile Bottom Navigation Bar */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-[150] bg-gray-900/95 backdrop-blur-xl border-t border-gray-800 px-2 py-1.5 flex items-center justify-around shadow-2xl">
              <MobileTabButton active={activeTab === 'events'} onClick={() => setActiveTab('events')} icon={<Calendar size={20} />} label="Events" />
              {canSeeQuizTab && (
                <MobileTabButton
                  active={activeTab === 'quiz'}
                  onClick={() => setActiveTab('quiz')}
                  icon={<Trophy size={20} />}
                  label={isAdmin && !quizData?.isVisibleToMembers ? 'Quiz 🔒' : 'Quiz'}
                  badge={openQuizQuestionsForMe}
                />
              )}
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
                  <MobileTabButton active={activeTab === 'helpers'} onClick={() => setActiveTab('helpers')} icon={<UserCheck size={20} />} label="Helfer" />
                  <MobileTabButton active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} icon={<Archive size={20} />} label="Archiv" />
                  <MobileTabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<Users size={20} />} label="Mitglieder" />
                </>
              )}
            </nav>

            <div className="animate-in fade-in duration-500">
              {activeTab === 'events'   && (
                <EventsView
                  events={events.filter(e => !e.isArchived)}
                  calItems={calItems}
                  currentUser={currentUser}
                  users={users}
                  openQuizCount={openQuizQuestionsForMe}
                  onOpenQuiz={() => setActiveTab('quiz')}
                  notify={notify}
                  askConfirm={askConfirm}
                />
              )}
              {activeTab === 'quiz'     && canSeeQuizTab && (
                <QuizView
                  quizData={quizData}
                  currentUser={currentUser}
                  users={users}
                  notify={notify}
                  askConfirm={askConfirm}
                />
              )}
              {activeTab === 'minutes'  && isVorstand && <ProtocolView minutes={minutes} users={users} currentUser={currentUser} calItems={calItems} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'files'    && isVorstand && <FilesView folders={folders} files={files} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'calendar' && isVorstand && <CalendarView calItems={calItems} currentUser={currentUser} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'helpers'  && currentUser.role === 'admin' && (
                <HelperShiftsAdminView
                  helperShifts={helperShifts}
                  users={users}
                  notify={notify}
                  askConfirm={askConfirm}
                />
              )}
              {activeTab === 'archive'  && <EventsView events={events.filter(e => e.isArchived)} calItems={calItems} currentUser={currentUser} isArchive users={users} notify={notify} askConfirm={askConfirm} />}
              {activeTab === 'members'  && currentUser.role === 'admin' && <MembersView users={users} notify={notify} askConfirm={askConfirm} />}
            </div>
          </main>
        </>
      )}
    </div>
  );
}

function HelperShiftsAdminView({ helperShifts, users, notify, askConfirm }) {
  const currentYearStr = String(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYearStr);
  const [subTab, setSubTab] = useState('overview'); // 'overview' | 'shifts'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'missing' | 'done' | 'multiple'
  const [groupFilter, setGroupFilter] = useState('Aktiv'); // 'Aktiv' | 'Alle' | specific group
  const [searchTerm, setSearchTerm] = useState('');
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);

  const ACTIVE_GROUPS = ['Vorstand', 'Aktiv Musig', 'Aktiv Wagenbau', 'Neumitglied Musig', 'Neumitglied Wagenbau'];

  const isUserActiveMember = (u) => {
    return (u.groups || []).some(g => ACTIVE_GROUPS.includes(g));
  };

  const availableYears = useMemo(() => {
    const yrs = new Set([currentYearStr, String(Number(currentYearStr) - 1), String(Number(currentYearStr) + 1)]);
    helperShifts.forEach(s => {
      if (s.year) yrs.add(String(s.year));
      else if (s.date) yrs.add(s.date.slice(0, 4));
    });
    return Array.from(yrs).sort((a, b) => b.localeCompare(a));
  }, [helperShifts, currentYearStr]);

  const shiftsForYear = useMemo(() => {
    return [...helperShifts]
      .filter(s => {
        const y = s.year ? String(s.year) : (s.date || '').slice(0, 4);
        return y === selectedYear;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [helperShifts, selectedYear]);

  // Auswertung pro Mitglied für das gewählte Jahr
  const memberStats = useMemo(() => {
    return users
      .map(u => {
        const userShifts = shiftsForYear.filter(s => (s.participantIds || []).includes(u.id));
        const isActiveMember = isUserActiveMember(u);
        return {
          user: u,
          isActiveMember,
          shifts: userShifts,
          count: userShifts.length,
          fulfilled: userShifts.length >= 1
        };
      })
      .sort((a, b) => {
        // Zuerst nach Nachname/Vorname sortieren
        const nameA = `${a.user.firstName || ''} ${a.user.lastName || ''}`.toLowerCase();
        const nameB = `${b.user.firstName || ''} ${b.user.lastName || ''}`.toLowerCase();
        return nameA.localeCompare(nameB);
      });
  }, [users, shiftsForYear]);

  const filteredMemberStats = useMemo(() => {
    return memberStats.filter(item => {
      if (groupFilter === 'Aktiv' && !item.isActiveMember) return false;
      if (groupFilter !== 'Aktiv' && groupFilter !== 'Alle' && !(item.user.groups || []).includes(groupFilter)) {
        return false;
      }
      if (statusFilter === 'missing' && item.count > 0) return false;
      if (statusFilter === 'done' && item.count < 1) return false;
      if (statusFilter === 'multiple' && item.count < 2) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const fullName = `${item.user.firstName || ''} ${item.user.lastName || ''}`.toLowerCase();
        const shiftMatch = item.shifts.some(s => (s.title || '').toLowerCase().includes(q));
        if (!fullName.includes(q) && !shiftMatch) return false;
      }
      return true;
    });
  }, [memberStats, groupFilter, statusFilter, searchTerm]);

  const summary = useMemo(() => {
    const activeMembers = memberStats.filter(m => m.isActiveMember);
    const totalActive = activeMembers.length;
    const fulfilledActive = activeMembers.filter(m => m.count >= 1).length;
    const missingActive = totalActive - fulfilledActive;
    const multipleActive = activeMembers.filter(m => m.count >= 2).length;
    const quotaPct = totalActive > 0 ? Math.round((fulfilledActive / totalActive) * 100) : 0;
    return {
      totalActive,
      fulfilledActive,
      missingActive,
      multipleActive,
      quotaPct,
      totalShiftsCount: shiftsForYear.length
    };
  }, [memberStats, shiftsForYear]);

  const handleSaveShift = async (shiftData) => {
    const id = shiftData.id || `shift_${Date.now()}`;
    const year = shiftData.date ? shiftData.date.slice(0, 4) : selectedYear;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'helper_shifts', id), {
      ...shiftData,
      id,
      year
    });
    setShowShiftModal(false);
    setEditingShift(null);
    notify("Helfereinsatz erfolgreich gespeichert.", "success");
  };

  const handleDeleteShift = (shift) => {
    askConfirm(
      'Helfereinsatz löschen',
      `Möchtest du den Helfereinsatz «${shift.title}» inkl. Zuweisungen wirklich löschen?`,
      async () => {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'helper_shifts', shift.id));
        notify("Helfereinsatz gelöscht.", "info");
      }
    );
  };

  const handleToggleUserInShift = async (shift, userId) => {
    const currentList = shift.participantIds || [];
    const exists = currentList.includes(userId);
    const nextList = exists
      ? currentList.filter(id => id !== userId)
      : [...currentList, userId];

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'helper_shifts', shift.id), {
      participantIds: nextList
    });
  };

  const copySummaryReport = () => {
    const activeList = memberStats.filter(m => m.isActiveMember);
    const doneList = activeList.filter(m => m.count >= 1);
    const openList = activeList.filter(m => m.count === 0);

    const lines = [
      `🛠️ *RüssSuuger Ämme – Helfereinsätze ${selectedYear}*`,
      `Erfüllt: ${doneList.length} / ${activeList.length} Aktivmitglieder (${summary.quotaPct}%)`,
      '',
      `✅ *Bereits geleistet (${doneList.length}):*`,
      ...doneList.map(m => `• ${m.user.firstName} ${m.user.lastName} (${m.count}x: ${m.shifts.map(s => s.title).join(', ')})`),
      '',
      `⚠️ *Noch offen – 0 Einsätze (${openList.length}):*`,
      ...openList.map(m => `• ${m.user.firstName} ${m.user.lastName}`)
    ];

    if (copyTextToClipboard(lines.join('\n'))) {
      notify("Helfer-Übersicht in die Zwischenablage kopiert!", "success");
    } else {
      notify("Kopieren fehlgeschlagen.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Kennzahlen */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950/30 border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-3 py-1 rounded-full">
              <Lock size={12} /> NUR ADMIN-ANSICHT • JAHRESPFLICHT (MIN. 1 EINSATZ)
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Helfereinsätze & Pflicht-Kontrolle {selectedYear}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400">
              Jedes Aktivmitglied leistet mindestens 1 Helfereinsatz pro Jahr. Hier behältst du den vollen Überblick.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1">
              {availableYears.map(yr => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                    selectedYear === yr ? 'bg-orange-500 text-gray-950' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>

            <button
              onClick={copySummaryReport}
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 font-black rounded-2xl text-xs flex items-center gap-2 transition-all active:scale-95"
              title="Bericht für WhatsApp / Vorstand kopieren"
            >
              <Share2 size={16} className="text-orange-500" /> Liste kopieren
            </button>

            <button
              onClick={() => {
                setEditingShift(null);
                setShowShiftModal(true);
              }}
              className="px-5 py-3 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all active:scale-95"
            >
              <Plus size={16} strokeWidth={3} /> Helfereinsatz erfassen
            </button>
          </div>
        </div>

        {/* Statistik-Kacheln (Klickbar zum Filtern) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div
            onClick={() => { setSubTab('overview'); setStatusFilter('all'); }}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              subTab === 'overview' && statusFilter === 'all'
                ? 'bg-orange-500/15 border-orange-500'
                : 'bg-gray-950/80 border-gray-800 hover:border-gray-700'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Aktivmitglieder</p>
            <p className="text-2xl font-black text-white mt-1">{summary.totalActive}</p>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">{summary.totalShiftsCount} Einsätze im {selectedYear}</p>
          </div>

          <div
            onClick={() => { setSubTab('overview'); setStatusFilter(statusFilter === 'done' ? 'all' : 'done'); }}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              subTab === 'overview' && statusFilter === 'done'
                ? 'bg-emerald-500/20 border-emerald-500'
                : 'bg-gray-950/80 border-gray-800 hover:border-emerald-500/40'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Soll erfüllt (≥ 1x)</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-black text-emerald-400">{summary.fulfilledActive}</p>
              <span className="text-xs font-black text-emerald-500/80">({summary.quotaPct}%)</span>
            </div>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">Pflichteinsatz geleistet ✓</p>
          </div>

          <div
            onClick={() => { setSubTab('overview'); setStatusFilter(statusFilter === 'missing' ? 'all' : 'missing'); }}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              subTab === 'overview' && statusFilter === 'missing'
                ? 'bg-red-500/20 border-red-500'
                : 'bg-gray-950/80 border-gray-800 hover:border-red-500/40'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Noch offen (0x)</p>
            <p className="text-2xl font-black text-red-400 mt-1">{summary.missingActive}</p>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">Noch kein Einsatz im {selectedYear}</p>
          </div>

          <div
            onClick={() => { setSubTab('overview'); setStatusFilter(statusFilter === 'multiple' ? 'all' : 'multiple'); }}
            className={`p-4 rounded-2xl border cursor-pointer transition-all ${
              subTab === 'overview' && statusFilter === 'multiple'
                ? 'bg-amber-500/20 border-amber-500'
                : 'bg-gray-950/80 border-gray-800 hover:border-amber-500/40'
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Mehrfach-Helfer (≥ 2x)</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{summary.multipleActive}</p>
            <p className="text-[10px] text-gray-500 font-bold mt-0.5">2 oder mehr Einsätze 🌟</p>
          </div>
        </div>
      </div>

      {/* Modal / Formular zum Erstellen & Bearbeiten eines Helfereinsatzes */}
      {(showShiftModal || editingShift) && (
        <HelperShiftEditorModal
          initialData={editingShift}
          selectedYear={selectedYear}
          users={users}
          activeGroups={ACTIVE_GROUPS}
          onSave={handleSaveShift}
          onCancel={() => {
            setShowShiftModal(false);
            setEditingShift(null);
          }}
        />
      )}

      {/* Umschalter zwischen "Mitglieder-Kontrolle" und "Erfasste Helfereinsätze" */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => setSubTab('overview')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${
              subTab === 'overview' ? 'bg-orange-500 text-gray-950 shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Users size={15} /> Mitglieder-Übersicht ({filteredMemberStats.length})
          </button>
          <button
            onClick={() => setSubTab('shifts')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-2 ${
              subTab === 'shifts' ? 'bg-orange-500 text-gray-950 shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ClipboardList size={15} /> Erfasste Einsätze ({shiftsForYear.length})
          </button>
        </div>

        {subTab === 'overview' && (
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'Alle zeigen' },
              { id: 'missing', label: '⚠️ Noch 0 Einsätze' },
              { id: 'done', label: '✅ Soll erfüllt (1+)' },
              { id: 'multiple', label: '🌟 2+ Einsätze' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase border transition-all ${
                  statusFilter === f.id
                    ? 'bg-orange-500 text-gray-950 border-orange-500'
                    : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ansicht 1: Mitglieder-Kontrolltabelle */}
      {subTab === 'overview' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Mitglied oder Einsatz suchen..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-2xl py-3.5 pl-11 pr-10 text-sm text-white focus:border-orange-500 outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3.5 text-xs font-black uppercase text-white outline-none focus:border-orange-500"
            >
              <option value="Aktiv">Nur Aktivmitglieder (Pflicht)</option>
              <option value="Alle">Alle Mitglieder (inkl. Passiv/Ehren)</option>
              {GROUPS.map(g => (
                <option key={g} value={g}>Gruppe: {g}</option>
              ))}
            </select>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-xl">
            {filteredMemberStats.length === 0 ? (
              <div className="text-center py-14 px-4">
                <UserCheck className="mx-auto text-gray-700 mb-3" size={40} />
                <p className="text-gray-400 font-bold text-sm">Keine Mitglieder für diesen Filter gefunden.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-950/60 text-[10px] font-black uppercase tracking-wider text-gray-400">
                      <th className="py-3.5 px-4">Mitglied</th>
                      <th className="py-3.5 px-4">Gruppe(n)</th>
                      <th className="py-3.5 px-4 text-center">Status {selectedYear}</th>
                      <th className="py-3.5 px-4">Geleistete Helfereinsätze</th>
                      <th className="py-3.5 px-4 text-right">Schnell-Zuweisung</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/70 text-sm">
                    {filteredMemberStats.map(({ user: u, count, shifts }) => {
                      return (
                        <tr key={u.id} className="hover:bg-gray-950/40 transition-colors">
                          <td className="py-3.5 px-4 font-black text-white whitespace-nowrap">
                            {u.firstName} {u.lastName}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1">
                              {(u.groups || []).map(g => (
                                <span
                                  key={g}
                                  className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-950 border border-gray-800 text-gray-400"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center whitespace-nowrap">
                            {count === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-red-500/15 text-red-400 border border-red-500/30">
                                ⚠️ 0 Einsätze (Offen)
                              </span>
                            ) : count === 1 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                ✓ 1 Einsatz (Erfüllt)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                🌟 {count} Einsätze (Vorbild!)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            {shifts.length === 0 ? (
                              <span className="text-xs text-gray-600 italic">Noch kein Einsatz eingetragen</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {shifts.map(s => (
                                  <span
                                    key={s.id}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-gray-950 border border-orange-500/30 text-orange-300 px-2.5 py-1 rounded-xl"
                                  >
                                    <span>{s.title}</span>
                                    {s.date && (
                                      <span className="text-[10px] text-gray-500">
                                        ({new Date(s.date).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' })})
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      title="Aus diesem Einsatz entfernen"
                                      onClick={() => handleToggleUserInShift(s, u.id)}
                                      className="text-gray-500 hover:text-red-400 ml-0.5"
                                    >
                                      <X size={12} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            {shiftsForYear.length > 0 ? (
                              <select
                                value=""
                                onChange={e => {
                                  const shiftId = e.target.value;
                                  if (!shiftId) return;
                                  const targetShift = shiftsForYear.find(s => s.id === shiftId);
                                  if (targetShift) {
                                    handleToggleUserInShift(targetShift, u.id);
                                    notify(`${u.firstName} zu «${targetShift.title}» hinzugefügt.`, "success");
                                  }
                                }}
                                className="bg-gray-950 border border-gray-800 hover:border-orange-500/50 rounded-xl px-2.5 py-1.5 text-xs font-bold text-gray-300 outline-none"
                              >
                                <option value="">+ Einsatz zuweisen...</option>
                                {shiftsForYear
                                  .filter(s => !(s.participantIds || []).includes(u.id))
                                  .map(s => (
                                    <option key={s.id} value={s.id}>
                                      {s.title} ({s.date ? new Date(s.date).toLocaleDateString('de-CH') : s.year})
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowShiftModal(true)}
                                className="text-xs font-bold text-orange-500 hover:underline"
                              >
                                + Ersten Einsatz anlegen
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ansicht 2: Liste aller erfassten Helfereinsätze (Events/Schichten) */}
      {subTab === 'shifts' && (
        <div className="grid gap-4">
          {shiftsForYear.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/40 rounded-3xl border border-dashed border-gray-800 space-y-3">
              <ClipboardList className="mx-auto text-gray-700" size={44} />
              <p className="text-gray-400 font-bold">
                Für {selectedYear} wurden noch keine Helfereinsätze erfasst.
              </p>
              <button
                onClick={() => setShowShiftModal(true)}
                className="px-5 py-2.5 bg-orange-500 text-gray-950 font-black rounded-xl text-xs inline-flex items-center gap-2"
              >
                <Plus size={15} /> Jetzt ersten Helfereinsatz erfassen
              </button>
            </div>
          ) : (
            shiftsForYear.map(shift => {
              const participants = (shift.participantIds || [])
                .map(id => users.find(u => u.id === id))
                .filter(Boolean);

              return (
                <div
                  key={shift.id}
                  className="bg-gray-900 border border-gray-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/15 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-full">
                          {shift.date ? new Date(shift.date).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' }) : `Jahr ${selectedYear}`}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/15 text-emerald-400 px-2.5 py-0.5 rounded-full">
                          {participants.length} {participants.length === 1 ? 'Helfer' : 'Helfer'} eingetragen
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-white mt-1.5">{shift.title}</h3>
                      {shift.notes && <p className="text-xs text-gray-400 mt-0.5">{shift.notes}</p>}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => setEditingShift(shift)}
                        className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5"
                      >
                        <Edit2 size={14} /> Helfer / Einsatz bearbeiten
                      </button>
                      <button
                        onClick={() => handleDeleteShift(shift)}
                        className="p-2.5 bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-500 rounded-xl"
                        title="Einsatz löschen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {participants.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">Noch keine Mitglieder diesem Einsatz zugewiesen.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {participants.map(p => (
                        <div
                          key={p.id}
                          className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-white"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>{p.firstName} {p.lastName}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleUserInShift(shift, p.id)}
                            className="text-gray-500 hover:text-red-400 ml-1"
                            title="Entfernen"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function HelperShiftEditorModal({ initialData, selectedYear, users, activeGroups, onSave, onCancel }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [date, setDate] = useState(initialData?.date || `${selectedYear}-${new Date().toISOString().slice(5, 10)}`);
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [participantIds, setParticipantIds] = useState(initialData?.participantIds || []);
  const [memberSearch, setMemberSearch] = useState('');
  const [onlyActiveFilter, setOnlyActiveFilter] = useState(true);

  const filteredUsers = useMemo(() => {
    return [...users]
      .filter(u => {
        if (onlyActiveFilter) {
          const isAct = (u.groups || []).some(g => activeGroups.includes(g));
          if (!isAct) return false;
        }
        if (memberSearch.trim()) {
          const q = memberSearch.toLowerCase();
          const full = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
          return full.includes(q);
        }
        return true;
      })
      .sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
  }, [users, onlyActiveFilter, memberSearch, activeGroups]);

  const toggleParticipant = (uid) => {
    if (participantIds.includes(uid)) {
      setParticipantIds(participantIds.filter(id => id !== uid));
    } else {
      setParticipantIds([...participantIds, uid]);
    }
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (!title.trim()) return;
        onSave({
          ...(initialData || {}),
          title: title.trim(),
          date,
          notes: notes.trim(),
          participantIds
        });
      }}
      className="bg-gray-900 border-2 border-orange-500/50 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl animate-in fade-in"
    >
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div>
          <h3 className="text-xl font-black text-white">
            {initialData ? 'Helfereinsatz bearbeiten' : 'Neuen Helfereinsatz erfassen'}
          </h3>
          <p className="text-xs text-gray-400">Einsatz benennen und alle beteiligten Helfer anhaken</p>
        </div>
        <button type="button" onClick={onCancel} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="text-xs font-bold text-gray-400 uppercase">Bezeichnung / Anlass des Helfereinsatzes</label>
          <input
            required
            placeholder="z.B. Fasnachts-Bar, Abbau Monsterkonzert, Wagenbau-Bewirtung..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white font-bold focus:border-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Datum</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white font-bold focus:border-orange-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 uppercase">Notiz / Schicht-Info (optional)</label>
        <input
          placeholder="z.B. Schicht 20:00 – 01:00 Uhr / Verantwortlich: Tourmanager"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-orange-500 outline-none"
        />
      </div>

      {/* Mitglieder-Auswahl */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-xs font-black uppercase text-orange-400">
            Beteiligte Mitglieder auswählen ({participantIds.length} ausgewählt)
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyActiveFilter(!onlyActiveFilter)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase border ${
                onlyActiveFilter
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-gray-900 text-gray-400 border-gray-800'
              }`}
            >
              {onlyActiveFilter ? '✓ Nur Aktivmitglieder' : 'Alle Mitglieder'}
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
          <input
            placeholder="Name filtern..."
            value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-orange-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
          {filteredUsers.map(u => {
            const isSelected = participantIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleParticipant(u.id)}
                className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                  isSelected
                    ? 'bg-orange-500/20 border-orange-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <span className="text-xs font-bold truncate">{u.firstName} {u.lastName}</span>
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-orange-500 border-orange-500 text-gray-950' : 'border-gray-700'
                }`}>
                  {isSelected && <Check size={13} strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-xs">
          Abbrechen
        </button>
        <button type="submit" className="px-6 py-3 rounded-xl bg-orange-500 text-gray-950 font-black text-xs flex items-center gap-2 shadow-lg">
          <Save size={16} /> Helfereinsatz speichern
        </button>
      </div>
    </form>
  );
}

function QuizView({ quizData, currentUser, users, notify, askConfirm }) {
  const isAdmin = currentUser?.role === 'admin';
  const [adminTab, setAdminTab] = useState('questions'); // 'questions' | 'leaderboard' | 'settings'
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [enlargedImage, setEnlargedImage] = useState(null);
  const [beamerMode, setBeamerMode] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  const questions = useMemo(() => {
    return [...(quizData?.questions || [])].sort((a, b) => (a.dayNumber || 1) - (b.dayNumber || 1));
  }, [quizData]);

  const submissions = quizData?.submissions || {};
  const mySubmissions = submissions[currentUser.id] || {};

  const saveQuizDoc = async (patch) => {
    const quizRef = doc(db, 'artifacts', appId, 'public', 'data', 'quiz', 'main');
    await setDoc(quizRef, {
      ...DEFAULT_QUIZ_DATA,
      ...quizData,
      ...patch
    });
  };

  const toggleVisibilityForMembers = async () => {
    const nextVal = !quizData.isVisibleToMembers;
    await saveQuizDoc({ isVisibleToMembers: nextVal });
    notify(
      nextVal
        ? "Quiz ist jetzt für alle Mitglieder im Portal sichtbar!"
        : "Quiz ist für normale Mitglieder wieder unsichtbar (Stealth-Modus).",
      nextVal ? "success" : "info"
    );
  };

  const togglePublishWinners = async () => {
    const nextVal = !quizData.isResultsPublished;
    await saveQuizDoc({ isResultsPublished: nextVal });
    if (nextVal) {
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 4000);
      notify("🏆 Gewinner & Lösungen wurden für alle veröffentlicht!", "success");
    } else {
      notify("Gewinner & Lösungen sind für Mitglieder wieder ausgeblendet.", "info");
    }
  };

  const handleSaveQuestion = async (qData) => {
    const exists = questions.some(q => q.id === qData.id);
    const nextQuestions = exists
      ? questions.map(q => (q.id === qData.id ? qData : q))
      : [...questions, qData];
    await saveQuizDoc({ questions: nextQuestions });
    setShowQuestionEditor(false);
    setEditingQuestion(null);
    notify(`Tag ${qData.dayNumber} gespeichert.`, "success");
  };

  const handleStatusChange = async (qId, nextStatus) => {
    const nextQuestions = questions.map(q => (q.id === qId ? { ...q, status: nextStatus } : q));
    await saveQuizDoc({ questions: nextQuestions });
    const statusLabel = nextStatus === 'active' ? 'Heute Offen 🔥' : nextStatus === 'closed' ? 'Geschlossen 🔒' : 'Gesperrt (Vorschau)';
    notify(`Frage-Status geändert auf «${statusLabel}».`, "success");
  };

  const handleDeleteQuestion = (q) => {
    askConfirm(
      `Tag ${q.dayNumber} löschen`,
      `Möchtest du die Frage «${q.title || q.questionText}» wirklich löschen?`,
      async () => {
        const nextQuestions = questions.filter(x => x.id !== q.id);
        await saveQuizDoc({ questions: nextQuestions });
        notify("Tagesfrage gelöscht.", "info");
      }
    );
  };

  const handleResetAllSubmissions = () => {
    askConfirm(
      'Alle Antworten zurücksetzen',
      'Möchtest du wirklich sämtliche bisher abgegebenen Quiz-Antworten aller Mitglieder unwiderruflich löschen?',
      async () => {
        await saveQuizDoc({ submissions: {}, isResultsPublished: false });
        notify("Alle Antworten wurden zurückgesetzt.", "info");
      }
    );
  };

  const submitMemberAnswer = async (question, answerPayload) => {
    const quizRef = doc(db, 'artifacts', appId, 'public', 'data', 'quiz', 'main');
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(quizRef);
      const currentData = snap.exists() ? snap.data() : DEFAULT_QUIZ_DATA;
      const allSubs = currentData.submissions || {};
      const userSubs = allSubs[currentUser.id] || {};
      if (userSubs[question.id]) {
        return; // Bereits geantwortet
      }
      const nextSubs = {
        ...allSubs,
        [currentUser.id]: {
          ...userSubs,
          [question.id]: {
            ...answerPayload,
            submittedAt: Date.now(),
            userName: `${currentUser.firstName} ${currentUser.lastName}`.trim()
          }
        }
      };
      tx.set(quizRef, {
        ...DEFAULT_QUIZ_DATA,
        ...currentData,
        submissions: nextSubs
      });
    });
    notify("Deine Antwort wurde geheim eingeloggt! 🎭", "success");
  };

  // Berechnung der Rangliste (für Admin immer sichtbar, für Mitglieder erst bei isResultsPublished)
  const leaderboard = useMemo(() => {
    const scoresMap = {};

    Object.entries(submissions).forEach(([userId, userAnswers]) => {
      const uObj = users.find(u => u.id === userId);
      const displayName = uObj
        ? `${uObj.firstName} ${uObj.lastName}`.trim()
        : Object.values(userAnswers || {})[0]?.userName || 'Mitglied';

      let totalPoints = 0;
      let correctCount = 0;
      let answeredCount = 0;
      let totalResponseTimeScore = 0;
      const perQuestion = {};

      questions.forEach(q => {
        const sub = userAnswers?.[q.id];
        if (!sub) return;
        answeredCount++;
        const pts = Number(q.points) || 1;
        let isCorrect = false;

        if (q.questionType === 'text') {
          const cleanUser = String(sub.textAnswer || '').trim().toLowerCase();
          const acceptedList = String(q.correctTextAnswer || '')
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
          isCorrect = acceptedList.includes(cleanUser);
        } else {
          isCorrect = sub.optionId === q.correctOptionId;
        }

        if (isCorrect) {
          totalPoints += pts;
          correctCount++;
        }
        totalResponseTimeScore += sub.submittedAt || 0;
        perQuestion[q.id] = {
          isCorrect,
          pointsEarned: isCorrect ? pts : 0,
          sub
        };
      });

      scoresMap[userId] = {
        userId,
        name: displayName,
        totalPoints,
        correctCount,
        answeredCount,
        totalResponseTimeScore,
        perQuestion
      };
    });

    return Object.values(scoresMap).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.totalResponseTimeScore - b.totalResponseTimeScore;
    });
  }, [submissions, questions, users]);

  const activeQuestion = useMemo(() => {
    if (selectedQuestionId) {
      return questions.find(q => q.id === selectedQuestionId) || null;
    }
    // Standardmässig die erste offene Frage wählen, die das Mitglied noch nicht beantwortet hat
    const firstUnansweredActive = questions.find(q => q.status === 'active' && !mySubmissions[q.id]);
    if (firstUnansweredActive) return firstUnansweredActive;
    const firstActive = questions.find(q => q.status === 'active');
    if (firstActive) return firstActive;
    return questions[0] || null;
  }, [questions, selectedQuestionId, mySubmissions]);

  return (
    <div className="space-y-6">
      <ConfettiOverlay active={confettiActive} />

      {/* Admin Control Bar (Stealth & Gewinner-Veröffentlichung) */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-orange-950/30 border-2 border-orange-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-2.5 py-0.5 rounded-full">
                  ADMIN QUIZ-ZENTRALE
                </span>
                {quizData.isVisibleToMembers ? (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/20 text-green-400 border border-green-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Unlock size={11} /> Für Mitglieder sichtbar
                  </span>
                ) : (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <EyeOff size={11} /> Unsichtbar für Mitglieder (Vorbereitung)
                  </span>
                )}
                {quizData.isResultsPublished && (
                  <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500 text-gray-950 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Trophy size={11} /> Gewinner & Antworten publiziert
                  </span>
                )}
              </div>
              <h3 className="text-lg font-black text-white">
                Steuerung & Endauswertung ({leaderboard.length} Teilnehmende • {questions.length} Tagesfragen)
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={toggleVisibilityForMembers}
                className={`px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 border ${
                  quizData.isVisibleToMembers
                    ? 'bg-gray-950 border-gray-700 text-gray-300 hover:text-white'
                    : 'bg-green-500 text-gray-950 border-green-500 shadow-lg shadow-green-500/20'
                }`}
              >
                {quizData.isVisibleToMembers ? (
                  <>
                    <EyeOff size={16} /> Für Mitglieder verbergen
                  </>
                ) : (
                  <>
                    <Unlock size={16} /> Quiz für Mitglieder freigeben
                  </>
                )}
              </button>

              <button
                onClick={togglePublishWinners}
                className={`px-4 py-3 rounded-2xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 border ${
                  quizData.isResultsPublished
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-orange-500 text-gray-950 border-orange-500 shadow-lg shadow-orange-500/20'
                }`}
              >
                <Trophy size={16} />
                {quizData.isResultsPublished ? 'Gewinner wieder verbergen' : '🏆 Gewinner & Lösungen veröffentlichen'}
              </button>

              <button
                onClick={() => setBeamerMode(true)}
                className="px-4 py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-black flex items-center gap-2"
              >
                <Maximize2 size={15} /> Beamer-Finale
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAdminTab('questions')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                  adminTab === 'questions' ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 hover:text-white'
                }`}
              >
                Tagesfragen & Vorschau ({questions.length})
              </button>
              <button
                onClick={() => setAdminTab('leaderboard')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                  adminTab === 'leaderboard' ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 hover:text-white'
                }`}
              >
                Geheime Admin-Rangliste ({leaderboard.length})
              </button>
              <button
                onClick={() => setAdminTab('settings')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                  adminTab === 'settings' ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 hover:text-white'
                }`}
              >
                Titel & Reset
              </button>
            </div>

            {adminTab === 'questions' && (
              <button
                onClick={() => {
                  setEditingQuestion(null);
                  setShowQuestionEditor(true);
                }}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-gray-950 font-black rounded-xl text-xs flex items-center gap-1.5"
              >
                <Plus size={15} strokeWidth={3} /> Neue Tagesfrage (Tag {questions.length + 1})
              </button>
            )}
          </div>
        </div>
      )}

      {/* Admin Settings Sub-Tab */}
      {isAdmin && adminTab === 'settings' && (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 shadow-xl">
          <h3 className="text-lg font-black text-white">Quiz-Titel & Einstellungen</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Quiz-Haupttitel</label>
              <input
                value={quizData.title || ''}
                onChange={e => saveQuizDoc({ title: e.target.value })}
                className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase">Beschreibung / Hinweis</label>
              <input
                value={quizData.subtitle || ''}
                onChange={e => saveQuizDoc({ subtitle: e.target.value })}
                className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
              />
            </div>
          </div>
          <div className="pt-3 border-t border-gray-800 flex justify-between items-center">
            <p className="text-xs text-gray-400">Alle bisherigen Antworten der Mitglieder für einen Neustart löschen:</p>
            <button
              onClick={handleResetAllSubmissions}
              className="px-4 py-2.5 bg-red-500/15 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 rounded-xl text-xs font-black transition-all"
            >
              Alle Antworten zurücksetzen
            </button>
          </div>
        </div>
      )}

      {/* Admin Geheime Rangliste Sub-Tab */}
      {isAdmin && adminTab === 'leaderboard' && (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <Trophy className="text-orange-500" size={22} /> Admin-Endauswertung & Rangliste
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Diese Auswertung ist für Mitglieder erst sichtbar, wenn du oben auf «Gewinner & Lösungen veröffentlichen» klickst.
              </p>
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="text-center py-12 bg-gray-950/60 rounded-2xl border border-dashed border-gray-800">
              <p className="text-gray-400 font-bold text-sm">Noch keine Antworten eingegangen.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] font-black uppercase tracking-wider text-gray-400">
                    <th className="py-3 px-3">Rang</th>
                    <th className="py-3 px-3">Mitglied</th>
                    <th className="py-3 px-3">Punkte</th>
                    <th className="py-3 px-3">Richtig</th>
                    {questions.map(q => (
                      <th key={q.id} className="py-3 px-2 text-center">Tag {q.dayNumber}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/70 text-sm">
                  {leaderboard.map((row, idx) => (
                    <tr key={row.userId} className="hover:bg-gray-950/60">
                      <td className="py-3.5 px-3 font-black">
                        {idx === 0 ? '🥇 1.' : idx === 1 ? '🥈 2.' : idx === 2 ? '🥉 3.' : `${idx + 1}.`}
                      </td>
                      <td className="py-3.5 px-3 font-bold text-white">{row.name}</td>
                      <td className="py-3.5 px-3 font-black text-orange-400">{row.totalPoints} Pkt.</td>
                      <td className="py-3.5 px-3 text-xs text-gray-400">
                        {row.correctCount} / {row.answeredCount}
                      </td>
                      {questions.map(q => {
                        const res = row.perQuestion[q.id];
                        if (!res) {
                          return <td key={q.id} className="py-3.5 px-2 text-center text-gray-600">–</td>;
                        }
                        return (
                          <td key={q.id} className="py-3.5 px-2 text-center">
                            <span
                              title={
                                q.questionType === 'text'
                                  ? `Antwort: ${res.sub.textAnswer}`
                                  : `Option: ${(q.options || []).find(o => o.id === res.sub.optionId)?.text || ''}`
                              }
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${
                                res.isCorrect
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {res.isCorrect ? '✓' : '✗'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Question Editor Modal / Form */}
      {isAdmin && (showQuestionEditor || editingQuestion) && (
        <QuizQuestionEditor
          initialData={editingQuestion}
          nextDayNumber={questions.length + 1}
          onSave={handleSaveQuestion}
          onCancel={() => {
            setShowQuestionEditor(false);
            setEditingQuestion(null);
          }}
        />
      )}

      {/* Quiz Hero Header für alle */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950/30 border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-3 py-1 rounded-full">
              <Sparkles size={12} /> RüssSuuger Fasnachts-Challenge
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white italic tracking-tight">
              {quizData.title || '10-Tage SchmuDo-Countdown Quiz'}
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 max-w-2xl leading-relaxed">
              {quizData.subtitle}
            </p>
          </div>

          <div className="bg-gray-950/90 border border-gray-800 rounded-2xl px-5 py-3.5 text-center shrink-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Dein Fortschritt</p>
            <p className="text-2xl font-black text-orange-500 mt-0.5">
              {Object.keys(mySubmissions).length} / {questions.filter(q => q.status !== 'locked').length || questions.length}
            </p>
            <p className="text-[10px] text-gray-500 font-bold">Tagesfragen beantwortet</p>
          </div>
        </div>
      </div>

      {/* Wenn die Gewinner veröffentlicht wurden -> Offizielles Siegerpodest & Gesamtrangliste für alle sichtbar */}
      {quizData.isResultsPublished && (
        <div className="bg-gradient-to-br from-amber-500/15 via-gray-900 to-gray-900 border-2 border-amber-500/50 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in fade-in">
          <div className="text-center space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500 text-gray-950 px-3 py-1 rounded-full">
              🏆 OFFIZIELLES ENDERGEBNIS
            </span>
            <h3 className="text-2xl sm:text-3xl font-black text-white mt-2">
              Die Quiz-Champions stehen fest!
            </h3>
            <p className="text-xs sm:text-sm text-gray-400">
              Herzliche Gratulation! Unten kannst du ausserdem bei allen Tagesfragen die richtigen Lösungen nachschauen.
            </p>
          </div>

          {leaderboard.length > 0 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto pt-2">
                {leaderboard.slice(0, 3).map((winner, idx) => {
                  const medals = ['🥇 1. Platz', '🥈 2. Platz', '🥉 3. Platz'];
                  const styles = [
                    'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/20',
                    'border-gray-400/50 bg-gray-800/60',
                    'border-orange-700/60 bg-orange-950/30'
                  ];
                  return (
                    <div
                      key={winner.userId}
                      className={`rounded-2xl p-5 border text-center space-y-1.5 ${styles[idx]}`}
                    >
                      <p className="text-xs font-black uppercase text-amber-400">{medals[idx]}</p>
                      <p className="text-lg font-black text-white truncate">{winner.name}</p>
                      <p className="text-2xl font-black text-orange-400">{winner.totalPoints} Punkte</p>
                      <p className="text-[11px] text-gray-400 font-bold">
                        {winner.correctCount} von {questions.length} richtig
                      </p>
                    </div>
                  );
                })}
              </div>

              {leaderboard.length > 3 && (
                <div className="max-w-2xl mx-auto bg-gray-950/80 border border-gray-800 rounded-2xl divide-y divide-gray-800/80">
                  {leaderboard.slice(3).map((row, idx) => (
                    <div key={row.userId} className="px-4 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-gray-500 w-6">{idx + 4}.</span>
                        <span className="font-bold text-white">{row.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{row.correctCount} richtig</span>
                        <span className="font-black text-orange-400">{row.totalPoints} Pkt.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tages-Kacheln (Tag 1 bis Tag X) */}
      {questions.length === 0 ? (
        <div className="text-center py-16 bg-gray-900/40 rounded-3xl border border-dashed border-gray-800">
          <HelpCircle className="mx-auto text-gray-700 mb-3" size={44} />
          <p className="text-gray-400 font-bold">
            {isAdmin
              ? 'Noch keine Tagesfragen erfasst. Klicke oben auf «+ Neue Tagesfrage», um Tag 1 zu erstellen!'
              : 'Die ersten Tagesfragen werden in Kürze freigeschaltet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
            {questions.map(q => {
              const isSelected = activeQuestion?.id === q.id;
              const hasAnswered = Boolean(mySubmissions[q.id]);
              const isLockedForMember = q.status === 'locked' && !isAdmin;

              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={isLockedForMember}
                  onClick={() => setSelectedQuestionId(q.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden ${
                    isLockedForMember
                      ? 'bg-gray-900/40 border-gray-800/60 opacity-50 cursor-not-allowed'
                      : isSelected
                      ? 'bg-orange-500/15 border-orange-500 ring-1 ring-orange-500/30 shadow-lg'
                      : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-orange-500">
                      Tag {q.dayNumber}
                    </span>
                    {hasAnswered ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : q.status === 'active' ? (
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                    ) : (
                      <Lock size={12} className="text-gray-500" />
                    )}
                  </div>
                  <p className="text-xs font-black text-white truncate">
                    {q.status === 'locked' && !isAdmin ? 'Noch geheim 🔒' : q.title || `Frage #${q.dayNumber}`}
                  </p>
                  <p className="text-[10px] text-gray-500 font-bold mt-1">
                    {hasAnswered
                      ? 'Beantwortet ✓'
                      : q.status === 'active'
                      ? 'Jetzt offen 🔥'
                      : q.status === 'closed'
                      ? 'Abgeschlossen'
                      : 'Gesperrt'}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Detail-Karte der ausgewählten Tagesfrage */}
          {activeQuestion && (
            <QuizQuestionDetailCard
              key={activeQuestion.id}
              question={activeQuestion}
              isAdmin={isAdmin}
              mySubmission={mySubmissions[activeQuestion.id]}
              isResultsPublished={Boolean(quizData.isResultsPublished)}
              totalSubmissionsCount={
                Object.values(submissions).filter(uMap => Boolean(uMap?.[activeQuestion.id])).length
              }
              onSubmitAnswer={payload => submitMemberAnswer(activeQuestion, payload)}
              onStatusChange={st => handleStatusChange(activeQuestion.id, st)}
              onEdit={() => setEditingQuestion(activeQuestion)}
              onDelete={() => handleDeleteQuestion(activeQuestion)}
              onEnlargeImage={url => setEnlargedImage(url)}
            />
          )}
        </div>
      )}

      {/* Bild-Lightbox zum Vergrössern */}
      {enlargedImage && (
        <div
          onClick={() => setEnlargedImage(null)}
          className="fixed inset-0 z-[290] bg-gray-950/95 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={enlargedImage}
            alt="Quiz Vollbild"
            className="max-w-full max-h-[88vh] rounded-2xl shadow-2xl border border-gray-800 object-contain"
          />
          <button
            onClick={() => setEnlargedImage(null)}
            className="fixed top-6 right-6 p-3 bg-gray-900 rounded-2xl text-white border border-gray-700"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {/* Beamer-Präsentationsmodus für das grosse Finale */}
      {beamerMode && (
        <div className="fixed inset-0 z-[270] bg-gray-950 flex flex-col p-6 sm:p-10 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-800 pb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-orange-500">
                RüssSuuger Ämme • Grosses Quiz-Finale
              </p>
              <h2 className="text-2xl sm:text-4xl font-black text-white mt-1">{quizData.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              {!quizData.isResultsPublished && (
                <button
                  onClick={togglePublishWinners}
                  className="px-5 py-3 bg-orange-500 text-gray-950 font-black rounded-2xl text-xs flex items-center gap-2 shadow-lg"
                >
                  <Trophy size={16} /> Jetzt Gewinner & Lösungen enthüllen!
                </button>
              )}
              <button
                onClick={() => setBeamerMode(false)}
                className="p-3 bg-gray-900 rounded-2xl text-gray-400 hover:text-white"
              >
                <Minimize2 size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 max-w-5xl w-full mx-auto py-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {leaderboard.slice(0, 3).map((winner, idx) => {
                const titles = ['🥇 1. PLATZ', '🥈 2. PLATZ', '🥉 3. PLATZ'];
                return (
                  <div
                    key={winner.userId}
                    className={`rounded-3xl p-7 border text-center space-y-2 ${
                      idx === 0
                        ? 'bg-gradient-to-b from-amber-500/25 to-gray-900 border-amber-400 shadow-2xl'
                        : 'bg-gray-900 border-gray-800'
                    }`}
                  >
                    <p className="text-sm font-black text-amber-400">{titles[idx]}</p>
                    <p className="text-2xl sm:text-3xl font-black text-white">{winner.name}</p>
                    <p className="text-3xl font-black text-orange-500">{winner.totalPoints} Punkte</p>
                    <p className="text-xs text-gray-400 font-bold">
                      {winner.correctCount} von {questions.length} Fragen richtig
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-3">
              <h3 className="text-sm font-black uppercase tracking-widest text-orange-500">
                Alle Tagesfragen & Richtige Antworten
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {questions.map(q => {
                  const correctText =
                    q.questionType === 'text'
                      ? q.correctTextAnswer
                      : (q.options || []).find(o => o.id === q.correctOptionId)?.text;
                  return (
                    <div key={q.id} className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-1">
                      <p className="text-[10px] font-black uppercase text-orange-400">
                        Tag {q.dayNumber} • {q.points || 1} Pkt.
                      </p>
                      <p className="text-sm font-bold text-white">{q.questionText}</p>
                      <p className="text-xs font-black text-emerald-400 pt-1">
                        ✓ Lösung: {correctText || '–'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizQuestionDetailCard({
  question,
  isAdmin,
  mySubmission,
  isResultsPublished,
  totalSubmissionsCount,
  onSubmitAnswer,
  onStatusChange,
  onEdit,
  onDelete,
  onEnlargeImage
}) {
  const [selectedOptId, setSelectedOptId] = useState(mySubmission?.optionId || '');
  const [textAnswer, setTextAnswer] = useState(mySubmission?.textAnswer || '');
  const [submitting, setSubmitting] = useState(false);

  const hasAnswered = Boolean(mySubmission);
  const canVoteNow = question.status === 'active' && !hasAnswered && !isResultsPublished;
  const embedUrl = getYouTubeEmbedUrl(question.linkUrl);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!canVoteNow) return;
    if (question.questionType === 'text' && !textAnswer.trim()) return;
    if (question.questionType !== 'text' && !selectedOptId) return;
    setSubmitting(true);
    await onSubmitAnswer(
      question.questionType === 'text'
        ? { textAnswer: textAnswer.trim() }
        : { optionId: selectedOptId }
    );
    setSubmitting(false);
  };

  if (question.status === 'locked' && !isAdmin) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-10 text-center space-y-3">
        <Lock className="mx-auto text-orange-500" size={40} />
        <h3 className="text-xl font-black text-white">Tag {question.dayNumber} ist noch unter Verschluss</h3>
        <p className="text-sm text-gray-400">Diese Tagesfrage wird erst am entsprechenden Tag vom Admin freigeschaltet.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-800 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-2.5 py-0.5 rounded-full">
              TAG {question.dayNumber} • {question.points || 1} {(question.points || 1) === 1 ? 'PUNKT' : 'PUNKTE'}
            </span>
            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
              question.status === 'active'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : question.status === 'closed'
                ? 'bg-gray-800 text-gray-400'
                : 'bg-red-500/20 text-red-400'
            }`}>
              {question.status === 'active' ? 'Heute Aktiv 🔥' : question.status === 'closed' ? 'Abgeschlossen' : 'Gesperrt (Entwurf)'}
            </span>
            {isAdmin && (
              <span className="text-[10px] font-bold text-gray-400 bg-gray-950 px-2.5 py-0.5 rounded-full border border-gray-800">
                {totalSubmissionsCount} Antworten eingegangen
              </span>
            )}
          </div>
          {question.title && (
            <p className="text-xs font-black uppercase tracking-wider text-orange-400 pt-1">{question.title}</p>
          )}
          <h3 className="text-xl sm:text-2xl font-black text-white leading-snug whitespace-pre-wrap">
            {question.questionText}
          </h3>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={question.status || 'locked'}
              onChange={e => onStatusChange(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs font-black text-white"
            >
              <option value="locked">🔒 Gesperrt</option>
              <option value="active">🔥 Heute Aktiv (Offen)</option>
              <option value="closed">✅ Geschlossen</option>
            </select>
            <button
              onClick={onEdit}
              className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 hover:text-white"
              title="Frage bearbeiten"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={onDelete}
              className="p-2.5 bg-gray-800 hover:bg-red-500/20 rounded-xl text-gray-400 hover:text-red-500"
              title="Frage löschen"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Multimedia-Bereich: Bild, Link oder YouTube-Video */}
      {(question.imageUrl || question.linkUrl) && (
        <div className="space-y-4">
          {question.imageUrl && (
            <div className="space-y-1.5">
              <div
                onClick={() => onEnlargeImage(question.imageUrl)}
                className="relative group cursor-zoom-in rounded-2xl overflow-hidden border border-gray-800 bg-gray-950 max-h-96 flex items-center justify-center"
              >
                <img
                  src={question.imageUrl}
                  alt={question.title || 'Quiz-Bild'}
                  className="max-h-96 w-auto object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute bottom-3 right-3 bg-gray-950/80 backdrop-blur-md text-white text-[10px] font-black uppercase px-3 py-1.5 rounded-xl border border-gray-700 flex items-center gap-1.5">
                  <Maximize2 size={12} /> Bild vergrössern
                </div>
              </div>
            </div>
          )}

          {embedUrl ? (
            <div className="rounded-2xl overflow-hidden border border-gray-800 bg-black aspect-video max-h-80 mx-auto">
              <iframe
                src={embedUrl}
                title="Quiz Video"
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          ) : (
            question.linkUrl && (
              <a
                href={question.linkUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-950 hover:bg-gray-800 border border-orange-500/30 text-orange-400 font-black text-xs transition-all"
              >
                <ExternalLink size={15} /> {question.linkLabel || 'Weiterführenden Link / Hinweis öffnen'}
              </a>
            )
          )}
        </div>
      )}

      {/* Antwort-Bereich */}
      <form onSubmit={handleSend} className="space-y-4">
        {question.questionType === 'text' ? (
          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-gray-400">Deine Antwort / Schätzung</label>
            <input
              type="text"
              disabled={!canVoteNow}
              placeholder="Antwort hier eingeben..."
              value={hasAnswered ? mySubmission.textAnswer : textAnswer}
              onChange={e => setTextAnswer(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-4 py-4 text-white font-bold focus:border-orange-500 outline-none disabled:opacity-60"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(question.options || []).map((opt, idx) => {
              const chosenId = hasAnswered ? mySubmission?.optionId : selectedOptId;
              const isSelected = chosenId === opt.id;
              const isCorrectOption = isResultsPublished && opt.id === question.correctOptionId;
              const isWrongSelection = isResultsPublished && isSelected && opt.id !== question.correctOptionId;

              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!canVoteNow}
                  onClick={() => setSelectedOptId(opt.id)}
                  className={`p-4 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 ${
                    isCorrectOption
                      ? 'bg-emerald-500/20 border-emerald-500 text-white'
                      : isWrongSelection
                      ? 'bg-red-500/15 border-red-500/50 text-gray-300'
                      : isSelected
                      ? 'bg-orange-500/20 border-orange-500 text-white shadow-lg'
                      : 'bg-gray-950 border-gray-800 text-gray-200 hover:border-gray-700'
                  } ${!canVoteNow ? 'cursor-default' : 'active:scale-[0.99]'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${
                      isCorrectOption
                        ? 'bg-emerald-500 text-gray-950'
                        : isSelected
                        ? 'bg-orange-500 text-gray-950'
                        : 'bg-gray-900 text-gray-400 border border-gray-800'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="font-bold text-sm break-words">{opt.text}</span>
                  </div>

                  {isCorrectOption && (
                    <span className="text-[10px] font-black uppercase bg-emerald-500 text-gray-950 px-2 py-0.5 rounded shrink-0">
                      ✓ Richtige Lösung
                    </span>
                  )}
                  {!isResultsPublished && isSelected && hasAnswered && (
                    <span className="text-[10px] font-black uppercase bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded shrink-0">
                      Deine Wahl
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Submit-Button oder Geheimhaltungs-Bestätigung */}
        {canVoteNow && (
          <button
            type="submit"
            disabled={
              submitting ||
              (question.questionType === 'text' ? !textAnswer.trim() : !selectedOptId)
            }
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-gray-950 font-black py-4 rounded-2xl shadow-lg transition-all text-base"
          >
            {submitting ? 'Wird gespeichert...' : 'Antwort verbindlich einloggen 🔒'}
          </button>
        )}

        {hasAnswered && !isResultsPublished && (
          <div className="bg-gray-950 border border-orange-500/30 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/15 text-orange-400 rounded-xl shrink-0">
              <Lock size={18} />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-orange-400">
                Antwort geheim gespeichert!
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Ob deine Antwort richtig war, bleibt bis zur grossen Gewinner-Veröffentlichung am Schluss geheim.
              </p>
            </div>
          </div>
        )}

        {/* Auflösung erst sichtbar, wenn der Admin die Gewinner veröffentlicht hat */}
        {isResultsPublished && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-1.5">
            <p className="text-xs font-black uppercase tracking-wider text-emerald-400">
              ✓ Offizielle Auflösung (Tag {question.dayNumber})
            </p>
            <p className="text-sm font-bold text-white">
              Richtige Antwort:{' '}
              <span className="text-emerald-400">
                {question.questionType === 'text'
                  ? question.correctTextAnswer
                  : (question.options || []).find(o => o.id === question.correctOptionId)?.text || '–'}
              </span>
            </p>
            {question.explanation && (
              <p className="text-xs text-gray-300 pt-1 leading-relaxed">{question.explanation}</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}

function QuizQuestionEditor({ initialData, nextDayNumber, onSave, onCancel }) {
  const [dayNumber, setDayNumber] = useState(initialData?.dayNumber || nextDayNumber || 1);
  const [title, setTitle] = useState(initialData?.title || '');
  const [questionText, setQuestionText] = useState(initialData?.questionText || '');
  const [questionType, setQuestionType] = useState(initialData?.questionType || 'mc'); // 'mc' | 'text'
  const [points, setPoints] = useState(initialData?.points || 1);
  const [status, setStatus] = useState(initialData?.status || 'locked');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [linkUrl, setLinkUrl] = useState(initialData?.linkUrl || '');
  const [linkLabel, setLinkLabel] = useState(initialData?.linkLabel || '');
  const [explanation, setExplanation] = useState(initialData?.explanation || '');
  const [options, setOptions] = useState(
    initialData?.options || [
      { id: 'qopt_1', text: '' },
      { id: 'qopt_2', text: '' },
      { id: 'qopt_3', text: '' },
      { id: 'qopt_4', text: '' }
    ]
  );
  const [correctOptionId, setCorrectOptionId] = useState(initialData?.correctOptionId || 'qopt_1');
  const [correctTextAnswer, setCorrectTextAnswer] = useState(initialData?.correctTextAnswer || '');
  const [uploadingImg, setUploadingImg] = useState(false);

  const handleImageFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      setImageUrl(dataUrl);
    } catch (err) {
      console.error(err);
    }
    setUploadingImg(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanedOptions = options.filter(o => o.text.trim());
    onSave({
      id: initialData?.id || `quiz_q_${Date.now()}`,
      dayNumber: Number(dayNumber) || 1,
      title: title.trim(),
      questionText: questionText.trim(),
      questionType,
      points: Number(points) || 1,
      status,
      imageUrl: imageUrl.trim(),
      linkUrl: linkUrl.trim(),
      linkLabel: linkLabel.trim(),
      explanation: explanation.trim(),
      options: cleanedOptions,
      correctOptionId: cleanedOptions.some(o => o.id === correctOptionId)
        ? correctOptionId
        : cleanedOptions[0]?.id || 'qopt_1',
      correctTextAnswer: correctTextAnswer.trim()
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border-2 border-orange-500/40 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-gray-800 pb-4">
        <h3 className="text-xl font-black text-white">
          {initialData ? `Tag ${dayNumber} bearbeiten` : `Neue Tagesfrage erstellen`}
        </h3>
        <button type="button" onClick={onCancel} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Tag Nr. (1–10)</label>
          <input
            type="number"
            min={1}
            max={30}
            required
            value={dayNumber}
            onChange={e => setDayNumber(e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white font-black"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-bold text-gray-400 uppercase">Kurztitel (optional, z.B. «Wagenbau-Rätsel»)</label>
          <input
            placeholder="z.B. Sujet-Zeitreise"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-3 text-white font-bold"
          >
            <option value="locked">🔒 Gesperrt</option>
            <option value="active">🔥 Heute Aktiv</option>
            <option value="closed">✅ Geschlossen</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 uppercase">Fragetext</label>
        <textarea
          required
          rows={3}
          placeholder="Stelle hier deine Tagesfrage..."
          value={questionText}
          onChange={e => setQuestionText(e.target.value)}
          className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl p-4 text-white focus:border-orange-500 outline-none"
        />
      </div>

      {/* Bild & Link Sektion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-950 border border-gray-800 rounded-2xl p-4">
        <div className="space-y-2">
          <label className="text-xs font-black uppercase text-orange-400 flex items-center gap-1.5">
            <ImageIcon size={14} /> Bild hinzufügen (Upload oder Bild-URL)
          </label>
          <div className="flex gap-2">
            <input
              placeholder="Bild-URL (oder rechts Datei wählen)"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white"
            />
            <label className="px-3.5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-black cursor-pointer shrink-0 flex items-center gap-1.5">
              <UploadCloud size={15} /> {uploadingImg ? '...' : 'Foto'}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageFileChange} />
            </label>
          </div>
          {imageUrl && (
            <div className="flex items-center justify-between bg-gray-900 p-2 rounded-xl border border-gray-800">
              <img src={imageUrl} alt="Vorschau" className="h-12 w-16 object-cover rounded-lg" />
              <button type="button" onClick={() => setImageUrl('')} className="text-xs text-red-400 font-bold px-2">
                Bild entfernen
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black uppercase text-orange-400 flex items-center gap-1.5">
            <ExternalLink size={14} /> Link oder YouTube-Video (optional)
          </label>
          <input
            placeholder="https://... (Weblink oder YouTube-URL)"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white"
          />
          <input
            placeholder="Link-Button Text (z.B. «Hinweis auf Google Maps öffnen»)"
            value={linkLabel}
            onChange={e => setLinkLabel(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2 text-xs text-gray-300"
          />
        </div>
      </div>

      {/* Fragetyp & Antwortoptionen */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuestionType('mc')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${
                questionType === 'mc' ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 border border-gray-800'
              }`}
            >
              Multiple Choice
            </button>
            <button
              type="button"
              onClick={() => setQuestionType('text')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase ${
                questionType === 'text' ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 border border-gray-800'
              }`}
            >
              Freitext / Schätzfrage
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-gray-400 uppercase">Punktewert:</label>
            <input
              type="number"
              min={1}
              max={10}
              value={points}
              onChange={e => setPoints(e.target.value)}
              className="w-20 bg-gray-950 border border-gray-800 rounded-xl px-3 py-1.5 text-sm text-white font-black text-center"
            />
          </div>
        </div>

        {questionType === 'mc' ? (
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-gray-400 uppercase block">
              Antwortoptionen (wähle rechts die richtige Lösung aus – bleibt für Mitglieder geheim!)
            </label>
            {options.map((opt, idx) => {
              const isCorrect = correctOptionId === opt.id;
              return (
                <div key={opt.id} className="flex items-center gap-2">
                  <span className="w-7 text-center font-black text-xs text-gray-500">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <input
                    required={idx < 2}
                    placeholder={`Antwortoption ${idx + 1}`}
                    value={opt.text}
                    onChange={e => {
                      const next = [...options];
                      next[idx] = { ...opt, text: e.target.value };
                      setOptions(next);
                    }}
                    className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setCorrectOptionId(opt.id)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-black border transition-all shrink-0 ${
                      isCorrect
                        ? 'bg-emerald-500 text-gray-950 border-emerald-500'
                        : 'bg-gray-950 text-gray-400 border-gray-800 hover:text-white'
                    }`}
                  >
                    {isCorrect ? '✓ Richtige Antwort' : 'Als richtig markieren'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase block">
              Richtige Freitext-Lösung (mehrere erlaubte Schreibweisen mit Komma trennen)
            </label>
            <input
              required
              placeholder="z.B. 1988, 88"
              value={correctTextAnswer}
              onChange={e => setCorrectTextAnswer(e.target.value)}
              className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white font-bold"
            />
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 uppercase">
          Auflösungs-Erklärung (wird erst ganz am Schluss bei der Siegerehrung angezeigt)
        </label>
        <input
          placeholder="Optionaler Fun-Fact zur Lösung..."
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
        />
      </div>

      <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
        <button type="button" onClick={onCancel} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-xs">
          Abbrechen
        </button>
        <button type="submit" className="px-6 py-3 rounded-xl bg-orange-500 text-gray-950 font-black text-xs flex items-center gap-2">
          <Save size={16} /> Tagesfrage speichern
        </button>
      </div>
    </form>
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
  const [tasksViewMode,  setTasksViewMode]  = useState('kanban');
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
        {filteredMinutes.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/40 rounded-3xl border border-dashed border-gray-800">
            <ClipboardList className="mx-auto text-gray-800 mb-3" size={44} />
            <p className="text-gray-400 font-bold">
              {searchTerm || roleFilter !== 'Alle' || yearFilter !== 'Alle' || onlyOpenTasks || onlyMyTasks
                ? 'Keine Protokolle für diesen Filter gefunden.'
                : 'Noch keine Protokolle vorhanden.'}
            </p>
          </div>
        ) : (
          filteredMinutes.map(m => {
            const isExpanded = expandedId === m.id || searchTerm.trim().length > 0 || roleFilter !== 'Alle' || onlyOpenTasks || onlyMyTasks;
            const totalPts = m.traktanden ? Object.values(m.traktanden).reduce((acc, arr) => acc + (arr?.length || 0), 0) : 0;
            const openPts = m.traktanden
              ? Object.values(m.traktanden).reduce((acc, arr) => acc + (arr?.filter(p => p.type === 'todo' && !p.done).length || 0), 0)
              : 0;
            const dateObj = m.date ? new Date(m.date) : null;

            return (
              <div
                key={m.id}
                className={`bg-gray-900 border rounded-3xl transition-all duration-300 overflow-hidden shadow-xl ${
                  isExpanded ? 'border-orange-500/40 ring-1 ring-orange-500/10' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div
                  onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  className="p-5 sm:p-6 cursor-pointer hover:bg-gray-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {dateObj && (
                      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-3 text-center min-w-[64px] shrink-0">
                        <p className="text-[10px] font-black uppercase text-orange-500">
                          {dateObj.toLocaleDateString('de-CH', { month: 'short' })}
                        </p>
                        <p className="text-xl font-black text-white leading-tight">
                          {dateObj.toLocaleDateString('de-CH', { day: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-gray-500 font-bold">{dateObj.getFullYear()}</p>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest bg-gray-800 text-gray-300 px-2.5 py-0.5 rounded-md">
                          {totalPts} {totalPts === 1 ? 'Eintrag' : 'Einträge'}
                        </span>
                        {openPts > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 rounded-md">
                            {openPts} Pendenzen offen
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-white truncate">
                        {highlightText(m.title, searchTerm)}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-3 sm:pt-0 border-t sm:border-t-0 border-gray-800/60" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => copyProtocolSummary(m)}
                      title="Zusammenfassung kopieren"
                      className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 hover:text-orange-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Share2 size={18} />
                    </button>
                    <button
                      onClick={() => setReadingMinute(m)}
                      title="Lese- & Druckansicht"
                      className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 hover:text-orange-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Printer size={18} />
                    </button>
                    <button
                      onClick={() => setEditing(m)}
                      title="Bearbeiten"
                      className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-400 hover:text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Edit2 size={18} />
                    </button>
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() =>
                          askConfirm(
                            'Protokoll löschen',
                            `Möchtest du das Protokoll «${m.title}» wirklich unwiderruflich löschen?`,
                            async () => {
                              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'minutes', m.id));
                              notify("Protokoll gelöscht.", "info");
                            },
                            'Löschen'
                          )
                        }
                        className="p-3 bg-gray-800 hover:bg-red-500/20 rounded-xl text-gray-400 hover:text-red-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-6 sm:px-6 sm:pb-6 pt-2 border-t border-gray-800/80 space-y-5 bg-gray-950/30 animate-in fade-in duration-200">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-800/60">
                      <div className="flex flex-wrap gap-1.5">
                        {vorstandMembers.map(v => {
                          const status = m.attendance?.[v.id] || 'present';
                          return (
                            <span
                              key={v.id}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                                status === 'present'
                                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                  : status === 'excused'
                                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                                  : 'bg-red-500/10 border-red-500/30 text-red-500'
                              }`}
                            >
                              {v.firstName}: {status === 'present' ? 'Anwesend' : status === 'excused' ? 'Entschuldigt' : 'Abwesend'}
                            </span>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setCompactFactsOnly(!compactFactsOnly)}
                        className={`text-[11px] font-black uppercase px-3 py-1.5 rounded-xl border transition-all ${
                          compactFactsOnly
                            ? 'bg-orange-500 text-gray-950 border-orange-500'
                            : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white'
                        }`}
                      >
                        {compactFactsOnly ? '✓ Nur Beschlüsse & Pendenzen' : 'Nur Beschlüsse & Pendenzen'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {TRAKTANDEN.filter(t => roleFilter === 'Alle' || roleFilter === t).map(t => {
                        let pts = m.traktanden?.[t] || [];
                        if (compactFactsOnly) {
                          pts = pts.filter(p => p.type === 'decision' || p.type === 'todo');
                        }
                        if (pts.length === 0) return null;
                        const meta = traktandumMeta[t] || { badge: 'bg-gray-800 text-gray-300', dot: 'bg-orange-500' };
                        return (
                          <div key={t} className="bg-gray-900/90 p-4 rounded-2xl border border-gray-800/90 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${meta.badge}`}>
                                {t}
                              </span>
                              <span className="text-[10px] text-gray-500 font-bold">{pts.length} Pkt.</span>
                            </div>
                            <div className="space-y-2.5">
                              {pts.map((p, idx) => {
                                const typeKey = p.type === 'todo' && p.done ? 'done' : (p.type || 'info');
                                const tMeta = pointTypeMeta[typeKey] || pointTypeMeta.info;
                                return (
                                  <div key={p.id || idx} className="bg-gray-950/80 border border-gray-800/70 rounded-xl p-3.5 text-sm space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                        {p.type === 'todo' && (
                                          <button
                                            onClick={() => toggleTaskDone(m, t, p.id)}
                                            className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                                              p.done ? 'bg-emerald-500 border-emerald-500 text-gray-950' : 'border-orange-500 hover:bg-orange-500/20'
                                            }`}
                                          >
                                            {p.done && <Check size={13} strokeWidth={3} />}
                                          </button>
                                        )}
                                        <p className={`text-gray-200 whitespace-pre-wrap break-words leading-relaxed flex-1 ${p.done ? 'line-through text-gray-500' : ''}`}>
                                          {highlightText(p.text, searchTerm)}
                                        </p>
                                      </div>
                                      {p.type && p.type !== 'info' && (
                                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border shrink-0 ${tMeta.style}`}>
                                          {tMeta.label}
                                        </span>
                                      )}
                                    </div>
                                    {(p.assignee || p.dueDate || p.docUrl) && (
                                      <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-gray-800/60">
                                        {p.assignee && (
                                          <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded">
                                            @{p.assignee}
                                          </span>
                                        )}
                                        {p.dueDate && (
                                          <span className="text-[10px] font-bold text-gray-400 bg-gray-900 px-2 py-0.5 rounded">
                                            Frist: {new Date(p.dueDate).toLocaleDateString('de-CH')}
                                          </span>
                                        )}
                                        {p.docUrl && (
                                          <button
                                            type="button"
                                            onClick={() => setPreviewDoc({ url: p.docUrl, name: p.docName || 'Beilage' })}
                                            className="text-[10px] font-bold text-blue-400 hover:underline flex items-center gap-1"
                                          >
                                            <Paperclip size={11} /> {p.docName || 'Beilage ansehen'}
                                          </button>
                                        )}
                                      </div>
                                    )}
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
      </div>

      {readingMinute && (
        <ReadingViewModal
          minute={readingMinute}
          vorstandMembers={vorstandMembers}
          onClose={() => setReadingMinute(null)}
        />
      )}

      {previewDoc && (
        <FilePreviewModal
          file={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}

      {watchingLive && liveDraft && (
        <div className="fixed inset-0 z-[240] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-orange-500/40 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-ping" />
                <h3 className="font-black text-white">{liveDraft.form?.title || 'Live-Sitzung'}</h3>
              </div>
              <button onClick={() => setWatchingLive(false)} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {TRAKTANDEN.map(t => {
                const pts = liveDraft.form?.traktanden?.[t] || [];
                if (pts.length === 0) return null;
                return (
                  <div key={t} className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-2">
                    <h4 className="text-xs font-black uppercase text-orange-500">{t}</h4>
                    {pts.map((p, i) => (
                      <p key={p.id || i} className="text-sm text-gray-200 border-b border-gray-900 pb-1.5 last:border-0">
                        • {p.text}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProtocolEditor({ vorstand, currentUser, onSave, onCancel, initialData, notify }) {
  const [form, setForm] = useState(() => {
    if (initialData) return initialData;
    const defaultAttendance = {};
    vorstand.forEach(v => { defaultAttendance[v.id] = 'present'; });
    const defaultTraktanden = {};
    TRAKTANDEN.forEach(t => { defaultTraktanden[t] = []; });
    return {
      title: `Vorstandssitzung`,
      date: new Date().toISOString().slice(0, 10),
      attendance: defaultAttendance,
      traktanden: defaultTraktanden
    };
  });

  const [activeTraktandum, setActiveTraktandum] = useState(TRAKTANDEN[0]);
  const [newPointText, setNewPointText] = useState('');
  const [newPointType, setNewPointType] = useState('info');
  const [newPointAssignee, setNewPointAssignee] = useState('');
  const [newPointDueDate, setNewPointDueDate] = useState('');

  const addPoint = () => {
    if (!newPointText.trim()) return;
    const pt = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 5),
      text: newPointText.trim(),
      type: newPointType,
      status: 'open',
      done: false,
      assignee: newPointType === 'todo' ? newPointAssignee : '',
      dueDate: newPointType === 'todo' ? newPointDueDate : ''
    };
    const currentList = form.traktanden?.[activeTraktandum] || [];
    const nextForm = {
      ...form,
      traktanden: {
        ...form.traktanden,
        [activeTraktandum]: [...currentList, pt]
      }
    };
    setForm(nextForm);
    setNewPointText('');
    setNewPointDueDate('');
  };

  const removePoint = (tName, ptId) => {
    const list = form.traktanden?.[tName] || [];
    setForm({
      ...form,
      traktanden: {
        ...form.traktanden,
        [tName]: list.filter(x => x.id !== ptId)
      }
    });
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 sm:p-8 space-y-6 shadow-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h3 className="text-2xl font-black text-white">{initialData ? 'Protokoll bearbeiten' : 'Neues Sitzungsprotokoll'}</h3>
          <p className="text-xs text-gray-400 mt-1">Traktanden, Beschlüsse und Pendenzen erfassen</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={onCancel} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-300 font-bold text-sm">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            className="px-6 py-3 rounded-xl bg-orange-500 text-gray-950 font-black text-sm flex items-center gap-2 shadow-lg shadow-orange-500/20"
          >
            <Save size={16} /> Speichern
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Sitzungstitel</label>
          <input
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase">Datum</label>
          <input
            type="date"
            className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:border-orange-500 outline-none"
            value={form.date}
            onChange={e => setForm({ ...form, date: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="text-xs font-bold text-gray-400 uppercase block mb-2">Anwesenheit Vorstand</label>
        <div className="flex flex-wrap gap-2">
          {vorstand.map(v => {
            const st = form.attendance?.[v.id] || 'present';
            const nextStatus = st === 'present' ? 'excused' : st === 'excused' ? 'absent' : 'present';
            return (
              <button
                key={v.id}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    attendance: { ...form.attendance, [v.id]: nextStatus }
                  })
                }
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                  st === 'present'
                    ? 'bg-green-500/15 border-green-500/40 text-green-400'
                    : st === 'excused'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-red-500/15 border-red-500/40 text-red-400'
                }`}
              >
                {v.firstName}: {st === 'present' ? 'Anwesend' : st === 'excused' ? 'Entschuldigt' : 'Abwesend'}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {TRAKTANDEN.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTraktandum(t)}
            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase whitespace-nowrap transition-all ${
              activeTraktandum === t ? 'bg-orange-500 text-gray-950' : 'bg-gray-950 text-gray-400 border border-gray-800'
            }`}
          >
            {t} ({(form.traktanden?.[t] || []).length})
          </button>
        ))}
      </div>

      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'info', label: 'Info / Notiz' },
            { id: 'decision', label: 'Beschluss' },
            { id: 'todo', label: 'Pendenz (Aufgabe)' }
          ].map(tp => (
            <button
              key={tp.id}
              type="button"
              onClick={() => setNewPointType(tp.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                newPointType === tp.id ? 'bg-orange-500 text-gray-950' : 'bg-gray-900 text-gray-400'
              }`}
            >
              {tp.label}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          placeholder={`Eintrag für «${activeTraktandum}» eingeben...`}
          className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3.5 text-white focus:border-orange-500 outline-none text-sm"
          value={newPointText}
          onChange={e => setNewPointText(e.target.value)}
        />

        {newPointType === 'todo' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={newPointAssignee}
              onChange={e => setNewPointAssignee(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
            >
              <option value="">Verantwortlich wählen...</option>
              <option value="Gesamtvorstand">Gesamtvorstand</option>
              {vorstand.map(v => (
                <option key={v.id} value={`${v.firstName} ${v.lastName}`}>
                  {v.firstName} {v.lastName}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={newPointDueDate}
              onChange={e => setNewPointDueDate(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
            />
          </div>
        )}

        <button
          type="button"
          onClick={addPoint}
          className="bg-orange-500 hover:bg-orange-400 text-gray-950 font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider"
        >
          + Punkt zu {activeTraktandum} hinzufügen
        </button>

        <div className="space-y-2 pt-3 border-t border-gray-800">
          {(form.traktanden?.[activeTraktandum] || []).map(pt => (
            <div key={pt.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-orange-400">{pt.type}</span>
                <p className="text-sm text-white whitespace-pre-wrap">{pt.text}</p>
                {pt.assignee && <p className="text-xs text-gray-400">@{pt.assignee}</p>}
              </div>
              <button
                type="button"
                onClick={() => removePoint(activeTraktandum, pt.id)}
                className="text-gray-500 hover:text-red-500 p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventsView({ events, calItems = [], currentUser, isArchive, users, openQuizCount = 0, onOpenQuiz, notify, askConfirm }) {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (isArchive) return;
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isArchive]);

  const schmudoCountdown = useMemo(() => {
    const nextSchmudo = SCHMUDO_DATES
      .map(s => ({ ...s, targetMs: new Date(s.date).getTime() }))
      .find(s => s.targetMs > nowTs);

    if (!nextSchmudo) return null;
    const diff = Math.max(0, nextSchmudo.targetMs - nowTs);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return {
      year: nextSchmudo.year,
      dateFormatted: new Date(nextSchmudo.date).toLocaleDateString('de-CH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }),
      days,
      hours,
      minutes,
      seconds
    };
  }, [nowTs]);

  const isVorstand = useMemo(() => currentUser?.groups?.includes('Vorstand'), [currentUser]);

  const nextUpcomingCalItem = useMemo(() => {
    if (isArchive || !isVorstand) return null;
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcoming = [...calItems]
      .filter(c => (c.date || '') >= todayIso)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return upcoming[0] || null;
  }, [calItems, isArchive, isVorstand]);

  const currentEvent = useMemo(
    () => events.find(e => e.id === selectedEventId),
    [events, selectedEventId]
  );

  const saveEvent = async (ev) => {
    const id = ev.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', id), {
      ...ev,
      id,
      isArchived: ev.isArchived || false,
      surveys: ev.surveys || []
    });
    setShowCreate(false);
    setEditingEvent(null);
    notify("Event erfolgreich gespeichert.", "success");
  };

  if (currentEvent) {
    return (
      <EventDetail
        event={currentEvent}
        currentUser={currentUser}
        onBack={() => setSelectedEventId(null)}
        users={users}
        notify={notify}
        askConfirm={askConfirm}
      />
    );
  }

  return (
    <div className="space-y-6">
      {!isArchive && schmudoCountdown && (
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-orange-950/40 border border-orange-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-orange-500 text-gray-950 px-3 py-1 rounded-full shadow-md">
                <Sparkles size={12} /> Fasnachts-Countdown • Urknall 05:00 Uhr
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white italic tracking-tight">
                No <span className="text-orange-500">{schmudoCountdown.days}</span> Täg bis zom SchmuDo <span className="text-orange-500">{schmudoCountdown.year}</span>
              </h3>
              <p className="text-xs sm:text-sm text-gray-400 font-medium">
                Donnerstag, {schmudoCountdown.dateFormatted} • RüssSuuger Ämme
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3 shrink-0">
              {[
                { value: schmudoCountdown.days, label: 'Täg' },
                { value: String(schmudoCountdown.hours).padStart(2, '0'), label: 'Stond' },
                { value: String(schmudoCountdown.minutes).padStart(2, '0'), label: 'Min' },
                { value: String(schmudoCountdown.seconds).padStart(2, '0'), label: 'Sek' }
              ].map((unit, idx) => (
                <div
                  key={idx}
                  className="bg-gray-950/90 border border-orange-500/30 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-center min-w-[64px] sm:min-w-[78px] shadow-inner"
                >
                  <p className="text-xl sm:text-3xl font-black text-orange-500 tabular-nums leading-none">
                    {unit.value}
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1.5">
                    {unit.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isArchive && openQuizCount > 0 && onOpenQuiz && (
        <div
          onClick={onOpenQuiz}
          className="bg-gradient-to-r from-orange-500/20 via-amber-500/10 to-gray-900 border-2 border-orange-500/50 rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:border-orange-500 transition-all shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500 text-gray-950 rounded-xl shrink-0">
              <Trophy size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                Suuger-Quiz • Neue Tagesfrage offen!
              </p>
              <p className="text-sm font-black text-white">
                Du hast noch {openQuizCount} offene {openQuizCount === 1 ? 'Tagesfrage' : 'Tagesfragen'} – jetzt mitmachen!
              </p>
            </div>
          </div>
          <ChevronRight size={20} className="text-orange-500 shrink-0" />
        </div>
      )}

      {!isArchive && isVorstand && nextUpcomingCalItem && (
        <div className="bg-gradient-to-r from-orange-500/15 via-gray-900 to-gray-900 border border-orange-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500 text-gray-950 rounded-xl shrink-0">
              <CalendarDays size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Nächster Vorstands-/Vereinstermin</p>
              <p className="text-sm font-black text-white">
                {nextUpcomingCalItem.title} • {new Date(nextUpcomingCalItem.date).toLocaleDateString('de-CH')}
                {nextUpcomingCalItem.time ? ` (${nextUpcomingCalItem.time} Uhr)` : ''}
                {nextUpcomingCalItem.location ? ` – ${nextUpcomingCalItem.location}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-white">{isArchive ? 'Event-Archiv' : 'Aktuelle Events & Abstimmungen'}</h2>
        {currentUser.role === 'admin' && !isArchive && (
          <button
            onClick={() => setShowCreate(true)}
            className="bg-orange-500 text-gray-950 font-black px-5 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
          >
            <Plus size={18} /> Neues Event
          </button>
        )}
      </div>

      {(showCreate || editingEvent) && (
        <CreateEventForm
          initialData={editingEvent}
          onSave={saveEvent}
          onCancel={() => { setShowCreate(false); setEditingEvent(null); }}
        />
      )}

      <div className="grid gap-4">
        {events.length === 0 ? (
          <div className="text-center py-16 bg-gray-900/40 rounded-3xl border border-dashed border-gray-800">
            <Calendar className="mx-auto text-gray-700 mb-3" size={40} />
            <p className="text-gray-400 font-bold">Keine Events vorhanden.</p>
          </div>
        ) : (
          events.map(ev => {
            const activeCount = (ev.surveys || []).filter(s => s.status === 'active').length;
            return (
              <div
                key={ev.id}
                onClick={() => setSelectedEventId(ev.id)}
                className="bg-gray-900 border border-gray-800 hover:border-orange-500/50 rounded-3xl p-6 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/15 text-orange-400 px-2.5 py-0.5 rounded-full">
                      {ev.category || 'Event'}
                    </span>
                    {activeCount > 0 && (
                      <span className="text-[10px] font-black uppercase tracking-widest bg-green-500 text-gray-950 px-2.5 py-0.5 rounded-full animate-pulse">
                        Live-Abstimmung aktiv
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-white">{ev.title}</h3>
                  {ev.date && (
                    <p className="text-xs text-gray-400">
                      {new Date(ev.date).toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {currentUser.role === 'admin' && (
                    <>
                      <button
                        onClick={() => setEditingEvent(ev)}
                        className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300"
                        title="Event bearbeiten"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={async () => {
                          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', ev.id), {
                            isArchived: !ev.isArchived
                          });
                          notify(ev.isArchived ? "Event wiederhergestellt." : "Event archiviert.", "info");
                        }}
                        className="p-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300"
                        title={ev.isArchived ? "Wiederherstellen" : "Archivieren"}
                      >
                        <Archive size={16} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setSelectedEventId(ev.id)}
                    className="px-4 py-3 bg-orange-500 text-gray-950 font-black rounded-xl text-xs flex items-center gap-1"
                  >
                    Öffnen <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CreateEventForm({ onSave, onCancel, initialData }) {
  const [form, setForm] = useState(
    initialData || {
      title: '',
      category: CATEGORIES[0],
      date: new Date().toISOString().slice(0, 16)
    }
  );

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSave(form);
      }}
      className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 shadow-2xl"
    >
      <h3 className="text-lg font-black text-white">{initialData ? 'Event bearbeiten' : 'Neues Event erstellen'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <input
          required
          placeholder="Event-Titel"
          className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
        />
        <select
          className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
          value={form.category}
          onChange={e => setForm({ ...form, category: e.target.value })}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="datetime-local"
          className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
          value={form.date}
          onChange={e => setForm({ ...form, date: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-bold text-xs">
          Abbrechen
        </button>
        <button type="submit" className="px-6 py-2.5 rounded-xl bg-orange-500 text-gray-950 font-black text-xs">
          Speichern
        </button>
      </div>
    </form>
  );
}

function EventDetail({ event, currentUser, onBack, users, notify, askConfirm }) {
  const [showAddSurvey, setShowAddSurvey] = useState(false);
  const [editingSurvey, setEditingSurvey] = useState(null);
  const [presentingIdx, setPresentingIdx] = useState(null);
  const [confettiActive, setConfettiActive] = useState(false);

  const surveys = event.surveys || [];

  const updateSurveys = async (nextSurveys) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id), {
      surveys: nextSurveys
    });
  };

  const handleSaveSurvey = async (surveyData) => {
    const exists = surveys.some(s => s.id === surveyData.id);
    const next = exists
      ? surveys.map(s => (s.id === surveyData.id ? surveyData : s))
      : [...surveys, { ...surveyData, id: Date.now().toString(), votes: {} }];
    await updateSurveys(next);
    setShowAddSurvey(false);
    setEditingSurvey(null);
    notify("Umfrage gespeichert.", "success");
  };

  const handleStatusChange = async (surveyId, newStatus) => {
    const next = surveys.map(s => {
      if (s.id === surveyId) return { ...s, status: newStatus };
      if (newStatus === 'active' && s.status === 'active') return { ...s, status: 'published' };
      return s;
    });
    await updateSurveys(next);
    if (newStatus === 'published') {
      setConfettiActive(true);
      setTimeout(() => setConfettiActive(false), 3200);
    }
  };

  const handleVote = async (surveyId, selectedOptionIds) => {
    const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(eventRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const nextSurveys = (data.surveys || []).map(s => {
        if (s.id !== surveyId) return s;
        return {
          ...s,
          votes: {
            ...(s.votes || {}),
            [currentUser.id]: selectedOptionIds
          }
        };
      });
      tx.update(eventRef, { surveys: nextSurveys });
    });
    notify("Deine Stimme wurde gezählt!", "success");
  };

  const handleCreateRunoff = async (survey) => {
    const counts = {};
    (survey.options || []).forEach(o => { counts[o.id] = 0; });
    Object.values(survey.votes || {}).forEach(arr => {
      (Array.isArray(arr) ? arr : [arr]).forEach(optId => {
        if (counts[optId] !== undefined) counts[optId]++;
      });
    });
    const sorted = [...(survey.options || [])].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
    const topOptions = sorted.slice(0, 2).map((o, idx) => ({
      ...o,
      id: `runoff_${Date.now()}_${idx}`
    }));
    const runoffSurvey = {
      id: Date.now().toString(),
      question: `⚡ Stichwahl: ${survey.question}`,
      options: topOptions,
      maxAnswers: 1,
      status: 'active',
      allowedGroups: survey.allowedGroups || GROUPS,
      votes: {}
    };
    const next = surveys.map(s => (s.status === 'active' ? { ...s, status: 'published' } : s));
    await updateSurveys([...next, runoffSurvey]);
    notify("Stichwahl gestartet!", "success");
  };

  return (
    <div className="space-y-6">
      <ConfettiOverlay active={confettiActive} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="text-sm font-bold text-gray-400 hover:text-white flex items-center gap-1.5"
        >
          <ChevronRight size={18} className="rotate-180" /> Zurück zur Übersicht
        </button>
        {currentUser.role === 'admin' && (
          <div className="flex items-center gap-2">
            {surveys.length > 0 && (
              <button
                onClick={() => setPresentingIdx(0)}
                className="bg-gray-800 hover:bg-gray-700 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-2"
              >
                <Maximize2 size={15} /> Beamer-Modus
              </button>
            )}
            <button
              onClick={() => setShowAddSurvey(true)}
              className="bg-orange-500 text-gray-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
            >
              <Plus size={16} /> Umfrage hinzufügen
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6">
        <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">{event.category}</span>
        <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">{event.title}</h2>
      </div>

      {(showAddSurvey || editingSurvey) && (
        <CreateSurveyForm
          initialData={editingSurvey}
          onSave={handleSaveSurvey}
          onCancel={() => { setShowAddSurvey(false); setEditingSurvey(null); }}
        />
      )}

      <div className="space-y-4">
        {surveys.map((s, idx) => (
          <SurveyCard
            key={s.id}
            survey={s}
            currentUser={currentUser}
            users={users}
            onVote={opts => handleVote(s.id, opts)}
            onStatusChange={st => handleStatusChange(s.id, st)}
            onCreateRunoff={() => handleCreateRunoff(s)}
            onEdit={() => setEditingSurvey(s)}
            onPresent={() => setPresentingIdx(idx)}
            onDelete={() =>
              askConfirm('Umfrage löschen', `«${s.question}» wirklich löschen?`, async () => {
                await updateSurveys(surveys.filter(x => x.id !== s.id));
              })
            }
          />
        ))}
      </div>

      {presentingIdx !== null && surveys[presentingIdx] && (
        <PresentationModal
          event={event}
          survey={surveys[presentingIdx]}
          surveyIndex={presentingIdx}
          totalSurveys={surveys.length}
          users={users}
          onSelectSurvey={i => setPresentingIdx(i)}
          onStart={id => handleStatusChange(id, 'active')}
          onPublish={id => handleStatusChange(id, 'published')}
          onCreateRunoff={handleCreateRunoff}
          onClose={() => setPresentingIdx(null)}
        />
      )}
    </div>
  );
}

function CreateSurveyForm({ initialData, onSave, onCancel }) {
  const [question, setQuestion] = useState(initialData?.question || '');
  const [maxAnswers, setMaxAnswers] = useState(initialData?.maxAnswers || 1);
  const [allowedGroups, setAllowedGroups] = useState(initialData?.allowedGroups || [...GROUPS]);
  const [options, setOptions] = useState(
    initialData?.options || [
      { id: 'opt_1', text: 'Ja', youtubeUrl: '' },
      { id: 'opt_2', text: 'Nein', youtubeUrl: '' },
      { id: 'opt_3', text: 'Enthaltung', youtubeUrl: '' }
    ]
  );

  const addOption = () => {
    setOptions([...options, { id: `opt_${Date.now()}`, text: '', youtubeUrl: '' }]);
  };

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onSave({
          ...(initialData || {}),
          question,
          maxAnswers: Number(maxAnswers) || 1,
          allowedGroups,
          options: options.filter(o => o.text.trim()),
          status: initialData?.status || 'draft'
        });
      }}
      className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 shadow-2xl"
    >
      <h3 className="text-lg font-black text-white">{initialData ? 'Umfrage bearbeiten' : 'Neue Umfrage'}</h3>
      <input
        required
        placeholder="Frage / Abstimmungstitel"
        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white"
        value={question}
        onChange={e => setQuestion(e.target.value)}
      />

      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-400 uppercase">Antwortoptionen</label>
        {options.map((o, i) => (
          <div key={o.id} className="flex gap-2">
            <input
              required
              placeholder={`Option ${i + 1}`}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white"
              value={o.text}
              onChange={e => {
                const next = [...options];
                next[i] = { ...o, text: e.target.value };
                setOptions(next);
              }}
            />
            <input
              placeholder="Optional: YouTube-URL"
              className="w-48 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-300"
              value={o.youtubeUrl || ''}
              onChange={e => {
                const next = [...options];
                next[i] = { ...o, youtubeUrl: e.target.value };
                setOptions(next);
              }}
            />
            {options.length > 2 && (
              <button
                type="button"
                onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                className="p-2.5 text-gray-500 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addOption} className="text-xs font-black text-orange-500 hover:underline">
          + Weitere Option hinzufügen
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs font-bold text-gray-400 uppercase block">Max. Stimmen pro Person</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxAnswers}
            onChange={e => setMaxAnswers(e.target.value)}
            className="mt-1 w-24 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-white"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl bg-gray-800 text-gray-300 font-bold text-xs">
          Abbrechen
        </button>
        <button type="submit" className="px-6 py-2.5 rounded-xl bg-orange-500 text-gray-950 font-black text-xs">
          Umfrage speichern
        </button>
      </div>
    </form>
  );
}

function SurveyCard({ survey, currentUser, onVote, onStatusChange, onCreateRunoff, onEdit, onDelete, onPresent }) {
  const myVotes = survey.votes?.[currentUser.id] || [];
  const [selected, setSelected] = useState(myVotes);
  const [activePlayerUrl, setActivePlayerUrl] = useState(null);

  const totalVoters = Object.keys(survey.votes || {}).length;
  const hasVoted = myVotes.length > 0;

  const optionCounts = useMemo(() => {
    const map = {};
    (survey.options || []).forEach(o => { map[o.id] = 0; });
    Object.values(survey.votes || {}).forEach(v => {
      (Array.isArray(v) ? v : [v]).forEach(optId => {
        if (map[optId] !== undefined) map[optId]++;
      });
    });
    return map;
  }, [survey]);

  const totalVotesCast = Object.values(optionCounts).reduce((a, b) => a + b, 0);

  const toggleSelect = (optId) => {
    if (survey.status !== 'active') return;
    if (survey.maxAnswers === 1) {
      setSelected([optId]);
    } else {
      if (selected.includes(optId)) {
        setSelected(selected.filter(x => x !== optId));
      } else if (selected.length < (survey.maxAnswers || 1)) {
        setSelected([...selected, optId]);
      }
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
            survey.status === 'active'
              ? 'bg-green-500 text-gray-950'
              : survey.status === 'published'
              ? 'bg-orange-500/20 text-orange-400'
              : 'bg-gray-800 text-gray-400'
          }`}>
            {survey.status === 'active' ? 'Live-Abstimmung' : survey.status === 'published' ? 'Abstimmung Beendet' : 'Entwurf'}
          </span>
          <h3 className="text-xl font-black text-white mt-1.5">{survey.question}</h3>
          <p className="text-xs text-gray-400">Max. {survey.maxAnswers || 1} Stimme(n) • {totalVoters} Teilnehmende</p>
        </div>

        {currentUser.role === 'admin' && (
          <div className="flex flex-wrap items-center gap-2">
            {survey.status === 'draft' && (
              <button
                onClick={() => onStatusChange('active')}
                className="px-3.5 py-2 bg-green-500 text-gray-950 font-black rounded-xl text-xs"
              >
                Starten
              </button>
            )}
            {survey.status === 'active' && (
              <button
                onClick={() => onStatusChange('published')}
                className="px-3.5 py-2 bg-orange-500 text-gray-950 font-black rounded-xl text-xs"
              >
                Resultate publizieren
              </button>
            )}
            {survey.status === 'published' && (
              <button
                onClick={onCreateRunoff}
                className="px-3.5 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black rounded-xl text-xs flex items-center gap-1"
              >
                <Zap size={14} /> Stichwahl (Top 2)
              </button>
            )}
            <button onClick={onPresent} className="p-2.5 bg-gray-800 rounded-xl text-gray-300 hover:text-white" title="Präsentieren">
              <Maximize2 size={16} />
            </button>
            <button onClick={onEdit} className="p-2.5 bg-gray-800 rounded-xl text-gray-300 hover:text-white" title="Bearbeiten">
              <Edit2 size={16} />
            </button>
            <button onClick={onDelete} className="p-2.5 bg-gray-800 rounded-xl text-gray-400 hover:text-red-500" title="Löschen">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {(survey.options || []).map(opt => {
          const isChecked = selected.includes(opt.id);
          const count = optionCounts[opt.id] || 0;
          const pct = totalVotesCast > 0 ? Math.round((count / totalVotesCast) * 100) : 0;
          const embedUrl = getYouTubeEmbedUrl(opt.youtubeUrl);

          return (
            <div key={opt.id} className="space-y-2">
              <div
                onClick={() => toggleSelect(opt.id)}
                className={`p-4 rounded-2xl border transition-all ${
                  survey.status === 'active' ? 'cursor-pointer' : ''
                } ${
                  isChecked ? 'bg-orange-500/15 border-orange-500' : 'bg-gray-950 border-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {survey.status === 'active' && (
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center ${
                        isChecked ? 'bg-orange-500 border-orange-500 text-gray-950' : 'border-gray-600'
                      }`}>
                        {isChecked && <Check size={14} strokeWidth={3} />}
                      </div>
                    )}
                    <span className="font-bold text-white">{opt.text}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    {embedUrl && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setActivePlayerUrl(activePlayerUrl === embedUrl ? null : embedUrl);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-400 text-xs font-bold flex items-center gap-1"
                      >
                        <Play size={12} /> Reinhören
                      </button>
                    )}
                    {survey.status === 'published' && (
                      <span className="text-sm font-black text-orange-400">{count} ({pct}%)</span>
                    )}
                  </div>
                </div>

                {survey.status === 'published' && (
                  <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden mt-2.5">
                    <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              {activePlayerUrl === embedUrl && embedUrl && (
                <div className="rounded-2xl overflow-hidden border border-gray-800 bg-black aspect-video max-h-60">
                  <iframe src={embedUrl} title={opt.text} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {survey.status === 'active' && (
        <button
          disabled={selected.length === 0}
          onClick={() => onVote(selected)}
          className="w-full bg-orange-500 disabled:opacity-40 text-gray-950 font-black py-3.5 rounded-2xl shadow-lg"
        >
          {hasVoted ? 'Stimme aktualisieren ✓' : 'Stimme abgeben'}
        </button>
      )}
    </div>
  );
}

function PresentationModal({ event, survey, surveyIndex, totalSurveys, users, onSelectSurvey, onStart, onPublish, onCreateRunoff, onClose }) {
  const [showQrIntro, setShowQrIntro] = useState(survey.status === 'draft');
  const totalVoters = Object.keys(survey.votes || {}).length;
  const onlineUsersCount = users.filter(u => u.isOnline && Date.now() - (u.lastSeen || 0) < 120000).length;

  const optionCounts = useMemo(() => {
    const map = {};
    (survey.options || []).forEach(o => { map[o.id] = 0; });
    Object.values(survey.votes || {}).forEach(v => {
      (Array.isArray(v) ? v : [v]).forEach(optId => {
        if (map[optId] !== undefined) map[optId]++;
      });
    });
    return map;
  }, [survey]);

  const totalVotesCast = Object.values(optionCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-[260] bg-gray-950 flex flex-col p-6 sm:p-10 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-500">
            {event.title} • Abstimmung {surveyIndex + 1} / {totalSurveys}
          </p>
          <h2 className="text-2xl sm:text-4xl font-black text-white mt-1">{survey.question}</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={surveyIndex <= 0}
            onClick={() => onSelectSurvey(surveyIndex - 1)}
            className="px-3.5 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white disabled:opacity-40"
          >
            ←
          </button>
          <button
            disabled={surveyIndex >= totalSurveys - 1}
            onClick={() => onSelectSurvey(surveyIndex + 1)}
            className="px-3.5 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white disabled:opacity-40"
          >
            →
          </button>
          <button
            onClick={() => setShowQrIntro(!showQrIntro)}
            className="px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-xs font-black text-gray-300 flex items-center gap-1.5"
          >
            <QrCode size={16} /> QR-Code
          </button>
          {survey.status === 'active' && (
            <button
              onClick={() => onPublish(survey.id)}
              className="px-5 py-2.5 bg-orange-500 text-gray-950 font-black rounded-xl text-xs"
            >
              Resultate publizieren
            </button>
          )}
          <button onClick={onClose} className="p-2.5 bg-gray-900 rounded-xl text-gray-400 hover:text-white">
            <Minimize2 size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-4xl w-full mx-auto py-8">
        {showQrIntro ? (
          <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 text-center space-y-6 w-full max-w-xl">
            <StandardQRCodeImage value={window.location.origin} size={240} />
            <div>
              <p className="text-lg font-black text-white">Jetzt QR-Code scannen & abstimmen</p>
              <p className="text-sm text-gray-400 mt-1">{onlineUsersCount} Mitglieder aktuell online</p>
            </div>
            <button
              onClick={() => {
                setShowQrIntro(false);
                if (survey.status === 'draft') onStart(survey.id);
              }}
              className="w-full bg-orange-500 text-gray-950 font-black py-4 rounded-2xl text-lg"
            >
              Zur Abstimmung starten →
            </button>
          </div>
        ) : survey.status === 'published' ? (
          <div className="w-full space-y-4">
            {(survey.options || []).map(opt => {
              const count = optionCounts[opt.id] || 0;
              const pct = totalVotesCast > 0 ? Math.round((count / totalVotesCast) * 100) : 0;
              return (
                <div key={opt.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-2">
                  <div className="flex justify-between text-lg font-black text-white">
                    <span>{opt.text}</span>
                    <span className="text-orange-500">{count} Stimmen ({pct}%)</span>
                  </div>
                  <div className="w-full h-4 bg-gray-950 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between items-center pt-4">
              <button
                onClick={() => onCreateRunoff(survey)}
                className="px-5 py-3 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-black rounded-2xl text-xs flex items-center gap-2"
              >
                <Zap size={16} /> ⚡ Stichwahl mit den Bestplatzierten starten
              </button>
              {surveyIndex < totalSurveys - 1 && (
                <button
                  onClick={() => onSelectSurvey(surveyIndex + 1)}
                  className="px-6 py-3 bg-orange-500 text-gray-950 font-black rounded-2xl text-sm"
                >
                  Nächste Abstimmung →
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 bg-gray-900 border border-gray-800 rounded-3xl w-full space-y-4">
            <p className="text-orange-400 font-black uppercase tracking-widest text-sm">Abstimmung läuft live</p>
            <p className="text-6xl font-black text-white">{totalVoters}</p>
            <p className="text-gray-400 text-sm">Mitglieder haben bereits abgestimmt</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilesView({ folders, files, currentUser, notify, askConfirm }) {
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [uploading, setUploading] = useState(false);

  const createFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'folders', id), {
      id,
      name: newFolderName.trim(),
      createdAt: Date.now()
    });
    setNewFolderName('');
    notify("Ordner erstellt.", "success");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', id), {
        id,
        name: file.name,
        url: dataUrl,
        folderId: selectedFolderId || 'root',
        createdAt: Date.now()
      });
      notify("Datei hochgeladen.", "success");
    } catch (err) {
      notify("Upload fehlgeschlagen.", "error");
    }
    setUploading(false);
  };

  const visibleFiles = files.filter(f => (selectedFolderId ? f.folderId === selectedFolderId : true));

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Vorstands-Dateien</h2>
          <p className="text-sm text-gray-400">Dokumente, Reglemente & Vorlagen</p>
        </div>
        <label className="bg-orange-500 text-gray-950 font-black px-5 py-3 rounded-2xl text-xs cursor-pointer flex items-center gap-2">
          <UploadCloud size={18} /> {uploading ? 'Lädt hoch...' : 'Datei hochladen'}
          <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
        </label>
      </div>

      <form onSubmit={createFolder} className="flex gap-2">
        <input
          placeholder="Neuer Ordnername..."
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white"
        />
        <button type="submit" className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
          <FolderPlus size={16} /> Ordner anlegen
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedFolderId(null)}
          className={`px-4 py-2 rounded-xl text-xs font-black ${!selectedFolderId ? 'bg-orange-500 text-gray-950' : 'bg-gray-900 text-gray-400'}`}
        >
          Alle Dateien
        </button>
        {folders.map(fl => (
          <button
            key={fl.id}
            onClick={() => setSelectedFolderId(fl.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 ${
              selectedFolderId === fl.id ? 'bg-orange-500 text-gray-950' : 'bg-gray-900 text-gray-400'
            }`}
          >
            <Folder size={14} /> {fl.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {visibleFiles.map(f => (
          <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="text-orange-500" size={20} />
              <span className="font-bold text-white text-sm">{f.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => triggerFileDownload(f.url, f.name)}
                className="p-2 bg-gray-800 rounded-xl text-gray-300 hover:text-white"
              >
                <Download size={16} />
              </button>
              <button
                onClick={() =>
                  askConfirm('Datei löschen', `«${f.name}» wirklich löschen?`, async () => {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'files', f.id));
                  })
                }
                className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarView({ calItems, notify, askConfirm }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const addCalItem = async (e) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', id), {
      id,
      title: title.trim(),
      date,
      time,
      location: location.trim()
    });
    setTitle('');
    setDate('');
    setTime('');
    setLocation('');
    notify("Termin eingetragen.", "success");
  };

  const sorted = [...calItems].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Vereinskalender</h2>
          <p className="text-sm text-gray-400">Termine & Export für iPhone / Android</p>
        </div>
        {sorted.length > 0 && (
          <button
            onClick={() => downloadICSFile(sorted)}
            className="bg-orange-500 text-gray-950 font-black px-5 py-3 rounded-2xl text-xs flex items-center gap-2"
          >
            <Download size={16} /> Alle als .ICS exportieren
          </button>
        )}
      </div>

      <form onSubmit={addCalItem} className="bg-gray-900 border border-gray-800 rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3">
        <input required placeholder="Termin-Titel" value={title} onChange={e => setTitle(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white sm:col-span-2" />
        <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white" />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm text-white" />
        <button type="submit" className="bg-orange-500 text-gray-950 font-black rounded-xl px-4 py-2.5 text-xs">
          + Termin speichern
        </button>
      </form>

      <div className="grid gap-3">
        {sorted.map(item => (
          <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-orange-500">
                {new Date(item.date).toLocaleDateString('de-CH')} {item.time ? `• ${item.time} Uhr` : ''}
              </p>
              <h4 className="font-black text-white">{item.title}</h4>
              {item.location && <p className="text-xs text-gray-400">{item.location}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadICSFile(item, `${item.title}.ics`)}
                className="p-2 bg-gray-800 rounded-xl text-gray-300 hover:text-white"
                title="In Kalender speichern"
              >
                <Calendar size={16} />
              </button>
              <button
                onClick={() =>
                  askConfirm('Termin löschen', `«${item.title}» wirklich löschen?`, async () => {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'calendar', item.id));
                  })
                }
                className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersView({ users, notify, askConfirm }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('member');
  const [selectedGroups, setSelectedGroups] = useState(['Aktiv Musig']);

  const addMember = async (e) => {
    e.preventDefault();
    const f = sanitizeName(firstName);
    const l = sanitizeName(lastName);
    if (!f || !l) return;
    const id = `${f.toLowerCase()}_${l.toLowerCase()}_${Date.now().toString().slice(-4)}`;
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', id), {
      id,
      firstName: f,
      lastName: l,
      role,
      groups: selectedGroups,
      password: ''
    });
    setFirstName('');
    setLastName('');
    notify("Mitglied hinzugefügt.", "success");
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6">
        <h2 className="text-2xl font-black text-white">Mitgliederverwaltung ({users.length})</h2>
      </div>

      <form onSubmit={addMember} className="bg-gray-900 border border-gray-800 rounded-3xl p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required placeholder="Vorname" value={firstName} onChange={e => setFirstName(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" />
          <input required placeholder="Nachname" value={lastName} onChange={e => setLastName(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white" />
          <select value={role} onChange={e => setRole(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white">
            <option value="member">Mitglied</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map(g => {
            const active = selectedGroups.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() =>
                  setSelectedGroups(active ? selectedGroups.filter(x => x !== g) : [...selectedGroups, g])
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  active ? 'bg-orange-500 text-gray-950 border-orange-500' : 'bg-gray-950 text-gray-400 border-gray-800'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
        <button type="submit" className="bg-orange-500 text-gray-950 font-black px-5 py-3 rounded-xl text-xs">
          + Mitglied erfassen
        </button>
      </form>

      <div className="grid gap-2.5">
        {users.map(u => (
          <div key={u.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="font-black text-white">{u.firstName} {u.lastName}</p>
              <p className="text-xs text-gray-400">{(u.groups || []).join(', ')}</p>
            </div>
            <button
              onClick={() =>
                askConfirm('Mitglied löschen', `${u.firstName} ${u.lastName} wirklich löschen?`, async () => {
                  await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id));
                })
              }
              className="p-2 text-gray-500 hover:text-red-500"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadingViewModal({ minute, vorstandMembers, onClose }) {
  return (
    <div className="fixed inset-0 z-[260] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{minute.title}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="px-4 py-2 bg-orange-500 text-gray-950 font-black rounded-xl text-xs flex items-center gap-1.5">
              <Printer size={14} /> Drucken
            </button>
            <button onClick={onClose} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {TRAKTANDEN.map(t => {
            const pts = minute.traktanden?.[t] || [];
            if (pts.length === 0) return null;
            return (
              <div key={t} className="space-y-1.5">
                <h4 className="text-xs font-black uppercase text-orange-500">{t}</h4>
                {pts.map((p, idx) => (
                  <p key={p.id || idx} className="text-sm text-gray-200">• {p.text}</p>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilePreviewModal({ file, onClose }) {
  return (
    <div className="fixed inset-0 z-[260] bg-gray-950/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl max-w-3xl w-full p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-white">{file.name}</h3>
          <button onClick={onClose} className="p-2 bg-gray-800 rounded-xl text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => triggerFileDownload(file.url, file.name)}
            className="px-5 py-2.5 bg-orange-500 text-gray-950 font-black rounded-xl text-xs flex items-center gap-2"
          >
            <Download size={16} /> Herunterladen
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
        active
          ? 'bg-orange-500 text-gray-950 shadow-lg shadow-orange-500/20'
          : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
          active ? 'bg-gray-950 text-orange-500' : 'bg-red-500 text-white'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function MobileTabButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all ${
        active ? 'text-orange-500' : 'text-gray-500 hover:text-gray-300'
      }`}
    >
      {icon}
      <span className="text-[10px] font-black mt-0.5">{label}</span>
      {badge > 0 && (
        <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
          {badge}
        </span>
      )}
    </button>
  );
}
