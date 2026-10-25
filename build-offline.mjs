import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const style = read('css/styles.css').replace(/^@charset[^;]+;\s*/i, '');
const data = read('js/data.js');
const game = read('js/game.js');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/styles.css">', () => `<style>\n${style}\n</style>`);
html = html.replace('<script src="js/data.js" defer></script>', () => `<script>\n${data}\n</script>`);
html = html.replace('<script src="js/game.js" defer></script>', () => `<script>\n${game}\n</script>`);
html = html.replace('<title>节气行旅 · 四季习俗小游戏</title>', () => '<title>节气行旅 · 四季习俗小游戏（单文件离线版）</title>');

if (/<script[^>]+src=/i.test(html) || /<link[^>]+rel=["']stylesheet/i.test(html)) throw new Error('离线版仍包含外部脚本或样式');
const externalRefs = [...html.matchAll(/(?:src|href)=["'](https?:[^"']+)/gi)].map(match => match[1]);
if (externalRefs.length || /url\(\s*["']?https?:/i.test(html)) throw new Error(`离线版仍包含远程资源：${externalRefs.join(', ')}`);

const output = path.join(root, 'output', '节气行旅_离线版.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log(JSON.stringify({ output, bytes: Buffer.byteLength(html), standalone: true }, null, 2));
