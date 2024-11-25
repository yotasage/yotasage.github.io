import * as React from 'react';
//import Tile from './tileHexagon';

import Image from "next/image";

import styles from "../styles/propertiesWindow.module.css";

import {
    IPropsPropertiesWindow, Iqrs,
    IStatePropertiesWindow, Ixy
} from "../interfaces/dndem";

import {deepCopy, getSVGCoord} from "../tools/tools";
import Entity from "./entity";
import {loadFile} from "../tools/fileSaveLoad";

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

        this.handleTokenLoad = this.handleTokenLoad.bind(this);
        this.handleTokenLoaded = this.handleTokenLoaded.bind(this);
        this.previewToken = this.previewToken.bind(this);

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

    handleTokenLoad(e: any) {
        loadFile(this.handleTokenLoaded, '.png, .jpg, .gif');
    }

    handleTokenLoaded(e: any) {
        let loadedTokenFiles = e.target.files; // FileList object
        let file = loadedTokenFiles[0]; // Get the first file

        let reader = new FileReader();
        reader.onload = this.previewToken;   // Function to perform when reading of file is complete
        reader.readAsDataURL(file);
    }

    previewToken(e: any) {
        //console.log(e.target.result);

        this.props.entity.token = e.target.result;

        this.setState(() => ({
            token: e.target.result
        }));
    }

    /*shouldComponentUpdate(nextProps: Readonly<IPropsPropertiesWindow>, nextState: Readonly<IStatePropertiesWindow>, nextContext: any): boolean {
        console.log('yes');
        return true;
    }*/

    // https://stackoverflow.com/questions/63005791/props-dont-update-when-state-updates-in-react
    render() {
        console.log("RENDER PROPERTIES WINDOW")

        // <image id={styles.propertyWindowToken} href={this.props.entity.state.token}></image><br/><br/><br/>

        let token: string = this.props.entity.token;
        if (this.props.entity.token === undefined || !this.props.entity.token.includes('data')) {
            token = "/tokens/person.png";
        }

        return (
            <div id={styles.propertyWindowContainer}>

                <img id={styles.propertyWindowToken} src={token} alt={'entity token'}
                     onClick={this.handleTokenLoad}>
                </img><br/>

                <button id={styles.propertyWindowTokenLoadBtn}
                    onClick={this.handleTokenLoad}>
                    Change
                </button><br/>

                <div>
                    <label className={styles.propertyLabel} htmlFor="name">name:</label>
                    <input type="text" className={styles.inputs} id="name" name="name" value={this.props.entity.name} onChange={this.handleNameChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="id">id:</label>
                    <input type="text" className={styles.inputs} id="id" name="id" value={this.props.entity.id} onChange={this.handleIdChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="type">type:</label>
                    <input type="text" className={styles.inputs} id="type" name="type" value={this.props.entity.type} onChange={this.handleTypeChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="color">color:</label>
                    <input type="text" className={styles.inputs} id="color" name="color" value={this.props.entity.color} onChange={this.handleColorChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="size">size:</label>
                    <input type="text" className={styles.inputs} id="size" name="size" value={this.props.entity.size} onChange={this.handleSizeChange}/>
                </div>

                <label className={styles.propertyLabel} htmlFor="qrs">qrs:</label><br/>

                <div>
                    <label className={styles.propertyLabel} htmlFor="q">q:</label>
                    <input type="text" className={styles.inputs} id="q" name="q" value={this.props.entity.qrs.q} onChange={this.handleQChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="r">r:</label>
                    <input type="text" className={styles.inputs} id="r" name="r" value={this.props.entity.qrs.r} onChange={this.handleRChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="s">s:</label>
                    <input type="text" className={styles.inputs} id="s" name="s" value={this.props.entity.qrs.s} onChange={this.handleSChange}/>
                </div>

                <label className={styles.propertyLabel} htmlFor="xy">xy:</label><br/>

                <div>
                    <label className={styles.propertyLabel} htmlFor="x">x:</label>
                    <input type="text" className={styles.inputs} id="x" name="x" value={this.props.entity.xy.x} onChange={this.handleXChange}/>
                </div>

                <div>
                    <label className={styles.propertyLabel} htmlFor="y">y:</label>
                    <input type="text" className={styles.inputs} id="y" name="y" value={this.props.entity.xy.y} onChange={this.handleYChange}/>
                </div>

            </div>
        );
    }
}