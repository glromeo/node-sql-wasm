module.exports = {
    testEnvironment: "node",
    transform: {
        "^.+\\.(ts|js)$": "babel-jest",
        "^.+\\.wasm$": "<rootDir>/test/mocks/urlMock.js",
    },
    testRegex: "spec\\.(js|ts)$",
    moduleFileExtensions: [
        "ts",
        "js",
        "node"
    ],
    globals: {
    }
};
