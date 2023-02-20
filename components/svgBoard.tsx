import * as React from 'react';
import Tile from './tileHexagon';

import Dndem from "../styles/board.module.css";

import {IPropsBoard, Iqrs, IStateBoard, IviewBox, Ixy} from "../interfaces/dndem";
import ContextMenuItem from "./contextMenuItem";
import {deepCopy, getSVGCoord} from "../tools/tools";

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
        this.handleTileUp = this.handleTileUp.bind(this);
        this.handleTileEnter = this.handleTileEnter.bind(this);
        this.handleTileClick = this.handleTileClick.bind(this);

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

        let key: string = e.key.toLowerCase();

        if (key === 'f') {
            let xyEdge: number = this.height*this.sizeTile;
            let whLength: number = xyEdge*2;

            let viewBox: IviewBox =  {  x: -xyEdge,
                                        y: -xyEdge,
                                        w: whLength,
                                        h: whLength};
            this.setState({viewBox: viewBox});
        }
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
                     handleOnDown={this.handleTileDown}
                     handleOnUp={this.handleTileUp}/>;
    }

    renderTiles(radius: number = this.props.mapData.radius) {
        let qrs: Iqrs = {q: 0, r: 0, s: 0};
        let qrsList: Iqrs[] = [];
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

    handleTileUp(e: React.MouseEvent<SVGElement>, target: Tile) {
        if (this.props.onTileMouseUp !== undefined) this.props.onTileMouseUp(e, target);
    }

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

    colorMapCopy(size: number) {
        // Create 2D array and fill it with empty strings -> ''
        let colorMapCopy = [...Array(size)].map(e => Array(size).fill(''));

        for (let i: number = 0; i < this.props.mapData.colorMap.length; i++)
            for (let j: number = 0; j < this.props.mapData.colorMap[i].length; j++)
                colorMapCopy[i][j] = this.props.mapData.colorMap[i][j];

        return colorMapCopy;
    }

    // ########### SVG MOUSE INTERACT - BEGIN ###########

    /*if      (event.button == 0) mouseMainLeft = true;         // 001
    else if (event.button == 1) mouseMainMiddle = true;         // 010
    else if (event.button == 2) mouseMainRight = true;*/        // 100

    private isPaning: boolean = false;
    private InitialPanViewBox?: IviewBox;
    private panStartCoord: Ixy = {x: 0, y: 0};
    private panEndCoord: Ixy = {x: 0, y: 0};

    handleMouseUp(e: React.MouseEvent<SVGElement>) {
        console.log("handleMouseUp")
        this.isPaning = false;
    }

    handleMouseDown(e: React.MouseEvent<SVGElement>) {
        console.log("handleMouseDown", e.button)



        if (e.button == 1) {
            this.isPaning = true;
            this.panStartCoord = getSVGCoord(e, false);
            this.InitialPanViewBox = deepCopy(this.state.viewBox);
        }
    }

    handleOnClick(e: React.MouseEvent<SVGElement>) {
        console.log("handleOnClick")
    }

    handleMouseMove(e: React.MouseEvent<SVGElement>) {
        console.log("handleMouseMove");
        /*
        https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
        0: No button or un-initialized
        1: Primary button (usually the left button)
        2: Secondary button (usually the right button)
        4: Auxiliary button (usually the mouse wheel button or middle button)
        8: 4th button (typically the "Browser Back" button)
        16 : 5th button (typically the "Browser Forward" button)*/

        if (this.isPaning && e.buttons & 100) {

            this.panEndCoord = getSVGCoord(e, false);

            let dx: number = this.panStartCoord.x - this.panEndCoord.x;
            let dy: number = this.panStartCoord.y - this.panEndCoord.y;

            let viewBoxZoom: IviewBox = this.InitialPanViewBox;
            viewBoxZoom = {x:viewBoxZoom.x+dx,y:viewBoxZoom.y+dy,w:viewBoxZoom.w,h:viewBoxZoom.h};
            this.setState({viewBox: viewBoxZoom});
        }
        else this.isPaning = false;
    }

    // [1]
    // Where (Direct) : https://stackoverflow.com/a/52640900/2883691
    // Where          : https://stackoverflow.com/questions/52576376/how-to-zoom-in-on-a-complex-svg-structure
    // Posted         : answered Oct 4 '18 at 7:05
    // By             : Access Denied | https://stackoverflow.com/users/1099716/access-denied
    // Edited         : edited Apr 9 '20 at 4:09
    // By             : sonntam | https://stackoverflow.com/users/542269/sonntam
    // Read           : 2022-01-03
    // Modified by me : 2022-05-27

    handleWheel(e: React.WheelEvent<SVGElement>) {
        console.log(e.ctrlKey, e.deltaX, e.deltaY, e.deltaZ, e);
        //e.preventDefault();

        if (this.svgRef == null || this.svgRef === undefined) return false;
        let viewBoxZoom: IviewBox = this.state.viewBox;

        let sensitivityZoomWH: number = 0.1;
        let sensitivityZoomXY: number = 1.15;

        let dx: number = e.deltaX;
        let dy: number = e.deltaY;

        let dw: number = 0;
        let dh: number = 0;

        if (Math.abs(e.deltaX)) { // Pinch-Pan-Zoom

        }
        else { // Zoom (2 finger or wheel)
            let mx: number = e.nativeEvent.offsetX; // mouse x
            let my: number = e.nativeEvent.offsetY;

            dw = -viewBoxZoom.w*Math.sign(dy)*sensitivityZoomWH;
            dh = -viewBoxZoom.h*Math.sign(dy)*sensitivityZoomWH;

            dx = sensitivityZoomXY*dw*mx/this.svgRef.current.clientWidth;
            dy = sensitivityZoomXY*dh*my/this.svgRef.current.clientHeight;
        }







        viewBoxZoom = {x:viewBoxZoom.x+dx,y:viewBoxZoom.y+dy,w:viewBoxZoom.w-dw,h:viewBoxZoom.h-dh};
        this.setState({viewBox: viewBoxZoom});

    }

    // ########### SVG MOUSE INTERACT - END ###########

    // ########### SVG POINTER INTERACT - BEGIN ###########

    handlePointerDown(e){
        console.log("e, e.pointerId");
    }

    // ########### SVG POINTER INTERACT - END ###########

    // https://stackoverflow.com/questions/63005791/props-dont-update-when-state-updates-in-react
    render() {

        let viewBox = this.state.viewBox.x + ' ' + this.state.viewBox.y + ' ' + this.state.viewBox.h + ' ' + this.state.viewBox.w

        //console.log("RENDER BOARD")

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
                 onTouchMove={this.handlePointerDown}
                 onWheel={this.handleWheel}>


                <g id="tileContainer">
                    {this.renderTiles()}
                </g>
                <g id="entityContainer">
                    {this.props.entities}
                </g>
                <g id="structureContainer"></g>
                <g id="structureGrabPointContainer"></g>
            </svg>
        );
    }
}

export default Board;