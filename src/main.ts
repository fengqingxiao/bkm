import Phaser from 'phaser';
import { MapScene } from './scenes/MapScene';

const params = new URLSearchParams(location.search);
const forceCanvas = params.get('renderer') === 'canvas';

function fatal(message: string): void {
  const el = document.getElementById('fatal');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}

window.addEventListener('error', (e) => fatal(`运行错误：${e.message || String(e.error)}`));
window.addEventListener('unhandledrejection', (e) => fatal(`加载失败：${String(e.reason)}`));

const game = new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'app',
  width: 640,
  height: 480,
  pixelArt: true,
  backgroundColor: '#000000',
  render: {
    antialias: false,
    pixelArt: true,
  },
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene],
});

(window as unknown as { game: Phaser.Game }).game = game;
