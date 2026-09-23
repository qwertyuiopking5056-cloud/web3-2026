import hre from "hardhat";
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`[Deploy] Deployer Account: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`[Deploy] Account Balance: ${ethers.formatEther(balance)} ETH`);

  const frontendContractsDir = path.join(__dirname, "../../frontend/src/contracts");
  if (!fs.existsSync(frontendContractsDir)) {
    fs.mkdirSync(frontendContractsDir, { recursive: true });
  }

  // 1. WorkerCredentialSBT (Soulbound Token) 배포
  console.log(`\n--- Deploying WorkerCredentialSBT ---`);
  const SBTFactory = await ethers.getContractFactory("WorkerCredentialSBT");
  // deployer를 defaultAdmin이자 initialIssuer로 등록
  const sbt = await SBTFactory.deploy(deployer.address, deployer.address);
  await sbt.waitForDeployment();

  const sbtAddress = await sbt.getAddress();
  console.log(`[Deploy] WorkerCredentialSBT deployed at: ${sbtAddress}`);

  const sbtArtifact = await hre.artifacts.readArtifact("WorkerCredentialSBT");
  const sbtExportData = {
    address: sbtAddress,
    chainId: network.config.chainId ?? 31337,
    networkName: network.name,
    abi: sbtArtifact.abi,
  };

  const sbtOutputPath = path.join(frontendContractsDir, "WorkerCredentialSBT.json");
  fs.writeFileSync(sbtOutputPath, JSON.stringify(sbtExportData, null, 2));
  console.log(`[Deploy] WorkerCredentialSBT ABI & Address exported to: ${sbtOutputPath}`);

  // 2. DigitalAsset (기존 NFT) 배포 유지 (하위 호환성)
  console.log(`\n--- Deploying DigitalAsset ---`);
  const DigitalAssetFactory = await ethers.getContractFactory("DigitalAsset");
  const digitalAsset = await DigitalAssetFactory.deploy(deployer.address);
  await digitalAsset.waitForDeployment();

  const digitalAssetAddress = await digitalAsset.getAddress();
  console.log(`[Deploy] DigitalAsset deployed at: ${digitalAssetAddress}`);

  const digitalAssetArtifact = await hre.artifacts.readArtifact("DigitalAsset");
  const digitalAssetExportData = {
    address: digitalAssetAddress,
    chainId: network.config.chainId ?? 31337,
    networkName: network.name,
    abi: digitalAssetArtifact.abi,
  };

  const digitalAssetOutputPath = path.join(frontendContractsDir, "DigitalAsset.json");
  fs.writeFileSync(digitalAssetOutputPath, JSON.stringify(digitalAssetExportData, null, 2));
  console.log(`[Deploy] DigitalAsset ABI & Address exported to: ${digitalAssetOutputPath}`);

  console.log(`\n[Deploy] All contracts deployed and synced successfully!`);
}

main().catch((error) => {
  console.error("[Deploy Error]", error);
  process.exitCode = 1;
});
