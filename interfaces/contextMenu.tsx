import {Ixy} from "./dndem";

export interface IPropsContextMenu {
    coord: Ixy;
    buttons: string[];
    onButton?: Function[];
    onClick?: Function;
}

export interface IPropsContextItem {
    coord?: Ixy;
    label?: string;
    onButton?: Function;
}