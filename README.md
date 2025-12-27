# CipherNotes 🔐

> **FHE-Powered Private Notes** - A fully homomorphic encryption powered note-taking dApp built on Zama FHEVM

[![Zama](https://img.shields.io/badge/Built%20with-Zama%20FHEVM-purple)](https://docs.zama.ai/fhevm)
[![Sepolia](https://img.shields.io/badge/Network-Sepolia-blue)](https://sepolia.etherscan.io)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌟 Features

- **End-to-End Encryption**: Notes encrypted with AES-256-GCM, keys stored on-chain using FHE
- **Secure Sharing**: Share notes with other addresses via FHE re-encryption
- **IPFS Storage**: Encrypted content stored on IPFS (Storacha), only FHE-encrypted keys on-chain
- **Full Privacy**: Even the blockchain can't see your note content or encryption keys

## 🔧 FHEVM Operations Showcase

This project demonstrates advanced Zama FHEVM patterns:

| Operation | Description |
|-----------|-------------|
| `FHE.fromExternal()` | Convert client-encrypted inputs to on-chain handles |
| `FHE.allowThis()` | Grant contract permission to operate on handles |
| `FHE.allow()` | Grant user/recipient decryption permission |
| `FHE.toBytes32()` | Convert handles for storage |
| `euint64` chunking | Split 256-bit AES keys into 4x64-bit FHE handles |
| `euint8` categories | Encrypted category identifiers |

## 📁 Project Structure

```
ciphernotes/
├── contracts/
│   └── CipherNotes.sol          # Main smart contract (440 lines)
├── deploy/
│   └── 01_deploy_ciphernotes.ts # Deployment script
├── public/
│   └── relayer-sdk/             # WASM files for FHE SDK
├── src/
│   ├── components/
│   │   └── CipherNotes.jsx      # Main UI component
│   ├── config/
│   │   ├── contracts.js         # Contract ABI & address
│   │   ├── wagmi.js             # Wallet config
│   │   └── WalletProvider.jsx   # RainbowKit provider
│   ├── hooks/
│   │   └── useFhevm.jsx         # FHE hook with Relayer SDK
│   ├── lib/
│   │   └── ipfs.js              # Storacha IPFS integration
│   ├── styles/
│   │   └── global.css           # Global styles
│   ├── App.jsx
│   └── main.jsx
├── .env.example                  # Environment template
├── hardhat.config.ts            # Hardhat configuration
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 7
- MetaMask or compatible wallet
- Sepolia testnet ETH (get from [faucet](https://sepoliafaucet.com))

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Required
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
ALCHEMY_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_private_key_without_0x

# IPFS (Storacha) - see setup guide below
VITE_STORACHA_KEY=your_key
VITE_STORACHA_PROOF=your_proof

# After deployment
VITE_CIPHERNOTES_ADDRESS=0x...
```

### 3. Setup Storacha (IPFS)

```bash
# Install Storacha CLI
npm install -g @storacha/cli

# Login
storacha login your-email@example.com
# Check email for verification link

# Create space
storacha space create ciphernotes-space

# Generate key (save "key" field as VITE_STORACHA_KEY)
storacha key create --json

# Generate delegation proof (save output as VITE_STORACHA_PROOF)
storacha delegation create <did-from-key-create> \
  -c space/blob/add -c space/index/add -c upload/add --base64
```

### 4. Deploy Contract

```bash
npm run compile
npm run deploy:sepolia
```

Copy the deployed address to `VITE_CIPHERNOTES_ADDRESS` in `.env`

### 5. Run Frontend

```bash
npm run dev
```

Open http://localhost:5173

## 📋 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID | Yes |
| `ALCHEMY_URL` | Sepolia RPC URL (Alchemy) | Yes |
| `PRIVATE_KEY` | Deployer wallet private key | For deploy |
| `VITE_CIPHERNOTES_ADDRESS` | Deployed contract address | Yes |
| `VITE_STORACHA_KEY` | Storacha agent key | Yes |
| `VITE_STORACHA_PROOF` | Storacha delegation proof | Yes |
| `VITE_ACL_ADDRESS` | Zama ACL contract | Pre-configured |
| `VITE_KMS_ADDRESS` | Zama KMS contract | Pre-configured |
| `VITE_GATEWAY_URL` | Zama Gateway URL | Pre-configured |
| `VITE_FHEVM_RELAYER_URL` | Zama Relayer URL | Pre-configured |

## 🔒 How It Works

### Encryption Flow

```
1. User creates note
2. Generate AES-256 key locally
3. Encrypt note content with AES-GCM
4. Upload encrypted content to IPFS (Storacha)
5. Split AES key into 4 x 64-bit chunks
6. FHE encrypt each chunk (client-side via Relayer SDK)
7. Store IPFS CID + 4 FHE handles on-chain
```

### Decryption Flow

```
1. User requests decryption
2. Fetch IPFS CID + FHE handles from contract
3. Sign EIP-712 message authorizing decryption
4. Relayer SDK requests decryption from Gateway
5. Gateway re-encrypts keys for user's public key
6. User decrypts key chunks locally
7. Reconstruct AES key from 4 chunks
8. Fetch encrypted content from IPFS
9. Decrypt with AES-GCM
```

### Sharing Flow

```
1. Original owner decrypts note (has AES key in memory)
2. Owner FHE-encrypts same AES key for recipient
3. Contract stores recipient's FHE handles with FHE.allow()
4. Recipient can now request decryption via Gateway
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER BROWSER                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ React UI     │  │ Relayer SDK  │  │ Web Crypto API   │   │
│  │ (CipherNotes)│  │ (FHE Client) │  │ (AES-256-GCM)    │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                   │              │
│         │    FHE Encrypt  │   AES Encrypt     │              │
│         ▼                 ▼                   ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Transaction                        │   │
│  │  (CID + 4x FHE handles + inputProof)                 │   │
│  └────────────────────────┬─────────────────────────────┘   │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│              SEPOLIA CHAIN + FHEVM COPROCESSOR             │
├───────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐  │
│  │                  CipherNotes.sol                     │  │
│  │  - FHE.fromExternal() validates proof               │  │
│  │  - FHE.allowThis() grants contract permission       │  │
│  │  - FHE.allow() grants user decrypt permission       │  │
│  │  - Stores: CID (plain) + 4x euint64 key handles     │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                                       ▼
┌───────────────────┐               ┌───────────────────────┐
│   STORACHA IPFS   │               │    ZAMA GATEWAY       │
│  (Encrypted data) │               │   (FHE Decryption)    │
└───────────────────┘               └───────────────────────┘
```

## 📜 Smart Contract

See [contracts/CipherNotes.sol](contracts/CipherNotes.sol):

- **Note CRUD**: Create, update, delete notes with encrypted keys
- **Key Chunking**: 256-bit AES key → 4 x 64-bit FHE handles
- **Sharing**: Re-encrypt keys for recipients with `FHE.allow()`
- **Categories**: Encrypted category identifiers (euint8)

## 🛠️ Development

```bash
# Compile contracts
npm run compile

# Run tests
npm run test

# Build frontend
npm run build

# Preview production build
npm run preview
```

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 🙏 Acknowledgments

- [Zama](https://zama.ai) - FHEVM and Relayer SDK
- [Storacha](https://storacha.network) - IPFS storage
- [RainbowKit](https://rainbowkit.com) - Wallet connection
- [Viem](https://viem.sh) / [Wagmi](https://wagmi.sh) - Ethereum libraries

---

**Built for the Zama Builders Program** 🏗️
