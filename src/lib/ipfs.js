/**
 * IPFS Storage using Storacha (Web3.storage)
 * Same approach as Filez uses for reliability
 */

import * as Client from "@storacha/client";
import { Signer } from "@storacha/client/principal/ed25519";
import * as Proof from "@storacha/client/proof";
import { StoreMemory } from "@storacha/client/stores/memory";

let storachaClient = null;

/**
 * Get or create Storacha client
 */
async function getStorachaClient() {
  if (storachaClient) return storachaClient;
  
  const key = import.meta.env.VITE_STORACHA_KEY;
  const proofStr = import.meta.env.VITE_STORACHA_PROOF;

  if (!key) throw new Error("Missing VITE_STORACHA_KEY - see .env.example");
  if (!proofStr) throw new Error("Missing VITE_STORACHA_PROOF - see .env.example");

  const principal = Signer.parse(key);
  const store = new StoreMemory();
  const client = await Client.create({ principal, store });

  const proof = await Proof.parse(proofStr);
  const space = await client.addSpace(proof);
  await client.setCurrentSpace(space.did());

  storachaClient = client;
  return client;
}

/**
 * Upload encrypted data to IPFS via Storacha
 * @param {Uint8Array} data - Encrypted data to upload
 * @returns {Promise<string>} - CID string
 */
export async function uploadToIPFS(data) {
  try {
    const client = await getStorachaClient();
    
    // Convert Uint8Array to File object
    const file = new File([data], `encrypted_${Date.now()}.bin`, { 
      type: 'application/octet-stream' 
    });
    
    const cid = await client.uploadFile(file);
    console.log('✓ Uploaded to Storacha:', cid.toString());
    
    return cid.toString();
  } catch (err) {
    console.error("Storacha upload failed:", err);
    throw err;
  }
}

/**
 * Download data from IPFS using Storacha gateway
 * @param {string} cid - IPFS CID
 * @returns {Promise<Uint8Array>} - Downloaded data
 */
export async function downloadFromIPFS(cid) {
  try {
    // Clean CID of any prefixes
    const cleanCid = cid.toString().replace(/^\/ipfs\//, '').replace(/^ipfs\//, '');
    
    // Storacha uses subdomain-style gateway: {cid}.ipfs.storacha.link
    const url = `https://${cleanCid}.ipfs.storacha.link`;
    
    console.log('Fetching from Storacha:', url);
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Gateway error: ${res.status}`);

    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    
    console.log('✓ Downloaded from Storacha:', cleanCid.slice(0, 10) + '...');
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error("❌ downloadFromIPFS failed:", err);
    throw err;
  }
}
