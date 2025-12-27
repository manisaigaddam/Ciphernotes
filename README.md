# CipherNotes 🔐

> **FHE-Powered Private Notes** - A fully homomorphic encryption powered note-taking dApp built on Zama FHEVM

[![Zama](https://img.shields.io/badge/Built%20with-Zama%20FHEVM-purple)](https://docs.zama.ai/fhevm)
[![Sepolia](https://img.shields.io/badge/Network-Sepolia-blue)](https://sepolia.etherscan.io)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌟 Features

- **End-to-End Encryption**: Notes encrypted with AES-256-GCM, keys stored on-chain using FHE
- **Secure Sharing**: Share notes with other addresses via FHE re-encryption
- **Encrypted Categories**: Organize notes with euint8 encrypted category identifiers
- **Local Search**: Search across decrypted (cached) note content
- **IPFS Storage**: Encrypted content stored on IPFS (Storacha), only FHE-encrypted keys on-chain

---

## 🔧 FHE Operations Showcase

This project demonstrates advanced Zama FHEVM patterns:

### 1. Key Chunking (euint64 x 4)

256-bit AES keys are split into four 64-bit chunks for FHE encryption:

```solidity
// CipherNotes.sol - Creating a note with FHE key chunks
function createNote(
    string calldata title,
    bytes calldata ipfsCid,
    externalEuint64 keyChunk1,  // First 64 bits of AES key
    externalEuint64 keyChunk2,  // Bits 64-127
    externalEuint64 keyChunk3,  // Bits 128-191
    externalEuint64 keyChunk4,  // Final 64 bits
    bytes calldata inputProof
) external returns (uint256) {
    // FHE.fromExternal() converts client-encrypted input to on-chain handle
    euint64 k = FHE.fromExternal(keyChunk1, inputProof);
    
    // FHE.allowThis() grants the contract permission to operate on the handle
    FHE.allowThis(k);
    
    // FHE.allow() grants the user decrypt permission via Gateway
    FHE.allow(k, msg.sender);
    
    note.keyChunk1 = k;
}
```

### 2. Note Sharing (FHE Re-encryption)

When sharing, the owner re-encrypts the same AES key for the recipient:

```solidity
function shareNote(
    uint256 noteId,
    address recipient,
    externalEuint64 k1, k2, k3, k4,
    bytes calldata inputProof
) external {
    euint64 chunk1 = FHE.fromExternal(k1, inputProof);
    
    // Grant contract and recipient decrypt permission
    FHE.allowThis(chunk1);
    FHE.allow(chunk1, recipient);  // ← Recipient can now decrypt!
    
    // Store handle as bytes32 for retrieval
    sharedNoteKeys[owner][noteId][recipient] = FHE.toBytes32(chunk1);
}
```

### 3. Encrypted Categories (euint8)

Categories are stored as encrypted 8-bit integers:

```solidity
function setNoteCategory(
    uint256 noteId,
    externalEuint8 encCategory,  // Encrypted category (0-7)
    bytes calldata inputProof
) external {
    euint8 category = FHE.fromExternal(encCategory, inputProof);
    FHE.allowThis(category);
    FHE.allow(category, msg.sender);
    
    noteCategories[msg.sender][noteId] = category;
}
```

**Why encrypted categories?** Even category assignments are private - no observer can determine which notes belong to which category.

### 4. Client-Side Search

Search happens **locally on decrypted content**, not on-chain FHE comparison:

```javascript
// Frontend filtering - only searches decrypted (cached) content
const filteredNotes = notes.filter(note => {
  const titleMatch = note.title.toLowerCase().includes(query);
  const contentMatch = contentCache[note.id]?.toLowerCase().includes(query);
  return titleMatch || contentMatch;
});
```

**Why local search?** On-chain FHE string comparison would be astronomically expensive. This is a privacy-preserving pattern.

---

## 📁 Project Structure

```
ciphernotes/
├── contracts/
│   └── CipherNotes.sol          # Main smart contract (440 lines)
├── deploy/
│   └── 01_deploy_ciphernotes.ts # Deployment script
├── public/
│   ├── relayer-sdk/             # WASM files for FHE SDK
│   ├── kms_lib_bg.wasm          # KMS library
│   └── tfhe_bg.wasm             # TFHE library
├── src/
│   ├── components/
│   │   └── CipherNotes.jsx      # Full UI with search, categories, sharing
│   ├── config/
│   │   ├── contracts.js         # Contract ABI & address
│   │   ├── wagmi.js             # Wallet config
│   │   └── WalletProvider.jsx   # RainbowKit provider
│   ├── hooks/
│   │   └── useFhevm.jsx         # FHE hook with Relayer SDK
│   ├── lib/
│   │   └── ipfs.js              # Storacha IPFS integration
│   └── styles/
│       └── global.css           # Global styles
├── .env.example                  # Environment template
├── hardhat.config.ts            # Hardhat configuration
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 7
- MetaMask or compatible wallet
- Sepolia testnet ETH (get from [faucet](https://sepoliafaucet.com))

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
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

# Contract (deployed)
VITE_CIPHERNOTES_ADDRESS=0xB4296466e22d500f68939016C4682D46D9b389B3

# IPFS (Storacha)
VITE_STORACHA_KEY=your_key
VITE_STORACHA_PROOF=your_proof
```

### 3. Run Frontend

```bash
npm run dev
```

Open http://localhost:5173

---

## 🔒 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER BROWSER                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ React UI     │  │ Relayer SDK  │  │ Web Crypto API   │   │
│  │ (Search,     │  │ (FHE Client) │  │ (AES-256-GCM)    │   │
│  │  Categories) │  │              │  │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│         │                 │                   │              │
│         │    FHE Encrypt  │   AES Encrypt     │              │
│         ▼                 ▼                   ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Transaction: CID + 4x euint64 handles       │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│              SEPOLIA CHAIN + FHEVM COPROCESSOR             │
├───────────────────────────────────────────────────────────┤
│  CipherNotes.sol                                          │
│  ├── FHE.fromExternal() - Validate encrypted inputs       │
│  ├── FHE.allowThis()    - Grant contract permission       │
│  ├── FHE.allow()        - Grant user/recipient permission │
│  ├── FHE.toBytes32()    - Convert for storage             │
│  ├── euint64            - 64-bit encrypted key chunks     │
│  └── euint8             - 8-bit encrypted categories      │
└───────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                                       ▼
┌───────────────────┐               ┌───────────────────────┐
│   STORACHA IPFS   │               │    ZAMA GATEWAY       │
│  (Encrypted data) │               │   (FHE Decryption)    │
└───────────────────┘               └───────────────────────┘
```

---

## 📋 Contract Functions

| Function | FHE Operations | Purpose |
|----------|----------------|---------|
| `createNote()` | `fromExternal`, `allowThis`, `allow` | Create encrypted note |
| `updateContent()` | `fromExternal`, `allowThis`, `allow` | Update with new key |
| `shareNote()` | `fromExternal`, `allowThis`, `allow(recipient)` | Share via re-encryption |
| `setNoteCategory()` | `fromExternal(euint8)`, `allowThis`, `allow` | Assign encrypted category |
| `getNoteKeyChunks()` | Returns `euint64[]` | Get handles for decrypt |
| `getSharedNoteKeyChunks()` | Returns `bytes32[]` | Get shared handles |

---

## 🛠️ Development

```bash
# Compile contracts
npm run compile

# Deploy to Sepolia
npm run deploy:sepolia

# Run tests
npm run test

# Build frontend
npm run build
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

## 🙏 Acknowledgments

- [Zama](https://zama.ai) - FHEVM and Relayer SDK
- [Storacha](https://storacha.network) - IPFS storage
- [RainbowKit](https://rainbowkit.com) - Wallet connection
- [Viem](https://viem.sh) / [Wagmi](https://wagmi.sh) - Ethereum libraries

---

**Built for the Zama Builders Program** 🏗️
