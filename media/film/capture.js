const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const dir = process.argv[2], mode = process.argv[3] || 'stills';
  const data = fs.readFileSync(dir + '/data.json', 'utf8');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(`window.__DATA = ${data};`);
  await p.goto('file://' + dir + '/film.html'); await p.evaluate(() => window.__ready);
  const grab = async (f, out) => { const url = await p.evaluate((f) => { window.__draw(f); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, f); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); };
  if (mode === 'stills') {
    fs.mkdirSync(dir + '/stills', { recursive: true });
    for (const s of [1.6, 4.6, 7.6, 9.2, 9.8, 11.0, 14.2, 16.0, 18.0, 18.7, 20.8, 23.2, 24.9, 28.0]) await grab(Math.round(s * 30), `${dir}/stills/t${s}.jpg`);
  } else {
    fs.mkdirSync(dir + '/frames', { recursive: true });
    for (let f = 0; f < 900; f++) { await grab(f, `${dir}/frames/f${String(f).padStart(4, '0')}.jpg`); if (f % 150 === 0) console.log('frame', f); }
  }
  console.log('errors', errs);
  await b.close();
})();
