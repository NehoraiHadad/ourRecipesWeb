import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}); const external=[];
 page.on('request',r=>{if(!r.url().startsWith('http://localhost:3000'))external.push(r.url())});
 await page.goto('http://localhost:3000/voice-lab');
 await page.getByRole('heading',{name:'עוזר בישול בעברית · ניסוי מקומי'}).waitFor();
 const controls=page.getByRole('checkbox');
 await controls.nth(1).check(); await controls.nth(2).check();
 await page.getByRole('button',{name:'מה עכשיו?',exact:true}).click();
 assert.match(await page.locator('main').innerText(),/הפעולה הבאה שנותרה: ולערבב/);
 await controls.nth(2).uncheck();
 await page.getByRole('button',{name:'מה עכשיו?',exact:true}).click();
 assert.match(await page.locator('main').innerText(),/הפעולה הבאה שנותרה: להוסיף מים/);
 await page.getByRole('button',{name:'לשלב הבא בלי לסמן השלמה'}).click();
 await page.getByRole('button',{name:'מה טרם סומן בשלבים קודמים?'}).click();
 assert.match(await page.locator('main').innerText(),/פעולות מוקדמות שטרם סומנו/);
 await controls.nth(0).check();
 await page.getByLabel('מה עשית או מה רצית לשאול?').fill('על איזה שלב דילגתי?');
 const workersBefore = page.workers().length;
 await page.getByRole('button',{name:'שליחה לעוזר המקומי',exact:true}).click();
 assert.match(await page.locator('main').innerText(),/פעולות מוקדמות שטרם סומנו/);
 assert.equal(page.workers().length,workersBefore);
 await page.getByLabel('דוגמה לבדיקה',{exact:true}).selectOption('1');
 assert.match(await page.locator('main').innerText(),/הושלמו 0/); assert.equal(await controls.nth(1).isChecked(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/voice-lab-mobile.png',fullPage:true});
 if(process.env.VOICE_MODEL_DIR){
   await page.route('https://huggingface.co/**', async route => {
     const pathname = new URL(route.request().url()).pathname;
     const relative = pathname.split('/resolve/')[1].split('/').slice(1).join('/');
     const file = path.join(process.env.VOICE_MODEL_DIR,'asr',relative);
     await route.fulfill({path:file,contentType:'application/octet-stream'});
   });
   await page.getByRole('button',{name:'הורדת מודל תמלול',exact:true}).click();
   await page.getByRole('button',{name:'הורדת מודל תמלול',exact:true}).waitFor();
   await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('72.3 MB · במטמון'),{timeout:30000});
   await page.getByRole('button',{name:'מחיקת כל המודלים מהדפדפן',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('main')?.textContent.includes('72.3 MB · טרם הורד'));
   assert.deepEqual(await page.evaluate(async()=> (await caches.keys()).filter(k=>k.startsWith('ourrecipes-voice-'))),[]);
   console.log('PASS: model download progress/cache/delete (replayed local model files, simulated network)');
 }

 assert.deepEqual(external.filter(url=>!url.startsWith('https://huggingface.co/')),[]);
 const unsupported=await browser.newPage();
 await unsupported.addInitScript(()=>{Object.defineProperty(window,'Worker',{value:undefined});Object.defineProperty(window,'caches',{value:undefined});});
 await unsupported.goto('http://localhost:3000/voice-lab');
 await unsupported.getByText('הרצה מקומית אינה זמינה כאן.',{exact:false}).waitFor();
 assert.equal(await unsupported.getByRole('button',{name:'הורדת מודל תמלול',exact:true}).isDisabled(),true);
 assert.equal(await unsupported.getByRole('button',{name:'מה עכשיו?',exact:true}).isEnabled(),true);
 console.log('PASS: partial action, correction, gap, recipe reset, mobile overflow, unsupported controls, no external content requests');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
