import React from "react";

interface Iqrs {
    q: number;
    r: number;
    s?: number;
}

interface Ixy {
    x: number;
    y: number;
}

interface IProps {
    coords: Iqrs;
    color: string;
    handleOnClick: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
    handleOnEnter: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
    handleOnDown: (e: React.MouseEvent<SVGElement, MouseEvent>, target: TileHexagon) => void;
}

interface IState {
    color: string;
}

export default class TileHexagon extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);
        this.handleOnClick = this.handleOnClick.bind(this);
        this.handleOnEnter = this.handleOnEnter.bind(this);
        this.handleOnDown = this.handleOnDown.bind(this);

        this._color = this.props.color;

        this.state = {
            color: this.color
        };

        this._qrs = {q: props.coords.q, r: props.coords.r, s: -props.coords.q - props.coords.r};
        this._size = 8;

        let hex_w: number = Math.sqrt(3) * this._size;   // Width of hex
        let hex_h: number = 2 * this._size;                 // Height of hex
        let dist_center_h: number = hex_w;          // Horizontal distance between center points of adjacent hex
        let dist_center_v: number = hex_h * 3/4;    // Vertical distance between center points of adjacent hex
        this._center = {x: this._qrs.q*dist_center_h, y: this._qrs.r*dist_center_v};
        this._center.x = this._center.x + this._qrs.r*dist_center_h/2;

        let points: string = "";
        for (let i = 0; i < 6; i++) { // Calculate all the corners of a pointy hex
            let point: Ixy = this.tileCorners(this._center, this._size, i);
            points += point.x.toString(10) + "," + point.y.toString(10) + " ";
        }

        this._points = points;
        // this._points = "6.92820323027551,-3.9999999999999996 6.92820323027551,3.9999999999999996 4.898587196589413e-16,8 -6.92820323027551,3.9999999999999996 -6.928203230275509,-4.000000000000001 -1.4695761589768238e-15,-8 ";
    }

    handleOnClick(e: React.MouseEvent<SVGElement>) {
        this.props.handleOnClick(e, this);
    }

    handleOnEnter(e: React.MouseEvent<SVGElement>) {
        this.props.handleOnEnter(e, this);
    }

    handleOnDown(e: React.MouseEvent<SVGElement>) {
        this.props.handleOnDown(e, this);
    }

    private _qrs: Iqrs;
    get qrs(): Iqrs {
        return this._qrs;
    }
    set qrs(value: Iqrs) {
        this._qrs = value;
    }

    private _center: Ixy;
    get center(): Ixy {
        return this._center;
    }
    set center(value: Ixy) {
        this._center = value;
    }

    private _size: number;
    get size(): number {
        return this._size;
    }
    set size(value: number) {
        this._size = value;
    }

    private _color: string;
    get color(): string {
        return this._color;
    }
    set color(value: string) {
        //console.log(value);
        if (this._color === value) return;
        this._color = value;
        //this.setState({color: value})
    }

    private _points: string;
    get points(): string {
        return this._points;
    }
    set points(value: string) {
        this._points = value;
    }

    tileCorners(center: Ixy, size: number, i: number, rotation: number = 30) {
        let angle_deg: number = 60 * i - rotation
        let angle_rad: number = Math.PI / 180 * angle_deg
        let x: number = center.x + size * Math.cos(angle_rad);
        let y: number = center.y + size * Math.sin(angle_rad);
        return {x, y};
    }

    static neighbours(qrsCenter: Iqrs) {

        // The order of the items in the list is crucial for other functions
        let neighbourList: Iqrs[] = [   {q: 1, r: 0, s: -1}, {q: 1, r: -1, s: 0},
            {q: 0, r: -1, s: 1}, {q: -1, r: 0, s: 1},
            {q: -1, r: 1, s: 0}, {q: 0, r: 1, s: -1}];

        for (let i = 0; i < 6; i++) {
            let qrsTemp: Iqrs = neighbourList[i];

            qrsTemp.q = qrsCenter.q + qrsTemp.q;
            qrsTemp.r = qrsCenter.r + qrsTemp.r;
            if ((typeof qrsCenter.s !== 'undefined') && (typeof qrsTemp.s !== 'undefined'))
                qrsTemp.s = qrsCenter.s + qrsTemp.s;
        }

        return neighbourList;
    }

    shouldComponentUpdate(nextProps: IProps, nextState: IState) {
        // Prevents all tiles from re-rendering when only 1 changes color
        return this.props.color !== nextProps.color;
    }

    render() {
        return (
            <polygon points={this._points} fill={this.color}
                     onMouseEnter={this.handleOnEnter}
                     onMouseDown={this.handleOnDown}
                     onClick={this.handleOnClick}></polygon>
        );
    }
}