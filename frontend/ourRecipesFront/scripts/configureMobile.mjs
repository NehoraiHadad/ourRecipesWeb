import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = await readFile(manifestPath, 'utf8');
for (const name of ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'VIBRATE']) {
  if (!manifest.includes(`android.permission.${name}`)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="android.permission.${name}" />\n</manifest>`);
  }
}
await writeFile(manifestPath, manifest);
const variablesPath = 'android/variables.gradle';
const variables = await readFile(variablesPath, 'utf8');
await writeFile(variablesPath, variables.replace(/minSdkVersion = \d+/, 'minSdkVersion = 26'));
await mkdir('android/app/src/main/res/raw', { recursive: true });
await copyFile('mobile/assets/timer_end.wav', 'android/app/src/main/res/raw/timer_end.wav');
await mkdir('android/app/src/main/res/drawable', { recursive: true });
await writeFile('android/app/src/main/res/drawable/ic_stat_timer.xml', `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M9,1h6v2H9zM11,7h2v6h-2zM19.03,5.39l1.42,-1.42 1.41,1.42 -1.42,1.41A9,9 0,1 1,19.03 5.39zM12,5a7,7 0,1 0,0 14,7 7,0 0,0 0,-14z" />
</vector>\n`);
console.log('Configured notification permissions, Android 8+ channels and timer sound');
