
// https://iro.js.org/
// npm install @jaames/iro --save

// Using ES6 module syntax
//import iro from '@jaames/iro';

// Using CommonJS modules
//const iro = require('@jaames/iro');


import ColorPickerContainer from "../tools/color-picker";

export interface IpaintTool {
    tool: string;
    size: number;
    color: string;
    used?: boolean;
}

export interface IPropsColorPickerContainer {
    onColorChange?: Function;
    onToolChange?: Function;
    paintTool?: IpaintTool;
    color?: string;
}

export interface IStateColorPickerContainer {
    color: string;
    width: string;
    height: string;
}

export interface IPaintingToolProps {
    type: string;
    color?: string;
    float?: string;
    onClick?: Function;
}

export interface IPaintingToolState {
    color: string;
}