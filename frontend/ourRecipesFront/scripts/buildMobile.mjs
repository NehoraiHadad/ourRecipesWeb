import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('mobile/dist', { recursive: true });
await build({ entryPoints: ['mobile/src/main.ts'], outfile: 'mobile/dist/main.js', bundle: true, format: 'esm', target: 'es2020', minify: true });
for (const file of ['index.html', 'styles.css', 'offline.html']) await copyFile(`mobile/${file}`, `mobile/dist/${file}`);
await copyFile('mobile/assets/timer_end.wav', 'mobile/dist/timer_end.wav');
console.log('Built offline timer verification client in mobile/dist');
