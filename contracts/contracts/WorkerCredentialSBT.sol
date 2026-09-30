// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WorkerCredentialSBT
 * @notice 외국인 노동자 자격 및 신원 증명을 위한 양도 불가능한 Soulbound Token (SBT) v3.0.
 * - [Phase 2 표준화]: bytes32 국가 공인 자격 레지스트리 및 온체인 화이트리스트(isCredentialSupported) 강제.
 * - [Phase 3 거버넌스 2계층]:
 *     1) DEFAULT_ADMIN_ROLE (Safe 2-of-3 Multi-sig): 루트 파라미터, 기관 인가/퇴출, 코드 등록, 심의관 임명
 *     2) OPERATOR_ROLE (단일 서명 심의관): 일상 박탈 승인(approveRevocation), 분실 재발급 승인(approveReissue)
 * - [Phase 3 분실 복구]: 오프라인 대면 검증 기반 재발급(Reissue) 및 온체인 계보(Lineage) 체인 영구 앵커링.
 * - [Phase 3 이중 승인]: 2-Man Rule (Dual Control) - 제안자(Proposer)와 승인자(Operator) 분리(Self-Approval 차단).
 */
contract WorkerCredentialSBT is ERC721, AccessControl, ReentrancyGuard {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // 대한민국 국가 공인 자격증 및 비자 표준 식별자 (Phase 2 규격)
    bytes32 public constant VISA_E9_MFG = keccak256("KR.GOV.VISA.E9.MFG");       // E-9 비전문취업 (제조업)
    bytes32 public constant VISA_E7_SHIP = keccak256("KR.GOV.VISA.E7.SHIP");     // E-7 숙련기능 (조선용접)
    bytes32 public constant CERT_WELDING_1 = keccak256("KR.HRD.CERT.WELDING.G1"); // 용접기능사 1급

    enum IssuerStatus {
        None,           // 비인가 지갑
        Active,         // 정상 운영: 신규 발급 가능, 기발급분 정상 유효
        Decommissioned, // 정상 협약 만료: 신규 발급 불가, 기발급분은 본래 만료일까지 유효 유지
        Blacklisted     // 부정 적발 퇴출: 신규 발급 불가, 기발급분 전부 즉시 강제 소급 무효
    }

    struct Credential {
        bytes32 credentialCode;  // 32바이트 표준 자격 식별자
        address issuer;          // 발급 기관 지갑 주소
        uint64 issuedAt;         // 발급 블록 타임스탬프
        uint64 expiresAt;        // 만료 블록 타임스탬프 (0 = 무기한)
        string metadataURI;      // IPFS 또는 공인 인증서 원본 메타데이터 URI
        bool isRevoked;          // 소프트 폐기 여부 (이력 보존)
        uint64 revokedAt;        // 폐기 처리 일시
        string revokeReason;     // 폐기 사유
        address revokedBy;       // 폐기 처리자 주소
        uint256 previousTokenId; // [Phase 3] 분실 재발급 계보 앵커링 (0 = 제네시스 발급)
    }

    // [Phase 3] 박탈 제안 구조체
    struct RevocationProposal {
        uint256 tokenId;
        address proposer;
        string reason;
        uint64 proposedAt;
        bool executed;
    }

    // [Phase 3] 지갑 분실 재발급 제안 구조체
    struct ReissueProposal {
        uint256 oldTokenId;
        address newWorker;
        address proposer;
        string reason;
        uint64 proposedAt;
        bool executed;
    }

    uint256 private _nextTokenId;
    uint256 private _nextRevocationProposalId;
    uint256 private _nextReissueProposalId;

    mapping(uint256 => Credential) private _credentials;
    mapping(address => IssuerStatus) public issuerStatus;
    mapping(bytes32 => bool) public isCredentialSupported;

    mapping(uint256 => RevocationProposal) public revocationProposals;
    mapping(uint256 => ReissueProposal) public reissueProposals;

    // 커스텀 에러 정의
    error SoulboundTransferBlocked();
    error SoulboundApprovalBlocked();
    error InvalidRecipient();
    error CredentialDoesNotExist();
    error IssuerNotActive(IssuerStatus status);
    error IssuerBlacklisted();
    error CredentialAlreadyRevoked();
    error UnsupportedCredentialCode(bytes32 code);
    error InvalidExpirationDate(uint64 expiresAt, uint64 currentTimestamp);
    error ProposalDoesNotExist(uint256 proposalId);
    error ProposalAlreadyExecuted(uint256 proposalId);
    error SelfApprovalBlocked();
    error InvalidNewWorkerAddress();

    // 이벤트 정의
    event IssuerStatusUpdated(address indexed issuer, IssuerStatus status);
    event CredentialCodeRegistered(bytes32 indexed code);
    event CredentialCodeUnregistered(bytes32 indexed code);
    event CredentialIssued(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed issuer,
        bytes32 credentialCode,
        uint64 expiresAt
    );
    event RevocationProposed(
        uint256 indexed proposalId,
        uint256 indexed tokenId,
        address indexed proposer,
        string reason
    );
    event CredentialRevoked(
        uint256 indexed tokenId,
        address indexed revoker,
        string reason
    );
    event ReissueProposed(
        uint256 indexed proposalId,
        uint256 indexed oldTokenId,
        address indexed newWorker,
        address proposer,
        string reason
    );
    event CredentialReissued(
        uint256 indexed oldTokenId,
        uint256 indexed newTokenId,
        address indexed newWorker,
        address approvedBy
    );

    constructor(address defaultAdmin, address initialIssuer, address initialOperator)
        ERC721("WorkerCredentialSBT", "WCSBT")
    {
        if (defaultAdmin == address(0) || initialIssuer == address(0) || initialOperator == address(0)) {
            revert InvalidRecipient();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ISSUER_ROLE, initialIssuer);
        _grantRole(OPERATOR_ROLE, initialOperator);

        issuerStatus[initialIssuer] = IssuerStatus.Active;
        emit IssuerStatusUpdated(initialIssuer, IssuerStatus.Active);

        // 기본 표준 자격 코드 활성화
        isCredentialSupported[VISA_E9_MFG] = true;
        isCredentialSupported[VISA_E7_SHIP] = true;
        isCredentialSupported[CERT_WELDING_1] = true;
        emit CredentialCodeRegistered(VISA_E9_MFG);
        emit CredentialCodeRegistered(VISA_E7_SHIP);
        emit CredentialCodeRegistered(CERT_WELDING_1);

        _nextTokenId = 1;
        _nextRevocationProposalId = 1;
        _nextReissueProposalId = 1;
    }

    /**
     * @notice 총괄 관리자가 신규 자격 코드를 온체인 레지스트리에 등록합니다.
     */
    function registerCredentialCode(bytes32 code) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isCredentialSupported[code] = true;
        emit CredentialCodeRegistered(code);
    }

    /**
     * @notice 총괄 관리자가 특정 자격 코드 지원을 온체인에서 비활성화합니다.
     */
    function unregisterCredentialCode(bytes32 code) external onlyRole(DEFAULT_ADMIN_ROLE) {
        isCredentialSupported[code] = false;
        emit CredentialCodeUnregistered(code);
    }

    /**
     * @notice 총괄 관리자(DEFAULT_ADMIN_ROLE)가 발급기관의 상태를 갱신합니다.
     */
    function setIssuerStatus(address issuer, IssuerStatus status)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (issuer == address(0)) revert InvalidRecipient();

        issuerStatus[issuer] = status;

        if (status == IssuerStatus.Active) {
            _grantRole(ISSUER_ROLE, issuer);
        } else if (status == IssuerStatus.None) {
            _revokeRole(ISSUER_ROLE, issuer);
        }

        emit IssuerStatusUpdated(issuer, status);
    }

    /**
     * @notice 인가된 발급기관이 노동자 지갑으로 자격 증명 SBT를 발급합니다.
     */
    function issueCredential(
        address to,
        bytes32 credentialCode,
        uint64 expiresAt,
        string calldata metadataURI
    ) external nonReentrant returns (uint256) {
        if (!hasRole(ISSUER_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, ISSUER_ROLE);
        }
        if (issuerStatus[msg.sender] == IssuerStatus.Blacklisted) {
            revert IssuerBlacklisted();
        }
        if (issuerStatus[msg.sender] == IssuerStatus.Decommissioned) {
            revert IssuerNotActive(IssuerStatus.Decommissioned);
        }
        if (issuerStatus[msg.sender] != IssuerStatus.Active) {
            revert IssuerNotActive(issuerStatus[msg.sender]);
        }
        if (to == address(0)) {
            revert InvalidRecipient();
        }
        if (!isCredentialSupported[credentialCode]) {
            revert UnsupportedCredentialCode(credentialCode);
        }
        if (expiresAt != 0 && expiresAt <= block.timestamp) {
            revert InvalidExpirationDate(expiresAt, uint64(block.timestamp));
        }

        uint256 tokenId = _nextTokenId++;

        _credentials[tokenId] = Credential({
            credentialCode: credentialCode,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            metadataURI: metadataURI,
            isRevoked: false,
            revokedAt: 0,
            revokeReason: "",
            revokedBy: address(0),
            previousTokenId: 0
        });

        _safeMint(to, tokenId);

        emit CredentialIssued(tokenId, to, msg.sender, credentialCode, expiresAt);
        return tokenId;
    }

    /* -------------------------------------------------------------------------- */
    /*               [Phase 3] 2단계 소프트 박탈 (Revocation Workflow)               */
  /* -------------------------------------------------------------------------- */

    /**
     * @notice [Phase 3] 발급기관(ISSUER_ROLE)이 자격 박탈 심의 안건을 상정합니다.
     */
    function proposeRevocation(uint256 tokenId, string calldata reason)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 proposalId)
    {
        _requireOwned(tokenId);
        if (_credentials[tokenId].isRevoked) {
            revert CredentialAlreadyRevoked();
        }

        proposalId = _nextRevocationProposalId++;
        revocationProposals[proposalId] = RevocationProposal({
            tokenId: tokenId,
            proposer: msg.sender,
            reason: reason,
            proposedAt: uint64(block.timestamp),
            executed: false
        });

        emit RevocationProposed(proposalId, tokenId, msg.sender, reason);
    }

    /**
     * @notice [Phase 3] 운영 심의관(OPERATOR_ROLE)이 박탈 안건을 최종 승인합니다.
     * 2-Man Rule: 제안자 본인의 셀프 승인은 차단 (관리자 직권 예외)
     */
    function approveRevocation(uint256 proposalId)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
    {
        RevocationProposal storage prop = revocationProposals[proposalId];
        if (prop.proposedAt == 0) revert ProposalDoesNotExist(proposalId);
        if (prop.executed) revert ProposalAlreadyExecuted(proposalId);
        if (prop.proposer == msg.sender && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert SelfApprovalBlocked();
        }

        _requireOwned(prop.tokenId);
        Credential storage cred = _credentials[prop.tokenId];
        if (cred.isRevoked) revert CredentialAlreadyRevoked();

        cred.isRevoked = true;
        cred.revokedAt = uint64(block.timestamp);
        cred.revokeReason = prop.reason;
        cred.revokedBy = msg.sender;

        prop.executed = true;
        emit CredentialRevoked(prop.tokenId, msg.sender, prop.reason);
    }

    /**
     * @notice [Phase 3] 총괄 관리자(DEFAULT_ADMIN_ROLE)의 긴급 직권 즉시 박탈
     */
    function emergencyRevokeCredential(uint256 tokenId, string calldata reason)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _requireOwned(tokenId);
        Credential storage cred = _credentials[tokenId];
        if (cred.isRevoked) revert CredentialAlreadyRevoked();

        cred.isRevoked = true;
        cred.revokedAt = uint64(block.timestamp);
        cred.revokeReason = reason;
        cred.revokedBy = msg.sender;

        emit CredentialRevoked(tokenId, msg.sender, reason);
    }

    /* -------------------------------------------------------------------------- */
    /*             [Phase 3] 지갑 분실 대면 재발급 & 계보 체인 (Reissue)               */
    /* -------------------------------------------------------------------------- */

    /**
     * @notice [Phase 3] 발급기관이 지갑 분실 노동자의 오프라인 대면 확인 후 재발급 안건을 상정합니다.
     */
    function proposeReissue(uint256 oldTokenId, address newWorker, string calldata reason)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 proposalId)
    {
        _requireOwned(oldTokenId);
        if (newWorker == address(0) || newWorker == _ownerOf(oldTokenId)) {
            revert InvalidNewWorkerAddress();
        }
        if (_credentials[oldTokenId].isRevoked) {
            revert CredentialAlreadyRevoked();
        }

        proposalId = _nextReissueProposalId++;
        reissueProposals[proposalId] = ReissueProposal({
            oldTokenId: oldTokenId,
            newWorker: newWorker,
            proposer: msg.sender,
            reason: reason,
            proposedAt: uint64(block.timestamp),
            executed: false
        });

        emit ReissueProposed(proposalId, oldTokenId, newWorker, msg.sender, reason);
    }

    /**
     * @notice [Phase 3] 운영 심의관(OPERATOR_ROLE)이 서류 대조 후 재발급을 승인합니다.
     * 구 토큰 소프트 폐기 + 신규 토큰 계보 연결(previousTokenId = oldTokenId)
     */
    function approveReissue(uint256 proposalId)
        external
        nonReentrant
        onlyRole(OPERATOR_ROLE)
        returns (uint256 newTokenId)
    {
        ReissueProposal storage prop = reissueProposals[proposalId];
        if (prop.proposedAt == 0) revert ProposalDoesNotExist(proposalId);
        if (prop.executed) revert ProposalAlreadyExecuted(proposalId);
        if (prop.proposer == msg.sender && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert SelfApprovalBlocked();
        }

        _requireOwned(prop.oldTokenId);
        Credential storage oldCred = _credentials[prop.oldTokenId];
        if (oldCred.isRevoked) revert CredentialAlreadyRevoked();

        // 1. 구 토큰 소프트 폐기 (분실 승계 사유 영구 보존)
        oldCred.isRevoked = true;
        oldCred.revokedAt = uint64(block.timestamp);
        oldCred.revokeReason = string.concat(unicode"지갑 분실 승계 재발급: ", prop.reason);
        oldCred.revokedBy = msg.sender;
        emit CredentialRevoked(prop.oldTokenId, msg.sender, oldCred.revokeReason);

        // 2. 신규 토큰 민팅 및 계보 연결
        newTokenId = _nextTokenId++;
        _credentials[newTokenId] = Credential({
            credentialCode: oldCred.credentialCode,
            issuer: oldCred.issuer,
            issuedAt: uint64(block.timestamp),
            expiresAt: oldCred.expiresAt,
            metadataURI: oldCred.metadataURI,
            isRevoked: false,
            revokedAt: 0,
            revokeReason: "",
            revokedBy: address(0),
            previousTokenId: prop.oldTokenId
        });

        _safeMint(prop.newWorker, newTokenId);
        prop.executed = true;

        emit CredentialIssued(newTokenId, prop.newWorker, oldCred.issuer, oldCred.credentialCode, oldCred.expiresAt);
        emit CredentialReissued(prop.oldTokenId, newTokenId, prop.newWorker, msg.sender);
    }

    /**
     * @notice [Phase 3] 토큰의 온체인 승계 계보(Lineage) 목록을 조회합니다.
     * [최신 토큰 ID, 이전 토큰 ID, ..., 최초 제네시스 토큰 ID]
     */
    function getCredentialLineage(uint256 tokenId)
        external
        view
        returns (uint256[] memory)
    {
        _requireOwned(tokenId);
        uint256 count = 1;
        uint256 curr = tokenId;
        while (_credentials[curr].previousTokenId != 0) {
            count++;
            curr = _credentials[curr].previousTokenId;
        }

        uint256[] memory lineage = new uint256[](count);
        curr = tokenId;
        for (uint256 i = 0; i < count; i++) {
            lineage[i] = curr;
            curr = _credentials[curr].previousTokenId;
        }
        return lineage;
    }

    /**
     * @notice 자격 증명의 현 시점 온체인 유효성 종합 판정
     */
    function isCredentialValid(uint256 tokenId) external view returns (bool) {
        address owner = _ownerOf(tokenId);
        if (owner == address(0)) return false;

        Credential memory cred = _credentials[tokenId];

        // 1. 박탈 이력 확인 (소프트 폐기 또는 재발급으로 이전된 구 토큰)
        if (cred.isRevoked) return false;

        // 2. 만료일 확인
        if (cred.expiresAt > 0 && block.timestamp >= cred.expiresAt) return false;

        // 3. 발급기관 상태 검증
        IssuerStatus status = issuerStatus[cred.issuer];
        if (status == IssuerStatus.Blacklisted || status == IssuerStatus.None) {
            return false;
        }

        return true;
    }

    function getCredential(uint256 tokenId)
        external
        view
        returns (Credential memory)
    {
        _requireOwned(tokenId);
        return _credentials[tokenId];
    }

    function getCredentialsByOwner(address owner)
        external
        view
        returns (uint256[] memory)
    {
        if (owner == address(0)) revert InvalidRecipient();

        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        uint256 count = 0;
        uint256 currentSupply = _nextTokenId - 1;

        for (uint256 i = 1; i <= currentSupply && count < balance; i++) {
            if (_ownerOf(i) == owner) {
                tokens[count] = i;
                count++;
            }
        }
        return tokens;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    /**
     * @dev 양도 차단 (Soulbound Mechanism)
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);

        if (from != address(0) && to != address(0)) {
            revert SoulboundTransferBlocked();
        }

        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public virtual override {
        revert SoulboundApprovalBlocked();
    }

    function setApprovalForAll(address, bool) public virtual override {
        revert SoulboundApprovalBlocked();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
