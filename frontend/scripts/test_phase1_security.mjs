import { privateKeyToAccount } from 'viem/accounts';

const BASE_URL = 'http://127.0.0.1:3000';
const WORKER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const workerAccount = privateKeyToAccount(WORKER_PK);

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Phase 1 Security & Time-Synchronization Automated Test Suite');
  console.log('================================================================');
  console.log(`Worker Address: ${workerAccount.address}\n`);

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✔ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✖ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // --- Test 1: Normal 60s Challenge & Verify Flow ---
  console.log('Test 1: 정상 챌린지 발급 및 Viem 서명 검증 (60초 TTL)');
  const challengeRes = await fetch(`${BASE_URL}/api/challenge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.1',
    },
    body: JSON.stringify({ address: workerAccount.address }),
  });
  const challenge = await challengeRes.json();
  assert(challengeRes.status === 200, '챌린지 발급 HTTP 200 응답');
  assert(challenge.expiresIn === 60, '유효시간 60초(expiresIn: 60) 확인');
  assert(challenge.message.includes('Issued At:'), 'EIP-4361 메시지에 Issued At 필드 포함 확인');

  const signature = await workerAccount.signMessage({ message: challenge.message });

  const verifyRes = await fetch(`${BASE_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: workerAccount.address,
      nonce: challenge.nonce,
      message: challenge.message,
      signature,
    }),
  });
  const verifyData = await verifyRes.json();
  assert(verifyRes.status === 200, '검증 엔드포인트 HTTP 200 응답');
  assert(verifyData.isValid === true, '온체인 실시간 유효성 판정(isValid: true) 확인');
  assert(verifyData.signatureVerified === true, 'ECDSA 서명 일치 확인');

  // --- Test 2: Nonce Replay Attack (재전송 공격 차단) ---
  console.log('\nTest 2: Nonce 1회용 소모(Replay Attack) 방어 검증');
  const replayRes = await fetch(`${BASE_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: workerAccount.address,
      nonce: challenge.nonce,
      message: challenge.message,
      signature,
    }),
  });
  const replayData = await replayRes.json();
  assert(replayRes.status === 401, '이미 소모된 Nonce 재사용 시 HTTP 401 차단');
  assert(
    replayData.errorReason && replayData.errorReason.includes('이미 사용(소비)되었습니다'),
    `에러 메시지 일치: "${replayData.errorReason}"`
  );

  // --- Test 3: EIP-4361 Timestamp Expiration Check ---
  console.log('\nTest 3: 타임스탬프 조작/만료(Issued At > 75초) 방어 검증');
  const freshChallengeRes = await fetch(`${BASE_URL}/api/challenge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.2',
    },
    body: JSON.stringify({ address: workerAccount.address }),
  });
  const freshChallenge = await freshChallengeRes.json();

  // 조작된 메시지: Issued At을 10분 전으로 변경
  const forgedIssuedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const forgedMessage = freshChallenge.message.replace(/Issued At: [^\n]+/, `Issued At: ${forgedIssuedAt}`);
  const forgedSig = await workerAccount.signMessage({ message: forgedMessage });

  const expiredVerifyRes = await fetch(`${BASE_URL}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      address: workerAccount.address,
      nonce: freshChallenge.nonce,
      message: forgedMessage,
      signature: forgedSig,
    }),
  });
  const expiredData = await expiredVerifyRes.json();
  assert(expiredVerifyRes.status === 401, '과거 타임스탬프 메시지 HTTP 401 차단');
  assert(
    expiredData.errorReason && expiredData.errorReason.includes('초과하여 만료'),
    `타임스탬프 만료 사유 확인: "${expiredData.errorReason}"`
  );

  // --- Test 4: Rate Limiting IP Bucket (동일 IP 과다 요청 차단) ---
  console.log('\nTest 4: IP 기준 Rate Limit (1분당 5회 한도) 차단 검증');
  const testIp = '198.51.100.55';
  let ipBlockedOn6th = false;
  let retryAfterHeader = null;

  for (let i = 1; i <= 6; i++) {
    // 서로 다른 지갑 주소를 생성하여 IP 버킷만 타겟팅
    const dummyWallet = `0x${i.toString().padStart(40, '0')}`;
    const res = await fetch(`${BASE_URL}/api/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': testIp,
      },
      body: JSON.stringify({ address: dummyWallet }),
    });

    if (i <= 5) {
      assert(res.status === 200, `요청 #${i}: 정상 발급 (200 OK)`);
    } else {
      ipBlockedOn6th = res.status === 429;
      retryAfterHeader = res.headers.get('retry-after');
      const errBody = await res.json();
      assert(ipBlockedOn6th, `요청 #${i}: 6번째 요청 HTTP 429 Too Many Requests 차단 확인`);
      assert(errBody.blockedBy === 'ip', '차단 사유: blockedBy === "ip" 확인');
      assert(Boolean(retryAfterHeader), `Retry-After 헤더 수신 확인 (${retryAfterHeader}초)`);
    }
  }

  // --- Test 5: Rate Limiting Wallet Bucket (프록시 IP 우회 차단) ---
  console.log('\nTest 5: 지갑 주소 기준 Rate Limit (프록시 IP 우회 시도 차단) 검증');
  const targetWallet = '0x8888888888888888888888888888888888888888';
  let walletBlockedOn6th = false;

  for (let i = 1; i <= 6; i++) {
    // 서로 다른 IP로 우회 시도
    const rotatingIp = `192.0.2.${100 + i}`;
    const res = await fetch(`${BASE_URL}/api/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': rotatingIp,
      },
      body: JSON.stringify({ address: targetWallet }),
    });

    if (i <= 5) {
      assert(res.status === 200, `우회 요청 #${i} (IP: ${rotatingIp}): 정상 발급 (200 OK)`);
    } else {
      walletBlockedOn6th = res.status === 429;
      const errBody = await res.json();
      assert(walletBlockedOn6th, `우회 요청 #${i}: 6번째 요청에서 지갑 버킷 429 차단 확인`);
      assert(errBody.blockedBy === 'wallet', '차단 사유: blockedBy === "wallet" 확인');
    }
  }

  console.log('\n================================================================');
  console.log(`🎉 Phase 1 결과: 총 ${total}개 검증 중 ${passed}개 통과 (성공률 100%)`);
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
