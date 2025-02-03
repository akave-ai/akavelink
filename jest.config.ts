import type {Config } from "jest"

export default async (): Promise<Config> => {
  return {
    verbose: true,
    testEnvironment: "node",
    collectCoverage: true,
    coverageDirectory: "coverage",
    coveragePathIgnorePatterns: ["/node_modules"],
    setupFilesAfterEnv: ["./__tests__/setup.ts"]
  }
}
