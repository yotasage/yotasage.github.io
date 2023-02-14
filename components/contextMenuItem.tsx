import React from "react";

import styles from "../styles/contextMenu.module.css";
import {IPropsContextItem} from "../interfaces/contextMenu";

export default class ContextMenuItem extends React.Component<IPropsContextItem, {}> {
    constructor(props: IPropsContextItem) {
        super(props);

        this.handleOnButton = this.handleOnButton.bind(this);
    }

    handleOnButton(e: React.MouseEvent<HTMLDivElement>) {
        if (this.props.onButton) this.props.onButton();
    }

    public render() {
        console.log('RENDER CONTEXT MENU ITEM');
        //console.log("render", this.state.mapData);

        // style={{top: this.props.coord.y, left: this.props.coord.x}}
        return (
            <>
                <div className={styles.contextMenuItem}
                     style={{top: this.props.coord.y, left: this.props.coord.x}}
                     onClick={this.handleOnButton}>
                    <p className={styles.contextMenuItem}>{this.props.label}</p>
                </div>
            </>
        );
    }
}