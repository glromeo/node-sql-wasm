const { basename } = require("path");

module.exports = {
    process(_, path) {
        return `module.exports = (() => {
            return "compiled/${basename(path)}";
        })()`;
    },
};
