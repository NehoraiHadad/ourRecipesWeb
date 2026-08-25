/**
 * The single fallback view (STRUCTURE_REFACTOR_TASKS.md §D3): a recipe the
 * server could not parse (`is_parsed=false`) — and an AI suggestion that has
 * not been saved yet, which is still plain channel text — is shown as the
 * text it is: a heading plus the body with its line breaks preserved.
 *
 * Deliberately not a "broken recipe" banner: ~75 of the recipes in the channel
 * are free-form and perfectly readable; only an explicit `parse_errors` list
 * (rendered by the management screens) calls them out.
 */
import React from 'react';
import { Typography } from '@/components/ui/Typography';

const TITLE_LABEL = 'כותרת:';

interface RawRecipeViewProps {
  /** The structured title when there is one; otherwise the first line is used. */
  title?: string | null;
  /** The raw channel message. */
  text: string;
  /** Optional hint above the text ("preview", "not saved yet", ...). */
  notice?: string;
  image?: string | null;
}

/** Splits the message into a heading and the rest of the text. */
function splitHeading(text: string, title?: string | null): { heading: string; body: string } {
  const lines = (text ?? '').split('\n');
  const firstLine = (lines[0] ?? '').replace(TITLE_LABEL, '').trim();
  const heading = title?.trim() || firstLine;

  // Drop the first line only when it is the heading we are already showing.
  const body = firstLine && heading === firstLine ? lines.slice(1).join('\n') : text;
  return { heading, body: body.replace(/^\n+/, '') };
}

const RawRecipeView: React.FC<RawRecipeViewProps> = ({ title, text, notice, image }) => {
  const { heading, body } = splitHeading(text ?? '', title);

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      {image && (
        <img
          src={image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`}
          alt={heading}
          className="rounded-lg w-full h-auto mb-4"
        />
      )}
      <div className="px-4 pt-4">
        {notice && (
          <div className="mb-3 rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2">
            <Typography variant="body" className="text-sm text-primary-700">
              {notice}
            </Typography>
          </div>
        )}

        {heading && <h2 className="text-2xl font-bold mb-3">{heading}</h2>}

        <div className="whitespace-pre-line leading-relaxed text-secondary-800">
          {body}
        </div>
      </div>
    </div>
  );
};

export default RawRecipeView;
