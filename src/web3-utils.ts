import { createPublicClient, http, type PublicClient, type Hash, type Transaction } from 'viem';
import { type Chain } from 'viem/chains';

// Define Akave Fuji chain type and configuration
const akaveFuji: Chain = {
  id: 78963,
  name: "Akave Fuji",
  nativeCurrency: {
    decimals: 18,
    name: "AKAVE",
    symbol: "AKVF",
  },
  rpcUrls: {
    default: {
      http: ["https://node1-asia.ava.akave.ai/ext/bc/tLqcnkJkZ1DgyLyWmborZK9d7NmMj6YCzCFmf9d9oQEd2fHon/rpc"],
    },
  },
};

// Initialize client with type
const publicClient: PublicClient = createPublicClient({
  chain: akaveFuji,
  transport: http(),
});

/**
 * Gets the latest transaction hash for a given address
 * @note This function highly depends on Akave Fuji's block time and transaction confirmation time.
 * If the transaction is not confirmed in the first block, it will wait for 5 seconds and try again.
 * If the transaction is not confirmed in the second block, it will return null.
 * 
 * @param address - The address to check transactions for
 * @param commandId - Command ID for logging purposes
 * @returns Promise<Hash | null> - The transaction hash or null if not found
 */
async function getLatestTransaction(address: string, commandId: string): Promise<Hash | null> {
  try {
    // First attempt
    const blockNumber = await publicClient.getBlockNumber();
    console.log(`[${commandId}] 🔍 Checking block ${blockNumber} for transactions`);
    
    const block = await publicClient.getBlock({
      blockNumber,
      includeTransactions: true
    });

    let transactions = (block.transactions as Transaction[]).filter(tx => 
      tx.from?.toLowerCase() === address.toLowerCase()
    );

    if (transactions.length > 0) {
      const hash = transactions[transactions.length - 1].hash;
      console.log(`[${commandId}] ✅ Found transaction hash in first attempt: ${hash}`);
      return hash;
    }

    console.log(`[${commandId}] ⏳ No transaction found, waiting 5 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Second attempt
    const newBlockNumber = await publicClient.getBlockNumber();
    console.log(`[${commandId}] 🔍 Checking block ${newBlockNumber} for transactions`);
    
    const newBlock = await publicClient.getBlock({
      blockNumber: newBlockNumber,
      includeTransactions: true
    });

    transactions = (newBlock.transactions as Transaction[]).filter(tx => 
      tx.from?.toLowerCase() === address.toLowerCase()
    );

    const hash = transactions[transactions.length - 1]?.hash;
    if (hash) {
      console.log(`[${commandId}] ✅ Found transaction hash in second attempt: ${hash}`);
    } else {
      console.log(`[${commandId}] ❌ No transaction found after retrying`);
    }

    return hash || null;

  } catch (error) {
    console.error(`[${commandId}] 🔴 Error getting latest transaction:`, error);
    return null;
  }
}

export {
  getLatestTransaction,
  type Chain,
};