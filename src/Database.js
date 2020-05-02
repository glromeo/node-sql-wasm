import {SQLITE3_TEXT, SQLITE_BLOB, SQLITE_FLOAT, SQLITE_INTEGER, SQLITE_OK, SQLITE_UTF8} from "../out/sqlite3.h.js"

import sqlite3api from "./sqlite3-api.js";

export default function (runtime, {Statement}) {

    const {
        ALLOC_NORMAL,
        FS,
        NODEFS,
        HEAP8,
        _free,
        addFunction,
        allocate,
        allocateUTF8OnStack,
        getValue,
        removeFunction,
        setValue,
        stackAlloc,
        stackRestore,
        stackSave
    } = runtime;

    FS.mkdir('/working');
    FS.mount(NODEFS, { root: '.' }, '/working');

    const apiTemp = stackAlloc(4); // Declare toplevel variables register, used for temporary stack values
    const NULL = 0; // Null pointer

    const {
        sqlite3_exec,
        sqlite3_prepare_v2_sqlptr,
        sqlite3_prepare_v2,
        sqlite3_open,
        sqlite3_close_v2,
        sqlite3_errmsg,
        sqlite3_changes,
        sqlite3_value_bytes,
        sqlite3_value_blob,
        sqlite3_value_type,
        sqlite3_value_double,
        sqlite3_value_text,
        sqlite3_result_int,
        sqlite3_result_double,
        sqlite3_result_text,
        sqlite3_result_blob,
        sqlite3_result_error,
        sqlite3_result_null,
        sqlite3_create_function_v2,
        registerExtensionFunctions
    } = sqlite3api(runtime);

    /** @classdesc
     * Represents an SQLite database
     * @constructs Database
     * @memberof module:SqlJs
     * Open a new database either by creating a new one or opening an existing
     * one stored in the byte array passed in first argument
     * @param {number[]} data An array of bytes representing
     * an SQLite database file
     */
    return class Database {

        constructor({dbfile, data} = {}) {
            this.filename = dbfile ? `/working/${dbfile}` : `/dbfile_${(0xffffffff * Math.random()) >>> 0}`;
            if (dbfile) {
                console.log("sqlite database:", this.filename);
            }
            if (data != null) {
                FS.createDataFile("/", this.filename, data, true, true);
            }
            this.handleError(sqlite3_open(this.filename, apiTemp));
            this.db = getValue(apiTemp, "i32");
            registerExtensionFunctions(this.db);
            // A list of all prepared statements of the database
            this.statements = {};
            // A list of all user function of the database
            // (created by create_function call)
            this.functions = {};
        }

        /** Execute an SQL query, ignoring the rows it returns.
         @param {string} sql a string containing some SQL text to execute
         @param {Statement.BindParams} [params] When the SQL statement contains
         placeholders, you can pass them in here. They will be bound to the statement
         before it is executed. If you use the params argument, you **cannot**
         provide an sql string that contains several statements (separated by `;`)

         @example
         // Insert values in a table
         db.run("INSERT INTO test VALUES (:age, :name)", { ':age' : 18, ':name' : 'John' });

         @return {Database} The database object (useful for method chaining)
         */
        run(sql, params) {
            if (!this.db) {
                throw "Database closed";
            }
            if (params) {
                const stmt = this["prepare"](sql, params);
                try {
                    stmt["step"]();
                } finally {
                    stmt["free"]();
                }
            } else {
                this.handleError(sqlite3_exec(this.db, sql, 0, 0, apiTemp));
            }
            return this;
        };

        /**
         * @typedef {{columns:string[], values:Database.SqlValue[][]}} Database.QueryExecResult
         * @property {string[]} columns the name of the columns of the result
         * (as returned by {@link Statement.getColumnNames})
         * @property {Database.SqlValue[][]} values one array per row, containing
         * the column values
         */

        /** Execute an SQL query, and returns the result.
         *
         * This is a wrapper against
         * {@link Database.prepare},
         * {@link Statement.bind},
         * {@link Statement.step},
         * {@link Statement.get},
         * and {@link Statement.free}.
         *
         * The result is an array of result elements. There are as many result
         * elements as the number of statements in your sql string (statements are
         * separated by a semicolon)
         *
         * ## Example use
         * We will create the following table, named *test* and query it with a
         * multi-line statement using params:
         *
         * | id | age |  name  |
         * |:--:|:---:|:------:|
         * | 1  |  1  | Ling   |
         * | 2  |  18 | Paul   |
         *
         * We query it like that:
         * ```javascript
         * const db = new SQL.Database();
         * const res = db.exec(
         *     "DROP TABLE IF EXISTS test;\n"
         *     + "CREATE TABLE test (id INTEGER, age INTEGER, name TEXT);"
         *     + "INSERT INTO test VALUES ($id1, :age1, @name1);"
         *     + "INSERT INTO test VALUES ($id2, :age2, @name2);"
         *     + "SELECT id FROM test;"
         *     + "SELECT age,name FROM test WHERE id=$id1",
         *     {
         *         "$id1": 1, ":age1": 1, "@name1": "Ling",
         *         "$id2": 2, ":age2": 18, "@name2": "Paul"
         *     }
         * );
         * ```
         *
         * `res` is now :
         * ```javascript
         *     [
         *         {"columns":["id"],"values":[[1],[2]]},
         *         {"columns":["age","name"],"values":[[1,"Ling"]]}
         *     ]
         * ```
         *
         @param {string} sql a string containing some SQL text to execute
         @param {Statement.BindParams} [params] When the SQL statement contains
         placeholders, you can pass them in here. They will be bound to the statement
         before it is executed. If you use the params argument as an array,
         you **cannot** provide an sql string that contains several statements
         (separated by `;`). This limitation does not apply to params as an object.
         * @return {Database.QueryExecResult[]} The results of each statement
         */
        exec(sql, params) {
            if (!this.db) {
                throw "Database closed";
            }
            const stack = stackSave();
            let stmt;
            try {
                let nextSqlPtr = allocateUTF8OnStack(sql);
                const pzTail = stackAlloc(4);
                const results = [];
                while (getValue(nextSqlPtr, "i8") !== NULL) {
                    setValue(apiTemp, 0, "i32");
                    setValue(pzTail, 0, "i32");
                    this.handleError(sqlite3_prepare_v2_sqlptr(
                        this.db,
                        nextSqlPtr,
                        -1,
                        apiTemp,
                        pzTail
                    ));
                    // pointer to a statement, or null
                    const pStmt = getValue(apiTemp, "i32");
                    nextSqlPtr = getValue(pzTail, "i32");
                    // Empty statement
                    if (pStmt !== NULL) {
                        stmt = new Statement(pStmt, this);
                        let curresult = null;
                        if (params != null) {
                            stmt.bind(params);
                        }
                        while (stmt["step"]()) {
                            if (curresult === null) {
                                curresult = {
                                    columns: stmt["getColumnNames"](),
                                    values: [],
                                };
                                results.push(curresult);
                            }
                            curresult["values"].push(stmt["get"]());
                        }
                        stmt["free"]();
                    }
                }
                return results;
            } catch (errCaught) {
                if (stmt) {
                    stmt["free"]();
                }
                throw errCaught;
            } finally {
                stackRestore(stack);
            }
        };

        /** Execute an sql statement, and call a callback for each row of result.

         Currently this method is synchronous, it will not return until the callback
         has been called on every row of the result. But this might change.

         @param {string} sql A string of SQL text. Can contain placeholders
         that will be bound to the parameters given as the second argument
         @param {Statement.BindParams} [params=[]] Parameters to bind to the query
         @param {function(Object<string, Database.SqlValue>):void} callback
         Function to call on each row of result
         @param {function():void} done A function that will be called when all rows have been retrieved

         @return {Database} The database object. Useful for method chaining

         @example <caption>Read values from a table</caption>
         db.each("SELECT name,age FROM users WHERE age >= $majority", {$majority:18},
         function (row){console.log(row.name + " is a grown-up.")}
         );
         */
        each(sql, params, callback, done) {
            if (typeof params === "function") {
                done = callback;
                callback = params;
                params = undefined;
            }
            const stmt = this["prepare"](sql, params);
            try {
                while (stmt["step"]()) {
                    callback(stmt["getAsObject"]());
                }
            } finally {
                stmt["free"]();
            }
            if (typeof done === "function") {
                return done();
            }
            return undefined;
        };

        /** Prepare an SQL statement
         @param {string} sql a string of SQL, that can contain placeholders
         (`?`, `:VVV`, `:AAA`, `@AAA`)
         @param {Statement.BindParams} [params] values to bind to placeholders
         @return {Statement} the resulting statement
         @throws {String} SQLite error
         */
        prepare(sql, params) {
            setValue(apiTemp, 0, "i32");
            this.handleError(sqlite3_prepare_v2(this.db, sql, -1, apiTemp, NULL));
            // pointer to a statement, or null
            const pStmt = getValue(apiTemp, "i32");
            if (pStmt === NULL) {
                throw "Nothing to prepare";
            }
            const stmt = new Statement(pStmt, this);
            if (params != null) {
                stmt.bind(params);
            }
            this.statements[pStmt] = stmt;
            return stmt;
        };

        /** Exports the contents of the database to a binary array
         @return {Uint8Array} An array of bytes of the SQLite3 database file
         */
        export() {
            Object.values(this.statements).forEach(function each(stmt) {
                stmt["free"]();
            });
            Object.values(this.functions).forEach(removeFunction);
            this.functions = {};
            this.handleError(sqlite3_close_v2(this.db));
            const binaryDb = FS.readFile(this.filename, {encoding: "binary"});
            this.handleError(sqlite3_open(this.filename, apiTemp));
            this.db = getValue(apiTemp, "i32");
            return binaryDb;
        };

        /** Close the database, and all associated prepared statements.
         * The memory associated to the database and all associated statements
         * will be freed.
         *
         * **Warning**: A statement belonging to a database that has been closed cannot
         * be used anymore.
         *
         * Databases **must** be closed when you're finished with them, or the
         * memory consumption will grow forever
         */
        close(unlink = true) {
            // do nothing if db is null or already closed
            if (this.db === null) {
                return;
            }
            Object.values(this.statements).forEach(function each(stmt) {
                stmt["free"]();
            });
            Object.values(this.functions).forEach(removeFunction);
            this.functions = {};
            this.handleError(sqlite3_close_v2(this.db));
            if (unlink) {
                FS.unlink(this.filename);
            }
            this.db = null;
        };

        /** Analyze a result code, return null if no error occured, and throw
         an error with a descriptive message otherwise
         @nodoc
         */
        handleError(returnCode) {
            if (returnCode === SQLITE_OK) {
                return null;
            }
            const errmsg = sqlite3_errmsg(this.db);
            throw new Error(errmsg);
        };

        /** Returns the number of changed rows (modified, inserted or deleted) by the
         latest completed INSERT, UPDATE or DELETE statement on the
         database. Executing any other type of SQL statement does not modify
         the value returned by this function.

         @return {number} the number of rows modified
         */
        getRowsModified() {
            return sqlite3_changes(this.db);
        };

        /** Register a custom function with SQLite
         @example Register a simple function
         db.create_function("addOne", function (x) {return x+1;})
         db.exec("SELECT addOne(1)") // = 2

         @param {string} name the name of the function as referenced in SQL statements.
         @param {function} func the actual function to be executed.
         @return {Database} The database object. Useful for method chaining
         */
        create_function(name, func) {

            function wrapped_func(cx, argc, argv) {

                function extract_blob(ptr) {
                    const size = sqlite3_value_bytes(ptr);
                    const blob_ptr = sqlite3_value_blob(ptr);
                    const blob_arg = new Uint8Array(size);
                    for (let j = 0; j < size; j += 1) blob_arg[j] = HEAP8[blob_ptr + j];
                    return blob_arg;
                }

                const args = [];
                for (let i = 0; i < argc; i += 1) {
                    const value_ptr = getValue(argv + (4 * i), "i32");
                    const value_type = sqlite3_value_type(value_ptr);
                    let arg;
                    if (value_type === SQLITE_INTEGER || value_type === SQLITE_FLOAT) {
                        arg = sqlite3_value_double(value_ptr);
                    } else if (value_type === SQLITE3_TEXT) {
                        arg = sqlite3_value_text(value_ptr);
                    } else if (value_type === SQLITE_BLOB) {
                        arg = extract_blob(value_ptr);
                    } else arg = null;
                    args.push(arg);
                }

                try {
                    const result = func.apply(null, args);
                    switch (typeof result) {
                        case "boolean":
                            sqlite3_result_int(cx, result ? 1 : 0);
                            break;
                        case "number":
                            sqlite3_result_double(cx, result);
                            break;
                        case "string":
                            sqlite3_result_text(cx, result, -1, -1);
                            break;
                        case "object":
                            if (result === null) {
                                sqlite3_result_null(cx);
                            } else if (result.length != null) {
                                const blobptr = allocate(result, "i8", ALLOC_NORMAL);
                                sqlite3_result_blob(cx, blobptr, result.length, -1);
                                _free(blobptr);
                            } else {
                                sqlite3_result_error(cx, (
                                    "Wrong API use : tried to return a value "
                                    + "of an unknown type (" + result + ")."
                                ), -1);
                            }
                            break;
                        default:
                            sqlite3_result_null(cx);
                    }
                } catch (error) {
                    sqlite3_result_error(cx, error, -1);
                }
            }

            if (Object.prototype.hasOwnProperty.call(this.functions, name)) {
                removeFunction(this.functions[name]);
                delete this.functions[name];
            }
            // The signature of the wrapped function is :
            // void wrapped(sqlite3_context *db, int argc, sqlite3_value **argv)
            const func_ptr = addFunction(wrapped_func, "viii");
            this.functions[name] = func_ptr;
            this.handleError(sqlite3_create_function_v2(
                this.db,
                name,
                func.length,
                SQLITE_UTF8,
                0,
                func_ptr,
                0,
                0,
                0
            ));
            return this;
        };
    }
}
