import sqlite3Module from "../out/sqlite3";
import createDatabase from "./Database.js";
import createStatement from "./Statement.js";
import wasmPath from "../out/sqlite3.wasm";

import {join} from "path";

export default () => new Promise((resolve, reject) => {
    const runtime = sqlite3Module({
        noInitialRun: true,
        locateFile(url) {
            return url === "sqlite3.wasm" ? join(__dirname, wasmPath) : url;
        },
        onAbort(error) {
            reject(error);
        },
        onRuntimeInitialized() {
            const Statement = createStatement(runtime)
            const Database = createDatabase(runtime, {Statement});
            resolve({
                Statement,
                Database
            });
        }
    });
});
