import crypto from 'crypto';

export interface NonceRecord {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface RateLimitRecord {
  timestamps: number[];
}

// In-memory nonce store and rate limit tracking (singleton in Node.js runtime)
const nonceMap = new Map<string, NonceRecord>();
const rateLimitMap = new Map<string, RateLimitRecord>();

export const TTL_MS = 60 * 1000; // 60초 (Phase 1 강화 규격)
export const CLOCK_DRIFT_GRACE_MS = 15 * 1000; // 네트워크 전송 및 시간 오차 유예 15초 (총 75초)
export const MAX_NONCE_ENTRIES = 10000; // 최대 인메모리 엔트리 한도
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분 윈도우
export const RATE_LIMIT_MAX_REQUESTS = 5; // 윈도우당 최대 5회

/**
 * 만료된 Nonce를 메모리에서 우선 일괄 정리 (Expired-First Sweep)
 */
export function sweepExpiredNonces(): number {
  const now = Date.now();
  let sweptCount = 0;
  for (const [address, record] of nonceMap.entries()) {
    if (now > record.expiresAt) {
      nonceMap.delete(address);
      sweptCount++;
    }
  }
  return sweptCount;
}

/**
 * 단일 키(IP 또는 지갑 주소)에 대한 Sliding Window Rate Limit 검사
 */
export function checkRateLimit(
  key: string,
  limit = RATE_LIMIT_MAX_REQUESTS,
  windowMs = RATE_LIMIT_WINDOW_MS
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(key, record);
  }

  // 윈도우 내 타임스탬프만 유지
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= limit) {
    const oldest = record.timestamps[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  record.timestamps.push(now);
  return { allowed: true, retryAfter: 0 };
}

/**
 * IP와 지갑 주소에 대한 독립 이중 버킷(OR 조건) Rate Limit 검사
 * 둘 중 하나라도 5회 초과 시 즉시 차단
 */
export function checkDualRateLimit(
  ip: string,
  address: string
): { allowed: boolean; retryAfter: number; blockedBy: 'ip' | 'wallet' | null } {
  // 1. IP 버킷 검사 (봇의 지갑 대량 생성 차단)
  const ipResult = checkRateLimit(`ip:${ip}`);
  if (!ipResult.allowed) {
    return { allowed: false, retryAfter: ipResult.retryAfter, blockedBy: 'ip' };
  }

  // 2. 지갑 버킷 검사 (프록시/VPN IP 우회 차단)
  const walletResult = checkRateLimit(`wallet:${address.toLowerCase()}`);
  if (!walletResult.allowed) {
    return { allowed: false, retryAfter: walletResult.retryAfter, blockedBy: 'wallet' };
  }

  return { allowed: true, retryAfter: 0, blockedBy: null };
}

/**
 * 60초 유효기간의 1회용 챌린지 Nonce 생성 (EIP-4361 표준 규격)
 */
export function generateChallengeNonce(address: string): {
  nonce: string;
  message: string;
  issuedAt: string;
  expiresAt: number;
  expiresIn: number;
} {
  const normalizedAddress = address.toLowerCase();

  // Bounded Map 검사 및 만료 우선 청소
  if (nonceMap.size >= MAX_NONCE_ENTRIES) {
    sweepExpiredNonces();
    if (nonceMap.size >= MAX_NONCE_ENTRIES) {
      throw new Error('SERVER_BUSY_MAX_CAPACITY');
    }
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const expiresAt = now + TTL_MS;
  const issuedAtISO = new Date(now).toISOString();
  const expiresAtISO = new Date(expiresAt).toISOString();

  // 최신 Nonce로 갱신 (이전 미사용 Nonce는 자동 무효화)
  nonceMap.set(normalizedAddress, { nonce, issuedAt: now, expiresAt });

  // EIP-4361 (Sign-In with Ethereum) 표준 메시지 포맷
  const message = [
    `Worker Credential Verification System wants you to sign in with your Ethereum account:`,
    `${address}`,
    ``,
    `본인 확인 및 온체인 자격 증명(SBT) 소유권 검증을 위해 본 챌린지에 서명합니다.`,
    ``,
    `URI: http://localhost:3000`,
    `Version: 1`,
    `Chain ID: 31337`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAtISO}`,
    `Expiration Time: ${expiresAtISO}`,
  ].join('\n');

  return {
    nonce,
    message,
    issuedAt: issuedAtISO,
    expiresAt,
    expiresIn: 60,
  };
}

/**
 * Nonce 검증 및 1회용 즉시 소모 (Atomic Consume)
 * 재전송 공격(Replay Attack) 방어 및 60초 시간 검증
 */
export function verifyAndConsumeNonce(
  address: string,
  nonce: string,
  claimedIssuedAt?: string
): { valid: boolean; reason?: string } {
  const normalizedAddress = address.toLowerCase();
  const record = nonceMap.get(normalizedAddress);

  if (!record) {
    return {
      valid: false,
      reason: '일회용 챌린지 Nonce가 존재하지 않거나 이미 사용(소비)되었습니다.',
    };
  }

  // 단 1회 검증 시도 즉시 메모리에서 삭제 (원자적 소모)
  nonceMap.delete(normalizedAddress);

  const now = Date.now();

  // 1. 서버 Nonce TTL(60초) 만료 검사
  if (now > record.expiresAt) {
    return {
      valid: false,
      reason: '챌린지 유효시간(60초)이 초과되어 만료되었습니다.',
    };
  }

  // 2. Nonce 일치 검사
  if (record.nonce !== nonce) {
    return {
      valid: false,
      reason: '제출된 Nonce 값이 서버에 등록된 챌린지 값과 일치하지 않습니다.',
    };
  }

  // 3. EIP-4361 issuedAt 타임스탬프 교차 검증 (네트워크 지연 유예 15초 포함 최대 75초)
  if (claimedIssuedAt) {
    const claimedTime = new Date(claimedIssuedAt).getTime();
    if (isNaN(claimedTime)) {
      return {
        valid: false,
        reason: '서명 메시지의 발행 시각(Issued At) 형식이 올바르지 않습니다.',
      };
    }

    if (Math.abs(now - claimedTime) > TTL_MS + CLOCK_DRIFT_GRACE_MS) {
      return {
        valid: false,
        reason: '서명 메시지 타임스탬프가 허용 오차 범위(75초)를 초과하여 만료되었습니다.',
      };
    }
  }

  return { valid: true };
}

// 테스트/디버깅용 상태 조회
export function getStoreStats() {
  return {
    activeNonces: nonceMap.size,
    rateLimitKeys: rateLimitMap.size,
  };
}

export function clearStoreForTesting() {
  nonceMap.clear();
  rateLimitMap.clear();
}
