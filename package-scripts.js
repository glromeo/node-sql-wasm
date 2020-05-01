try {
    require("fs").mkdirSync("out")
} catch (e) {
}

// Maps a JSON array to a shell array
const makeFunctionArray = arr => `[${arr.map(name => `'${name}'`).join(",")}]`;

// List of exported functions & methods required for SQL.js
const EXPORTED_FUNCTIONS = makeFunctionArray(require("./src/native/exported_functions.json"));
const EXPORTED_RUNTIME_METHODS = makeFunctionArray(require("./src/native/exported_runtime_methods.json"));

const CFLAGS = [
    '-O2',
    '-s ENVIRONMENT=node',
    '-lnodefs.js',
    '-r',
    '-DSQLITE_OMIT_LOAD_EXTENSION',
    '-DSQLITE_DISABLE_LFS',
    '-DSQLITE_ENABLE_FTS3',
    '-DSQLITE_ENABLE_FTS3_PARENTHESIS',
    '-DSQLITE_THREADSAFE=0',
].join(' ');

const EMFLAGS = [
    '-O3',
    '-s ENVIRONMENT=node',
    '-lnodefs.js',
    '-s WASM=1',
    '-s MODULARIZE=1',
    '-s ALLOW_MEMORY_GROWTH=1',
    '-s ALLOW_TABLE_GROWTH=1',
    '-s EXPORT_ES6=1',
    `-s 'EXPORT_NAME="sqlite3"'`,
    '-s RESERVED_FUNCTION_POINTERS=64',
    '-s FORCE_FILESYSTEM=1',
    '-s NODEJS_CATCH_EXIT=0',
    '-s INLINING_LIMIT=50',
    // '--closure 1',
    // '--llvm-lto 1',
    // '--memory-init-file 0',
    // '-flto',
    // '-s SINGLE_FILE=0',
].join(' ');

// Creates the SQLite LLVM .bc file using Emscripten
const llvm = `emcc ${CFLAGS} src/native/sqlite3.c src/native/extension-functions.c -r -o out/sqlite3.bc`;

// Creates the Emscripten .js and .wasm files using the SQLite code generated above.
// Two different bundles depending on the environment
const emcc = `emcc ${EMFLAGS} -s "EXPORTED_FUNCTIONS=${EXPORTED_FUNCTIONS}" -s "EXTRA_EXPORTED_RUNTIME_METHODS=${EXPORTED_RUNTIME_METHODS}" out/sqlite3.bc -o out/sqlite3.js`;

module.exports = {
    scripts: {
        llvm,
        emcc
    }
};
