import { assetUrl } from '../data/loader';
import type { LoadedTileset } from '../data/loader';

export interface MapImages {
  tileset: HTMLImageElement;
  autotiles: (HTMLImageElement | null)[];
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function tryLoadImage(url: string): Promise<HTMLImageElement | null> {
  return loadImage(url).catch(() => null);
}

export async function loadMapImages(ts: LoadedTileset): Promise<MapImages> {
  const tileset = await loadImage(assetUrl(`Graphics/Tilesets/${ts.image}.png`));
  const autotiles = await Promise.all(
    ts.autotiles.map((name) => (name ? tryLoadImage(assetUrl(`Graphics/Autotiles/${name}.png`)) : Promise.resolve(null))),
  );
  return { tileset, autotiles };
}
