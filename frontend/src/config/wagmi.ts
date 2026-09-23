import { http, createConfig, createStorage, cookieStorage } from 'wagmi';
import { hardhat, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Hardhat 로컬 노드 (ChainID 31337) 및 Sepolia 지원
export const config = createConfig({
  chains: [hardhat, sepolia],
  connectors: [
    injected(),
  ],
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [hardhat.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
