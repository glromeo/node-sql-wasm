try {
    require("fs").mkdirSync("out")
} catch (e) {
}

// Maps a JSON array to a shell array
const makeFunctionArray = arr => `[${arr.map(functionName => `'${functionName}'`).join(",")}]`;

// List of exported functions & methods required for SQL.js
const exportedFunctions = makeFunctionArray(require("./src/native/exported_functions.json"));
const exportedRuntimeMethods = makeFunctionArray(require("./src/native/exported_runtime_methods.json"));

// Creates the SQLite LLVM .bc file using Emscripten
const llvm = `emcc --llvm-opts 2 -s ENVIRONMENT=node -lnodefs.js -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DISABLE_LFS -DSQLITE_THREADSAFE=0 -DSQLITE_ENABLE_FTS3 -DSQLITE_ENABLE_FTS3_PARENTHESIS src/native/sqlite3.c src/native/extension-functions.c -r -o out/sqlite3.bc`;

// Creates the Emscripten .js and .wasm files using the SQLite code generated above.
// Two different bundles depending on the environment
const emcc = `emcc --llvm-opts 2 -s ENVIRONMENT=node -lnodefs.js -s WASM=1 -s MODULARIZE=1 -s ALLOW_MEMORY_GROWTH=1 -s EXPORT_ES6=1 -s 'EXPORT_NAME="sqlite3"' -s RESERVED_FUNCTION_POINTERS=64 -s FORCE_FILESYSTEM=1 -s "EXPORTED_FUNCTIONS=${exportedFunctions}" -s "EXTRA_EXPORTED_RUNTIME_METHODS=${exportedRuntimeMethods}" out/sqlite3.bc -o out/sqlite3.js`;

module.exports = {
    scripts: {
        llvm,
        emcc
    }
};
