'use client';
import { useMemo, useState } from 'react';
import RecipeVoiceGuide from '@/components/voice/RecipeVoiceGuide';
import { makeCookingRecipe } from '@/lib/voice/cookingState';
const samples = [
  { title: 'דוגמת בדיקה: בצק', ingredients: ['קמח', 'מים'], instructions: 'להוסיף קמח\nלהוסיף מים ולערבב\nללוש את הבצק' },
  { title: 'דוגמת בדיקה: סלט', ingredients: ['עגבנייה', 'מלפפון'], instructions: 'לחתוך עגבנייה\nלחתוך מלפפון\nלערבב את הירקות' },
];
export default function VoiceLab() {
  const [sample, setSample] = useState(0);
  const [source, setSource] = useState(samples[0].instructions);
  const recipe = useMemo(() => makeCookingRecipe(`lab-${sample}`, samples[sample].title, samples[sample].ingredients, source), [sample, source]);
  return <main dir="rtl" className="max-w-3xl mx-auto p-4 space-y-5 text-stone-900">
    <h1 className="text-3xl font-bold">מעבדת עוזר בישול קולי</h1>
    <p>הוכחת היתכנות לפני שילוב במתכונים הפעילים. הדוגמאות הן טקסט בדיקה ואינן מתכונים מלאים. שינוי מקור או מעבר בין דוגמאות מאפס את מצב הבישול ומפסיק הקלטה והרצה.</p>
    <label className="block">דוגמה לבדיקה<select aria-label="דוגמה לבדיקה" className="mx-3 border rounded p-2" value={sample} onChange={e => { const n = +e.target.value; setSample(n); setSource(samples[n].instructions); }}>{samples.map((s, i) => <option key={s.title} value={i}>{s.title}</option>)}</select></label>
    <label className="block">הוראות המקור (שלב בכל שורה)<textarea aria-label="הוראות המקור" className="block w-full p-3 border rounded-xl" rows={4} maxLength={8000} value={source} onChange={e => setSource(e.target.value)} /></label>
    {recipe.steps.length ? <RecipeVoiceGuide key={recipe.key} recipe={recipe} /> : <p>יש להזין הוראות מקור כדי להתחיל.</p>}
  </main>;
}
