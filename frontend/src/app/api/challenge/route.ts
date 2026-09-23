import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { generateChallengeNonce, checkDualRateLimit } from '@/lib/nonceStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address } = body;

    if (!address || !isAddress(address)) {
      return NextResponse.json(
        { error: '올바른 이더리움 지갑 주소(0x...)를 제공해야 합니다.' },
        { status: 400 }
      );
    }

    // 1. 클라이언트 IP 추출 (프록시/Vercel/로컬 환경 대응)
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '127.0.0.1');

    // 2. IP 및 지갑 주소 독립 이중 버킷 (OR 조건) Rate Limit 검사
    const rateLimit = checkDualRateLimit(clientIp, address);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: `요청 한도를 초과했습니다 (1분당 최대 5회). 차단 사유: ${rateLimit.blockedBy === 'ip' ? '동일 IP 과다 요청' : '동일 지갑 과다 요청'}.`,
          blockedBy: rateLimit.blockedBy,
          retryAfter: rateLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter),
            'X-RateLimit-Limit': '5',
          },
        }
      );
    }

    // 3. 60초 TTL 챌린지 Nonce 발급 (EIP-4361 포맷)
    const challenge = generateChallengeNonce(address);

    return NextResponse.json({
      success: true,
      address,
      nonce: challenge.nonce,
      message: challenge.message,
      issuedAt: challenge.issuedAt,
      expiresAt: challenge.expiresAt,
      expiresIn: challenge.expiresIn,
    });
  } catch (error: any) {
    console.error('Challenge generation error:', error);
    if (error?.message === 'SERVER_BUSY_MAX_CAPACITY') {
      return NextResponse.json(
        { error: '서버 인증 세션이 혼잡합니다. 잠시 후 다시 시도해 주세요.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: '챌린지 생성 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
