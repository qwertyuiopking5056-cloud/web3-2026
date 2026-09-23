# 외국인 노동자 자격 증명 SBT 시스템 아키텍처 및 구현 종합 보고서 (최신 업데이트)

---

## 1. 아키텍처 의사결정 및 반영 내역

| 의사결정 항목 | 기존 방식 | 개선 반영 사항 | 엔지니어링 효과 |
| :--- | :--- | :--- | :--- |
| **자격 박탈 방식** | `_burn(tokenId)` 완전 소각 | **소프트 폐기 플래그 (`isRevoked`)** | 토큰 소각으로 인한 행정 감사 단절을 방지하고, 온체인에 박탈 사유(`revokeReason`), 일시, 처리자 주소를 영구 보존 |
| **발급기관 취소 소급 범위** | 단순 `ISSUER_ROLE` 회수 시 기발급분 일괄 무효 | **3단계 라이프사이클 (`Active` / `Decommissioned` / `Blacklisted`)** | 단순 협약 만료(Decommissioned) 시 선량한 기존 노동자 자격을 보호하고, 부정 적발(Blacklisted) 시에만 즉시 소급 무효화 |
| **검증자 UX 인터페이스** | 단순 JSON 복사/붙여넣기 | **실시간 QR 코드 생성 (`qrcode.react`) + JSON 듀얼 지원** | 현장 출입국/고용주 검증 시 모바일 스캐너 즉시 인식 지원 및 테스트 편의성 확보 |

---

## 2. 스마트 컨트랙트 명세 (`WorkerCredentialSBT.sol`)

- **배포 주소**: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`
- **표준 규격**: ERC-721 기반 Soulbound Token + OpenZeppelin v5 AccessControl

### 2.1 온체인 데이터 구조체 (`Credential`)
```solidity
struct Credential {
    string credentialType; // 자격/비자 종류 (예: E-9-제조업)
    address issuer;        // 발급기관 지갑 주소
    uint64 issuedAt;       // 발급 일시
    uint64 expiresAt;      // 만료 일시 (0 = 무기한)
    string metadataURI;    // 원본 서류 IPFS 해시
    bool isRevoked;        // 소프트 폐기 여부 (감사 이력 보존)
    uint64 revokedAt;      // 박탈 일시
    string revokeReason;   // 온체인 박탈 사유
    address revokedBy;     // 박탈 처리자
}
```

### 2.2 기관 상태 관리 (`IssuerStatus`)
```solidity
enum IssuerStatus {
    None,           // 비인가 지갑
    Active,         // 정상 운영: 신규 발급 가능, 기발급 유효
    Decommissioned, // 협약 만료: 신규 발급 불가, 기발급 유효기간까지 보장
    Blacklisted     // 부정 적발: 신규 발급 불가, 기발급 전면 즉시 소급 무효
}
```

### 2.3 온체인 유효성 판정 (`isCredentialValid`)
```solidity
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

    return true;
}
```

---

## 3. 단위 테스트 및 검증 결과

```text
WorkerCredentialSBT Architecture Tests
  소프트 폐기 (Soft Revocation & Audit Trail) 검증
    ✔ 자격 박탈 시 토큰이 소각되지 않고 isRevoked 플래그와 사유가 온체인에 영구 기록되어야 한다
    ✔ 이미 박탈된 자격증을 재박탈 시도하면 CredentialAlreadyRevoked로 Revert 되어야 한다
  발급기관 상태(IssuerStatus)에 따른 소급 판정 검증
    ✔ 기관이 단순 협약 만료(Decommissioned)된 경우: 기발급분은 여전히 유효해야 하고, 신규 발급은 차단되어야 한다
    ✔ 기관이 부정 적발로 퇴출(Blacklisted)된 경우: 기발급분이 즉시 소급 무효화되어야 한다
  양도 불가 (Soulbound) 제어 검증
    ✔ transferFrom 및 safeTransferFrom 시도 시 SoulboundTransferBlocked로 차단되어야 한다

5 passing (780ms)
```

---

## 4. 구동 중인 서비스 정보

- **EVM 로컬 블록체인 노드**: `http://127.0.0.1:8545` (Chain ID: `31337`)
- **Next.js 풀스택 웹 서버**: `http://localhost:3000` (HTTP 200 OK)
- **자격증 SBT 컨트랙트**: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`
- **배포자 및 초기 발급기관 계정**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Account #0)
