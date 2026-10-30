import type Phaser from 'phaser';
import { assetUrl } from '../data/loader';
import { loadImage } from './assets';

/** RGSS renders a charset as a 4x4 grid: 4 walk patterns per direction, rows down/left/right/up. */
export const DIRECTION_ROW: Record<number, number> = { 2: 0, 4: 1, 6: 2, 8: 3 };

export interface Charset {
  key: string;
  frameWidth: number;
  frameHeight: number;
  /** Sprites whose name contains "offset" stand 16px higher. */
  anchorShift: number;
}

export class CharsetStore {
  private cache = new Map<string, Charset>();
  private missing = new Set<string>();

  constructor(private scene: Phaser.Scene) {}

  async get(name: string): Promise<Charset | null> {
    const cached = this.cache.get(name);
    if (cached) return cached;
    if (this.missing.has(name)) return null;
    const img = await loadImage(assetUrl(`Graphics/Characters/${name}.png`)).catch(() => null);
    if (!img) {
      this.missing.add(name);
      return null;
    }
    // Sprite_Character: @cw = bitmap.width / 4, @ch = bitmap.height / 4
    const frameWidth = Math.floor(img.width / 4);
    const frameHeight = Math.floor(img.height / 4);
    const key = `charset:${name}`;
    if (!this.scene.textures.exists(key)) {
      this.scene.textures.addSpriteSheet(key, img, { frameWidth, frameHeight });
    }
    const charset: Charset = {
      key,
      frameWidth,
      frameHeight,
      anchorShift: /offset/i.test(name) ? 16 : 0,
    };
    this.cache.set(name, charset);
    return charset;
  }

  static frameOf(charset: Charset, direction: number, pattern: number): number {
    const row = DIRECTION_ROW[direction] ?? 0;
    return row * 4 + (((pattern % 4) + 4) % 4);
  }
}
