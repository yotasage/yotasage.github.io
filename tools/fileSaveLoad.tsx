// https://stackoverflow.com/questions/13405129/create-and-save-a-file-with-javascript
// https://stackoverflow.com/questions/3665115/how-to-create-a-file-in-memory-for-user-to-download-but-not-through-server

import {IMap} from "../interfaces/dndem";

export function loadFile(callback: Function, filetype: string = 'dem') {
    let element: HTMLInputElement = document.createElement('input');
    element.setAttribute('type', 'file');
    element.setAttribute('file-selector', 'single');
    element.setAttribute('accept', filetype);
    element.addEventListener('change', callback, false);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

export function saveMap(mapData: IMap) {
    let mapDataJSON = JSON.stringify(mapData);
    //console.log(mapDataJSON);
    download("map.dem", mapDataJSON);
}

export function saveToDem(filename: string, data: string) {
    download((filename + ".dem"), data);
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

// https://web.dev/read-files/
// https://www.html5rocks.com/en/tutorials/file/dndfiles//
/*export function loadMap(e) {
    let fileList: FileList = e.target.files;
    let f: File = fileList[0];
    let reader: FileReader = new FileReader();

    reader.onload = mapReaderOnLoad;   // Function to perform when reading of file is complete
    reader.readAsText(f);           // Start reading the file

}

export function mapReaderOnLoad(e) {
    let result = e.target.result;
    // console.log(result);
    let loadedArray = JSON.parse(result);
    //console.log(loadedArray);
    modifyMapFromArray(loadedArray);
}*/