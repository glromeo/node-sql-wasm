const fs = require("fs");

const files = [
    "../../sql.js/test/test_blob.js",
    "../../sql.js/test/test_database.js",
    "../../sql.js/test/test_errors.js",
    "../../sql.js/test/test_extension_functions.js",
    "../../sql.js/test/test_functions.js",
    "../../sql.js/test/test_functions_recreate.js",
    "../../sql.js/test/test_issue55.js",
    "../../sql.js/test/test_issue73.js",
    "../../sql.js/test/test_issue76.js",
    "../../sql.js/test/test_issue128.js",
    "../../sql.js/test/test_issue325.js",
    "../../sql.js/test/test_node_file.js",
    "../../sql.js/test/test_statement.js",
    "../../sql.js/test/test_transactions.js",
];

fs.writeFileSync("./sql-js.test.js", `
const assert = require('assert').strict;
const createSqlWasm = require("../dist/cjs/node-sql-wasm.js");

describe("sql.js tests", function () {
    
    let SQL;
    
    beforeAll(async function () {
        try {
            SQL = await createSqlWasm();
        } catch (e) {
            console.error(e);
        }
    });

    ${
files.map(file => {
    const name = /test\/([^.]+).js/.exec(file)[1];
    const text = fs.readFileSync(file, {encoding: "UTF-8"});
    const lines = text.split("\n");
    let from = 0, to = lines.length - 1;
    while (!/exports\.test =/.test(lines[from])) {
        from++;
        if (from >= lines.length) {
            console.error(name);
            process.exit(-1);
        }
    }
    from++;
    while (!/module == require\.main/.test(lines[to])) {
        to--;
        if (to <= 0) {
            console.error(name);
            process.exit(-1);
        }
    }
    while (!/};/.test(lines[to])) {
        to--;
        if (to <= 0) {
            console.error(name);
            process.exit(-1);
        }
    }
    const slice = lines.slice(from, to);
    return `
    it("${name}", async function () {
        ${slice.join("\n      ")}
    });`
    
    }).join("\n")
}
});
`, {encoding: "UTF-8"});
