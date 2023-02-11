export interface Iqrs {
    q: number;
    r: number;
    s?: number;
}

export interface Ixy {
    x: number;
    y: number;
}

export interface Icoordinate {
    xy?: Ixy;
    qrs?: Iqrs;
}

export interface IGameSession {
    key: string;
    name: string;
    timeCreated: number[];
}

export interface IMapData {
    key: string;
    name: string;
    timeCreated: number[];
    mapData: string;
}

export interface IMap {
    key: string;
    name: string;
    height: number;
    radius: number;
    colorMap: Array<Array<string>>;
    loaded: boolean;
}

export interface IState {
    sizeTile: number;
    paintColor: string;
    signedIn: boolean;
    selectedSession: string | undefined;
    mapData: IMap;
}