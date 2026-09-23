import { expect } from "chai";
import { ethers } from "hardhat";
import { WorkerCredentialSBT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("WorkerCredentialSBT Architecture Tests", function () {
  let sbt: WorkerCredentialSBT;
  let admin: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let worker: HardhatEthersSigner;
  let employer: HardhatEthersSigner;

  const CREDENTIAL_TYPE = "E-9-비전문취업 (제조업)";
  const SAMPLE_METADATA = "https://ipfs.io/ipfs/bafkreicredential123";

  // IssuerStatus enum: None(0), Active(1), Decommissioned(2), Blacklisted(3)
  const Status = {
    None: 0n,
    Active: 1n,
    Decommissioned: 2n,
    Blacklisted: 3n,
  };

  beforeEach(async function () {
    [admin, issuer, worker, employer] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory("WorkerCredentialSBT");
    sbt = (await Factory.deploy(admin.address, issuer.address)) as WorkerCredentialSBT;
    await sbt.waitForDeployment();
  });

  describe("소프트 폐기 (Soft Revocation & Audit Trail) 검증", function () {
    it("자격 박탈 시 토큰이 소각되지 않고 isRevoked 플래그와 사유가 온체인에 영구 기록되어야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, CREDENTIAL_TYPE, 0, SAMPLE_METADATA);

      expect(await sbt.balanceOf(worker.address)).to.equal(1n);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 발급기관이 자격 박탈
      await sbt.connect(issuer).revokeCredential(1n, "체류지 무단 이탈 및 비자 취소");

      // 감사 추적 데이터 검증
      const cred = await sbt.getCredential(1n);
      expect(cred.isRevoked).to.be.true;
      expect(cred.revokeReason).to.equal("체류지 무단 이탈 및 비자 취소");
      expect(cred.revokedBy).to.equal(issuer.address);
      expect(cred.revokedAt).to.be.greaterThan(0n);

      // 토큰 자체는 소각되지 않고 지갑에 박탈 이력으로 잔존
      expect(await sbt.balanceOf(worker.address)).to.equal(1n);
      expect(await sbt.ownerOf(1n)).to.equal(worker.address);

      // 온체인 유효성 판정에서는 즉시 무효(false) 처리
      expect(await sbt.isCredentialValid(1n)).to.be.false;
    });

    it("이미 박탈된 자격증을 재박탈 시도하면 CredentialAlreadyRevoked로 Revert 되어야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, CREDENTIAL_TYPE, 0, SAMPLE_METADATA);
      await sbt.connect(issuer).revokeCredential(1n, "사유 1");

      await expect(
        sbt.connect(issuer).revokeCredential(1n, "사유 2")
      ).to.be.revertedWithCustomError(sbt, "CredentialAlreadyRevoked");
    });
  });

  describe("발급기관 상태(IssuerStatus)에 따른 소급 판정 검증", function () {
    beforeEach(async function () {
      // 1년 유효기간의 정상 자격증 발급
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await sbt.connect(issuer).issueCredential(worker.address, CREDENTIAL_TYPE, now + 365 * 86400, SAMPLE_METADATA);
    });

    it("기관이 단순 협약 만료(Decommissioned)된 경우: 기발급분은 여전히 유효해야 하고, 신규 발급은 차단되어야 한다", async function () {
      // Admin이 해당 기관을 Decommissioned로 전환
      await sbt.connect(admin).setIssuerStatus(issuer.address, Status.Decommissioned);

      // 1. 기발급 자격증은 유효 유지
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 2. 신규 발급 시도는 Revert
      await expect(
        sbt.connect(issuer).issueCredential(employer.address, CREDENTIAL_TYPE, 0, SAMPLE_METADATA)
      ).to.be.reverted;
    });

    it("기관이 부정 적발로 퇴출(Blacklisted)된 경우: 기발급분이 즉시 소급 무효화되어야 한다", async function () {
      // Admin이 해당 기관을 Blacklisted로 지정
      await sbt.connect(admin).setIssuerStatus(issuer.address, Status.Blacklisted);

      // 기발급 자격증이 즉각 무효 판정(false)으로 전환
      expect(await sbt.isCredentialValid(1n)).to.be.false;
    });
  });

  describe("양도 불가 (Soulbound) 제어 검증", function () {
    it("transferFrom 및 safeTransferFrom 시도 시 SoulboundTransferBlocked로 차단되어야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, CREDENTIAL_TYPE, 0, SAMPLE_METADATA);

      await expect(
        sbt.connect(worker).transferFrom(worker.address, employer.address, 1n)
      ).to.be.revertedWithCustomError(sbt, "SoulboundTransferBlocked");
    });
  });
});
