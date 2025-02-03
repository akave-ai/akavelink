require("dotenv").config({ path: ".env.test" });

jest.mock("viem", ()=> ({
  createPublicClient: jest.fn(() => ({
    getBlockNumber: jest.fn(),
    getBlock: jest.fn(),
  })),
  http: jest.fn(),
}))
