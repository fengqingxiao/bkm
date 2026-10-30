export interface TouchInput {
  dir: number | null;
  consumeAction(): boolean;
}

export function createTouchControls(): TouchInput {
  const held = new Set<number>();
  let action = false;

  const root = document.getElementById('dpad');
  const buttons = root ? [...root.querySelectorAll<HTMLButtonElement>('button')] : [];
  for (const btn of buttons) {
    const dir = Number(btn.dataset.dir);
    const press = (e: Event) => {
      e.preventDefault();
      held.add(dir);
    };
    const release = (e: Event) => {
      e.preventDefault();
      held.delete(dir);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
  }

  const actionBtn = document.getElementById('btn-action');
  actionBtn?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    action = true;
  });

  return {
    get dir() {
      if (held.size === 0) return null;
      return [...held][held.size - 1];
    },
    consumeAction() {
      if (!action) return false;
      action = false;
      return true;
    },
  };
}
