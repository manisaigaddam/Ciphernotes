import { ConnectButton } from '@rainbow-me/rainbowkit';
import { FileText, Lock, Plus, Send, Share2, Shield, Trash2, Unlock, X, Zap } from 'lucide-react';
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
  width: 320px;
  background: rgba(0, 0, 0, 0.2);
  border-right: 1px solid rgba(131, 110, 249, 0.1);
  display: flex;
  flex-direction: column;
  
  @media (max-width: 768px) {
    width: 100%;
    max-height: 200px;
  }
`;

const SidebarHeader = styled.div`
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(131, 110, 249, 0.1);
  
  h3 {
    font-size: 0.9rem;
    color: #94a3b8;
  }
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

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: ${props => props.$primary 
    ? 'linear-gradient(135deg, #836EF9 0%, #6366f1 100%)' 
    : 'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.$primary ? 'transparent' : 'rgba(131, 110, 249, 0.3)'};
  border-radius: 8px;
  color: white;
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
  font-family: 'JetBrains Mono', monospace;
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
  max-height: 120px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  
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

// ===================== MAIN COMPONENT =====================

const CipherNotes = () => {
  const { isConnected, address } = useAccount();
  const { 
    isReady, isSupportedNetwork, status,
    createEncryptedInput, createEncryptedInput4x64, 
    requestDecryption4x64,
    getContract, ethersSigner,
  } = useFhevm();
  
  // Core state
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingStep, setLoadingStep] = useState('');
  const [isNewNote, setIsNewNote] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isDecrypted, setIsDecrypted] = useState(false);
  
  // Sharing modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareRecipient, setShareRecipient] = useState('');
  
  // Caches
  const [contentCache, setContentCache] = useState({});
  const [keyCache, setKeyCache] = useState({});
  
  const contractAddress = CONTRACT_ADDRESSES?.CipherNotes;
  
  const addLog = (message, type = 'info') => {
    setLogs(prev => [...prev.slice(-20), { message, type, time: new Date().toLocaleTimeString() }]);
    console.log(`[CipherNotes ${type}]`, message);
  };
  
  useEffect(() => {
    if (isConnected && isReady && contractAddress) {
      loadNotes();
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
  
  // ===================== NOTE SELECTION =====================
  
  const selectNote = async (note) => {
    setSelectedNoteId(note.id);
    setTitle(note.title);
    setIsNewNote(false);
    setIsDecrypted(false);
    
    if (contentCache[`my-${note.id}`]) {
      setContent(contentCache[`my-${note.id}`]);
      setIsDecrypted(true);
    } else {
      setContent('[🔐 Encrypted - Click "Decrypt" to view]');
    }
  };
  
  const handleNewNote = () => {
    setSelectedNoteId(null);
    setTitle('');
    setContent('');
    setIsNewNote(true);
    setIsDecrypted(true);
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
        
        setLoadingStep('4/5: FHE encrypting key...');
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
        setIsDecrypted(false);
        setContent('[🔒 Encrypted - Click Decrypt to view and edit]');
        
      } else {
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
      
      setLoadingStep('1/4: Fetching CID from contract...');
      addLog('Fetching IPFS CID from contract...');
      
      const cidBytes = await contract.getNoteCID(selectedNoteId);
      const chunks = await contract.getNoteKeyChunks(selectedNoteId);
      const keyHandles = [chunks[0], chunks[1], chunks[2], chunks[3]];
      const cacheKey = `my-${selectedNoteId}`;
      
      const ipfsCid = new TextDecoder().decode(
        new Uint8Array(cidBytes.slice(2).match(/.{1,2}/g).map(b => parseInt(b, 16)))
      );
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
      
      setLoadingStep('1/2: Encrypting key for recipient...');
      
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
  
  // ===================== RENDER =====================
  
  const formatDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
  }) : '';
  
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
                <p>Notes are encrypted with AES-256, and the key is stored on-chain using FHE.</p>
              </FeatureCard>
              
              <FeatureCard>
                <div className="icon"><Share2 size={24} /></div>
                <h4>Secure Sharing</h4>
                <p>Share notes with other addresses. FHE re-encryption ensures only recipients can decrypt.</p>
              </FeatureCard>
              
              <FeatureCard>
                <div className="icon"><Zap size={24} /></div>
                <h4>IPFS Storage</h4>
                <p>Encrypted content stored on IPFS via Storacha. On-chain only stores FHE-encrypted keys.</p>
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
            <h3>My Notes ({notes.length})</h3>
            <NewNoteBtn onClick={handleNewNote} disabled={!isReady}>
              <Plus size={16} /> New
            </NewNoteBtn>
          </SidebarHeader>
          
          <NotesList>
            {!isReady ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                Initializing FHE...
              </div>
            ) : notes.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
                No notes yet
              </div>
            ) : notes.map(note => (
              <NoteItem 
                key={note.id} 
                $active={note.id === selectedNoteId}
                onClick={() => selectNote(note)}
              >
                <div className="title">
                  {contentCache[`my-${note.id}`] ? <Unlock size={14} /> : <Lock size={14} />}
                  {note.title}
                </div>
                <div className="meta">{formatDate(note.updatedAt)}</div>
              </NoteItem>
            ))}
          </NotesList>
        </Sidebar>
        
        <EditorArea>
          {selectedNoteId !== null || isNewNote ? (
            <>
              <EditorHeader>
                <TitleInput 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="Note title..." 
                />
                
                <ActionBtn $primary onClick={handleSave} disabled={isLoading || !isReady}>
                  <FileText size={16} />
                  {isNewNote || isDecrypted ? 'Save' : 'Update Title'}
                </ActionBtn>
                
                {!isNewNote && (
                  <>
                    {!isDecrypted && (
                      <ActionBtn onClick={handleDecrypt} disabled={isLoading}>
                        <Unlock size={16} /> Decrypt
                      </ActionBtn>
                    )}
                    <ActionBtn onClick={() => setShowShareModal(true)} disabled={!isDecrypted}>
                      <Share2 size={16} /> Share
                    </ActionBtn>
                    <ActionBtn onClick={handleDelete} disabled={isLoading}>
                      <Trash2 size={16} />
                    </ActionBtn>
                  </>
                )}
              </EditorHeader>
              
              <EditorContent>
                <ContentTextarea 
                  value={content} 
                  onChange={e => setContent(e.target.value)} 
                  placeholder="Write your encrypted note..."
                  readOnly={!isNewNote && !isDecrypted}
                />
              </EditorContent>
            </>
          ) : (
            <EmptyState>
              <div className="icon"><FileText size={64} /></div>
              <h3>Select or create a note</h3>
              <p>Your notes are end-to-end encrypted using FHE technology.</p>
              {isReady && (
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
