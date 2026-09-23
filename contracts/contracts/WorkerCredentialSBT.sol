// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title WorkerCredentialSBT
 * @notice 외국인 노동자 자격 및 신원 증명을 위한 양도 불가능한 Soulbound Token (SBT).
 * - 소각 대신 소프트 폐기 플래그(isRevoked, revokeReason)를 적용하여 온체인 감사 이력 영구 보존.
 * - 발급기관 상태를 Active / Decommissioned / Blacklisted 3단계로 분리하여, 협약 종료와 부정 적발을 구분.
 * - ERC-721 전송 및 승인을 원천 차단하여 타인에게 양도 및 대여 불가.
 */
contract WorkerCredentialSBT is ERC721, AccessControl, ReentrancyGuard {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    enum IssuerStatus {
        None,           // 비인가 지갑
        Active,         // 정상 운영: 신규 발급 가능, 기발급분 정상 유효
        Decommissioned, // 정상 협약 만료: 신규 발급 불가, 기발급분은 본래 만료일까지 유효 유지
        Blacklisted     // 부정 적발 퇴출: 신규 발급 불가, 기발급분 전부 즉시 강제 소급 무효
    }

    struct Credential {
        string credentialType; // 예: "E-9-비전문취업 (제조업)", "선박용접기능공"
        address issuer;        // 발급 기관 지갑 주소
        uint64 issuedAt;       // 발급 블록 타임스탬프
        uint64 expiresAt;      // 만료 블록 타임스탬프 (0 = 무기한)
        string metadataURI;    // IPFS 또는 공인 인증서 원본 메타데이터 URI
        bool isRevoked;        // 소프트 폐기 여부 (이력 보존)
        uint64 revokedAt;      // 폐기 처리 일시
        string revokeReason;   // 폐기 사유
        address revokedBy;     // 폐기 처리자 주소
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Credential) private _credentials;
    mapping(address => IssuerStatus) public issuerStatus;

    // 커스텀 에러 정의
    error SoulboundTransferBlocked();
    error SoulboundApprovalBlocked();
    error InvalidRecipient();
    error CredentialDoesNotExist();
    error IssuerNotActive();
    error CredentialAlreadyRevoked();

    // 이벤트 정의
    event IssuerStatusUpdated(address indexed issuer, IssuerStatus status);
    event CredentialIssued(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed issuer,
        string credentialType,
        uint64 expiresAt
    );
    event CredentialRevoked(
        uint256 indexed tokenId,
        address indexed revoker,
        string reason
    );

    constructor(address defaultAdmin, address initialIssuer)
        ERC721("WorkerCredentialSBT", "WCSBT")
    {
        if (defaultAdmin == address(0) || initialIssuer == address(0)) {
            revert InvalidRecipient();
        }

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(ISSUER_ROLE, initialIssuer);

        issuerStatus[initialIssuer] = IssuerStatus.Active;
        emit IssuerStatusUpdated(initialIssuer, IssuerStatus.Active);

        _nextTokenId = 1;
    }

    /**
     * @notice 총괄 관리자(DEFAULT_ADMIN_ROLE)가 발급기관의 상태를 갱신합니다.
     * @param issuer 대상 기관 지갑 주소
     * @param status Active / Decommissioned / Blacklisted
     */
    function setIssuerStatus(address issuer, IssuerStatus status)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (issuer == address(0)) revert InvalidRecipient();

        issuerStatus[issuer] = status;

        if (status == IssuerStatus.Active) {
            _grantRole(ISSUER_ROLE, issuer);
        } else {
            _revokeRole(ISSUER_ROLE, issuer);
        }

        emit IssuerStatusUpdated(issuer, status);
    }

    /**
     * @notice 인가된 발급기관이 노동자 지갑으로 자격 증명 SBT를 발급합니다.
     * 기관 상태가 Active일 때만 신규 발급이 가능합니다.
     */
    function issueCredential(
        address to,
        string calldata credentialType,
        uint64 expiresAt,
        string calldata metadataURI
    ) external onlyRole(ISSUER_ROLE) nonReentrant returns (uint256) {
        if (to == address(0)) revert InvalidRecipient();
        if (issuerStatus[msg.sender] != IssuerStatus.Active) {
            revert IssuerNotActive();
        }

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _credentials[tokenId] = Credential({
            credentialType: credentialType,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            metadataURI: metadataURI,
            isRevoked: false,
            revokedAt: 0,
            revokeReason: "",
            revokedBy: address(0)
        });

        _safeMint(to, tokenId);

        emit CredentialIssued(tokenId, to, msg.sender, credentialType, expiresAt);
        return tokenId;
    }

    /**
     * @notice 발급기관 또는 관리자가 자격을 박탈합니다.
     * [소프트 폐기 방식 적용]: 토큰을 burn하지 않고 isRevoked 플래그 및 사유를 영구 보존하여 행정 감사 지원.
     */
    function revokeCredential(uint256 tokenId, string calldata reason)
        external
        nonReentrant
    {
        _requireOwned(tokenId);
        Credential storage cred = _credentials[tokenId];

        // 권한 확인: 발급 주체 또는 관리자만 가능
        if (msg.sender != cred.issuer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert AccessControlUnauthorizedAccount(msg.sender, ISSUER_ROLE);
        }
        if (cred.isRevoked) {
            revert CredentialAlreadyRevoked();
        }

        cred.isRevoked = true;
        cred.revokedAt = uint64(block.timestamp);
        cred.revokeReason = reason;
        cred.revokedBy = msg.sender;

        emit CredentialRevoked(tokenId, msg.sender, reason);
    }

    /**
     * @notice 자격 증명의 현 시점 온체인 유효성 종합 판정
     * 1. 소프트 폐기 여부 (!isRevoked)
     * 2. 유효기간 도과 여부 (expiresAt > 0 && block.timestamp >= expiresAt 이면 false)
     * 3. 발급기관 상태 판정:
     *    - Blacklisted 이면 즉시 false (소급 강제 무효)
     *    - Active 또는 Decommissioned(단순 협약 만료) 이면 유효 인정
     */
    function isCredentialValid(uint256 tokenId) external view returns (bool) {
        address owner = _ownerOf(tokenId);
        if (owner == address(0)) return false;

        Credential memory cred = _credentials[tokenId];

        // 1. 박탈 이력 확인
        if (cred.isRevoked) return false;

        // 2. 만료일 확인
        if (cred.expiresAt > 0 && block.timestamp >= cred.expiresAt) return false;

        // 3. 발급기관 상태 검증
        IssuerStatus status = issuerStatus[cred.issuer];
        if (status == IssuerStatus.Blacklisted || status == IssuerStatus.None) {
            return false;
        }

        // Active 이거나 정상 협약 만료(Decommissioned)인 경우 기발급분 유효 인정
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
