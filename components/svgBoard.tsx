import * as React from 'react';
import Tile from './tileHexagon';
//import App from '../App';
import Entity from './entity';
//import * as tools from "../tools";

import Dndem from "../styles/board.module.css";

import {getSVGCoord} from "../tools/tools";

import {IPropsBoard, Iqrs, IStateBoard, IviewBox, Ixy} from "../interfaces/dndem";

//import {ThemeContext, PaintingContext} from '../contexts';
//import { paintBrush, paintBucket } from "../tools";

// React.Component subclass
class Board extends React.Component<IPropsBoard, IStateBoard> {
    constructor(props: IPropsBoard) {
        super(props);
        this._radius = props.mapData.radius;
        this._height = props.mapData.height;
        this._sizeTile = props.sizeTile;
        this._countHex = 0;

        // This function/method must be bound (using bind) to this (this Board).
        // If it is not bound, this will refer to the caller of the method, and not this Board.

        this.handleTileDown = this.handleTileDown.bind(this);
        this.handleTileEnter = this.handleTileEnter.bind(this);
        this.handleTileClick = this.handleTileClick.bind(this);

        this.handleEntityUp = this.handleEntityUp.bind(this);
        this.handleEntityDown = this.handleEntityDown.bind(this);
        this.handleEntityMove = this.handleEntityMove.bind(this);
        this.handleEntityLeave = this.handleEntityLeave.bind(this);
        this.handleEntityEnter = this.handleEntityEnter.bind(this);
        this.handleEntityClick = this.handleEntityClick.bind(this);

        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.colorMapCopy = this.colorMapCopy.bind(this);

        // this.resize = this.resize.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        console.log("Board Constructor");

        //let mapWidth: number = (props.mapData.radius + 8)*props.sizeTile;
        //let mapHeight: number = (props.mapData.radius + 8)*props.sizeTile;

        let mapWidth: number = (20 + 8)*props.sizeTile;
        let mapHeight: number = (20 + 8)*props.sizeTile;

        this.state = {
            // viewBox: {x: -300, y: -300, h: 600, w: 600}
            viewBox: {x: -mapWidth, y: -mapWidth, h: mapHeight*2, w: mapHeight*2}
        };
    }

    private svgRef = React.createRef<SVGSVGElement>();

    private _height: number;
    get height(): number {
        return this._height;
    }
    set height(value: number) {
        this._height = value;
    }

    private _radius: number;
    get radius(): number {
        return this._radius;
    }
    set radius(value: number) {
        this._radius = value;
    }

    private _sizeTile: number;
    get sizeTile(): number {
        return this._sizeTile;
    }
    set sizeTile(value: number) {
        this._sizeTile = value;
    }

    private _countHex: number;
    get countHex(): number {
        return this._countHex;
    }
    set countHex(value: number) {
        this._countHex = value;
    }

    public qrsToXy(qrs: Iqrs) {
        let xyCoord: Ixy = {x: 0, y: 0};
        xyCoord.x = qrs.q + this.props.mapData.radius - 1;
        xyCoord.y = qrs.r + this.props.mapData.radius - 1;

        return xyCoord;
    }

    static qrsToXy(qrs: Iqrs, radius: number) {
        let xyCoord: Ixy = {x: 0, y: 0};
        xyCoord.x = qrs.q + radius - 1;
        xyCoord.y = qrs.r + radius - 1;

        return xyCoord;
    }

    onKeyDown(e: React.KeyboardEvent<SVGElement>) {
        if (this.props.onMapKeyDown !== undefined) this.props.onMapKeyDown(e);
    }

    contains(qrs: Iqrs, array: string[][]=this.props.mapData.colorMap) {
        return Board.contains(qrs, array);
    }

    static contains(qrs: Iqrs, array: string[][]) {
        let radius = (array.length + 1)/2;
        if ((typeof qrs.s !== 'undefined') && (typeof qrs.s !== 'undefined'))
            return (qrs.q > -radius && qrs.q < radius &&
                qrs.r > -radius && qrs.r < radius &&
                qrs.s > -radius && qrs.s < radius);
        else return false
    }

    addSeveralTiles(qrsList: Iqrs[]) {
        let ReactElementList: React.ReactElement[] = [];

        for (let i = 0; i < qrsList.length; i++) {
            ReactElementList.push(this.addTile(qrsList[i]));
        }

        return ReactElementList;
    }

    addTile(qrs: Iqrs) {
        //var hex = new Hex(qrs.q, qrs.r, this._sizeTile);
        //this.svgGroup.appendChild(hex.svgElement);

        //var x = hex.q + this.size - 1;
        //var y = hex.r + this.size - 1;

        //this.array[x][y] = hex;
        //this.hexArray.push(hex);
        //this.HexCount++;

        let key: string = 'q' + qrs.q + 'r' + qrs.r + 's' + qrs.s;

        let xy: Ixy = this.qrsToXy(qrs);
        let color: string = this.props.mapData.colorMap[xy.x][xy.y];
        // console.log(xyCoord);
        //console.log(color);

        return <Tile key={key} coords={qrs} color={color}
                     handleOnClick={this.handleTileClick}
                     handleOnEnter={this.handleTileEnter}
                     handleOnDown={this.handleTileDown}/>;
    }

    renderTiles(radius: number) {
        let qrs: Iqrs = {q: 0, r: 0, s: 0};
        let qrsList: Iqrs[] = []; // [{q: 0, r: 0}, {q: 0, r: 1}, {q: 1, r: 0}, {q: 1, r: 1}];
        let ReactElementList: React.ReactElement[] = [];

        ReactElementList = ReactElementList.concat(this.addTile(qrs)); // Add the center Tile

        for (let i = 1; i < radius; i++) { // Loop through radius of map
            qrsList = Board.createRings(i);
            // console.log(qrsList);
            ReactElementList = ReactElementList.concat(this.addSeveralTiles(qrsList));
        }
        return ReactElementList;
    }

    static createRings(i: number, offset: Iqrs = {q: 0, r: 0, s: 0}) {
        let qrs: Iqrs = {q: 0, r: 0, s: 0};
        let qrsCenter: Iqrs = {q: -1, r: 1, s: 0};         // Start in the lower left corner
        let qrsVectors: Iqrs[] = Tile.neighbours(qrs); // Unit vectors for movement to the sides
        let qrsList: Iqrs[] = [];

        qrs.q = qrsCenter.q * i + offset.q;
        qrs.r = qrsCenter.r * i + offset.r;
        if ((typeof qrsCenter.s !== 'undefined') && (typeof offset.s !== 'undefined'))
            qrs.s = qrsCenter.s * i + offset.s;

        for (let j = 0; j < 6; j++) {       // Loop through number (6) of sides
            for (let k = 0; k < i; k++) {   // Loop through the length (radius) of sides
                let qrsTemp: Iqrs = qrsVectors[j];

                qrs.q = qrs.q + qrsTemp.q;
                qrs.r = qrs.r + qrsTemp.r;
                if ((typeof qrs.s !== 'undefined') && (typeof qrsTemp.s !== 'undefined'))
                    qrs.s = qrs.s + qrsTemp.s;

                qrsList.push({q: qrs.q, r: qrs.r, s: qrs.s});
            }
        }
        return qrsList;
    }

    // ########### TILE MOUSE INTERACT - BEGIN ###########

    handleTileDown(e: React.MouseEvent<SVGElement>, target: Tile) {
        if (this.props.onTileMouseDown !== undefined) this.props.onTileMouseDown(e, target);
    }

    handleTileEnter(e: React.MouseEvent<SVGElement>, target: Tile) {
        if (this.props.onTileMouseEnter !== undefined) this.props.onTileMouseEnter(e, target);
    }

    handleTileClick(e: React.MouseEvent<SVGElement>, target: Tile) {
        if (this.props.onTileMouseClick !== undefined) this.props.onTileMouseClick(e, target);
    }

    // ########### TILE MOUSE INTERACT - END ###########

    // ########### ENTITY MOUSE INTERACT - BEGIN ###########

    private moveEntity: boolean = false;
    private selectedEntity: Entity | undefined;

    handleEntityUp(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseUp !== undefined) this.props.onEntityMouseUp(e, target);
        else {
            this.moveEntity = false;
        }
    }

    handleEntityDown(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseDown !== undefined) this.props.onEntityMouseDown(e, target);
        else {
            this.moveEntity = true;
            this.selectedEntity = target;
        }
    }

    handleEntityMove(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseMove !== undefined) this.props.onEntityMouseMove(e, target);
        else {
            if (this.moveEntity && this.selectedEntity == target) {
                //console.log(getSVGCoord(e));
            }
        }
    }

    handleEntityLeave(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseLeave !== undefined) this.props.onEntityMouseLeave(e, target);
        else {
            //this.moveEntity = false;
            //this.selectedEntity = target;
        }
    }

    handleEntityEnter(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseEnter !== undefined) this.props.onEntityMouseEnter(e, target);
    }

    handleEntityClick(e: React.MouseEvent<SVGElement>, target: Entity) {
        if (this.props.onEntityMouseClick !== undefined) this.props.onEntityMouseClick(e, target);
    }

    // ########### ENTITY MOUSE INTERACT - END ###########

    colorMapCopy(size: number) {
        // Create 2D array and fill it with empty strings -> ''
        let colorMapCopy = [...Array(size)].map(e => Array(size).fill(''));

        for (let i: number = 0; i < this.props.mapData.colorMap.length; i++)
            for (let j: number = 0; j < this.props.mapData.colorMap[i].length; j++)
                colorMapCopy[i][j] = this.props.mapData.colorMap[i][j];

        return colorMapCopy;
    }

    // ########### SVG MOUSE INTERACT - BEGIN ###########

    handleMouseUp(e: React.MouseEvent<SVGElement>) {
        this.moveEntity = false;
    }

    handleMouseDown(e: React.MouseEvent<SVGElement>) {
        // console.log(e);
    }

    handleOnClick(e: React.MouseEvent<SVGElement>) {

        /*console.log(this);
        console.log(e.target);
        console.log(e.currentTarget);*/

        //this.color = 'rgb(255, 0, 0)';
    }

    handleMouseMove(e: React.MouseEvent<SVGElement>) {
        //console.log(getSVGCoord(e));
        if (this.moveEntity && this.selectedEntity !== undefined) {
            //console.log(getSVGCoord(e));

            let xy: Ixy = getSVGCoord(e);
            if (xy === null) return;

            let qrs: Iqrs = this.selectedEntity.xyToQrs(xy);
            let TargetQrs: Iqrs = this.selectedEntity.qrs;
            let DeltaQrs: Iqrs = {q: qrs.q - TargetQrs.q, r: qrs.r - TargetQrs.r};

            this.selectedEntity.move(DeltaQrs);
        }
    }

    handleWheel(e: React.WheelEvent<SVGElement>) {
        if (this.svgRef != null && this.svgRef.current != null) {
            let viewBoxZoom: IviewBox = this.state.viewBox;

            let mx: number = e.nativeEvent.offsetX; // mouse x
            let my: number = e.nativeEvent.offsetY;

            let sensitivityZoomWH: number = 0.1;
            let sensitivityZoomXY: number = 1.15;
            let dw: number = -viewBoxZoom.w*Math.sign(e.deltaY)*sensitivityZoomWH;
            let dh: number = -viewBoxZoom.h*Math.sign(e.deltaY)*sensitivityZoomWH;
            let dx: number = sensitivityZoomXY*dw*mx/this.svgRef.current.clientWidth;
            let dy: number = sensitivityZoomXY*dh*my/this.svgRef.current.clientHeight;

            viewBoxZoom = {x:viewBoxZoom.x+dx,y:viewBoxZoom.y+dy,w:viewBoxZoom.w-dw,h:viewBoxZoom.h-dh};
            this.setState({viewBox: viewBoxZoom});
        }
    }

    // ########### SVG MOUSE INTERACT - END ###########

    // https://stackoverflow.com/questions/63005791/props-dont-update-when-state-updates-in-react
    render() {

        let viewBox = this.state.viewBox.x + ' ' + this.state.viewBox.y + ' ' + this.state.viewBox.h + ' ' + this.state.viewBox.w

        console.log("RENDER BOARD")

        return (
            <svg xmlns="http://www.w3.org/2000/svg" version="1.1" id={Dndem.Map} strokeWidth="0.2" stroke="black"
                 ref={this.svgRef}
                 viewBox={viewBox}
                 tabIndex={-1}
                 onKeyDown={this.onKeyDown}

                 onMouseUp={this.handleMouseUp}
                 onMouseDown={this.handleMouseDown}
                 onMouseMove={this.handleMouseMove}
                 onClick={this.handleOnClick}
                 onWheel={this.handleWheel}>

                <g id="tileContainer">
                    {this.renderTiles(this.props.mapData.radius)}
                </g>
                <g id="entityContainer">
                    <Entity onMouseUp={this.handleEntityUp}
                            onMouseDown={this.handleEntityDown}
                            onMouseMove={this.handleEntityMove}
                            onMouseLeave={this.handleEntityLeave}
                            onMouseEnter={this.handleEntityEnter}
                            onMouseClick={this.handleEntityClick}

                    ></Entity>
                    <Entity onMouseUp={this.handleEntityUp}
                            onMouseDown={this.handleEntityDown}
                            onMouseMove={this.handleEntityMove}
                            onMouseLeave={this.handleEntityLeave}
                            onMouseEnter={this.handleEntityEnter}
                            onMouseClick={this.handleEntityClick}

                            qrs={{q: 1, r: 1, s: 0}}></Entity>
                </g>
                <g id="structureContainer"></g>
                <g id="structureGrabPointContainer"></g>
            </svg>
        );
    }
}

export default Board;