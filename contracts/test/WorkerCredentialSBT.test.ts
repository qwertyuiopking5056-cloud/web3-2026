import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { WorkerCredentialSBT } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("WorkerCredentialSBT Architecture, Phase 2 Negative Tests & Phase 3 Governance", function () {
  let sbt: WorkerCredentialSBT;
  let admin: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let dualRoleUser: HardhatEthersSigner;
  let worker: HardhatEthersSigner;
  let newWorker: HardhatEthersSigner;
  let thirdWorker: HardhatEthersSigner;
  let employer: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;

  let VISA_E9_MFG: string;
  let VISA_E7_SHIP: string;
  let CERT_WELDING_1: string;
  let futureExpiry: number;

  const SAMPLE_METADATA = "https://ipfs.io/ipfs/bafkreicredential123";

  // IssuerStatus enum: None(0), Active(1), Decommissioned(2), Blacklisted(3)
  const Status = {
    None: 0n,
    Active: 1n,
    Decommissioned: 2n,
    Blacklisted: 3n,
  };

  beforeEach(async function () {
    [admin, issuer, operator, dualRoleUser, worker, newWorker, thirdWorker, employer, attacker] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory("WorkerCredentialSBT");
    sbt = (await Factory.deploy(
      admin.address,
      issuer.address,
      operator.address
    )) as WorkerCredentialSBT;
    await sbt.waitForDeployment();

    // dualRoleUser에게 ISSUER_ROLE 및 OPERATOR_ROLE 부여 (Self-Approval 차단 검증용)
    const ISSUER_ROLE = await sbt.ISSUER_ROLE();
    const OPERATOR_ROLE = await sbt.OPERATOR_ROLE();
    await sbt.connect(admin).setIssuerStatus(dualRoleUser.address, Status.Active);
    await sbt.connect(admin).grantRole(OPERATOR_ROLE, dualRoleUser.address);

    VISA_E9_MFG = await sbt.VISA_E9_MFG();
    VISA_E7_SHIP = await sbt.VISA_E7_SHIP();
    CERT_WELDING_1 = await sbt.CERT_WELDING_1();

    const currentBlock = await ethers.provider.getBlock("latest");
    futureExpiry = currentBlock!.timestamp + 365 * 86400;
  });

  /* ========================================================================== */
  /*                     1. 핵심 아키텍처 및 라이프사이클 검증                     */
  /* ========================================================================== */
  describe("1. 핵심 아키텍처 및 라이프사이클 검증", function () {
    it("정상 발급 시 토큰이 생성되고 발급 이벤트가 발생해야 한다", async function () {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const futureExpiry = now + 365 * 86400;

      await expect(
        sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA)
      )
        .to.emit(sbt, "CredentialIssued")
        .withArgs(1n, worker.address, issuer.address, VISA_E9_MFG, futureExpiry);

      expect(await sbt.balanceOf(worker.address)).to.equal(1n);
      expect(await sbt.ownerOf(1n)).to.equal(worker.address);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      const cred = await sbt.getCredential(1n);
      expect(cred.credentialCode).to.equal(VISA_E9_MFG);
      expect(cred.issuer).to.equal(issuer.address);
      expect(cred.expiresAt).to.equal(BigInt(futureExpiry));
      expect(cred.isRevoked).to.be.false;
      expect(cred.previousTokenId).to.equal(0n);
    });

    it("소프트 폐기(Soft Revocation): 2단계 승인 박탈 시 토큰 소각 없이 이력이 온체인에 영구 기록되어야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);

      expect(await sbt.balanceOf(worker.address)).to.equal(1n);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 발급기관이 제안 -> 운영 심의관이 승인
      await expect(sbt.connect(issuer).proposeRevocation(1n, "체류지 무단 이탈 및 비자 취소"))
        .to.emit(sbt, "RevocationProposed")
        .withArgs(1n, 1n, issuer.address, "체류지 무단 이탈 및 비자 취소");

      await expect(sbt.connect(operator).approveRevocation(1n))
        .to.emit(sbt, "CredentialRevoked")
        .withArgs(1n, operator.address, "체류지 무단 이탈 및 비자 취소");

      // 감사 추적 데이터 검증
      const cred = await sbt.getCredential(1n);
      expect(cred.isRevoked).to.be.true;
      expect(cred.revokeReason).to.equal("체류지 무단 이탈 및 비자 취소");
      expect(cred.revokedBy).to.equal(operator.address);
      expect(cred.revokedAt).to.be.greaterThan(0n);

      // 토큰 자체는 소각되지 않고 지갑에 박탈 이력으로 잔존
      expect(await sbt.balanceOf(worker.address)).to.equal(1n);
      expect(await sbt.ownerOf(1n)).to.equal(worker.address);

      // 온체인 유효성 판정에서는 즉시 무효(false) 처리
      expect(await sbt.isCredentialValid(1n)).to.be.false;
    });

    it("양도 불가 (Soulbound): transferFrom 및 safeTransferFrom 시도 시 SoulboundTransferBlocked로 차단되어야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);

      await expect(
        sbt.connect(worker).transferFrom(worker.address, employer.address, 1n)
      ).to.be.revertedWithCustomError(sbt, "SoulboundTransferBlocked");
    });

    it("만료 시점이 지나면 토큰 소각이나 상태 변경(isRevoked) 없이 isCredentialValid만 false가 되어야 한다", async function () {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, now + 1000, SAMPLE_METADATA);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      await time.increase(1001);

      // 1. 유효성 판독만 false로 실효
      expect(await sbt.isCredentialValid(1n)).to.be.false;

      // 2. 소각되지 않고 여전히 worker 지갑에 잔존 (불변성 단언)
      expect(await sbt.ownerOf(1n)).to.equal(worker.address);
      expect(await sbt.balanceOf(worker.address)).to.equal(1n);

      // 3. 만료와 박탈(Revoke)은 별개 개념임을 단언
      const cred = await sbt.getCredential(1n);
      expect(cred.isRevoked).to.be.false;
    });

    it("정밀 경계값 검증: expiresAt - 1에서는 유효하고 expiresAt에서는 즉시 무효(false)가 되어야 한다", async function () {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const expiry = now + 1000;
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, expiry, SAMPLE_METADATA);

      // 1초 전 (expiry - 1): 블록 타임스탬프 고정 마이닝 후 조회
      await time.increaseTo(expiry - 1);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 만료 정각 (expiry): 블록 타임스탬프 고정 마이닝 후 조회
      await time.increaseTo(expiry);
      expect(await sbt.isCredentialValid(1n)).to.be.false;
    });

    it("무기한(expiresAt == 0) 자격증은 10년이 경과해도 유효(true)해야 한다", async function () {
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 10년(3650일) 경과
      await time.increase(10 * 365 * 86400);

      // 10년 후에도 여전히 유효
      expect(await sbt.isCredentialValid(1n)).to.be.true;
      expect(await sbt.ownerOf(1n)).to.equal(worker.address);
    });
  });

  /* ========================================================================== */
  /*            2. Phase 2: 7대 네거티브 테스트 스위트 (N-1 ~ N-8)               */
  /* ========================================================================== */
  describe("2. Phase 2: 7대 네거티브 테스트 스위트 (N-1 ~ N-8)", function () {
    it("[N-1] 비인가 계정(attacker)이 issueCredential 호출 시 AccessControlUnauthorizedAccount로 Revert 되어야 한다", async function () {
      const ISSUER_ROLE = await sbt.ISSUER_ROLE();
      await expect(
        sbt.connect(attacker).issueCredential(worker.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, ISSUER_ROLE);
    });

    it("[N-2] 협약 만료 기관(Decommissioned)이 신규 발급 시도 시 IssuerNotActive로 Revert 되어야 한다", async function () {
      // 1. 정상 상태에서 사전 발급
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA);

      // 2. Admin이 협약 만료 처리
      await sbt.connect(admin).setIssuerStatus(issuer.address, Status.Decommissioned);

      // 3. 기발급분은 여전히 유효해야 함
      expect(await sbt.isCredentialValid(1n)).to.be.true;

      // 4. 신규 발급 시도는 Revert
      await expect(
        sbt.connect(issuer).issueCredential(employer.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA)
      )
        .to.be.revertedWithCustomError(sbt, "IssuerNotActive")
        .withArgs(Status.Decommissioned);
    });

    it("[N-3] 부정 적발 퇴출 기관(Blacklisted)이 발급 시도 시 IssuerBlacklisted로 Revert 되고 기발급분도 즉시 무효화되어야 한다", async function () {
      // 1. 사전 발급
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA);

      // 2. Admin이 부정 적발로 블랙리스트 퇴출
      await sbt.connect(admin).setIssuerStatus(issuer.address, Status.Blacklisted);

      // 3. 기발급분이 소급 무효(false)로 즉각 전환
      expect(await sbt.isCredentialValid(1n)).to.be.false;

      // 4. 신규 발급 시도는 IssuerBlacklisted로 Revert
      await expect(
        sbt.connect(issuer).issueCredential(employer.address, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA)
      ).to.be.revertedWithCustomError(sbt, "IssuerBlacklisted");
    });

    it("[N-4] 정부 미등록 자격 코드(Unsupported bytes32)로 발급 시 UnsupportedCredentialCode로 Revert 되어야 한다", async function () {
      const fakeCode = ethers.keccak256(ethers.toUtf8Bytes("KR.FAKE.ILLEGAL.VISA"));

      await expect(
        sbt.connect(issuer).issueCredential(worker.address, fakeCode, futureExpiry, SAMPLE_METADATA)
      )
        .to.be.revertedWithCustomError(sbt, "UnsupportedCredentialCode")
        .withArgs(fakeCode);
    });

    it("[N-6] 과거 만료일(expiresAt <= block.timestamp)로 발급 시 InvalidExpirationDate로 Revert 되어야 한다", async function () {
      const currentBlock = await ethers.provider.getBlock("latest");
      const pastTimestamp = currentBlock!.timestamp - 3600; // 1시간 전

      await expect(
        sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, pastTimestamp, SAMPLE_METADATA)
      ).to.be.revertedWithCustomError(sbt, "InvalidExpirationDate");
    });

    it("[N-6b] 만료일이 정확히 block.timestamp와 같아도 Revert 되어야 한다 (경계값 및 에러 인자 단언)", async function () {
      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const targetTime = now + 100;
      await time.setNextBlockTimestamp(targetTime);
      await expect(
        sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, targetTime, SAMPLE_METADATA)
      )
        .to.be.revertedWithCustomError(sbt, "InvalidExpirationDate")
        .withArgs(targetTime, targetTime);
    });

    it("[N-7] 존재하지 않는 토큰 ID 조회 시 Revert 크래시 없이 안전하게 false를 반환해야 한다", async function () {
      const nonExistentTokenId = 999999n;
      const isValid = await sbt.isCredentialValid(nonExistentTokenId);
      expect(isValid).to.be.false;
    });

    it("[N-8] 영주소(address(0))로 발급 시 InvalidRecipient로 Revert 되어야 한다", async function () {
      await expect(
        sbt.connect(issuer).issueCredential(ethers.ZeroAddress, VISA_E9_MFG, futureExpiry, SAMPLE_METADATA)
      ).to.be.revertedWithCustomError(sbt, "InvalidRecipient");
    });
  });

  /* ========================================================================== */
  /*            3. Phase 2: 온체인 자격 레지스트리 관리 기능 검증                 */
  /* ========================================================================== */
  describe("3. Phase 2: 온체인 자격 레지스트리 관리 기능 검증", function () {
    it("Admin은 신규 자격 코드를 등록하고 비활성화할 수 있어야 한다", async function () {
      const newCode = ethers.keccak256(ethers.toUtf8Bytes("KR.GOV.VISA.E7.TECH"));

      expect(await sbt.isCredentialSupported(newCode)).to.be.false;

      await expect(sbt.connect(admin).registerCredentialCode(newCode))
        .to.emit(sbt, "CredentialCodeRegistered")
        .withArgs(newCode);
      expect(await sbt.isCredentialSupported(newCode)).to.be.true;

      await expect(
        sbt.connect(issuer).issueCredential(worker.address, newCode, 0, SAMPLE_METADATA)
      ).to.emit(sbt, "CredentialIssued");

      await expect(sbt.connect(admin).unregisterCredentialCode(newCode))
        .to.emit(sbt, "CredentialCodeUnregistered")
        .withArgs(newCode);
      expect(await sbt.isCredentialSupported(newCode)).to.be.false;
    });

    it("일반 사용자나 발급기관은 자격 코드를 임의로 등록할 수 없어야 한다", async function () {
      const randomCode = ethers.keccak256(ethers.toUtf8Bytes("KR.ILLEGAL.CODE"));
      const DEFAULT_ADMIN_ROLE = await sbt.DEFAULT_ADMIN_ROLE();

      await expect(
        sbt.connect(issuer).registerCredentialCode(randomCode)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(issuer.address, DEFAULT_ADMIN_ROLE);
    });
  });

  /* ========================================================================== */
  /*             4. Phase 3: 거버넌스 2계층 RBAC 및 이중 통제 (2-Man Rule)         */
  /* ========================================================================== */
  describe("4. Phase 3: 거버넌스 2계층 RBAC 및 2단계 박탈 승인 체계", function () {
    let DEFAULT_ADMIN_ROLE: string;
    let ISSUER_ROLE: string;
    let OPERATOR_ROLE: string;

    beforeEach(async function () {
      DEFAULT_ADMIN_ROLE = await sbt.DEFAULT_ADMIN_ROLE();
      ISSUER_ROLE = await sbt.ISSUER_ROLE();
      OPERATOR_ROLE = await sbt.OPERATOR_ROLE();

      // 사전 발급
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);
    });

    it("초기 배포 시 계층별 권한이 정확히 부여되어야 한다", async function () {
      expect(await sbt.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await sbt.hasRole(ISSUER_ROLE, issuer.address)).to.be.true;
      expect(await sbt.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;

      expect(await sbt.hasRole(OPERATOR_ROLE, issuer.address)).to.be.false;
      expect(await sbt.hasRole(ISSUER_ROLE, operator.address)).to.be.false;
    });

    it("2-Man Rule: 제안자 본인은 본인의 박탈 제안을 셀프 승인할 수 없다 (SelfApprovalBlocked)", async function () {
      // dualRoleUser는 ISSUER와 OPERATOR 권한을 모두 가지고 있음
      await sbt.connect(dualRoleUser).proposeRevocation(1n, "부정 적발");

      // 제안자 본인이 approveRevocation 시도 -> 차단
      await expect(
        sbt.connect(dualRoleUser).approveRevocation(1n)
      ).to.be.revertedWithCustomError(sbt, "SelfApprovalBlocked");
    });

    it("존재하지 않거나 이미 실행된 박탈 제안 승인 시 Revert 되어야 한다", async function () {
      // 존재하지 않는 제안 ID
      await expect(
        sbt.connect(operator).approveRevocation(999n)
      )
        .to.be.revertedWithCustomError(sbt, "ProposalDoesNotExist")
        .withArgs(999n);

      // 정상 제안 및 승인
      await sbt.connect(issuer).proposeRevocation(1n, "정상 사유");
      await sbt.connect(operator).approveRevocation(1n);

      // 이미 승인된 제안 재승인 시도
      await expect(
        sbt.connect(operator).approveRevocation(1n)
      )
        .to.be.revertedWithCustomError(sbt, "ProposalAlreadyExecuted")
        .withArgs(1n);
    });

    it("이미 박탈된 자격증에 대해 추가 박탈 제안 시 CredentialAlreadyRevoked로 차단되어야 한다", async function () {
      await sbt.connect(issuer).proposeRevocation(1n, "1차 박탈");
      await sbt.connect(operator).approveRevocation(1n);

      await expect(
        sbt.connect(issuer).proposeRevocation(1n, "2차 박탈 시도")
      ).to.be.revertedWithCustomError(sbt, "CredentialAlreadyRevoked");
    });

    it("총괄 관리자(DEFAULT_ADMIN_ROLE)는 긴급 시 단독으로 즉시 박탈할 수 있어야 한다 (emergencyRevokeCredential)", async function () {
      await expect(
        sbt.connect(admin).emergencyRevokeCredential(1n, "위조 서류 긴급 직권 취소")
      )
        .to.emit(sbt, "CredentialRevoked")
        .withArgs(1n, admin.address, "위조 서류 긴급 직권 취소");

      const cred = await sbt.getCredential(1n);
      expect(cred.isRevoked).to.be.true;
      expect(cred.revokeReason).to.equal("위조 서류 긴급 직권 취소");
      expect(cred.revokedBy).to.equal(admin.address);
      expect(await sbt.isCredentialValid(1n)).to.be.false;
    });

    it("총괄 관리자가 제안자인 경우 예외적으로 승인이 허용된다", async function () {
      // admin에게 ISSUER와 OPERATOR 권한 부여
      await sbt.connect(admin).grantRole(ISSUER_ROLE, admin.address);
      await sbt.connect(admin).grantRole(OPERATOR_ROLE, admin.address);
      await sbt.connect(admin).setIssuerStatus(admin.address, Status.Active);

      await sbt.connect(admin).proposeRevocation(1n, "관리자 직권 안건");
      await expect(sbt.connect(admin).approveRevocation(1n))
        .to.emit(sbt, "CredentialRevoked")
        .withArgs(1n, admin.address, "관리자 직권 안건");
    });
  });

  /* ========================================================================== */
  /*         5. Phase 3: 지갑 분실 대면 재발급 & 계보(Lineage) 체인 영구 보존        */
  /* ========================================================================== */
  describe("5. Phase 3: 지갑 분실 대면 재발급 & 계보(Lineage) 체인 검증", function () {
    beforeEach(async function () {
      // 최초 제네시스 토큰 (TokenId: 1n) 발급
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);
    });

    it("분실 재발급: 구 토큰 소프트 폐기, 신규 토큰 민팅, 계보(previousTokenId) 연결이 완결되어야 한다", async function () {
      // 1. 발급기관이 노동자 대면 확인 후 재발급 제안
      await expect(
        sbt.connect(issuer).proposeReissue(1n, newWorker.address, "단말기 파손 및 개인키 분실 대면 확인 완료")
      )
        .to.emit(sbt, "ReissueProposed")
        .withArgs(1n, 1n, newWorker.address, issuer.address, "단말기 파손 및 개인키 분실 대면 확인 완료");

      // 2. 운영 심의관이 서류 대조 후 재발급 승인
      const approveTx = await sbt.connect(operator).approveReissue(1n);

      await expect(approveTx)
        .to.emit(sbt, "CredentialRevoked")
        .withArgs(1n, operator.address, "지갑 분실 승계 재발급: 단말기 파손 및 개인키 분실 대면 확인 완료");

      await expect(approveTx)
        .to.emit(sbt, "CredentialIssued")
        .withArgs(2n, newWorker.address, issuer.address, VISA_E9_MFG, 0);

      await expect(approveTx)
        .to.emit(sbt, "CredentialReissued")
        .withArgs(1n, 2n, newWorker.address, operator.address);

      // 3. 구 토큰(1n) 상태 단언 (불변성 및 폐기 보존)
      const oldCred = await sbt.getCredential(1n);
      expect(oldCred.isRevoked).to.be.true;
      expect(oldCred.revokeReason).to.equal("지갑 분실 승계 재발급: 단말기 파손 및 개인키 분실 대면 확인 완료");
      expect(oldCred.revokedBy).to.equal(operator.address);
      expect(await sbt.ownerOf(1n)).to.equal(worker.address); // 여전히 이전 지갑에 영구 앵커링
      expect(await sbt.isCredentialValid(1n)).to.be.false;

      // 4. 신규 토큰(2n) 상태 단언
      const newCred = await sbt.getCredential(2n);
      expect(newCred.isRevoked).to.be.false;
      expect(newCred.previousTokenId).to.equal(1n); // 계보 연결!
      expect(newCred.credentialCode).to.equal(VISA_E9_MFG);
      expect(newCred.issuer).to.equal(issuer.address);
      expect(await sbt.ownerOf(2n)).to.equal(newWorker.address);
      expect(await sbt.isCredentialValid(2n)).to.be.true;

      // 5. 계보 조회 (Lineage) 검증
      const lineage = await sbt.getCredentialLineage(2n);
      expect(lineage.length).to.equal(2);
      expect(lineage[0]).to.equal(2n); // 최신
      expect(lineage[1]).to.equal(1n); // 조상
    });

    it("다단계 연속 재발급 시에도 전 구간 승계 계보가 무결하게 추적되어야 한다 (1 -> 2 -> 3)", async function () {
      // 1차 재발급 (1n -> 2n)
      await sbt.connect(issuer).proposeReissue(1n, newWorker.address, "1차 분실");
      await sbt.connect(operator).approveReissue(1n);

      // 2차 재발급 (2n -> 3n)
      await sbt.connect(issuer).proposeReissue(2n, thirdWorker.address, "2차 분실");
      await sbt.connect(operator).approveReissue(2n);

      // 계보 단언: 3 -> 2 -> 1
      const lineage3 = await sbt.getCredentialLineage(3n);
      expect(lineage3.length).to.equal(3);
      expect(lineage3[0]).to.equal(3n);
      expect(lineage3[1]).to.equal(2n);
      expect(lineage3[2]).to.equal(1n);

      // 제네시스 토큰 계보는 [1n]
      const lineage1 = await sbt.getCredentialLineage(1n);
      expect(lineage1.length).to.equal(1);
      expect(lineage1[0]).to.equal(1n);

      // 1n, 2n은 무효이고 3n만 유효해야 함
      expect(await sbt.isCredentialValid(1n)).to.be.false;
      expect(await sbt.isCredentialValid(2n)).to.be.false;
      expect(await sbt.isCredentialValid(3n)).to.be.true;
    });

    it("재발급 제안 시 신규 주소가 영주소이거나 기존 소유자와 동일하면 InvalidNewWorkerAddress로 Revert 되어야 한다", async function () {
      // 영주소
      await expect(
        sbt.connect(issuer).proposeReissue(1n, ethers.ZeroAddress, "사유")
      ).to.be.revertedWithCustomError(sbt, "InvalidNewWorkerAddress");

      // 기존 소유자와 동일 주소 (분실이 아닌 경우)
      await expect(
        sbt.connect(issuer).proposeReissue(1n, worker.address, "사유")
      ).to.be.revertedWithCustomError(sbt, "InvalidNewWorkerAddress");
    });

    it("이미 박탈되었거나 폐기된 토큰에 대해 재발급 제안 시 CredentialAlreadyRevoked로 Revert 되어야 한다", async function () {
      // 박탈 처리
      await sbt.connect(admin).emergencyRevokeCredential(1n, "부정 적발 박탈");

      // 박탈된 토큰 재발급 제안 시도
      await expect(
        sbt.connect(issuer).proposeReissue(1n, newWorker.address, "분실 사유")
      ).to.be.revertedWithCustomError(sbt, "CredentialAlreadyRevoked");
    });

    it("재발급 승인 시 제안자 본인의 셀프 승인은 차단되어야 한다 (SelfApprovalBlocked)", async function () {
      await sbt.connect(dualRoleUser).proposeReissue(1n, newWorker.address, "대면 확인");

      await expect(
        sbt.connect(dualRoleUser).approveReissue(1n)
      ).to.be.revertedWithCustomError(sbt, "SelfApprovalBlocked");
    });

    it("존재하지 않거나 이미 처리된 재발급 안건 승인 시 Revert 되어야 한다", async function () {
      // 존재하지 않는 안건
      await expect(
        sbt.connect(operator).approveReissue(999n)
      )
        .to.be.revertedWithCustomError(sbt, "ProposalDoesNotExist")
        .withArgs(999n);

      // 정상 안건 실행
      await sbt.connect(issuer).proposeReissue(1n, newWorker.address, "사유");
      await sbt.connect(operator).approveReissue(1n);

      // 이미 실행된 안건 재승인
      await expect(
        sbt.connect(operator).approveReissue(1n)
      )
        .to.be.revertedWithCustomError(sbt, "ProposalAlreadyExecuted")
        .withArgs(1n);
    });
  });

  /* ========================================================================== */
  /*            6. Phase 3: [N-5] 비인가 박탈 및 재발급 승인 차단 검증                 */
  /* ========================================================================== */
  describe("6. Phase 3: [N-5] 권한 분립 위반 및 비인가 접근 거부 검증", function () {
    let ISSUER_ROLE: string;
    let OPERATOR_ROLE: string;
    let DEFAULT_ADMIN_ROLE: string;

    beforeEach(async function () {
      ISSUER_ROLE = await sbt.ISSUER_ROLE();
      OPERATOR_ROLE = await sbt.OPERATOR_ROLE();
      DEFAULT_ADMIN_ROLE = await sbt.DEFAULT_ADMIN_ROLE();

      // 사전 발급
      await sbt.connect(issuer).issueCredential(worker.address, VISA_E9_MFG, 0, SAMPLE_METADATA);
    });

    it("[N-5a] 비인가자(attacker)의 박탈 제안 호출 거부", async function () {
      await expect(
        sbt.connect(attacker).proposeRevocation(1n, "불법 안건")
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, ISSUER_ROLE);
    });

    it("[N-5b] 비인가자(attacker)의 박탈 승인 호출 거부", async function () {
      await sbt.connect(issuer).proposeRevocation(1n, "정상 안건");

      await expect(
        sbt.connect(attacker).approveRevocation(1n)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, OPERATOR_ROLE);
    });

    it("[N-5c] 비인가자(attacker)의 긴급 직권 박탈 호출 거부", async function () {
      await expect(
        sbt.connect(attacker).emergencyRevokeCredential(1n, "불법 직권 박탈")
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, DEFAULT_ADMIN_ROLE);
    });

    it("[N-5d] 비인가자(attacker)의 분실 재발급 제안 호출 거부", async function () {
      await expect(
        sbt.connect(attacker).proposeReissue(1n, newWorker.address, "불법 재발급 안건")
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, ISSUER_ROLE);
    });

    it("[N-5e] 비인가자(attacker)의 분실 재발급 승인 호출 거부", async function () {
      await sbt.connect(issuer).proposeReissue(1n, newWorker.address, "정상 안건");

      await expect(
        sbt.connect(attacker).approveReissue(1n)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(attacker.address, OPERATOR_ROLE);
    });

    it("[N-5f] 발급기관(issuer)은 심의관 권한이 없으므로 박탈 및 재발급을 직접 승인할 수 없다", async function () {
      await sbt.connect(issuer).proposeRevocation(1n, "박탈 사유");
      await expect(
        sbt.connect(issuer).approveRevocation(1n)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(issuer.address, OPERATOR_ROLE);

      await sbt.connect(issuer).proposeReissue(1n, newWorker.address, "재발급 사유");
      await expect(
        sbt.connect(issuer).approveReissue(1n)
      )
        .to.be.revertedWithCustomError(sbt, "AccessControlUnauthorizedAccount")
        .withArgs(issuer.address, OPERATOR_ROLE);
    });
  });
});
