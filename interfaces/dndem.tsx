import React from "react";
import TileHexagon from "../components/tileHexagon";

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

export interface Ihw {
    h: number;
    w: number;
}

export interface IGameSession {
    key: string;
    name: string;
    timeCreated: number[];
}

export interface IviewBox {
    x: number;
    y: number;
    h: number;
    w: number;
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
    context: boolean;
    contextCoord: Ixy;
    mapData: IMap;
}

export interface IPropsBoard {
    mapData: IMap;
    sizeTile: number;
    getMap?: Function;
    saveMap?: Function;

    onTileMouseDown?: Function;
    onTileMouseEnter?: Function;
    onTileMouseClick?: Function;

    onEntityMouseUp?: Function;
    onEntityMouseDown?: Function;
    onEntityMouseMove?: Function;
    onEntityMouseLeave?: Function;
    onEntityMouseEnter?: Function;
    onEntityMouseClick?: Function;

    onMapKeyDown?: Function;
}

export interface IStateBoard {
    viewBox: IviewBox;
}

export interface IPropsEntity {
    qrs?: Iqrs;
    xy?: Ixy;
    color?: string;
    stepSize?: number;
    size?: number | string;

    onMouseUp?: Function;
    onMouseDown?: Function;
    onMouseMove?: Function;
    onMouseLeave?: Function;
    onMouseEnter?: Function;
    onMouseClick?: Function;
}

export interface IStateEntity {
    color: string;
    qrs: Iqrs;
    xy: Ixy;
    size: number;
}

export interface IPropsTileHexagon {
    coords: Iqrs;
    color: string;
    handleOnClick: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
    handleOnEnter: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
    handleOnDown: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
}

export interface IStateTileHexagon {
    color: string;
}