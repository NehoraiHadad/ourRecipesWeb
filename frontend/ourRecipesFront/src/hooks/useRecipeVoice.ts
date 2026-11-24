'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { LocalNarrator } from '@/lib/voice/localNarrator';
import { recipeVoiceCommand } from '@/lib/recipes/voiceCommands';

// SpeechRecognition is still prefixed in some browsers and absent from lib.dom.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }> & {isFinal?: boolean}> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useRecipeVoice(steps: string[], onUtterance?: (text: string, step: number, speak: (text: string) => void) => boolean, interrupt?: MutableRefObject<(() => void) | null>,
  conversation?: MutableRefObject<{ stop(): void; mute(value: boolean): void } | null>) {
  const [systemVoice, setSystemVoice] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [preferNoa, setPreferNoa] = useState(false);
  const usingNoa = installed && (preferNoa || !systemVoice);
  const narrator = useRef<LocalNarrator | null>(null);
  const generation = useRef(0);
  const [canListen, setCanListen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const indexRef = useRef(0);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [microphoneOn, setMicrophoneOn] = useState(false);
  const [status, setStatus] = useState('');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const recognitionRef = useRef<Recognition | null>(null);
  const wantsMic = useRef(false);
  const speechRef = useRef<SpeechSynthesisUtterance | symbol | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandRef = useRef<(text: string, local?: boolean) => void>(() => {});
  const startRef = useRef<() => void>(() => {});

  const stopBrowser = useCallback(() => {
    generation.current++;
    setInterim('');
    narrator.current?.stop();
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
  const stop = useCallback(() => {
    conversation?.current?.stop();
    interrupt?.current?.();
    stopBrowser();
  }, [conversation, interrupt, stopBrowser]);

  const speak = useCallback((text: string) => {
    interrupt?.current?.();
    if (document.visibilityState === 'hidden') return;
    const local = window.speechSynthesis?.getVoices().find(v => v.localService && /^he(?:-|$)/i.test(v.lang));
    if (!usingNoa && (!local || typeof window.SpeechSynthesisUtterance !== 'function')) return;
    const utterance = usingNoa ? null : new SpeechSynthesisUtterance(text);
    const token = utterance ?? Symbol('noa');
    conversation?.current?.mute(true);
    setInterim('');
    speechRef.current = token;
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    const finish = (error?: string) => {
      if (speechRef.current !== token) return;
      speechRef.current = null;
      if (error) setStatus(error);
      setSpeaking(false);
      conversation?.current?.mute(false);
      startRef.current();
    };
    setSpeaking(true);
    if (utterance && local) {
      utterance.lang = 'he-IL'; utterance.voice = local; utterance.rate = 0.9;
      utterance.onend = () => finish();
      utterance.onerror = () => finish('ההקראה לא הצליחה. אפשר לבחור בקול נועה.');
      window.speechSynthesis.speak(utterance);
    } else {
      narrator.current ??= new LocalNarrator();
      void narrator.current.play(text).then(() => finish(),
        e => finish(e instanceof Error ? e.message : 'ההקראה נכשלה. אפשר לקרוא את הטקסט במסך.'));
    }
  }, [conversation,interrupt,usingNoa]);

  // Unlock Web Audio inside the mic gesture, before the asynchronous ASR and brain turn.
  const primeNoa = (force = false) => {
    if (!usingNoa && !force) return;
    narrator.current ??= new LocalNarrator();
    void narrator.current.unlock().catch(() => {});
  };
  const startLocalMic = () => {conversation?.current?.stop(); stopBrowser(); primeNoa();};
  const chooseVoice = (noa: boolean) => {stop(); narrator.current?.close(); narrator.current = null; setPreferNoa(noa);};

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

  commandRef.current = (text, local = false) => {
    setTranscript(text);
    const turn = generation.current;
    const reply = (answer: string) => { if (generation.current === turn && (local || wantsMic.current)) speak(answer); };
    if (onUtterance?.(text, indexRef.current, reply)) { setStatus(''); return; }
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
    const synth = window.speechSynthesis;
    const updateVoices = () => setSystemVoice(!!synth && typeof window.SpeechSynthesisUtterance === 'function' &&
      synth.getVoices().some(v => v.localService && /^he(?:-|$)/i.test(v.lang)));
    updateVoices();
    synth?.addEventListener?.('voiceschanged', updateVoices);
    const Constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
    setCanListen(Boolean(Constructor));
    if (Constructor) {
      const recognition = new Constructor();
      recognition.lang = 'he-IL';
      recognition.continuous = false;
      recognition.interimResults = true;
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
        if (!wantsMic.current || speechRef.current) return;
        for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal === false) setInterim(text);
          else { setInterim(''); commandRef.current(text); }
        }
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
        setInterim('');
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
      synth?.removeEventListener?.('voiceschanged', updateVoices);
      document.removeEventListener('visibilitychange', onHidden);
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
      }
      stop();
      narrator.current?.close(); narrator.current = null;
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
    conversation?.current?.stop();
    interrupt?.current?.();
    primeNoa();
    wantsMic.current = true;
    setMicrophoneOn(true);
    startRef.current();
  };

  const acceptTranscript = (text: string) => {
    if (!speechRef.current && document.visibilityState !== 'hidden') commandRef.current(text, true);
  };
  return { acceptTranscript, primeNoa, startLocalMic, systemVoice, installed, setInstalled, usingNoa, chooseVoice, canSpeak: systemVoice || installed, canListen, stepIndex, speaking, listening, microphoneOn, status, transcript, interim,
    read: () => readStep(indexRef.current), next, previous: () => readStep(indexRef.current - 1),
    restart: () => readStep(0), stop, speak, toggleMicrophone,
    focus: (step: number) => { indexRef.current = step; setStepIndex(step); } };
}
