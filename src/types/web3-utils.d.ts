declare module "web3-utils" {
  import {
    Hash,
    Address,
    Chain,
  } from "viem/_types";

  export type Currency = {
    name: string;
    decimals: number;
    symbol: string;
  };

  export interface AkaveFujiChain extends Chain {
    id: string;
    name: string;
    nativeCurrency: Currency;
    rpcUrls: {
      default: {
        http: string[];
      };
    };
  }

  export const getLatestTransaction = (
    address: Address,
    commandId: string,
  ): Promise<Hash | null> => {};

  export const akaveFuji: AkaveFujiChain;
}
