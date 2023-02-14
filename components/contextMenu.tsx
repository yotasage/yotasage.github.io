import React, {ReactElement} from "react";

import styles from "../styles/contextMenu.module.css";
import {IPropsContextMenu} from "../interfaces/contextMenu";
import ContextMenuItem from "./contextMenuItem";
import {Ixy} from "../interfaces/dndem";

export default class ContextMenu extends React.Component<IPropsContextMenu, {}> {
    constructor(props: IPropsContextMenu) {
        super(props);

        this.handleOnClick = this.handleOnClick.bind(this);
    }

    handleOnClick(e: React.MouseEvent<HTMLDivElement>) {
        if (this.props.onClick) this.props.onClick();
    }

    public render() {
        console.log('RENDER CONTEXT MENU');
        //console.log("render", this.state.mapData);

        // https://math.stackexchange.com/questions/2820194/how-to-plot-n-coords-to-distribute-evenly-as-a-ring-of-points-around-a-circle
        let buttonList: JSX.Element[] = [];
        this.props.buttons.forEach((element: string, index: number) => {
            console.log(element, index);

            // Calculate n coordinates that are evenly spread around a circle of radius r with center at c (cx, cy).
            let n: number = this.props.buttons.length;
            let tk: number = 2*Math.PI*index/n;
            let r: number = 200;
            let c: number = 200;
            let coords: Ixy = {x: c + r*Math.cos(tk), y: c + r*Math.sin(tk)};

            buttonList.push(<ContextMenuItem key={index} label={element} coord={coords} onButton={this.props.onButton ? this.props.onButton[index] : null}/>);

        });

        return (
            <>
                <div className={styles.contextMenuContainer}
                     onClick={this.handleOnClick}
                     style={{top: this.props.coord.y, left: this.props.coord.x}}>

                    <div className={styles.contextMenu}
                         onClick={this.handleOnClick}
                         style={{top: 0, left: 0}}>

                    </div>
                    {buttonList}
                </div>
            </>
        );
    }
}