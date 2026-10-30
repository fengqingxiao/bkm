import type { CommonEvent, EventCommand, MoveCommand } from '../data/types';
import type { GameState } from './state';

export interface InterpreterHost {
  message(lines: string[]): Promise<void>;
  choices(options: string[], cancelType: number): Promise<number>;
  transfer(mapId: number, x: number, y: number, dir: number): Promise<void>;
  playSe(name: string, volume: number, pitch: number): void;
  playBgm(name: string, volume: number, pitch: number): void;
  wait(ms: number): Promise<void>;
  movePlayer(dir: number): Promise<boolean>;
  eraseEvent(eventId: number): void;
  unsupported(code: number, params: unknown[]): void;
}

const clean = (text: string) =>
  text
    .replace(/\\c\[\d+\]/g, '')
    .replace(/\\[A-Za-z]+\[[^\]]*\]/g, '')
    .replace(/\\[A-Za-z]+/g, '');

const moveCommandsOf = (route: unknown): MoveCommand[] => {
  const list = (route as { '@list'?: { '@code': number; '@parameters': unknown[] }[] })?.['@list'] ?? [];
  return list.map((c) => ({ code: c['@code'], params: c['@parameters'] }));
};

export class Interpreter {
  private running = false;

  constructor(
    private state: GameState,
    private host: InterpreterHost,
    private commonEvents: (CommonEvent | null)[],
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async run(list: EventCommand[], eventId: number): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.execute(list, eventId);
    } finally {
      this.running = false;
    }
  }

  private async execute(list: EventCommand[], eventId: number): Promise<void> {
    let i = 0;
    const loops: number[] = [];

    const findAt = (from: number, indent: number, codes: number[]): number => {
      for (let k = from; k < list.length; k++) {
        if (list[k].indent === indent && codes.includes(list[k].code)) return k;
      }
      return -1;
    };

    while (i < list.length) {
      const cmd = list[i];
      const p = cmd.params ?? [];
      switch (cmd.code) {
        case 0:
          return;

        case 101: {
          const lines = [clean(String(p[0] ?? ''))];
          let k = i + 1;
          while (k < list.length && list[k].code === 401) {
            lines.push(clean(String(list[k].params[0] ?? '')));
            k++;
          }
          await this.host.message(lines);
          i = k;
          break;
        }

        case 102: {
          const options = (p[0] as string[]).map((o) => clean(o));
          const cancelType = Number(p[1] ?? 0);
          const chosen = await this.host.choices(options, cancelType);
          if (chosen < 0) {
            const cancelAt = findAt(i + 1, cmd.indent + 1, [403]);
            i = cancelAt >= 0 ? cancelAt + 1 : list.length;
            break;
          }
          const branch = list.findIndex(
            (c, k) => k > i && c.code === 402 && c.indent === cmd.indent + 1 && Number(c.params[0]) === chosen,
          );
          i = branch >= 0 ? branch + 1 : list.length;
          break;
        }

        case 402:
        case 403:
        case 404:
          i++;
          break;

        case 111: {
          const result = this.evaluateCondition(cmd, eventId);
          if (result) {
            i++;
            break;
          }
          const end = findAt(i + 1, cmd.indent, [411, 412]);
          if (end >= 0 && list[end].code === 411) i = end + 1;
          else if (end >= 0) i = end + 1;
          else i = list.length;
          break;
        }

        case 411: {
          const end = findAt(i + 1, cmd.indent, [412]);
          i = end >= 0 ? end + 1 : list.length;
          break;
        }

        case 412:
          i++;
          break;

        case 112:
          loops.push(i);
          i++;
          break;

        case 413:
          i = (loops[loops.length - 1] ?? i) + 1;
          break;

        case 113: {
          const end = findAt(i + 1, cmd.indent, [413]);
          loops.pop();
          i = end >= 0 ? end + 1 : list.length;
          break;
        }

        case 115:
          return;

        case 116:
          this.host.eraseEvent(eventId);
          return;

        case 117: {
          const common = this.commonEvents[Number(p[0])];
          if (common) await this.execute(common.list, eventId);
          i++;
          break;
        }

        case 118:
          i++;
          break;

        case 119: {
          const label = String(p[0]);
          const target = list.findIndex((c) => c.code === 118 && String(c.params[0]) === label);
          i = target >= 0 ? target + 1 : list.length;
          break;
        }

        case 121: {
          const [start, end, value] = p as number[];
          for (let id = start; id <= end; id++) this.state.setSwitch(id, value === 0);
          i++;
          break;
        }

        case 122: {
          const [start, end, op, operandType, a, b] = p as number[];
          let value = 0;
          if (operandType === 0) value = a;
          else if (operandType === 1) value = this.state.variable(a);
          else if (operandType === 2) value = a + Math.floor(Math.random() * (b - a + 1));
          for (let id = start; id <= end; id++) {
            const cur = this.state.variable(id);
            const next =
              op === 0 ? value : op === 1 ? cur + value : op === 2 ? cur - value : op === 3 ? cur * value : op === 4 ? Math.trunc(cur / value) : cur % value;
            this.state.setVariable(id, next);
          }
          i++;
          break;
        }

        case 123: {
          this.state.setSelfSwitch(eventId, String(p[0]), Number(p[1]) === 0);
          i++;
          break;
        }

        case 106:
          await this.host.wait(Number(p[0] ?? 1) * 50);
          i++;
          break;

        case 201: {
          if (Number(p[0]) === 0) await this.host.transfer(Number(p[1]), Number(p[2]), Number(p[3]), Number(p[4]));
          else
            await this.host.transfer(
              this.state.variable(Number(p[1])),
              this.state.variable(Number(p[2])),
              this.state.variable(Number(p[3])),
              0,
            );
          i++;
          break;
        }

        case 209: {
          const target = Number(p[0]);
          const commands = moveCommandsOf(p[1]);
          let k = i + 1;
          while (k < list.length && list[k].code === 509) {
            commands.push(...moveCommandsOf({ '@list': list[k].params }));
            k++;
          }
          if (target === -1) await this.runMoveRoute(commands);
          i = k;
          break;
        }

        case 205: {
          const target = Number(p[0]);
          if (target === -1) await this.runMoveRoute(moveCommandsOf(p[1]));
          i++;
          break;
        }

        case 241: {
          const file = p[0] as { '@name'?: string; '@volume'?: number; '@pitch'?: number };
          this.host.playBgm(String(file?.['@name'] ?? ''), Number(file?.['@volume'] ?? 100), Number(file?.['@pitch'] ?? 100));
          i++;
          break;
        }

        case 249:
        case 250: {
          const file = p[0] as { '@name'?: string; '@volume'?: number; '@pitch'?: number };
          this.host.playSe(String(file?.['@name'] ?? ''), Number(file?.['@volume'] ?? 100), Number(file?.['@pitch'] ?? 100));
          i++;
          break;
        }

        case 108:
        case 408:
        case 207:
        case 208:
        case 223:
        case 224:
        case 225:
        case 236:
        case 242:
        case 251:
          i++;
          break;

        case 355:
        case 655:
          this.host.unsupported(cmd.code, p);
          i++;
          break;

        default:
          this.host.unsupported(cmd.code, p);
          i++;
          break;
      }
    }
  }

  private evaluateCondition(cmd: EventCommand, eventId: number): boolean {
    const p = cmd.params as unknown[];
    switch (Number(p[0])) {
      case 0: {
        const on = this.state.switch(Number(p[1]));
        return on === (Number(p[2]) === 0);
      }
      case 1: {
        const v1 = this.state.variable(Number(p[1]));
        const v2 = Number(p[2]) === 0 ? Number(p[3]) : this.state.variable(Number(p[3]));
        switch (Number(p[4])) {
          case 0: return v1 === v2;
          case 1: return v1 >= v2;
          case 2: return v1 <= v2;
          case 3: return v1 > v2;
          case 4: return v1 < v2;
          case 5: return v1 !== v2;
          default: return false;
        }
      }
      case 2: {
        const channel = String(p[1]);
        const on = this.state.selfSwitch(eventId, channel);
        return on === (Number(p[2]) === 0);
      }
      default:
        return false;
    }
  }

  private async runMoveRoute(commands: MoveCommand[]): Promise<void> {
    for (const c of commands) {
      switch (c.code) {
        case 1: await this.host.movePlayer(2); break;
        case 2: await this.host.movePlayer(4); break;
        case 3: await this.host.movePlayer(6); break;
        case 4: await this.host.movePlayer(8); break;
        case 15: await this.host.wait(Number(c.params[0] ?? 1) * 50); break;
        default: break;
      }
    }
  }
}
