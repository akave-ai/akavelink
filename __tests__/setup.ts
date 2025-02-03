import "dotenv/config"

jest.mock("viem", ()=> ({
  createPublicClient: jest.fn(() => ({
    getBlockNumber: jest.fn(),
    getBlock: jest.fn(),
  })),
  http: jest.fn(),
}))
