import Phaser from 'phaser';
import { MapScene } from './scenes/MapScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'app',
  width: 640,
  height: 480,
  pixelArt: true,
  backgroundColor: '#000000',
  render: {
    antialias: false,
    pixelArt: true,
    preserveDrawingBuffer: true,
  },
  scale: {
    mode: Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [MapScene],
});

(window as unknown as { game: Phaser.Game }).game = game;
