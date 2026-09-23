'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useSignMessage, useWatchContractEvent } from 'wagmi';
import sbtArtifact from '@/contracts/WorkerCredentialSBT.json';
import {
  Award,
  ShieldCheck,
  ShieldAlert,
  Key,
  Copy,
  Check,
  Lock,
  Loader2,
  QrCode,
  AlertTriangle,
  RotateCw,
  Clock,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const CONTRACT_ADDRESS = sbtArtifact.address as `0x${string}`;
const CONTRACT_ABI = sbtArtifact.abi;

export function WorkerCredentialCard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [signing, setSigning] = useState(false);
  const [proofPayload, setProofPayload] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [testingVerify, setTestingVerify] = useState(false);

  // 60초 카운트다운 타이머
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // 내 지갑이 보유한 자격증 토큰 ID 목록 조회
  const { data: tokenIdsRaw, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getCredentialsByOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(isConnected && address),
    },
  });

  // 온체인 이벤트 실시간 감시
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'CredentialIssued',
    onLogs() {
      refetch();
    },
  });

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'CredentialRevoked',
    onLogs() {
      refetch();
    },
  });

  const tokenIds = (tokenIdsRaw as bigint[]) ?? [];

  const handleGenerateProof = async () => {
    if (!address) return;
    setSigning(true);
    setVerifyResult(null);

    try {
      // 1. 백엔드에서 60초 1회용 챌린지 Nonce 발급 (Rate Limit 적용)
      const res = await fetch('/api/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const challengeData = await res.json();

      if (!res.ok || !challengeData.success) {
        throw new Error(challengeData.error || '챌린지 발급에 실패했습니다.');
      }

      // 2. MetaMask 지갑에서 개인키로 챌린지 메시지 서명 (가스비 0원)
      const signature = await signMessageAsync({
        message: challengeData.message,
      });

      // 3. 검증용 제출 페이로드 구성 (60초 카운트다운 활성화)
      const payload = {
        address,
        nonce: challengeData.nonce,
        message: challengeData.message,
        signature,
      };

      setProofPayload(JSON.stringify(payload, null, 2));
      setTimeLeft(60); // 60초 타이머 시작
    } catch (error: any) {
      console.error('Proof generation error:', error);
      alert(`서명 취소 또는 오류: ${error.message}`);
    } finally {
      setSigning(false);
    }
  };

  // 노동자 본인이 직접 즉시 테스트 검증 (주의: Nonce가 소비됨)
  const handleTestVerify = async () => {
    if (!proofPayload || timeLeft <= 0) return;
    setTestingVerify(true);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: proofPayload,
      });
      const data = await res.json();
      setVerifyResult(data);
      // 검증 즉시 Nonce가 소모되었으므로 만료 처리
      setTimeLeft(0);
    } catch (err: any) {
      setVerifyResult({ isValid: false, errorReason: err.message });
    } finally {
      setTestingVerify(false);
    }
  };

  const copyPayload = () => {
    if (!proofPayload) return;
    navigator.clipboard.writeText(proofPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isConnected) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <Award className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="font-bold text-slate-300 text-base">노동자 자격증 지갑</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          지갑을 연결하면 발급기관으로부터 부여받은 Soulbound 자격증(SBT) 목록을 확인할 수 있습니다.
        </p>
      </div>
    );
  }

  const isExpired = proofPayload !== null && timeLeft === 0;

  return (
    <div className="space-y-6">
      {/* 보유 자격증 목록 카드 */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">내 온체인 자격 증명 (Soulbound SBT)</h3>
              <p className="text-xs text-slate-400">지갑에 영구 귀속되며 소프트 폐기(Revoke) 시에도 감사 이력이 보존됩니다</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-blue-950 text-blue-300 border border-blue-800">
            {tokenIds.length}건 보유
          </span>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="h-32 rounded-xl bg-slate-950 border border-slate-800 animate-pulse" />
          ) : tokenIds.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
              <p className="text-sm font-semibold text-slate-400">발급된 공인 자격증이 없습니다</p>
              <p className="text-xs text-slate-500 mt-1">공인 발급기관(ISSUER_ROLE)을 통해 자격증 SBT를 발급받으세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tokenIds.map((id) => (
                <SingleCredentialView key={id.toString()} tokenId={id} />
              ))}
            </div>
          )}
        </div>

        {/* 검증용 암호 서명 및 QR 코드 생성 섹션 */}
        {tokenIds.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-amber-400" />
                  고용주/출입국 제출용 신원 암호 서명 (QR & JSON)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  가스비 없이 60초 1회용 챌린지에 서명하여 현장 검증용 실시간 QR 코드를 발급합니다.
                </p>
              </div>
              <button
                onClick={handleGenerateProof}
                disabled={signing}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5 shrink-0"
              >
                {signing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <QrCode className="w-4 h-4" />
                )}
                <span>{proofPayload ? 'QR 새로고침' : '검증 QR 발급'}</span>
              </button>
            </div>

            {proofPayload && (
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                {/* 60초 타이머 프로그레스 바 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-semibold text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      QR 인증 유효시간
                    </span>
                    <span className={`font-mono font-bold ${timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                      {timeLeft > 0 ? `${timeLeft}초 남음` : '만료됨 (새로고침 필요)'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ease-linear ${
                        timeLeft <= 10 ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${(timeLeft / 60) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
                  {/* QR 코드 표시 (현장 스캔용) */}
                  <div className="sm:col-span-4 relative flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 overflow-hidden">
                    <div className={isExpired ? 'filter blur-sm opacity-30 pointer-events-none' : ''}>
                      <QRCodeSVG
                        value={proofPayload}
                        size={140}
                        level="M"
                        includeMargin={false}
                      />
                    </div>

                    {/* 만료 오버레이 */}
                    {isExpired && (
                      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-3 text-center">
                        <AlertTriangle className="w-6 h-6 text-rose-400 mb-1" />
                        <span className="text-[11px] font-bold text-white">시간 만료</span>
                        <p className="text-[9px] text-slate-400 mt-0.5 mb-2">보안을 위해 60초 후 자동 만료되었습니다.</p>
                        <button
                          onClick={handleGenerateProof}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow"
                        >
                          <RotateCw className="w-3 h-3" />
                          <span>재발급</span>
                        </button>
                      </div>
                    )}

                    {!isExpired && (
                      <span className="text-[10px] font-bold text-slate-700 mt-2 flex items-center gap-1">
                        <QrCode className="w-3 h-3" /> 검증관 스캔용 QR (60초 유효)
                      </span>
                    )}
                  </div>

                  {/* 페이로드 JSON 표시 및 복사 */}
                  <div className="sm:col-span-8 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">검증 페이로드 (EIP-4361 암호 서명)</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleTestVerify}
                          disabled={testingVerify || isExpired}
                          className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition"
                          title="자체 테스트용 (Nonce 1회가 즉시 소비됩니다)"
                        >
                          {testingVerify ? '검증 중...' : '즉시 테스트 검증'}
                        </button>
                        <button
                          onClick={copyPayload}
                          className="text-slate-400 hover:text-white flex items-center gap-1 font-mono transition"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? '복사됨' : 'JSON 복사'}</span>
                        </button>
                      </div>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-slate-900 font-mono text-[10px] text-slate-300 overflow-x-auto max-h-32">
                      {proofPayload}
                    </pre>
                  </div>
                </div>

                {verifyResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs ${
                      verifyResult.isValid
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      {verifyResult.isValid ? (
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                      )}
                      <span>
                        {verifyResult.isValid
                          ? '온체인 실시간 검증 통과: 서명 일치 및 유효한 자격 증명'
                          : `검증 불합격: ${verifyResult.errorReason || '자격이 박탈되었거나 만료되었습니다.'}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SingleCredentialView({ tokenId }: { tokenId: bigint }) {
  const { data: rawCred } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getCredential',
    args: [tokenId],
  });

  const { data: isValid } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isCredentialValid',
    args: [tokenId],
  });

  if (!rawCred) {
    return (
      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 animate-pulse h-28" />
    );
  }

  const cred = rawCred as {
    credentialType: string;
    issuer: string;
    issuedAt: bigint;
    expiresAt: bigint;
    isRevoked: boolean;
    revokedAt: bigint;
    revokeReason: string;
    revokedBy: string;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const isExpired = cred.expiresAt > 0n && BigInt(nowSec) >= cred.expiresAt;
  const isRevoked = cred.isRevoked;
  const activeValid = Boolean(isValid) && !isExpired && !isRevoked;

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        activeValid
          ? 'bg-slate-950 border-emerald-900/50 hover:border-emerald-700/60'
          : isRevoked
          ? 'bg-rose-950/20 border-rose-900/50'
          : 'bg-amber-950/20 border-amber-900/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-mono text-slate-500">Token ID #{tokenId.toString()}</span>
          <h4 className="font-bold text-white text-sm mt-0.5">{cred.credentialType}</h4>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            activeValid
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : isRevoked
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}
        >
          {activeValid ? '정상 유효' : isRevoked ? '소프트 박탈' : '기간 만료'}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-[11px] text-slate-400">
        <p className="truncate">
          <span className="text-slate-500">발급기관:</span>{' '}
          <span className="font-mono text-slate-300">{cred.issuer}</span>
        </p>
        <p>
          <span className="text-slate-500">발급일시:</span>{' '}
          <span className="text-slate-300">
            {new Date(Number(cred.issuedAt) * 1000).toLocaleDateString()}
          </span>
        </p>
        <p>
          <span className="text-slate-500">유효기간:</span>{' '}
          <span className="text-slate-300">
            {cred.expiresAt === 0n
              ? '무기한'
              : new Date(Number(cred.expiresAt) * 1000).toLocaleDateString()}
          </span>
        </p>
      </div>

      {isRevoked && (
        <div className="mt-3 p-2 rounded bg-rose-950/40 border border-rose-900/40 text-[10px] text-rose-300 space-y-0.5">
          <div className="flex items-center gap-1 font-bold">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>온체인 자격 박탈 기록 (감사 보존)</span>
          </div>
          <p>
            <span className="text-rose-400">사유:</span> {cred.revokeReason}
          </p>
          <p className="text-slate-400 text-[9px]">
            처리일시: {new Date(Number(cred.revokedAt) * 1000).toLocaleString()} / 처리자: {cred.revokedBy.slice(0, 6)}...{cred.revokedBy.slice(-4)}
          </p>
        </div>
      )}
    </div>
  );
}
