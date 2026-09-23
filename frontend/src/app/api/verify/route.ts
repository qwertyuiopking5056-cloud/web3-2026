import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, verifyMessage } from 'viem';
import { hardhat } from 'viem/chains';
import { verifyAndConsumeNonce } from '@/lib/nonceStore';
import sbtArtifact from '@/contracts/WorkerCredentialSBT.json';

const CONTRACT_ADDRESS = sbtArtifact.address as `0x${string}`;
const CONTRACT_ABI = sbtArtifact.abi;

const publicClient = createPublicClient({
  chain: hardhat,
  transport: http('http://127.0.0.1:8545'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, signature, message, nonce, tokenId } = body;

    if (!address || !isAddress(address) || !signature || !message || !nonce) {
      return NextResponse.json(
        { error: '필수 매개변수(address, signature, message, nonce)가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 1. EIP-4361 메시지에서 Issued At 추출 (타임스탬프 바인딩 검증용)
    const issuedAtMatch = message.match(/Issued At:\s*([^\n\r]+)/i);
    const claimedIssuedAt = issuedAtMatch ? issuedAtMatch[1].trim() : undefined;

    // 2. 1회용 Nonce 및 60초 TTL 시간 정합성 원자적 검증 및 소모
    const nonceValidation = verifyAndConsumeNonce(address, nonce, claimedIssuedAt);
    if (!nonceValidation.valid) {
      return NextResponse.json(
        {
          isValid: false,
          errorReason: nonceValidation.reason || '일회용 챌린지 Nonce가 만료되었거나 이미 사용되었습니다.',
        },
        { status: 401 }
      );
    }

    // 3. Viem ECDSA 전자서명 검증
    const isSignatureValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isSignatureValid) {
      return NextResponse.json(
        {
          isValid: false,
          errorReason: '비공개 키 암호화 서명이 요청된 지갑 주소와 일치하지 않습니다.',
        },
        { status: 401 }
      );
    }

    // 4. 온체인 스마트 컨트랙트 상태 조회 및 판정
    const targetTokenIds: bigint[] = [];

    if (tokenId !== undefined && tokenId !== null) {
      targetTokenIds.push(BigInt(tokenId));
    } else {
      // tokenId가 명시되지 않은 경우, 해당 노동자 지갑이 소유한 모든 SBT 목록 조회
      const ownedTokens = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getCredentialsByOwner',
        args: [address as `0x${string}`],
      }) as bigint[];

      targetTokenIds.push(...ownedTokens);
    }

    if (targetTokenIds.length === 0) {
      return NextResponse.json({
        isValid: false,
        signatureVerified: true,
        signerAddress: address,
        errorReason: '해당 지갑 주소로 발행된 유효한 자격 증명(SBT)이 존재하지 않습니다.',
        credentials: [],
      });
    }

    const credentialsResults = [];
    let hasAtLeastOneValid = false;

    for (const id of targetTokenIds) {
      try {
        const owner = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'ownerOf',
          args: [id],
        }) as string;

        // 실제 소유자와 서명자 주소 일치 검증
        if (owner.toLowerCase() !== address.toLowerCase()) {
          credentialsResults.push({
            tokenId: Number(id),
            isValid: false,
            reason: 'SBT 소유권이 서명자 지갑 주소와 일치하지 않습니다.',
          });
          continue;
        }

        const isValidOnChain = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'isCredentialValid',
          args: [id],
        }) as boolean;

        const rawCred = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getCredential',
          args: [id],
        }) as {
          credentialType: string;
          issuer: string;
          issuedAt: bigint;
          expiresAt: bigint;
          metadataURI: string;
          isRevoked: boolean;
          revokedAt: bigint;
          revokeReason: string;
          revokedBy: string;
        };

        const nowSec = Math.floor(Date.now() / 1000);
        const isExpired = rawCred.expiresAt > 0n && BigInt(nowSec) >= rawCred.expiresAt;

        if (isValidOnChain) {
          hasAtLeastOneValid = true;
        }

        credentialsResults.push({
          tokenId: Number(id),
          credentialType: rawCred.credentialType,
          issuer: rawCred.issuer,
          issuedAt: Number(rawCred.issuedAt),
          expiresAt: Number(rawCred.expiresAt),
          isExpired,
          isRevoked: rawCred.isRevoked,
          revokedAt: Number(rawCred.revokedAt),
          revokeReason: rawCred.revokeReason,
          revokedBy: rawCred.revokedBy,
          isValidOnChain,
          metadataURI: rawCred.metadataURI,
        });
      } catch (err) {
        console.error(`Error reading token ${id}:`, err);
      }
    }

    return NextResponse.json({
      isValid: hasAtLeastOneValid,
      signatureVerified: true,
      signerAddress: address,
      contractAddress: CONTRACT_ADDRESS,
      credentials: credentialsResults,
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: '서명 및 온체인 검증 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
