import * as React from 'react';

//import {ThemeContext, PaintingContext} from '../contexts';

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
    qrs?: Iqrs;
    xy?: Ixy;
    color?: string;
    stepSize?: number;
    size?: number | string;
}

interface IState {
    color: string;
    qrs: Iqrs;
    xy: Ixy;
    size: number;
}

class Entity extends React.Component<IProps, IState> {
    static id = 1;
    private timerID: NodeJS.Timer;

    constructor(props: IProps) {
        super(props);

        this.handleOnClick = this.handleOnClick.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.handleSelect = this.handleSelect.bind(this);
        this.handleExit = this.handleExit.bind(this);
        this.tick = this.tick.bind(this);

        this._id = Entity.id++;

        // Create timer and stop it again.
        this.timerID = setInterval(() => this.tick(), 1000);
        clearInterval(this.timerID);

        if (this.props.color !== undefined) {
            this._color = this.props.color;
        }
        else {
            this._color = 'Aquamarine';
        }

        if (this.props.stepSize !== undefined) {
            this._stepSize = this.props.stepSize;
        }
        else {
            this._stepSize = 8;
        }

        if (typeof this.props.size == 'string') {
            if      (this.props.size == 'small')       this._size = 3;
            else if (this.props.size == 'medium')      this._size = 6;
            else if (this.props.size == 'large')       this._size = 8;
            else if (this.props.size == 'huge')        this._size = 16;
            else if (this.props.size == 'gargantuan')  this._size = 24;
            else if (this.props.size == 'colossal')    this._size = 30;
            else                                       this._size = 6;
        }
        else if (typeof this.props.size == 'number') {
            this._size = this.props.size;
        }
        else {
            this._size = 6;
        }

        if (this.props.qrs !== undefined) {
            this._qrs = {q: this.props.qrs.q, r: this.props.qrs.r, s: -this.props.qrs.q - this.props.qrs.r};
            this._xy = this.qrsToXy(this.props.qrs);
        }
        else if (this.props.xy !== undefined) {
            this._xy = this.props.xy;
            this._qrs = this.xyToQrs(this.props.xy);
        }
        else {
            this._qrs = {q: 0, r: 0, s: 0};
            this._xy = {x: 0, y: 0};
        }

        this.state = {
            color: this._color,
            qrs: this._qrs,
            xy: this._xy,
            size: this._size
        };

        console.log("Entity Constructor");
    }

    private _id: number;
    get id(): number {
        return this._id;
    }
    set id(value: number) {
        this._id = value;
    }

    private _size: number;
    get size(): number {
        return this._size;
    }
    set size(value: number) {
        this._size = value;
    }

    private _stepSize: number;
    get stepSize(): number {
        return this._stepSize;
    }
    set stepSize(value: number) {
        this._stepSize = value;
    }

    private _qrs: Iqrs;
    get qrs(): Iqrs {
        return this._qrs;
    }
    set qrs(value: Iqrs) {
        this._qrs = value;
    }

    private _xy: Ixy;
    get xy(): Ixy {
        return this._xy;
    }
    set xy(value: Ixy) {
        this._xy = value;
    }

    private _color: string;
    get color(): string {
        return this._color;
    }
    set color(value: string) {
        // console.log(value);
        if (this._color === value) return;
        this._color = value;
        this.setState({color: value})
    }

    qrsToXy(qrs: Iqrs) {
        let xy: Ixy = {x: 0, y: 0};
        xy.x = this.stepSize * (Math.sqrt(3) * this.qrs.q  +  Math.sqrt(3)/2 * this.qrs.r)
        xy.y = this.stepSize * (                                              3./2 * this.qrs.r)
        return xy;
    }

    xyToQrs(xy: Ixy) {
        let qrs: Iqrs = {q: 0, r: 0, s: 0};
        qrs.q = (Math.sqrt(3)/3 * xy.x  -  1./3 * xy.y) / this.stepSize
        qrs.r = (                             2./3 * xy.y) / this.stepSize
        qrs.s = -qrs.q - qrs.r
        return qrs;
    }

    move(deltaQrs: Iqrs) { // Ixy | Iqrs
        /*if (typeof coord.q !== undefined) {

        }
        else if (typeof coord === 'Ixy') {

        }*/

        // Math.sqrt(3) * this.stepSize

        let newQrs: Iqrs = {q: this.state.qrs.q + deltaQrs.q,
            r: this.state.qrs.r + deltaQrs.r,
            s: 0};

        if ((typeof newQrs.s !== 'undefined') && (typeof this.state.qrs.s !== 'undefined'))
            newQrs.s = this.state.qrs.s - deltaQrs.q - deltaQrs.r;

        let newXy: Ixy = this.qrsToXy(newQrs);

        console.log('deltaXy', this.qrsToXy(deltaQrs));
        console.log('newXy', newXy);
        console.log('this.state.xy', this.state.xy);

        this.xy = newXy;
        this.qrs = newQrs;
        this.setState({xy: newXy, qrs: newQrs}); // check out call back for setState
        // this.setState({xy: newXy});

        console.log('this.state.xy', this.state.xy);

    }

    handleOnClick(e: React.MouseEvent<SVGElement>) {
        /*console.log(this);
        console.log(e.target);
        console.log(e.currentTarget);*/

        //this.color = 'rgb(255, 0, 0)';
    }

    onKeyDown(e: React.KeyboardEvent<SVGElement>) {
        let deltaQrs: Iqrs = {q: 0, r: 0};
        let xy: Ixy = {x: 0, y: 0};
        let key: string = e.key.toLowerCase();
        console.log(e.key);

        if (key === 'arrowleft' || key === 'a')         deltaQrs = {q: -1, r: 0};
        else if (key === 'arrowright' || key === 'd')   deltaQrs = {q: 1, r: 0};
        else if (key === 'arrowup' || key === 'e')      deltaQrs = {q: 1, r: -1};
        else if (key === 'arrowdown' || key === 'z')    deltaQrs = {q: -1, r: 1};
        else if (key === 'w')                           deltaQrs = {q: 0, r: -1};
        else if (key === 'x')                           deltaQrs = {q: 0, r: 1};
        else if (key === 's') { /* center the piece on the tile */ }

        if (deltaQrs.q !== 0 || deltaQrs.r !== 0) this.move(deltaQrs);
    }

    handleExit(e: React.MouseEvent<SVGElement>) {
        console.log(e);
        clearInterval(this.timerID);
    }

    handleSelect(e: React.MouseEvent<SVGElement>) {
        console.log(e);
        this.timerID = setInterval(
            () => this.tick(),
            1000
        );
    }

    tick() {
        console.log('tick: ' + this.id);
    }

    render() {
        let className: string = 'entity';

        let fontSize: string = this.size/10 + "em";

        //let qrs: Iqrs = this.state.qrs;
        let xy: Ixy = this.qrsToXy(this.state.qrs);

        return (
            <g onClick={this.handleOnClick}
               onMouseDown={this.handleSelect}
               onMouseLeave={this.handleExit}
               onMouseUp={this.handleExit}
               onKeyDown={this.onKeyDown}
               tabIndex={-1}>
                <defs>
                    <clipPath id={"entityClipPath" + this.id}>
                        <circle cx={xy.x} cy={xy.y} r={this.state.size}></circle>
                    </clipPath>
                </defs>
                <circle className={className} id={this.id.toString()} cx={xy.x} cy={xy.y} r={this.state.size} fill={this.state.color}/>
                <text fontSize={fontSize}
                      x={xy.x}
                      y={xy.y}>{this.id}</text>
                <image width={this.state.size*2} height={this.state.size*2}
                       x={xy.x - this.state.size} y={xy.y - this.state.size}
                       clipPath={"url(#entityClipPath" +  this.id + ")"}>

                </image>
            </g>

        );
    }
}

/*function isFoo(object: any): object is Foo {
    return 'fooProperty' in object;
}*/

export default Entity;