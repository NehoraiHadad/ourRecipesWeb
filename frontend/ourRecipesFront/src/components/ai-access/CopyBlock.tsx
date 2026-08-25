'use client';

import { useState } from 'react';

/**
 * LTR code block with a copy button, for connection snippets on the `/ai`
 * page. `<המפתח>` placeholders are copied as-is — the reader pastes the key
 * they received privately.
 */
export function CopyBlock({ label, text }: { label?: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (old browser / no permission) — user can select manually.
    }
  };

  return (
    <div className="my-2">
      {label && <div className="text-sm text-secondary-600 mb-1">{label}</div>}
      <div className="relative group">
        <pre
          dir="ltr"
          className="bg-secondary-900 text-secondary-50 text-xs sm:text-sm rounded-lg p-3 pr-3 pl-16 overflow-x-auto whitespace-pre-wrap break-all"
        >
          {text}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 left-2 text-xs bg-secondary-700 hover:bg-secondary-600 text-white rounded px-2 py-1 transition-colors"
        >
          {copied ? 'הועתק ✓' : 'העתקה'}
        </button>
      </div>
    </div>
  );
}
