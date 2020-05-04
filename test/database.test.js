const createSqlWasm = require("../dist/cjs/node-sql-wasm.js");

describe("node-sql-wasm", function () {

    let db;

    beforeAll(async function () {
        try {
            const {Database} = await createSqlWasm();
            db = new Database({dbfile: "database-test.sqlite"});
        } catch (e) {
            console.error(e);
        }
    })

    afterAll(async function () {
        try {
            db.close(true);
        } catch (e) {
            console.error(e);
        }
    })

    it("multiple statements", async function () {

        // Execute some sql
        sqlstr = "CREATE TABLE IF NOT EXISTS hello (a int, b char);";
        sqlstr += "INSERT INTO hello VALUES (0, 'hello');"
        sqlstr += "INSERT INTO hello VALUES (1, 'world');"
        db.run(sqlstr);
        // Run the query without returning anything

        let res = db.exec("SELECT * FROM hello WHERE a=0; SELECT * FROM hello WHERE a=1");
        expect(res[0]).toMatchObject({columns:['a','b'], values:[[0,'hello']]})
        expect(res[1]).toMatchObject({columns:['a','b'], values:[[1,'world']]})

        res = db.query("SELECT * FROM hello");
        expect(res).toMatchObject([{a:0, b:'hello'},{a:1, b:'world'}])

        res = db.query("SELECT b FROM hello");
        expect(res).toMatchObject([{b:'hello'},{b:'world'}])
    });

});
