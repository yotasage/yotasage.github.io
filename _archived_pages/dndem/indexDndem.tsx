import Board from "../../components/svgBoard";
import React from "react";
import Head from "next/head";

import ColorPickerContainer from '../../tools/color-picker';
import Dndem from "../../styles/board.module.css";

import {
    Icoordinate,
    Iqrs,
    IState,
    Ixy,
    IMap,
    IEntity,
    IContextMenu,
    IEntities,
    IGameData
} from "../../interfaces/dndem";
import {IpaintTool} from "../../interfaces/tools";

import TileHexagon from "../../components/tileHexagon";
import {deepCopy, getSVGCoord, paintBrush, paintBucket, xyToQrs} from "../../tools/tools";

import {IroColor} from "@irojs/iro-core";
import {download, saveMap} from "../../tools/fileSaveLoad";
import ContextMenu from "../../components/contextMenu";
import Entity from "../../components/entity";
import PropertiesWindow from "../../components/propertiesWindow";

export default class Dndmap extends React.Component<{}, IState> {
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
        this.onTileMouseUp = this.onTileMouseUp.bind(this);
        this.onTileMouseEnter = this.onTileMouseEnter.bind(this);

        this.onMapKeyDown = this.onMapKeyDown.bind(this);

        this.onPaintToolColorChange = this.onPaintToolColorChange.bind(this);
        this.onPaintToolChange = this.onPaintToolChange.bind(this);

        this.setArraySize = this.setArraySize.bind(this);

        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleOnClick = this.handleOnClick.bind(this);
        this.handleOnContextMenuEntity = this.handleOnContextMenuEntity.bind(this);
        this.handleOnContextMenu = this.handleOnContextMenu.bind(this); // Right-click

        this.handleOnContextMenuClick = this.handleOnContextMenuClick.bind(this);
        this.contextMap = this.contextMap.bind(this);
        this.saveMapFile = this.saveMapFile.bind(this);
        this.loadMapFile = this.loadMapFile.bind(this);
        this.loadMap = this.loadMap.bind(this);

        this.contextSelectEntitySize = this.contextSelectEntitySize.bind(this);
        this.contextSelectEntityType = this.contextSelectEntityType.bind(this);
        this.contextCreateEntity = this.contextCreateEntity.bind(this);
        this.contextRemoveEntity = this.contextRemoveEntity.bind(this);


        this.handleEntityUp = this.handleEntityUp.bind(this);
        this.handleEntityDown = this.handleEntityDown.bind(this);
        this.handleEntityMove = this.handleEntityMove.bind(this);
        this.handleEntityLeave = this.handleEntityLeave.bind(this);
        this.handleEntityEnter = this.handleEntityEnter.bind(this);
        this.handleEntityClick = this.handleEntityClick.bind(this);
        this.handleOnEntityMove = this.handleOnEntityMove.bind(this);
        this.handleOnEntityChange = this.handleOnEntityChange.bind(this);

        this.entityConstructed = this.entityConstructed.bind(this);

        //let sessionRoom = window.location.pathname.replace(/[\W_]+/g, "");
        //console.log(sessionRoom);

        //this.getUser();

        let initRadius: number = 5;
        let initHeight: number = initRadius*2 - 1;

        this.state = {
            sizeTile: 8,
            paintColor: "rgb(238, 232, 170)",
            signedIn: false,
            selectedSession: undefined,
            mapData: {
                key: "",
                name: "",
                height: initHeight,
                radius: initRadius,
                colorMap: [...Array(initHeight)].map(() => Array(initHeight).fill(this.defaultTileColor)),
                loaded: false
            },
            contextMenu: {
                render: false,
                coord: {x: 0, y: 0},
                SVGCoord: {x: 0, y: 0}
            },
            entities: {
                entityList: [],
                reactEntityList: []
            }
        };
    }

    // private userInfo: IUserInfo | undefined;
    // connections: IConnections[] = [];
    private defaultTileColor: string = "rgb(238, 232, 170)";

    private mapDataHistory: IMap[] = [];
    private mapDataHistoryUndone: IMap[] = [];
    private editingMap: boolean = false;

    /*signIn(uname: string, pwd: string) {
        signIn(uname, pwd).then(response => response.json()
        ).then((data: IUserInfo | undefined) => {
            this.userInfo = data;
            this.setState(() => ({
                signedIn: true
            }));
        });
    }*/

    /*getUser() {
        getUserData().then(response => response.json()
        ).then((data: IUserInfo | undefined) => {
            this.userInfo = data;
            this.setState(() => ({
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
            this.setState(() => ({
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

                    this.setState(() => ({
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

    paintTool: IpaintTool = {   tool: 'none',
        used: false,
        size: 2,
        color: "rgb(238, 232, 170)"};

    onPaintToolColorChange(color: IroColor) {
        let colorString: string = color.rgbaString;
        let rgba: string[] = colorString.replace(/[^\d\s]/g, '').split(' ');

        if (rgba[3] === '1')
            colorString = 'rgb(' + rgba[0] + ', ' + rgba[1] + ', ' + rgba[2] + ')';

        /*console.log(color.rgbaString);
        console.log(rgba);*/
        //console.log(colorString);

        this.paintTool.color = colorString;
    }

    onPaintToolChange(tool: string) {
        //console.log(tool);
        this.paintTool.tool = tool;
    }

    /*onDataReceive(data: IDataPackage[]) {
        let mapCopy: IMap = deepCopy(this.state.mapData);

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

        this.setState(() => ({
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

    paintToolPencil(coord: Ixy | Iqrs, color: string) {
        let mapCopy: IMap = deepCopy(this.state.mapData);
        if ("x" in coord) mapCopy.colorMap[coord.x][coord.y] = color;
        //if ("q" in coord) mapCopy[coord.x][coord.y] = color;

        //console.log("big wow", color);

        //console.log(mapCopy);

        this.setState(() => ({
            mapData: mapCopy
        }));
    }

    onTileMouseClick(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        if (this.editingMap) {
            this.editingMap = false;
        }

        if (this.paintTool.tool === 'bucket' || this.paintTool.tool === 'tree') {
            let coord: Iqrs = target.qrs;
            let color: string = this.paintTool.color;
            let mapCopy: IMap = deepCopy(this.state.mapData);
            let coordinateStack: Icoordinate[] = [];

            if (this.paintTool.tool === 'bucket')
                coordinateStack = paintBucket(mapCopy.colorMap, coord, color);
            if (this.paintTool.tool === 'tree')
                coordinateStack = paintBrush(mapCopy.colorMap, coord, color, 2);

            //this.transmitTileColors(coordinateStack, [color]);
            this.setState(() => ({
                mapData: mapCopy
            }));
        }
    }

    onTileMouseDown(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        console.log("onTileMouseDown");
        if (e.buttons & 1) {
            if (this.paintTool.tool != 'none' && !this.editingMap) {
                this.mapDataHistory.push(deepCopy(this.state.mapData));
                this.mapDataHistoryUndone = [];
                this.editingMap = true;
            }
            this.paint(target);
        }
    }

    onTileMouseUp(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        console.log("onTileMouseUp");

        if (this.editingMap) {
            this.editingMap = false;
        }

    }

    onTileMouseEnter(e: React.MouseEvent<SVGElement>, target: TileHexagon) {
        //console.log("onTileMouseEnter");
        /*if      (event.button == 0) mouseMainLeft = true;         // 001
        else if (event.button == 1) mouseMainMiddle = true;         // 010
        else if (event.button == 2) mouseMainRight = true;*/        // 100
        if (e.buttons & 1) this.paint(target);
    }

    paint(target: TileHexagon) {
        if (this.paintTool.tool === 'pencil') {
            let coord: Ixy = this.qrsToXy(target.qrs);
            let color: string = this.paintTool.color;
            this.paintToolPencil(coord, color);
            //this.transmitTileColors([{xy: coord}], [color]);
        }
        else if (this.paintTool.tool === 'brush') {
            let coord: Iqrs = target.qrs;
            let color: string = this.paintTool.color;
            let size: number = this.paintTool.size;
            let mapCopy: IMap = deepCopy(this.state.mapData);
            let coordinateStack: Icoordinate[] = paintBrush(mapCopy.colorMap, coord, color, size);
            //this.transmitTileColors(coordinateStack, [color]);
            this.setState(() => ({
                mapData: mapCopy
            }));
        }
        else if (this.paintTool.tool === 'eraser') {
            let coord: Ixy = this.qrsToXy(target.qrs);
            let color: string = this.defaultTileColor;
            this.paintToolPencil(coord, color);
            //this.transmitTileColors([{xy: coord}], [color]);
        }
        else if (this.paintTool.tool === 'picker') {
            let coord: Ixy = this.qrsToXy(target.qrs);
            let color: string = this.state.mapData.colorMap[coord.x][coord.y];
            this.paintTool.color = color;

            this.setState(() => ({
                paintColor: color
            }));

            //console.log("picker", color);
        }
    }

    // TODO: Modify function name. This is not true xy-coordinates. This is array coordinates.
    //  At the same time, create a function which truly returns xy-coordinates.
    public qrsToXy(qrs: Iqrs) {
        let xyCoord: Ixy = {x: 0, y: 0};
        xyCoord.x = qrs.q + this.state.mapData.radius - 1;
        xyCoord.y = qrs.r + this.state.mapData.radius - 1;

        return xyCoord;
    }

    onMapKeyDown(e: React.KeyboardEvent<SVGElement>) {
        console.log("Key: %s | CTRL: %s | SHIFT: %s", e.key, e.ctrlKey, e.shiftKey);

        let key: string = e.key.toLowerCase();

        // TODO? Make a bar/menu pop up with options when holding control.
        //  Something similar to the context menu can pop up maybe?
        //  Showing all the options that either can be clicked or used by pressing specified keys.
        if (key === '+') {
            console.log('resize map - increase');
            this.changeArraySize(1);
        }
        else if (key === '-') {
            console.log('resize map - decrease');
            this.changeArraySize(-1);
        }
        else if (e.ctrlKey && key === 's' ) {
            console.log("save");
            e.preventDefault();

            this.saveMapFile(null);

            //this.saveSessionMap();
        }
        else if ((!e.shiftKey && key === 'u') || (e.ctrlKey && key === 'z')) {
            this.mapUndo();
        }
        else if ((e.shiftKey && key === 'u') || (e.ctrlKey && key === 'y')) {
            this.mapRedo();
        }

    }

    mapUndo() {
        if (this.mapDataHistory.length > 0) {
            let data: IMap = this.mapDataHistory.pop();
            this.mapDataHistoryUndone.push(deepCopy(this.state.mapData));

            this.setState(() => ({
                mapData: deepCopy(data)
            }));
        }
    }

    mapRedo() {
        if (this.mapDataHistoryUndone.length > 0) {
            let data: IMap = this.mapDataHistoryUndone.pop();
            this.mapDataHistory.push(deepCopy(this.state.mapData));

            this.setState(() => ({
                mapData: deepCopy(data)
            }));
        }
    }

    changeArraySize(delta: number) {
        this.mapDataHistory.push(deepCopy(this.state.mapData));
        this.mapDataHistoryUndone = [];
        let prevSize: number = this.state.mapData.radius;

        let newRadius: number = prevSize + delta;
        if (newRadius <= 0) return;
        this.setArraySize(newRadius);
    }

    setArraySize(newRadius: number) {
        let diff: number = newRadius - this.state.mapData.radius;
        let new_height: number = newRadius*2 - 1;
        let newArrayColor = [...Array(new_height)].map(() => Array(new_height).fill(this.defaultTileColor));

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

        let qrs: Iqrs = {q: 0, r: 0, s: 0};

        // Copy values from the old array into the new array
        for (qrs.q = -radius + 1; qrs.q < radius; qrs.q++) {
            for (qrs.r = -radius + 1; qrs.r < radius; qrs.r++) {
                qrs.s = -qrs.q - qrs.r;
                let x = qrs.q + radius - 1;
                let y = qrs.r + radius - 1;

                newArrayColor[x + newOffset][y + newOffset] =
                    this.state.mapData.colorMap[x - prevOffset][y - prevOffset];
            }
        }

        let mapCopy: IMap = deepCopy(this.state.mapData);
        mapCopy.colorMap = newArrayColor;
        mapCopy.height = new_height;
        mapCopy.radius = newRadius;

        this.setState(() => ({
            mapData: mapCopy
        }));
    }

    // ########### MAP CONTAINER MOUSE INTERACT - BEGIN ###########

    handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        //console.log(getSVGCoord(e));
        //console.log(e);

        /*if      (event.button == 0) mouseMainLeft = true;         // 001
        else if (event.button == 1) mouseMainMiddle = true;         // 010
        else if (event.button == 2) mouseMainRight = true;*/        // 100
        if (this.moveEntity && this.state.selectedEntity !== undefined && this.paintTool.tool == 'none') {

            // If the mouse is not held down. Stop move. This is a backup solution as it is
            // not always properly detected that the mouse is no longer pressed.
            if (!(e.buttons & 1)) {
                this.moveEntity = false;
                return;
            }

            let xy: Ixy = getSVGCoord(e);
            if (xy === null) return;

            let qrs: Iqrs = this.state.selectedEntity.xyToQrs(xy);
            let TargetQrs: Iqrs = this.state.selectedEntity.qrs;
            let DeltaQrs: Iqrs = {q: qrs.q - TargetQrs.q, r: qrs.r - TargetQrs.r};

            // Move the entity;
            this.state.selectedEntity.move(DeltaQrs);
        }
    }

    handleOnClick(e: React.MouseEvent<HTMLDivElement>) {
        console.log("handleOnClick");
        if (this.state.contextMenu.render) {
            let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
            contextMenu.render = false;

            this.setState(() => ({
                contextMenu: contextMenu
            }));
        }
    }

    private showProperties: boolean = false;

    handleOnContextMenuEntity(e: React.MouseEvent<SVGElement>, target: Entity) {
        console.log("entity has been right clicked", target.id);
        e.preventDefault();

        // stopPropagation prevents the event from propagating further, meaning that it will not trigger
        // any other functions like handleOnContextMenu.
        e.stopPropagation();

        if (this.paintTool.tool != "none") return;

        let coord: Ixy = {x: e.clientX - 200, y: e.clientY - 200};
        let SVGCoord: Ixy = getSVGCoord(e);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = true;
        contextMenu.coord = coord;
        contextMenu.SVGCoord = SVGCoord;
        contextMenu.menuButtons = ['DELETE', 'PROPERTIES'];
        contextMenu.menuButtonCallback = [  (() => {this.contextRemoveEntity(target);}),
                                            (() => {this.test();})];

        this.setState(() => ({
            contextMenu: contextMenu,
            selectedEntity: target
        }));

    }

    test() {
        this.showProperties = true;

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = false;

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    handleOnContextMenu(e: React.MouseEvent<HTMLDivElement>) {
        e.preventDefault();
        console.log("CONTEXT", e);

        if (this.paintTool.tool != "none") return;

        let coord: Ixy = {x: e.clientX - 200, y: e.clientY - 200};
        let SVGCoord: Ixy = getSVGCoord(e);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = true;
        contextMenu.coord = coord;
        contextMenu.SVGCoord = SVGCoord;
        contextMenu.menuButtons = ['MAP', 'CREATE ENTITY'];
        contextMenu.menuButtonCallback = [this.contextMap, this.contextSelectEntitySize];

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    contextMap() {
        //let self = this;

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.menuButtons = ['SAVE MAP', 'LOAD MAP', 'DECREASE BY 1', 'INCREASE BY 1'];
        contextMenu.menuButtonCallback = [this.saveMapFile, this.loadMapFile,
            (() => {this.changeArraySize(-1);}),
            (() => {this.changeArraySize(1);})];

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    // ########### MAP CONTAINER MOUSE INTERACT - END ###########

    // ########### CONTEXT MENU MOUSE INTERACT - BEGIN ###########

    handleOnContextMenuClick(e: React.MouseEvent<HTMLDivElement>) {
        console.log("handleOnContextMenuClick");

        for (let i: number = 0; i < e.target["classList"].length; i++) {
            if (e.target["classList"][i].includes("contextMenuItem")) {
                return;
            }
        }

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = false;

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    saveMapFile(e: React.MouseEvent<HTMLDivElement>) {
        console.log("saveMapFile");

        console.log(this.state.entities.entityList);

        let gameData: IGameData = { entityList: this.state.entities.entityList,
                                    mapData: this.state.mapData};

        let gameDataJSON = JSON.stringify(gameData);

        console.log(gameDataJSON);

        download("gamedata.dem", gameDataJSON);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = false;

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    // https://web.dev/read-files/
    loadMapFile(e: React.MouseEvent<HTMLDivElement>) {
        console.log("loadMapFile");

        let element: HTMLInputElement = document.createElement('input');
        element.setAttribute('type', 'file');
        element.setAttribute('file-selector', 'single');
        element.setAttribute('accept', '.dem');
        element.addEventListener('change', this.loadMap, false);

        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = false;

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    loadMap(e) {
        let fileList: FileList = e.target.files;
        let f: File = fileList[0];
        let reader: FileReader = new FileReader();

        // Function to perform when reading of file is complete
        // TODO: I do not know if I need or should do this, but I would like to put the function
        //  below into "its own function" instead of having it inside this.loadMap.
        reader.onloadend = () => {
            let loadedGameData: IGameData = JSON.parse(reader.result as string);
            let loadedMapData: IMap = loadedGameData.mapData;
            let loadedEntityData: IEntity[] = loadedGameData.entityList;

            let newEntityCount: number = loadedEntityData.length;

            let newReactEntity: React.ReactElement;
            let newReactEntityList: React.ReactElement[] = [];

            for (let i: number = 0; i < newEntityCount; i++) {
                // Generate unique key / sid (session id)
                // Session id (sid) must be updated for the current entities to be replaced with new ones.
                const array = new Uint32Array(10);
                crypto.getRandomValues(array);
                loadedEntityData[i].sid = array.toString();

                newReactEntity = this.createEntity(loadedEntityData[i]);
                newReactEntityList.push(newReactEntity);
            }

            let loadedEntities: IEntities = {
                entityList: loadedEntityData,
                reactEntityList: newReactEntityList
            };

            this.setState(() => ({
                mapData: loadedMapData,
                entities: loadedEntities
            }));
        }
        reader.readAsText(f);           // Start reading the file
    }

    entityConstructed(target: Entity) {
        console.log("Entity constructed");

        // Set ID of entity in mapData and the entities list in this.state
        let entityList: React.ReactElement[] = this.state.entities.reactEntityList;
        let entityCount: number = entityList.length;

        for (let i: number = 0; i < entityCount; i++) {
            if (entityList[i].props.sid == target.props.sid) {
                this.state.entities.entityList[i].id = target.id;
            }
        }

    }

    createEntity(props: IEntity) {
        let newEntity: React.ReactElement = <Entity key={props.sid} {...props}
                                                    onMouseUp={this.handleEntityUp}
                                                    onMouseDown={this.handleEntityDown}
                                                    onMouseMove={this.handleEntityMove}
                                                    onMouseLeave={this.handleEntityLeave}
                                                    onMouseEnter={this.handleEntityEnter}
                                                    onMouseClick={this.handleEntityClick}
                                                    onMove={this.handleOnEntityMove}
                                                    onChange={this.handleOnEntityChange}
                                                    onContext={this.handleOnContextMenuEntity}
                                                    onEntityConstructed={this.entityConstructed}></Entity>;
        return newEntity;
    }

    handleOnEntityChange(target: Entity) {
    console.log('entity change');

        for (let i: number = 0; i < this.state.entities.entityList.length; i++) {
            if (this.state.entities.entityList[i].sid == target.props.sid) {
                this.state.entities.entityList[i].qrs = target.qrs;
                this.state.entities.entityList[i].xy = target.xy;
                this.state.entities.entityList[i].color = target.color;
                this.state.entities.entityList[i].token = target.token;

                this.state.entities.entityList[i].name = target.name;

                break;
            }
        }
    }

    contextRemoveEntity(target: Entity) {
        console.log(target.id, target.color);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.render = false;

        let entityList: React.ReactElement[] = this.state.entities.reactEntityList;
        let entityCount: number = entityList.length;

        let newEntityList: IEntity[] = [];
        let newReactEntityList: React.ReactElement[] = [];

        for (let i: number = 0; i < entityCount; i++) {
            if (entityList[i].props.sid == target.props.sid) {
                console.log(true);
                this.state.entities.entityList.splice(i, 1);
                this.state.entities.reactEntityList.splice(i, 1);
                break;
            }
        }

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    contextCreateEntity(e: React.MouseEvent<HTMLDivElement>) {
        console.log("contextCreateEntity");
        let entitySpecs: string[] = (e.target as HTMLDivElement).textContent.split(/\s+/);

        // TODO: Consider how to handle this. The way it is done now, it is possible to quickly
        //  create new entities.
        //let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        //contextMenu.render = true;

        let newEntityData: IEntity = {};

        // Generate unique key / sid (session id)
        const array = new Uint32Array(10);
        crypto.getRandomValues(array);

        newEntityData.sid = array.toString();
        newEntityData.type = entitySpecs[1].toLowerCase();

        if (newEntityData.type == "player") newEntityData.color = 'Aquamarine';
        else if (newEntityData.type == "enemy") newEntityData.color = 'DarkRed';
        else if (newEntityData.type == "npc") newEntityData.color = 'LightSteelBlue';

        newEntityData.stepSize = this.state.sizeTile;
        newEntityData.size = entitySpecs[0].toLowerCase();

        newEntityData.xy = this.state.contextMenu.SVGCoord;
        newEntityData.qrs = xyToQrs(newEntityData.xy, this.state.sizeTile);

        let newEntity: React.ReactElement = this.createEntity(newEntityData);

        // TODO: Figure out how to add ID to newEntityData

        // Add the new entity to map data (which will be saved to file and/or DB)
        let entitiesCopy: IEntities = deepCopy(this.state.entities);

        entitiesCopy.entityList.push(newEntityData);

        // Update list of react Entities
        // (the react list from this.state must be used as the deepCopy function breaks the
        // react objects somehow)
        entitiesCopy.reactEntityList = this.state.entities.reactEntityList.concat([newEntity]);

        // Close the context menu. Update the mapData with the new mapData.
        this.setState(() => ({
            entities: entitiesCopy
        }));
    }

    contextSelectEntityType(e: React.MouseEvent<HTMLDivElement>) {
        console.log("contextSelectEntityType");
        let size: string = (e.target as HTMLDivElement).textContent;

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.menuButtons = [size + ' NPC', size + ' PLAYER', size + ' ENEMY'];
        contextMenu.menuButtonCallback =
            [this.contextCreateEntity,
                this.contextCreateEntity,
                this.contextCreateEntity]

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }

    contextSelectEntitySize(e: React.MouseEvent<HTMLDivElement>) {
        console.log("contextCreateEnemy", e);

        let contextMenu: IContextMenu = deepCopy(this.state.contextMenu);
        contextMenu.menuButtons = [ 'SMALL', 'MEDIUM', 'LARGE', 'HUGE',
                                    'GARGANTUAN', 'COLOSSAL'];
        contextMenu.menuButtonCallback =
            [   this.contextSelectEntityType,
                this.contextSelectEntityType,
                this.contextSelectEntityType,
                this.contextSelectEntityType,
                this.contextSelectEntityType,
                this.contextSelectEntityType]

        this.setState(() => ({
            contextMenu: contextMenu
        }));
    }



    // ########### CONTEXT MENU MOUSE INTERACT - END ###########

    // ########### ENTITY - BEGIN ###########

    private moveEntity: boolean = false;

    handleEntityUp(e: React.MouseEvent<SVGElement>, target: Entity) {
        this.moveEntity = false;
    }

    handleEntityDown(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.paintTool.tool == 'none') {
            this.moveEntity = true;

            this.setState(() => ({
                selectedEntity: target
            }));
        }

    }

    handleEntityMove(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.moveEntity && this.state.selectedEntity == target) {
            //console.log(getSVGCoord(e));
        }
    }

    handleEntityLeave(e: React.MouseEvent<SVGElement>, target: Entity) {

    }

    handleEntityEnter(e: React.MouseEvent<SVGElement>, target: Entity) {

    }

    handleEntityClick(e: React.MouseEvent<SVGElement>, target: Entity) {

    }

    handleOnEntityMove(e: React.MouseEvent<SVGElement>, target: Entity) {
        // Update entity data in mapdata
        //let entitiesCopy: IEntities = deepCopy(this.state.entities);



        for (let i: number = 0; i < this.state.entities.entityList.length; i++) {
            if (this.state.entities.entityList[i].sid == target.props.sid) {
                this.state.entities.entityList[i].qrs = target.qrs;
                this.state.entities.entityList[i].xy = target.xy;

                break;
            }
        }
    }

    // ########### ENTITY - END ###########

    handleOnWheel(e) {
        //console.log(e, e.ctrlKey);
        // Prevents pinch zoom on laptop trackpad
        if (e.ctrlKey) { // When ctrl key is true, it usually means that the trackpad is used to zoom
            e.preventDefault();
            //e.stopPropagation();
            //return false;
        }
    }

    componentDidMount() {
        this.gameContainer.addEventListener('wheel', this.handleOnWheel, { passive: false });
    }

    componentWillUnmount() {
        this.gameContainer.removeEventListener('wheel', this.handleOnWheel);
    }

    private gameContainer;

    public render() {
        console.log('RENDER APP');
        //console.log("render", this.state.mapData);

        return (
            <>
                <Head>
                    <title>DnDem</title>
                    <meta content={"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"}/>

                </Head>
                <div id={Dndem.gameContainer}
                     onTouchStart={this.handleOnWheel}
                     ref={ref => this.gameContainer = ref}>

                    <ColorPickerContainer onColorChange={this.onPaintToolColorChange}
                                          onToolChange={this.onPaintToolChange}
                                          color={ this.paintTool.color}/>

                    {this.showProperties && <PropertiesWindow entity={this.state.selectedEntity}></PropertiesWindow>}

                    {this.state.contextMenu.render && <ContextMenu coord={this.state.contextMenu.coord}
                            onClick={this.handleOnContextMenuClick}
                            buttons={this.state.contextMenu.menuButtons}
                            onButton={this.state.contextMenu.menuButtonCallback}/>}

                    <div id={Dndem.boardContainer}
                         onMouseMove={this.handleMouseMove}
                         onClick={this.handleOnClick}
                         onContextMenu={this.handleOnContextMenu}

                        //tabIndex={0}
                        //onKeyDown={this.resize}
                    >
                        <Board mapData={this.state.mapData}
                            //saveMap={this.saveSessionMap}
                            entities={this.state.entities.reactEntityList}
                            onTileMouseClick={this.onTileMouseClick}
                            onTileMouseDown={this.onTileMouseDown}
                            onTileMouseUp={this.onTileMouseUp}
                            onTileMouseEnter={this.onTileMouseEnter}
                            onMapKeyDown={this.onMapKeyDown}
                            sizeTile={this.state.sizeTile}/>
                    </div>
                </div>
            </>
        );
    }
}