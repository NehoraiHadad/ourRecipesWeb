/**
 * Content fingerprinting for the reconcile comparison.
 *
 * The Python function reads the last N channel messages and needs to answer one
 * question per message: *does the DB already have exactly this?* Sending the
 * full `raw_content` of hundreds of recipes back over the wire to answer that
 * would be wasteful, so both sides hash instead. The Python side reproduces
 * this with `hashlib.sha256(text.encode("utf-8")).hexdigest()`.
 */
import { createHash } from 'crypto';

/** SHA-256 hex digest of a message body. Empty and missing text hash alike. */
export function contentHash(text: string | null | undefined): string {
  return createHash('sha256').update(text ?? '', 'utf8').digest('hex');
}
