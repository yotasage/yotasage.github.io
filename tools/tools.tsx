import Board from "../components/svgBoard";
import TileHexagon from "../components/tileHexagon";

import {Icoordinate, Iqrs, Ixy} from "../interfaces/dndem";
import * as ITools from "../interfaces/tools";
import * as React from "react";

export function paintBrush(array: string[][], coord: Iqrs, color: string, size: number) {
    let fillStack: Iqrs[] = [];
    let returnStack: Icoordinate[] = [];
    let radius: number = (array.length + 1)/2;
    fillStack.push(coord); // Add coordinates of the selected Tile to the stack/queue

    // Add the surrounding tiles to the stack/queue
    for (let i = 1; i < size; i++) {
        let neighbours: Iqrs[] = Board.createRings(i, coord);
        for (let j = 0; j < neighbours.length; j++) {
            fillStack.push(neighbours[j]);
        }
    }

    // Loop through the queue
    while(fillStack.length > 0)
    {
        let qrs: Iqrs | undefined = fillStack.pop();

        if (typeof qrs !== 'undefined') {
            // Check if current Tile exist in the array/map, if not, go to next iteration (continue)
            if (!Board.contains(qrs, array)) continue;

            let xy: Ixy = Board.qrsToXy(qrs, radius);

            // If the color of the Tile is the same as the color we are trying to replace
            if (color === array[xy.x][xy.y]) continue;

            returnStack.push({qrs: qrs});
            array[xy.x][xy.y] = color;
        }
    }

    return returnStack;
}

export function paintBucket(array: string[][], coord: Iqrs, color: string) {
    let fillStack: Iqrs[] = [];
    let returnStack: Icoordinate[] = [];
    let radius: number = (array.length + 1)/2;
    let xy: Ixy = Board.qrsToXy(coord, radius);
    let replace_color: string = array[xy.x][xy.y];

    // If the color of the Hex is the same as the color we are trying to fill
    if (color === replace_color) return returnStack;
    console.log('color', color);
    console.log('replace_color', replace_color);

    fillStack.push(coord); // Add coordinates of the selected Tile to the stack/queue
    while(fillStack.length > 0)
    {
        let qrs: Iqrs | undefined = fillStack.pop();

        if (typeof qrs !== 'undefined') {
            // Check if current Tile exist in the array/map, if not, go to next iteration (continue)
            if (!Board.contains(qrs, array)) continue;

            let xy: Ixy = Board.qrsToXy(qrs, radius);

            // If the color of the Tile is not the same as the color we are trying to replace
            if (replace_color !== array[xy.x][xy.y]) continue;

            returnStack.push({qrs: qrs});
            array[xy.x][xy.y] = color;

            // Get neigbours of the current Hex and add them to the stack/queue
            let neighbours: Iqrs[] = TileHexagon.neighbours(qrs);
            for (let i = 0; i < 6; i++) {
                fillStack.push(neighbours[i]);
            }
        }
    }

    return returnStack;
}

export function getSVGCoord(e: React.MouseEvent<SVGElement>, offsetCorrection: boolean = true) {
    //console.log(this.SVG_width, this.SVG_height, viewBox)

    // ((e.target as SVGImageElement)["viewportElement"] as HTMLOrSVGElement)["viewBox"];
    let target: EventTarget = e.target;
    let targetViewPort: HTMLOrSVGElement = target["viewportElement"];

    if (targetViewPort === null) return null;

    // Get coordinate system max and min values of SVG viewport
    let viewBox: SVGAnimatedRect = targetViewPort["viewBox"];
    let chartBaseHeight = viewBox.baseVal.height;
    let chartBaseWidth = viewBox.baseVal.width;

    // Get coordinates inside the SVG-element / Smith Chart
    let chartWidth = ((e.target as HTMLImageElement)["viewportElement"] as HTMLOrSVGElement)["clientWidth"];
    let chartHeight = ((e.target as HTMLImageElement)["viewportElement"] as HTMLOrSVGElement)["clientHeight"];
    let AR = chartWidth/chartHeight; // Aspect Ratio

    // Calculate the x and y coordinates inside the viewport
    let x = (e.clientX - chartWidth/2)/(chartWidth/2)*(chartBaseWidth/2);
    let y = (e.clientY - chartHeight/2)/(chartHeight/2)*(chartBaseHeight/2);

    // Aspect ratio correction
    if (AR > 1)         x = (e.clientX - chartWidth/2)*AR/(chartWidth/2)*(chartBaseWidth/2);
    else if (AR < 1)    y = (e.clientY - chartHeight/2)/(AR*chartHeight/2)*(chartBaseHeight/2);

    // Adjust for shifted center after pan/zoom.
    if (offsetCorrection) {
        let viewBoxCenterX = viewBox.baseVal.x + chartBaseWidth/2
        let viewBoxCenterY = viewBox.baseVal.y + chartBaseHeight/2
        x = x + viewBoxCenterX;
        y = y + viewBoxCenterY;
    }

    return {x: x, y: y};
}