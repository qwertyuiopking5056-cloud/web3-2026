# 외국인 노동자 SBT 자격 증명 및 온체인 신원 검증 시스템 v2.0 종합 보고서
(Soulbound Token Architecture v2.0 & Phase 1 Security Hardening Report)

---

## 1. 프로젝트 개요 및 9대 결함 해결 아키텍처 로드맵

본 시스템은 해외 인력 송출 및 국내 취업 과정에서 발생하는 자격증 위·변조, 타인 대여(부정 취업), 발급기관 부정 행위를 방지하기 위해 구축된 **Web3 기반 양도 불가 자격 증명(SBT) 및 챌린지-응답 암호 검증 플랫폼**입니다.

초기 프로토타입(v1) 분석을 통해 도출된 **9대 핵심 결함**을 4단계(Phase)로 완전 해결하도록 설계를 고도화했습니다.

| 단계 | 핵심 과제 | 해결된 결함 항목 | 주요 적용 기술 | 상태 |
| :---: | :--- | :--- | :--- | :---: |
| **Phase 1** | **백엔드 방어 & 시간 정합성** | [결함 4] Nonce TTL 60초 동기화<br>[결함 7] DoS Rate Limiting | EIP-4361 Issued At 바인딩, 독립 이중 버킷 Rate Limiter, 온디맨드 OTP QR UI | **완료 (100% 통과)** |
| **Phase 2** | **데이터 표준화 & 테스트** | [결함 9] credentialType 표준화<br>[결함 8] 네거티브 테스트 스위트 | `bytes32` 자격 분류 레지스트리, Hardhat 네거티브 테스트 7종 | **설계 완료 (착수 대기)** |
| **Phase 3** | **거버넌스 2계층 & 분실 복구** | [결함 1] Admin 단일키 탈취 리스크<br>[결함 3] revokeCredential 오남용<br>[결함 2] 노동자 지갑 분실 영구 고립 | 2-Tier RBAC (Safe Multi-sig 거버넌스 vs OPERATOR_ROLE 일상 심의), 대면 인증 기반 재발급 & 온체인 계보(Lineage) 체인 | **설계 완료 (착수 대기)** |
| **Phase 4** | **프라이버시 & 스토리지 이중화** | [결함 5] 온체인 공개 데이터 프라이버시 침해<br>[결함 6] IPFS 단일 핀닝 유실 위험 | 온체인 해시 커밋먼트, 서명 기반 결정론적 X25519 키 유도(HKDF), AES-256-GCM 증빙 E2EE 암호화, 멀티 핀닝 | **설계 완료 (착수 대기)** |

---

## 2. Phase 1 구현 완료 내역 (시간 정합성 & DoS 방어)

### 2.1 60초 Nonce 생명주기 및 원자적 즉시 소모 (`frontend/src/lib/nonceStore.ts`)
- **TTL 60초 동기화**: Nonce 유효기간을 5분에서 **`60초`**로 단축하여 실시간 QR 카운트다운과 1:1 동기화.
- **원자적 즉시 소모 (Atomic Consume)**: `/api/verify` 호출 시 단 1회 검증 시도 즉시 메모리에서 삭제하여 **재전송 공격(Replay Attack)** 원천 차단.
- **만료 우선 청소 (Expired-First Sweep)**: 인메모리 맵 크기(10,000개) 도달 시 만료된 항목을 먼저 일괄 청소하여 분산 봇넷 공격 시에도 정상 사용자의 유효 Nonce가 밀려나는 **캐시 축출 DoS(Eviction DoS)** 방어.

### 2.2 EIP-4361 타임스탬프 바인딩 (`/api/challenge` & `/api/verify`)
- 챌린지 생성 시 EIP-4361 메시지 본문에 `Issued At: <ISO_8601>` 및 `Expiration Time` 필드 강제 포함.
- 검증 시 서버 현재 시간과 대조하여 `|서버시간 - IssuedAt| <= 75초` (지연 유예 15초 포함) 교차 검증 강제.

### 2.3 IP 및 지갑 독립 이중 버킷 (OR 조건) Rate Limiting
- **IP 버킷**: 동일 IP에서 1분 5회 초과 시 차단 (가상 지갑 생성 공격 차단).
- **지갑 버킷**: 동일 지갑으로 1분 5회 초과 시 차단 (프록시/VPN IP 우회 공격 차단).
- **OR 조건 강제**: 둘 중 하나라도 초과 시 즉시 `HTTP 429 Too Many Requests` 및 `Retry-After: 60`, `blockedBy` 반환.

### 2.4 온디맨드 OTP형 60초 만료 QR UI (`frontend/src/components/WorkerCredentialCard.tsx`)
- 불필요하게 60초마다 지갑 팝업을 강제 호출하지 않고, 사용자가 `[검증 QR 발급]`을 눌렀을 때만 1회 서명하여 60초 유효 QR 생성.
- **60초 프로그레스 바**: 남은 시간에 따라 황색 ➔ 적색으로 시각적 카운트다운 제공.
- **만료 오버레이**: 60초 초과 시 QR 코드가 블러(Blur) 처리되며 `[시간 만료: QR 새로고침]` 오버레이로 전환되어 구버전 서명의 유출 및 재사용 차단.

---

## 3. Phase 1 자동화 보안 테스트 검증 증적 (`scripts/test_phase1_security.mjs`)

총 5개 보안 시나리오, 25개 단정문 100% 통과 증적:

```text
================================================================
🧪 Phase 1 Security & Time-Synchronization Automated Test Suite
================================================================
Worker Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

Test 1: 정상 챌린지 발급 및 Viem 서명 검증 (60초 TTL)
  ✔ [PASS] 챌린지 발급 HTTP 200 응답
  ✔ [PASS] 유효시간 60초(expiresIn: 60) 확인
  ✔ [PASS] EIP-4361 메시지에 Issued At 필드 포함 확인
  ✔ [PASS] 검증 엔드포인트 HTTP 200 응답
  ✔ [PASS] 온체인 실시간 유효성 판정(isValid: true) 확인
  ✔ [PASS] ECDSA 서명 일치 확인

Test 2: Nonce 1회용 소모(Replay Attack) 방어 검증
  ✔ [PASS] 이미 소모된 Nonce 재사용 시 HTTP 401 차단
  ✔ [PASS] 에러 메시지 일치: "일회용 챌린지 Nonce가 존재하지 않거나 이미 사용(소비)되었습니다."

Test 3: 타임스탬프 조작/만료(Issued At > 75초) 방어 검증
  ✔ [PASS] 과거 타임스탬프 메시지 HTTP 401 차단
  ✔ [PASS] 타임스탬프 만료 사유 확인: "서명 메시지 타임스탬프가 허용 오차 범위(75초)를 초과하여 만료되었습니다."

Test 4: IP 기준 Rate Limit (1분당 5회 한도) 차단 검증
  ✔ [PASS] 요청 #1: 정상 발급 (200 OK)
  ✔ [PASS] 요청 #2: 정상 발급 (200 OK)
  ✔ [PASS] 요청 #3: 정상 발급 (200 OK)
  ✔ [PASS] 요청 #4: 정상 발급 (200 OK)
  ✔ [PASS] 요청 #5: 정상 발급 (200 OK)
  ✔ [PASS] 요청 #6: 6번째 요청 HTTP 429 Too Many Requests 차단 확인
  ✔ [PASS] 차단 사유: blockedBy === "ip" 확인
  ✔ [PASS] Retry-After 헤더 수신 확인 (60초)

Test 5: 지갑 주소 기준 Rate Limit (프록시 IP 우회 시도 차단) 검증
  ✔ [PASS] 우회 요청 #1 (IP: 192.0.2.101): 정상 발급 (200 OK)
  ✔ [PASS] 우회 요청 #2 (IP: 192.0.2.102): 정상 발급 (200 OK)
  ✔ [PASS] 우회 요청 #3 (IP: 192.0.2.103): 정상 발급 (200 OK)
  ✔ [PASS] 우회 요청 #4 (IP: 192.0.2.104): 정상 발급 (200 OK)
  ✔ [PASS] 우회 요청 #5 (IP: 192.0.2.105): 정상 발급 (200 OK)
  ✔ [PASS] 우회 요청 #6: 6번째 요청에서 지갑 버킷 429 차단 확인
  ✔ [PASS] 차단 사유: blockedBy === "wallet" 확인

================================================================
🎉 Phase 1 결과: 총 25개 검증 중 25개 통과 (성공률 100%)
================================================================
```

---

## 4. Phase 2 ~ Phase 4 세부 확정 설계 요약

### 4.1 Phase 2: 데이터 표준화 및 네거티브 테스트 스위트
1. **자격 코드 표준화 (`bytes32` Registry)**:
   - `bytes32 public constant VISA_E9_MANUFACTURING = keccak256("KR.GOV.VISA.E9.MFG");`
   - 온체인 화이트리스트 `isCredentialSupported` 매핑 구축으로 비인가 코드 원천 차단.
2. **Hardhat 네거티브 테스트 7종 구축**:
   - N-1(비인가 발급 차단), N-2(만료 기관 차단), N-3(블랙리스트 차단), N-4(미등록 코드 차단), N-6(과거 만료일 차단), N-7(미존재 토큰 조회 안전 처리), N-8(Zero address 차단).
   - *(N-5는 Phase 3의 2단계 승인 워크플로우로 이관하여 중복 작업 방지)*

### 4.2 Phase 3: 거버넌스 2계층 & 분실 복구 체계
1. **2-Tier RBAC 구조**:
   - **1계층 (루트 거버넌스)**: `DEFAULT_ADMIN_ROLE` (Gnosis Safe 2-of-3 Multi-sig) ➔ 발급기관 인가/퇴출, 자격 코드 등록, OPERATOR_ROLE 임명.
   - **2계층 (일상 운영 심의)**: `OPERATOR_ROLE` (산업인력공단/출입국 심사관 실무 지갑, 단일 서명) ➔ 박탈 제안(`proposeRevocation`) 승인, 분실 재발급 제안(`proposeReissue`) 승인. (대규모 트래픽 병목 해소)
2. **지갑 분실 재발급(Reissue) & 계보(Lineage) 체인**:
   - 위장 분실 신고 방지를 위해 공인 기관 오프라인 대면 신원 확인(여권, ARC, 생체인증) 필수.
   - `reissueCredential(oldTokenId, newWorker)`: 이전 토큰 소프트 폐기 + 신규 토큰에 `previousTokenId` 온체인 앵커링.

### 4.3 Phase 4: 프라이버시 보호 & 분산 스토리지 이중화
1. **온체인 해시 커밋먼트**:
   - `credentialHash = keccak256(abi.encode(credentialCode, salt, workerAddress))`
   - 평문 및 솔트는 QR 코드를 통해 현장 검증관에게만 P2P 전달, 블록체인 상에서는 개인정보 0% 노출.
2. **서명 기반 결정론적 키 유도 (HKDF)**:
   - MetaMask의 `eth_decrypt` 폐지에 대응하여, 고정 메시지 서명 ➔ Web Crypto HKDF-SHA256을 통해 X25519 개인키/공개키를 무저장(Zero Storage) 방식으로 완벽 재현.
3. **AES-256-GCM 증빙 서류 E2EE 암호화 & 멀티 핀닝**:
   - 여권/비자 PDF를 클라이언트에서 암호화한 후 IPFS(Pinata) 및 Arweave에 동시 이중화 핀닝(SPOF 제거).
   - 온체인에 평문 원본의 `fileSha256Digest`를 앵커링하여 0% 변조 감지.

---

## 5. 현재 로컬 환경 상태

- **EVM 로컬 블록체인 노드**: `http://127.0.0.1:8545` (Chain ID: `31337`)
- **Next.js 풀스택 웹 서버**: `http://127.0.0.1:3000` (HTTP 200 OK)
- **배포 컨트랙트**: `WorkerCredentialSBT` at `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- **배포자/초기 발급기관**: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Account #0)
- **노동자 테스트 계정**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Account #1, SBT #1 보유)
