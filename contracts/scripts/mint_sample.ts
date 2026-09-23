import { ethers } from "hardhat";

async function main() {
  const [deployer, worker] = await ethers.getSigners();
  const sbt = await ethers.getContractAt("WorkerCredentialSBT", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1년 후
  console.log(`[Mint] Minting sample SBT to worker ${worker.address}...`);

  const tx = await sbt.issueCredential(
    worker.address,
    "E-9-비전문취업 (제조업)",
    expiresAt,
    "ipfs://QmSampleMetadataHash"
  );
  await tx.wait();

  const balance = await sbt.balanceOf(worker.address);
  console.log(`[Mint] Worker balance: ${balance.toString()} SBTs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
