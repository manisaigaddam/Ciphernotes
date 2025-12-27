// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, euint8, ebool, externalEuint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title CipherNotes
 * @author Zenix - FHEVM Desktop
 * @notice Advanced FHE-powered private note-taking with encrypted key management
 * @dev Demonstrates comprehensive FHEVM patterns:
 * 
 * FHEVM OPERATIONS SHOWCASE:
 * - FHE.fromExternal() - Convert client-encrypted inputs
 * - FHE.allowThis() - Grant contract permission on handles
 * - FHE.allow() - Grant user/recipient decrypt permission
 * - FHE.toBytes32() - Convert handles for storage
 * - euint64 key chunking - Split 256-bit AES keys into 4x64-bit FHE handles
 * - euint8 categories - Encrypted category identifiers
 * 
 * FEATURES:
 * - Create/Edit/Delete notes with FHE-encrypted AES keys
 * - Share notes via re-encrypted keys (FHE.allow to recipient)
 * - Encrypted categories (euint8) with FHE comparison
 * - IPFS content storage with on-chain encrypted key handles
 */
contract CipherNotes is ZamaEthereumConfig {
    
    // ===================== STRUCTS =====================
    
    struct Note {
        uint256 id;
        uint256 createdAt;
        uint256 updatedAt;
        string title;
        bytes ipfsCid;
        euint64 keyChunk1;
        euint64 keyChunk2;
        euint64 keyChunk3;
        euint64 keyChunk4;
        bool isDeleted;
    }
    
    // ===================== STATE =====================
    
    // User's own notes
    mapping(address => Note[]) private userNotes;
    mapping(address => uint256) public noteCount;
    
    // Sharing: noteOwner => noteId => recipient => encrypted key chunks
    mapping(address => mapping(uint256 => mapping(address => bytes32[4]))) private sharedNoteKeys;
    
    // Track who a note is shared with
    mapping(address => mapping(uint256 => address[])) private sharedWithList;
    
    // Track notes shared WITH a user (owner => noteId pairs)
    mapping(address => SharedNoteRef[]) private receivedNotes;
    
    struct SharedNoteRef {
        address owner;
        uint256 noteId;
    }
    
    // Categories: owner => noteId => encrypted category (0-7)
    mapping(address => mapping(uint256 => euint8)) private noteCategories;
    
    // Category names (per user, plaintext for display)
    mapping(address => string[8]) public categoryNames;
    
    // ===================== EVENTS =====================
    
    event NoteCreated(address indexed owner, uint256 noteId, string title);
    event NoteUpdated(address indexed owner, uint256 noteId);
    event NoteDeleted(address indexed owner, uint256 noteId);
    event NoteShared(address indexed owner, uint256 noteId, address indexed recipient);
    event NoteUnshared(address indexed owner, uint256 noteId, address indexed recipient);
    event CategorySet(address indexed owner, uint256 noteId);
    
    // ===================== CORE NOTE FUNCTIONS =====================
    
    /**
     * @notice Create a new encrypted note
     */
    function createNote(
        string calldata title,
        bytes calldata ipfsCid,
        externalEuint64 keyChunk1,
        externalEuint64 keyChunk2,
        externalEuint64 keyChunk3,
        externalEuint64 keyChunk4,
        bytes calldata inputProof
    ) external returns (uint256) {
        uint256 noteId = userNotes[msg.sender].length;
        
        // Process key chunks in storage directly to avoid stack issues
        userNotes[msg.sender].push();
        Note storage note = userNotes[msg.sender][noteId];
        
        note.id = noteId;
        note.createdAt = block.timestamp;
        note.updatedAt = block.timestamp;
        note.title = title;
        note.ipfsCid = ipfsCid;
        note.isDeleted = false;
        
        // FHE process and store key chunks
        _processKeyChunk1(note, keyChunk1, inputProof);
        _processKeyChunk2(note, keyChunk2, inputProof);
        _processKeyChunk3(note, keyChunk3, inputProof);
        _processKeyChunk4(note, keyChunk4, inputProof);
        
        noteCount[msg.sender]++;
        emit NoteCreated(msg.sender, noteId, title);
        return noteId;
    }
    
    function _processKeyChunk1(Note storage note, externalEuint64 chunk, bytes calldata proof) internal {
        euint64 k = FHE.fromExternal(chunk, proof);
        FHE.allowThis(k);
        FHE.allow(k, msg.sender);
        note.keyChunk1 = k;
    }
    
    function _processKeyChunk2(Note storage note, externalEuint64 chunk, bytes calldata proof) internal {
        euint64 k = FHE.fromExternal(chunk, proof);
        FHE.allowThis(k);
        FHE.allow(k, msg.sender);
        note.keyChunk2 = k;
    }
    
    function _processKeyChunk3(Note storage note, externalEuint64 chunk, bytes calldata proof) internal {
        euint64 k = FHE.fromExternal(chunk, proof);
        FHE.allowThis(k);
        FHE.allow(k, msg.sender);
        note.keyChunk3 = k;
    }
    
    function _processKeyChunk4(Note storage note, externalEuint64 chunk, bytes calldata proof) internal {
        euint64 k = FHE.fromExternal(chunk, proof);
        FHE.allowThis(k);
        FHE.allow(k, msg.sender);
        note.keyChunk4 = k;
    }
    
    /**
     * @notice Update note title only (no re-encryption needed)
     */
    function updateTitle(uint256 noteId, string calldata newTitle) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        Note storage note = userNotes[msg.sender][noteId];
        require(!note.isDeleted, "Deleted");
        
        note.title = newTitle;
        note.updatedAt = block.timestamp;
        emit NoteUpdated(msg.sender, noteId);
    }
    
    /**
     * @notice Update note content (new CID + new key)
     */
    function updateContent(
        uint256 noteId,
        bytes calldata ipfsCid,
        externalEuint64 keyChunk1,
        externalEuint64 keyChunk2,
        externalEuint64 keyChunk3,
        externalEuint64 keyChunk4,
        bytes calldata inputProof
    ) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        Note storage note = userNotes[msg.sender][noteId];
        require(!note.isDeleted, "Deleted");
        
        note.ipfsCid = ipfsCid;
        note.updatedAt = block.timestamp;
        
        _processKeyChunk1(note, keyChunk1, inputProof);
        _processKeyChunk2(note, keyChunk2, inputProof);
        _processKeyChunk3(note, keyChunk3, inputProof);
        _processKeyChunk4(note, keyChunk4, inputProof);
        
        emit NoteUpdated(msg.sender, noteId);
    }
    
    /**
     * @notice Soft delete a note
     */
    function deleteNote(uint256 noteId) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        Note storage note = userNotes[msg.sender][noteId];
        require(!note.isDeleted, "Already deleted");
        
        note.isDeleted = true;
        noteCount[msg.sender]--;
        emit NoteDeleted(msg.sender, noteId);
    }
    
    /**
     * @notice Restore a deleted note
     */
    function restoreNote(uint256 noteId) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        Note storage note = userNotes[msg.sender][noteId];
        require(note.isDeleted, "Not deleted");
        
        note.isDeleted = false;
        noteCount[msg.sender]++;
    }
    
    // ===================== SHARING FUNCTIONS =====================
    
    /**
     * @notice Share a note with another user
     * @dev Owner encrypts the same AES key with recipient as allowed decryptor
     */
    function shareNote(
        uint256 noteId,
        address recipient,
        externalEuint64 k1,
        externalEuint64 k2,
        externalEuint64 k3,
        externalEuint64 k4,
        bytes calldata inputProof
    ) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        require(!userNotes[msg.sender][noteId].isDeleted, "Deleted");
        require(recipient != msg.sender, "Cannot share with self");
        require(recipient != address(0), "Invalid recipient");
        require(sharedNoteKeys[msg.sender][noteId][recipient][0] == bytes32(0), "Already shared");
        
        // Process encrypted keys for recipient
        euint64 chunk1 = FHE.fromExternal(k1, inputProof);
        euint64 chunk2 = FHE.fromExternal(k2, inputProof);
        euint64 chunk3 = FHE.fromExternal(k3, inputProof);
        euint64 chunk4 = FHE.fromExternal(k4, inputProof);
        
        // Allow contract and recipient to decrypt
        FHE.allowThis(chunk1);
        FHE.allowThis(chunk2);
        FHE.allowThis(chunk3);
        FHE.allowThis(chunk4);
        
        FHE.allow(chunk1, recipient);
        FHE.allow(chunk2, recipient);
        FHE.allow(chunk3, recipient);
        FHE.allow(chunk4, recipient);
        
        // Store as bytes32 handles
        sharedNoteKeys[msg.sender][noteId][recipient] = [
            FHE.toBytes32(chunk1),
            FHE.toBytes32(chunk2),
            FHE.toBytes32(chunk3),
            FHE.toBytes32(chunk4)
        ];
        
        // Track sharing
        sharedWithList[msg.sender][noteId].push(recipient);
        receivedNotes[recipient].push(SharedNoteRef({
            owner: msg.sender,
            noteId: noteId
        }));
        
        emit NoteShared(msg.sender, noteId, recipient);
    }
    
    /**
     * @notice Unshare a note (revoke access)
     */
    function unshareNote(uint256 noteId, address recipient) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        require(sharedNoteKeys[msg.sender][noteId][recipient][0] != bytes32(0), "Not shared");
        
        // Clear the encrypted keys
        delete sharedNoteKeys[msg.sender][noteId][recipient];
        
        emit NoteUnshared(msg.sender, noteId, recipient);
    }
    
    /**
     * @notice Get shared key chunks (for recipient to decrypt)
     */
    function getSharedNoteKeyChunks(
        address owner,
        uint256 noteId
    ) external view returns (bytes32[4] memory) {
        require(sharedNoteKeys[owner][noteId][msg.sender][0] != bytes32(0), "No access");
        return sharedNoteKeys[owner][noteId][msg.sender];
    }
    
    /**
     * @notice Get CID of a shared note
     */
    function getSharedNoteCID(address owner, uint256 noteId) external view returns (bytes memory) {
        require(sharedNoteKeys[owner][noteId][msg.sender][0] != bytes32(0), "No access");
        return userNotes[owner][noteId].ipfsCid;
    }
    
    /**
     * @notice Get metadata of a shared note
     */
    function getSharedNoteMetadata(address owner, uint256 noteId) external view returns (
        string memory title,
        uint256 createdAt,
        uint256 updatedAt
    ) {
        require(sharedNoteKeys[owner][noteId][msg.sender][0] != bytes32(0), "No access");
        Note storage note = userNotes[owner][noteId];
        return (note.title, note.createdAt, note.updatedAt);
    }
    
    /**
     * @notice Get all notes shared with the caller
     */
    function getReceivedNotes() external view returns (
        address[] memory owners,
        uint256[] memory noteIds,
        string[] memory titles
    ) {
        SharedNoteRef[] storage refs = receivedNotes[msg.sender];
        uint256 count = refs.length;
        
        owners = new address[](count);
        noteIds = new uint256[](count);
        titles = new string[](count);
        
        for (uint256 i = 0; i < count; i++) {
            owners[i] = refs[i].owner;
            noteIds[i] = refs[i].noteId;
            // Only include if still shared
            if (sharedNoteKeys[refs[i].owner][refs[i].noteId][msg.sender][0] != bytes32(0)) {
                titles[i] = userNotes[refs[i].owner][refs[i].noteId].title;
            }
        }
    }
    
    /**
     * @notice Get list of addresses a note is shared with
     */
    function getSharedWithList(uint256 noteId) external view returns (address[] memory) {
        require(noteId < userNotes[msg.sender].length, "Not found");
        return sharedWithList[msg.sender][noteId];
    }
    
    // ===================== CATEGORY FUNCTIONS =====================
    
    /**
     * @notice Set a single category name (plaintext for display)
     */
    function setCategoryName(uint8 index, string calldata name) external {
        require(index < 8, "Invalid index");
        categoryNames[msg.sender][index] = name;
    }
    
    /**
     * @notice Get all category names for a user
     */
    function getCategoryNames(address user) external view returns (string[8] memory) {
        return categoryNames[user];
    }
    
    /**
     * @notice Set note category (encrypted, 0-7)
     */
    function setNoteCategory(
        uint256 noteId,
        externalEuint8 encCategory,
        bytes calldata inputProof
    ) external {
        require(noteId < userNotes[msg.sender].length, "Not found");
        require(!userNotes[msg.sender][noteId].isDeleted, "Deleted");
        
        euint8 category = FHE.fromExternal(encCategory, inputProof);
        FHE.allowThis(category);
        FHE.allow(category, msg.sender);
        
        noteCategories[msg.sender][noteId] = category;
        
        emit CategorySet(msg.sender, noteId);
    }
    
    /**
     * @notice Get note category handle (for user decryption)
     */
    function getNoteCategory(uint256 noteId) external view returns (euint8) {
        require(noteId < userNotes[msg.sender].length, "Not found");
        return noteCategories[msg.sender][noteId];
    }
    
    // ===================== VIEW FUNCTIONS =====================
    
    function getMyNotesMetadata() external view returns (
        uint256[] memory ids,
        string[] memory titles,
        uint256[] memory createdAts,
        uint256[] memory updatedAts,
        bool[] memory deletedFlags
    ) {
        uint256 total = userNotes[msg.sender].length;
        
        ids = new uint256[](total);
        titles = new string[](total);
        createdAts = new uint256[](total);
        updatedAts = new uint256[](total);
        deletedFlags = new bool[](total);
        
        for (uint256 i = 0; i < total; i++) {
            Note storage note = userNotes[msg.sender][i];
            ids[i] = note.id;
            titles[i] = note.title;
            createdAts[i] = note.createdAt;
            updatedAts[i] = note.updatedAt;
            deletedFlags[i] = note.isDeleted;
        }
    }
    
    function getNoteCID(uint256 noteId) external view returns (bytes memory) {
        require(noteId < userNotes[msg.sender].length, "Not found");
        return userNotes[msg.sender][noteId].ipfsCid;
    }
    
    function getNoteKeyChunks(uint256 noteId) external view returns (
        euint64 k1,
        euint64 k2,
        euint64 k3,
        euint64 k4
    ) {
        require(noteId < userNotes[msg.sender].length, "Not found");
        Note storage note = userNotes[msg.sender][noteId];
        return (note.keyChunk1, note.keyChunk2, note.keyChunk3, note.keyChunk4);
    }
    
    function getTotalNotes() external view returns (uint256) {
        return userNotes[msg.sender].length;
    }
    
    function getActiveNoteCount() external view returns (uint256) {
        return noteCount[msg.sender];
    }
}
