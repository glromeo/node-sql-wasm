# node-sql-wasm

SQLite compiled to WebAssembly through Emscripten for Node.js to use file based databases with NODEFS.

This project is a fork of the existing [sql-wasm](https://github.com/ryan-codingintrigue/sql-wasm#readme) 
merged with latest API and dependencies from [SQL.JS](https://github.com/sql-js/sql.js).
It aims at keeping the build simple and to have the latest sqlite3 features.

The native sqlite3 sources are from [sqlite-amalgamation-3310100](https://www.sqlite.org/2020/sqlite-amalgamation-3310100.zip)

## Usage

The entry point to the library is the only difference between `sql-wasm` and `SQL.js`. The library is loaded asynchronously by downloading the `.wasm` file from the network (Web) or filesystem (NodeJS).

```js
import createSqlWasm from "node-sql-wasm";

(async () => {

    const {Database, Statement} = await createSqlWasm();
    const db = new Database();

    // From here on, the SQL.js API can be used...

})();
```

## SQL.js usage examples:

```js
// Create a database
var db = new Database({dbfile: "my-sample.db"});

// Without arguments the db will be in memory and unless exported it will
// be lost when the node process ends. You can also use new sql.Database({data: ...}) where
// data is an Uint8Array representing an SQLite database if you want to manage read/write yourself.

// Execute some sql
sqlstr = "CREATE TABLE hello (a int, b char);";
sqlstr += "INSERT INTO hello VALUES (0, 'hello');"
sqlstr += "INSERT INTO hello VALUES (1, 'world');"
db.run(sqlstr); // Run the query without returning anything

let res = db.exec("SELECT * FROM hello");
/*
[
	{columns:['a','b'], values:[[0,'hello'],[1,'world']]}
]
*/

// Prepare an sql statement
let stmt = db.prepare("SELECT * FROM hello WHERE a=:aval AND b=:bval");

// Bind values to the parameters and fetch the results of the query
let result = stmt.getAsObject({':aval' : 1, ':bval' : 'world'});
console.log(result); // Will print {a:1, b:'world'}

// Bind other values
stmt.bind([0, 'hello']);
while (stmt.step()) console.log(stmt.get()); // Will print [0, 'hello']

// You can also use javascript functions inside your SQL code
// Create the js function you need
function add(a, b) {return a+b;}
// Specifies the SQL function's name, the number of it's arguments, and the js function to use
db.create_function("add_js", add);
// Run a query in which the function is used
db.run("INSERT INTO hello VALUES (add_js(7, 3), add_js('Hello ', 'world'));"); // Inserts 10 and 'Hello world'

// free the memory used by the statement
stmt.free();
// You can not use your statement anymore once it has been freed.
// But not freeing your statements causes memory leaks. You don't want that.

// Export the database to an Uint8Array containing the SQLite database file
let binaryArray = db.export();

db.close() 
// Would free your statements for you, if you pass true it will also delete the dbfile
```

## Web?

Web Worker and Browser functionality has been omitted from this implementation,
this is meant to be used in NODE.JS only.

## Development

You'll need to install the [Emscripten SDK](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html) to make any modifications to this package.

This project uses Babel & Rollup. You can build all by using the `build` command:

```cmd
npm run build
```

**Remember** to ```source emsdk/emsdk_env.sh```

To compile the SQLite WebAssembly wrapper on it's own use:
```cmd
npm run llvm && npm run emcc
```
or, to just refresh the dist without rebuilding the slower llvm, use:
```cmd
npm run dist
```


## Tests

The unit tests here are a direct port from the unit tests in SQL.js to ensure the two libraries are compatible.
These tests are written using Jest and can be launched using the NPM command:

```cmd
npm test
```

**NOTE:** The tests are meant to be run after the build since they use the dist module.
