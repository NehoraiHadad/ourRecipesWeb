import webPush from 'web-push';
import { readFile, writeFile } from 'node:fs/promises';
const path = '.env.local';
let existing = '';
try { existing = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (/^TIMER_PUSH_PRIVATE_KEY=/m.test(existing)) {
  console.log('Timer Push keys already exist in .env.local; nothing changed.');
} else {
  if (/^TIMER_PUSH_(PUBLIC_KEY|SUBJECT|ENABLED)=/m.test(existing)) throw new Error('Partial Timer Push configuration exists; complete it without overwriting existing keys.');
  const keys = webPush.generateVAPIDKeys();
  await writeFile(path, `${existing.trimEnd()}\n\n# Local Timer Push configuration; keep private key out of source control.\nTIMER_PUSH_ENABLED=true\nTIMER_PUSH_PUBLIC_KEY=${keys.publicKey}\nTIMER_PUSH_PRIVATE_KEY=${keys.privateKey}\nTIMER_PUSH_SUBJECT=https://recipes.nehoraihadad.com\n`, { mode: 0o600 });
  console.log('Generated Timer Push keys in ignored .env.local. No key values are printed.');
}
