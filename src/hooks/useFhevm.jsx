import { Buffer } from 'buffer';
import { ethers } from 'ethers';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAccount, useChainId, usePublicClient, useWalletClient } from 'wagmi';
import { CONTRACT_ADDRESSES } from '../config/contracts';

// FHE Status types
export const FHE_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  UNSUPPORTED: 'unsupported',
};

// Sepolia chain ID (FHEVM supported)
const SEPOLIA_CHAIN_ID = 11155111;

// Context
const FhevmContext = createContext(null);

// Polyfill Buffer for browser (used by relayer SDK)
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  window.Buffer = Buffer;
}
if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}

const loadRelayerSdk = async () => {
  if (typeof window === 'undefined') {
    throw new Error('Browser environment required for Relayer SDK');
  }

  // Try web export first (includes initSDK/createInstance)
  try {
    const mod = await import('@zama-fhe/relayer-sdk/web');
    if (mod?.initSDK && mod?.createInstance && mod?.SepoliaConfig) return mod;
  } catch (err) {
    console.warn('Relayer SDK web import failed, trying bundle:', err?.message || err);
  }

  // Fallback: bundle export
  try {
    const mod = await import('@zama-fhe/relayer-sdk/bundle');
    if (mod?.initSDK && mod?.createInstance && mod?.SepoliaConfig) return mod;
    throw new Error('Relayer SDK bundle missing expected exports');
  } catch (err) {
    console.error('Failed to load relayer SDK bundle:', err?.message || err);
    throw err;
  }
};

/**
 * FhevmProvider - Real FHEVM Integration
 * 
 * This provider integrates with Zama's FHEVM on Sepolia testnet.
 * 
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    FHEVM DATA FLOW                               │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  1. USER INPUT (plaintext: 42)                                  │
 * │           ↓                                                      │
 * │  2. CLIENT ENCRYPTION (via Relayer SDK)                         │
 * │     └─ createEncryptedInput() → { handle, inputProof }          │
 * │           ↓                                                      │
 * │  3. TRANSACTION (user signs & pays gas)                         │
 * │     └─ contract.increment(handle, inputProof)                   │
 * │           ↓                                                      │
 * │  4. ON-CHAIN FHE (FHEVM Coprocessor)                            │
 * │     └─ FHE.fromExternal() → validates proof                     │
 * │     └─ FHE.add() → encrypted computation                        │
 * │     └─ Result stored as encrypted handle                        │
 * │           ↓                                                      │
 * │  5. DECRYPTION (via Gateway)                                    │
 * │     └─ User signs EIP-712 message                               │
 * │     └─ Gateway re-encrypts for user's public key                │
 * │     └─ User decrypts locally                                    │
 * └─────────────────────────────────────────────────────────────────┘
 */
export function FhevmProvider({ children }) {
  const [status, setStatus] = useState(FHE_STATUS.IDLE);
  const [error, setError] = useState(null);
  const [ethersProvider, setEthersProvider] = useState(null);
  const [ethersSigner, setEthersSigner] = useState(null);
  const [relayer, setRelayer] = useState(null);
  
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Check if on supported network
  const isSupportedNetwork = chainId === SEPOLIA_CHAIN_ID;

  // Initialize ethers provider and signer when wallet connects
  useEffect(() => {
    const setupProvider = async () => {
      if (!walletClient || !isConnected) {
        setEthersProvider(null);
        setEthersSigner(null);
        setRelayer(null);
        setStatus(FHE_STATUS.IDLE);
        return;
      }

      if (!isSupportedNetwork) {
        setStatus(FHE_STATUS.UNSUPPORTED);
        setError(new Error(`Network ${chainId} not supported. Please switch to Sepolia (11155111)`));
        return;
      }

      try {
        setStatus(FHE_STATUS.LOADING);
        setError(null);

        // Create ethers provider from wallet client
        const provider = new ethers.BrowserProvider(walletClient);
        const signer = await provider.getSigner();

        setEthersProvider(provider);
        setEthersSigner(signer);

        // Initialize Relayer SDK (browser, CDN-loaded)
        const sdkModule = await loadRelayerSdk();
        const { initSDK, createInstance, SepoliaConfig } = sdkModule;

        // Prefer env overrides; fallback to SDK Sepolia defaults
        const gatewayUrl = import.meta.env.VITE_GATEWAY_URL || SepoliaConfig.gatewayUrl || 'https://gateway.sepolia.zama.ai';
        const relayerUrl =
          import.meta.env.VITE_FHEVM_RELAYER_URL ||
          import.meta.env.VITE_RELAYER_URL ||
          SepoliaConfig.relayerUrl ||
          'https://relayer.testnet.zama.org';
        const aclAddress = import.meta.env.VITE_ACL_ADDRESS || SepoliaConfig.aclContractAddress;
        const kmsAddress = import.meta.env.VITE_KMS_ADDRESS || SepoliaConfig.kmsContractAddress;

        // Serve wasm from public root (kms_lib_bg.wasm, tfhe_bg.wasm)
        const wasmBaseURL = `${window.location.origin}/relayer-sdk/`;

        // Log resolved wasm base and sanity-check availability
        console.log('[FHEVM] Using wasmBaseURL:', wasmBaseURL);
        if (typeof fetch !== 'undefined') {
          const testUrl = `${wasmBaseURL}kms_lib_bg.wasm`;
          try {
            const res = await fetch(testUrl, { method: 'HEAD' });
            console.log('[FHEVM] wasm HEAD', testUrl, res.status, res.headers.get('content-type'));
          } catch (e) {
            console.warn('[FHEVM] wasm HEAD failed', e?.message || e);
          }
        }

        await initSDK({
          gatewayUrl,
          relayerUrl,
          wasmBaseURL,
          aclContractAddress: aclAddress,
          kmsContractAddress: kmsAddress,
        });

        const config = {
          ...SepoliaConfig,
          network: window.ethereum,
          gatewayUrl,
          relayerUrl,
          kmsContractAddress: kmsAddress,
          aclContractAddress: aclAddress,
        };

        const relayerInstance = await createInstance(config);
        setRelayer(relayerInstance);
        setStatus(FHE_STATUS.READY);

        console.log('═══════════════════════════════════════════════════════');
        console.log('🔐 Zenix (fhEVM Desktop) - Connected to Sepolia');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📍 Wallet:', address);
        console.log('🔗 Chain ID:', chainId);
        console.log('🌐 Gateway:', gatewayUrl);
        console.log('🚚 Relayer:', relayerUrl);
        console.log('✅ Relayer SDK initialized (CDN)');
        console.log('═══════════════════════════════════════════════════════');
      } catch (err) {
        console.error('Failed to setup provider/relayer:', err);
        setError(err);
        setStatus(FHE_STATUS.ERROR);
      }
    };

    const timer = setTimeout(setupProvider, 100);
    return () => clearTimeout(timer);
  }, [walletClient, isConnected, chainId, isSupportedNetwork, address]);

  /**
   * Get a contract instance connected to signer
   */
  const getContract = useCallback((address, abi) => {
    if (!ethersSigner || !address) {
      return null;
    }
    return new ethers.Contract(address, abi, ethersSigner);
  }, [ethersSigner]);

  /**
   * Get a read-only contract instance
   */
  const getReadOnlyContract = useCallback((address, abi) => {
    if (!ethersProvider || !address) {
      return null;
    }
    return new ethers.Contract(address, abi, ethersProvider);
  }, [ethersProvider]);

  /**
   * Create encrypted input for contract calls
   * 
   * NOTE: Full SDK integration requires @zama-fhe/relayer-sdk
   * For now, we provide a helper that works with our contract patterns
   */
  const createEncryptedInput = useCallback(
    async (value, contractAddress, bits) => {
      if (!relayer) {
        throw new Error('Relayer SDK not ready');
      }
      if (!address) {
        throw new Error('Wallet not connected');
      }

      const inputHandle = relayer.createEncryptedInput(contractAddress, address);

      const addrLc = (contractAddress || '').toLowerCase();
      const needs64 =
        addrLc === (CONTRACT_ADDRESSES.ConfidentialERC7984 || '').toLowerCase() ||
        addrLc === (CONTRACT_ADDRESSES.ConfidentialVestingWallet || '').toLowerCase() ||
        addrLc === (CONTRACT_ADDRESSES.InputProofDemo || '').toLowerCase();

      // Choose width based on requested bits or contract defaults (64 for confidential + inputProof)
      const targetBits = bits ?? (needs64 ? 64 : 32);
      if (targetBits === 64) {
        inputHandle.add64(Number(value));
      } else if (targetBits === 16) {
        inputHandle.add16(Number(value));
      } else if (targetBits === 8) {
        inputHandle.add8(Number(value));
      } else {
        inputHandle.add32(Number(value));
      }
      const encrypted = await inputHandle.encrypt();

      const handle =
        (encrypted?.handles && encrypted.handles[0]) ||
        encrypted?.encryptedData ||
        encrypted;
      const proof = encrypted?.inputProof || encrypted?.proof || encrypted;

      const hexHandle =
        typeof handle === 'string'
          ? handle
          : ethers.isHexString(handle)
          ? handle
          : ethers.hexlify(handle);

      const hexProof =
        typeof proof === 'string'
          ? proof
          : ethers.isHexString(proof)
          ? proof
          : ethers.hexlify(proof);

      return {
        handles: [hexHandle],
        inputProof: hexProof,
        value: BigInt(value),
      };
    },
    [relayer, address]
  );

  /**
   * Create encrypted input for 4 x 64-bit values (for key chunks)
   * All 4 values share one proof
   */
  const createEncryptedInput4x64 = useCallback(
    async (value1, value2, value3, value4, contractAddress) => {
      if (!relayer) {
        throw new Error('Relayer SDK not ready');
      }
      if (!address) {
        throw new Error('Wallet not connected');
      }

      const inputHandle = relayer.createEncryptedInput(contractAddress, address);
      
      // Add all 4 values to single encrypted input (use BigInt to preserve 64-bit precision)
      // Note: SDK may accept BigInt or convert internally
      inputHandle.add64(BigInt(value1));
      inputHandle.add64(BigInt(value2));
      inputHandle.add64(BigInt(value3));
      inputHandle.add64(BigInt(value4));
      
      const encrypted = await inputHandle.encrypt();

      // Get all 4 handles
      const handles = encrypted?.handles || [];
      const proof = encrypted?.inputProof || encrypted?.proof || encrypted;

      const hexHandles = handles.map(h => 
        typeof h === 'string' ? h : ethers.isHexString(h) ? h : ethers.hexlify(h)
      );

      const hexProof =
        typeof proof === 'string'
          ? proof
          : ethers.isHexString(proof)
          ? proof
          : ethers.hexlify(proof);

      return {
        handles: hexHandles,
        inputProof: hexProof,
      };
    },
    [relayer, address]
  );

  /**
   * Execute a contract call with encrypted input
   */
  const executeEncryptedCall = useCallback(
    async (contract, functionName, encryptedInput, ...args) => {
      if (!ethersSigner) {
        throw new Error('Wallet not connected');
      }

      console.log(`\n🔐 Executing ${functionName}...`);
      console.log(`   Encrypted handle: ${encryptedInput.handles[0].slice(0, 20)}...`);
      console.log(`   Input proof: ${encryptedInput.inputProof.slice(0, 20)}...`);

      const tx = await contract[functionName](
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        ...args
      );

      console.log(`   📤 TX sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);

      return { tx, receipt };
    },
    [ethersSigner]
  );

  /**
   * Execute a simple contract call (no encryption)
   */
  const executeCall = useCallback(async (contract, functionName, ...args) => {
    if (!ethersSigner) {
      throw new Error('Wallet not connected');
    }

    console.log(`\n📤 Executing ${functionName}...`);
    
    const tx = await contract[functionName](...args);
    console.log(`   TX sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}`);
    
    return { tx, receipt };
  }, [ethersSigner]);

  /**
   * Read from contract
   */
  const readContract = useCallback(async (contract, functionName, ...args) => {
    return await contract[functionName](...args);
  }, []);

  /**
   * Request decryption via Gateway
   * NOTE: Full implementation requires EIP-712 signing
   */
  const extractDecryptedNumber = (result, handle) => {
    if (!result) return null;
    
    // For 64-bit values, we need to preserve BigInt precision
    // The gateway may return values as BigInt, string, or number
    
    let val = null;
    if (result.clearValues && typeof result.clearValues === 'object') {
      val = result.clearValues[handle];
    } else if (typeof result === 'object' && result[handle] !== undefined) {
      val = result[handle];
    } else if (Array.isArray(result) && result.length > 0) {
      val = result[0];
    } else if (typeof result === 'bigint' || typeof result === 'number' || typeof result === 'string') {
      val = result;
    }
    
    if (val === null || val === undefined) return null;
    
    // Return as BigInt to preserve 64-bit precision
    // If it's already a BigInt, return as-is; otherwise convert
    if (typeof val === 'bigint') return val;
    if (typeof val === 'string') return BigInt(val);
    // Only use Number for values that fit safely
    return BigInt(Math.round(val));
  };

  const requestDecryption = useCallback(
    async (handle, contractAddress) => {
      if (!relayer) {
        throw new Error('Relayer SDK not ready');
      }
      if (!ethersSigner) {
        throw new Error('Wallet not connected');
      }

      console.log(`\n🔓 Requesting user decryption...`);
      const keypair = relayer.generateKeypair();

      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];

      const eip712 = relayer.createEIP712(keypair.publicKey, contractAddresses, startTime, durationDays);

      const signature = await ethersSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await relayer.userDecrypt(
        [{ handle, contractAddress }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        await ethersSigner.getAddress(),
        startTime,
        durationDays
      );

      return extractDecryptedNumber(result, handle);
    },
    [relayer, ethersSigner]
  );

  /**
   * Request decryption for 4 handles at once (for key chunk decryption)
   * Returns array of 4 decrypted values
   */
  const requestDecryption4x64 = useCallback(
    async (handles, contractAddress) => {
      if (!relayer) {
        throw new Error('Relayer SDK not ready');
      }
      if (!ethersSigner) {
        throw new Error('Wallet not connected');
      }

      console.log(`\n🔓 Requesting user decryption for 4 key chunks...`);
      const keypair = relayer.generateKeypair();

      const startTime = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [contractAddress];

      const eip712 = relayer.createEIP712(keypair.publicKey, contractAddresses, startTime, durationDays);

      const signature = await ethersSigner.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      // Build decrypt pairs for all 4 handles
      const decryptPairs = handles.map(h => ({
        handle: typeof h === 'string' ? h : `0x${BigInt(h).toString(16).padStart(64, '0')}`,
        contractAddress
      }));

      console.log('Decrypt pairs:', decryptPairs);

      const result = await relayer.userDecrypt(
        decryptPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        await ethersSigner.getAddress(),
        startTime,
        durationDays
      );

      console.log('Decrypt result:', result);

      // Extract all 4 values
      const decryptedValues = decryptPairs.map(pair => {
        return extractDecryptedNumber(result, pair.handle);
      });

      return decryptedValues;
    },
    [relayer, ethersSigner]
  );

  const requestPublicDecryption = useCallback(
    async (handle) => {
      if (!relayer) {
        throw new Error('Relayer SDK not ready');
      }
      const result = await relayer.publicDecrypt([handle]);
      return extractDecryptedNumber(result, handle);
    },
    [relayer]
  );

  // Reinitialize
  const reinitialize = useCallback(async () => {
    setStatus(FHE_STATUS.IDLE);
    setError(null);
    setEthersProvider(null);
    setEthersSigner(null);
  }, []);

  const value = {
    // Status
    status,
    error,
    isReady: status === FHE_STATUS.READY,
    isLoading: status === FHE_STATUS.LOADING,
    isSupportedNetwork,
    
    // Wallet
    address,
    isConnected,
    chainId,
    
    // Ethers
    ethersProvider,
    ethersSigner,
    relayer,
    
    // Contract helpers
    getContract,
    getReadOnlyContract,
    
    // FHE operations
    createEncryptedInput,
    createEncryptedInput4x64,
    executeEncryptedCall,
    executeCall,
    readContract,
    requestDecryption,
    requestDecryption4x64,
    requestPublicDecryption,
    
    // Utility
    reinitialize,
  };

  return (
    <FhevmContext.Provider value={value}>
      {children}
    </FhevmContext.Provider>
  );
}

export function useFhevm() {
  const context = useContext(FhevmContext);
  if (!context) {
    throw new Error('useFhevm must be used within FhevmProvider');
  }
  return context;
}

export default FhevmProvider;
