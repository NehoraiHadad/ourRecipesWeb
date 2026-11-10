'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { recipeVoiceCommand } from '@/lib/recipes/voiceCommands';

// SpeechRecognition is still prefixed in some browsers and absent from lib.dom.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useRecipeVoice(steps: string[]) {
  const [canSpeak, setCanSpeak] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const indexRef = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const recognitionRef = useRef<Recognition | null>(null);
  const wantsMic = useRef(false);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandRef = useRef<(text: string) => void>(() => {});
  const startRef = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    wantsMic.current = false;
    if (restartRef.current) clearTimeout(restartRef.current);
    recognitionRef.current?.abort();
    const hadSpeech = speechRef.current !== null;
    speechRef.current = null;
    if (hadSpeech && window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(false);
    setListening(false);
    setMicrophoneOn(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
    const utterance = new SpeechSynthesisUtterance(text);
    // Keep a strong reference, and ignore completion events from cancelled speech.
    speechRef.current = utterance;
    recognitionRef.current?.abort();
    window.speechSynthesis.cancel();
    utterance.lang = 'he-IL';
    const hebrewVoice = window.speechSynthesis.getVoices().find(voice => /^he(?:-|$)/i.test(voice.lang));
    if (hebrewVoice) utterance.voice = hebrewVoice;
    utterance.rate = 0.9;
    const finish = () => {
      if (speechRef.current !== utterance) return;
      speechRef.current = null;
      setSpeaking(false);
      startRef.current();
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      if (speechRef.current !== utterance) return;
      setStatus('ההקראה לא הצליחה. יש לבדוק שמותקן במכשיר קול בעברית.');
      finish();
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  const readStep = useCallback((index: number) => {
    const currentSteps = stepsRef.current;
    const bounded = Math.max(0, Math.min(index, currentSteps.length - 1));
    if (!currentSteps[bounded]) return;
    indexRef.current = bounded;
    setStepIndex(bounded);
    setStatus('');
    // Strip a written list prefix because we already announce the step number.
    const text = currentSteps[bounded].replace(/^\s*(?:\d+[.)\-:]|[-*•])\s*/, '');
    speak(`שלב ${bounded + 1} מתוך ${currentSteps.length}. ${text}`);
  }, [speak]);

  const next = useCallback(() => {
    if (indexRef.current >= stepsRef.current.length - 1) {
      setStatus('זה השלב האחרון במתכון. בתיאבון!');
      speak('זה השלב האחרון במתכון. בתיאבון!');
    } else readStep(indexRef.current + 1);
  }, [readStep, speak]);

  commandRef.current = text => {
    setTranscript(text);
    switch (recipeVoiceCommand(text)) {
      case 'next': next(); break;
      case 'previous': readStep(indexRef.current - 1); break;
      case 'repeat': readStep(indexRef.current); break;
      case 'restart': readStep(0); break;
      case 'stop': stop(); setStatus('הליווי הקולי נעצר.'); break;
      default:
        setStatus('לא זוהתה פקודת ניווט. אפשר לומר: מה עכשיו, חזור על השלב, או השלב הקודם.');
    }
  };

  useEffect(() => {
    setCanSpeak(Boolean(window.speechSynthesis) && typeof window.SpeechSynthesisUtterance === 'function');
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    setCanListen(Boolean(Constructor));
    if (Constructor) {
      const recognition = new Constructor();
      recognition.lang = 'he-IL';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      let running = false;
      startRef.current = () => {
        if (!wantsMic.current || speechRef.current || running || document.visibilityState === 'hidden') return;
        try {
          recognition.start();
          running = true;
          setListening(true);
        } catch {
          wantsMic.current = false;
          setMicrophoneOn(false);
          setListening(false);
          setStatus('לא ניתן להפעיל את המיקרופון. אפשר לנסות שוב או להשתמש בכפתורים.');
        }
      };
      recognition.onresult = event => {
        if (wantsMic.current && !speechRef.current) commandRef.current(event.results[0][0].transcript);
      };
      recognition.onerror = event => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        wantsMic.current = false;
        setMicrophoneOn(false);
        setListening(false);
        setStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'לא ניתנה הרשאה למיקרופון. אפשר לאפשר אותה בהגדרות הדפדפן או להשתמש בכפתורים.'
          : 'זיהוי הדיבור אינו זמין כרגע. יש לבדוק חיבור ותמיכה בעברית, או להשתמש בכפתורים.');
      };
      recognition.onend = () => {
        running = false;
        setListening(false);
        if (restartRef.current) clearTimeout(restartRef.current);
        if (wantsMic.current && !speechRef.current) restartRef.current = setTimeout(() => startRef.current(), 300);
      };
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        setStatus('הליווי הקולי הושהה ביציאה מהמסך. לחצו שוב כדי להמשיך.');
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
      }
      stop();
      recognitionRef.current = null;
    };
  }, [stop]);

  const toggleMicrophone = () => {
    if (wantsMic.current) {
      wantsMic.current = false;
      setMicrophoneOn(false);
      setListening(false);
      recognitionRef.current?.abort();
      return;
    }
    setStatus('');
    wantsMic.current = true;
    setMicrophoneOn(true);
    startRef.current();
  };

  return { canSpeak, canListen, stepIndex, speaking, listening, microphoneOn, status, transcript,
    read: () => readStep(indexRef.current), next, previous: () => readStep(indexRef.current - 1),
    restart: () => readStep(0), stop, toggleMicrophone };
}
