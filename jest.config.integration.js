module.exports = {
  testTimeout: 30000,
  testEnvironment: "node",
  testMatch: ["**/tests/integration/**/*.test.js"],
  setupFiles: ["dotenv/config"],
};
