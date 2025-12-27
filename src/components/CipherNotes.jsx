import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useAccount } from 'wagmi';
import { CONTRACT_ABIS, CONTRACT_ADDRESSES } from '../config/contracts';
import { useFhevm } from '../hooks/useFhevm';
import { downloadFromIPFS, uploadToIPFS } from '../lib/ipfs';

// ===================== CRYPTO UTILS =====================

// Generate random AES-256 key
const generateAESKey = async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return key;
};

// Export key to raw bytes
const exportKeyToBytes = async (key) => {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
};

// Import key from raw bytes
const importKeyFromBytes = async (keyBytes) => {
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

// AES-GCM encrypt
const aesEncrypt = async (plaintext, key) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
};

// AES-GCM decrypt
const aesDecrypt = async (encryptedData, key) => {
  const iv = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
};

// Convert 64-bit key chunk to/from BigInt
const keyChunkToBigInt = (keyBytes, offset = 0) => {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) | BigInt(keyBytes[offset + i] || 0);
  }
  return value;
};

const bigIntToKeyChunk = (value) => {
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(value & 0xFFn);
    value = value >> 8n;
  }
  return bytes;
};

// ===================== DEFAULT CATEGORIES =====================
const DEFAULT_CATEGORIES = ['Personal', 'Work', 'Ideas', 'Todo', 'Archive', 'Important', 'Draft', 'Other'];

// ===================== STYLED COMPONENTS =====================

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ECE9D8;
  font-family: 'Tahoma', sans-serif;
  position: relative;
`;

const MenuBar = styled.div`
  background: #ECE9D8;
  border-bottom: 1px solid #ACA899;
  padding: 2px 4px;
  display: flex;
  gap: 2px;
  font-size: 12px;
`;

const MenuItem = styled.button`
  background: transparent;
  border: none;
  padding: 2px 6px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  &:hover { background: #316AC5; color: white; }
`;

const MainContent = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

const Sidebar = styled.div`
  width: 200px;
  background: #F5F5F5;
  border-right: 1px solid #ACA899;
  display: flex;
  flex-direction: column;
`;

const SidebarHeader = styled.div`
  background: linear-gradient(to bottom, #4A7EBB 0%, #3C6BA5 100%);
  color: white;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: bold;
`;

const TabBar = styled.div`
  display: flex;
  border-bottom: 1px solid #ACA899;
`;

const Tab = styled.button`
  flex: 1;
  padding: 4px 8px;
  background: ${props => props.$active ? '#fff' : '#ECE9D8'};
  border: none;
  border-bottom: ${props => props.$active ? '2px solid #316AC5' : 'none'};
  cursor: pointer;
  font-size: 10px;
  font-weight: ${props => props.$active ? 'bold' : 'normal'};
  &:hover { background: ${props => props.$active ? '#fff' : '#E8E8E8'}; }
`;

const NotesList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 4px;
`;

const NoteItem = styled.div`
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 2px;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${props => props.$active ? '#316AC5' : 'transparent'};
  color: ${props => props.$active ? 'white' : '#000'};
  &:hover { background: ${props => props.$active ? '#316AC5' : '#E8E8E8'}; }
  .title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .category-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: ${props => props.$categoryColor || '#ccc'};
  }
`;

const NewNoteBtn = styled.button`
  margin: 4px;
  padding: 6px 8px;
  background: linear-gradient(to bottom, #FFFFFF 0%, #E5E5E5 100%);
  border: 1px solid #ACA899;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  &:hover { background: linear-gradient(to bottom, #E5F3FF 0%, #C7E1FF 100%); border-color: #316AC5; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const EditorArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
`;

const EditorHeader = styled.div`
  background: #F0F0F0;
  border-bottom: 1px solid #D4D0C8;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

const TitleInput = styled.input`
  flex: 1;
  min-width: 150px;
  padding: 4px 8px;
  border: 1px solid #7F9DB9;
  border-radius: 2px;
  font-size: 12px;
  &:focus { outline: none; border-color: #316AC5; }
`;

const CategorySelect = styled.select`
  padding: 4px 8px;
  border: 1px solid #7F9DB9;
  border-radius: 2px;
  font-size: 11px;
  background: white;
  min-width: 100px;
`;

const EditorTextarea = styled.textarea`
  flex: 1;
  padding: 12px;
  border: none;
  resize: none;
  font-family: 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  &:focus { outline: none; }
`;

const StatusBar = styled.div`
  background: #ECE9D8;
  border-top: 1px solid #ACA899;
  padding: 4px 8px;
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #444;
`;

const StatusItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const EncryptionBadge = styled.span`
  background: ${props => props.$encrypted ? '#4CAF50' : '#FF9800'};
  color: white;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  font-weight: bold;
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
  text-align: center;
  padding: 40px;
  .icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
  h3 { margin: 0 0 8px; font-size: 14px; font-weight: normal; }
  p { margin: 0; font-size: 12px; opacity: 0.8; }
`;

const ActionButton = styled.button`
  padding: 4px 12px;
  background: linear-gradient(to bottom, #FFFFFF 0%, #E5E5E5 100%);
  border: 1px solid #ACA899;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  &:hover { background: linear-gradient(to bottom, #E5F3FF 0%, #C7E1FF 100%); border-color: #316AC5; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid #E0E0E0;
    border-top: 3px solid #316AC5;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  p { margin-top: 12px; font-size: 12px; color: #666; }
  .step { font-size: 10px; color: #999; margin-top: 4px; }
`;

const LogPanel = styled.div`
  background: #1a1a1a;
  color: #00D4AA;
  font-family: 'Consolas', monospace;
  font-size: 10px;
  padding: 8px;
  max-height: 100px;
  overflow-y: auto;
  border-top: 1px solid #333;
  .log-entry { margin: 2px 0; }
  .log-entry.error { color: #FF6B6B; }
  .log-entry.success { color: #00D4AA; }
  .log-entry.info { color: #6C9BCF; }
`;

// Share Modal
const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: #ECE9D8;
  border: 2px solid #0054E3;
  border-radius: 4px;
  padding: 16px;
  min-width: 320px;
  box-shadow: 4px 4px 8px rgba(0,0,0,0.3);
`;

const ModalTitle = styled.div`
  background: linear-gradient(to right, #0054E3, #2E8AEE);
  color: white;
  padding: 4px 8px;
  margin: -16px -16px 12px -16px;
  font-weight: bold;
  font-size: 12px;
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #7F9DB9;
  border-radius: 2px;
  margin-bottom: 12px;
  font-size: 12px;
  box-sizing: border-box;
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
`;

const SharedWithBadge = styled.span`
  background: #E3F2FD;
  color: #1976D2;
  padding: 2px 6px;
  border-radius: 2px;
  font-size: 9px;
  margin-left: 4px;
`;

// ===================== MAIN COMPONENT =====================

export const NotepadApp = () => {
  const { isConnected, address } = useAccount();
  const { 
    isReady, isSupportedNetwork, status,
    createEncryptedInput, createEncryptedInput4x64, 
    requestDecryption, requestDecryption4x64,
    getContract, ethersSigner,
  } = useFhevm();
  
  // Core state
  const [notes, setNotes] = useState([]);
  const [sharedNotes, setSharedNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [selectedSharedNote, setSelectedSharedNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(0);
  
  // UI state
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'shared'
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState('');
  const [isNewNote, setIsNewNote] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);
  const [isDecrypted, setIsDecrypted] = useState(false);
  
  // Sharing modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRecipient, setShareRecipient] = useState('');
  const [sharedWithList, setSharedWithList] = useState([]);
  
  // Categories
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [noteCategories, setNoteCategories] = useState(() => {
    // Load from localStorage on init
    try {
      const saved = localStorage.getItem('notepad-categories');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [filterCategory, setFilterCategory] = useState(-1); // -1 = all
  const [searchQuery, setSearchQuery] = useState('');
  
  // Local cache for decrypted content AND keys
  const [contentCache, setContentCache] = useState({});
  const [keyCache, setKeyCache] = useState({}); // Cache AES key bytes for sharing
  
  const contractAddress = CONTRACT_ADDRESSES?.CipherNotes;
  
  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev.slice(-20), { message, type, time: new Date().toLocaleTimeString() }]);
    console.log(`[Notepad ${type}]`, message);
  };
  
  const CATEGORY_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#F44336', '#607D8B', '#795548'];
  
  useEffect(() => {
    if (isConnected && isReady && contractAddress) {
      loadNotes();
      loadSharedNotes();
      loadCategories();
    }
  }, [isConnected, isReady, contractAddress]);
  
  // Persist noteCategories to localStorage
  useEffect(() => {
    if (Object.keys(noteCategories).length > 0) {
      localStorage.setItem('notepad-categories', JSON.stringify(noteCategories));
    }
  }, [noteCategories]);
  
  const getContractInstance = useCallback(() => {
    if (!contractAddress || !ethersSigner) return null;
    return getContract(contractAddress, CONTRACT_ABIS.CipherNotes);
  }, [contractAddress, getContract, ethersSigner]);
  
  // ===================== LOAD FUNCTIONS =====================
  
  const loadNotes = async () => {
    try {
      setIsLoading(true);
      setLoadingMessage('Loading notes...');
      addLog('Fetching notes...');
      
      const contract = getContractInstance();
      if (!contract) { addLog('Contract not available', 'error'); return; }
      
      const metadata = await contract.getMyNotesMetadata();
      const loadedNotes = [];
      for (let i = 0; i < metadata.ids.length; i++) {
        if (!metadata.deletedFlags[i]) {
          loadedNotes.push({
            id: Number(metadata.ids[i]),
            title: metadata.titles[i] || 'Untitled',
            createdAt: Number(metadata.createdAts[i]),
            updatedAt: Number(metadata.updatedAts[i]),
          });
        }
      }
      setNotes(loadedNotes.sort((a, b) => b.updatedAt - a.updatedAt));
      addLog(`Loaded ${loadedNotes.length} notes`, 'success');
    } catch (error) {
      addLog(`Load failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadSharedNotes = async () => {
    try {
      const contract = getContractInstance();
      if (!contract) return;
      
      addLog('Fetching shared notes...');
      const [owners, noteIds, titles] = await contract.getReceivedNotes();
      
      const shared = [];
      for (let i = 0; i < owners.length; i++) {
        if (titles[i]) { // Still shared
          shared.push({
            owner: owners[i],
            noteId: Number(noteIds[i]),
            title: titles[i],
          });
        }
      }
      setSharedNotes(shared);
      addLog(`Loaded ${shared.length} shared notes`, 'success');
    } catch (error) {
      addLog(`Load shared failed: ${error.message}`, 'error');
    }
  };
  
  const loadCategories = async () => {
    try {
      const contract = getContractInstance();
      if (!contract || !address) return;
      
      const names = await contract.getCategoryNames(address);
      // If all empty, use defaults
      const hasNames = names.some(n => n && n.length > 0);
      if (hasNames) {
        setCategories(names);
      }
    } catch (error) {
      // Categories not set, use defaults
    }
  };
  
  const loadSharedWithList = async (noteId) => {
    try {
      const contract = getContractInstance();
      if (!contract) return;
      
      const list = await contract.getSharedWithList(noteId);
      setSharedWithList(list);
    } catch (error) {
      setSharedWithList([]);
    }
  };
  
  // ===================== NOTE SELECTION =====================
  
  const selectNote = async (note) => {
    setSelectedNoteId(note.id);
    setSelectedSharedNote(null);
    setTitle(note.title);
    setIsNewNote(false);
    setIsDecrypted(false);
    
    // Load shared with list
    await loadSharedWithList(note.id);
    
    // Check cache
    if (contentCache[`my-${note.id}`]) {
      setContent(contentCache[`my-${note.id}`]);
      setIsDecrypted(true);
    } else {
      setContent('[🔐 Encrypted - Click "Decrypt" to view]');
    }
  };
  
  const selectSharedNote = async (note) => {
    setSelectedSharedNote(note);
    setSelectedNoteId(null);
    setTitle(note.title + ' (shared)');
    setIsNewNote(false);
    setIsDecrypted(false);
    
    // Check cache
    const cacheKey = `shared-${note.owner}-${note.noteId}`;
    if (contentCache[cacheKey]) {
      setContent(contentCache[cacheKey]);
      setIsDecrypted(true);
    } else {
      setContent('[🔐 Shared note - Click "Decrypt" to view]');
    }
  };
  
  const handleNewNote = () => {
    setSelectedNoteId(null);
    setSelectedSharedNote(null);
    setTitle('');
    setContent('');
    setSelectedCategory(0);
    setIsNewNote(true);
    setIsDecrypted(true);
    setSharedWithList([]);
    addLog('Creating new note...');
  };
  
  // ===================== SAVE FUNCTION =====================
  
  const handleSave = async () => {
    if (!title.trim()) { alert('Enter a title'); return; }
    if (!isReady) { alert('FHE not ready'); return; }
    
    const contract = getContractInstance();
    if (!contract) { alert('Contract not available'); return; }
    
    try {
      setIsLoading(true);
      
      if (isNewNote || isDecrypted) {
        // Full save with content encryption
        setLoadingMessage('Encrypting & saving...');
        
        // Step 1: Generate AES-256 key
        setLoadingStep('1/5: Generating AES key...');
        addLog('Generating AES-256 key...');
        const aesKey = await generateAESKey();
        const keyBytes = await exportKeyToBytes(aesKey);
        addLog('AES key generated ✓', 'success');
        
        // Step 2: AES encrypt content
        setLoadingStep('2/5: AES encrypting content...');
        addLog('Encrypting content with AES-GCM...');
        const encryptedContent = await aesEncrypt(content || '', aesKey);
        addLog(`Encrypted: ${encryptedContent.length} bytes ✓`, 'success');
        
        // Step 3: Upload to IPFS (via Storacha)
        setLoadingStep('3/5: Uploading to IPFS...');
        addLog('Uploading to Storacha IPFS...');
        const ipfsCid = await uploadToIPFS(encryptedContent);
        addLog(`IPFS CID: ${ipfsCid.toString().slice(0, 20)}... ✓`, 'success');
        
        // Step 4: FHE encrypt 4 key chunks (32 bytes = 4 x 8 bytes)
        setLoadingStep('4/5: FHE encrypting key...');
        addLog('FHE encrypting 4 key chunks (256-bit AES key)...');
        
        // Split 32-byte key into 4 x 8-byte chunks
        const k1Value = keyChunkToBigInt(keyBytes, 0);
        const k2Value = keyChunkToBigInt(keyBytes, 8);
        const k3Value = keyChunkToBigInt(keyBytes, 16);
        const k4Value = keyChunkToBigInt(keyBytes, 24);
        
        // FHE encrypt all 4 chunks in single input (required for shared proof)
        const encryptedKeys = await createEncryptedInput4x64(
          k1Value, k2Value, k3Value, k4Value, contractAddress
        );
        addLog('FHE encryption complete ✓', 'success');
        
        // Step 5: Store on-chain (CID as plain bytes + 4 encrypted key chunks)
        setLoadingStep('5/5: Storing on-chain...');
        
        // Convert CID to bytes
        const cidBytes = new TextEncoder().encode(ipfsCid.toString());
        
        let actualNoteId;
        
        if (isNewNote) {
          addLog('Creating note on-chain...');
          const tx = await contract.createNote(
            title,
            cidBytes,
            encryptedKeys.handles[0], encryptedKeys.handles[1], 
            encryptedKeys.handles[2], encryptedKeys.handles[3],
            encryptedKeys.inputProof
          );
          addLog(`TX: ${tx.hash}`);
          const receipt = await tx.wait();
          
          // Parse NoteCreated event
          const noteCreatedEvent = receipt.logs.find(log => {
            try {
              const parsed = contract.interface.parseLog(log);
              return parsed?.name === 'NoteCreated';
            } catch { return false; }
          });
          
          if (noteCreatedEvent) {
            const parsed = contract.interface.parseLog(noteCreatedEvent);
            actualNoteId = Number(parsed.args.noteId);
            addLog(`Note created with ID: ${actualNoteId}`, 'success');
          } else {
            const total = await contract.getTotalNotes();
            actualNoteId = Number(total) - 1;
          }
          
          // Set category if not default
          if (selectedCategory > 0) {
            addLog('Setting category...');
            const encCategory = await createEncryptedInput(selectedCategory, contractAddress, 8);
            const catTx = await contract.setNoteCategory(actualNoteId, encCategory.handles[0], encCategory.inputProof);
            await catTx.wait();
            addLog('Category set ✓', 'success');
            // Also save to local state for filter to work
            setNoteCategories(prev => ({ ...prev, [actualNoteId]: selectedCategory }));
          }
          
        } else {
          actualNoteId = selectedNoteId;
          addLog('Updating note content on-chain...');
          const tx = await contract.updateContent(
            selectedNoteId,
            cidBytes,
            encryptedKeys.handles[0], encryptedKeys.handles[1], 
            encryptedKeys.handles[2], encryptedKeys.handles[3],
            encryptedKeys.inputProof
          );
          addLog(`TX: ${tx.hash}`);
          await tx.wait();
        }
        
        addLog('Saved! ✓', 'success');
        
        setContentCache(prev => ({ ...prev, [`my-${actualNoteId}`]: content }));
        await loadNotes();
        setIsNewNote(false);
        setSelectedNoteId(actualNoteId);

        // Lock the note after saving (user must decrypt to edit again)
        setIsDecrypted(false);
        setContent('[🔒 Encrypted - Click Decrypt to view and edit]');
        
        
      } else {
        // Title-only update
        setLoadingMessage('Updating title...');
        addLog('Updating title...');
        const tx = await contract.updateTitle(selectedNoteId, title);
        await tx.wait();
        addLog('Title updated ✓', 'success');
        setNotes(notes.map(n => n.id === selectedNoteId ? { ...n, title } : n));
      }
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      alert(`Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };
  
  // ===================== DECRYPT FUNCTION =====================
  
  const handleDecrypt = async () => {
    const contract = getContractInstance();
    if (!contract) return;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Decrypting...');
      
      let cidBytes, keyHandles, cacheKey;
      
      if (selectedSharedNote) {
        // Decrypt shared note
        setLoadingStep('1/4: Fetching shared note CID...');
        addLog('Fetching shared note from contract...');
        
        cidBytes = await contract.getSharedNoteCID(selectedSharedNote.owner, selectedSharedNote.noteId);
        const keyChunksBytes32 = await contract.getSharedNoteKeyChunks(selectedSharedNote.owner, selectedSharedNote.noteId);
        
        // Convert bytes32[4] to handles
        keyHandles = keyChunksBytes32;
        cacheKey = `shared-${selectedSharedNote.owner}-${selectedSharedNote.noteId}`;
      } else {
        // Decrypt own note
        setLoadingStep('1/4: Fetching CID from contract...');
        addLog('Fetching IPFS CID from contract...');
        
        cidBytes = await contract.getNoteCID(selectedNoteId);
        const chunks = await contract.getNoteKeyChunks(selectedNoteId);
        keyHandles = [chunks[0], chunks[1], chunks[2], chunks[3]];
        cacheKey = `my-${selectedNoteId}`;
      }
      
      const ipfsCid = new TextDecoder().decode(
        new Uint8Array(cidBytes.slice(2).match(/.{1,2}/g).map(b => parseInt(b, 16)))
      );
      addLog(`CID: ${ipfsCid.slice(0, 20)}... ✓`, 'success');
      
      // Step 2: FHE decrypt key chunks
      setLoadingStep('2/4: FHE decrypting key chunks...');
      addLog('Requesting FHE Gateway decryption for 4 key chunks...');
      
      const decryptedChunks = await requestDecryption4x64(
        keyHandles,
        contractAddress
      );
      
      if (!decryptedChunks[0] && !decryptedChunks[1] && !decryptedChunks[2] && !decryptedChunks[3]) {
        throw new Error('Gateway returned null values - decryption did not work');
      }
      
      addLog(`Key chunks: [${decryptedChunks.map(c => c !== null && c !== undefined ? '✓' : '✗').join(',')}]`, 'success');
      
      // Reconstruct 32-byte AES key from 4 x 8-byte chunks
      const keyBytes = new Uint8Array(32);
      const chunk1 = bigIntToKeyChunk(BigInt(decryptedChunks[0] || 0));
      const chunk2 = bigIntToKeyChunk(BigInt(decryptedChunks[1] || 0));
      const chunk3 = bigIntToKeyChunk(BigInt(decryptedChunks[2] || 0));
      const chunk4 = bigIntToKeyChunk(BigInt(decryptedChunks[3] || 0));
      keyBytes.set(chunk1, 0);
      keyBytes.set(chunk2, 8);
      keyBytes.set(chunk3, 16);
      keyBytes.set(chunk4, 24);
      
      // Step 3: Fetch encrypted content from IPFS
      setLoadingStep('3/4: Fetching from IPFS...');
      addLog(`Fetching from Storacha: ${ipfsCid.slice(0, 15)}...`);
      
      const encryptedContent = await downloadFromIPFS(ipfsCid);
      addLog(`Downloaded: ${encryptedContent.length} bytes ✓`, 'success');
      
      // Step 4: AES decrypt
      setLoadingStep('4/4: AES decrypting...');
      addLog('Decrypting with AES-GCM...');
      
      const aesKey = await importKeyFromBytes(keyBytes);
      const decryptedText = await aesDecrypt(encryptedContent, aesKey);
      addLog('Decrypted! ✓', 'success');
      
      setContent(decryptedText);
      setIsDecrypted(true);
      setContentCache(prev => ({ ...prev, [cacheKey]: decryptedText }));
      // Cache the key bytes for sharing
      setKeyCache(prev => ({ ...prev, [cacheKey]: keyBytes }));
      
    } catch (error) {
      addLog(`Decrypt failed: ${error.message}`, 'error');
      setContent(`[Decryption failed]\n\nError: ${error.message}\n\nPlease try again.`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };
  
  // ===================== SHARE FUNCTION =====================
  
  const handleShare = async () => {
    if (!shareRecipient || !selectedNoteId) return;
    
    // Validate address
    if (!/^0x[a-fA-F0-9]{40}$/.test(shareRecipient)) {
      alert('Invalid Ethereum address');
      return;
    }
    
    if (shareRecipient.toLowerCase() === address?.toLowerCase()) {
      alert('Cannot share with yourself');
      return;
    }
    
    const contract = getContractInstance();
    if (!contract) return;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Sharing note...');
      
      // First, we need the AES key - user must have decrypted the note
      if (!isDecrypted) {
        alert('Please decrypt the note first before sharing');
        setIsLoading(false);
        return;
      }
      
      // Get the cached AES key bytes
      const cacheKey = `my-${selectedNoteId}`;
      const keyBytes = keyCache[cacheKey];
      
      if (!keyBytes) {
        alert('Key not found in cache. Please decrypt the note again.');
        setIsLoading(false);
        return;
      }
      
      addLog(`Sharing note ${selectedNoteId} with ${shareRecipient.slice(0, 8)}...`);
      
      setLoadingStep('1/3: Encrypting key for recipient...');
      
      // Use the SAME AES key that was used to encrypt the content
      // Split into 4 chunks
      const k1Value = keyChunkToBigInt(keyBytes, 0);
      const k2Value = keyChunkToBigInt(keyBytes, 8);
      const k3Value = keyChunkToBigInt(keyBytes, 16);
      const k4Value = keyChunkToBigInt(keyBytes, 24);
      
      // FHE encrypt for recipient (same key, but recipient can decrypt)
      const encryptedKeys = await createEncryptedInput4x64(
        k1Value, k2Value, k3Value, k4Value, contractAddress
      );
      
      setLoadingStep('2/3: Storing shared keys on-chain...');
      addLog('Calling shareNote on contract...');
      
      const tx = await contract.shareNote(
        selectedNoteId,
        shareRecipient,
        encryptedKeys.handles[0], encryptedKeys.handles[1],
        encryptedKeys.handles[2], encryptedKeys.handles[3],
        encryptedKeys.inputProof
      );
      
      addLog(`TX: ${tx.hash}`);
      await tx.wait();
      
      setLoadingStep('3/3: Complete!');
      addLog(`Note shared with ${shareRecipient.slice(0, 8)}... ✓`, 'success');
      
      setShowShareModal(false);
      setShareRecipient('');
      await loadSharedWithList(selectedNoteId);
      
    } catch (error) {
      addLog(`Share failed: ${error.message}`, 'error');
      alert(`Failed to share: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };
  
  // ===================== DELETE FUNCTION =====================
  
  const handleDelete = async () => {
    if (selectedNoteId === null || !confirm('Delete?')) return;
    const contract = getContractInstance();
    if (!contract) return;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Deleting...');
      addLog(`Deleting note ${selectedNoteId}...`);
      
      const tx = await contract.deleteNote(selectedNoteId);
      await tx.wait();
      
      addLog('Deleted ✓', 'success');
      
      setNotes(notes.filter(n => n.id !== selectedNoteId));
      setSelectedNoteId(null);
      setTitle('');
      setContent('');
      setContentCache(prev => { const c = { ...prev }; delete c[`my-${selectedNoteId}`]; return c; });
    } catch (error) {
      addLog(`Delete failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // ===================== CATEGORY FUNCTION =====================
  
  const handleSetCategory = async (category) => {
    if (selectedNoteId === null) return;
    
    const contract = getContractInstance();
    if (!contract) return;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Setting category...');
      
      addLog(`Setting category ${category} for note ${selectedNoteId}...`);
      
      // FHE encrypt category (8-bit)
      const encCategory = await createEncryptedInput(category, contractAddress, 8);
      
      const tx = await contract.setNoteCategory(
        selectedNoteId,
        encCategory.handles[0],
        encCategory.inputProof
      );
      
      await tx.wait();
      addLog('Category set ✓', 'success');
      
      setNoteCategories(prev => ({ ...prev, [selectedNoteId]: category }));
      
    } catch (error) {
      addLog(`Set category failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // ===================== RENDER =====================
  
  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const selectedNote = notes.find(n => n.id === selectedNoteId);
  
  if (!isConnected) return <Container><EmptyState><div className="icon">🔌</div><h3>Connect Wallet</h3></EmptyState></Container>;
  if (!isSupportedNetwork) return <Container><EmptyState><div className="icon">⚠️</div><h3>Switch to Sepolia</h3></EmptyState></Container>;
  if (!contractAddress) return <Container><EmptyState><div className="icon">📝</div><h3>Contract not configured</h3><p style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 8 }}>VITE_CIPHERNOTES_ADDRESS=0x...</p></EmptyState></Container>;
  
  return (
    <Container>
      {isLoading && (
        <LoadingOverlay>
          <div className="spinner" />
          <p>{loadingMessage}</p>
          {loadingStep && <p className="step">{loadingStep}</p>}
        </LoadingOverlay>
      )}
      
      {/* Share Modal */}
      {showShareModal && (
        <Modal onClick={() => setShowShareModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalTitle>🔗 Share Note</ModalTitle>
            <p style={{ fontSize: 11, marginBottom: 12 }}>Enter recipient's Ethereum address:</p>
            <ModalInput
              placeholder="0x..."
              value={shareRecipient}
              onChange={e => setShareRecipient(e.target.value)}
            />
            {sharedWithList.length > 0 && (
              <div style={{ marginBottom: 12, fontSize: 10 }}>
                <strong>Already shared with:</strong>
                {sharedWithList.map(addr => (
                  <div key={addr} style={{ color: '#666' }}>{addr.slice(0, 8)}...{addr.slice(-6)}</div>
                ))}
              </div>
            )}
            <ModalButtons>
              <ActionButton onClick={() => setShowShareModal(false)}>Cancel</ActionButton>
              <ActionButton onClick={handleShare} disabled={!shareRecipient}>Share</ActionButton>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}
      
      <MenuBar>
        <MenuItem onClick={handleNewNote}>New</MenuItem>
        <MenuItem onClick={() => setShowLogs(!showLogs)}>{showLogs ? 'Hide' : 'Show'} Logs</MenuItem>
        <MenuItem onClick={() => { loadNotes(); loadSharedNotes(); }}>Refresh</MenuItem>
      </MenuBar>
      
      <MainContent>
        <Sidebar>
          <TabBar>
            <Tab $active={activeTab === 'my'} onClick={() => setActiveTab('my')}>📁 My Notes</Tab>
            <Tab $active={activeTab === 'shared'} onClick={() => setActiveTab('shared')}>📨 Shared</Tab>
          </TabBar>
          
          {activeTab === 'my' && (
            <>
              <SidebarHeader>📁 My Notes ({notes.length})</SidebarHeader>
              <NewNoteBtn onClick={handleNewNote} disabled={!isReady}>➕ New Note</NewNoteBtn>
              {/* Search Input */}
              <div style={{ padding: '4px 8px' }}>
                <input
                  type="text"
                  placeholder="🔍 Search notes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #7F9DB9',
                    borderRadius: '2px',
                    fontSize: '11px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              {/* Category Filter */}
              <div style={{ padding: '0 8px 4px' }}>
                <CategorySelect 
                  value={filterCategory}
                  onChange={e => setFilterCategory(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                >
                  <option value={-1}>📂 All Categories</option>
                  {categories.map((cat, i) => (
                    <option key={i} value={i}>
                      {cat} ({notes.filter(n => noteCategories[n.id] === i).length})
                    </option>
                  ))}
                </CategorySelect>
              </div>
              <NotesList>
                {!isReady ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#666' }}>FHE: {status}</div>
                ) : notes.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#666' }}>No notes yet</div>
                ) : notes
                    .filter(note => {
                      // Category filter
                      if (filterCategory !== -1 && noteCategories[note.id] !== filterCategory) return false;
                      // Search filter (title or cached content)
                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        const titleMatch = note.title.toLowerCase().includes(q);
                        const contentMatch = contentCache[`my-${note.id}`]?.toLowerCase().includes(q);
                        if (!titleMatch && !contentMatch) return false;
                      }
                      return true;
                    })
                    .map(note => (
                  <NoteItem 
                    key={note.id} 
                    $active={note.id === selectedNoteId} 
                    $categoryColor={CATEGORY_COLORS[noteCategories[note.id] || 0]}
                    onClick={() => selectNote(note)}
                  >
                    <span className="category-dot" />
                    <span className="title">{note.title}</span>
                    <span>{contentCache[`my-${note.id}`] ? '🔓' : '🔒'}</span>
                  </NoteItem>
                ))}
              </NotesList>
            </>
          )}
          
          {activeTab === 'shared' && (
            <>
              <SidebarHeader>📨 Shared With Me ({sharedNotes.length})</SidebarHeader>
              <NotesList>
                {sharedNotes.length === 0 ? (
                  <div style={{ padding: 12, textAlign: 'center', fontSize: 11, color: '#666' }}>No shared notes</div>
                ) : sharedNotes.map((note, i) => (
                  <NoteItem 
                    key={i} 
                    $active={selectedSharedNote?.owner === note.owner && selectedSharedNote?.noteId === note.noteId}
                    onClick={() => selectSharedNote(note)}
                  >
                    <span>📄</span>
                    <span className="title">{note.title}</span>
                    <span style={{ fontSize: 9, color: '#666' }}>{note.owner.slice(0, 6)}...</span>
                  </NoteItem>
                ))}
              </NotesList>
            </>
          )}
        </Sidebar>
        
        <EditorArea>
          {selectedNoteId !== null || selectedSharedNote || isNewNote ? (
            <>
              <EditorHeader>
                <TitleInput 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="Title..." 
                  readOnly={!!selectedSharedNote}
                />
                {(isNewNote || selectedNoteId !== null) && !selectedSharedNote && (
                  <CategorySelect 
                    value={selectedCategory}
                    onChange={e => {
                      const cat = parseInt(e.target.value);
                      setSelectedCategory(cat);
                      if (!isNewNote && selectedNoteId !== null) {
                        handleSetCategory(cat);
                      }
                    }}
                  >
                    {categories.map((cat, i) => (
                      <option key={i} value={i}>{cat}</option>
                    ))}
                  </CategorySelect>
                )}
                {!selectedSharedNote && (
                  <ActionButton onClick={handleSave} disabled={isLoading || !isReady}>
                    💾 {isNewNote || isDecrypted ? 'Save' : 'Update Title'}
                  </ActionButton>
                )}
                {!isNewNote && (
                  <>
                    {!isDecrypted && <ActionButton onClick={handleDecrypt} disabled={isLoading}>🔓 Decrypt</ActionButton>}
                    {!selectedSharedNote && (
                      <>
                        <ActionButton onClick={() => setShowShareModal(true)} disabled={isLoading || !isDecrypted}>
                          🔗 Share
                        </ActionButton>
                        <ActionButton onClick={handleDelete} disabled={isLoading}>🗑️</ActionButton>
                      </>
                    )}
                  </>
                )}
                {sharedWithList.length > 0 && (
                  <SharedWithBadge>Shared: {sharedWithList.length}</SharedWithBadge>
                )}
              </EditorHeader>
              <EditorTextarea 
                value={content} 
                onChange={e => setContent(e.target.value)} 
                placeholder="Write your note..."
                readOnly={(!isNewNote && !isDecrypted) || !!selectedSharedNote}
              />
            </>
          ) : (
            <EmptyState>
              <div className="icon">📝</div>
              <h3>Select or create a note</h3>
              {isReady && <p style={{ color: '#4CAF50' }}>✓ FHE Ready</p>}
            </EmptyState>
          )}
        </EditorArea>
      </MainContent>
      
      {showLogs && (
        <LogPanel>
          {logs.map((log, i) => (
            <div key={i} className={`log-entry ${log.type}`}>[{log.time}] {log.message}</div>
          ))}
        </LogPanel>
      )}
      
      <StatusBar>
        <StatusItem>
          <EncryptionBadge $encrypted={isReady}>{isReady ? '🔐 FHE Ready' : `⏳ ${status}`}</EncryptionBadge>
        </StatusItem>
        <StatusItem>{isDecrypted ? '✏️ Editing' : '🔒 Encrypted'}</StatusItem>
        <StatusItem>{selectedNote ? formatDate(selectedNote.updatedAt) : ''}</StatusItem>
      </StatusBar>
    </Container>
  );
};

export default NotepadApp;
