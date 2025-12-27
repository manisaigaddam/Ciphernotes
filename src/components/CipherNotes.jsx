import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FileText, FolderOpen, Lock, Plus, Search, Send, Share2, Shield, Tag, Trash2, Unlock, Users, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useAccount } from 'wagmi';
import { CONTRACT_ABIS, CONTRACT_ADDRESSES } from '../config/contracts';
import { useFhevm } from '../hooks/useFhevm';
import { downloadFromIPFS, uploadToIPFS } from '../lib/ipfs';

// ===================== CRYPTO UTILS =====================

const generateAESKey = async () => {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  return key;
};

const exportKeyToBytes = async (key) => {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
};

const importKeyFromBytes = async (keyBytes) => {
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

const aesEncrypt = async (plaintext, key) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
};

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

// ===================== STYLED COMPONENTS =====================

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(131, 110, 249, 0.2);
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.5rem;
  font-weight: 700;
  
  .icon {
    width: 40px;
    height: 40px;
    background: linear-gradient(135deg, #836EF9 0%, #6366f1 100%);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  span {
    background: linear-gradient(135deg, #836EF9 0%, #a5b4fc 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const StatusBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: ${props => props.$ready ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'};
  border: 1px solid ${props => props.$ready ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)'};
  border-radius: 20px;
  font-size: 0.85rem;
  color: ${props => props.$ready ? '#10b981' : '#f59e0b'};
  
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: ${props => props.$ready ? 'none' : 'pulse 2s infinite'};
  }
`;

const MainLayout = styled.div`
  flex: 1;
  display: flex;
  overflow: hidden;
  
  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const Sidebar = styled.aside`
  width: 340px;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(131, 110, 249, 0.1);
  display: flex;
  flex-direction: column;
  
  @media (max-width: 768px) {
    width: 100%;
    max-height: 250px;
  }
`;

const SidebarHeader = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid rgba(131, 110, 249, 0.1);
`;

const TabBar = styled.div`
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px;
  border-radius: 10px;
`;

const Tab = styled.button`
  flex: 1;
  padding: 8px 12px;
  background: ${props => props.$active ? 'linear-gradient(135deg, #836EF9 0%, #6366f1 100%)' : 'transparent'};
  border: none;
  border-radius: 8px;
  color: ${props => props.$active ? 'white' : '#94a3b8'};
  font-size: 0.8rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.$active ? '' : 'rgba(131, 110, 249, 0.1)'};
  }
`;

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(131, 110, 249, 0.2);
  border-radius: 8px;
  
  input {
    flex: 1;
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 0.9rem;
    
    &:focus { outline: none; }
    &::placeholder { color: #64748b; }
  }
  
  svg { color: #64748b; }
`;

const CategoryFilter = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const CategoryPill = styled.button`
  padding: 4px 10px;
  background: ${props => props.$active ? 'rgba(131, 110, 249, 0.3)' : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.$active ? '#836EF9' : 'rgba(131, 110, 249, 0.2)'};
  border-radius: 12px;
  color: ${props => props.$active ? '#a5b4fc' : '#94a3b8'};
  font-size: 0.7rem;
  transition: all 0.2s;
  
  &:hover {
    background: rgba(131, 110, 249, 0.2);
  }
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const NewNoteBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #836EF9 0%, #6366f1 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 0.85rem;
  font-weight: 500;
  
  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const NotesList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
`;

const NoteItem = styled.div`
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  background: ${props => props.$active ? 'rgba(131, 110, 249, 0.2)' : 'transparent'};
  border: 1px solid ${props => props.$active ? 'rgba(131, 110, 249, 0.5)' : 'transparent'};
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(131, 110, 249, 0.1);
  }
  
  .title {
    font-size: 0.95rem;
    font-weight: 500;
    color: #f8fafc;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .meta {
    font-size: 0.75rem;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .category-tag {
    padding: 2px 6px;
    background: rgba(131, 110, 249, 0.2);
    border-radius: 4px;
    font-size: 0.65rem;
    color: #a5b4fc;
  }
  
  .shared-by {
    color: #10b981;
    font-style: italic;
  }
`;

const EditorArea = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.1);
`;

const EditorHeader = styled.div`
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(131, 110, 249, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const TitleInput = styled.input`
  flex: 1;
  min-width: 200px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(131, 110, 249, 0.3);
  border-radius: 8px;
  color: #f8fafc;
  font-size: 1rem;
  
  &:focus {
    outline: none;
    border-color: #836EF9;
    box-shadow: 0 0 0 3px rgba(131, 110, 249, 0.2);
  }
  
  &::placeholder {
    color: #64748b;
  }
`;

const CategorySelect = styled.select`
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(131, 110, 249, 0.3);
  border-radius: 8px;
  color: #f8fafc;
  font-size: 0.85rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #836EF9;
  }
  
  option {
    background: #1a1a2e;
    color: #f8fafc;
  }
`;

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: ${props => props.$primary 
    ? 'linear-gradient(135deg, #836EF9 0%, #6366f1 100%)' 
    : props.$danger 
    ? 'rgba(239, 68, 68, 0.2)' 
    : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.$primary ? 'transparent' : props.$danger ? 'rgba(239, 68, 68, 0.5)' : 'rgba(131, 110, 249, 0.3)'};
  border-radius: 8px;
  color: ${props => props.$danger ? '#ef4444' : 'white'};
  font-size: 0.85rem;
  font-weight: 500;
  
  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const EditorContent = styled.div`
  flex: 1;
  padding: 24px;
  display: flex;
  flex-direction: column;
`;

const ContentTextarea = styled.textarea`
  flex: 1;
  padding: 20px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(131, 110, 249, 0.2);
  border-radius: 12px;
  color: #f8fafc;
  font-size: 1rem;
  font-family: 'Inter', sans-serif;
  line-height: 1.6;
  resize: none;
  
  &:focus {
    outline: none;
    border-color: #836EF9;
  }
  
  &::placeholder {
    color: #64748b;
  }
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
  text-align: center;
  padding: 40px;
  
  .icon {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.5;
  }
  
  h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #94a3b8;
  }
  
  p {
    font-size: 0.9rem;
    max-width: 400px;
  }
`;

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  
  .spinner {
    width: 48px;
    height: 48px;
    border: 3px solid rgba(131, 110, 249, 0.2);
    border-top: 3px solid #836EF9;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  h4 {
    margin-top: 20px;
    font-size: 1.1rem;
    color: #f8fafc;
  }
  
  p {
    margin-top: 8px;
    font-size: 0.85rem;
    color: #94a3b8;
  }
`;

const Modal = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  border: 1px solid rgba(131, 110, 249, 0.3);
  border-radius: 16px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  
  h3 {
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  button {
    padding: 4px;
    background: none;
    border: none;
    color: #94a3b8;
    
    &:hover {
      color: #f8fafc;
    }
  }
`;

const ModalInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(131, 110, 249, 0.3);
  border-radius: 8px;
  color: #f8fafc;
  font-size: 0.95rem;
  margin-bottom: 16px;
  
  &:focus {
    outline: none;
    border-color: #836EF9;
  }
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`;

const LogPanel = styled.div`
  background: rgba(0, 0, 0, 0.5);
  border-top: 1px solid rgba(131, 110, 249, 0.2);
  padding: 12px 24px;
  max-height: 100px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  
  .log-entry {
    padding: 2px 0;
    color: #64748b;
    
    &.success { color: #10b981; }
    &.error { color: #ef4444; }
    &.info { color: #6366f1; }
  }
`;

const FeatureCards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-top: 40px;
`;

const FeatureCard = styled.div`
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(131, 110, 249, 0.2);
  border-radius: 12px;
  padding: 24px;
  
  .icon {
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, rgba(131, 110, 249, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    color: #836EF9;
  }
  
  h4 {
    font-size: 1rem;
    margin-bottom: 8px;
    color: #f8fafc;
  }
  
  p {
    font-size: 0.85rem;
    color: #94a3b8;
    line-height: 1.5;
  }
`;

const FHEInfoBox = styled.div`
  background: rgba(131, 110, 249, 0.1);
  border: 1px solid rgba(131, 110, 249, 0.3);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 0.8rem;
  color: #a5b4fc;
  
  strong {
    color: #836EF9;
  }
`;

// ===================== DEFAULT CATEGORIES =====================

const DEFAULT_CATEGORIES = ['Personal', 'Work', 'Ideas', 'Important', 'Archive', 'Travel', 'Finance', 'Health'];

// ===================== MAIN COMPONENT =====================

const CipherNotes = () => {
  const { isConnected, address } = useAccount();
  const { 
    isReady, isSupportedNetwork, status,
    createEncryptedInput, createEncryptedInput4x64, 
    requestDecryption, requestDecryption4x64,
    getContract, ethersSigner,
  } = useFhevm();
  
  // Core state
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedNoteCategory, setSelectedNoteCategory] = useState(0);
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState('');
  const [isNewNote, setIsNewNote] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isDecrypted, setIsDecrypted] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('my'); // 'my' | 'shared'
  
  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(null); // null = all
  
  // Categories
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [noteCategoryMap, setNoteCategoryMap] = useState({}); // noteId -> categoryIndex
  
  // Shared notes
  const [sharedNotes, setSharedNotes] = useState([]);
  const [selectedSharedNote, setSelectedSharedNote] = useState(null); // {owner, noteId}
  
  // Sharing modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRecipient, setShareRecipient] = useState('');
  
  // Caches
  const [contentCache, setContentCache] = useState({});
  const [keyCache, setKeyCache] = useState({});
  
  const contractAddress = CONTRACT_ADDRESSES?.CipherNotes;
  
  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev.slice(-15), { message, type, time: new Date().toLocaleTimeString() }]);
    console.log(`[CipherNotes ${type}]`, message);
  };
  
  useEffect(() => {
    if (isConnected && isReady && contractAddress) {
      loadNotes();
      loadSharedNotes();
      loadCategoryNames();
    }
  }, [isConnected, isReady, contractAddress]);
  
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
      const result = await contract.getReceivedNotes();
      
      const shared = [];
      for (let i = 0; i < result.owners.length; i++) {
        if (result.titles[i]) {
          shared.push({
            owner: result.owners[i],
            noteId: Number(result.noteIds[i]),
            title: result.titles[i],
          });
        }
      }
      setSharedNotes(shared);
      addLog(`Found ${shared.length} shared notes`, 'success');
    } catch (error) {
      addLog(`Load shared failed: ${error.message}`, 'error');
    }
  };
  
  const loadCategoryNames = async () => {
    try {
      const contract = getContractInstance();
      if (!contract) return;
      
      const names = await contract.getCategoryNames(address);
      const filtered = names.map((n, i) => n || DEFAULT_CATEGORIES[i] || `Category ${i + 1}`);
      setCategories(filtered);
    } catch (error) {
      addLog(`Load categories failed: ${error.message}`, 'error');
    }
  };
  
  // ===================== NOTE SELECTION =====================
  
  const selectNote = async (note) => {
    setSelectedNoteId(note.id);
    setSelectedSharedNote(null);
    setTitle(note.title);
    setIsNewNote(false);
    setIsDecrypted(false);
    setSelectedNoteCategory(noteCategoryMap[note.id] || 0);
    
    const cacheKey = `my-${note.id}`;
    if (contentCache[cacheKey]) {
      setContent(contentCache[cacheKey]);
      setIsDecrypted(true);
    } else {
      setContent('[🔐 Encrypted - Click "Decrypt" to view]');
    }
  };
  
  const selectSharedNote = async (shared) => {
    setSelectedSharedNote(shared);
    setSelectedNoteId(null);
    setTitle(shared.title);
    setIsNewNote(false);
    setIsDecrypted(false);
    
    const cacheKey = `shared-${shared.owner}-${shared.noteId}`;
    if (contentCache[cacheKey]) {
      setContent(contentCache[cacheKey]);
      setIsDecrypted(true);
    } else {
      setContent('[🔐 Shared Note - Click "Decrypt" to view]');
    }
  };
  
  const handleNewNote = () => {
    setSelectedNoteId(null);
    setSelectedSharedNote(null);
    setTitle('');
    setContent('');
    setIsNewNote(true);
    setIsDecrypted(true);
    setSelectedNoteCategory(0);
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
        setLoadingMessage('Encrypting & saving...');
        
        setLoadingStep('1/5: Generating AES key...');
        addLog('Generating AES-256 key...');
        const aesKey = await generateAESKey();
        const keyBytes = await exportKeyToBytes(aesKey);
        addLog('AES key generated ✓', 'success');
        
        setLoadingStep('2/5: AES encrypting content...');
        addLog('Encrypting content with AES-GCM...');
        const encryptedContent = await aesEncrypt(content || '', aesKey);
        addLog(`Encrypted: ${encryptedContent.length} bytes ✓`, 'success');
        
        setLoadingStep('3/5: Uploading to IPFS...');
        addLog('Uploading to Storacha IPFS...');
        const ipfsCid = await uploadToIPFS(encryptedContent);
        addLog(`IPFS CID: ${ipfsCid.toString().slice(0, 20)}... ✓`, 'success');
        
        setLoadingStep('4/5: FHE encrypting key chunks...');
        addLog('FHE encrypting 4 key chunks (256-bit AES key)...');
        
        const k1Value = keyChunkToBigInt(keyBytes, 0);
        const k2Value = keyChunkToBigInt(keyBytes, 8);
        const k3Value = keyChunkToBigInt(keyBytes, 16);
        const k4Value = keyChunkToBigInt(keyBytes, 24);
        
        const encryptedKeys = await createEncryptedInput4x64(
          k1Value, k2Value, k3Value, k4Value, contractAddress
        );
        addLog('FHE encryption complete ✓', 'success');
        
        setLoadingStep('5/5: Storing on-chain...');
        
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
        setKeyCache(prev => ({ ...prev, [`my-${actualNoteId}`]: keyBytes }));
        await loadNotes();
        setIsNewNote(false);
        setSelectedNoteId(actualNoteId);
        
      } else {
        // Just update title
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
    
    const isShared = selectedSharedNote !== null;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Decrypting...');
      
      let ipfsCid, keyHandles, cacheKey;
      
      if (isShared) {
        setLoadingStep('1/4: Fetching shared note data...');
        addLog(`Fetching shared note from ${selectedSharedNote.owner.slice(0, 8)}...`);
        
        const cidBytes = await contract.getSharedNoteCID(selectedSharedNote.owner, selectedSharedNote.noteId);
        const keyBytes32 = await contract.getSharedNoteKeyChunks(selectedSharedNote.owner, selectedSharedNote.noteId);
        
        keyHandles = keyBytes32; // bytes32 handles for shared
        cacheKey = `shared-${selectedSharedNote.owner}-${selectedSharedNote.noteId}`;
        
        ipfsCid = new TextDecoder().decode(
          new Uint8Array(cidBytes.slice(2).match(/.{1,2}/g).map(b => parseInt(b, 16)))
        );
      } else {
        setLoadingStep('1/4: Fetching CID from contract...');
        addLog('Fetching IPFS CID from contract...');
        
        const cidBytes = await contract.getNoteCID(selectedNoteId);
        const chunks = await contract.getNoteKeyChunks(selectedNoteId);
        keyHandles = [chunks[0], chunks[1], chunks[2], chunks[3]];
        cacheKey = `my-${selectedNoteId}`;
        
        ipfsCid = new TextDecoder().decode(
          new Uint8Array(cidBytes.slice(2).match(/.{1,2}/g).map(b => parseInt(b, 16)))
        );
      }
      
      addLog(`CID: ${ipfsCid.slice(0, 20)}... ✓`, 'success');
      
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
      
      const keyBytes = new Uint8Array(32);
      const chunk1 = bigIntToKeyChunk(BigInt(decryptedChunks[0] || 0));
      const chunk2 = bigIntToKeyChunk(BigInt(decryptedChunks[1] || 0));
      const chunk3 = bigIntToKeyChunk(BigInt(decryptedChunks[2] || 0));
      const chunk4 = bigIntToKeyChunk(BigInt(decryptedChunks[3] || 0));
      keyBytes.set(chunk1, 0);
      keyBytes.set(chunk2, 8);
      keyBytes.set(chunk3, 16);
      keyBytes.set(chunk4, 24);
      
      setLoadingStep('3/4: Fetching from IPFS...');
      addLog(`Fetching from Storacha: ${ipfsCid.slice(0, 15)}...`);
      
      const encryptedContent = await downloadFromIPFS(ipfsCid);
      addLog(`Downloaded: ${encryptedContent.length} bytes ✓`, 'success');
      
      setLoadingStep('4/4: AES decrypting...');
      addLog('Decrypting with AES-GCM...');
      
      const aesKey = await importKeyFromBytes(keyBytes);
      const decryptedText = await aesDecrypt(encryptedContent, aesKey);
      addLog('Decrypted! ✓', 'success');
      
      setContent(decryptedText);
      setIsDecrypted(true);
      setContentCache(prev => ({ ...prev, [cacheKey]: decryptedText }));
      setKeyCache(prev => ({ ...prev, [cacheKey]: keyBytes }));
      
    } catch (error) {
      addLog(`Decrypt failed: ${error.message}`, 'error');
      setContent(`[Decryption failed]\n\nError: ${error.message}\n\nPlease try again.`);
    } finally {
      setIsLoading(false);
      setLoadingStep('');
    }
  };
  
  // ===================== CATEGORY FUNCTION =====================
  
  const handleSetCategory = async (categoryIndex) => {
    if (selectedNoteId === null || !isReady) return;
    
    const contract = getContractInstance();
    if (!contract) return;
    
    try {
      setIsLoading(true);
      setLoadingMessage('Setting category...');
      addLog(`Setting encrypted category ${categoryIndex} for note ${selectedNoteId}...`);
      
      // Create encrypted category (euint8)
      const encrypted = await createEncryptedInput(BigInt(categoryIndex), contractAddress, 'uint8');
      
      const tx = await contract.setNoteCategory(
        selectedNoteId,
        encrypted.handles[0],
        encrypted.inputProof
      );
      
      addLog(`TX: ${tx.hash}`);
      await tx.wait();
      
      setNoteCategoryMap(prev => ({ ...prev, [selectedNoteId]: categoryIndex }));
      setSelectedNoteCategory(categoryIndex);
      addLog('Category set ✓', 'success');
    } catch (error) {
      addLog(`Set category failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  // ===================== SHARE FUNCTION =====================
  
  const handleShare = async () => {
    if (!shareRecipient || selectedNoteId === null) return;
    
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
      
      if (!isDecrypted) {
        alert('Please decrypt the note first before sharing');
        setIsLoading(false);
        return;
      }
      
      const cacheKey = `my-${selectedNoteId}`;
      const keyBytes = keyCache[cacheKey];
      
      if (!keyBytes) {
        alert('Key not found in cache. Please decrypt the note again.');
        setIsLoading(false);
        return;
      }
      
      addLog(`Sharing note ${selectedNoteId} with ${shareRecipient.slice(0, 8)}...`);
      
      setLoadingStep('1/2: FHE encrypting key for recipient...');
      
      const k1Value = keyChunkToBigInt(keyBytes, 0);
      const k2Value = keyChunkToBigInt(keyBytes, 8);
      const k3Value = keyChunkToBigInt(keyBytes, 16);
      const k4Value = keyChunkToBigInt(keyBytes, 24);
      
      const encryptedKeys = await createEncryptedInput4x64(
        k1Value, k2Value, k3Value, k4Value, contractAddress
      );
      
      setLoadingStep('2/2: Storing shared keys on-chain...');
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
      
      addLog(`Note shared with ${shareRecipient.slice(0, 8)}... ✓`, 'success');
      
      setShowShareModal(false);
      setShareRecipient('');
      
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
    if (selectedNoteId === null || !confirm('Delete this note?')) return;
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
  
  // ===================== FILTERING =====================
  
  const filteredNotes = notes.filter(note => {
    // Search filter (only on decrypted/cached content + title)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const titleMatch = note.title.toLowerCase().includes(query);
      const contentMatch = contentCache[`my-${note.id}`]?.toLowerCase().includes(query);
      if (!titleMatch && !contentMatch) return false;
    }
    
    // Category filter
    if (categoryFilter !== null) {
      const noteCategory = noteCategoryMap[note.id];
      if (noteCategory !== categoryFilter) return false;
    }
    
    return true;
  });
  
  const filteredSharedNotes = sharedNotes.filter(shared => {
    if (searchQuery) {
      return shared.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });
  
  // ===================== RENDER =====================
  
  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  }) : '';
  
  const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
  
  // Welcome screen for not connected
  if (!isConnected) {
    return (
      <Container>
        <Header>
          <Logo>
            <div className="icon">
              <Shield size={24} />
            </div>
            <span>CipherNotes</span>
          </Logo>
          <ConnectButton />
        </Header>
        
        <EditorArea>
          <EmptyState>
            <div className="icon">🔐</div>
            <h3>FHE-Powered Private Notes</h3>
            <p>
              Create, encrypt, and share notes with fully homomorphic encryption. 
              Your content stays encrypted on-chain, only you (and those you share with) can read it.
            </p>
            
            <FeatureCards>
              <FeatureCard>
                <div className="icon"><Lock size={24} /></div>
                <h4>End-to-End Encryption</h4>
                <p>Notes are encrypted with AES-256, and the key is stored on-chain using FHE (4x euint64 chunks).</p>
              </FeatureCard>
              
              <FeatureCard>
                <div className="icon"><Share2 size={24} /></div>
                <h4>Secure Sharing</h4>
                <p>Share notes via FHE re-encryption. Contract uses FHE.allow() to grant decrypt permission to recipients.</p>
              </FeatureCard>
              
              <FeatureCard>
                <div className="icon"><Tag size={24} /></div>
                <h4>Encrypted Categories</h4>
                <p>Organize notes with euint8 encrypted categories. Even category assignments are private!</p>
              </FeatureCard>
              
              <FeatureCard>
                <div className="icon"><Zap size={24} /></div>
                <h4>IPFS + On-Chain</h4>
                <p>Encrypted content on IPFS via Storacha. Only FHE-encrypted key handles stored on-chain.</p>
              </FeatureCard>
            </FeatureCards>
          </EmptyState>
        </EditorArea>
      </Container>
    );
  }
  
  // Wrong network
  if (!isSupportedNetwork) {
    return (
      <Container>
        <Header>
          <Logo>
            <div className="icon"><Shield size={24} /></div>
            <span>CipherNotes</span>
          </Logo>
          <ConnectButton />
        </Header>
        
        <EditorArea>
          <EmptyState>
            <div className="icon">⚠️</div>
            <h3>Switch to Sepolia</h3>
            <p>CipherNotes runs on Sepolia testnet where Zama FHEVM is deployed.</p>
          </EmptyState>
        </EditorArea>
      </Container>
    );
  }
  
  // Contract not configured
  if (!contractAddress) {
    return (
      <Container>
        <Header>
          <Logo>
            <div className="icon"><Shield size={24} /></div>
            <span>CipherNotes</span>
          </Logo>
          <ConnectButton />
        </Header>
        
        <EditorArea>
          <EmptyState>
            <div className="icon">📝</div>
            <h3>Contract Not Configured</h3>
            <p>Set VITE_CIPHERNOTES_ADDRESS in your .env file.</p>
          </EmptyState>
        </EditorArea>
      </Container>
    );
  }
  
  const currentNoteIsShared = selectedSharedNote !== null;
  
  return (
    <Container>
      {isLoading && (
        <LoadingOverlay>
          <div className="spinner" />
          <h4>{loadingMessage}</h4>
          {loadingStep && <p>{loadingStep}</p>}
        </LoadingOverlay>
      )}
      
      {showShareModal && (
        <Modal onClick={() => setShowShareModal(false)}>
          <ModalContent onClick={e => e.stopPropagation()}>
            <ModalHeader>
              <h3><Share2 size={18} /> Share Note</h3>
              <button onClick={() => setShowShareModal(false)}>
                <X size={18} />
              </button>
            </ModalHeader>
            
            <FHEInfoBox>
              <strong>FHE Re-encryption:</strong> The AES key will be FHE-encrypted for the recipient. 
              The contract calls <code>FHE.allow(keyHandle, recipient)</code> to grant decrypt permission.
            </FHEInfoBox>
            
            <p style={{ fontSize: '0.9rem', marginBottom: '16px', color: '#94a3b8' }}>
              Enter recipient's Ethereum address:
            </p>
            <ModalInput
              placeholder="0x..."
              value={shareRecipient}
              onChange={e => setShareRecipient(e.target.value)}
            />
            <ModalButtons>
              <ActionBtn onClick={() => setShowShareModal(false)}>Cancel</ActionBtn>
              <ActionBtn $primary onClick={handleShare} disabled={!shareRecipient}>
                <Send size={16} /> Share
              </ActionBtn>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}
      
      <Header>
        <Logo>
          <div className="icon">
            <Shield size={24} />
          </div>
          <span>CipherNotes</span>
        </Logo>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <StatusBadge $ready={isReady}>
            <span className="dot" />
            {isReady ? 'FHE Ready' : status}
          </StatusBadge>
          <ConnectButton />
        </div>
      </Header>
      
      <MainLayout>
        <Sidebar>
          <SidebarHeader>
            {/* Tab Switcher */}
            <TabBar>
              <Tab $active={activeTab === 'my'} onClick={() => setActiveTab('my')}>
                <FolderOpen size={14} />
                My Notes ({notes.length})
              </Tab>
              <Tab $active={activeTab === 'shared'} onClick={() => setActiveTab('shared')}>
                <Users size={14} />
                Shared ({sharedNotes.length})
              </Tab>
            </TabBar>
            
            {/* Search Bar */}
            <SearchBar>
              <Search size={16} />
              <input 
                placeholder={activeTab === 'my' ? "Search notes..." : "Search shared notes..."}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              )}
            </SearchBar>
            
            {/* Category Filter (only for My Notes) */}
            {activeTab === 'my' && (
              <CategoryFilter>
                <CategoryPill 
                  $active={categoryFilter === null} 
                  onClick={() => setCategoryFilter(null)}
                >
                  All
                </CategoryPill>
                {categories.slice(0, 5).map((cat, idx) => (
                  <CategoryPill 
                    key={idx}
                    $active={categoryFilter === idx}
                    onClick={() => setCategoryFilter(categoryFilter === idx ? null : idx)}
                  >
                    {cat}
                  </CategoryPill>
                ))}
              </CategoryFilter>
            )}
            
            {/* New Note Button */}
            {activeTab === 'my' && (
              <HeaderRow>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
                </span>
                <NewNoteBtn onClick={handleNewNote} disabled={!isReady}>
                  <Plus size={16} /> New
                </NewNoteBtn>
              </HeaderRow>
            )}
          </SidebarHeader>
          
          <NotesList>
            {!isReady ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                Initializing FHE...
              </div>
            ) : activeTab === 'my' ? (
              filteredNotes.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  {searchQuery || categoryFilter !== null ? 'No matching notes' : 'No notes yet'}
                </div>
              ) : filteredNotes.map(note => (
                <NoteItem 
                  key={note.id} 
                  $active={note.id === selectedNoteId && !currentNoteIsShared}
                  onClick={() => selectNote(note)}
                >
                  <div className="title">
                    {contentCache[`my-${note.id}`] ? <Unlock size={14} /> : <Lock size={14} />}
                    {note.title}
                  </div>
                  <div className="meta">
                    {formatDate(note.updatedAt)}
                    {noteCategoryMap[note.id] !== undefined && (
                      <span className="category-tag">
                        {categories[noteCategoryMap[note.id]]}
                      </span>
                    )}
                  </div>
                </NoteItem>
              ))
            ) : (
              filteredSharedNotes.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                  {searchQuery ? 'No matching shared notes' : 'No notes shared with you'}
                </div>
              ) : filteredSharedNotes.map((shared, idx) => (
                <NoteItem 
                  key={`shared-${idx}`}
                  $active={selectedSharedNote?.owner === shared.owner && selectedSharedNote?.noteId === shared.noteId}
                  onClick={() => selectSharedNote(shared)}
                >
                  <div className="title">
                    {contentCache[`shared-${shared.owner}-${shared.noteId}`] ? <Unlock size={14} /> : <Lock size={14} />}
                    {shared.title}
                  </div>
                  <div className="meta">
                    <span className="shared-by">from {formatAddress(shared.owner)}</span>
                  </div>
                </NoteItem>
              ))
            )}
          </NotesList>
        </Sidebar>
        
        <EditorArea>
          {selectedNoteId !== null || isNewNote || selectedSharedNote !== null ? (
            <>
              <EditorHeader>
                <TitleInput 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="Note title..."
                  readOnly={currentNoteIsShared}
                />
                
                {/* Category Selector (only for own notes, not new, not shared) */}
                {!isNewNote && !currentNoteIsShared && isDecrypted && (
                  <CategorySelect 
                    value={selectedNoteCategory}
                    onChange={e => {
                      const idx = parseInt(e.target.value);
                      setSelectedNoteCategory(idx);
                      handleSetCategory(idx);
                    }}
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={idx}>{cat}</option>
                    ))}
                  </CategorySelect>
                )}
                
                {!currentNoteIsShared && (
                  <ActionBtn $primary onClick={handleSave} disabled={isLoading || !isReady}>
                    <FileText size={16} />
                    {isNewNote || isDecrypted ? 'Save' : 'Update Title'}
                  </ActionBtn>
                )}
                
                {!isNewNote && (
                  <>
                    {!isDecrypted && (
                      <ActionBtn onClick={handleDecrypt} disabled={isLoading}>
                        <Unlock size={16} /> Decrypt
                      </ActionBtn>
                    )}
                    {!currentNoteIsShared && (
                      <>
                        <ActionBtn onClick={() => setShowShareModal(true)} disabled={!isDecrypted}>
                          <Share2 size={16} /> Share
                        </ActionBtn>
                        <ActionBtn $danger onClick={handleDelete} disabled={isLoading}>
                          <Trash2 size={16} />
                        </ActionBtn>
                      </>
                    )}
                  </>
                )}
              </EditorHeader>
              
              <EditorContent>
                <ContentTextarea 
                  value={content} 
                  onChange={e => setContent(e.target.value)} 
                  placeholder="Write your encrypted note..."
                  readOnly={currentNoteIsShared || (!isNewNote && !isDecrypted)}
                />
              </EditorContent>
            </>
          ) : (
            <EmptyState>
              <div className="icon"><FileText size={64} /></div>
              <h3>Select or create a note</h3>
              <p>Your notes are end-to-end encrypted using Zama FHEVM technology.</p>
              {isReady && activeTab === 'my' && (
                <ActionBtn $primary onClick={handleNewNote} style={{ marginTop: '20px' }}>
                  <Plus size={16} /> Create Note
                </ActionBtn>
              )}
            </EmptyState>
          )}
        </EditorArea>
      </MainLayout>
      
      <LogPanel>
        {logs.map((log, i) => (
          <div key={i} className={`log-entry ${log.type}`}>
            [{log.time}] {log.message}
          </div>
        ))}
      </LogPanel>
    </Container>
  );
};

export default CipherNotes;
