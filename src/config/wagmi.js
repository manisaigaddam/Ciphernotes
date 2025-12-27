import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

// Sepolia chain configuration for Zama FHEVM
export const config = getDefaultConfig({
  appName: 'CipherNotes',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '1aaf6bd9d61c3334e38acbd002e9abf9',
  chains: [sepolia],
  ssr: false,
});

// Export chain for reference
export const supportedChain = sepolia;

// FHE Configuration for Zama Protocol on Sepolia
export const fheConfig = {
  aclAddress: import.meta.env.VITE_ACL_ADDRESS || '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
  kmsAddress: import.meta.env.VITE_KMS_ADDRESS || '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
  gatewayUrl: import.meta.env.VITE_GATEWAY_URL || 'https://gateway.sepolia.zama.ai',
  relayerUrl: import.meta.env.VITE_FHEVM_RELAYER_URL || 'https://relayer.testnet.zama.org',
};
