import * as React from 'react';
//import Tile from './tileHexagon';

import styles from "../styles/propertiesWindow.module.css";

import {
    IPropsPropertiesWindow, Iqrs,
    IStatePropertiesWindow, Ixy
} from "../interfaces/dndem";

import {deepCopy, getSVGCoord} from "../tools/tools";
import Entity from "./entity";

// React.Component subclass
export default class PropertiesWindow extends React.Component<IPropsPropertiesWindow, IStatePropertiesWindow> {
    constructor(props: IPropsPropertiesWindow) {
        super(props);

        this.handleNameChange = this.handleNameChange.bind(this);
        this.handleIdChange = this.handleIdChange.bind(this);
        this.handleTypeChange = this.handleTypeChange.bind(this);
        this.handleColorChange = this.handleColorChange.bind(this);
        this.handleSizeChange = this.handleSizeChange.bind(this);

        this.handleQChange = this.handleQChange.bind(this);
        this.handleRChange = this.handleRChange.bind(this);
        this.handleSChange = this.handleSChange.bind(this);

        this.handleXChange = this.handleXChange.bind(this);
        this.handleYChange = this.handleYChange.bind(this);


        this.state = {
            id: this.props.entity.id,
            type: this.props.entity.type,

            name: this.props.entity.name,
            color: this.props.entity.color,
            size: this.props.entity.size,

            xy: this.props.entity.xy,
            qrs: this.props.entity.qrs

        };

        console.log("Properties Window Constructor");
    }

    handleNameChange(e: any) {
        this.props.entity.name = e.target.value;

        this.setState(() => ({
            name: e.target.value
        }));
    }

    handleIdChange(e: any) {
        this.props.entity.id = e.target.value;

        this.setState(() => ({
            id: e.target.value
        }));
    }

    handleTypeChange(e: any) {
        this.props.entity.type = e.target.value;

        this.setState(() => ({
            type: e.target.value
        }));
    }

    handleColorChange(e: any) {
        this.props.entity.color = e.target.value;

        this.setState(() => ({
            color: e.target.value
        }));
    }

    handleSizeChange(e: any) {
        this.props.entity.size = e.target.value;

        this.setState(() => ({
            size: e.target.value
        }));
    }

    handleQChange(e: any) {
        let newQrs: Iqrs = {q: e.target.value,
                            r: this.state.qrs.r,
                            s: this.state.qrs.s};

        let deltaQrs: Iqrs = {  q: e.target.value - this.state.qrs.q,
                                r: 0,
                                s: 0};

        this.props.entity.move(deltaQrs);

        this.setState(() => ({
            qrs: newQrs
        }));
    }

    handleRChange(e: any) {
        let newQrs: Iqrs = {q: this.state.qrs.q,
                            r: e.target.value,
                            s: this.state.qrs.s};

        let deltaQrs: Iqrs = {  q: 0,
                                r: e.target.value - this.state.qrs.r,
                                s: 0};

        this.props.entity.move(deltaQrs);

        this.setState(() => ({
            qrs: newQrs
        }));
    }

    handleSChange(e: any) {
        let newQrs: Iqrs = {q: this.state.qrs.q,
                            r: this.state.qrs.r,
                            s: e.target.value};

        let deltaQrs: Iqrs = {  q: 0,
                                r: 0,
                                s: e.target.value - this.state.qrs.s};

        this.props.entity.move(deltaQrs);

        this.setState(() => ({
            qrs: newQrs
        }));
    }

    handleXChange(e: any) {
        let newXy: Ixy = {  x: e.target.value,
                            y: this.state.xy.y};

        this.setState(() => ({
            xy: newXy
        }));
    }

    handleYChange(e: any) {
        let newXy: Ixy = {  x: this.state.xy.x,
                            y: e.target.value};

        this.setState(() => ({
            xy: newXy
        }));
    }


    // https://stackoverflow.com/questions/63005791/props-dont-update-when-state-updates-in-react
    render() {
        console.log("RENDER PROPERTIES WINDOW")

        return (
            <div id={styles.propertyWindowContainer}>
                <label htmlFor="name">name:</label>
                <input type="text" id="name" name="name" value={this.state.name} onChange={this.handleNameChange}/><br/>
                <label htmlFor="id">id:</label>
                <input type="text" id="id" name="id" value={this.state.id} onChange={this.handleIdChange}/><br/>
                <label htmlFor="type">type:</label>
                <input type="text" id="type" name="type" value={this.state.type} onChange={this.handleTypeChange}/><br/>
                <label htmlFor="color">color:</label>
                <input type="text" id="color" name="color" value={this.state.color} onChange={this.handleColorChange}/><br/>
                <label htmlFor="size">size:</label>
                <input type="text" id="size" name="size" value={this.state.size} onChange={this.handleSizeChange}/><br/><br/>

                <label htmlFor="qrs">qrs:</label><br/>
                <label htmlFor="q">q:</label>
                <input type="text" id="q" name="q" value={this.state.qrs.q} onChange={this.handleQChange}/><br/>
                <label htmlFor="r">r:</label>
                <input type="text" id="r" name="r" value={this.state.qrs.r} onChange={this.handleRChange}/><br/>
                <label htmlFor="s">s:</label>
                <input type="text" id="s" name="s" value={this.state.qrs.s} onChange={this.handleSChange}/><br/><br/>

                <label htmlFor="xy">xy:</label><br/>
                <label htmlFor="x">x:</label>
                <input type="text" id="x" name="x" value={this.state.xy.x} onChange={this.handleXChange}/><br/>
                <label htmlFor="y">y:</label>
                <input type="text" id="y" name="y" value={this.state.xy.y} onChange={this.handleYChange}/>
            </div>
        );
    }
}