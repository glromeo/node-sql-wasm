import path from "path";
import babel from "rollup-plugin-babel";
import resolve from "rollup-plugin-node-resolve";
import url from "rollup-plugin-url";

const entryFileNames = "node-sql-wasm.js";

const shared = {
    input: "src/index.js",
    external: ["path"],
    plugins: [
        url({
            limit: 0,
            include: ["out/sqlite3.wasm"],
            sourceDir: path.join(__dirname, "out/"),
            fileName: "../[name][extname]"
        }),
        babel({ extensions: [".js"], include: ["src/**/*"] }),
        resolve({ extensions: [".js"] })
    ]
};

const cjs = {
    ...shared,
    output: {
        dir: "dist/cjs",
        entryFileNames: entryFileNames,
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
        entryFileNames: entryFileNames,
        format: "esm"
    },
    plugins: [
        ...shared.plugins
    ]
};

export default [cjs, esm];
