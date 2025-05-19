module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    clearMocks: true,
    moduleNameMapper: {
    },
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  };