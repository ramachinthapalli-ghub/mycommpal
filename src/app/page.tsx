'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  UserProfile,
  GoalType,
  Scores,
  GoalEffectiveness,
  ScenarioAlignment,
  Highlight,
  Technique,
  PracticePlan,
  MentorAssessResponse,
  MentorCompareResponse,
  PracticeSessionRecord,
} from '@/lib/types';

const SCENARIOS: Record<GoalType, string[]> = {
  Articulation: [
    "You're a Product Manager. Your VP asks: ‘Our team can build either an onboarding improvement or a reporting feature this quarter. Which would you prioritize, and why?’ Explain your thinking in about 60 seconds.",
    "In a sprint review, the Head of Sales asks why their top-requested enterprise feature is delayed to fix internal customer onboarding friction. Explain your recommendation, customer impact, and trade-offs.",
    "Your tech lead insists on spending 4 weeks addressing legacy technical debt, while business stakeholders want a new checkout capability. How do you articulate the priority, risks, and compromise to leadership?",
    "A major enterprise client threatens to churn unless you commit to a custom one-off roadmap feature by end of week. Articulate your position, strategic reasoning, and trade-offs to your executive team.",
  ],
  Storytelling: [
    "Tell the story of your product management journey and your core product philosophy to aspiring PMs. What was your biggest misconception when starting out, what was your turning-point realization, and what should they remember?",
    "Tell the story of a product experiment that completely failed. What was your initial assumption, what did actual customer behavior reveal, and how did it change your team's direction?",
    "Share the story of an unexpected customer discovery insight that convinced a skeptical engineering and design team to rethink a core workflow.",
    "Tell the story of a high-stakes cross-functional disagreement where you had no direct authority, but successfully influenced the teams to rally around customer value.",
  ],
  Presentations: [
    "You have 60 seconds to open an executive review proposing a major overhaul to your product's core funnel. State the customer problem, why now, and the exact decision you need from leadership today.",
    "Introduce a high-risk, high-reward AI experiment to leadership. Explain the user problem, proposed MVP scope, resource ask, and what metrics determine whether to kill or scale it.",
    "Open a quarterly product roadmap kickoff to cross-functional leads (Sales, Marketing, Eng). Align the room on the two primary business outcomes your team is accountable for delivering this quarter.",
  ],
};

const STEP_TITLES = ['My goal', 'Assess me', 'My plan', 'Practice'];

interface PracticeStreak {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string; // YYYY-MM-DD
  totalSessions: number;
  weeklyGoal: number; // e.g. 5
  historyDates: string[]; // YYYY-MM-DD
}

interface CompletedPracticeSession {
  id: string;
  scenario: string;
  focus: string;
  beforeScore: number;
  afterScore: number;
  verdict?: string;
  completedAt: string;
}

function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function calculateStreak(prev: PracticeStreak): PracticeStreak {
  const today = getTodayDateString();
  if (prev.lastPracticeDate === today) {
    return {
      ...prev,
      totalSessions: (prev.totalSessions || 0) + 1,
    };
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const isConsecutive = prev.lastPracticeDate === yesterday;
  const newStreak = isConsecutive ? (prev.currentStreak || 0) + 1 : 1;
  const newHistory = Array.from(new Set([...(prev.historyDates || []), today]));

  return {
    currentStreak: newStreak,
    longestStreak: Math.max(prev.longestStreak || 0, newStreak),
    lastPracticeDate: today,
    totalSessions: (prev.totalSessions || 0) + 1,
    weeklyGoal: prev.weeklyGoal || 5,
    historyDates: newHistory,
  };
}

function isDayActiveThisWeek(dayIndex: number, historyDates: string[]): boolean {
  if (!historyDates || historyDates.length === 0) return false;
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  const diffDays = dayIndex - currentDayOfWeek;
  const targetDate = new Date(now.getTime() + diffDays * 86400000);
  const targetStr = targetDate.toISOString().split('T')[0];
  return historyDates.includes(targetStr);
}

export default function MyCommPalApp() {
  // User Authentication State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Login Landing Dropdown State
  const [showLoginDropdown, setShowLoginDropdown] = useState(true);
  const [activeLoginMode, setActiveLoginMode] = useState<'phone' | 'email' | null>(null);

  const [authIdentifier, setAuthIdentifier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpDevHint, setOtpDevHint] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Flow State
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalType>('Articulation');
  const [audience, setAudience] = useState('Cross-functional stakeholders');
  const [scenarioMode, setScenarioMode] = useState<'vira' | 'mine'>('mine');
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [customSituation, setCustomSituation] = useState('');

  // Speech & Text input state
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [isRecording1, setIsRecording1] = useState(false);
  const [isRecording2, setIsRecording2] = useState(false);
  const [isRecordingSituation, setIsRecordingSituation] = useState(false);
  const [recTimer1, setRecTimer1] = useState('00:00');
  const [recTimer2, setRecTimer2] = useState('00:00');
  const [recTimerSituation, setRecTimerSituation] = useState('00:00');
  const speechBaseTextRef = useRef('');
  const recognitionRef = useRef<any>(null);
  const timerIntervalRef = useRef<any>(null);
  const shouldRecordRef = useRef(false);
  const activeInputIndexRef = useRef<1 | 2 | 3 | null>(null);
  const answer1Ref = useRef('');
  const answer2Ref = useRef('');
  const customSituationRef = useRef('');

  // Practice Plan state (Dynamic Guidance Configuration)
  const [planMinutes, setPlanMinutes] = useState(5);
  const [planFrequency, setPlanFrequency] = useState(3);

  function updatePlanMinutes(minutes: number) {
    setPlanMinutes(minutes);
    try {
      localStorage.setItem('mycommpal_plan_minutes', String(minutes));
    } catch (e) {}
  }

  function updatePlanFrequency(frequency: number) {
    setPlanFrequency(frequency);
    try {
      localStorage.setItem('mycommpal_plan_frequency', String(frequency));
    } catch (e) {}
  }

  // Practice Consistency & Streak state
  const [streakData, setStreakData] = useState<PracticeStreak>({
    currentStreak: 0,
    longestStreak: 0,
    lastPracticeDate: '',
    totalSessions: 0,
    weeklyGoal: 3,
    historyDates: [],
  });

  // Track verified completed practice sessions for current device/user
  const [completedPracticeList, setCompletedPracticeList] = useState<CompletedPracticeSession[]>([]);
  const [practicedSessionsCount, setPracticedSessionsCount] = useState<number>(0);
  const consecutiveSpeechErrorsRef = useRef(0);

  useEffect(() => {
    answer1Ref.current = answer1;
  }, [answer1]);
  useEffect(() => {
    answer2Ref.current = answer2;
  }, [answer2]);
  useEffect(() => {
    customSituationRef.current = customSituation;
  }, [customSituation]);

  // Load streak & practice guidance config from localStorage and load history in background
  useEffect(() => {
    try {
      const savedMin = localStorage.getItem('mycommpal_plan_minutes');
      if (savedMin) setPlanMinutes(Number(savedMin));
      const savedFreq = localStorage.getItem('mycommpal_plan_frequency');
      if (savedFreq) setPlanFrequency(Number(savedFreq));

      // Load active cycle practiced sessions count
      const savedCount = localStorage.getItem('mycommpal_cycle_practiced_count');
      if (savedCount !== null) {
        setPracticedSessionsCount(Number(savedCount));
      } else {
        setPracticedSessionsCount(0);
      }

      // Load verified completed practice sessions for current user/device
      const savedCompleted = localStorage.getItem('mycommpal_completed_sessions');
      if (savedCompleted) {
        const parsed = JSON.parse(savedCompleted);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCompletedPracticeList(parsed);
        }
      }

      const practiceCompleted = localStorage.getItem('mycommpal_practice_completed') === 'true';
      const saved = localStorage.getItem('mycommpal_streak');
      if (saved && practiceCompleted) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.totalSessions === 'number') {
          setStreakData(parsed);
        }
      } else if (!practiceCompleted) {
        // Reset to clean 0 state if no practice has been completed yet
        setStreakData({
          currentStreak: 0,
          longestStreak: 0,
          lastPracticeDate: '',
          totalSessions: 0,
          weeklyGoal: savedFreq ? Number(savedFreq) : 3,
          historyDates: [],
        });
      }
    } catch (e) {}

    // Load recent history sessions in background ONLY for full history modal (do not alter streak or completed list)
    fetch('/api/sessions')
      .then(res => res.json())
      .then(data => {
        if (data.sessions && Array.isArray(data.sessions)) {
          setHistorySessions(data.sessions);
        }
      })
      .catch(() => {});

    // Mobile visibility listener to safely pause speech if user switches apps
    const handleVisibilityChange = () => {
      if (document.hidden && shouldRecordRef.current) {
        stopSpeech();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Mentor Assessment state
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState<MentorAssessResponse | null>(null);

  // Comparison State
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<MentorCompareResponse | null>(null);

  // Multi-Attempt Practice State (Baseline -> Practice 1 -> Practice 2)
  const [practiceAttempt, setPracticeAttempt] = useState<1 | 2>(1);
  const [practice1Answer, setPractice1Answer] = useState('');
  const [practice1Scores, setPractice1Scores] = useState<Scores | null>(null);
  const [practice1GoalEff, setPractice1GoalEff] = useState<GoalEffectiveness | null>(null);
  const [practice1ScnAlign, setPractice1ScnAlign] = useState<ScenarioAlignment | null>(null);
  const [practice2Challenge, setPractice2Challenge] = useState<{ title?: string; exercise?: string; sentenceStarter?: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  // Progressive Disclosure View State
  const [coachingTab, setCoachingTab] = useState<'coaching' | 'scores' | 'deep_dive'>('coaching');
  const [deepDiveSections, setDeepDiveSections] = useState<Record<string, boolean>>({
    evidence: true,
    audit: false,
    transcript: false,
    cadence: false,
  });
  const [showFullComparison, setShowFullComparison] = useState(false);
  const [isCadenceExpanded, setIsCadenceExpanded] = useState(false);

  function toggleDeepDiveSection(section: string) {
    setDeepDiveSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }

  function handleTabKeyDown(e: React.KeyboardEvent, currentTab: 'coaching' | 'scores' | 'deep_dive') {
    const tabs: Array<'coaching' | 'scores' | 'deep_dive'> = ['coaching', 'scores', 'deep_dive'];
    const idx = tabs.indexOf(currentTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextTab = tabs[(idx + 1) % tabs.length];
      setCoachingTab(nextTab);
      document.getElementById(`tab-${nextTab}`)?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevTab = tabs[(idx - 1 + tabs.length) % tabs.length];
      setCoachingTab(prevTab);
      document.getElementById(`tab-${prevTab}`)?.focus();
    }
  }

  // Quick User Feedback state
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackTags, setFeedbackTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);

  // History State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historySessions, setHistorySessions] = useState<PracticeSessionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Initial Auth Check: Always present login screen first when user opens the live link
  useEffect(() => {
    setUser(null);
    setAuthLoading(false);
  }, []);

  // Land user smoothly on the starting input field whenever step or scenario mode changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });

    if (step === 1) {
      const timer = setTimeout(() => {
        const targetInput = scenarioMode === 'mine'
          ? (document.getElementById('mySituation') as HTMLTextAreaElement | null)
          : (document.getElementById('answer1') as HTMLTextAreaElement | null);

        if (targetInput) {
          targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetInput.focus({ preventScroll: true });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step, scenarioMode]);

  async function checkCurrentUser() {
    try {
      setAuthLoading(true);
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error('Failed to check user:', e);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }

  // Auth Handlers
  async function loginAsGuest() {
    try {
      setAuthLoading(true);
      const res = await fetch('/api/auth/guest', { method: 'POST' });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setShowLoginDropdown(false);
        setActiveLoginMode(null);
      }
    } catch (e) {
      console.error('Guest login failed:', e);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!authIdentifier.trim()) {
      setAuthError('Please enter your details.');
      return;
    }

    try {
      setOtpSending(true);
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: authIdentifier.trim(), type: activeLoginMode || 'phone' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      setOtpSent(true);
      if (data.devCode) {
        setOtpDevHint(`Test code: ${data.devCode}`);
        setOtpCode(data.devCode); // Auto-fill for convenience
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    if (!otpCode.trim()) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setOtpVerifying(true);
      const res = await fetch('/api/auth/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: authIdentifier.trim(), code: otpCode.trim(), type: activeLoginMode || 'phone' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid OTP code');

      setUser(data.user);
      setShowLoginDropdown(false);
      setActiveLoginMode(null);
      setOtpSent(false);
      setOtpDevHint(null);
      setAuthIdentifier('');
      setOtpCode('');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/me', { method: 'DELETE' });
    setUser(null);
    setShowLoginDropdown(false);
    setActiveLoginMode(null);
    setStep(0);
    setAnswer1('');
    setAnswer2('');
    setPractice1Answer('');
    setPracticeAttempt(1);
    setAssessment(null);
    setComparison(null);
    setCompletedPracticeList([]);
    setPracticedSessionsCount(0);
    try {
      localStorage.removeItem('mycommpal_cycle_practiced_count');
      localStorage.removeItem('mycommpal_completed_sessions');
      localStorage.removeItem('mycommpal_practice_completed');
      localStorage.removeItem('mycommpal_streak');
    } catch (e) {}
  }

  async function loadHistory() {
    try {
      setHistoryLoading(true);
      setShowHistoryModal(true);
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setHistorySessions(data.sessions || []);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Computed Current Scenario
  const currentScenarioText =
    scenarioMode === 'mine'
      ? customSituation.trim()
        ? `Your real situation: ${customSituation.trim()}\n\nVira: Explain what you would say to your audience. Start with your main point, then your reasoning and desired outcome.`
        : 'Describe your upcoming situation above to practice with your own challenge.'
      : SCENARIOS[goal][scenarioIndex % SCENARIOS[goal].length];

  // Deduplicate consecutive repeated phrases or words introduced by mobile speech engines
  function cleanDuplicatePhrases(text: string): string {
    if (!text) return '';
    const words = text.trim().split(/\s+/);
    if (words.length <= 1) return text.trim();

    // 1. Single word consecutive deduplication: "we we" -> "we"
    let currentWords: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (i === 0 || words[i].toLowerCase() !== words[i - 1].toLowerCase()) {
        currentWords.push(words[i]);
      }
    }

    // 2. Phrase consecutive deduplication from 15 down to 2 words
    // Catches mobile speech repetition like "I am trying to get into a situation I am trying to get into a situation"
    for (let phraseLen = 15; phraseLen >= 2; phraseLen--) {
      let j = 0;
      const deduped: string[] = [];
      while (j < currentWords.length) {
        if (j + phraseLen * 2 <= currentWords.length) {
          const phrase1 = currentWords.slice(j, j + phraseLen).map(w => w.toLowerCase()).join(' ');
          const phrase2 = currentWords.slice(j + phraseLen, j + phraseLen * 2).map(w => w.toLowerCase()).join(' ');
          if (phrase1 === phrase2) {
            for (let k = 0; k < phraseLen; k++) deduped.push(currentWords[j + k]);
            j += phraseLen * 2;
            continue;
          }
        }
        deduped.push(currentWords[j]);
        j++;
      }
      currentWords = deduped;
    }

    return currentWords.join(' ');
  }

  // Speech Recognition (Mobile-resilient with automatic segment recovery & phrase deduplication)
  function toggleSpeech(inputIndex: 1 | 2 | 3) {
    const isRecording =
      inputIndex === 1
        ? isRecording1
        : inputIndex === 2
        ? isRecording2
        : isRecordingSituation;

    if (isRecording) {
      stopSpeech();
      return;
    }

    // Stop any existing active recording session first
    stopSpeech();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech transcription is not supported in this browser. Please type your response directly.');
      return;
    }

    shouldRecordRef.current = true;
    activeInputIndexRef.current = inputIndex;

    const initialText = (
      inputIndex === 1
        ? answer1Ref.current
        : inputIndex === 2
        ? answer2Ref.current
        : customSituationRef.current
    ).trim();
    speechBaseTextRef.current = initialText;

    if (inputIndex === 1) {
      setIsRecording1(true);
      setRecTimer1('00:00');
    } else if (inputIndex === 2) {
      setIsRecording2(true);
      setRecTimer2('00:00');
    } else {
      setIsRecordingSituation(true);
      setRecTimerSituation('00:00');
    }

    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      const formatted = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      if (inputIndex === 1) setRecTimer1(formatted);
      else if (inputIndex === 2) setRecTimer2(formatted);
      else setRecTimerSituation(formatted);
    }, 250);

    startRecognitionSession(inputIndex);
  }

  function startRecognitionSession(inputIndex: 1 | 2 | 3) {
    if (!shouldRecordRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        // Collect progressive segments from event.results
        // Mobile Chrome/Brave frequently emits incremental supersets (e.g. "A", "A B", "A B C")
        // where each result contains the previous result as a prefix.
        const segments: string[] = [];

        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          const text = (item[0]?.transcript || '').trim();
          if (!text) continue;

          if (segments.length > 0) {
            const last = segments[segments.length - 1];
            const lastLower = last.toLowerCase();
            const textLower = text.toLowerCase();

            // 1. If text starts with last, text is an expanded replacement of last!
            if (textLower.startsWith(lastLower)) {
              segments[segments.length - 1] = text;
              continue;
            }

            // 2. If last starts with text, last was already more complete
            if (lastLower.startsWith(textLower)) {
              continue;
            }

            // 3. Word-level overlap detection: if text begins with the tail of last
            const lastWords = last.split(/\s+/);
            const textWords = text.split(/\s+/);
            let overlapCount = 0;
            for (let k = Math.min(lastWords.length, textWords.length, 12); k >= 1; k--) {
              const lastTail = lastWords.slice(-k).join(' ').toLowerCase();
              const textHead = textWords.slice(0, k).join(' ').toLowerCase();
              if (lastTail === textHead) {
                overlapCount = k;
                break;
              }
            }
            if (overlapCount > 0) {
              const newWords = textWords.slice(overlapCount);
              if (newWords.length > 0) {
                segments.push(newWords.join(' '));
              }
              continue;
            }
          }

          segments.push(text);
        }

        const rawCombined = segments.join(' ').trim();
        const cleanedSpoken = cleanDuplicatePhrases(rawCombined);

        // Merge cleanly with speechBaseTextRef (handling any overlap between restart sessions)
        let currentSpoken = cleanedSpoken;
        const base = speechBaseTextRef.current.trim();
        if (base) {
          const baseLower = base.toLowerCase();
          const spokenLower = cleanedSpoken.toLowerCase();

          if (spokenLower.startsWith(baseLower)) {
            currentSpoken = cleanedSpoken;
          } else if (baseLower.endsWith(spokenLower)) {
            currentSpoken = base;
          } else {
            // Check word overlap at boundary
            const baseWords = base.split(/\s+/);
            const spokenWords = cleanedSpoken.split(/\s+/);
            let boundaryOverlap = 0;
            for (let k = Math.min(baseWords.length, spokenWords.length, 12); k >= 1; k--) {
              const baseEnd = baseWords.slice(-k).join(' ').toLowerCase();
              const spokenStart = spokenWords.slice(0, k).join(' ').toLowerCase();
              if (baseEnd === spokenStart) {
                boundaryOverlap = k;
                break;
              }
            }
            if (boundaryOverlap > 0) {
              currentSpoken = `${base} ${spokenWords.slice(boundaryOverlap).join(' ')}`.trim();
            } else {
              currentSpoken = `${base} ${cleanedSpoken}`.trim();
            }
          }
        }

        currentSpoken = cleanDuplicatePhrases(currentSpoken);

        consecutiveSpeechErrorsRef.current = 0;
        if (inputIndex === 1) {
          setAnswer1(currentSpoken);
          answer1Ref.current = currentSpoken;
        } else if (inputIndex === 2) {
          setAnswer2(currentSpoken);
          answer2Ref.current = currentSpoken;
        } else if (inputIndex === 3) {
          setCustomSituation(currentSpoken);
          customSituationRef.current = currentSpoken;
        }
      };

      recognition.onstart = () => {
        consecutiveSpeechErrorsRef.current = 0;
      };

      recognition.onerror = (e: any) => {
        // Normal mobile pause while thinking — do NOT abort recording!
        if (e.error === 'no-speech') {
          console.warn('Speech pause detected, maintaining active mic session...');
          return;
        }
        consecutiveSpeechErrorsRef.current += 1;
        if (e.error === 'not-allowed' || e.error === 'audio-capture') {
          console.error('Microphone permission denied:', e.error);
          stopSpeech();
          alert('Could not access microphone. Please grant permission in your browser settings or type your answer.');
          return;
        }
        if (consecutiveSpeechErrorsRef.current >= 3) {
          console.warn('Multiple consecutive speech recognition errors, stopping mic');
          stopSpeech();
          return;
        }
        console.warn('Speech recognition warning:', e.error);
      };

      recognition.onend = () => {
        // Mobile browsers automatically time out or terminate speech recognition after ~10 seconds.
        // If user hasn't manually tapped stop, seamlessly restart listening!
        if (shouldRecordRef.current && activeInputIndexRef.current === inputIndex) {
          speechBaseTextRef.current = (
            inputIndex === 1
              ? answer1Ref.current
              : inputIndex === 2
              ? answer2Ref.current
              : customSituationRef.current
          ).trim();

          setTimeout(() => {
            if (shouldRecordRef.current && activeInputIndexRef.current === inputIndex) {
              startRecognitionSession(inputIndex);
            }
          }, 80);
        } else {
          stopSpeech();
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Speech recognition initialization error:', e);
      if (shouldRecordRef.current) {
        setTimeout(() => {
          if (shouldRecordRef.current) startRecognitionSession(inputIndex);
        }, 120);
      } else {
        stopSpeech();
      }
    }
  }

  function stopSpeech() {
    shouldRecordRef.current = false;
    activeInputIndexRef.current = null;
    consecutiveSpeechErrorsRef.current = 0;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecording1(false);
    setIsRecording2(false);
    setIsRecordingSituation(false);
  }

  // Assessment Step Handlers
  async function handleAssess() {
    stopSpeech();
    setApiError(null);

    if (scenarioMode === 'mine' && customSituation.trim().length < 15) {
      const sitEl = document.getElementById('mySituation');
      if (sitEl) {
        sitEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sitEl.focus();
      }
      setApiError('Please describe your upcoming situation (at least 15 characters) above, or tap "Practice Vira’s scenario instead".');
      return;
    }

    if (answer1.trim().length < 35) {
      const ansEl = document.getElementById('answer1');
      if (ansEl) {
        ansEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ansEl.focus();
      }
      setApiError(`Please share a little more of your thinking (${answer1.trim().length}/35 characters entered) so Vira can give calibrated feedback.`);
      return;
    }

    try {
      setAssessing(true);
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'assess',
          goal,
          audience,
          scenario: currentScenarioText,
          transcript: answer1.trim(),
          scenarioMode,
          attemptType: 'baseline',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to evaluate response');

      setAssessment(data);
      setCoachingTab('coaching');
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      setApiError(e.message || 'Something went wrong. Please retry.');
    } finally {
      setAssessing(false);
    }
  }

  // Comparison Step Handlers
  async function handleCompare() {
    stopSpeech();
    setApiError(null);
    if (answer2.trim().length < 35) {
      const ans2El = document.getElementById('answer2');
      if (ans2El) {
        ans2El.scrollIntoView({ behavior: 'smooth', block: 'center' });
        ans2El.focus();
      }
      setApiError(`Please complete your retry attempt (${answer2.trim().length}/35 characters entered) before comparing.`);
      return;
    }

    if (!assessment) return;

    try {
      setComparing(true);
      const requestPayload: any = {
        mode: 'compare',
        userId: user?.id,
        goal,
        audience,
        scenario: currentScenarioText,
        firstTranscript: answer1.trim(),
        focus: assessment.focus,
        firstScores: assessment.scores,
        firstGoalEffectiveness: assessment.goalEffectiveness,
        firstScenarioAlignment: assessment.scenarioAlignment,
        practicePlan: { minutes: planMinutes, frequency: planFrequency },
        assessment,
        scenarioMode,
        attemptIndex: practiceAttempt,
        firstPmDecisionScores: assessment.pmDecisionScores,
      };

      if (practiceAttempt === 1) {
        requestPayload.secondTranscript = answer2.trim();
      } else {
        requestPayload.secondTranscript = practice1Answer.trim() || answer2.trim();
        requestPayload.thirdTranscript = answer2.trim();
        requestPayload.practice1Scores = practice1Scores || assessment.scores;
        requestPayload.practice1GoalEffectiveness = practice1GoalEff;
        requestPayload.practice1ScenarioAlignment = practice1ScnAlign;
      }

      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to compare responses');

      if (practiceAttempt === 1 && data.secondScores) {
        setPractice1Scores(data.secondScores);
        setPractice1GoalEff(data.secondGoalEffectiveness || null);
        setPractice1ScnAlign(data.secondScenarioAlignment || null);
      }

      if (data.nextChallenge) {
        setPractice2Challenge(data.nextChallenge);
      }

      setComparison(data);

      // Refresh active cycle practice sessions count immediately
      setPracticedSessionsCount(prev => {
        const next = prev + 1;
        try {
          localStorage.setItem('mycommpal_cycle_practiced_count', String(next));
          localStorage.setItem('mycommpal_practice_completed', 'true');
        } catch (e) {}
        return next;
      });

      // Create verified completed practice record
      const currentFocus = assessment?.focus || 'Articulation';
      const baselineScore = assessment?.scores ? (assessment.scores[assessment.focus] || 2) : 2;
      const retryScore = data.focusAfter || 4;

      const newSessionRecord: CompletedPracticeSession = {
        id: data.savedSessionId || `session_${Date.now()}`,
        scenario: (currentScenarioText || 'PM Scenario').slice(0, 42) + ((currentScenarioText || '').length > 42 ? '...' : ''),
        focus: currentFocus,
        beforeScore: baselineScore,
        afterScore: retryScore,
        verdict: data.verdict || 'improved',
        completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setCompletedPracticeList(prev => {
        const filtered = prev.filter(s => s.id !== newSessionRecord.id);
        const updated = [newSessionRecord, ...filtered];
        try {
          localStorage.setItem('mycommpal_completed_sessions', JSON.stringify(updated));
          localStorage.setItem('mycommpal_practice_completed', 'true');
        } catch (e) {}
        return updated;
      });

      // Update consistency streak
      setStreakData(prev => {
        const next = calculateStreak(prev);
        try {
          localStorage.setItem('mycommpal_streak', JSON.stringify(next));
        } catch (e) {}
        return next;
      });
      setShowFullComparison(false);
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (e: any) {
      setApiError(e.message || 'Comparison failed. Please retry.');
      alert(e.message || 'Comparison failed. Please retry.');
    } finally {
      setComparing(false);
    }
  }

  function handlePracticeAgain() {
    stopSpeech();
    setApiError(null);
    if (comparison?.nextChallenge) {
      setPractice2Challenge(comparison.nextChallenge);
    }
    // If completing Practice 1, preserve answer as Practice 1 and advance to Practice 2
    if (answer2.trim().length >= 35) {
      setPractice1Answer(answer2.trim());
    }
    setPracticeAttempt(2);
    setAnswer2('');
    setComparison(null);
    setShowFullComparison(false);
    setFeedbackSubmitted(false);
    setFeedbackRating(null);
    setFeedbackTags([]);
    setFeedbackComment('');
    setTimeout(() => {
      const topOfStep = document.getElementById('step4-section') || document.querySelector('.main');
      if (topOfStep) {
        topOfStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 60);
  }

  async function handleSubmitFeedback(overrideRating?: number) {
    const ratingToSubmit = overrideRating || feedbackRating;
    if (!ratingToSubmit) return;
    try {
      setFeedbackSubmitting(true);
      await fetch('/api/sessions/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: comparison?.savedSessionId,
          userId: user?.id,
          goal,
          audience,
          focus: assessment?.focus,
          rating: ratingToSubmit,
          tags: feedbackTags,
          comment: feedbackComment.trim(),
        }),
      });
      if (!overrideRating) {
        setFeedbackSubmitted(true);
      }
    } catch (e) {
      console.error('Failed to submit feedback:', e);
      if (!overrideRating) {
        setFeedbackSubmitted(true);
      }
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  function handleCopySummary() {
    const feedbackLine = feedbackRating
      ? `\n\nUser Feedback on Guidance: ${feedbackRating}/5 ${feedbackTags.length ? '· ' + feedbackTags.join(', ') : ''} ${feedbackComment ? '· "' + feedbackComment + '"' : ''}`
      : '';

    const summary = `MyCommPal Practice Session with Vira
Goal: ${goal}
Audience: ${audience}
Scenario: ${currentScenarioText}
Focus Skill: ${assessment?.focus || 'Structure'}
Initial Score: ${assessment?.scores[assessment.focus]} / 5
Retry Score: ${comparison?.focusAfter || 'N/A'} / 5
Verdict: ${comparison?.verdict || 'N/A'}

Baseline Attempt:
"${answer1}"

Retry Attempt:
"${answer2}"

Key Improvement:
${comparison?.whatImproved || 'Applied calibrated structure technique.'}${feedbackLine}`;

    navigator.clipboard?.writeText(summary)
      .then(() => alert('Practice session summary copied to clipboard!'))
      .catch(() => alert('Clipboard access unavailable.'));
  }

  function startNewPracticeSession() {
    stopSpeech();
    setAnswer1('');
    setAnswer2('');
    setCustomSituation('');
    setAssessment(null);
    setComparison(null);
    setPracticeAttempt(1);
    setPractice1Answer('');
    setPractice1Scores(null);
    setPractice1GoalEff(null);
    setPractice1ScnAlign(null);
    setPractice2Challenge(null);
    setFeedbackRating(null);
    setFeedbackTags([]);
    setFeedbackComment('');
    setFeedbackSubmitted(false);
    setApiError(null);
    setScenarioMode('mine');
    setStep(0);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function handleStartOver() {
    startNewPracticeSession();
    // Reset cycle completed practice sessions count so progress streak is hidden and starts fresh
    setPracticedSessionsCount(0);
    setCompletedPracticeList([]);
    try {
      localStorage.removeItem('mycommpal_cycle_practiced_count');
      localStorage.removeItem('mycommpal_completed_sessions');
      localStorage.removeItem('mycommpal_practice_completed');
      localStorage.removeItem('mycommpal_streak');
    } catch (e) {}
  }

  function handleNextScenario() {
    setScenarioIndex(prev => prev + 1);
    setAnswer1('');
    setAnswer2('');
    setCustomSituation('');
    setAssessment(null);
    setComparison(null);
    setPracticeAttempt(1);
    setPractice1Answer('');
    setPractice1Scores(null);
    setPractice1GoalEff(null);
    setPractice1ScnAlign(null);
    setPractice2Challenge(null);
    setFeedbackRating(null);
    setFeedbackTags([]);
    setFeedbackComment('');
    setFeedbackSubmitted(false);
    setApiError(null);
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // VIEW 1: INITIAL LOGIN SCREEN (Shown initially when user accesses the app)
  // =========================================================================
  if (!user && !authLoading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand" style={{ justifyContent: 'center', marginBottom: '8px' }}>
            <span className="brand-logo">✨</span>
            <span className="wordmark">
              My<span>Comm</span>Pal
            </span>
          </div>
          <div className="tiny" style={{ marginBottom: '24px' }}>
            Your personal AI communication mentor
          </div>

          <div className="vira" style={{ textAlign: 'left', marginBottom: '24px' }}>
            <span className="avatar">👩‍💼</span>
            <div className="bubble">
              <b>Meet Vira</b>
              <p>Practice realistic PM conversations, receive calibrated feedback, and strengthen your articulation one session at a time.</p>
            </div>
          </div>

          {authError && (
            <div
              style={{
                background: '#ffeef2',
                border: '1px solid #ffccd7',
                color: '#cf1746',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '13px',
                marginBottom: '16px',
                textAlign: 'left',
              }}
            >
              {authError}
            </div>
          )}

          {/* If an active mode (mobile or email) is selected, show the input form */}
          {activeLoginMode ? (
            <div style={{ textAlign: 'left', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 800 }}>
                  {activeLoginMode === 'phone' ? '📱 Mobile OTP Login' : '✉️ Email OTP Login'}
                </h3>
                <button
                  type="button"
                  className="reset"
                  onClick={() => {
                    setActiveLoginMode(null);
                    setOtpSent(false);
                    setAuthError(null);
                    setAuthIdentifier('');
                    setOtpCode('');
                  }}
                >
                  ← Other options
                </button>
              </div>

              {!otpSent ? (
                <form onSubmit={handleSendOtp}>
                  <label className="field" htmlFor="loginInput">
                    {activeLoginMode === 'phone' ? 'Mobile phone number' : 'Work or personal email'}
                  </label>
                  <input
                    id="loginInput"
                    className="input"
                    type={activeLoginMode === 'phone' ? 'tel' : 'email'}
                    placeholder={activeLoginMode === 'phone' ? 'e.g. 9989624123 or +1 555-0199' : 'e.g. alex@company.com'}
                    value={authIdentifier}
                    onChange={e => setAuthIdentifier(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn"
                    style={{ width: '100%', marginTop: '16px' }}
                    disabled={otpSending}
                  >
                    {otpSending ? 'Sending verification code...' : 'Send Verification Code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp}>
                  <label className="field" htmlFor="otpInput">
                    Enter 6-digit verification code sent to {authIdentifier}
                  </label>
                  <input
                    id="otpInput"
                    className="input"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                    required
                    autoFocus
                  />
                  <div className="tiny" style={{ color: '#6545e8', marginTop: '6px', fontWeight: 600 }}>
                    {otpDevHint ? `${otpDevHint} (Auto-filled)` : '💡 Quick test code: 123456'}
                  </div>
                  <button
                    type="submit"
                    className="btn"
                    style={{ width: '100%', marginTop: '16px' }}
                    disabled={otpVerifying}
                  >
                    {otpVerifying ? 'Verifying...' : 'Verify & Enter MyCommPal'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <button
                      type="button"
                      className="reset"
                      onClick={() => setOtpSent(false)}
                    >
                      ← Change {activeLoginMode === 'phone' ? 'phone number' : 'email'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Otherwise, show the Login Button with Dropdown */
            <div className="login-dropdown-wrapper">
              <button
                type="button"
                className="btn login-trigger-btn"
                onClick={() => setShowLoginDropdown(prev => !prev)}
              >
                <span>Login to MyCommPal</span>
                <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: showLoginDropdown ? 'rotate(180deg)' : 'none' }}>
                  ▾
                </span>
              </button>

              {showLoginDropdown && (
                <div className="login-dropdown-menu">
                  {/* Option 1: Mobile OTP */}
                  <button
                    type="button"
                    className="login-dropdown-item"
                    onClick={() => {
                      setActiveLoginMode('phone');
                      setShowLoginDropdown(false);
                      setAuthError(null);
                    }}
                  >
                    <span className="login-dropdown-icon">📱</span>
                    <div>
                      <strong>Mobile OTP</strong>
                      <span>Sign in with your mobile phone number</span>
                    </div>
                  </button>

                  {/* Option 2: Email OTP */}
                  <button
                    type="button"
                    className="login-dropdown-item"
                    onClick={() => {
                      setActiveLoginMode('email');
                      setShowLoginDropdown(false);
                      setAuthError(null);
                    }}
                  >
                    <span className="login-dropdown-icon">✉️</span>
                    <div>
                      <strong>Email OTP</strong>
                      <span>Sign in with your email address</span>
                    </div>
                  </button>

                  {/* Option 3: Continue as Guest */}
                  <button
                    type="button"
                    className="login-dropdown-item"
                    onClick={loginAsGuest}
                  >
                    <span className="login-dropdown-icon">👤</span>
                    <div>
                      <strong>Continue as Guest</strong>
                      <span>1-click immediate access, no codes needed</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="footer" style={{ justifyContent: 'center', marginTop: '30px' }}>
            <span>Data persists in Supabase. All sessions are secure.</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: AUTHENTICATED APP (Full 4-Screen HTML Prototype Flow)
  // =========================================================================
  // Active practice cycle completed sessions count
  const totalCompletedSessions = practicedSessionsCount;
  const hasCompletedPracticeSession = totalCompletedSessions > 0;

  // Dynamic practice guidance target config (Cadence matching)
  const targetSessions = Math.max(1, planFrequency || 3);
  const sessionDuration = planMinutes || 5;

  // Has user completed all configured sessions in their cadence?
  const isTargetReached = totalCompletedSessions >= targetSessions;

  // Display ratio e.g. 1/3, 2/3, 3/3 (clamped to targetSessions for display)
  const displayRatio = `${Math.min(totalCompletedSessions, targetSessions)}/${targetSessions}`;

  // Progress Bar percentage (guaranteed 100% when all configured sessions are completed)
  const progressPercent = isTargetReached
    ? 100
    : Math.min(100, Math.round((totalCompletedSessions / targetSessions) * 100));
  const remainingInTarget = Math.max(0, targetSessions - totalCompletedSessions);

  return (
    <div className="shell">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">✨</span>
          <span className="wordmark">
            My<span>Comm</span>Pal
          </span>
        </div>
        <div className="tiny">Your personal AI communication mentor</div>

        {/* Steps */}
        <div className="steps">
          {STEP_TITLES.map((title, i) => {
            const isActive = step === i;
            const isDone = step > i;
            return (
              <div
                key={title}
                className={`step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => {
                  if (i <= step) {
                    stopSpeech();
                    if (i === 0 && (comparison || assessment || answer1 || answer2)) {
                      startNewPracticeSession();
                    } else {
                      setStep(i);
                      window.scrollTo({ top: 0, behavior: 'instant' });
                    }
                  }
                }}
              >
                <span>{isDone ? '✓' : i + 1}</span>
                {title}
              </div>
            );
          })}
        </div>

        {/* Progress Streak Section (Shown ONLY when user has completed at least one practice session) */}
        {hasCompletedPracticeSession && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7b7194', marginBottom: '6px', paddingLeft: '4px' }}>
              Progress Streak
            </div>
            <div className="sidebar-streak-card" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#2d1b54' }}>
                  🔥 Practice Sessions
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: isTargetReached ? '#059669' : '#7c3aed' }}>
                  {displayRatio}
                </span>
              </div>

              {/* On top of progress bar show text: Target 3 sessions (5min each). 1/3 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', marginBottom: '4px' }}>
                <span className="tiny" style={{ color: '#665c80', fontSize: '11.5px', fontWeight: 600 }}>
                  Target {targetSessions} {targetSessions === 1 ? 'session' : 'sessions'} ({sessionDuration}min each). {displayRatio}
                </span>
              </div>

              {/* Dynamic Progress Bar (Guaranteed 100% full when all sessions completed) */}
              <div style={{ background: '#ede7fb', borderRadius: '8px', height: '9px', overflow: 'hidden', margin: '4px 0 8px' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    background: isTargetReached
                      ? 'linear-gradient(90deg, #10b981, #059669)'
                      : 'linear-gradient(90deg, #7c3aed, #4f46e5)',
                    height: '100%',
                    borderRadius: '8px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>

              {/* Session Rep Badges (Dynamically matches user cadence target) */}
              <div className="sidebar-session-pills">
                {Array.from({ length: targetSessions }).map((_, idx) => {
                  const isDone = idx < totalCompletedSessions;
                  return (
                    <span key={idx} className={`sidebar-rep-pill ${isDone ? 'done' : ''}`}>
                      <span>Rep {idx + 1}</span>
                      <span>{isDone ? '✓' : '·'}</span>
                    </span>
                  );
                })}
              </div>

              {/* Under progress bar text: Target reached (3 completed) when all configured sessions completed */}
              <div className="tiny" style={{ color: isTargetReached ? '#059669' : '#554e66', margin: '6px 0 2px', fontSize: '11.5px', fontWeight: isTargetReached ? 700 : 500 }}>
                {isTargetReached
                  ? `🎉 Target reached (${targetSessions} completed)`
                  : `🎯 ${remainingInTarget} more ${remainingInTarget === 1 ? 'session' : 'sessions'} to complete your target`}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Profile Widget */}
        <div className="sidebar-bottom">
          <div className="side-profile">
            <span className="avatar">👩‍💼</span>
            <div>
              <b>Meet Vira</b>
              <div className="tiny">Your articulation mentor</div>
            </div>
          </div>
          Your ideas deserve to be heard.
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {/* Top Header Bar */}
        <div className="top">
          <span className="eyebrow">PRACTICE WITH VIRA · SPEAK WITH IMPACT</span>
          <div className="top-actions">
            {user && (
              <>
                <span className={`badge ${user.authType === 'guest' ? 'guest' : 'verified'}`}>
                  {user.authType === 'guest' ? '👤 Guest' : user.authType === 'phone' ? '📱' : '✉️'}{' '}
                  {user.identifier}
                </span>
                <button className="btn ghost" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={handleLogout}>
                  Sign out
                </button>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Panels */}
        <div className="panel">
          {/* SCREEN 01: YOUR GOAL */}
          {step === 0 && (
            <section>
              <span className="eyebrow">01 / YOUR GOAL</span>
              <h1>Grow your voice. Grow your impact.</h1>
              <p>
                Meet Vira, your personal AI communication mentor. Practice realistic product management conversations,
                get targeted feedback, and strengthen your articulation one session at a time.
              </p>

              <div className="vira">
                <span className="avatar">👩‍💼</span>
                <div className="bubble">
                  <b>Vira</b>
                  <p>Hi there! What communication skill would you like us to work on together today?</p>
                </div>
              </div>

              {/* Goal Cards */}
              <div className="cards">
                <button
                  type="button"
                  className={`option ${goal === 'Articulation' ? 'selected' : ''}`}
                  onClick={() => {
                    setGoal('Articulation');
                    setScenarioMode('mine');
                  }}
                >
                  <strong>💬</strong>
                  Articulate my ideas
                </button>
                <button
                  type="button"
                  className={`option ${goal === 'Storytelling' ? 'selected' : ''}`}
                  onClick={() => {
                    setGoal('Storytelling');
                    setScenarioMode('mine');
                  }}
                >
                  <strong>📖</strong>
                  Tell stronger stories
                </button>
                <button
                  type="button"
                  className={`option ${goal === 'Presentations' ? 'selected' : ''}`}
                  onClick={() => {
                    setGoal('Presentations');
                    setScenarioMode('mine');
                  }}
                >
                  <strong>🎤</strong>
                  Present with impact
                </button>
              </div>

              {/* Target Audience Dropdown */}
              <label className="field" htmlFor="audienceSelect">
                Who do you usually communicate with?
              </label>
              <select
                id="audienceSelect"
                value={audience}
                onChange={e => setAudience(e.target.value)}
              >
                <option value="Cross-functional stakeholders">Cross-functional stakeholders</option>
                <option value="Leadership and executives">Leadership and executives</option>
                <option value="Product peers and colleagues">Product peers and colleagues</option>
              </select>

              <div className="actions">
                <button
                  className="btn"
                  onClick={() => {
                    setScenarioMode('mine');
                    setStep(1);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                >
                  Meet my challenge →
                </button>
              </div>
            </section>
          )}

          {/* SCREEN 02: ASSESS ME */}
          {step === 1 && (
            <section>
              <span className="eyebrow">02 / ASSESS ME</span>
              <h1>Let&apos;s hear your thinking.</h1>
              <p>Answer naturally. You don&apos;t need a polished speech—this is your baseline, not a test.</p>

              {/* Practice Mode Choice */}
              <div className="scenario-choice">
                <div className="scenario-choice-title">How would you like to practice?</div>
                <div className="scenario-options">
                  <button
                    type="button"
                    className={`scenario-option ${scenarioMode === 'mine' ? 'active' : ''}`}
                    onClick={() => {
                      setScenarioMode('mine');
                      setTimeout(() => {
                        const el = document.getElementById('mySituation') as HTMLTextAreaElement | null;
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.focus({ preventScroll: true });
                        }
                      }, 50);
                    }}
                  >
                    <strong>✍️ Prepare me for a situation</strong>
                    <span>Prepare me for an upcoming real conversation</span>
                  </button>
                  <button
                    type="button"
                    className={`scenario-option ${scenarioMode === 'vira' ? 'active' : ''}`}
                    onClick={() => {
                      setScenarioMode('vira');
                      setTimeout(() => {
                        const el = document.getElementById('answer1') as HTMLTextAreaElement | null;
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.focus({ preventScroll: true });
                        }
                      }, 50);
                    }}
                  >
                    <strong>✨ Let Vira give me a situation</strong>
                    <span>Practice Real PM Conversations</span>
                  </button>
                </div>

                {scenarioMode === 'mine' && (
                  <div className="speech" style={{ marginTop: '14px', background: '#fdfcfe', border: '1.5px solid #ece4ff' }}>
                    <div className="tiny" style={{ textAlign: 'center', fontWeight: 700, color: '#6545e8' }}>
                      {isRecordingSituation
                        ? '🔴 Listening… describe your situation (Tap mic when done)'
                        : '🎙️ Tap mic to speak your situation, or type below'}
                    </div>
                    <div className="record">
                      <button
                        type="button"
                        className={`mic ${isRecordingSituation ? 'recording' : ''}`}
                        onClick={() => toggleSpeech(3)}
                        title="Tap to speak your situation"
                      >
                        🎙️
                      </button>
                      {isRecordingSituation && <span className="counter">{recTimerSituation}</span>}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <label className="field" htmlFor="mySituation" style={{ margin: 0 }}>
                        Describe your upcoming situation
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {customSituation.length > 0 && (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ padding: '3px 8px', fontSize: '11.5px', color: '#887c9c', borderRadius: '8px' }}
                            onClick={() => {
                              stopSpeech();
                              setCustomSituation('');
                              speechBaseTextRef.current = '';
                            }}
                          >
                            🗑️ Clear text
                          </button>
                        )}
                        <span className="tiny" style={{ color: customSituation.trim().length >= 15 ? '#1f9e76' : '#887c9c', fontWeight: 700 }}>
                          {customSituation.trim().length >= 15 ? '✓ Situation ready' : `${customSituation.trim().length}/15 chars min`}
                        </span>
                      </div>
                    </div>
                    <textarea
                      id="mySituation"
                      placeholder="Example: Tomorrow my VP will ask why we delayed the analytics dashboard. I need to explain the customer impact, technical trade-offs, and our new launch date."
                      rows={3}
                      value={customSituation}
                      onChange={e => setCustomSituation(e.target.value)}
                    />
                    <div className="small" style={{ marginTop: '6px', color: '#7a718c' }}>
                      💡 Speak or type the context, who you are addressing, and the core challenge.
                    </div>
                  </div>
                )}
              </div>

              {/* Vira Scenario Card */}
              <div className="vira">
                <span className="avatar">👩‍💼</span>
                <div className="bubble">
                  <b>Vira</b>
                  <p style={{ whiteSpace: 'pre-line' }}>{currentScenarioText}</p>
                </div>
              </div>

              {/* Speech Input Box */}
              <div className="speech">
                <div className="tiny" style={{ textAlign: 'center', fontWeight: 700, color: '#6545e8' }}>
                  {isRecording1 ? '🔴 Listening… speak naturally (Tap mic when done)' : 'Tap mic to speak, or type below'}
                </div>
                <div className="record">
                  <button
                    type="button"
                    className={`mic ${isRecording1 ? 'recording' : ''}`}
                    onClick={() => toggleSpeech(1)}
                    title="Tap to speak"
                  >
                    🎙️
                  </button>
                  {isRecording1 && <span className="counter">{recTimer1}</span>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="field" htmlFor="answer1" style={{ margin: 0 }}>
                    Your baseline response
                  </label>
                  {answer1.length > 0 && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '3px 8px', fontSize: '11.5px', color: '#887c9c', borderRadius: '8px' }}
                      onClick={() => {
                        stopSpeech();
                        setAnswer1('');
                        speechBaseTextRef.current = '';
                      }}
                    >
                      🗑️ Clear text
                    </button>
                  )}
                </div>
                <textarea
                  id="answer1"
                  placeholder="Speak with the mic or type your answer here... (minimum 35 characters)"
                  value={answer1}
                  onChange={e => setAnswer1(e.target.value)}
                />
                <div className="small" style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span>{answer1.length} characters (min 35)</span>
                  {scenarioMode === 'mine' && (
                    <span style={{ color: customSituation.trim().length >= 15 && answer1.trim().length >= 35 ? '#1f9e76' : '#887c9c', fontWeight: 600 }}>
                      {customSituation.trim().length < 15
                        ? 'Describe your situation above to enable feedback'
                        : answer1.trim().length < 35
                        ? 'Enter baseline response to enable feedback'
                        : '✓ Ready to get Vira’s feedback'}
                    </span>
                  )}
                  {scenarioMode === 'vira' && (
                    <button
                      type="button"
                      className="reset"
                      onClick={() => setScenarioIndex(prev => prev + 1)}
                    >
                      🎲 Try another PM scenario
                    </button>
                  )}
                </div>
              </div>

              {/* Guidance banner when in 'mine' mode but situation is not filled */}
              {scenarioMode === 'mine' && customSituation.trim().length < 15 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '12px', padding: '12px 14px', marginTop: '16px', fontSize: '13px', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <span>💡 <strong>Describe your situation above</strong> ({customSituation.trim().length}/15 chars) so Vira knows what to evaluate.</span>
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: '4px 10px', fontSize: '12px', background: '#ffffff', borderColor: '#fde68a', color: '#78350f', borderRadius: '8px' }}
                    onClick={() => setScenarioMode('vira')}
                  >
                    ✨ Practice Vira’s scenario instead
                  </button>
                </div>
              )}

              <div className="actions" style={{ marginTop: '16px' }}>
                <button
                  className="btn"
                  disabled={assessing}
                  onClick={handleAssess}
                >
                  {assessing ? (
                    <>
                      <span className="spinner" /> Vira is reviewing your response...
                    </>
                  ) : (
                    "Get Vira's feedback →"
                  )}
                </button>
                <button className="btn ghost" onClick={() => {
                  setStep(0);
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}>
                  ← Back to Goal
                </button>
              </div>

              {apiError && (
                <div className="callout" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b', marginTop: '14px' }}>
                  ⚠️ {apiError}
                </div>
              )}

              <div style={{ fontSize: '11px', color: '#8d85a0', marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔒</span>
                <span>Vira evaluates your practice responses securely using server-side AI for personalized PM coaching.</span>
              </div>
            </section>
          )}

          {/* SCREEN 03: YOUR PERSONAL PLAN */}
          {step === 2 && assessment && (
            <section>
              <span className="eyebrow">03 / YOUR PERSONAL PLAN</span>
              <h1>Here&apos;s how we&apos;ll grow.</h1>
              <p>
                I listened to your answer. Rather than trying to change all your speaking habits at once,
                we&apos;ll focus on one targeted communication technique.
              </p>

              {/* Mentor Feedback Bubble */}
              <div className="vira">
                <span className="avatar">👩‍💼</span>
                <div className="bubble">
                  <b>Vira</b>
                  <p>
                    I heard your answer! Your highest scoring area was{' '}
                    <strong>{assessment.strongest}</strong>. Our first practice focus is{' '}
                    <strong>{assessment.focus}</strong>.
                  </p>
                </div>
              </div>

              {/* Accessible Progressive Disclosure Tabs */}
              <div
                className="coaching-tablist"
                role="tablist"
                aria-label="Assessment views"
              >
                <button
                  id="tab-coaching"
                  type="button"
                  role="tab"
                  aria-selected={coachingTab === 'coaching'}
                  aria-controls="panel-coaching"
                  tabIndex={coachingTab === 'coaching' ? 0 : -1}
                  className={`coaching-tab ${coachingTab === 'coaching' ? 'active' : ''}`}
                  onClick={() => setCoachingTab('coaching')}
                  onKeyDown={e => handleTabKeyDown(e, 'coaching')}
                >
                  🎯 My Coaching
                </button>
                <button
                  id="tab-scores"
                  type="button"
                  role="tab"
                  aria-selected={coachingTab === 'scores'}
                  aria-controls="panel-scores"
                  tabIndex={coachingTab === 'scores' ? 0 : -1}
                  className={`coaching-tab ${coachingTab === 'scores' ? 'active' : ''}`}
                  onClick={() => setCoachingTab('scores')}
                  onKeyDown={e => handleTabKeyDown(e, 'scores')}
                >
                  📊 My Scores (5)
                </button>
                <button
                  id="tab-deep_dive"
                  type="button"
                  role="tab"
                  aria-selected={coachingTab === 'deep_dive'}
                  aria-controls="panel-deep_dive"
                  tabIndex={coachingTab === 'deep_dive' ? 0 : -1}
                  className={`coaching-tab ${coachingTab === 'deep_dive' ? 'active' : ''}`}
                  onClick={() => setCoachingTab('deep_dive')}
                  onKeyDown={e => handleTabKeyDown(e, 'deep_dive')}
                >
                  🔍 Deep Dive
                </button>
              </div>

              {/* TAB 1: MY COACHING (Default View: 10-Second Actionable Focus) */}
              <div
                id="panel-coaching"
                role="tabpanel"
                aria-labelledby="tab-coaching"
                hidden={coachingTab !== 'coaching'}
              >
                {/* 1. One Genuine Strength */}
                <div className="callout" style={{ background: '#f5fbf8', borderColor: '#c8edd9', borderLeft: '4px solid #1f9e76', margin: '14px 0 16px', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>🌟</span>
                    <h3 style={{ margin: 0, color: '#16654a', fontSize: '15px' }}>
                      Genuine Strength: {assessment.strongest}
                    </h3>
                  </div>
                  <p style={{ margin: 0, color: '#1f513b', fontSize: '13.5px', lineHeight: 1.5 }}>
                    {(assessment.scoreExplanations as any)?.[assessment.strongest.toLowerCase()] ||
                      `Your ${assessment.strongest.toLowerCase()} established a strong baseline with clear communicative intent.`}
                  </p>
                </div>

                {/* 2. One Primary Improvement Area Grounded in Response */}
                <div className="callout" style={{ borderLeft: '4px solid #7153de', background: '#fbf9ff', margin: '14px 0 16px', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '18px' }}>🎯</span>
                    <h3 style={{ margin: 0, color: '#5534c7', fontSize: '15px' }}>
                      Primary Focus: {assessment.focus.toUpperCase()}
                    </h3>
                  </div>
                  <p style={{ margin: '0 0 10px', color: '#3a3455', fontSize: '13.5px', lineHeight: 1.5 }}>
                    {assessment.focusExplanation}
                  </p>
                  {(assessment.highlights?.[0] || assessment.evidenceCoaching?.whatNeedsWork) && (() => {
                    const h = assessment.highlights?.[0];
                    const originalQuote = h?.quote || assessment.evidenceCoaching?.whatNeedsWork?.quote || '';
                    const issueDesc = h?.issue || assessment.evidenceCoaching?.whatNeedsWork?.audienceImpact || '';
                    const rawSuggestion = h?.suggestion || `Try saying: “${assessment.technique?.steps?.[0] || 'My direct recommendation is...'}”`;
                    const betterText = rawSuggestion.replace(/^(Say this instead|Try saying):\s*“?/i, '').replace(/”$/, '');

                    if (!originalQuote) return null;

                    return (
                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                          {/* Original Sentence */}
                          <div style={{ padding: '12px 14px', background: '#fff5f5', borderRadius: '12px', border: '1.5px solid #fed7d7' }}>
                            <div className="tiny" style={{ color: '#c53030', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                              💬 Original Sentence
                            </div>
                            <div style={{ fontSize: '13px', color: '#2d3748', fontStyle: 'italic', lineHeight: 1.5 }}>
                              “{originalQuote}”
                            </div>
                            <div style={{ fontSize: '12px', color: '#9b2c2c', marginTop: '8px', lineHeight: 1.4 }}>
                              <strong>What to change:</strong> {issueDesc}
                            </div>
                          </div>

                          {/* Better Version */}
                          <div style={{ padding: '12px 14px', background: '#f0fdf4', borderRadius: '12px', border: '1.5px solid #bbf7d0' }}>
                            <div className="tiny" style={{ color: '#16654a', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                              💡 Clearer Version
                            </div>
                            <div style={{ fontSize: '13px', color: '#14532d', fontWeight: 600, lineHeight: 1.5 }}>
                              “{betterText}”
                            </div>
                            <div style={{ fontSize: '12px', color: '#15803d', marginTop: '8px', lineHeight: 1.4 }}>
                              <strong>Why it works:</strong> Gets straight to your recommendation without unnecessary preamble.
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 3. One Relevant Technique & Concise Contextual Example */}
                <div className="callout" style={{ borderLeft: '4px solid #4f46e5', background: '#ffffff', border: '1.5px solid #ece4ff', borderRadius: '16px', margin: '14px 0 20px', padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🛠️</span>
                    <h3 style={{ margin: 0, color: '#4338ca', fontSize: '15px' }}>
                      Recommended Technique: {assessment.technique.name}
                    </h3>
                  </div>
                  <div style={{ margin: '8px 0 12px' }}>
                    {assessment.technique.steps.map((st, i) => (
                      <p key={i} style={{ fontWeight: 600, margin: '4px 0', fontSize: '13px', color: '#3f385c' }}>
                        {st}
                      </p>
                    ))}
                  </div>
                  <div className="quote" style={{ margin: 0, borderLeftColor: '#4f46e5', background: '#fcfaff', fontSize: '13px', whiteSpace: 'pre-line', lineHeight: 1.65 }}>
                    <strong style={{ color: '#4338ca', display: 'block', marginBottom: '6px' }}>
                      💡 Tailored Model Script for Your Scenario:
                    </strong>
                    {assessment.technique.example}
                  </div>
                </div>

                {/* 4. Your Practice Cadence & Session Selector (Collapsed by Default with Recommended Options) */}
                <div style={{ marginTop: '20px', padding: '16px 18px', background: '#ffffff', border: '1.5px solid #ece4ff', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>📅</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '14.5px', color: '#2e264a' }}>
                            Practice Cadence: {planFrequency} {planFrequency === 1 ? 'session' : 'sessions'}
                          </strong>
                          <span className="tiny" style={{ background: '#eaf8f2', color: '#16654a', padding: '2px 8px', borderRadius: '8px', fontWeight: 700 }}>
                            {planMinutes} min each · Recommended
                          </span>
                        </div>
                        <div className="tiny" style={{ color: '#7a718c', marginTop: '2px' }}>
                          Target: {planFrequency} practice sessions to build lasting habits · Practice 1 ready now
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn ghost"
                      style={{ padding: '6px 12px', fontSize: '12.5px', border: '1px solid #ded5ff', color: '#5534c7' }}
                      onClick={() => setIsCadenceExpanded(prev => !prev)}
                    >
                      {isCadenceExpanded ? 'Hide Options ▲' : 'Customize Cadence ▾'}
                    </button>
                  </div>

                  {/* Expanded Customizer (when user opens to modify) */}
                  {isCadenceExpanded && (
                    <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f2ecfe', animation: 'fadeIn 0.2s ease-out' }}>
                      <p className="tiny" style={{ margin: '0 0 12px', color: '#68607c' }}>
                        Modify your session duration and target number of sessions as needed:
                      </p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', margin: '0 0 14px' }}>
                        <div>
                          <label className="field" htmlFor="durationSelect">
                            Session Duration
                          </label>
                          <select
                            id="durationSelect"
                            value={planMinutes}
                            onChange={e => updatePlanMinutes(Number(e.target.value))}
                          >
                            <option value={3}>3 minutes (quick micro-drill)</option>
                            <option value={5}>5 minutes (recommended)</option>
                            <option value={10}>10 minutes (deep rehearsal)</option>
                          </select>
                        </div>
                        <div>
                          <label className="field" htmlFor="freqSelect">
                            Number of sessions
                          </label>
                          <select
                            id="freqSelect"
                            value={planFrequency}
                            onChange={e => updatePlanFrequency(Number(e.target.value))}
                          >
                            <option value={1}>1 session</option>
                            <option value={2}>2 sessions</option>
                            <option value={3}>3 sessions (recommended)</option>
                            <option value={5}>5 sessions</option>
                          </select>
                        </div>
                      </div>

                      <div className="plan" style={{ marginTop: '10px' }}>
                        {Array.from({ length: planFrequency }).map((_, i) => (
                          <div key={i} className="day" style={i === 0 ? { border: '2px solid #7153de', background: '#fbf9ff' } : {}}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                              <span className="tag" style={i === 0 ? { background: '#7153de', color: '#ffffff' } : {}}>
                                {i === 0 ? '▶ Practice 1 (Now)' : `Practice ${i + 1}`}
                              </span>
                              <span className="tiny" style={{ color: '#887c9c', fontWeight: 600 }}>
                                {planMinutes} min
                              </span>
                            </div>
                            <strong style={{ display: 'block', fontSize: '13.5px', color: '#2e264a', marginTop: '4px' }}>
                              {i === 0 ? `Apply ${assessment.technique.name}` : i === 1 ? 'Handle Pressure Questions' : 'Fluency & Brevity Drill'}
                            </strong>
                            <div className="tiny" style={{ color: '#554e66', marginTop: '4px', lineHeight: 1.4 }}>
                              {i === 0
                                ? `Focus directly on ${assessment.focus} using ${assessment.technique.name}.`
                                : i === 1
                                ? 'Practice with unexpected follow-up executive questions.'
                                : 'Rehearse with real stakeholders or peers.'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Prominent Practice Action */}
                <div className="actions" style={{ marginTop: '22px' }}>
                  <button className="btn" onClick={() => {
                    setStep(3);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }} style={{ padding: '14px 28px', fontSize: '15px' }}>
                    Start Practice 1 ({planMinutes} min) →
                  </button>
                  <button className="btn ghost" onClick={() => {
                    setStep(1);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}>
                    ← Re-record Baseline
                  </button>
                </div>
              </div>

              {/* TAB 2: MY SCORES (Secondary View: 5-Skill Rubric with Explanations) */}
              <div
                id="panel-scores"
                role="tabpanel"
                aria-labelledby="tab-scores"
                hidden={coachingTab !== 'scores'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', marginBottom: '8px' }}>
                  <h2 style={{ margin: 0 }}>Communication Skill Assessment</h2>
                  <span className="tiny" style={{ background: '#eee8ff', padding: '4px 10px', borderRadius: '12px', color: '#5534c7', fontWeight: 700 }}>
                    1–5 Rubric
                  </span>
                </div>
                <p className="tiny" style={{ marginBottom: '16px' }}>
                  Evaluated across 5 independent dimensions based on observable behavioral anchors. No overall score that hides specific communication differences.
                </p>

                {/* Core Skill: Clarity */}
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#ffffff', borderRadius: '14px', border: '1px solid #eeebf5' }}>
                  <div className="skill" style={{ margin: '4px 0 6px' }}>
                    <div className="skill-name">Clarity</div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${(assessment.scores.clarity / 5) * 100}%` }} />
                    </div>
                    <div className="score">{assessment.scores.clarity}/5</div>
                  </div>
                  <p className="tiny" style={{ margin: 0, color: '#68607c', lineHeight: 1.45 }}>
                    {assessment.scoreExplanations?.clarity ||
                      (assessment.scores.clarity >= 4
                        ? 'Clear and direct recommendation established early with strong focus.'
                        : assessment.scores.clarity === 3
                        ? 'Main point is understandable, but lacks immediate executive punch.'
                        : 'Main point is buried under preamble, passive phrasing, or hesitation.')}
                  </p>
                </div>

                {/* Core Skill: Structure */}
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#ffffff', borderRadius: '14px', border: '1px solid #eeebf5' }}>
                  <div className="skill" style={{ margin: '4px 0 6px' }}>
                    <div className="skill-name">Structure</div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${(assessment.scores.structure / 5) * 100}%` }} />
                    </div>
                    <div className="score">{assessment.scores.structure}/5</div>
                  </div>
                  <p className="tiny" style={{ margin: 0, color: '#68607c', lineHeight: 1.45 }}>
                    {assessment.scoreExplanations?.structure ||
                      (assessment.scores.structure >= 4
                        ? 'Follows a disciplined, recognizable communication framework with natural transitions.'
                        : assessment.scores.structure === 3
                        ? 'Basic sequential beginning-middle-end order, but transitions could be tighter.'
                        : 'Ideas jump between context and conclusion without supporting bridges.')}
                  </p>
                </div>

                {/* Core Skill: Conciseness */}
                <div style={{ marginBottom: '16px', padding: '12px 16px', background: '#ffffff', borderRadius: '14px', border: '1px solid #eeebf5' }}>
                  <div className="skill" style={{ margin: '4px 0 6px' }}>
                    <div className="skill-name">Conciseness</div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${(assessment.scores.conciseness / 5) * 100}%` }} />
                    </div>
                    <div className="score">{assessment.scores.conciseness}/5</div>
                  </div>
                  <p className="tiny" style={{ margin: 0, color: '#68607c', lineHeight: 1.45 }}>
                    {assessment.scoreExplanations?.conciseness ||
                      (assessment.scores.conciseness >= 4
                        ? 'Tight, focused delivery with a high signal-to-noise ratio and zero fluff.'
                        : assessment.scores.conciseness === 3
                        ? 'Reasonable brevity, but retains minor conversational padding.'
                        : 'Either verbose with preamble or too sparse to convey key rationale.')}
                  </p>
                </div>

                {/* Goal-Specific Effectiveness */}
                {assessment.goalEffectiveness && (
                  <div style={{ marginBottom: '16px', padding: '14px 16px', background: '#faf9fe', borderRadius: '14px', border: '1.5px solid #ece4ff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '13.5px', color: '#3f385c' }}>
                        Goal Execution: {assessment.goalEffectiveness.goal}
                      </strong>
                      <span className="tag" style={{ background: '#eaf8f2', color: '#1a7f5c', fontWeight: 700, fontSize: '11px' }}>
                        Goal Specific
                      </span>
                    </div>
                    <div className="skill" style={{ margin: '4px 0 6px' }}>
                      <div className="skill-name" style={{ width: '160px' }}>{assessment.goalEffectiveness.goal} Quality</div>
                      <div className="bar">
                        <div className="fill" style={{ width: `${(assessment.goalEffectiveness.score / 5) * 100}%`, background: 'linear-gradient(90deg, #1f9e76, #4b91f9)' }} />
                      </div>
                      <div className="score" style={{ color: '#1f9e76' }}>{assessment.goalEffectiveness.score}/5</div>
                    </div>
                    <p className="tiny" style={{ margin: '2px 0 8px', color: '#554e66', lineHeight: 1.45 }}>
                      {assessment.scoreExplanations?.goalEffectiveness || assessment.goalEffectiveness.rationale}
                    </p>
                    {assessment.goalEffectiveness.criteriaResults && assessment.goalEffectiveness.criteriaResults.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginTop: '8px' }}>
                        {assessment.goalEffectiveness.criteriaResults.map((c, i) => (
                          <div key={i} style={{ padding: '6px 10px', background: '#ffffff', borderRadius: '8px', fontSize: '11.5px', border: '1px solid #eee8fa' }}>
                            <span style={{ color: c.status === 'met' ? '#1f9e76' : c.status === 'partially_met' ? '#d97706' : '#dc2626', fontWeight: 700, marginRight: '6px' }}>
                              {c.status === 'met' ? '✓' : c.status === 'partially_met' ? '◐' : '✕'}
                            </span>
                            <strong>{c.criterion}</strong>: <span style={{ color: '#68607c' }}>{c.note}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Scenario Alignment Score */}
                {assessment.scenarioAlignment && (
                  <div style={{ marginBottom: '20px', padding: '14px 16px', background: '#fdfbfe', border: '1.5px solid #ece4ff', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '13.5px', color: '#3f385c' }}>Scenario Alignment Audit</strong>
                      <span className="tag" style={{ background: assessment.scenarioAlignment.score >= 4 ? '#eaf8f2' : assessment.scenarioAlignment.score >= 3 ? '#fef3c7' : '#fee2e2', color: assessment.scenarioAlignment.score >= 4 ? '#1a7f5c' : assessment.scenarioAlignment.score >= 3 ? '#92400e' : '#b91c1c', fontSize: '11px' }}>
                        {assessment.scenarioAlignment.score}/5 {assessment.scenarioAlignment.score >= 4 ? 'Complete' : assessment.scenarioAlignment.score >= 3 ? 'Partial' : 'Needs Focus'}
                      </span>
                    </div>
                    <div className="skill" style={{ margin: '4px 0 6px' }}>
                      <div className="skill-name">Scenario Alignment</div>
                      <div className="bar">
                        <div className="fill" style={{ width: `${(assessment.scenarioAlignment.score / 5) * 100}%`, background: 'linear-gradient(90deg, #7153de, #a78bfa)' }} />
                      </div>
                      <div className="score" style={{ color: '#7153de' }}>{assessment.scenarioAlignment.score}/5</div>
                    </div>
                    <p className="tiny" style={{ margin: '2px 0 8px', color: '#554e66', lineHeight: 1.45 }}>
                      {assessment.scoreExplanations?.scenarioAlignment || assessment.scenarioAlignment.rationale}
                    </p>
                    {assessment.scenarioAlignment.requiredElements && assessment.scenarioAlignment.requiredElements.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        {assessment.scenarioAlignment.requiredElements.map((el, i) => (
                          <div key={i} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: el.addressed ? '#1f9e76' : '#d97706', fontWeight: 800 }}>
                              {el.addressed ? '✓' : '○'}
                            </span>
                            <span style={{ color: el.addressed ? '#3f385c' : '#7a718c' }}>
                              {el.element}
                            </span>
                            {el.evidence && (
                              <span className="tiny" style={{ color: '#938aa8', fontStyle: 'italic' }}>
                                ({el.evidence})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Layer C: Product Decision Communication Intelligence (Context-Aware) */}
                {assessment.pmDecisionScores && (
                  <div style={{ marginBottom: '20px', padding: '16px 18px', background: assessment.pmDecisionScores.isDecisionScenario ? '#ffffff' : '#fcfaff', border: '1.5px solid #ece4ff', borderRadius: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>🎯</span>
                        <strong style={{ fontSize: '14.5px', color: '#2e264a' }}>
                          Product Decision Communication Intelligence
                        </strong>
                      </div>
                      <span className="tiny" style={{
                        background: assessment.pmDecisionScores.isDecisionScenario ? '#eef2ff' : '#f3f4f6',
                        color: assessment.pmDecisionScores.isDecisionScenario ? '#4338ca' : '#6b7280',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontWeight: 700
                      }}>
                        {assessment.pmDecisionScores.isDecisionScenario
                          ? (assessment.pmDecisionScores.overallDecisionRating ? `Overall Rating: ${assessment.pmDecisionScores.overallDecisionRating}/5` : 'Decision Specific')
                          : 'Not Applicable for Storytelling'}
                      </span>
                    </div>

                    {!assessment.pmDecisionScores.isDecisionScenario ? (
                      <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
                        ℹ️ <strong>Non-Decision Context:</strong> This scenario focuses on personal career narrative and storytelling. Decision trade-off and product evidence rubrics are marked not applicable and do not penalize your communication score.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
                        {/* 1. Decision Clarity */}
                        <div style={{ padding: '12px 14px', background: '#faf9fe', borderRadius: '12px', border: '1px solid #eee8fa' }}>
                          <div className="skill" style={{ margin: '2px 0 6px' }}>
                            <div className="skill-name" style={{ width: '170px', fontWeight: 700 }}>Decision Clarity</div>
                            <div className="bar">
                              <div className="fill" style={{ width: `${((assessment.pmDecisionScores.decisionClarity.score || 3) / 5) * 100}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }} />
                            </div>
                            <div className="score" style={{ color: '#4f46e5' }}>{assessment.pmDecisionScores.decisionClarity.score || 3}/5</div>
                          </div>
                          <p className="tiny" style={{ margin: '2px 0 4px', color: '#554e66', lineHeight: 1.45 }}>
                            {assessment.pmDecisionScores.decisionClarity.rationale}
                          </p>
                          {assessment.pmDecisionScores.decisionClarity.improvementSuggestion && (
                            <div className="tiny" style={{ marginTop: '6px', color: '#4338ca', background: '#eef2ff', padding: '6px 10px', borderRadius: '8px' }}>
                              💡 <strong>Vira&apos;s Tip:</strong> {assessment.pmDecisionScores.decisionClarity.improvementSuggestion}
                            </div>
                          )}
                        </div>

                        {/* 2. Supporting Evidence */}
                        <div style={{ padding: '12px 14px', background: '#faf9fe', borderRadius: '12px', border: '1px solid #eee8fa' }}>
                          <div className="skill" style={{ margin: '2px 0 6px' }}>
                            <div className="skill-name" style={{ width: '170px', fontWeight: 700 }}>Supporting Evidence</div>
                            <div className="bar">
                              <div className="fill" style={{ width: `${((assessment.pmDecisionScores.supportingEvidence.score || 3) / 5) * 100}%`, background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)' }} />
                            </div>
                            <div className="score" style={{ color: '#0284c7' }}>{assessment.pmDecisionScores.supportingEvidence.score || 3}/5</div>
                          </div>
                          <p className="tiny" style={{ margin: '2px 0 4px', color: '#554e66', lineHeight: 1.45 }}>
                            {assessment.pmDecisionScores.supportingEvidence.rationale}
                          </p>
                          {assessment.pmDecisionScores.supportingEvidence.evidenceQuote && (
                            <div className="tiny" style={{ marginTop: '4px', color: '#0369a1', fontStyle: 'italic' }}>
                              “{assessment.pmDecisionScores.supportingEvidence.evidenceQuote}”
                            </div>
                          )}
                          {assessment.pmDecisionScores.supportingEvidence.improvementSuggestion && (
                            <div className="tiny" style={{ marginTop: '6px', color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: '8px' }}>
                              💡 <strong>Vira&apos;s Tip:</strong> {assessment.pmDecisionScores.supportingEvidence.improvementSuggestion}
                            </div>
                          )}
                        </div>

                        {/* 3. Trade-off Articulation */}
                        <div style={{ padding: '12px 14px', background: '#faf9fe', borderRadius: '12px', border: '1px solid #eee8fa' }}>
                          <div className="skill" style={{ margin: '2px 0 6px' }}>
                            <div className="skill-name" style={{ width: '170px', fontWeight: 700 }}>Trade-off Articulation</div>
                            <div className="bar">
                              <div className="fill" style={{ width: `${((assessment.pmDecisionScores.tradeoffArticulation.score || 3) / 5) * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
                            </div>
                            <div className="score" style={{ color: '#d97706' }}>{assessment.pmDecisionScores.tradeoffArticulation.score || 3}/5</div>
                          </div>
                          <p className="tiny" style={{ margin: '2px 0 4px', color: '#554e66', lineHeight: 1.45 }}>
                            {assessment.pmDecisionScores.tradeoffArticulation.rationale}
                          </p>
                          {assessment.pmDecisionScores.tradeoffArticulation.improvementSuggestion && (
                            <div className="tiny" style={{ marginTop: '6px', color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: '8px' }}>
                              💡 <strong>Vira&apos;s Tip:</strong> {assessment.pmDecisionScores.tradeoffArticulation.improvementSuggestion}
                            </div>
                          )}
                        </div>

                        {/* 4. Business or Customer Impact */}
                        <div style={{ padding: '12px 14px', background: '#faf9fe', borderRadius: '12px', border: '1px solid #eee8fa' }}>
                          <div className="skill" style={{ margin: '2px 0 6px' }}>
                            <div className="skill-name" style={{ width: '170px', fontWeight: 700 }}>Business or Customer Impact</div>
                            <div className="bar">
                              <div className="fill" style={{ width: `${((assessment.pmDecisionScores.businessImpact.score || 3) / 5) * 100}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
                            </div>
                            <div className="score" style={{ color: '#059669' }}>{assessment.pmDecisionScores.businessImpact.score || 3}/5</div>
                          </div>
                          <p className="tiny" style={{ margin: '2px 0 4px', color: '#554e66', lineHeight: 1.45 }}>
                            {assessment.pmDecisionScores.businessImpact.rationale}
                          </p>
                          {assessment.pmDecisionScores.businessImpact.improvementSuggestion && (
                            <div className="tiny" style={{ marginTop: '6px', color: '#065f46', background: '#ecfdf5', padding: '6px 10px', borderRadius: '8px' }}>
                              💡 <strong>Vira&apos;s Tip:</strong> {assessment.pmDecisionScores.businessImpact.improvementSuggestion}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="actions" style={{ marginTop: '20px' }}>
                  <button className="btn" onClick={() => setStep(3)}>
                    Practice this technique now →
                  </button>
                  <button className="btn ghost" onClick={() => setCoachingTab('coaching')}>
                    ← Back to My Coaching
                  </button>
                </div>
              </div>

              {/* TAB 3: DEEP DIVE (Expandable Accordions: Verbatim Evidence, Audit, Transcript, Cadence) */}
              <div
                id="panel-deep_dive"
                role="tabpanel"
                aria-labelledby="tab-deep_dive"
                hidden={coachingTab !== 'deep_dive'}
              >
                <p className="tiny" style={{ margin: '10px 0 16px', color: '#68607c' }}>
                  Deep inspection and verifiable evidence behind your assessment. Expand any section to review details.
                </p>

                {/* Accordion 1: Verbatim Highlights & Concrete Suggestions */}
                <div className="accordion-item">
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={deepDiveSections.evidence}
                    onClick={() => toggleDeepDiveSection('evidence')}
                  >
                    <span>💬 Verbatim Highlights & Phrasings ({assessment.highlights?.length || (assessment.evidenceCoaching ? 1 : 0)})</span>
                    <span>{deepDiveSections.evidence ? '▲' : '▼'}</span>
                  </button>
                  {deepDiveSections.evidence && (
                    <div className="accordion-body">
                      {assessment.highlights && assessment.highlights.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {assessment.highlights.map((h, idx) => (
                            <div key={idx} style={{ background: '#fcfaff', border: '1px solid #eeebf8', borderRadius: '14px', padding: '14px 16px' }}>
                              <div style={{ marginBottom: '8px' }}>
                                <div className="tiny" style={{ fontWeight: 700, color: '#7a718c', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  💬 What you said:
                                </div>
                                <div className="quote" style={{ margin: 0, borderLeftColor: '#7153de', background: '#ffffff', fontSize: '13px' }}>
                                  “{h.quote}”
                                </div>
                              </div>
                              <div style={{ marginBottom: '8px', padding: '8px 12px', background: '#f5f2ff', borderRadius: '8px' }}>
                                <strong style={{ fontSize: '12px', color: '#5534c7', display: 'block', marginBottom: '2px' }}>
                                  👩‍💼 Vira&apos;s observation:
                                </strong>
                                <p style={{ margin: 0, fontSize: '12.5px', color: '#443c5b' }}>
                                  {h.issue}
                                </p>
                              </div>
                              <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', borderLeft: '3px solid #16a34a' }}>
                                <strong style={{ fontSize: '12px', color: '#16654a', display: 'block', marginBottom: '2px' }}>
                                  💡 Suggested phrasing:
                                </strong>
                                <p style={{ margin: 0, fontSize: '12.5px', color: '#14532d' }}>
                                  {h.suggestion}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : assessment.evidenceCoaching ? (
                        <div style={{ background: '#fcfaff', border: '1px solid #eeebf8', borderRadius: '14px', padding: '14px 16px' }}>
                          <div style={{ marginBottom: '8px' }}>
                            <div className="tiny" style={{ fontWeight: 700, color: '#7a718c', textTransform: 'uppercase', marginBottom: '4px' }}>
                              💬 What you said:
                            </div>
                            <div className="quote" style={{ margin: 0, borderLeftColor: '#f97316', background: '#ffffff', fontSize: '13px' }}>
                              “{assessment.evidenceCoaching.whatNeedsWork.quote}”
                            </div>
                          </div>
                          <div style={{ marginBottom: '8px', padding: '8px 12px', background: '#f5f2ff', borderRadius: '8px' }}>
                            <strong style={{ fontSize: '12px', color: '#5534c7', display: 'block', marginBottom: '2px' }}>
                              👩‍💼 Vira&apos;s observation:
                            </strong>
                            <p style={{ margin: 0, fontSize: '12.5px', color: '#443c5b' }}>
                              {assessment.evidenceCoaching.whatNeedsWork.audienceImpact}
                            </p>
                          </div>
                          <div style={{ padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px', borderLeft: '3px solid #16a34a' }}>
                            <strong style={{ fontSize: '12px', color: '#16654a', display: 'block', marginBottom: '2px' }}>
                              💡 Suggested phrasing:
                            </strong>
                            <p style={{ margin: 0, fontSize: '12.5px', color: '#14532d' }}>
                              Say this instead: “{assessment.evidenceCoaching.nextChallenge.sentenceStarter}”
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="tiny" style={{ margin: 0, color: '#7a718c' }}>No specific verbatim flags recorded.</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 2: Scenario & Goal Criteria Audit */}
                <div className="accordion-item">
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={deepDiveSections.audit}
                    onClick={() => toggleDeepDiveSection('audit')}
                  >
                    <span>📋 Scenario Alignment & Goal Criteria Audit</span>
                    <span>{deepDiveSections.audit ? '▲' : '▼'}</span>
                  </button>
                  {deepDiveSections.audit && (
                    <div className="accordion-body">
                      {assessment.scenarioAlignment && (assessment.scenarioAlignment.requiredElements?.length || 0) > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <strong style={{ fontSize: '13px', color: '#2e264a', display: 'block', marginBottom: '6px' }}>
                            Required Scenario Elements ({assessment.scenarioAlignment.score}/5):
                          </strong>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {assessment.scenarioAlignment.requiredElements?.map((el, i) => (
                              <div key={i} style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: el.addressed ? '#1f9e76' : '#d97706', fontWeight: 800 }}>
                                  {el.addressed ? '✓' : '○'}
                                </span>
                                <span style={{ color: el.addressed ? '#3f385c' : '#7a718c' }}>
                                  {el.element}
                                </span>
                                {el.evidence && (
                                  <span className="tiny" style={{ color: '#938aa8', fontStyle: 'italic' }}>
                                    — &quot;{el.evidence}&quot;
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {assessment.goalEffectiveness && (assessment.goalEffectiveness.criteriaResults?.length || 0) > 0 && (
                        <div>
                          <strong style={{ fontSize: '13px', color: '#2e264a', display: 'block', marginBottom: '6px' }}>
                            {assessment.goalEffectiveness.goal} Evaluation Criteria ({assessment.goalEffectiveness.score}/5):
                          </strong>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                            {assessment.goalEffectiveness.criteriaResults?.map((c, i) => (
                              <div key={i} style={{ padding: '8px 10px', background: '#fbf9ff', borderRadius: '8px', fontSize: '12px', border: '1px solid #eee8fa' }}>
                                <span style={{ color: c.status === 'met' ? '#1f9e76' : c.status === 'partially_met' ? '#d97706' : '#dc2626', fontWeight: 700, marginRight: '6px' }}>
                                  {c.status === 'met' ? '✓' : c.status === 'partially_met' ? '◐' : '✕'}
                                </span>
                                <strong>{c.criterion}</strong>: <span style={{ color: '#68607c' }}>{c.note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Accordion 3: Full Original Response & Telemetry */}
                <div className="accordion-item">
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={deepDiveSections.transcript}
                    onClick={() => toggleDeepDiveSection('transcript')}
                  >
                    <span>🎙️ Verbatim Baseline Response & Telemetry</span>
                    <span>{deepDiveSections.transcript ? '▲' : '▼'}</span>
                  </button>
                  {deepDiveSections.transcript && (
                    <div className="accordion-body">
                      <div className="quote" style={{ margin: '0 0 12px', fontSize: '13px', borderLeftColor: '#7153de' }}>
                        “{answer1}”
                      </div>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#68607c' }}>
                        <span>📊 <strong>Word count:</strong> {answer1.trim().split(/\s+/).filter(Boolean).length} words</span>
                        <span>⏱️ <strong>Est. spoken duration:</strong> ~{Math.round((answer1.trim().split(/\s+/).filter(Boolean).length / 130) * 60)}s</span>
                        <span>🎯 <strong>Goal:</strong> {goal}</span>
                        <span>👥 <strong>Audience:</strong> {audience}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 4: Practice Cadence & Schedule Builder */}
                <div className="accordion-item">
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={deepDiveSections.cadence}
                    onClick={() => toggleDeepDiveSection('cadence')}
                  >
                    <span>📅 Practice Cadence & Schedule Builder</span>
                    <span>{deepDiveSections.cadence ? '▲' : '▼'}</span>
                  </button>
                  {deepDiveSections.cadence && (
                    <div className="accordion-body">
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', margin: '0 0 14px' }}>
                        <div>
                          <label className="field" htmlFor="durationSelect">
                            Session Duration
                          </label>
                          <select
                            id="durationSelect"
                            value={planMinutes}
                            onChange={e => updatePlanMinutes(Number(e.target.value))}
                          >
                            <option value={3}>3 minutes (quick micro-drill)</option>
                            <option value={5}>5 minutes (recommended)</option>
                            <option value={10}>10 minutes (deep rehearsal)</option>
                          </select>
                        </div>
                        <div>
                          <label className="field" htmlFor="freqSelect">
                            Number of sessions
                          </label>
                          <select
                            id="freqSelect"
                            value={planFrequency}
                            onChange={e => updatePlanFrequency(Number(e.target.value))}
                          >
                            <option value={1}>1 session</option>
                            <option value={2}>2 sessions</option>
                            <option value={3}>3 sessions (recommended)</option>
                            <option value={5}>5 sessions</option>
                          </select>
                        </div>
                      </div>

                      <div className="plan">
                        {Array.from({ length: planFrequency }).map((_, i) => (
                          <div key={i} className="day">
                            <span className="tag">Practice {i + 1}</span>
                            <strong>{i === 0 ? assessment.focus : i === 1 ? 'Apply technique' : 'Fluency & brevity'}</strong>
                            <div>
                              {i === 0
                                ? `Focus directly on ${assessment.focus} using ${assessment.technique.name}.`
                                : i === 1
                                ? 'Practice with follow-up pressure questions.'
                                : 'Rehearse with real stakeholders.'}
                            </div>
                            <div className="tiny" style={{ marginTop: '8px' }}>
                              {planMinutes} minutes
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Accordion 5: Product Decision Communication Intelligence Deep Dive */}
                {assessment.pmDecisionScores && assessment.pmDecisionScores.isDecisionScenario && (
                  <div className="accordion-item">
                    <button
                      type="button"
                      className="accordion-trigger"
                      aria-expanded={deepDiveSections.decision}
                      onClick={() => toggleDeepDiveSection('decision')}
                    >
                      <span>🎯 Product Decision Intelligence Breakdown & Evidence</span>
                      <span>{deepDiveSections.decision ? '▲' : '▼'}</span>
                    </button>
                    {deepDiveSections.decision && (
                      <div className="accordion-body">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                            <strong style={{ color: '#1e293b' }}>Decision Clarity:</strong>
                            <p style={{ margin: '4px 0', color: '#475569' }}>{assessment.pmDecisionScores.decisionClarity.rationale}</p>
                            {assessment.pmDecisionScores.decisionClarity.evidenceQuote && (
                              <div className="quote" style={{ margin: '6px 0 0', fontSize: '12px', borderLeftColor: '#6366f1' }}>
                                “{assessment.pmDecisionScores.decisionClarity.evidenceQuote}”
                              </div>
                            )}
                          </div>

                          <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                            <strong style={{ color: '#1e293b' }}>Supporting Evidence:</strong>
                            <p style={{ margin: '4px 0', color: '#475569' }}>{assessment.pmDecisionScores.supportingEvidence.rationale}</p>
                            {assessment.pmDecisionScores.supportingEvidence.evidenceQuote && (
                              <div className="quote" style={{ margin: '6px 0 0', fontSize: '12px', borderLeftColor: '#0ea5e9' }}>
                                “{assessment.pmDecisionScores.supportingEvidence.evidenceQuote}”
                              </div>
                            )}
                          </div>

                          <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                            <strong style={{ color: '#1e293b' }}>Trade-off Articulation:</strong>
                            <p style={{ margin: '4px 0', color: '#475569' }}>{assessment.pmDecisionScores.tradeoffArticulation.rationale}</p>
                            {assessment.pmDecisionScores.tradeoffArticulation.evidenceQuote && (
                              <div className="quote" style={{ margin: '6px 0 0', fontSize: '12px', borderLeftColor: '#f59e0b' }}>
                                “{assessment.pmDecisionScores.tradeoffArticulation.evidenceQuote}”
                              </div>
                            )}
                          </div>

                          <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '12.5px' }}>
                            <strong style={{ color: '#1e293b' }}>Business or Customer Impact:</strong>
                            <p style={{ margin: '4px 0', color: '#475569' }}>{assessment.pmDecisionScores.businessImpact.rationale}</p>
                            {assessment.pmDecisionScores.businessImpact.evidenceQuote && (
                              <div className="quote" style={{ margin: '6px 0 0', fontSize: '12px', borderLeftColor: '#10b981' }}>
                                “{assessment.pmDecisionScores.businessImpact.evidenceQuote}”
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="actions" style={{ marginTop: '20px' }}>
                  <button className="btn" onClick={() => setStep(3)}>
                    Practice this technique now →
                  </button>
                  <button className="btn ghost" onClick={() => setCoachingTab('coaching')}>
                    ← Back to My Coaching
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* SCREEN 04: PRACTICE WITH VIRA */}
          {step === 3 && assessment && (
            <section>
              <span className="eyebrow">04 / PRACTICE WITH VIRA</span>
              <h1>One small change. A clearer message.</h1>
              <p>Apply the technique you just learned. Rehearse your answer with focus and intention.</p>

              <div id="step4-section" className="callout" style={{ borderLeft: '4px solid #7153de', background: '#f8f6ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: '#5534c7' }}>
                    {practiceAttempt === 2
                      ? `🎯 Practice 2: ${practice2Challenge?.title || 'Targeted Follow-Up Challenge'}`
                      : `🎯 Vira's Technique Guide: ${assessment.technique.name}`}
                  </h3>
                  <span className="tag" style={{ background: '#eee8ff' }}>
                    {practiceAttempt === 2 ? 'Attempt 2 of 2' : `Focus: ${assessment.focus.toUpperCase()}`}
                  </span>
                </div>

                {practiceAttempt === 2 ? (
                  <div style={{ marginTop: '10px', padding: '12px 16px', background: '#ffffff', borderRadius: '12px', border: '1.5px solid #ded5ff' }}>
                    <strong style={{ color: '#5534c7', display: 'block', marginBottom: '4px', fontSize: '14px' }}>
                      👉 Your Practice 2 Challenge:
                    </strong>
                    <p style={{ margin: 0, color: '#2e1065', fontSize: '13.5px', lineHeight: 1.55 }}>
                      {practice2Challenge?.exercise || 'Refine your rehearsal to address remaining gaps, sharpen transitions, and deliver your recommendation with certainty.'}
                    </p>
                    {practice2Challenge?.sentenceStarter && (
                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #ded5ff', fontSize: '13px' }}>
                        <strong style={{ color: '#6d28d9' }}>Recommended Opening:</strong>{' '}
                        <span style={{ fontStyle: 'italic', color: '#3b0764' }}>
                          “{practice2Challenge.sentenceStarter}”
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ margin: '10px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.7)', borderRadius: '12px' }}>
                      <strong style={{ fontSize: '13px', color: '#3f385c' }}>The Structure to Follow:</strong>
                      <ul style={{ margin: '6px 0 0 18px', fontSize: '13.5px', color: '#554e66', lineHeight: 1.5 }}>
                        {assessment.technique.steps.map((st, i) => (
                          <li key={i}>{st}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="quote" style={{ margin: '10px 0', borderLeftColor: '#7153de', whiteSpace: 'pre-line', lineHeight: 1.65 }}>
                      <strong style={{ display: 'block', marginBottom: '4px', color: '#6545e8' }}>💡 Illustrative Model Script:</strong>
                      {assessment.technique.example}
                    </div>

                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f1ebff', borderRadius: '12px', fontSize: '13.5px' }}>
                      <strong style={{ color: '#5534c7' }}>👉 Your Guided Mission:</strong> {assessment.exercise}
                    </div>
                  </>
                )}
              </div>

              {/* Retry Speech / Text Input */}
              <div className="speech">
                <div className="tiny" style={{ textAlign: 'center', fontWeight: 700, color: '#6545e8' }}>
                  {isRecording2 ? '🔴 Listening… speak your retry clearly (Tap mic when done)' : 'Tap mic to speak, or type your retry'}
                </div>
                <div className="record">
                  <button
                    type="button"
                    className={`mic ${isRecording2 ? 'recording' : ''}`}
                    onClick={() => toggleSpeech(2)}
                    title="Tap to speak retry"
                  >
                    🎙️
                  </button>
                  {isRecording2 && <span className="counter">{recTimer2}</span>}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                  <label className="field" htmlFor="answer2" style={{ margin: 0 }}>
                    {practiceAttempt === 2 ? 'Practice 2 Rehearsal' : 'Practice 1 Rehearsal'}
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {answer2.length > 0 && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: '3px 8px', fontSize: '11.5px', color: '#887c9c', borderRadius: '8px' }}
                        onClick={() => {
                          stopSpeech();
                          setAnswer2('');
                          speechBaseTextRef.current = '';
                        }}
                      >
                        🗑️ Clear text
                      </button>
                    )}
                    <span className="tag" style={{ background: '#eee8ff', fontSize: '11px', fontWeight: 700, color: '#5534c7' }}>
                      {practiceAttempt === 2 ? 'Attempt 2 of 2' : 'Attempt 1 of 2'}
                    </span>
                  </div>
                </div>
                <div className="small" style={{ color: '#7a718c', marginBottom: '8px' }}>
                  {practiceAttempt === 2
                    ? '💡 Rehearse once more to address remaining gaps or bring back key narrative elements.'
                    : '💡 Deliver your genuine spoken or typed response applying the model above.'}
                </div>
                <textarea
                  id="answer2"
                  placeholder={practiceAttempt === 2 ? "Apply Vira's feedback and deliver your final rehearsal..." : "Apply your technique and share your second attempt here..."}
                  value={answer2}
                  onChange={e => setAnswer2(e.target.value)}
                />
                <div className="small" style={{ marginTop: '6px' }}>
                  {answer2.length} characters (min 35)
                </div>
              </div>

              <div className="actions">
                <button
                  className="btn"
                  disabled={comparing}
                  onClick={handleCompare}
                >
                  {comparing ? (
                    <>
                      <span className="spinner" /> Vira is analyzing your progress...
                    </>
                  ) : practiceAttempt === 2 ? (
                    'Compare Practice 2 answers →'
                  ) : (
                    'Compare my answers →'
                  )}
                </button>
                <button className="btn ghost" onClick={() => {
                  setStep(2);
                  window.scrollTo({ top: 0, behavior: 'instant' });
                }}>
                  ← Review Technique
                </button>
              </div>

              {apiError && (
                <div className="callout" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b', marginTop: '14px' }}>
                  ⚠️ {apiError}
                </div>
              )}

              {/* Comparison Results Card */}
              {comparison && (
                <div style={{ marginTop: '34px', borderTop: '2px dashed #ece6f8', paddingTop: '24px' }}>
                  <span className="eyebrow">PRACTICE RESULTS</span>
                  <h2 style={{ marginBottom: '14px' }}>Your Progress With Vira</h2>

                  {/* 1. Vira's Progress Insight (Summary-First: Most Prominent Part of Results at Top) */}
                  <div
                    className="callout"
                    style={{
                      background: 'linear-gradient(170deg, #f8f5ff 0%, #ffffff 100%)',
                      border: '2px solid #ded5ff',
                      borderRadius: '18px',
                      padding: '20px 22px',
                      margin: '18px 0',
                      boxShadow: '0 8px 24px rgba(113, 83, 222, 0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <span className="avatar" style={{ fontSize: '24px' }}>👩‍💼</span>
                      <div>
                        <strong style={{ color: '#5534c7', fontSize: '15.5px', display: 'block' }}>
                          Vira&apos;s Progress Insight
                        </strong>
                        <span className="tiny" style={{ color: '#7a718c' }}>Contextual evaluation of your retry</span>
                      </div>
                    </div>
                    <p style={{ margin: 0, color: '#2d254b', fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                      {comparison.progressInsight || comparison.tradeOffAnalysis || comparison.whatImproved}
                    </p>
                  </div>

                  {/* 2. What Improved and What Still Needs Work (Requirement 4) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '20px 0' }}>
                    {/* What Improved */}
                    <div className="callout" style={{ background: '#f5fbf8', borderColor: '#c8edd9', borderLeft: '4px solid #1f9e76', margin: 0, padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '16px' }}>✨</span>
                        <h3 style={{ margin: 0, color: '#16654a', fontSize: '14.5px' }}>What Improved</h3>
                      </div>
                      <p style={{ margin: 0, color: '#1f513b', fontSize: '13px', lineHeight: 1.5 }}>
                        {comparison.whatImproved}
                      </p>
                    </div>

                    {/* What Still Needs Work */}
                    <div className="callout" style={{ background: '#fff9f6', borderColor: '#fed7aa', borderLeft: '4px solid #f97316', margin: 0, padding: '16px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '16px' }}>🎯</span>
                        <h3 style={{ margin: 0, color: '#9a3412', fontSize: '14.5px' }}>What Still Needs Work</h3>
                      </div>
                      <p style={{ margin: 0, color: '#7c2d12', fontSize: '13px', lineHeight: 1.5 }}>
                        {comparison.stillNeedsWork}
                      </p>
                    </div>
                  </div>

                  {/* 3. Your Next Challenge with Practice Again Button (Requirement 5) */}
                  <div
                    className="callout"
                    style={{
                      background: '#faf7ff',
                      border: '1.5px solid #ded5ff',
                      borderLeft: '4px solid #7153de',
                      borderRadius: '16px',
                      padding: '18px 20px',
                      margin: '20px 0',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ flex: 1, minWidth: '240px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '18px' }}>🚀</span>
                          <h3 style={{ margin: 0, color: '#5534c7', fontSize: '15px' }}>
                            Your next challenge: {comparison.nextChallenge?.title || 'Bring Back the Core Essence'}
                          </h3>
                        </div>
                        <p style={{ margin: '4px 0 10px', color: '#3a3455', fontSize: '13.5px', lineHeight: 1.55 }}>
                          {comparison.nextChallenge?.exercise || comparison.nextStep}
                        </p>
                        {comparison.nextChallenge?.sentenceStarter && (
                          <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.85)', borderRadius: '10px', fontSize: '12.5px', marginTop: '6px' }}>
                            <strong style={{ color: '#6d28d9' }}>Opening Starter:</strong>{' '}
                            <span style={{ color: '#1e1b4b', fontStyle: 'italic' }}>
                              “{comparison.nextChallenge.sentenceStarter}”
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Clear Practice Again Action */}
                      <div>
                        <button
                          type="button"
                          className="btn"
                          onClick={handlePracticeAgain}
                          style={{ padding: '10px 18px', fontSize: '13px', whiteSpace: 'nowrap' }}
                        >
                          {practiceAttempt === 1 ? 'Start Practice 2 Rehearsal →' : 'Practice Again ↺'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4. Core Meaning Preserved Audit */}
                  <div
                    className="callout"
                    style={{
                      background: comparison.meaningPreserved ? '#eefaf5' : '#fff7ed',
                      borderColor: comparison.meaningPreserved ? '#c3edd8' : '#fcd6aa',
                      padding: '14px 18px',
                      margin: '16px 0',
                    }}
                  >
                    <strong style={{ display: 'block', marginBottom: '4px', color: comparison.meaningPreserved ? '#16654a' : '#9a3412', fontSize: '13.5px' }}>
                      {comparison.meaningPreserved ? '✅ Core Meaning Preserved' : '⚠️ Meaning Shift Detected'}
                    </strong>
                    <p style={{ margin: 0, fontSize: '12.5px', color: comparison.meaningPreserved ? '#1f513b' : '#7c2d12' }}>
                      {comparison.meaningNote}
                    </p>
                  </div>

                  {/* 5. Accessible Expandable Full Matrix & Transcripts */}
                  <div className="accordion-item" style={{ margin: '18px 0' }}>
                    <button
                      type="button"
                      className="accordion-trigger"
                      aria-expanded={showFullComparison}
                      onClick={() => setShowFullComparison(prev => !prev)}
                      style={{ background: '#fcfaff' }}
                    >
                      <span>📊 {showFullComparison ? 'Hide' : 'View'} Full Dimension Comparison & Transcripts ({comparison.multiAttemptRows?.length || 5} skills)</span>
                      <span>{showFullComparison ? '▲' : '▼'}</span>
                    </button>
                    {showFullComparison && (
                      <div className="accordion-body" style={{ padding: '16px 18px' }}>
                        {/* Multidimensional Progress Summary Table */}
                        <div style={{ margin: '0 0 16px', overflowX: 'auto', background: '#ffffff', border: '1px solid #ebe6f5', borderRadius: '14px', padding: '6px 12px' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }} aria-label="Progress comparison between baseline and practice attempts">
                            <thead>
                              <tr style={{ borderBottom: '1.5px solid #ede7fb', color: '#68607c' }}>
                                <th style={{ padding: '10px 8px', fontWeight: 700 }}>Skill</th>
                                <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Baseline</th>
                                <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Practice 1</th>
                                {comparison.hasPractice2 && (
                                  <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center' }}>Practice 2</th>
                                )}
                                <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'right' }}>Trend</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(comparison.multiAttemptRows && comparison.multiAttemptRows.length > 0
                                ? comparison.multiAttemptRows
                                : Object.values(comparison.dimensions || {}).map(d => ({
                                    skill:
                                      d.dimension === 'goalEffectiveness'
                                        ? `${goal} Quality`
                                        : d.dimension === 'scenarioAlignment'
                                        ? 'Scenario Alignment'
                                        : d.dimension.charAt(0).toUpperCase() + d.dimension.slice(1),
                                    baseline: d.originalScore,
                                    practice1: d.revisedScore,
                                    practice2: undefined,
                                    trend: d.classification,
                                    change: d.change,
                                  }))
                              ).map((row, idx, arr) => {
                                const isImproved = row.trend === 'improved';
                                const isDeclined = row.trend === 'declined';

                                return (
                                  <tr key={idx} style={{ borderBottom: idx === arr.length - 1 ? 'none' : '1px solid #f2edf9' }}>
                                    <td style={{ padding: '10px 8px', fontWeight: 600, color: '#2d254b' }}>
                                      {row.skill}
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#7a718c', fontWeight: 600 }}>
                                      {row.baseline}/5
                                    </td>
                                    <td style={{ padding: '10px 8px', textAlign: 'center', color: !comparison.hasPractice2 ? (isImproved ? '#16654a' : isDeclined ? '#991b1b' : '#3f385c') : '#7a718c', fontWeight: 600 }}>
                                      {row.practice1 !== undefined ? `${row.practice1}/5` : '—'}
                                    </td>
                                    {comparison.hasPractice2 && (
                                      <td style={{ padding: '10px 8px', textAlign: 'center', color: isImproved ? '#16654a' : isDeclined ? '#991b1b' : '#3f385c', fontWeight: 700 }}>
                                        {row.practice2 !== undefined ? `${row.practice2}/5` : '—'}
                                      </td>
                                    )}
                                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                      <span
                                        className="tag"
                                        style={{
                                          fontSize: '11px',
                                          padding: '3px 8px',
                                          borderRadius: '8px',
                                          background: isImproved ? '#eaf8f2' : isDeclined ? '#fee2e2' : '#f1f0f5',
                                          color: isImproved ? '#16654a' : isDeclined ? '#991b1b' : '#524b68',
                                          fontWeight: 700,
                                          display: 'inline-block',
                                        }}
                                      >
                                        {isImproved ? `+${row.change > 0 ? row.change : 1} Improved` : isDeclined ? `${row.change < 0 ? row.change : -1} Declined` : 'Similar'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Side by side transcript comparison */}
                        <div style={{ padding: '12px 14px', background: '#faf9fe', borderRadius: '12px', border: '1px solid #ede7fb' }}>
                          <h3 style={{ fontSize: '13.5px', margin: '0 0 8px', color: '#3f385c' }}>Attempt Progression Comparison</h3>
                          <div className="quote" style={{ marginBottom: '8px', fontSize: '12.5px', background: '#ffffff' }}>
                            <strong>Baseline:</strong> “{answer1.slice(0, 140)}...”
                          </div>
                          {comparison.hasPractice2 && practice1Answer ? (
                            <>
                              <div className="quote" style={{ marginBottom: '8px', borderLeftColor: '#7153de', fontSize: '12.5px', background: '#ffffff' }}>
                                <strong>Practice 1:</strong> “{practice1Answer.slice(0, 140)}...”
                              </div>
                              <div className="quote" style={{ borderLeftColor: '#1f9e76', fontSize: '12.5px', background: '#ffffff' }}>
                                <strong>Practice 2:</strong> “{answer2.slice(0, 140)}...”
                              </div>
                            </>
                          ) : (
                            <div className="quote" style={{ borderLeftColor: '#1f9e76', fontSize: '12.5px', background: '#ffffff' }}>
                              <strong>Practice 1:</strong> “{answer2.slice(0, 140)}...”
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Quick User Feedback on Vira Guidance */}
                  <div className="callout" style={{ background: '#fcfaff', border: '1.5px solid #ece4ff', marginTop: '18px' }}>
                    {!feedbackSubmitted ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                          <strong style={{ fontSize: '14.5px', color: '#3f385c' }}>
                            Was Vira&apos;s guidance helpful for this scenario?
                          </strong>
                          <span className="tiny" style={{ color: '#887c9c' }}>Quick 1-tap rating</span>
                        </div>

                        {/* 1 to 5 rating buttons */}
                        <div style={{ display: 'flex', gap: '8px', margin: '10px 0', flexWrap: 'wrap' }}>
                          {[
                            { score: 1, label: '1 · Not really' },
                            { score: 2, label: '2 · A little' },
                            { score: 3, label: '3 · Helpful' },
                            { score: 4, label: '4 · Very helpful' },
                            { score: 5, label: '5 · Game changer! 🌟' },
                          ].map(item => (
                            <button
                              key={item.score}
                              type="button"
                              className={`btn ${feedbackRating === item.score ? '' : 'ghost'}`}
                              style={{ padding: '8px 12px', fontSize: '12.5px', borderRadius: '10px' }}
                              onClick={() => {
                                setFeedbackRating(item.score);
                                handleSubmitFeedback(item.score);
                              }}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>

                        {/* Quick tags & optional note once a rating is picked */}
                        {feedbackRating !== null && (
                          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #e9e3fa' }}>
                            <div className="tiny" style={{ fontWeight: 700, color: '#6545e8', marginBottom: '6px' }}>
                              What resonated most? (optional)
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                              {['Actionable framework', 'Relevant model script', 'Focus gap diagnosis', 'Before/After comparison'].map(tag => {
                                const isSelected = feedbackTags.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    className="tag"
                                    style={{
                                      cursor: 'pointer',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      background: isSelected ? '#7153de' : '#f0eaff',
                                      color: isSelected ? 'white' : '#6443d6',
                                      border: '0',
                                      borderRadius: '99px',
                                    }}
                                    onClick={() => {
                                      setFeedbackTags(prev =>
                                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                      );
                                    }}
                                  >
                                    {isSelected ? '✓ ' : '+ '} {tag}
                                  </button>
                                );
                              })}
                            </div>

                            <input
                              type="text"
                              className="input"
                              style={{ fontSize: '13px', padding: '9px 12px', borderRadius: '10px', marginBottom: '10px' }}
                              placeholder="Any quick thoughts or suggestions for Vira? (optional)"
                              value={feedbackComment}
                              onChange={e => setFeedbackComment(e.target.value)}
                            />

                            <button
                              type="button"
                              className="btn secondary"
                              style={{ padding: '8px 18px', fontSize: '13px' }}
                              onClick={() => handleSubmitFeedback()}
                              disabled={feedbackSubmitting}
                            >
                              {feedbackSubmitting ? 'Saving...' : 'Submit Feedback'}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '10px 0', color: '#1f9e76' }}>
                        <strong style={{ fontSize: '14.5px' }}>✨ Thank you for your feedback!</strong>
                        <div className="tiny" style={{ marginTop: '4px', color: '#4d826a' }}>
                          Your input helps Vira calibrate advice and become a sharper mentor for product managers.
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="actions">
                    <button className="btn" onClick={handleCopySummary}>
                      📋 Copy session summary
                    </button>
                    <button className="btn secondary" onClick={handleNextScenario}>
                      Next PM Scenario →
                    </button>
                    <button className="btn ghost" onClick={handleStartOver}>
                      Start fresh
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Footer Disclaimer & Links */}
          <div className="footer">
            <span>Scores are practice signals, not a validated assessment. All transcripts are sent securely.</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button className="reset" onClick={loadHistory}>
                Practice history
              </button>
              <button className="reset" onClick={handleStartOver}>
                Start over
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2>Your Practice History</h2>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: '4px 10px', fontSize: '13px' }}
                onClick={() => setShowHistoryModal(false)}
              >
                ✕ Close
              </button>
            </div>
            <p style={{ marginBottom: '18px' }}>
              Past sessions persisted in Supabase database for <strong>{user?.identifier}</strong>.
            </p>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <span className="spinner" style={{ borderTopColor: '#7153de' }} />
                <div className="tiny" style={{ marginTop: '10px' }}>Loading saved sessions...</div>
              </div>
            ) : historySessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                No completed practice sessions saved yet. Complete a practice retry to view your history here!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '55vh', overflowY: 'auto' }}>
                {historySessions.map(s => (
                  <div key={s.id} className="callout" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{s.goal}</strong>
                      <span className="tiny">{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p style={{ fontSize: '13px', margin: '4px 0', color: '#554e66' }}>
                      <strong>Audience:</strong> {s.audience} · <strong>Focus:</strong> {s.focusSkill}
                    </p>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '13px' }}>
                      <span>
                        Baseline: <b>{s.baselineScores[s.focusSkill as keyof Scores] || 2}/5</b>
                      </span>
                      <span>
                        Retry: <b>{s.retryScores?.[s.focusSkill as keyof Scores] || 'N/A'}/5</b>
                      </span>
                      {s.comparison?.verdict && (
                        <span className={`badge ${s.comparison.verdict === 'improved' ? 'improved' : 'similar'}`}>
                          {s.comparison.verdict}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
