'use client';

import { useEffect, useRef, useState } from 'react';
import { CompactEngine, isProgress, prepareCompact, type ActiveRecipe, type Answer, type Progress, type Turn } from '@/lib/voice/compactEngine';

import { nextInstruction, questionOnly, recipeTurn } from '@/lib/voice/recipeConversation';

type States = Record<string, Progress>;
type Proposal = { answer: Answer; text: string; before: States };
export const progressLabel: Record<Progress, string> = { pending: 'ממתין', partial: 'בוצע חלקית', done: 'בוצע' };

function loadProgress(key: string, recipe: ActiveRecipe): States {
  let saved: States = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* First use or unavailable storage. */ }
  return Object.fromEntries([...recipe.actions, ...recipe.ingredients].map(({ id }) => [id, isProgress(saved[id]) ? saved[id] : 'pending']));
}

// The guide is keyed by recipe and source revision, so another recipe starts a new session.
export function useCompactCooking(recipe: ActiveRecipe) {
  const key = 'recipe-cooking:' + recipe.id + ':' + recipe.version;
  const [progress, setProgress] = useState<States>({});
  const [stage, setStage] = useState<'idle' | 'loading' | 'ready' | 'thinking'>('idle');
  const [bytes, setBytes] = useState(0);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const engine = useRef<CompactEngine | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const revision = useRef(0);
  const history = useRef<Turn[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    function restore() {
      revision.current++;
      setProgress(loadProgress(key, recipe));
      setProposal(null);
      setReply('');
      history.current = [];
    }
    function sync(e: StorageEvent) { if (!e.key || e.key === key) restore(); }
    restore();
    window.addEventListener('storage', sync);
    return () => {
      controller.abort();
      engine.current?.close();
      engine.current = null;
      window.removeEventListener('storage', sync);
    };
  }, [key, recipe]);

  async function start(session?: AbortSignal) {
    const lifetimeSignal = lifetime.current?.signal;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const signal = controller.signal;
    if (engine.current && !busy.current) return true;
    if (!lifetimeSignal || lifetimeSignal.aborted || session?.aborted || busy.current) return false;
    lifetimeSignal.addEventListener('abort', cancel, {once:true});
    session?.addEventListener('abort', cancel, {once:true});
    busy.current = true;
    setStage('loading'); setError(''); setBytes(0);
    try {
      await prepareCompact(signal, n => { if (!signal.aborted) setBytes(n); });
      signal.throwIfAborted();
      engine.current = new CompactEngine();
      await engine.current.start(signal);
      signal.throwIfAborted();
      setStage('ready');
      return true;
    } catch (e) {
      engine.current?.close(); engine.current = null;
      if (!lifetimeSignal.aborted) {
        if (!signal.aborted) setError(String(e instanceof Error ? e.message : e));
        setStage('idle');
      }
      return false;
    } finally {
      lifetimeSignal.removeEventListener('abort', cancel);
      session?.removeEventListener('abort', cancel);
      busy.current = false;
    }
  }
  function remember(text: string, answer: string) {
    history.current = [...history.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: answer }].slice(-4);
  }
  async function submit(text: string, step: number, speak?: (reply: string) => void, focus?: (step: number) => void) {
    const signal = lifetime.current?.signal;
    if (!signal || !engine.current || busy.current || !text.trim()) return;
    const turn = revision.current;
    busy.current = true;
    setStage('thinking'); setError(''); setReply(''); setProposal(null);
    try {
      const direct = recipeTurn(recipe, progress, step, text.trim());
      let answer = direct ?? await engine.current.answer(recipe, progress, step, text.trim(), history.current, signal);
      if (!direct && answer.writes.length && questionOnly(text)) {
        answer = { writes: [], reply: 'לא ברור לי מה רצית לדעת. אפשר לשאול מה השלב הבא או כמה צריך ממצרך מסוים.' };
      }
      if (signal.aborted || turn !== revision.current) return;
      if (direct?.focus !== undefined) focus?.(direct.focus);
      if (direct?.writes.length) {
        save({ ...progress, ...Object.fromEntries(direct.writes.map(w => [w.action, w.status])) });
        setReply(answer.reply); remember(text, answer.reply); speak?.(answer.reply);
      } else if (answer.writes.length) {
        setProposal({ answer, text, before: progress });
        const summary = answer.writes.map(w => recipe.actions.find(a => a.id === w.action)?.source + ' — ' + progressLabel[w.status]).join(', ');
        speak?.(summary + '. לאשר? אפשר לומר כן או לא.');
      } else {
        setReply(answer.reply); remember(text, answer.reply); speak?.(answer.reply);
      }
    } catch (e) {
      if (!signal.aborted) { engine.current?.close(); engine.current = null; setError(e instanceof Error ? e.message : 'העיבוד נכשל.'); }
    } finally {
      busy.current = false;
      if (!signal.aborted) setStage(engine.current ? 'ready' : 'idle');
    }
  }
  function save(next: States) {
    revision.current++;
    setProgress(next); setProposal(null);
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { setError('ההתקדמות זמינה במסך הזה. השמירה במכשיר נכשלה.'); }
  }
  function confirm(step: number, focus: (step: number) => void) {
    if (!proposal || proposal.before !== progress) return;
    const next = { ...progress };
    for (const w of proposal.answer.writes) next[w.action] = w.status;
    let reply = proposal.answer.reply;
    const current = recipe.actions.filter(a => a.step === step);
    if (current.some(a => progress[a.id] !== 'done') && current.every(a => next[a.id] === 'done')) {
      const following = nextInstruction(recipe, next, step);
      if (following.focus !== undefined) focus(following.focus);
      reply += ' ' + following.reply;
    }
    save(next); setReply(reply); remember(proposal.text, reply);
    return reply;
  }
  function manual(id: string, status: Progress) {
    if (!isProgress(status) || !Object.hasOwn(progress, id)) return;
    save({ ...progress, [id]: status }); setReply(''); history.current = [];
  }
  return { stage, bytes, progress, reply, error, proposal, start, submit, confirm, manual, dismiss: () => setProposal(null) };
}
