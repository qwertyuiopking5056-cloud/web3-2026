'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress, keccak256, toHex } from 'viem';
import sbtArtifact from '@/contracts/WorkerCredentialSBT.json';
import { ShieldCheck, ShieldAlert, Award, AlertCircle, Loader2, CheckCircle2, UserCheck, Trash2, SlidersHorizontal } from 'lucide-react';

const CONTRACT_ADDRESS = sbtArtifact.address as `0x${string}`;
const CONTRACT_ABI = sbtArtifact.abi;
const ISSUER_ROLE = keccak256(toHex('ISSUER_ROLE'));
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

interface IssuerPortalProps {
  onIssueSuccess?: () => void;
}

const CREDENTIAL_PRESETS = [
  'E-9-비전문취업 (제조업/뿌리산업)',
  'E-7-특정활동 (조선용접/플랜트기능공)',
  'E-8-계절근로 (농축산/어업)',
  '한국어능력시험 (TOPIK 3급 공인)',
];

export function IssuerPortal({ onIssueSuccess }: IssuerPortalProps) {
  const { address, isConnected } = useAccount();

  // 발급 폼 상태
  const [recipientAddress, setRecipientAddress] = useState('');
  const [credentialType, setCredentialType] = useState(CREDENTIAL_PRESETS[0]);
  const [validityYears, setValidityYears] = useState('1');
  const [metadataUri, setMetadataUri] = useState('https://ipfs.io/ipfs/bafkreicredential-e9-root');

  // 폐기 폼 상태 (소프트 폐기)
  const [revokeTokenId, setRevokeTokenId] = useState('');
  const [revokeReason, setRevokeReason] = useState('비자 체류기간 만료 및 출국');

  // 관리자 전용: 발급기관 상태 변경 (Active / Decommissioned / Blacklisted)
  const [targetIssuerAddress, setTargetIssuerAddress] = useState('');
  const [targetStatus, setTargetStatus] = useState('1'); // 1: Active, 2: Decommissioned, 3: Blacklisted

  // 내 지갑의 권한 조회
  const { data: isIssuer } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [ISSUER_ROLE, address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: isAdmin } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  // 내 지갑의 기관 상태 조회
  const { data: myStatusRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'issuerStatus',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const myStatus = myStatusRaw !== undefined ? Number(myStatusRaw) : 0; // 0: None, 1: Active, 2: Decommissioned, 3: Blacklisted

  // 발급 트랜잭션 훅
  const {
    data: issueTxHash,
    writeContract: writeIssue,
    isPending: isIssuing,
    error: issueError,
    reset: resetIssue,
  } = useWriteContract();

  const { isLoading: isWaitingIssue, isSuccess: isIssueConfirmed } = useWaitForTransactionReceipt({
    hash: issueTxHash,
  });

  // 폐기 트랜잭션 훅
  const {
    data: revokeTxHash,
    writeContract: writeRevoke,
    isPending: isRevoking,
    error: revokeError,
    reset: resetRevoke,
  } = useWriteContract();

  const { isLoading: isWaitingRevoke, isSuccess: isRevokeConfirmed } = useWaitForTransactionReceipt({
    hash: revokeTxHash,
  });

  // 기관 상태 갱신 트랜잭션 훅
  const {
    data: statusTxHash,
    writeContract: writeSetStatus,
    isPending: isSettingStatus,
    error: statusError,
  } = useWriteContract();

  const { isLoading: isWaitingStatus, isSuccess: isStatusConfirmed } = useWaitForTransactionReceipt({
    hash: statusTxHash,
  });

  useEffect(() => {
    if (isIssueConfirmed) {
      onIssueSuccess?.();
      setRecipientAddress('');
    }
  }, [isIssueConfirmed]);

  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientAddress || !isAddress(recipientAddress)) {
      alert('유효한 수신자 지갑 주소(0x...)를 입력하세요.');
      return;
    }

    resetIssue();
    const nowSec = Math.floor(Date.now() / 1000);
    const durationSec = Number(validityYears) * 365 * 24 * 3600;
    const expiresAt = BigInt(nowSec + durationSec);

    writeIssue({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'issueCredential',
      args: [recipientAddress as `0x${string}`, credentialType, expiresAt, metadataUri],
    });
  };

  const handleRevoke = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTokenId || isNaN(Number(revokeTokenId))) {
      alert('회수할 유효한 토큰 ID를 입력하세요.');
      return;
    }

    resetRevoke();
    writeRevoke({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'revokeCredential',
      args: [BigInt(revokeTokenId), revokeReason],
    });
  };

  const handleSetIssuerStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetIssuerAddress || !isAddress(targetIssuerAddress)) {
      alert('유효한 기관 지갑 주소를 입력하세요.');
      return;
    }

    writeSetStatus({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'setIssuerStatus',
      args: [targetIssuerAddress as `0x${string}`, Number(targetStatus)],
    });
  };

  const getStatusBadge = () => {
    if (myStatus === 1) {
      return { text: '정상 운영 중 (Active)', color: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
    }
    if (myStatus === 2) {
      return { text: '협약 만료 (Decommissioned - 기발급 유효, 신규 불가)', color: 'bg-amber-950 text-amber-300 border-amber-800' };
    }
    if (myStatus === 3) {
      return { text: '부정 적발 퇴출 (Blacklisted - 기발급 즉시 소급 무효)', color: 'bg-rose-950 text-rose-300 border-rose-800' };
    }
    return { text: '비인가 지갑 (None)', color: 'bg-slate-900 text-slate-400 border-slate-700' };
  };

  const badge = getStatusBadge();

  return (
    <div className="space-y-6">
      {/* 발급기관 권한 상태 배너 */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        myStatus === 1
          ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
          : myStatus === 2
          ? 'bg-amber-950/40 border-amber-800 text-amber-300'
          : 'bg-rose-950/40 border-rose-800 text-rose-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-900/60">
            {myStatus === 1 ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <ShieldAlert className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm">기관 인증 상태:</h4>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge.color}`}>
                {badge.text}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {myStatus === 1 && '정상 협약 발급기관 지갑으로 등록되어 있으며 신규 SBT 자격증 발행 권한이 활성화되어 있습니다.'}
              {myStatus === 2 && '정상 협약 종료 상태입니다. 기발급된 자격증은 만료일까지 유효하지만 신규 발급은 차단됩니다.'}
              {myStatus === 3 && '부정 적발로 퇴출된 상태입니다. 이 기관이 발급한 모든 자격증은 즉각 소급 무효화되었습니다.'}
              {myStatus === 0 && '발급 권한이 없습니다. 상단에서 인가된 관리자/발급기관 계정으로 연결하세요.'}
            </p>
          </div>
        </div>

        <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 shrink-0">
          SBT: {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 발급 양식 (Issue Form) */}
        <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Award className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-base">외국인 노동자 자격증(SBT) 온체인 발급</h3>
          </div>

          <form onSubmit={handleIssue} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                노동자 지갑 주소 (Recipient Wallet) *
              </label>
              <input
                type="text"
                required
                placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">자격 종류 (Credential Type) *</label>
                <select
                  value={credentialType}
                  onChange={(e) => setCredentialType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {CREDENTIAL_PRESETS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">유효기간 (체류/인증 기간) *</label>
                <select
                  value={validityYears}
                  onChange={(e) => setValidityYears(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="1">1년 (기본 체류기간)</option>
                  <option value="2">2년 (연장 체류기간)</option>
                  <option value="3">3년 (숙련 기능인력)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">공인 인증 메타데이터 URI</label>
              <input
                type="text"
                value={metadataUri}
                onChange={(e) => setMetadataUri(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {isIssuing && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-950/50 border border-blue-800 text-blue-300 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>발급기관 비공개 키로 SBT 발급 서명을 진행하고 있습니다...</span>
              </div>
            )}

            {isWaitingIssue && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-300 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>EVM 블록체인 노드에서 자격증 블록 채굴 중...</span>
              </div>
            )}

            {isIssueConfirmed && issueTxHash && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>SBT 자격증 온체인 발급 완료! (소각 대신 이력 보존형 소프트 폐기 지원)</span>
                </div>
                <p className="font-mono text-[11px] text-slate-400 truncate">Tx: {issueTxHash}</p>
              </div>
            )}

            {issueError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                발급 실패: {issueError.message.slice(0, 120)}
              </div>
            )}

            <button
              type="submit"
              disabled={myStatus !== 1 || isIssuing || isWaitingIssue}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-sm shadow-md transition flex items-center justify-center gap-2"
            >
              {isIssuing || isWaitingIssue ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              <span>온체인 자격증(SBT) 즉시 발급</span>
            </button>
          </form>
        </div>

        {/* 우측 사이드 패널: 소프트 폐기 & 관리자 기관 상태 제어 */}
        <div className="lg:col-span-4 space-y-6">
          {/* 소프트 폐기 (Revoke) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-rose-400">
              <Trash2 className="w-4 h-4" />
              <h3 className="font-bold text-white text-sm">자격 박탈 (소프트 폐기)</h3>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              토큰을 소각하지 않고 <code className="text-rose-300">isRevoked</code> 플래그와 사유를 영구 보존하여 향후 출입국 심사 감사를 지원합니다.
            </p>

            <form onSubmit={handleRevoke} className="mt-3 space-y-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">토큰 ID *</label>
                <input
                  type="number"
                  required
                  placeholder="1"
                  value={revokeTokenId}
                  onChange={(e) => setRevokeTokenId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">박탈 사유 *</label>
                <input
                  type="text"
                  required
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {isRevokeConfirmed && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 자격 박탈 이력이 온체인에 영구 기록되었습니다.
                </p>
              )}

              <button
                type="submit"
                disabled={isRevoking || isWaitingRevoke}
                className="w-full py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>자격 박탈 및 감사 기록</span>
              </button>
            </form>
          </div>

          {/* 중앙 관리자 전용: 발급기관 상태 제어 */}
          {Boolean(isAdmin) && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-amber-400">
                <SlidersHorizontal className="w-4 h-4" />
                <h3 className="font-bold text-white text-sm">기관 인가/퇴출 제어 (Admin)</h3>
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                단순 협약 종료(Decommissioned)와 부정 적발 퇴출(Blacklisted)을 분리하여 소급 무효화 범위를 통제합니다.
              </p>

              <form onSubmit={handleSetIssuerStatus} className="mt-3 space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">대상 기관 지갑 주소 *</label>
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={targetIssuerAddress}
                    onChange={(e) => setTargetIssuerAddress(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-0.5">기관 상태 지정 *</label>
                  <select
                    value={targetStatus}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="1">Active (정상 협약 기관)</option>
                    <option value="2">Decommissioned (단순 협약 종료 - 기발급 유지)</option>
                    <option value="3">Blacklisted (부정 적발 - 기발급 즉시 소급 무효)</option>
                  </select>
                </div>

                {isStatusConfirmed && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> 기관 상태가 온체인에 반영되었습니다.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSettingStatus || isWaitingStatus}
                  className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>기관 상태 갱신</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
