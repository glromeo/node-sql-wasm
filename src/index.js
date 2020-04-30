import sqlite3Module from "../out/sqlite3";
import createSqlJs from "./api";
import wasmPath from "../out/sqlite3.wasm";

import {join} from "path";

export default () => new Promise((resolve, reject) => {
    const wasm = sqlite3Module({
        noInitialRun: true,
        locateFile(url) {
            return url === "sqlite3.wasm" ? join(__dirname, wasmPath) : url;
        },
        onAbort(error) {
            reject(error);
        },
        onRuntimeInitialized() {
            const sqlJs = createSqlJs(wasm);
            resolve(sqlJs);
        }
    });
});
