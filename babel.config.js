module.exports = {
    plugins: ["@babel/plugin-syntax-dynamic-import"],
    env: {
        test: {
            plugins: [
                "babel-plugin-dynamic-import-node"
            ]
        }
    }
};
