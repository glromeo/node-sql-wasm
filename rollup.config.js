import path from "path";
import babel from "rollup-plugin-babel";
import resolve from "rollup-plugin-node-resolve";
import url from "rollup-plugin-url";

const extensions = [".ts", ".js"];

const shared = {
    input: "src/index.ts",
    external: ["path"],
    plugins: [
        url({
            limit: 0,
            include: ["src/compiled/sqlite3.wasm"],
            sourceDir: path.join(__dirname, "src/compiled/"),
            fileName: "../[name][extname]"
        }),
        babel({ extensions, include: ["src/**/*"], exclude: "src/compiled/sqlite3.js" }),
        resolve({ extensions })
    ]
};

const cjs = {
    ...shared,
    output: {
        dir: "dist/cjs",
        entryFileNames: "sql-wasm.js",
        format: "cjs"
    },
    plugins: [
        ...shared.plugins
    ]
};

const esm = {
    ...shared,
    output: {
        dir: "dist/esm",
        entryFileNames: "sql-wasm.js",
        format: "esm"
    },
    plugins: [
        ...shared.plugins
    ]
};

export default [cjs, esm];
