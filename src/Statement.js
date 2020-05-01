import {
    SQLITE_BLOB,
    SQLITE_DONE,
    SQLITE_FLOAT,
    SQLITE_INTEGER,
    SQLITE_OK,
    SQLITE_ROW,
    SQLITE3_TEXT
} from "../out/sqlite3.h.js"

import sqlite3api from "./sqlite3-api.js";

export default function (runtime) {

    const NULL = 0; // Null pointer

    const {
        ALLOC_NORMAL,
        HEAP8,
        _free,
        allocate,
        intArrayFromString,
    } = runtime;

    const {
        sqlite3_step,
        sqlite3_column_double,
        sqlite3_column_text,
        sqlite3_column_bytes,
        sqlite3_column_blob,
        sqlite3_column_type,
        sqlite3_data_count,
        sqlite3_column_name,
        sqlite3_bind_text,
        sqlite3_bind_int,
        sqlite3_bind_double,
        sqlite3_bind_blob,
        sqlite3_bind_parameter_index,
        sqlite3_clear_bindings,
        sqlite3_reset,
        sqlite3_finalize
    } = sqlite3api(runtime);

    /**
     * @classdesc
     * Represents a prepared statement.
     * Prepared statements allow you to have a template sql string,
     * that you can execute multiple times with different parameters.
     *
     * You can't instantiate this class directly, you have to use a
     * {@link Database} object in order to create a statement.
     *
     * **Warning**: When you close a database (using db.close()),
     * all its statements are closed too and become unusable.
     *
     * Statements can't be created by the API user directly, only by
     * Database::prepare
     *
     * @see Database.html#prepare-dynamic
     * @see https://en.wikipedia.org/wiki/Prepared_statement
     */
    return class Statement {

        /**
         * Statements can't be created by the API user, only by Database::prepare
         * @private
         * @param {number} stmt1 The SQLite statement reference
         * @param {Database} db The database from which this statement was created
         */
        constructor(stmt1, db) {
            this.stmt = stmt1;
            this.db = db;
            // Index of the leftmost parameter is 1
            this.pos = 1;
            // Pointers to allocated memory, that need to be freed
            // when the statemend is destroyed
            this.allocatedmem = [];
        }

        /** @typedef {string|number|null|Uint8Array} Database.SqlValue */

        /** @typedef {Database.SqlValue[]|Object<string, Database.SqlValue>|null} Statement.BindParams
         */

        /** Bind values to the parameters, after having reseted the statement.
         * If values is null, do nothing and return true.
         *
         * SQL statements can have parameters, named *'?', '?NNN', ':VVV', '@VVV', '$VVV'*,
         * where NNN is a number and VVV a string.
         * This function binds these parameters to the given values.
         *
         * *Warning*: ':', '@', and '$' are included in the parameters names
         *
         * ## Value types
         * Javascript type  | SQLite type
         * -----------------| -----------
         * number           | REAL, INTEGER
         * boolean          | INTEGER
         * string           | TEXT
         * Array, Uint8Array| BLOB
         * null             | NULL
         *
         * @example <caption>Bind values to named parameters</caption>
         *     const stmt = db.prepare(
         *         "UPDATE test SET a=@newval WHERE id BETWEEN $mini AND $maxi"
         *     );
         *     stmt.bind({$mini:10, $maxi:20, '@newval':5});
         *
         * @example <caption>Bind values to anonymous parameters</caption>
         * // Create a statement that contains parameters like '?', '?NNN'
         * const stmt = db.prepare("UPDATE test SET a=? WHERE id BETWEEN ? AND ?");
         * // Call Statement.bind with an array as parameter
         * stmt.bind([5, 10, 20]);
         *
         * @see http://www.sqlite.org/datatype3.html
         * @see http://www.sqlite.org/lang_expr.html#varparam

         * @param {Statement.BindParams} values The values to bind
         * @return {boolean} true if it worked
         * @throws {String} SQLite Error
         */
        bind(values) {
            if (!this.stmt) {
                throw "Statement closed";
            }
            this["reset"]();
            if (Array.isArray(values)) return this.bindFromArray(values);
            if (values != null && typeof values === "object") return this.bindFromObject(values);
            return true;
        }

        /** Execute the statement, fetching the the next line of result,
         that can be retrieved with {@link Statement.get}.

         @return {boolean} true if a row of result available
         @throws {String} SQLite Error
         */
        step() {
            if (!this.stmt) {
                throw "Statement closed";
            }
            this.pos = 1;
            const ret = sqlite3_step(this.stmt);
            switch (ret) {
                case SQLITE_ROW:
                    return true;
                case SQLITE_DONE:
                    return false;
                default:
                    throw this.db.handleError(ret);
            }
        }

        /*
        Internal methods to retrieve data from the results of a statement
        that has been executed
         */
        getNumber(pos) {
            if (pos == null) {
                pos = this.pos++;
            }
            return sqlite3_column_double(this.stmt, pos);
        }

        getString(pos) {
            if (pos == null) {
                pos = this.pos++;
            }
            return sqlite3_column_text(this.stmt, pos);
        }

        getBlob(pos) {
            if (pos == null) {
                pos = this.pos++;
            }
            const size = sqlite3_column_bytes(this.stmt, pos);
            const ptr = sqlite3_column_blob(this.stmt, pos);
            const result = new Uint8Array(size);
            let i = 0;
            while (i < size) {
                result[i] = HEAP8[ptr + i];
                i += 1;
            }
            return result;
        }

        /** Get one row of results of a statement.
         If the first parameter is not provided, step must have been called before.
         @param {Statement.BindParams} [params] If set, the values will be bound
         to the statement before it is executed
         @return {Database.SqlValue[]} One row of result

         @example <caption>Print all the rows of the table test to the console</caption>
         const stmt = db.prepare("SELECT * FROM test");
         while (stmt.step()) console.log(stmt.get());
         */
        get(params) {
            if (params != null && this["bind"](params)) {
                this["step"]();
            }
            const results1 = [];
            const ref = sqlite3_data_count(this.stmt);
            let field = 0;
            while (field < ref) {
                switch (sqlite3_column_type(this.stmt, field)) {
                    case SQLITE_INTEGER:
                    case SQLITE_FLOAT:
                        results1.push(this.getNumber(field));
                        break;
                    case SQLITE3_TEXT:
                        results1.push(this.getString(field));
                        break;
                    case SQLITE_BLOB:
                        results1.push(this.getBlob(field));
                        break;
                    default:
                        results1.push(null);
                }
                field += 1;
            }
            return results1;
        }

        /** Get the list of column names of a row of result of a statement.
         @return {string[]} The names of the columns
         @example
         const stmt = db.prepare("SELECT 5 AS nbr, x'616200' AS data, NULL AS null_value;");
         stmt.step(); // Execute the statement
         console.log(stmt.getColumnNames());
         // Will print ['nbr','data','null_value']
         */
        getColumnNames() {
            const results1 = [];
            const ref = sqlite3_data_count(this.stmt);
            let i = 0;
            while (i < ref) {
                results1.push(sqlite3_column_name(this.stmt, i));
                i += 1;
            }
            return results1;
        }

        /** Get one row of result as a javascript object, associating column names
         with their value in the current row.
         @param {Statement.BindParams} [params] If set, the values will be bound
         to the statement, and it will be executed
         @return {Object<string, Database.SqlValue>} The row of result
         @see {@link Statement.get}

         @example

         const stmt = db.prepare("SELECT 5 AS nbr;
         const x'616200' AS data;
         const NULL AS null_value;");
         stmt.step(); // Execute the statement
         console.log(stmt.getAsObject());
         // Will print {nbr:5, data: Uint8Array([1,2,3]), null_value:null}
         */
        getAsObject(params) {
            const values = this["get"](params);
            const names = this["getColumnNames"]();
            const rowObject = {};
            const len = names.length;
            let i = 0;
            while (i < len) {
                const name = names[i];
                rowObject[name] = values[i];
                i += 1;
            }
            return rowObject;
        }

        /** Shorthand for bind + step + reset
         Bind the values, execute the statement, ignoring the rows it returns,
         and resets it
         @param {Statement.BindParams} [values] Value to bind to the statement
         */
        run(values) {
            if (values != null) {
                this["bind"](values);
            }
            this["step"]();
            return this["reset"]();
        }

        bindString(string, pos) {
            if (pos == null) {
                pos = this.pos;
                this.pos += 1;
            }
            const bytes = intArrayFromString(string);
            const strptr = allocate(bytes, "i8", ALLOC_NORMAL);
            this.allocatedmem.push(strptr);
            this.db.handleError(sqlite3_bind_text(
                this.stmt,
                pos,
                strptr,
                bytes.length - 1,
                0
            ));
            return true;
        }

        bindBlob(array, pos) {
            if (pos == null) {
                pos = this.pos;
                this.pos += 1;
            }
            const blobptr = allocate(array, "i8", ALLOC_NORMAL);
            this.allocatedmem.push(blobptr);
            this.db.handleError(sqlite3_bind_blob(
                this.stmt,
                pos,
                blobptr,
                array.length,
                0
            ));
            return true;
        }

        bindNumber(num, pos) {
            if (pos == null) {
                pos = this.pos;
                this.pos += 1;
            }
            const bindfunc = (
                num === (num | 0)
                    ? sqlite3_bind_int
                    : sqlite3_bind_double
            );
            this.db.handleError(bindfunc(this.stmt, pos, num));
            return true;
        }

        bindNull(pos) {
            if (pos == null) {
                pos = this.pos;
                this.pos += 1;
            }
            return sqlite3_bind_blob(this.stmt, pos, 0, 0, 0) === SQLITE_OK;
        }

        bindValue(val, pos) {
            if (pos == null) {
                pos = this.pos;
                this.pos += 1;
            }
            switch (typeof val) {
                case "string":
                    return this.bindString(val, pos);
                case "number":
                case "boolean":
                    return this.bindNumber(val + 0, pos);
                case "object":
                    if (val === null) {
                        return this.bindNull(pos);
                    }
                    if (val.length != null) {
                        return this.bindBlob(val, pos);
                    }
                    break;
                default:
                    break;
            }
            throw (
                "Wrong API use : tried to bind a value of an unknown type ("
                + val + ")."
            );
        }

        /** Bind names and values of an object to the named parameters of the
         statement
         @param {Object<string, Database.SqlValue>} valuesObj
         @private
         @nodoc
         */
        bindFromObject(valuesObj) {
            const that = this;
            Object.keys(valuesObj).forEach(function each(name) {
                const num = sqlite3_bind_parameter_index(that.stmt, name);
                if (num !== 0) {
                    that.bindValue(valuesObj[name], num);
                }
            });
            return true;
        }

        /** Bind values to numbered parameters
         @param {Database.SqlValue[]} values
         @private
         @nodoc
         */
        bindFromArray(values) {
            let num = 0;
            while (num < values.length) {
                this.bindValue(values[num], num + 1);
                num += 1;
            }
            return true;
        }

        /** Reset a statement, so that it's parameters can be bound to new values
         It also clears all previous bindings, freeing the memory used
         by bound parameters.
         */
        reset() {
            this.freemem();
            return (
                sqlite3_clear_bindings(this.stmt) === SQLITE_OK
                && sqlite3_reset(this.stmt) === SQLITE_OK
            );
        }

        /** Free the memory allocated during parameter binding */
        freemem() {
            let mem;
            while ((mem = this.allocatedmem.pop()) !== undefined) {
                _free(mem);
            }
        }

        /** Free the memory used by the statement
         @return {boolean} true in case of success
         */
        free() {
            this.freemem();
            const res = sqlite3_finalize(this.stmt) === SQLITE_OK;
            delete this.db.statements[this.stmt];
            this.stmt = NULL;
            return res;
        }
    }
}
