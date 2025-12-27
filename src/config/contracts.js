/**
 * Contract Configuration for CipherNotes
 * 
 * CipherNotes address is set via environment variable (VITE_CIPHERNOTES_ADDRESS)
 */

// Contract addresses from environment
export const CONTRACT_ADDRESSES = {
  CipherNotes: import.meta.env.VITE_CIPHERNOTES_ADDRESS || '',
};

// CipherNotes ABI - Advanced FHE-powered private note-taking
export const CONTRACT_ABIS = {
  CipherNotes: [
    // ===================== CORE NOTE FUNCTIONS =====================
    {
      "inputs": [
        { "internalType": "string", "name": "title", "type": "string" },
        { "internalType": "bytes", "name": "ipfsCid", "type": "bytes" },
        { "internalType": "bytes32", "name": "keyChunk1", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk2", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk3", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk4", "type": "bytes32" },
        { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
      ],
      "name": "createNote",
      "outputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "internalType": "string", "name": "newTitle", "type": "string" }
      ],
      "name": "updateTitle",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "internalType": "bytes", "name": "ipfsCid", "type": "bytes" },
        { "internalType": "bytes32", "name": "keyChunk1", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk2", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk3", "type": "bytes32" },
        { "internalType": "bytes32", "name": "keyChunk4", "type": "bytes32" },
        { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
      ],
      "name": "updateContent",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "deleteNote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "restoreNote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getMyNotesMetadata",
      "outputs": [
        { "internalType": "uint256[]", "name": "ids", "type": "uint256[]" },
        { "internalType": "string[]", "name": "titles", "type": "string[]" },
        { "internalType": "uint256[]", "name": "createdAts", "type": "uint256[]" },
        { "internalType": "uint256[]", "name": "updatedAts", "type": "uint256[]" },
        { "internalType": "bool[]", "name": "deletedFlags", "type": "bool[]" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "getNoteCID",
      "outputs": [{ "internalType": "bytes", "name": "", "type": "bytes" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "getNoteKeyChunks",
      "outputs": [
        { "internalType": "uint256", "name": "k1", "type": "uint256" },
        { "internalType": "uint256", "name": "k2", "type": "uint256" },
        { "internalType": "uint256", "name": "k3", "type": "uint256" },
        { "internalType": "uint256", "name": "k4", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTotalNotes",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getActiveNoteCount",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    
    // ===================== SHARING FUNCTIONS =====================
    {
      "inputs": [
        { "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "internalType": "address", "name": "recipient", "type": "address" },
        { "internalType": "bytes32", "name": "k1", "type": "bytes32" },
        { "internalType": "bytes32", "name": "k2", "type": "bytes32" },
        { "internalType": "bytes32", "name": "k3", "type": "bytes32" },
        { "internalType": "bytes32", "name": "k4", "type": "bytes32" },
        { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
      ],
      "name": "shareNote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "internalType": "address", "name": "recipient", "type": "address" }
      ],
      "name": "unshareNote",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "owner", "type": "address" },
        { "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "getSharedNoteKeyChunks",
      "outputs": [
        { "internalType": "bytes32[4]", "name": "", "type": "bytes32[4]" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "owner", "type": "address" },
        { "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "getSharedNoteCID",
      "outputs": [{ "internalType": "bytes", "name": "", "type": "bytes" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "address", "name": "owner", "type": "address" },
        { "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "getSharedNoteMetadata",
      "outputs": [
        { "internalType": "string", "name": "title", "type": "string" },
        { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
        { "internalType": "uint256", "name": "updatedAt", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getReceivedNotes",
      "outputs": [
        { "internalType": "address[]", "name": "owners", "type": "address[]" },
        { "internalType": "uint256[]", "name": "noteIds", "type": "uint256[]" },
        { "internalType": "string[]", "name": "titles", "type": "string[]" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "getSharedWithList",
      "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }],
      "stateMutability": "view",
      "type": "function"
    },
    
    // ===================== CATEGORY FUNCTIONS =====================
    {
      "inputs": [
        { "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "internalType": "bytes32", "name": "encCategory", "type": "bytes32" },
        { "internalType": "bytes", "name": "inputProof", "type": "bytes" }
      ],
      "name": "setNoteCategory",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "uint256", "name": "noteId", "type": "uint256" }],
      "name": "getNoteCategory",
      "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint8", "name": "index", "type": "uint8" },
        { "internalType": "string", "name": "name", "type": "string" }
      ],
      "name": "setCategoryName",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{ "internalType": "address", "name": "user", "type": "address" }],
      "name": "getCategoryNames",
      "outputs": [{ "internalType": "string[8]", "name": "", "type": "string[8]" }],
      "stateMutability": "view",
      "type": "function"
    },
    
    // ===================== EVENTS =====================
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "indexed": false, "internalType": "string", "name": "title", "type": "string" }
      ],
      "name": "NoteCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "NoteUpdated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "NoteDeleted",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" }
      ],
      "name": "NoteShared",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" },
        { "indexed": true, "internalType": "address", "name": "recipient", "type": "address" }
      ],
      "name": "NoteUnshared",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": true, "internalType": "address", "name": "owner", "type": "address" },
        { "indexed": false, "internalType": "uint256", "name": "noteId", "type": "uint256" }
      ],
      "name": "CategorySet",
      "type": "event"
    }
  ],
};

// Network configuration
export const NETWORK_CONFIG = {
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia',
    rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
    blockExplorer: 'https://sepolia.etherscan.io',
  },
};

// Check if contract is deployed
export const isContractDeployed = () => {
  const address = CONTRACT_ADDRESSES.CipherNotes;
  return Boolean(address && address !== '0x' && address.length === 42);
};

// Format address for display
export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Get block explorer link
export const getExplorerLink = (address, type = 'address') => {
  return `${NETWORK_CONFIG.sepolia.blockExplorer}/${type}/${address}`;
};
