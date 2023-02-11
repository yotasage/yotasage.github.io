import Board from "../components/svgBoard";
import TileHexagon from "../components/tileHexagon";

import * as IDndem from "../interfaces/dndem";
import * as ITools from "../interfaces/tools";

export function paintBrush(array: string[][], coord: IDndem.Iqrs, color: string, size: number) {
    let fillStack: IDndem.Iqrs[] = [];
    let returnStack: IDndem.Icoordinate[] = [];
    let radius: number = (array.length + 1)/2;
    fillStack.push(coord); // Add coordinates of the selected Tile to the stack/queue

    // Add the surrounding tiles to the stack/queue
    for (let i = 1; i < size; i++) {
        let neighbours: IDndem.Iqrs[] = Board.createRings(i, coord);
        for (let j = 0; j < neighbours.length; j++) {
            fillStack.push(neighbours[j]);
        }
    }

    // Loop through the queue
    while(fillStack.length > 0)
    {
        let qrs: IDndem.Iqrs | undefined = fillStack.pop();

        if (typeof qrs !== 'undefined') {
            // Check if current Tile exist in the array/map, if not, go to next iteration (continue)
            if (!Board.contains(qrs, array)) continue;

            let xy: IDndem.Ixy = Board.qrsToXy(qrs, radius);

            // If the color of the Tile is the same as the color we are trying to replace
            if (color === array[xy.x][xy.y]) continue;

            returnStack.push({qrs: qrs});
            array[xy.x][xy.y] = color;
        }
    }

    return returnStack;
}

export function paintBucket(array: string[][], coord: IDndem.Iqrs, color: string) {
    let fillStack: IDndem.Iqrs[] = [];
    let returnStack: IDndem.Icoordinate[] = [];
    let radius: number = (array.length + 1)/2;
    let xy: IDndem.Ixy = Board.qrsToXy(coord, radius);
    let replace_color: string = array[xy.x][xy.y];

    // If the color of the Hex is the same as the color we are trying to fill
    if (color === replace_color) return returnStack;
    console.log('color', color);
    console.log('replace_color', replace_color);

    fillStack.push(coord); // Add coordinates of the selected Tile to the stack/queue
    while(fillStack.length > 0)
    {
        let qrs: IDndem.Iqrs | undefined = fillStack.pop();

        if (typeof qrs !== 'undefined') {
            // Check if current Tile exist in the array/map, if not, go to next iteration (continue)
            if (!Board.contains(qrs, array)) continue;

            let xy: IDndem.Ixy = Board.qrsToXy(qrs, radius);

            // If the color of the Tile is not the same as the color we are trying to replace
            if (replace_color !== array[xy.x][xy.y]) continue;

            returnStack.push({qrs: qrs});
            array[xy.x][xy.y] = color;

            // Get neigbours of the current Hex and add them to the stack/queue
            let neighbours: IDndem.Iqrs[] = TileHexagon.neighbours(qrs);
            for (let i = 0; i < 6; i++) {
                fillStack.push(neighbours[i]);
            }
        }
    }

    return returnStack;
}