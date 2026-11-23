'use client';

import { useEffect, useRef, useState } from 'react';
import { CompactEngine, isProgress, prepareCompact, type ActiveRecipe, type Answer, type Progress, type Turn } from '@/lib/voice/compactEngine';

type States = Record<string, Progress>;
type Proposal = { answer: Answer; text: string; before: States };
export const progressLabel: Record<Progress, string> = { pending: 'ממתין', partial: 'בוצע חלקית', done: 'בוצע' };

function loadProgress(key: string, recipe: ActiveRecipe): States {
  let saved: States = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* First use or unavailable storage. */ }
  return Object.fromEntries(recipe.actions.map(({ id }) => [id, isProgress(saved[id]) ? saved[id] : 'pending']));
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

  async function start() {
    const signal = lifetime.current?.signal;
    if (!signal || busy.current || engine.current) return;
    busy.current = true;
    setStage('loading'); setError(''); setBytes(0);
    try {
      await prepareCompact(signal, n => { if (!signal.aborted) setBytes(n); });
      signal.throwIfAborted();
      engine.current = new CompactEngine();
      await engine.current.start(signal);
      setStage('ready');
    } catch (e) {
      if (!signal.aborted) { engine.current?.close(); engine.current = null; setError(String(e instanceof Error ? e.message : e)); setStage('idle'); }
    } finally { busy.current = false; }
  }
  function remember(text: string, answer: string) {
    history.current = [...history.current, { role: 'user' as const, content: text }, { role: 'assistant' as const, content: answer }].slice(-4);
  }
  async function submit(text: string, step: number, speak?: (reply: string) => void) {
    const signal = lifetime.current?.signal;
    if (!signal || !engine.current || busy.current || !text.trim()) return;
    const turn = revision.current;
    busy.current = true;
    setStage('thinking'); setError(''); setReply(''); setProposal(null);
    try {
      const answer = await engine.current.answer(recipe, progress, step, text.trim(), history.current, signal);
      if (signal.aborted || turn !== revision.current) return;
      if (answer.writes.length) {
        setProposal({ answer, text, before: progress });
        speak?.('יש עדכון מוצע. אפשר לבדוק ולאשר אותו במסך.');
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
  function confirm() {
    if (!proposal || proposal.before !== progress) return;
    const next = { ...progress };
    for (const w of proposal.answer.writes) next[w.action] = w.status;
    save(next); setReply(proposal.answer.reply); remember(proposal.text, proposal.answer.reply);
  }
  function manual(id: string, status: Progress) {
    if (!isProgress(status) || !Object.hasOwn(progress, id)) return;
    save({ ...progress, [id]: status }); setReply(''); history.current = [];
  }
  return { stage, bytes, progress, reply, error, proposal, start, submit, confirm, manual, dismiss: () => setProposal(null) };
}
