// https://stackoverflow.com/questions/13405129/create-and-save-a-file-with-javascript
// https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server

import {IMap} from "../interfaces/dndem";

export function saveMap(mapData: IMap) {
    let mapDataJSON = JSON.stringify(mapData);
    //console.log(mapDataJSON);
    download("map.dem", mapDataJSON);
}

// https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server
// https://stackoverflow.com/a/18197341/2883691
export function download(filename: string, text: string) {
    let element: HTMLAnchorElement = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}