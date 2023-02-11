import styles from "../styles/Home.module.css";
import boardstyles from "../styles/board.module.css";
import Board from "../components/svgBoard";
import React from "react";

import Dndem from "../styles/board.module.css";

interface Iqrs {
    q: number;
    r: number;
    s?: number;
}

interface Ixy {
    x: number;
    y: number;
}

interface Icoordinate {
    xy?: Ixy;
    qrs?: Iqrs;
}

interface IDataPackage {
    username?: string;
    msg?: string;
    xy?: Ixy;
    qrs?: Iqrs;
    color?: string;
}

interface IsqlNullString {
    String: string;
    Valid: boolean;
}

interface IUserInfo {
    displayName: string;
    username: string;
    firstName: IsqlNullString;
    MiddleName: IsqlNullString;
    LastName: IsqlNullString;
    Email: string;
    Mobile: IsqlNullString;
    CountryCode: IsqlNullString;
    Country: IsqlNullString;
    City: IsqlNullString;
    LastOnline: number[];
    Birthdate: number[];
    Gender: IsqlNullString;
    TimeCreated: number[];
}

interface IGameSession {
    key: string;
    name: string;
    timeCreated: number[];
}

/*interface IConnections {
    username: string;
    dataConnection: DataConnection;
    online: boolean;
}*/

interface IMapData {
    key: string;
    name: string;
    timeCreated: number[];
    mapData: string;
}

interface IMap {
    key: string;
    name: string;
    height: number;
    radius: number;
    colorMap: Array<Array<string>>;
    loaded: boolean;
}

interface IpaintTool {
    tool: string;
    size: number;
    color: string;
    used: boolean;
}

interface IState {
    sizeTile: number;
    paintColor: string;
    signedIn: boolean;
    selectedSession: string | undefined;
    mapData: IMap;
}

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

        /*this.onTileMouseClick = this.onTileMouseClick.bind(this);
        this.onTileMouseDown = this.onTileMouseDown.bind(this);
        this.onTileMouseEnter = this.onTileMouseEnter.bind(this);*/
        this.onMapKeyDown = this.onMapKeyDown.bind(this);

        /*this.onPaintToolColorChange = this.onPaintToolColorChange.bind(this);
        this.onPaintToolChange = this.onPaintToolChange.bind(this);*/

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
                height: 1,
                radius: 1,
                colorMap: [...Array(1)].map(e => Array(1).fill(this.defaultTileColor)),
                loaded: false
            }
        };

        //this.changeArraySize(10);
    }

    private defaultTileColor: string = "rgb(238, 232, 170)";

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

        let qrs: Iqrs = {q: 0, r: 0, s: 0};

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

        let mapCopy: IMap = this.colorMapCopy();
        mapCopy.colorMap = newArrayColor;
        mapCopy.height = new_height;
        mapCopy.radius = newRadius;

        this.setState((state) => ({
            mapData: mapCopy
        }));
    }

    colorMapCopy() {
        let mapDataCopy: IMap = {
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
        else if (e.key === 's' ) {
            console.log("save");

            //this.saveSessionMap();
        }
    }

    public render()
    {
        return (
            <div id={Dndem.boardContainer}>
                <Board mapData={this.state.mapData}
                       //saveMap={this.saveSessionMap}
                       //onTileMouseClick={this.onTileMouseClick}
                       //onTileMouseDown={this.onTileMouseDown}
                       //onTileMouseEnter={this.onTileMouseEnter}
                       onMapKeyDown={this.onMapKeyDown}
                       sizeTile={this.state.sizeTile}/>
            </div>
        );
    }
}