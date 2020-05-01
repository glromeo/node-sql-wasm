const fs = require("fs");
const h_file = fs.readFileSync("../src/native/sqlite3.h", {encoding:"UTF-8"});

let defineRegEx = /^#define\s+([a-z_][a-z0-9_]*)\s+([a-z0-9_'"][^/]*)/i;

fs.writeFileSync("../out/sqlite3.h.js", `/**
 * These constants have been extracted from 'sqlite3.h'
 */
${
    h_file.split('\n')
        .map(line => defineRegEx.exec(line))
        .filter(result => result && result[1] && result[2])
        .map(([match, c_const, c_value]) => `export const ${c_const.trim()} = ${c_value.trim()};`)
        .join("\n")}
`, {encoding:"UTF-8"});
