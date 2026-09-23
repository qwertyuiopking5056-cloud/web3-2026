'use client';

import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { isAddress } from 'viem';
import sbtArtifact from '@/contracts/WorkerCredentialSBT.json';
import { Search, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Loader2, FileCheck, AlertTriangle, QrCode } from 'lucide-react';

const CONTRACT_ADDRESS = sbtArtifact.address as `0x${string}`;
const CONTRACT_ABI = sbtArtifact.abi;

export function VerifierPortal() {
  const [activeTab, setActiveTab] = useState<'payload' | 'address'>('payload');

  // 페이로드 검증 상태
  const [jsonPayload, setJsonPayload] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  // 주소 직접 조회 상태
  const [searchAddress, setSearchAddress] = useState('');
  const [queriedAddress, setQueriedAddress] = useState<string | null>(null);

  const { data: tokenIdsRaw, isLoading: isQuerying } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getCredentialsByOwner',
    args: queriedAddress ? [queriedAddress as `0x${string}`] : undefined,
    query: {
      enabled: Boolean(queriedAddress && isAddress(queriedAddress)),
    },
  });

  const tokenIds = (tokenIdsRaw as bigint[]) ?? [];

  const handleVerifyPayload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonPayload.trim()) return;

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const parsed = JSON.parse(jsonPayload);
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      setVerifyResult(data);
    } catch (err: any) {
      alert(`페이로드 파싱 또는 서버 통신 오류: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSearchAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchAddress || !isAddress(searchAddress)) {
      alert('올바른 지갑 주소를 입력하세요.');
      return;
    }
    setQueriedAddress(searchAddress);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">검증자 포털 (고용주 / 출입국 심사)</h3>
            <p className="text-xs text-slate-400">QR 스캔 서명 페이로드 및 온체인 상태를 대조하여 박탈 이력과 진위를 정밀 검증합니다</p>
          </div>
        </div>

        {/* 탭 전환 */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('payload')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'payload' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>QR/서명 페이로드 검증 (추천)</span>
          </button>
          <button
            onClick={() => setActiveTab('address')}
            className={`px-3 py-1.5 rounded-lg transition ${
              activeTab === 'address' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            온체인 주소 직접 조회
          </button>
        </div>
      </div>

      {/* 탭 1: 서명 페이로드 검증 */}
      {activeTab === 'payload' && (
        <div className="space-y-4">
          <form onSubmit={handleVerifyPayload} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">
              노동자 QR 스캔 결과 또는 서명 JSON 페이로드 입력 *
            </label>
            <textarea
              rows={4}
              required
              placeholder='{\n  "address": "0x...",\n  "nonce": "...",\n  "message": "...",\n  "signature": "0x..."\n}'
              value={jsonPayload}
              onChange={(e) => setJsonPayload(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={isVerifying || !jsonPayload.trim()}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>암호 서명 및 온체인 상태 검증 중...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>진위 검증 실행 (Verify Authenticity)</span>
                </>
              )}
            </button>
          </form>

          {/* 검증 결과 패널 */}
          {verifyResult && (
            <div className={`mt-5 p-5 rounded-2xl border space-y-4 ${
              verifyResult.isValid
                ? 'bg-emerald-950/30 border-emerald-800'
                : 'bg-rose-950/30 border-rose-800'
            }`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  {verifyResult.isValid ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-rose-400" />
                  )}
                  <div>
                    <h4 className={`text-base font-extrabold ${verifyResult.isValid ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {verifyResult.isValid ? '공인 자격증 유효성 검증 합격 (AUTHENTIC)' : '검증 불합격 또는 박탈됨 (INVALID)'}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {verifyResult.isValid
                        ? '노동자 개인키 서명 일치, 공인 협약 기관 발급, 유효기간 및 소프트 폐기 여부 전원 통과.'
                        : verifyResult.errorReason || '자격이 박탈되었거나 만료된 자격증입니다.'}
                    </p>
                  </div>
                </div>

                <span className="font-mono text-[11px] text-slate-400">
                  {new Date().toLocaleTimeString()} 검증
                </span>
              </div>

              {verifyResult.credentials && verifyResult.credentials.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-300">온체인 상세 감사 추적 내역:</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {verifyResult.credentials.map((cred: any) => (
                      <div key={cred.tokenId} className={`p-3.5 rounded-xl border text-xs space-y-2 font-mono ${
                        cred.isRevoked
                          ? 'bg-rose-950/50 border-rose-800'
                          : cred.isValidOnChain
                          ? 'bg-slate-950/80 border-slate-800'
                          : 'bg-amber-950/50 border-amber-800'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">{cred.credentialType}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cred.isRevoked
                              ? 'bg-rose-900 text-rose-200'
                              : cred.isValidOnChain
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-amber-950 text-amber-300'
                          }`}>
                            {cred.isRevoked ? '자격 박탈됨' : cred.isValidOnChain ? '정상 유효' : '만료됨'}
                          </span>
                        </div>

                        <p className="text-slate-400">Token ID: #{cred.tokenId}</p>
                        <p className="text-slate-400">발급기관: {cred.issuer}</p>

                        {/* 박탈 사유가 있는 경우 온체인 감사 내역 표시 */}
                        {cred.isRevoked && (
                          <div className="p-2 rounded bg-rose-950 border border-rose-900 text-rose-300 text-[11px] space-y-0.5">
                            <p className="font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              온체인 박탈 사유:
                            </p>
                            <p className="text-rose-200">{cred.revokeReason}</p>
                            <p className="text-[10px] text-slate-400">
                              박탈 일시: {new Date(cred.revokedAt * 1000).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 탭 2: 온체인 주소 직접 조회 */}
      {activeTab === 'address' && (
        <div className="space-y-4">
          <form onSubmit={handleSearchAddress} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="검증할 노동자 지갑 주소 (0x...)"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 whitespace-nowrap"
            >
              <Search className="w-4 h-4" />
              <span>온체인 조회</span>
            </button>
          </form>

          {queriedAddress && (
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-slate-400">조회 대상: {queriedAddress}</span>
                <span className="font-bold text-white">{tokenIds.length}개 SBT 보유 중</span>
              </div>

              {isQuerying ? (
                <div className="h-24 rounded-xl bg-slate-950 border border-slate-800 animate-pulse" />
              ) : tokenIds.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-xs text-slate-500">
                  해당 지갑에 발행된 자격증(SBT)이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tokenIds.map((id) => (
                    <DetailedVerifierCard key={id.toString()} tokenId={id} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailedVerifierCard({ tokenId }: { tokenId: bigint }) {
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

  if (!rawCred) return null;

  const cred = rawCred as {
    credentialType: string;
    issuer: string;
    expiresAt: bigint;
    isRevoked: boolean;
    revokeReason: string;
    revokedAt: bigint;
  };

  return (
    <div className={`p-3.5 rounded-xl border text-xs font-mono space-y-2 ${
      cred.isRevoked ? 'bg-rose-950/40 border-rose-900' : 'bg-slate-950 border-slate-800'
    }`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-white text-sm">{cred.credentialType}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
          cred.isRevoked
            ? 'bg-rose-900 text-rose-200'
            : isValid
            ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
            : 'bg-amber-950 text-amber-300'
        }`}>
          {cred.isRevoked ? '자격 박탈됨' : isValid ? '유효' : '만료됨'}
        </span>
      </div>
      <p className="text-slate-400">Token #{tokenId.toString()}</p>
      <p className="text-slate-500 text-[11px]">발급기관: {cred.issuer.slice(0, 8)}...</p>

      {cred.isRevoked && (
        <div className="p-2 rounded bg-rose-950/80 border border-rose-900 text-rose-300 text-[11px]">
          <p className="font-bold">박탈 사유: {cred.revokeReason}</p>
        </div>
      )}
    </div>
  );
}
