import {DataConnection} from "peerjs";
import {Iqrs, Ixy} from "./dndem";

// https://www.npmjs.com/package/peerjs
// npm install peerjs

// https://socket.io/docs/v4/client-installation/
// https://www.npmjs.com/package/socket.io-client
// npm i socket.io-client
// npm i socket.io

export interface IDataPackage {
    username?: string;
    msg?: string;
    xy?: Ixy;
    qrs?: Iqrs;
    color?: string;
}

export interface IConnections {
    username: string;
    dataConnection: DataConnection;
    online: boolean;
}