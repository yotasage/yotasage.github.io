import * as React from 'react';
import * as iro from '@jaames/iro'
import {ColorPickerProps} from "@jaames/iro/dist/ColorPicker";

import colorTool from '../styles/color-picker.module.css';

// https://svg2jsx.com/

const toolsGraphics: { [key: string]: string } = {
    brush: 'url(../svg/brush.svg)',
    bucket: 'url(../svg/bucket.svg)',
    pencil: 'url(../svg/pencil.svg)',
    picker: 'url(../svg/pick.svg)',
    tree: 'url(../svg/tree.svg)',
    eraser: 'url(../svg/eraser.svg)'
}

interface ColorPickerLayoutDefinition {
    component: any;
    options?: any;
}

interface IpaintTool {
    tool: string;
    size: number;
    color: string;
}

interface IProps {
    onColorChange?: Function;
    onToolChange?: Function;
    color?: string;
}

interface IState {
    color: string;
    width: string;
    height: string;
}

class ColorPickerContainer extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.onColorChange = this.onColorChange.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onMouseLeave = this.onMouseLeave.bind(this);
        this.onToolClick = this.onToolClick.bind(this);

        this._selectedToolType = 'none';



        this.state = {
            color: 'rgb(255, 0, 0)',
            width: '50px',
            height: '50px'
        };
    }

    private selectedTool: PaintingTool | undefined;
    private displayBox: JSX.Element | undefined;
    private _selectedToolType: string;

    private color = 'rgb(255, 0, 0)';

    componentDidMount() {

    }

    onColorChange(color: iro.default.Color) {
        // console.log('color');
        if (this.props.onColorChange) {
            this.props.onColorChange(color);
            this.setState({color: color.rgbaString});
        }
    }

    onToolClick(target: PaintingTool) {
        //let targetId: string = (e.nativeEvent.target as HTMLDivElement).id;
        //let tool: string = targetId.replace('paintTool', '').toLowerCase();

        let tool: string = 'none';

        if (this.selectedTool !== undefined) {
            this.selectedTool.setState({color: 'rgb(201, 201, 201)'});
            if (this.selectedTool === target) {
                this.selectedTool = undefined;
            }
            else {
                this.selectedTool = target;
                tool = this.selectedTool.props.type;
            }
        }
        else {
            this.selectedTool = target;
            tool = this.selectedTool.props.type;
        }

        if (this.props.onToolChange) this.props.onToolChange(tool);
        this._selectedToolType = tool;
    }

    onClick(e: React.MouseEvent<HTMLDivElement>) {
        /*if (this.state.width === 'fit-content')
            this.setState({width: '50px', height: '20px'});
        else this.setState({width: 'fit-content', height: '100%'});*/

        this.setState({width: 'fit-content', height: '100%'});
    }

    onMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
        this.setState({width: '50px', height: '50px'});
    }

    render() {
        console.log("RENDER ColorPickerContainer")

        this.displayBox = <PaintingTool type={this._selectedToolType} color={this.state.color}/>;

        let layout: ColorPickerLayoutDefinition[] = [
            {component: iro.default.ui.Wheel},
            {component: iro.default.ui.Slider, options: {sliderType: 'hue'}},
            {component: iro.default.ui.Slider, options: {sliderType: 'saturation'}},
            {component: iro.default.ui.Slider, options: {sliderType: 'value'}},
            {component: iro.default.ui.Slider, options: {sliderType: 'alpha'}}];

        // <div style={{width: 50, height: 50, backgroundColor: this.state.color, float: "right"}}></div>

        return (
            <div className={colorTool.colorPickerContainer}
                 style={{width: this.state.width, height: this.state.height}}
                 onMouseLeave={this.onMouseLeave}
                 onClick={this.onClick}>
                {this.displayBox}
                <PaintingTool onClick={this.onToolClick} type={'pencil'}/>
                <PaintingTool onClick={this.onToolClick} type={'brush'}/>
                <PaintingTool onClick={this.onToolClick} type={'eraser'}/>
                <PaintingTool onClick={this.onToolClick} type={'bucket'}/>
                <PaintingTool onClick={this.onToolClick} type={'picker'}/>
                <PaintingTool onClick={this.onToolClick} type={'tree'}/>

                <ColorPicker margin={10} onColorChange={this.onColorChange} layout={layout} initColor={this.props.color}/>
            </div>
        )
    }
}

interface IPaintingToolProps {
    type: string;
    color?: string;
    float?: string;
    onClick?: Function;
}

interface IPaintingToolState {
    color: string;
}

class PaintingTool extends React.Component<IPaintingToolProps, IPaintingToolState> {
    private _type: string;
    constructor(props: IPaintingToolProps) {
        super(props);

        this.onClick = this.onClick.bind(this);

        this._type = this.props.type;

        this.state = {
            color: 'rgb(201, 201, 201)'
        };
    }

    onClick(e: React.MouseEvent<HTMLDivElement>) {
        if (this.props.onClick) {
            this.setState({color: 'rgb(150, 150, 255)'});
            this.props.onClick(this);
        }
    }

    render() {
        let color: string = (this.props.color ? this.props.color : this.state.color);

        return (
            <div onClick={this.onClick}
                 id={'paintTool' + this._type}
                 className={colorTool.paintingTool}
                 style={{ backgroundColor: color,
                     backgroundImage: toolsGraphics[this.props.type] }}/>
        )
    }
}

/*
This example was used:
https://codesandbox.io/s/github/spicynaresh/React-Color-Picker-IRO?file=/src/IroColorPicker.js:148-171
 */
/*
    // https://github.com/jaames/iro.js/issues/109

    1. If typescript version >= 2.7, add the below to your tsconfig.json.

    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true

    2. Or simply import * as iro from '@jaames/iro'
*/

interface IColorPickerProps extends ColorPickerProps {
    onColorChange?: Function;
    initColor?: string;
}

/*
let layout: ColorPickerLayoutDefinition[] = [{component: iro.ui.Wheel},
            {component: iro.ui.Slider, options: {sliderType: 'hue'}},
            {component: iro.ui.Slider, options: {sliderType: 'saturation'}},
            {component: iro.ui.Slider, options: {sliderType: 'value'}},
            {component: iro.ui.Slider, options: {sliderType: 'alpha'}}];

<ColorPicker margin={10} onColorChange={this.onColorChange} layout={layout}/>
 */

class ColorPicker extends React.Component<IColorPickerProps, {}> {
    // | undefined was added such that the fields would not have to be declared in the constructor
    private colorPicker: iro.default.ColorPicker | undefined;
    private el: null | HTMLDivElement | undefined;
    private currentColor: string = '';

    componentDidMount() {
        const { props } = this;

        if (this.currentColor === '') this.currentColor =
            (this.props.initColor !== undefined ? this.props.initColor : 'rgb(0, 0, 0)');

        if (this.el !== undefined && this.el !== null) {
            this.colorPicker = iro.default.ColorPicker(this.el, props);
            this.colorPicker.on('color:change', this.onColorChange);
            if (this.props.initColor !== undefined) this.colorPicker.color.set(this.props.initColor);
        }
    }

    onColorChange(color: iro.default.Color) {
        if (this.props.onColorChange) this.props.onColorChange(color);
    }

    componentDidUpdate() {
        // isolate color from the rest of the props
        const { color } = this.props;

        console.log("Color-picker UPDATE");

        // update color
        if (this.colorPicker !== undefined) {
            if (color) this.colorPicker.color.set(color);
        }
    }

    render() {
        console.log("RENDER ColorPicker")

        /*if (this.props.initColor !== undefined && this.props.initColor !== this.currentColor) {
            if (this.colorPicker !== undefined) {
                console.log("Chaning color from '%s' to '%s'", this.currentColor, this.props.initColor);
                this.currentColor = this.props.initColor;
                this.colorPicker.color.set(this.props.initColor);
            }
        }*/

        return <div ref={el => (this.el = el)}></div>;
    }
}

export default ColorPickerContainer;
