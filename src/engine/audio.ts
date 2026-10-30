let manifest: Record<string, string> | null = null;

async function audioManifest(): Promise<Record<string, string>> {
  if (!manifest) {
    const base = import.meta.env.BASE_URL;
    const res = await fetch(`${base}data/audio.json`);
    manifest = res.ok ? ((await res.json()) as Record<string, string>) : {};
  }
  return manifest as Record<string, string>;
}

export class AudioManager {
  private bgm?: HTMLAudioElement;
  private bgmName = '';
  private cache = new Map<string, HTMLAudioElement>();
  private map: Record<string, string> = {};

  async init(): Promise<void> {
    this.map = await audioManifest();
  }

  private url(kind: string, name: string): string | null {
    const rel = this.map[`${kind}/${name}`];
    if (!rel) return null;
    return `${import.meta.env.BASE_URL}assets/${rel}`;
  }

  playBgm(name: string, volume = 100, pitch = 100): void {
    if (!name || name === this.bgmName) return;
    this.bgm?.pause();
    this.bgmName = name;
    const url = this.url('BGM', name);
    if (!url) return;
    const el = this.cache.get(url) ?? new Audio(url);
    this.cache.set(url, el);
    el.loop = true;
    el.volume = Math.min(1, volume / 100);
    el.playbackRate = pitch / 100;
    el.currentTime = 0;
    el.play().catch(() => undefined);
    this.bgm = el;
  }

  playSe(name: string, volume = 100, pitch = 100): void {
    if (!name) return;
    const url = this.url('SE', name) ?? this.url('ME', name);
    if (!url) return;
    const el = new Audio(url);
    el.volume = Math.min(1, volume / 100);
    el.playbackRate = pitch / 100;
    el.play().catch(() => undefined);
  }
}
