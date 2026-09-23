# 외국인 노동자 자격 증명 및 온체인 신원 검증 시스템 종합 명세서
(Soulbound Token & Challenge-Response Architecture Specification)

---

## 1. 프로젝트 개요 및 비즈니스 배경

본 시스템은 해외 인력 송출 및 국내 취업 과정에서 발생하는 **자격증 위변조, 비자 대여, 발급기관 부정 행위**를 방지하기 위해 구축된 **Web3 기반 신원 및 자격 증명 플랫폼**입니다.

### 1.1 기존 시스템의 문제점과 해결책
| 기존 방식의 한계 | SBT 시스템 해결책 | 엔지니어링 구현 |
| :--- | :--- | :--- |
| **자격증 위변조 및 대여** (종이/PDF, 일반 NFT) | **양도 불가능한 Soulbound Token(SBT)** 적용 | OpenZeppelin v5 `_update()` 오버라이드로 P2P 전송 원천 차단 (`SoulboundTransferBlocked`) |
| **인가 기관 관리 단일 실패점** (단일 Admin 키) | **역할 기반 권한 분리(RBAC)** 적용 | `DEFAULT_ADMIN_ROLE`(정부/총괄)과 `ISSUER_ROLE`(공인 협약 기관) 분리 |
| **자격 박탈 시 감사 단절** (토큰 완전 소각 시) | **소프트 폐기(Soft Revocation)** 적용 | 소각하지 않고 `isRevoked`, `revokeReason`, `revokedAt`을 온체인 영구 보존 |
| **기관 탈취/협약 종료 소급 문제** | **기관 3단계 라이프사이클** 분리 | `Active`, `Decommissioned`(기발급 인정), `Blacklisted`(즉시 소급 무효) |
| **타인 지갑 주소 구두 도용** | **SIWE 챌린지-응답 암호 서명 검증** | 1회용 Nonce 기반 개인키 전자서명 및 Viem `verifyMessage` 검증 |

---

## 2. 전체 시스템 아키텍처 다이어그램

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Browser (Client)                           │
│                                                                        │
│   ┌────────────────────────┐              ┌────────────────────────┐   │
│   │   MetaMask Wallet      │              │  Next.js 16 App Router │   │
│   │   - Private Key Signer │              │  - 1. 발급기관 포털    │   │
│   │   - Account #0 (Issuer)│              │  - 2. 노동자 자격 지갑│   │
│   │   - Account #1 (Worker)│              │  - 3. 검증자 포털     │   │
│   └──────────┬─────────────┘              └───────────┬────────────┘   │
└──────────────┼────────────────────────────────────────┼────────────────┘
               │                                        │
               │ (EIP-1193 암호화 서명)                 │ (내부 API 호출)
               ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Next.js App Router Backend API                        │
│                  - POST /api/challenge (일회용 Nonce 발행, TTL 5분)    │
│                  - POST /api/verify    (Viem ECDSA 서명 & 온체인 판정) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   │ (JSON-RPC 통신)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│               EVM Local Blockchain (Hardhat Node Engine)               │
│               Endpoint: http://127.0.0.1:8545 (Chain ID: 31337)        │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  WorkerCredentialSBT.sol (0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9)│
│   │                                                                │   │
│   │  - AccessControl: DEFAULT_ADMIN_ROLE, ISSUER_ROLE              │   │
│   │  - Non-transferable: _update() override (SBT 전송 원천 차단)   │   │
│   │  - Soft Revocation: isRevoked, revokeReason, revokedAt         │   │
│   │  - 3-Stage Issuer Status: Active, Decommissioned, Blacklisted  │   │
│   │  - Methods: issueCredential, revokeCredential, isCredentialValid│  │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 디렉터리 및 컴포넌트 구조

```
새 폴더/
├── contracts/                               # 스마트 컨트랙트 개발 환경 (Hardhat)
│   ├── contracts/
│   │   └── WorkerCredentialSBT.sol          # 핵심 SBT 스마트 컨트랙트 소스 코드
│   ├── scripts/
│   │   └── deploy.ts                        # 배포 및 프론트엔드 ABI/주소 동기화 스크립트
│   ├── test/
│   │   └── WorkerCredentialSBT.test.ts      # 아키텍처 단위 테스트 (5개 시나리오 100% 통과)
│   └── hardhat.config.ts                    # 컴파일러(0.8.24 Cancun), 네트워크 설정
│
├── frontend/                                # 프론트엔드 및 검증 백엔드 (Next.js 16)
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── challenge/route.ts       # 일회용 Nonce 발급 API
│   │   │   │   └── verify/route.ts          # 서명 검증 및 온체인 상태 판정 API
│   │   │   └── page.tsx                     # 역할별 탭(발급/노동자/검증자) 메인 대시보드
│   │   ├── components/
│   │   │   ├── IssuerPortal.tsx             # 발급기관 전용 발급/소프트폐기/기관상태 제어 UI
│   │   │   ├── WorkerCredentialCard.tsx     # 자격증 조회, 이력 뷰, 실시간 QR 코드 생성 UI
│   │   │   └── VerifierPortal.tsx           # QR/서명 페이로드 검증 및 온체인 감사 조회 UI
│   │   ├── lib/
│   │   │   └── nonceStore.ts                # Nonce 생성 및 TTL(5분) 관리 모듈
│   │   └── contracts/
│   │       └── WorkerCredentialSBT.json     # 배포된 컨트랙트 주소 및 ABI 인터페이스
│   └── package.json                         # Next.js, Wagmi, Viem, qrcode.react 등 의존성
│
└── DAPP_REPORT.md                           # 루트 디렉터리 종합 요약 보고서
```

---

## 4. 스마트 컨트랙트 상세 명세 (`WorkerCredentialSBT.sol`)

- **배포 주소**: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`
- **표준 규격**: OpenZeppelin Contracts v5.6.1 기반 ERC-721 + AccessControl + ReentrancyGuard

### 4.1 온체인 구조체 및 상태 정의
```solidity
struct Credential {
    string credentialType; // 자격/비자 분류 (예: E-9-제조업, 용접기능사)
    address issuer;        // 발급기관 지갑 주소
    uint64 issuedAt;       // 발급 블록 타임스탬프
    uint64 expiresAt;      // 만료 블록 타임스탬프 (0 = 무기한)
    string metadataURI;    // IPFS 또는 공인 인증서 원본 해시
    bool isRevoked;        // 소프트 폐기 여부 (토큰 소각 방지 및 이력 보존)
    uint64 revokedAt;      // 박탈 처리 일시
    string revokeReason;   // 온체인 박탈 사유
    address revokedBy;     // 박탈 처리자 주소
}

enum IssuerStatus {
    None,           // 비인가 지갑
    Active,         // 정상 운영: 신규 발급 가능, 기발급 유효
    Decommissioned, // 정상 협약 만료: 신규 발급 차단, 기발급분은 만료일까지 보장
    Blacklisted     // 부정 적발 퇴출: 신규 발급 차단, 기발급분 전면 즉시 소급 무효
}
```

### 4.2 핵심 함수 명세
| 함수 시그니처 | 유형 | 권한 | 설명 |
| :--- | :--- | :--- | :--- |
| `issueCredential(to, type, expiresAt, uri)` | Write | `ISSUER_ROLE` (Active) | 노동자 지갑으로 양도 불가 SBT 자격증 발행 |
| `revokeCredential(tokenId, reason)` | Write | Issuer 또는 Admin | 토큰을 소각하지 않고 `isRevoked` 및 사유를 영구 보존 |
| `setIssuerStatus(issuer, status)` | Write | `DEFAULT_ADMIN_ROLE` | 발급기관의 상태(Active/Decommissioned/Blacklisted) 갱신 |
| `isCredentialValid(tokenId)` | Read | 누구나 | 소프트 폐기 여부, 만료일, 기관 블랙리스트 여부 종합 판정 (`bool`) |
| `getCredential(tokenId)` | Read | 누구나 | 자격증 상세 정보 및 박탈 감사 이력 반환 |
| `getCredentialsByOwner(owner)` | Read | 누구나 | 특정 지갑이 보유한 모든 자격증 토큰 ID 배열 반환 |

---

## 5. 챌린지-응답 서명 검증 파이프라인

1. **챌린지 발급 (`POST /api/challenge`)**:
   - 지갑 주소를 수신하여 암호학적 16바이트 1회용 `nonce` 생성 및 TTL 5분 등록.
   - EIP-4361 표준 챌린지 문구 생성 후 클라이언트에 반환.
2. **오프체인 전자서명**:
   - 노동자가 MetaMask 지갑에서 개인키로 메시지에 ECDSA 서명 생성 (가스비 0원).
   - 화면에 서명 데이터가 포함된 **실시간 QR 코드** 자동 렌더링.
3. **검증 및 온체인 대조 (`POST /api/verify`)**:
   - 1회용 Nonce 즉시 소모(Replay Attack 방어).
   - Viem `verifyMessage`로 서명자와 주소의 일치성 검증.
   - 블록체인 노드로 질의:
     - `ownerOf(tokenId) == signerAddress`
     - `isCredentialValid(tokenId) == true`
     - 자격 박탈 이력(`isRevoked`) 및 사유 조회.
   - 최종 결과 반환: `isValid: true/false`, `status: VALID/REVOKED/EXPIRED`.

---

## 6. 단위 테스트 및 엔드투엔드 검증 결과 증적

### 6.1 Hardhat 단위 테스트 (5개 아키텍처 시나리오 100% 통과)
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

### 6.2 실제 E2E 서명 검증 응답 증적
```json
{
  "isValid": true,
  "signatureVerified": true,
  "signerAddress": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "contractAddress": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
  "credentials": [
    {
      "tokenId": 1,
      "credentialType": "E-9-비전문취업 (제조업)",
      "issuer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "issuedAt": 1789536236,
      "expiresAt": 1821072236,
      "isExpired": false,
      "isRevoked": false,
      "isValidOnChain": true
    }
  ],
  "verifiedAt": "2026-09-16T05:43:56.809Z"
}
```

---

## 7. 구동 서비스 및 로컬 환경 정보

- **EVM 로컬 블록체인 노드**: `http://127.0.0.1:8545` (Chain ID: `31337`)
- **Next.js 풀스택 웹 서버**: `http://localhost:3000` (HTTP 200 OK)
- **SBT 스마트 컨트랙트**: `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9`
- **배포자 및 초기 발급기관 계정**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Account #0)
- **노동자 수신 테스트 계정**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Account #1)
