import { DIR_DOWN, TILE } from './movement';

export type StepCheck = (x: number, y: number, dir: number) => boolean;

/** Grid character: one 32px tile per step, RGSS move-speed semantics. */
export class Character {
  tileX = 0;
  tileY = 0;
  px = 0;
  py = 0;
  direction = DIR_DOWN;
  pattern = 0;
  moving = false;

  private targetX = 0;
  private targetY = 0;
  private travelled = 0;
  private arriveResolvers: (() => void)[] = [];

  constructor(
    public moveSpeed = 3,
    public walkAnime = true,
    public stepAnime = false,
    public directionFix = false,
  ) {}

  /** RGSS: quarter-pixels per frame converted to screen px/s (speed 3 = 128 px/s). */
  private get pixelsPerSecond(): number {
    return 2 ** (this.moveSpeed + 1) * 8;
  }

  placeAt(tileX: number, tileY: number): void {
    this.tileX = tileX;
    this.tileY = tileY;
    this.px = tileX * TILE;
    this.py = tileY * TILE;
    this.moving = false;
    this.pattern = 0;
  }

  private dirDelta(dir: number): [number, number] {
    return [dir === 4 ? -1 : dir === 6 ? 1 : 0, dir === 2 ? 1 : dir === 8 ? -1 : 0];
  }

  update(delta: number, dir: number | null, canStep: StepCheck): void {
    if (!this.moving && dir !== null) {
      if (!this.directionFix) this.direction = dir;
      const [dx, dy] = this.dirDelta(dir);
      const nx = this.tileX + dx;
      const ny = this.tileY + dy;
      if (canStep(nx, ny, dir)) {
        this.targetX = nx;
        this.targetY = ny;
        this.moving = true;
        this.travelled = 0;
      }
    }
    if (!this.moving) return;

    const step = (this.pixelsPerSecond * delta) / 1000;
    const remainX = this.targetX * TILE - this.px;
    const remainY = this.targetY * TILE - this.py;
    if (Math.abs(remainX) <= step && Math.abs(remainY) <= step) {
      this.px = this.targetX * TILE;
      this.py = this.targetY * TILE;
      this.tileX = this.targetX;
      this.tileY = this.targetY;
      this.moving = false;
      this.travelled = 0;
      this.pattern = 0;
      for (const resolve of this.arriveResolvers.splice(0)) resolve();
      return;
    }
    this.px += Math.sign(remainX) * Math.min(step, Math.abs(remainX));
    this.py += Math.sign(remainY) * Math.min(step, Math.abs(remainY));
    this.travelled += step;
    // RGSS: frames_per_pattern = 128 / (real_speed * 2) -> one pattern per half tile,
    // but speed >= 5 doubles the span, i.e. one pattern per whole tile.
    const span = this.moveSpeed >= 5 ? TILE : TILE / 2;
    this.pattern = Math.floor(this.travelled / span) % 4;
  }

  /** Scripted single-tile step used by move routes; resolves when the step ends. */
  moveStep(dir: number, canStep: StepCheck): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.moving) {
        resolve(false);
        return;
      }
      if (!this.directionFix) this.direction = dir;
      const [dx, dy] = this.dirDelta(dir);
      const nx = this.tileX + dx;
      const ny = this.tileY + dy;
      if (!canStep(nx, ny, dir)) {
        resolve(false);
        return;
      }
      this.targetX = nx;
      this.targetY = ny;
      this.moving = true;
      this.travelled = 0;
      this.arriveResolvers.push(() => resolve(true));
    });
  }
}
