import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import * as dotenv from "dotenv";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import type { HardhatUserConfig } from "hardhat/config";

dotenv.config();

// Environment variables
const MNEMONIC = process.env.MNEMONIC || "test test test test test test test test test test test junk";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ALCHEMY_URL = process.env.ALCHEMY_URL || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// Determine accounts config
const getAccounts = () => {
    if (PRIVATE_KEY) {
        return [PRIVATE_KEY];
    }
    return {
        mnemonic: MNEMONIC,
        path: "m/44'/60'/0'/0/",
        count: 10,
    };
};

// Determine Sepolia URL
const getSepoliaUrl = () => {
    if (ALCHEMY_URL) return ALCHEMY_URL;
    return "https://eth-sepolia.g.alchemy.com/v2/demo";
};

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    namedAccounts: {
        deployer: 0,
    },
    etherscan: {
        apiKey: {
            sepolia: ETHERSCAN_API_KEY,
        },
    },
    gasReporter: {
        currency: "USD",
        enabled: process.env.REPORT_GAS === "true",
        excludeContracts: [],
    },
    networks: {
        hardhat: {
            accounts: {
                mnemonic: MNEMONIC,
            },
            chainId: 31337,
        },
        localhost: {
            accounts: {
                mnemonic: MNEMONIC,
            },
            chainId: 31337,
            url: "http://localhost:8545",
        },
        sepolia: {
            accounts: getAccounts(),
            chainId: 11155111,
            url: getSepoliaUrl(),
        },
    },
    paths: {
        artifacts: "./artifacts",
        cache: "./cache",
        sources: "./contracts",
        tests: "./test",
    },
    solidity: {
        version: "0.8.27",
        settings: {
            metadata: {
                bytecodeHash: "none",
            },
            optimizer: {
                enabled: true,
                runs: 800,
            },
            evmVersion: "cancun",
        },
    },
    typechain: {
        outDir: "types",
        target: "ethers-v6",
    },
};

export default config;
