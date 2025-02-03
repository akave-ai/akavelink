import { getLatestTransaction } from "../web3-utils";
import { createPublicClient, http, PublicClient, Hash } from "viem";

type MockPublicClient = jest.Mocked<PublicClient>;

jest.mock("viem", () => ({
  createPublicClient: jest.fn(),
  http: jest.fn(),
}));

describe("getLatestTransaction", () => {
  const mockAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
  const mockCommandId = "test-command";
  let mockClient: MockPublicClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      getBlockNumber: jest.fn(),
      getBlock: jest.fn(),
    } as unknown as MockPublicClient;

    (createPublicClient as jest.Mock).mockReturnValue(mockClient);
  });

  test("should return transaction hash on first attempt", async () => {
    const mockHash = "0x123" as Hash;

    mockClient.getBlockNumber.mockResolvedValue(123n);
    mockClient.getBlock.mockResolvedValue({
      transactions: [
        {
          from: mockAddress.toLowerCase(),
          hash: mockHash,
        },
      ],
    } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>);

    const result = await getLatestTransaction(mockAddress, mockCommandId);
    expect(result).toBe(mockHash);
    expect(mockClient.getBlockNumber).toHaveBeenCalledTimes(1);
    expect(mockClient.getBlock).toHaveBeenCalledTimes(1);
  });

  test("should retry and return hash on second attempt", async () => {
    const mockHash = "0x456" as Hash;

    mockClient.getBlockNumber
      .mockResolvedValueOnce(123n)
      .mockResolvedValueOnce(124n);

    mockClient.getBlock
      .mockResolvedValueOnce({
        transactions: [],
      } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>)
      .mockResolvedValueOnce({
        transactions: [
          {
            from: mockAddress.toLowerCase(),
            hash: mockHash,
          },
        ],
      } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>);

    const result = await getLatestTransaction(mockAddress, mockCommandId);
    expect(result).toBe(mockHash);
    expect(mockClient.getBlockNumber).toHaveBeenCalledTimes(2);
    expect(mockClient.getBlock).toHaveBeenCalledTimes(2);
  });

  test("should return null if no transaction found", async () => {
    mockClient.getBlockNumber
      .mockResolvedValueOnce(123n)
      .mockResolvedValueOnce(124n);

    mockClient.getBlock
      .mockResolvedValueOnce({
        transactions: [],
      } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>)
      .mockResolvedValueOnce({
        transactions: [],
      } as unknown as Awaited<ReturnType<PublicClient["getBlock"]>>);

    const result = await getLatestTransaction(mockAddress, mockCommandId);
    expect(result).toBeNull();
  });

  test("should handle errors gracefully", async () => {
    mockClient.getBlockNumber.mockRejectedValue(new Error("Network error"));

    const result = await getLatestTransaction(mockAddress, mockCommandId);
    expect(result).toBeNull();
  });
});
