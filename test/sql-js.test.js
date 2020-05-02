const assert = require('assert').strict;
const createSqlWasm = require("../dist/cjs/node-sql-wasm.js");

describe("sql.js tests", function () {

    let sql;

    beforeAll(async function () {
        try {
            sql = await createSqlWasm();
        } catch (e) {
            console.error(e);
        }
    });


    it("test_blob", async function () {
        var db = new sql.Database({dbfile: "test_blob.db"});
        db.exec("CREATE TABLE test (data); INSERT INTO test VALUES (x'6162ff'),(x'00')"); // Insert binary data. This is invalid UTF8 on purpose

        var stmt = db.prepare("INSERT INTO test VALUES (?)");
        var bigArray = new Uint8Array(1e6);
        bigArray[500] = 0x42
        stmt.run([bigArray]);

        var stmt = db.prepare("SELECT * FROM test ORDER BY length(data) DESC");

        stmt.step();
        var array = stmt.get()[0];
        assert.equal(array.length, bigArray.length, "BLOB read from the database should be the same size as the one that was inserted");
        for (var i = 0; i < array.length; i++) {
            // Avoid doing 1e6 assert, to not pollute the console
            if (array[i] !== bigArray[i])
                assert.fail(array[i], bigArray[i], "The blob stored in the database should be exactly the same as the one that was inserted");
        }

        stmt.step();
        var res = stmt.get();
        assert.deepEqual(res, [new Uint8Array([0x61, 0x62, 0xff])], "Reading BLOB");

        stmt.step();
        var res = stmt.get();
        assert.deepEqual(res, [new Uint8Array([0x00])], "Reading BLOB with a null byte");

        assert.strictEqual(stmt.step(), false, "stmt.step() should return false after all values were read");
        db.close(true);
    });

    it("test_database", async function () {
        assert.notEqual(sql.Database, undefined, "Should export a Database object");

        // Create a database
        var db = new sql.Database();
        assert.equal(Object.getPrototypeOf(db), sql.Database.prototype, "Creating a database object");

        // Execute some sql
        sqlstr = "CREATE TABLE test (a, b, c, d, e);";
        var res = db.exec(sqlstr);
        assert.deepEqual(res, [], "Creating a table should not return anything");

        db.run("INSERT INTO test VALUES (NULL, 42, 4.2, 'fourty two', x'42');");

        //Retrieving values
        sqlstr = "SELECT * FROM test;";
        var res = db.exec(sqlstr);
        var expectedResult = [{
            columns: ['a', 'b', 'c', 'd', 'e'],
            values: [
                [null, 42, 4.2, 'fourty two', new Uint8Array([0x42])]
            ]
        }];
        assert.deepEqual(res, expectedResult, "db.exec() return value");


        // Export the database to an Uint8Array containing the SQLite database file
        var binaryArray = db.export();
        assert.strictEqual(String.fromCharCode.apply(null, binaryArray.subarray(0, 6)), 'SQLite',
            "The first 6 bytes of an SQLite database should form the word 'SQLite'");
        db.close();

        var db2 = new sql.Database({data: binaryArray});
        result = db2.exec("SELECT * FROM test");
        assert.deepEqual(result, expectedResult,
            "Exporting and re-importing the database should lead to the same database");
        db2.close();

        db = new sql.Database();
        assert.deepEqual(db.exec("SELECT * FROM sqlite_master"),
            [],
            "Newly created databases should be empty");
        // Testing db.each
        db.run("CREATE TABLE test (a,b); INSERT INTO test VALUES (1,'a'),(2,'b')");
        var count = 0, finished = false;

        return new Promise(done => {

            db.each("SELECT * FROM test ORDER BY a", function callback(row) {
                count++;
                if (count === 1) assert.deepEqual(row, {a: 1, b: 'a'}, 'db.each returns the correct 1st row');
                if (count === 2) assert.deepEqual(row, {a: 2, b: 'b'}, 'db.each returns the correct 2nd row');
            }, function last() {
                finished = true;
                assert.strictEqual(count, 2, "db.each returns the right number of rows");
                // No need to wait for this timeout anymore
                // In fact, if we do keep waiting for this, we'll get an error when it fires because we've already called done
                clearTimeout(testTimeoutId);
                done();
            });
            var testTimeoutId = setTimeout(function timeout() {
                if (!finished) {
                    assert.fail("db.each should call its last callback after having returned the rows");
                    done();
                }
            }, 3000);


        })
    });

    it("test_errors", async function () {

        assert.throws(function () {
                var db = new sql.Database({data: [1, 2, 3]});
                db.exec("SELECT * FROM sqlite_master");
            },
            /not a database/,
            "Querying an invalid database should throw an error"
        );

        // Create a database
        var db = new sql.Database();

        // Execute some sql
        var res = db.exec("CREATE TABLE test (a INTEGER PRIMARY KEY, b, c, d, e);");

        assert.throws(function () {
                db.exec("I ain't be no valid sql ...");
            },
            /syntax error/,
            "Executing invalid SQL should throw an error");

        assert.throws(function () {
                db.run("INSERT INTO test (a) VALUES (1)");
                db.run("INSERT INTO test (a) VALUES (1)");
            },
            /UNIQUE constraint failed/,
            "Inserting two rows with the same primary key should fail");

        var stmt = db.prepare("INSERT INTO test (a) VALUES (?)");


        assert.throws(function () {
                stmt.bind([1, 2, 3]);
            },
            /out of range/,
            "Binding too many parameters should throw an exception");

        assert.throws(function () {
                db.run("CREATE TABLE test (this,wont,work)");
            },
            /table .+ already exists/,
            "Trying to create a table with a name that is already used should throw an error");

        stmt.run([2]);
        assert.deepEqual(db.exec("SELECT a,b FROM test WHERE a=2"),
            [{columns: ['a', 'b'], values: [[2, null]]}],
            "Previous errors should not have spoiled the statement");

        db.close();

        assert.throws(function () {
            stmt.run([3]);
        }, "Statements shouldn't be able to execute after the database is closed");
    });

    it("test_extension_functions", async function () {
        var db = new sql.Database();
        var res = db.exec("CREATE TABLE test (str_data, data);");

        db.run("INSERT INTO test VALUES ('Hello World!', 1);");
        db.run("INSERT INTO test VALUES ('', 2);");
        db.run("INSERT INTO test VALUES ('', 2);");
        db.run("INSERT INTO test VALUES ('', 4);");
        db.run("INSERT INTO test VALUES ('', 5);");
        db.run("INSERT INTO test VALUES ('', 6);");
        db.run("INSERT INTO test VALUES ('', 7);");
        db.run("INSERT INTO test VALUES ('', 8);");
        db.run("INSERT INTO test VALUES ('', 9);");

        var res = db.exec("SELECT mode(data) FROM test;");
        var expectedResult = [{
            columns: ['mode(data)'],
            values: [
                [2]
            ]
        }];
        assert.deepEqual(res, expectedResult, "mode() function works");

        var res = db.exec("SELECT lower_quartile(data) FROM test;");
        var expectedResult = [{
            columns: ['lower_quartile(data)'],
            values: [
                [2]
            ]
        }];
        assert.deepEqual(res, expectedResult, "upper_quartile() function works");

        var res = db.exec("SELECT upper_quartile(data) FROM test;");
        var expectedResult = [{
            columns: ['upper_quartile(data)'],
            values: [
                [7]
            ]
        }];
        assert.deepEqual(res, expectedResult, "upper_quartile() function works");

        var res = db.exec("SELECT variance(data) FROM test;");
        assert.equal(res[0]['values'][0][0].toFixed(2), "8.11", "variance() function works");

        var res = db.exec("SELECT stdev(data) FROM test;");
        assert.equal(res[0]['values'][0][0].toFixed(2), "2.85", "stdev() function works");

        var res = db.exec("SELECT acos(data) FROM test;");
        assert.equal(res[0]['values'][0][0].toFixed(2), "0.00", "acos() function works");

        var res = db.exec("SELECT asin(data) FROM test;");
        assert.equal(res[0]['values'][0][0].toFixed(2), "1.57", "asin() function works");

        var res = db.exec("SELECT atan2(data, 1) FROM test;");
        assert.equal(res[0]['values'][0][0].toFixed(2), "0.79", "atan2() function works");

        var res = db.exec("SELECT difference(str_data, 'ello World!') FROM test;");
        assert.equal(res[0]['values'][0][0], 3, "difference() function works");

        var res = db.exec("SELECT ceil(4.1)");
        assert.equal(res[0]['values'][0][0], 5, "ceil() function works");

        var res = db.exec("SELECT floor(4.1)");
        assert.equal(res[0]['values'][0][0], 4, "floor() function works");

        var res = db.exec("SELECT pi()");
        assert.equal(res[0]['values'][0][0].toFixed(5), "3.14159", "pi() function works");

        var res = db.exec("SELECT reverse(str_data) FROM test;");
        assert.equal(res[0]['values'][0][0], "!dlroW olleH", "reverse() function works");

    });

    it("test_functions", async function () {
        var db = new sql.Database();
        db.exec("CREATE TABLE test (data); INSERT INTO test VALUES ('Hello World');");

        // Simple function, appends extra text on a string.
        function test_function(string_arg) {
            return "Function called with: " + string_arg;
        };

        // Register with SQLite.
        db.create_function("TestFunction", test_function);

        // Use in a query, check expected result.
        var result = db.exec("SELECT TestFunction(data) FROM test;");
        var result_str = result[0]["values"][0][0];
        assert.equal(result_str, "Function called with: Hello World", "Named functions can be registered");

        // 2 arg function, adds two ints together.
        db.exec("CREATE TABLE test2 (int1, int2); INSERT INTO test2 VALUES (456, 789);");

        function test_add(int1, int2) {
            return int1 + int2;
        };

        db.create_function("TestAdd", test_add);
        result = db.exec("SELECT TestAdd(int1, int2) FROM test2;");
        result_int = result[0]["values"][0][0];
        assert.equal(result_int, 1245, "Multiple argument functions can be registered");

        // Binary data function, tests which byte in a column is set to 0
        db.exec("CREATE TABLE test3 (data); INSERT INTO test3 VALUES (x'6100ff'), (x'ffffff00ffff');");

        function test_zero_byte_index(data) {
            // Data is a Uint8Array
            for (var i = 0; i < data.length; i++) {
                if (data[i] === 0) {
                    return i;
                }
            }
            return -1;
        };

        db.create_function("TestZeroByteIndex", test_zero_byte_index);
        result = db.exec("SELECT TestZeroByteIndex(data) FROM test3;");
        result_int0 = result[0]["values"][0][0];
        result_int1 = result[0]["values"][1][0];
        assert.equal(result_int0, 1, "Binary data works inside functions");
        assert.equal(result_int1, 3, "Binary data works inside functions");

        db.create_function("addOne", function (x) {
            return x + 1;
        });
        result = db.exec("SELECT addOne(1);");
        assert.equal(result[0]["values"][0][0], 2, "Accepts anonymous functions");

        // Test api support of different sqlite types and special values
        db.create_function("identityFunction", function (x) {
            return x;
        });
        var verbose = false;

        function canHandle(testData) {
            let result = {};
            let ok = true;
            let sql_value = ("sql_value" in testData) ? testData.sql_value : ("" + testData.value);

            function simpleEqual(a, b) {
                return a === b;
            }

            let value_equal = ("equal" in testData) ? testData.equal : simpleEqual;
            db.create_function("CheckTestValue", function (x) {
                return value_equal(testData.value, x) ? 12345 : 5678;
            });
            db.create_function("GetTestValue", function () {
                return testData.value;
            });
            // Check sqlite to js value conversion
            result = db.exec("SELECT CheckTestValue(" + sql_value + ")==12345");
            if (result[0]["values"][0][0] != 1) {
                if (verbose)
                    assert.ok(false, "Can accept " + testData.info);
                ok = false;
            }
            // Check js to sqlite value conversion
            result = db.exec("SELECT GetTestValue()");
            if (!value_equal(result[0]["values"][0][0], testData.value)) {
                if (verbose)
                    assert.ok(false, "Can return " + testData.info);
                ok = false;
            }
            // Check sqlite to sqlite value conversion (identityFunction(x)==x)
            if (sql_value !== "null") {
                result = db.exec("SELECT identityFunction(" + sql_value + ")=" + sql_value);
            } else {
                result = db.exec("SELECT identityFunction(" + sql_value + ") is null");
            }
            if (result[0]["values"][0][0] != 1) {
                if (verbose)
                    assert.ok(false, "Can pass " + testData.info);
                ok = false;
            }
            return ok;
        }

        function numberEqual(a, b) {
            return (+a) === (+b);
        }

        function blobEqual(a, b) {
            if (((typeof a) != "object") || (!a) || ((typeof b) != "object") || (!b)) return false;
            if (a.byteLength !== b.byteLength) return false;
            return a.every((val, i) => val === b[i]);
        }

        [
            {info: "null", value: null}, // sqlite special value null
            {info: "false", value: false, sql_value: "0", equal: numberEqual}, // sqlite special value (==false)
            {info: "true", value: true, sql_value: "1", equal: numberEqual}, // sqlite special value (==true)
            {info: "integer 0", value: 0}, // sqlite special value (==false)
            {info: "integer 1", value: 1}, // sqlite special value (==true)
            {info: "integer -1", value: -1},
            {info: "long integer 5e+9", value: 5000000000}, // int64
            {info: "long integer -5e+9", value: -5000000000}, // negative int64
            {info: "double", value: 0.5},
            {info: "string", value: "Test", sql_value: "'Test'"},
            {info: "empty string", value: "", sql_value: "''"},
            {info: "unicode string", value: "\uC7B8", sql_value: "CAST(x'EC9EB8' AS TEXT)"}, // unicode-hex: C7B8 utf8-hex: EC9EB8
            {info: "blob", value: new Uint8Array([0xC7, 0xB8]), sql_value: "x'C7B8'", equal: blobEqual},
            {info: "empty blob", value: new Uint8Array([]), sql_value: "x''", equal: blobEqual}
        ].forEach(function (testData) {
            assert.ok(canHandle(testData), "Can handle " + testData.info);
        });

        db.create_function("throwFunction", function () {
            throw "internal exception";
            return 5;
        });
        assert.throws(function () {
            db.exec("SELECT throwFunction()");
        }, /internal exception/, "Can handle internal exceptions");

        db.create_function("customeObjectFunction", function () {
            return {test: 123};
        });
        assert.throws(function () {
            db.exec("SELECT customeObjectFunction()");
        }, /Wrong API use/, "Reports wrong API use");

        db.close();
    });

    it("test_functions_recreate", async function () {
        // Test 1: Create a database, Register single function, close database, repeat 1000 times

        for (var i = 1; i <= 1000; i++) {
            let lastStep = (i == 1000);
            let db = new sql.Database();

            function add() {
                return i;
            }

            try {
                db.create_function("TestFunction" + i, add)
            } catch (e) {
                assert.ok(false, "Test 1: Recreate database " + i + "th times and register function failed with exception:" + e);
                db.close();
                break;
            }
            var result = db.exec("SELECT TestFunction" + i + "()");
            var result_str = result[0]["values"][0][0];
            if ((result_str != i) || lastStep) {
                assert.equal(result_str, i, "Test 1: Recreate database " + i + "th times and register function");
                db.close();
                break;
            }
            db.close();
        }

        // Test 2: Create a database, Register same function  1000 times, close database
        {
            let db = new sql.Database();
            for (var i = 1; i <= 1000; i++) {
                let lastStep = (i == 1000);

                function add() {
                    return i;
                }

                try {
                    db.create_function("TestFunction", add);
                } catch (e) {
                    assert.ok(false, "Test 2: Reregister function " + i + "th times failed with exception:" + e);
                    break;
                }
                var result = db.exec("SELECT TestFunction()");
                var result_str = result[0]["values"][0][0];
                if ((result_str != i) || lastStep) {
                    assert.equal(result_str, i, "Test 2: Reregister function " + i + "th times");
                    break;
                }
            }
            db.close();
        }
    });

    it("test_issue55", async function () {
        var fs = require('fs');
        var path = require('path');

        //Works
        var db = new sql.Database({data:fs.readFileSync(path.join(__dirname, 'issue55.db'))});

        var origCount = db.prepare("SELECT COUNT(*) AS count FROM networklocation").getAsObject({}).count;

        db.run("INSERT INTO networklocation (x, y, network_id, floor_id) VALUES (?, ?, ?, ?)", [123, 123, 1, 1]);

        var count = db.prepare("SELECT COUNT(*) AS count FROM networklocation").getAsObject({}).count;

        assert.equal(count, origCount + 1, "The row has been inserted");
        var dbCopy = new sql.Database({data: db.export()});
        var newCount = dbCopy.prepare("SELECT COUNT(*) AS count FROM networklocation").getAsObject({}).count;
        assert.equal(newCount, count, "export and reimport copies all the data");
    });

    it("test_issue73", async function () {
        // Create a database
        var db = new sql.Database();

        // Execute some sql
        sqlstr = "CREATE TABLE COMPANY(" +
            "                     ID INT PRIMARY KEY     NOT NULL," +
            "                     NAME           TEXT    NOT NULL," +
            "                     AGE            INT     NOT NULL," +
            "                     ADDRESS        CHAR(50)," +
            "                     SALARY         REAL" +
            "                    );" +
            "                  CREATE TABLE AUDIT(" +
            "                      EMP_ID INT NOT NULL," +
            "                      ENTRY_DATE TEXT NOT NULL" +
            "                  );" +
            "                  CREATE TRIGGER audit_log AFTER INSERT" +
            "                  ON COMPANY" +
            "                  BEGIN" +
            "                     INSERT INTO AUDIT" +
            "                        (EMP_ID, ENTRY_DATE)" +
            "                      VALUES" +
            "                        (new.ID, '2014-11-10');" +
            "                  END;" +
            "                  INSERT INTO COMPANY VALUES (73,'A',8,'',1200);" +
            "                  SELECT * FROM AUDIT;" +
            "                  INSERT INTO COMPANY VALUES (42,'B',8,'',1600);" +
            "                  SELECT EMP_ID FROM AUDIT ORDER BY EMP_ID";
        var res = db.exec(sqlstr);
        var expectedResult = [
            {
                columns: ['EMP_ID', 'ENTRY_DATE'],
                values: [
                    [73, '2014-11-10']
                ]
            },
            {
                columns: ['EMP_ID'],
                values: [
                    [42], [73]
                ]
            }
        ];
        assert.deepEqual(res, expectedResult,
            "db.exec with a statement that contains a ';'");
    });

    it("test_issue76", async function () {
        // Create a database
        var db = new sql.Database();
        // Ultra-simple query
        var stmt = db.prepare("VALUES (?)");
        // Bind null to the parameter and get the result
        assert.deepEqual(stmt.get([null]), [null],
            "binding a null value to a statement parameter");
        db.close();
    });

    it("test_issue128", async function () {
        // Create a database
        var db = new sql.Database();

        db.run("CREATE TABLE test (data TEXT);");

        db.exec("SELECT * FROM test;");
        assert.deepEqual(db.getRowsModified(), 0, "getRowsModified returns 0 at first");

        db.exec("INSERT INTO test VALUES ('Hello1');");
        db.exec("INSERT INTO test VALUES ('Hello');");
        db.exec("INSERT INTO test VALUES ('Hello');");
        db.exec("INSERT INTO test VALUES ('World4');");
        assert.deepEqual(db.getRowsModified(), 1, "getRowsModified works for inserts");

        db.exec("UPDATE test SET data = 'World4' where data = 'Hello';");
        assert.deepEqual(db.getRowsModified(), 2, "getRowsModified works for updates");

        db.exec("DELETE FROM test;");
        assert.deepEqual(db.getRowsModified(), 4, "getRowsModified works for deletes");

        db.exec("SELECT * FROM test;");
        assert.deepEqual(db.getRowsModified(), 4, "getRowsModified unmodified by queries");

    });

    it("test_issue325", async function () {
        "use strict";
        // Create a database
        var db = new sql.Database();

        // inline result value test
        assert.strictEqual(
            db.exec("SELECT 1.7976931348623157e+308")[0].values[0][0],
            1.7976931348623157e+308,
            "SELECT 1.7976931348623157e+308 is 1.7976931348623157e+308"
        );

        // binding a large number
        assert.strictEqual(
            db.exec("SELECT ?", [1.7976931348623157e+308])[0].values[0][0],
            1.7976931348623157e+308,
            "binding 1.7976931348623159e+308 as a parameter"
        );

        // Close the database and all associated statements
        db.close();
    });

    it("test_node_file", async function () {
        //Node filesystem module - You know that.
        var fs = require('fs');

        //Ditto, path module
        var path = require('path');

        var filebuffer = fs.readFileSync(path.join(__dirname, 'test.sqlite'));

        //Works
        var db = new sql.Database({data: filebuffer});

        //[{"columns":["id","content"],"values":[["0","hello"],["1","world"]]}]
        var res = db.exec("SELECT * FROM test WHERE id = 0");
        assert.deepEqual(res,
            [{"columns": ["id", "content"], "values": [[0, "hello"]]}],
            "One should be able to read the contents of an SQLite database file read from disk");
        db.close();
    });

    it("test_statement", async function () {
        // Create a database
        var db = new sql.Database();

        // Execute some sql
        sqlstr = "CREATE TABLE alphabet (letter, code);";
        db.exec(sqlstr);

        var result = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        assert.deepEqual(result, [{columns: ['name'], values: [['alphabet']]}],
            "Table properly created");

        // Prepare a statement to insert values in tha database
        var stmt = db.prepare("INSERT INTO alphabet (letter,code) VALUES (?,?)");
        // Execute the statement several times
        stmt.run(['a', 1]);
        stmt.run(['b', 2.2]);
        stmt.run(['c']); // The second parameter will be bound to NULL

        // Free the statement
        stmt.free();

        result = db.exec("SELECT * FROM alphabet");
        assert.deepEqual(result,
            [{columns: ['letter', 'code'], values: [['a', 1], ['b', 2.2], ['c', null]]}],
            "Statement.run() should have added data to the database");

        db.run("CREATE TABLE data (nbr, str, no_value); INSERT INTO data VALUES (5, '粵語😄', NULL);");
        stmt = db.prepare("SELECT * FROM data");
        stmt.step(); // Run the statement
        assert.deepEqual(stmt.getColumnNames(), ['nbr', 'str', 'no_value'], 'Statement.GetColumnNames()');
        var res = stmt.getAsObject();
        assert.strictEqual(res.nbr, 5, 'Read number');
        assert.strictEqual(res.str, '粵語😄', "Read string");
        assert.strictEqual(res.no_value, null, "Read null");
        assert.deepEqual(res, {nbr: 5, str: '粵語😄', no_value: null}, "Statement.getAsObject()");
        stmt.free();


        stmt = db.prepare("SELECT str FROM data WHERE str=?");
        assert.deepEqual(stmt.getAsObject(['粵語😄']), {'str': '粵語😄'}, "UTF8 support in prepared statements");

        // Prepare an sql statement
        stmt = db.prepare("SELECT * FROM alphabet WHERE code BETWEEN :start AND :end ORDER BY code");
        // Bind values to the parameters
        stmt.bind([0, 256]);
        // Execute the statement
        stmt.step();
        // Get one row of result
        result = stmt.get();
        assert.deepEqual(result, ['a', 1], "Binding named parameters by their position");

        // Fetch the next row of result
        result = stmt.step();
        assert.equal(result, true);
        result = stmt.get();
        assert.deepEqual(result, ['b', 2.2], "Fetching the next row of result");

        // Reset and reuse at once
        result = stmt.get([0, 1]);
        assert.deepEqual(result, ['a', 1], "Reset and reuse at once");

        // Pass objects to get() and bind() to use named parameters
        result = stmt.get({':start': 1, ':end': 1});
        assert.deepEqual(result, ['a', 1], "Binding named parameters");

        // Prepare statement, pass null to bind() and check that it works
        stmt = db.prepare("SELECT 'bind-with-null'");
        result = stmt.bind(null);
        assert.equal(result, true);
        stmt.step();
        result = stmt.get();
        assert.deepEqual(result, ["bind-with-null"])

        // Close the database and all associated statements
        db.close();
    });

    it("test_transactions", async function () {
        var db = new sql.Database();
        db.exec("CREATE TABLE test (data); INSERT INTO test VALUES (1);");

        // Open a transaction
        db.exec("BEGIN TRANSACTION;");

        // Insert a row
        db.exec("INSERT INTO test VALUES (4);")

        // Rollback
        db.exec("ROLLBACK;");

        var res = db.exec("SELECT data FROM test WHERE data = 4;");
        var expectedResult = [];
        assert.deepEqual(res, expectedResult, "transaction rollbacks work");

        // Open a transaction
        db.exec("BEGIN TRANSACTION;");

        // Insert a row
        db.exec("INSERT INTO test VALUES (4);")

        // Commit
        db.exec("COMMIT;");

        var res = db.exec("SELECT data FROM test WHERE data = 4;");
        var expectedResult = [{
            columns: ['data'],
            values: [
                [4]
            ]
        }];
        assert.deepEqual(res, expectedResult, "transaction commits work");

        // Open a transaction
        db.exec("BEGIN TRANSACTION;");

        // Insert a row
        db.exec("INSERT INTO test VALUES (5);")

        // Rollback
        db.exec("ROLLBACK;");

        var res = db.exec("SELECT data FROM test WHERE data IN (4,5);");
        var expectedResult = [{
            columns: ['data'],
            values: [
                [4]
            ]
        }];
        assert.deepEqual(res, expectedResult, "transaction rollbacks after commits work");

        db.close();
    });
});
