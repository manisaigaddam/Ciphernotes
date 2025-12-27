import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Deploy CipherNotes - FHE-powered private note-taking dApp
 * 
 * Features:
 * - Create/Edit/Delete notes with FHE-encrypted AES keys
 * - Share notes via re-encrypted keys (FHE.allow to recipient)
 * - Encrypted categories (euint8) with FHE comparison
 * - IPFS content storage with on-chain encrypted key handles
 */
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts } = hre;
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    console.log("\n╔═══════════════════════════════════════════════════════╗");
    console.log("║         CIPHERNOTES - FHE PRIVATE NOTES               ║");
    console.log("╚═══════════════════════════════════════════════════════╝\n");
    console.log(`Deployer: ${deployer}\n`);

    // Deploy CipherNotes
    const cipherNotes = await deploy("CipherNotes", {
        from: deployer,
        args: [],
        log: true,
        autoMine: true,
    });

    console.log(`\n✅ CipherNotes deployed at: ${cipherNotes.address}`);

    console.log("\n═══════════════════════════════════════════════════════");
    console.log("🎉 Deployment Complete!");
    console.log("═══════════════════════════════════════════════════════");
    console.log("\nAdd this to your .env file:");
    console.log(`VITE_CIPHERNOTES_ADDRESS=${cipherNotes.address}`);
    console.log("\n");
};

export default func;
func.tags = ["CipherNotes", "dApp"];
