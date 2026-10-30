export class GameState {
  switches = new Map<number, boolean>();
  variables = new Map<number, number>();
  selfSwitches = new Map<string, boolean>();
  mapId = 0;

  switch(id: number): boolean {
    return this.switches.get(id) ?? false;
  }

  setSwitch(id: number, value: boolean): void {
    this.switches.set(id, value);
  }

  variable(id: number): number {
    return this.variables.get(id) ?? 0;
  }

  setVariable(id: number, value: number): void {
    this.variables.set(id, value);
  }

  selfSwitch(eventId: number, channel: string): boolean {
    return this.selfSwitches.get(`${this.mapId}:${eventId}:${channel}`) ?? false;
  }

  setSelfSwitch(eventId: number, channel: string, value: boolean): void {
    this.selfSwitches.set(`${this.mapId}:${eventId}:${channel}`, value);
  }
}
