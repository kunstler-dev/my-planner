// Renders build/icon.svg into build/icon.png, src/renderer/assets/icon.png and a multi-size build/icon.ico.
// Usage: npx electron scripts/make-icons.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// Render once at 256 px; smaller sizes are downscaled (tiny windows fail to load on some setups).
async function render(svg, size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const sized = svg.replace('width="256" height="256"', `width="${size}" height="${size}" style="display:block"`);
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${sized}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 150));
  const img = await win.webContents.capturePage();
  win.destroy();
  return img.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

// ICO with PNG-compressed images (supported since Windows Vista).
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'), 'utf8');
  const base = nativeImage.createFromBuffer(await render(svg, 256));
  const pngs = SIZES.map((size) => ({ size, data: size === 256 ? base.toPNG() : base.resize({ width: size, height: size, quality: 'best' }).toPNG() }));
  const big = pngs.at(-1).data;
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), big);
  fs.writeFileSync(path.join(root, 'src', 'renderer', 'assets', 'icon.png'), big);
  fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico(pngs));
  console.log('icons written');
  app.quit();
});
