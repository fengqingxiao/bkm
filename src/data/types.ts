export interface EventCommand {
  code: number;
  indent: number;
  params: unknown[];
}

export interface MoveCommand {
  code: number;
  params: unknown[];
}

export interface AudioRef {
  name: string;
  volume: number;
  pitch: number;
}

export interface EventPage {
  trigger: number;
  moveType: number;
  moveSpeed: number;
  moveFrequency: number;
  walkAnime: boolean;
  stepAnime: boolean;
  directionFix: boolean;
  through: boolean;
  alwaysOnTop: boolean;
  condition: {
    switch1Valid: boolean;
    switch1: number;
    switch2Valid: boolean;
    switch2: number;
    variableValid: boolean;
    variable: number;
    variableValue: number;
    selfSwitch: string;
  };
  graphic: {
    tileId: number;
    characterName: string;
    characterHue: number;
    direction: number;
    pattern: number;
    opacity: number;
  };
  moveRoute: MoveCommand[];
  list: EventCommand[];
}

export interface GameEvent {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: EventPage[];
}

export interface MapJson {
  id: number;
  width: number;
  height: number;
  tilesetId: number;
  displayName: string;
  bgm: AudioRef | null;
  data: string;
  events: GameEvent[];
}

export interface TilesetJson {
  id: number;
  name: string;
  image: string;
  autotiles: string[];
  passages: string;
  priorities: string;
  terrainTags: string;
}

export interface CommonEvent {
  id: number;
  name: string;
  trigger: number;
  switchId: number;
  list: EventCommand[];
}

export interface SystemJson {
  startMapId: number;
  startX: number;
  startY: number;
  playerGraphic: { characterName: string; hue: number } | null;
  switches: string[];
  variables: string[];
  party: string[];
  titleName: string;
  windowskin: string;
}

export interface MapInfo {
  name: string;
  order: number;
  parentId: number;
}
