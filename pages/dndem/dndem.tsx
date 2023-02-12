import styles from "../styles/Home.module.css";
import boardstyles from "../styles/board.module.css";
import Board from "../../components/svgBoard";
import React from "react";

import {ThemeContext, themes, PaintingContext, painting} from '../../tools/contexts';

import ColorPickerContainer from '../../tools/color-picker';
import Dndem from "../../styles/board.module.css";

import * as IDndem from "../../interfaces/dndem";
import * as ITools from "../../interfaces/tools";

import TileHexagon from "../../components/tileHexagon";
import * as tools from "../../tools/tools";

import {IroColor} from "@irojs/iro-core";

export default class Dndmap extends React.Component<{}, IDndem.IState> {
    constructor(props: object) {
        super(props);

        /*this.signIn = this.signIn.bind(this);
        this.getUser = this.getUser.bind(this);

        this.sessionSelect = this.sessionSelect.bind(this);
        this.sessionCreate = this.sessionCreate.bind(this);

        this.getSessionMap = this.getSessionMap.bind(this);
        this.saveSessionMap = this.saveSessionMap.bind(this);

        this.getConnections = this.getConnections.bind(this);

        this.onDataReceive = this.onDataReceive.bind(this);*/

        this.onTileMouseClick = this.onTileMouseClick.bind(this);
        this.onTileMouseDown = this.onTileMouseDown.bind(this);
        this.onTileMouseEnter = this.onTileMouseEnter.bind(this);
        this.onMapKeyDown = this.onMapKeyDown.bind(this);

        this.onPaintToolColorChange = this.onPaintToolColorChange.bind(this);
        this.onPaintToolChange = this.onPaintToolChange.bind(this);

        this.changeArraySize = this.changeArraySize.bind(this);

        //let sessionRoom = window.location.pathname.replace(/[\W_]+/g, "");
        //console.log(sessionRoom);

        //this.getUser();

        this.state = {
            sizeTile: 8,
            paintColor: "rgb(238, 232, 170)",
            signedIn: false,
            selectedSession: undefined,
            mapData: {
                key: "",
                name: "",
                height: 9, // radius*2 -1
                radius: 5,
                colorMap: [...Array(9)].map(e => Array(9).fill(this.defaultTileColor)),
                loaded: false
            }
        };
    }

    // private userInfo: IUserInfo | undefined;
    // connections: IConnections[] = [];
    private defaultTileColor: string = "rgb(238, 232, 170)";

    /*signIn(uname: string, pwd: string) {
        signIn(uname, pwd).then(response => response.json()
        ).then((data: IUserInfo | undefined) => {
            this.userInfo = data;
            this.setState((state) => ({
                signedIn: true
            }));
        });
    }*/

    /*getUser() {
        getUserData().then(response => response.json()
        ).then((data: IUserInfo | undefined) => {
            this.userInfo = data;
            this.setState((state) => ({
                signedIn: true
            }));
        });
    }*/

    /*getConnections(connectionList: IConnections[]) {
        this.connections = connectionList;
    }*/

    /*sessionSelect(sessionKey: string) {
        getSession(sessionKey).then(response => response.json()
        ).then((data: IGameSession) => {
            //console.log(data.key);
            this.setState((state) => ({
                selectedSession: data.key
            }));
            this.getSessionMap(data.key);
        });
    }*/

    /*sessionCreate() {
        createSession().then(response => response.json()
        ).then((data: IGameSession) => {
            // console.log(data.key);
        });
    }*/

    /*getSessionMap(mapKey: string | undefined) {
        let key: string | undefined = mapKey ? mapKey :  this.state.selectedSession;
        if (key) {
            getMap(key).then(response => response.json()
            ).then((data: IMapData) => {
                console.log(data);

                if (data.key !== "") {
                    console.log(data.timeCreated);
                    let loadedColorMap: Array<Array<string>> = JSON.parse(data.mapData);
                    let loadedBoardHeight: number = loadedColorMap.length;
                    let loadedBoardRadius: number = (loadedBoardHeight + 1)/2;

                    let mapData: IMap = {
                        key: data.key,
                        name: data.name,
                        height: loadedBoardHeight,
                        radius: loadedBoardRadius,
                        colorMap: loadedColorMap,
                        loaded: true
                    };

                    this.setState((state) => ({
                        mapData: mapData
                    }));

                }
                else {
                    console.log("No map registered to this session");
                }
            });
        }
    }*/

    /*saveSessionMap() {
        if (this.state.selectedSession) {
            if (!this.state.mapData.loaded) {
                console.log("saveSessionMap - saveMap");
                saveMap(this.state.selectedSession, JSON.stringify(this.state.mapData.colorMap));
            }
            else if (this.state.mapData.loaded) {
                console.log("saveSessionMap - updateMap");
                updateMap(this.state.mapData.key, JSON.stringify(this.state.mapData.colorMap));
            }
        }
    }*/

    paintTool: ITools.IpaintTool = {   tool: 'none',
        used: false,
        size: 2,
        color: "rgb(238, 232, 170)"};

    onPaintToolColorChange(color: IroColor) {
        let colorString: string = color.rgbaString;
        let rgba: string[] = colorString.replace(/[^0-9\s]/g, '').split(' ');

        if (rgba[3] === '1')
            colorString = 'rgb(' + rgba[0] + ', ' + rgba[1] + ', ' + rgba[2] + ')';

        /*console.log(color.rgbaString);
        console.log(rgba);*/
        console.log(colorString);

        this.paintTool.color = colorString;
    }

    onPaintToolChange(tool: string) {
        console.log(tool);
        this.paintTool.tool = tool;
    }

    /*onDataReceive(data: IDataPackage[]) {
        let mapCopy: IMap = this.colorMapCopy();

        for (let i: number = 0; i < data.length; i++) {
            if (data[i].xy !== undefined && data[i].color !== undefined) {
                let xy: Ixy = (data[i].xy as Ixy);
                mapCopy.colorMap[xy.x][xy.y] = (data[i].color as string);
            }
            else if (data[i].qrs !== undefined && data[i].color !== undefined) {
                let qrs: Iqrs = (data[i].qrs as Iqrs);
                let xy: Ixy = Board.qrsToXy(qrs, this.state.mapData.radius);
                mapCopy.colorMap[xy.x][xy.y] = (data[i].color as string);
            }
        }

        this.setState((state) => ({
            mapData: mapCopy
        }));
    }*/

    /*transmitTileColors(coords: Icoordinate[], colors: string[]) {
        for (let i: number = 0; i < this.connections.length; i++) {
            let data: IDataPackage[] = [];

            for (let j: number = 0; j < coords.length; j++) {
                if (colors.length === 1) {
                    if ("xy" in coords[j]) data.push({xy: coords[j].xy, color: colors[0]});
                    if ("qrs" in coords[j]) data.push({qrs: coords[j].qrs, color: colors[0]});
                }
                else if (colors.length > 1) {
                    if ("xy" in coords[j]) data.push({xy: coords[j].xy, color: colors[j]});
                    if ("qrs" in coords[j]) data.push({qrs: coords[j].qrs, color: colors[j]});
                }
            }

            this.connections[i].dataConnection.send(data);
        }
    }*/

    paintToolPencil(coord: IDndem.Ixy | IDndem.Iqrs, color: string) {
        let mapCopy: IDndem.IMap = this.colorMapCopy();
        if ("x" in coord) mapCopy.colorMap[coord.x][coord.y] = color;
        //if ("q" in coord) mapCopy[coord.x][coord.y] = color;

        this.setState((state) => ({
            mapData: mapCopy
        }));
    }

    onTileMouseClick(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        console.log("onTileMouseClick");
        if (this.paintTool.tool !== 'none') {
            let coord: IDndem.Iqrs = target.qrs;
            let color: string = this.paintTool.color;
            let mapCopy: IDndem.IMap = this.colorMapCopy();
            let coordinateStack: IDndem.Icoordinate[] = [];

            if (this.paintTool.tool === 'bucket')
                coordinateStack = tools.paintBucket(mapCopy.colorMap, coord, color);
            if (this.paintTool.tool === 'tree')
                coordinateStack = tools.paintBrush(mapCopy.colorMap, coord, color, 2);

            //this.transmitTileColors(coordinateStack, [color]);
            this.setState((state) => ({
                mapData: mapCopy
            }));
        }
    }

    onTileMouseDown(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        console.log("onTileMouseDown");
        if (e.buttons & 1) this.paint(target);
    }

    onTileMouseEnter(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        console.log("onTileMouseEnter");
        /*if      (event.button == 0) mouseMainLeft = true;         // 001
        else if (event.button == 1) mouseMainMiddle = true;         // 010
        else if (event.button == 2) mouseMainRight = true;*/        // 100
        if (e.buttons & 1) this.paint(target);
    }

    paint(target: TileHexagon) {
        if (this.paintTool.tool === 'pencil') {
            let coord: IDndem.Ixy = this.qrsToXy(target.qrs);
            let color: string = this.paintTool.color;
            this.paintToolPencil(coord, color);
            //this.transmitTileColors([{xy: coord}], [color]);
        }
        else if (this.paintTool.tool === 'brush') {
            let coord: IDndem.Iqrs = target.qrs;
            let color: string = this.paintTool.color;
            let size: number = this.paintTool.size;
            let mapCopy: IDndem.IMap = this.colorMapCopy();
            let coordinateStack: IDndem.Icoordinate[] = tools.paintBrush(mapCopy.colorMap, coord, color, size);
            //this.transmitTileColors(coordinateStack, [color]);
            this.setState((state) => ({
                mapData: mapCopy
            }));
        }
        else if (this.paintTool.tool === 'eraser') {
            let coord: IDndem.Ixy = this.qrsToXy(target.qrs);
            let color: string = this.defaultTileColor;
            this.paintToolPencil(coord, color);
            //this.transmitTileColors([{xy: coord}], [color]);
        }
        else if (this.paintTool.tool === 'picker') {
            let coord: IDndem.Ixy = this.qrsToXy(target.qrs);
            let color: string = this.state.mapData.colorMap[coord.x][coord.y];
            this.paintTool.color = color;
            console.log(color);
        }
    }

    public qrsToXy(qrs: IDndem.Iqrs) {
        let xyCoord: IDndem.Ixy = {x: 0, y: 0};
        xyCoord.x = qrs.q + this.state.mapData.radius - 1;
        xyCoord.y = qrs.r + this.state.mapData.radius - 1;

        return xyCoord;
    }

    onMapKeyDown(e: React.KeyboardEvent<SVGElement>) {
        if (e.key === '+' || e.key === '-') {
            let newRadius: number = 0;
            let prevSize: number = this.state.mapData.radius;

            let delta: number = 1;

            if (e.key === '+') newRadius = prevSize + delta;
            else if (e.key === '-') newRadius = prevSize - delta;
            if (newRadius <= 0) return;

            this.changeArraySize(newRadius);
        }
        /*else if (e.key === 's' ) {
            console.log("save");

            this.saveSessionMap();
        }*/
    }

    changeArraySize(newRadius: number) {
        let diff: number = newRadius - this.state.mapData.radius;
        let new_height: number = newRadius*2 - 1;
        // let newArray = [...Array(new_height)].map(e => Array(new_height).fill(''));
        let newArrayColor = [...Array(new_height)].map(e => Array(new_height).fill(this.defaultTileColor));

        let newOffset: number = 0;
        let prevOffset: number = 0;
        let radius: number = 0;

        // Determine which part of the arrays that should be looped over
        // when copying values from old array to new array
        if (diff === 0) return;
        else if (diff > 0) {
            newOffset = diff;
            radius = this.state.mapData.radius;
        }
        else if (diff < 0) {
            prevOffset = diff;
            radius = newRadius;
        }

        let qrs: IDndem.Iqrs = {q: 0, r: 0, s: 0};

        // Copy values from the old array into the new array
        for (qrs.q = -radius + 1; qrs.q < radius; qrs.q++) {
            for (qrs.r = -radius + 1; qrs.r < radius; qrs.r++) {
                qrs.s = -qrs.q - qrs.r;
                let x = qrs.q + radius - 1;
                let y = qrs.r + radius - 1;

                // Check if a tile with the coordinate qrs exists inside this.colorMap
                //if (this.contains(qrs)) {
                newArrayColor[x + newOffset][y + newOffset] =
                    this.state.mapData.colorMap[x - prevOffset][y - prevOffset];
                //}
                //newArray[x + newOffset][y + newOffset] = this.array[x - prevOffset][y - prevOffset];
            }
        }

        let mapCopy: IDndem.IMap = this.colorMapCopy();
        mapCopy.colorMap = newArrayColor;
        mapCopy.height = new_height;
        mapCopy.radius = newRadius;

        this.setState((state) => ({
            mapData: mapCopy
        }));
    }

    colorMapCopy() {
        let mapDataCopy: IDndem.IMap = {
            key: this.state.mapData.key,
            name: this.state.mapData.name,
            height: this.state.mapData.height,
            radius: this.state.mapData.radius,
            colorMap: this.state.mapData.colorMap,
            loaded: this.state.mapData.loaded
        };

        // Create 2D array and fill it with empty strings -> ''
        let colorMapCopy = [...Array(this.state.mapData.height)].map(e => Array(this.state.mapData.height).fill(''));

        for (let i: number = 0; i < this.state.mapData.colorMap.length; i++)
            for (let j: number = 0; j < this.state.mapData.colorMap[i].length; j++)
                colorMapCopy[i][j] = this.state.mapData.colorMap[i][j];

        mapDataCopy.colorMap = colorMapCopy;

        return mapDataCopy;
    }

    public render() {
        console.log('RENDER APP');


        return (
            <>
                <div id="buttons">

                </div>
                <div id="fields">

                </div>
                <>
                    <div id={Dndem.boardContainer}
                        //tabIndex={0}
                        //onKeyDown={this.resize}
                    >
                        <Board mapData={this.state.mapData}
                            //saveMap={this.saveSessionMap}
                            onTileMouseClick={this.onTileMouseClick}
                            onTileMouseDown={this.onTileMouseDown}
                            onTileMouseEnter={this.onTileMouseEnter}
                            onMapKeyDown={this.onMapKeyDown}
                            sizeTile={this.state.sizeTile}/>
                    </div>
                </>
            </>
        );
    }
}