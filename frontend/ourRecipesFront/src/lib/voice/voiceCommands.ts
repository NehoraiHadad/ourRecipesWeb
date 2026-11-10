import type { CookingProposal } from './cookingState';
// Explicit navigation and bare ambiguous reports are code-owned. These never
// propose completion or alter progress, and do not need a large language model.
export function localVoiceCommand(text: string): Exclude<CookingProposal['intent'], 'report' | 'advice'> | null {
  const value = text.replace(/[\u0591-\u05bd\u05bf-\u05c7\u200e\u200f]/g, '').replace(/[?!.,;:'"״׳]/g, '').replace(/\s+/g, ' ').trim();
  if (/^(?:מה עכשיו|מה השלב הבא|מה לעשות עכשיו|מה הלאה)$/.test(value)) return 'next';
  if (/^(?:על איזה שלב דילגתי|על מה דילגתי|אילו שלבים דילגתי|מה טרם סומן בשלבים קודמים)$/.test(value)) return 'missed';
  if (/^(?:עשיתי|סיימתי|גמרתי)(?: את)? (?:זה|זאת|הכל)$/.test(value)) return 'clarify';
  return null;
}
