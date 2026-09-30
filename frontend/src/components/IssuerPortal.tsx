'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress, keccak256, toHex } from 'viem';
import sbtArtifact from '@/contracts/WorkerCredentialSBT.json';
import { CREDENTIAL_REGISTRY } from '@/config/credentials';
import {
  ShieldCheck,
  ShieldAlert,
  Award,
  AlertCircle,
  Loader2,
  CheckCircle2,
  UserCheck,
  Trash2,
  SlidersHorizontal,
  RefreshCw,
  GitCommit,
  CheckCheck,
  AlertOctagon,
  Building2,
  Lock,
} from 'lucide-react';

const CONTRACT_ADDRESS = sbtArtifact.address as `0x${string}`;
const CONTRACT_ABI = sbtArtifact.abi;
const ISSUER_ROLE = keccak256(toHex('ISSUER_ROLE'));
const OPERATOR_ROLE = keccak256(toHex('OPERATOR_ROLE'));
const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

interface IssuerPortalProps {
  onIssueSuccess?: () => void;
}

export function IssuerPortal({ onIssueSuccess }: IssuerPortalProps) {
  const { address, isConnected } = useAccount();

  // 활성 탭: 'issue' | 'revoke' | 'reissue' | 'admin'
  const [activeTab, setActiveTab] = useState<'issue' | 'revoke' | 'reissue' | 'admin'>('issue');

  // 1. 발급 폼 상태
  const [recipientAddress, setRecipientAddress] = useState('');
  const [credentialCode, setCredentialCode] = useState<string>(CREDENTIAL_REGISTRY[0].code);
  const [validityYears, setValidityYears] = useState('1');
  const [metadataUri, setMetadataUri] = useState('https://ipfs.io/ipfs/bafkreicredential-e9-root');

  // 2. 박탈 심의 상태
  const [revokeTokenId, setRevokeTokenId] = useState('');
  const [revokeReason, setRevokeReason] = useState('비자 체류기간 만료 및 출국');
  const [approveRevokeProposalId, setApproveRevokeProposalId] = useState('');
  const [emergencyTokenId, setEmergencyTokenId] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('위조 서류 긴급 직권 취소');

  // 3. 분실 재발급 상태
  const [reissueOldTokenId, setReissueOldTokenId] = useState('');
  const [reissueNewWorker, setReissueNewWorker] = useState('');
  const [reissueReason, setReissueReason] = useState('단말기 분실 및 개인키 유실 대면 확인 완료');
  const [approveReissueProposalId, setApproveReissueProposalId] = useState('');

  // 4. 관리자 기관 & 코드 상태
  const [targetIssuerAddress, setTargetIssuerAddress] = useState('');
  const [targetStatus, setTargetStatus] = useState('1');
  const [customCredentialCode, setCustomCredentialCode] = useState('');

  // 계층별 권한 조회
  const { data: isIssuer } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [ISSUER_ROLE, address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: isOperator } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [OPERATOR_ROLE, address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const { data: isAdmin } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasRole',
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  // 내 지갑의 기관 운영 상태 조회
  const { data: myStatusRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'issuerStatus',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const myStatus = myStatusRaw !== undefined ? Number(myStatusRaw) : 0;

  // 발급 트랜잭션
  const {
    data: issueTxHash,
    writeContract: writeIssue,
    isPending: isIssuing,
    error: issueError,
    reset: resetIssue,
  } = useWriteContract();
  const { isLoading: isWaitingIssue, isSuccess: isIssueConfirmed } = useWaitForTransactionReceipt({ hash: issueTxHash });

  // 박탈 제안 트랜잭션 (proposeRevocation)
  const {
    data: proposeRevokeTxHash,
    writeContract: writeProposeRevoke,
    isPending: isProposingRevoke,
    error: proposeRevokeError,
  } = useWriteContract();
  const { isLoading: isWaitingProposeRevoke, isSuccess: isProposeRevokeConfirmed } = useWaitForTransactionReceipt({ hash: proposeRevokeTxHash });

  // 박탈 승인 트랜잭션 (approveRevocation)
  const {
    data: approveRevokeTxHash,
    writeContract: writeApproveRevoke,
    isPending: isApprovingRevoke,
    error: approveRevokeError,
  } = useWriteContract();
  const { isLoading: isWaitingApproveRevoke, isSuccess: isApproveRevokeConfirmed } = useWaitForTransactionReceipt({ hash: approveRevokeTxHash });

  // 긴급 직권 박탈 트랜잭션 (emergencyRevokeCredential)
  const {
    data: emergencyRevokeTxHash,
    writeContract: writeEmergencyRevoke,
    isPending: isEmergencyRevoking,
    error: emergencyRevokeError,
  } = useWriteContract();
  const { isLoading: isWaitingEmergencyRevoke, isSuccess: isEmergencyRevokeConfirmed } = useWaitForTransactionReceipt({ hash: emergencyRevokeTxHash });

  // 재발급 제안 트랜잭션 (proposeReissue)
  const {
    data: proposeReissueTxHash,
    writeContract: writeProposeReissue,
    isPending: isProposingReissue,
    error: proposeReissueError,
  } = useWriteContract();
  const { isLoading: isWaitingProposeReissue, isSuccess: isProposeReissueConfirmed } = useWaitForTransactionReceipt({ hash: proposeReissueTxHash });

  // 재발급 승인 트랜잭션 (approveReissue)
  const {
    data: approveReissueTxHash,
    writeContract: writeApproveReissue,
    isPending: isApprovingReissue,
    error: approveReissueError,
  } = useWriteContract();
  const { isLoading: isWaitingApproveReissue, isSuccess: isApproveReissueConfirmed } = useWaitForTransactionReceipt({ hash: approveReissueTxHash });

  // 기관 상태 갱신 트랜잭션
  const {
    data: statusTxHash,
    writeContract: writeSetStatus,
    isPending: isSettingStatus,
    error: statusError,
  } = useWriteContract();
  const { isLoading: isWaitingStatus, isSuccess: isStatusConfirmed } = useWaitForTransactionReceipt({ hash: statusTxHash });

  // 자격 코드 등록 트랜잭션
  const {
    data: registerCodeTxHash,
    writeContract: writeRegisterCode,
    isPending: isRegisteringCode,
    error: registerCodeError,
  } = useWriteContract();
  const { isLoading: isWaitingRegisterCode, isSuccess: isRegisterCodeConfirmed } = useWaitForTransactionReceipt({ hash: registerCodeTxHash });

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
      args: [recipientAddress as `0x${string}`, credentialCode as `0x${string}`, expiresAt, metadataUri],
    });
  };

  const handleProposeRevocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTokenId || isNaN(Number(revokeTokenId))) {
      alert('안건 상정할 유효한 토큰 ID를 입력하세요.');
      return;
    }
    writeProposeRevoke({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'proposeRevocation',
      args: [BigInt(revokeTokenId), revokeReason],
    });
  };

  const handleApproveRevocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveRevokeProposalId || isNaN(Number(approveRevokeProposalId))) {
      alert('승인할 유효한 박탈 안건 ID를 입력하세요.');
      return;
    }
    writeApproveRevoke({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'approveRevocation',
      args: [BigInt(approveRevokeProposalId)],
    });
  };

  const handleEmergencyRevoke = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emergencyTokenId || isNaN(Number(emergencyTokenId))) {
      alert('직권 박탈할 유효한 토큰 ID를 입력하세요.');
      return;
    }
    writeEmergencyRevoke({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'emergencyRevokeCredential',
      args: [BigInt(emergencyTokenId), emergencyReason],
    });
  };

  const handleProposeReissue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reissueOldTokenId || isNaN(Number(reissueOldTokenId))) {
      alert('분실된 구 토큰 ID를 입력하세요.');
      return;
    }
    if (!reissueNewWorker || !isAddress(reissueNewWorker)) {
      alert('노동자의 신규 승계 지갑 주소를 입력하세요.');
      return;
    }
    writeProposeReissue({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'proposeReissue',
      args: [BigInt(reissueOldTokenId), reissueNewWorker as `0x${string}`, reissueReason],
    });
  };

  const handleApproveReissue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!approveReissueProposalId || isNaN(Number(approveReissueProposalId))) {
      alert('승인할 유효한 재발급 안건 ID를 입력하세요.');
      return;
    }
    writeApproveReissue({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'approveReissue',
      args: [BigInt(approveReissueProposalId)],
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

  const handleRegisterCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCredentialCode) return;
    const formattedCode = customCredentialCode.startsWith('0x')
      ? (customCredentialCode as `0x${string}`)
      : keccak256(toHex(customCredentialCode));

    writeRegisterCode({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'registerCredentialCode',
      args: [formattedCode],
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
      {/* 거버넌스 2계층 권한 배너 */}
      <div className="p-4 rounded-2xl border bg-slate-900/90 border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-white text-sm">거버넌스 2계층 RBAC 현황:</h4>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${badge.color}`}>
                {badge.text}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
              <span className={`px-2 py-0.5 rounded font-mono ${isAdmin ? 'bg-amber-950/80 text-amber-300 border border-amber-800' : 'bg-slate-950 text-slate-500'}`}>
                ADMIN: {isAdmin ? '보유 (루트 제어)' : '미보유'}
              </span>
              <span className={`px-2 py-0.5 rounded font-mono ${isOperator ? 'bg-purple-950/80 text-purple-300 border border-purple-800' : 'bg-slate-950 text-slate-500'}`}>
                OPERATOR: {isOperator ? '보유 (심의/승인)' : '미보유'}
              </span>
              <span className={`px-2 py-0.5 rounded font-mono ${isIssuer ? 'bg-blue-950/80 text-blue-300 border border-blue-800' : 'bg-slate-950 text-slate-500'}`}>
                ISSUER: {isIssuer ? '보유 (발급/제안)' : '미보유'}
              </span>
            </div>
          </div>
        </div>

        <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400 shrink-0">
          SBT: {CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}
        </span>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab('issue')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'issue'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>신규 발급 (Issuer)</span>
        </button>
        <button
          onClick={() => setActiveTab('revoke')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'revoke'
              ? 'bg-rose-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          <span>2단계 박탈 심의 (2-Man Rule)</span>
        </button>
        <button
          onClick={() => setActiveTab('reissue')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeTab === 'reissue'
              ? 'bg-purple-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <GitCommit className="w-4 h-4" />
          <span>분실 재발급 & 계보 (Reissue)</span>
        </button>
        {Boolean(isAdmin) && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'admin'
                ? 'bg-amber-600 text-slate-950 shadow-lg'
                : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>루트 거버넌스 (Admin)</span>
          </button>
        )}
      </div>

      {/* 1. 신규 발급 탭 */}
      {activeTab === 'issue' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-2 pb-4 border-b border-slate-800">
            <Award className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="font-bold text-white text-base">외국인 노동자 자격증(SBT) 온체인 발급</h3>
              <p className="text-xs text-slate-400">발급기관(ISSUER_ROLE) 비공개 키로 대한민국 국가 공인 자격 레지스트리 기반 SBT를 발행합니다.</p>
            </div>
          </div>

          <form onSubmit={handleIssue} className="mt-5 space-y-4 max-w-2xl">
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
                <label className="block text-xs font-semibold text-slate-300 mb-1">공인 자격 코드 (bytes32 Registry) *</label>
                <select
                  value={credentialCode}
                  onChange={(e) => setCredentialCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {CREDENTIAL_REGISTRY.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label} ({p.name})
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
                발급 실패: {issueError.message.slice(0, 150)}
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
      )}

      {/* 2. 2단계 박탈 심의 (Revocation 2-Man Rule) 탭 */}
      {activeTab === 'revoke' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 제안 (Propose Revocation) - ISSUER_ROLE */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-amber-400">
                <ShieldAlert className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-white text-sm">1단계: 박탈 심의 제안 (Issuer)</h3>
                  <p className="text-[11px] text-slate-400">발급기관이 취소 사유를 적시하여 심의 안건을 온체인 상정합니다.</p>
                </div>
              </div>

              <form onSubmit={handleProposeRevocation} className="mt-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">대상 토큰 ID *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    value={revokeTokenId}
                    onChange={(e) => setRevokeTokenId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">박탈 사유 *</label>
                  <input
                    type="text"
                    required
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {isProposeRevokeConfirmed && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> 박탈 심의 안건이 성공적으로 상정되었습니다!
                  </p>
                )}

                {proposeRevokeError && (
                  <p className="text-xs text-rose-400">제안 오류: {proposeRevokeError.message.slice(0, 100)}</p>
                )}

                <button
                  type="submit"
                  disabled={!isIssuer || isProposingRevoke || isWaitingProposeRevoke}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>박탈 심의 안건 상정</span>
                </button>
              </form>
            </div>
          </div>

          {/* 승인 (Approve Revocation) - OPERATOR_ROLE (2-Man Rule) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-rose-400">
                <CheckCheck className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-white text-sm">2단계: 심의관 최종 승인 (Operator)</h3>
                  <p className="text-[11px] text-slate-400">2-Man Rule 적용: 제안자 본인의 셀프 승인은 차단됩니다.</p>
                </div>
              </div>

              <form onSubmit={handleApproveRevocation} className="mt-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">상정된 안건 ID (Proposal ID) *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    value={approveRevokeProposalId}
                    onChange={(e) => setApproveRevokeProposalId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                  />
                </div>

                {isApproveRevokeConfirmed && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> 박탈이 승인되어 토큰이 영구 무효화(isRevoked=true)되었습니다.
                  </p>
                )}

                {approveRevokeError && (
                  <p className="text-xs text-rose-400">승인 거부: {approveRevokeError.message.slice(0, 100)}</p>
                )}

                <button
                  type="submit"
                  disabled={!isOperator || isApprovingRevoke || isWaitingApproveRevoke}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>박탈 최종 승인 및 온체인 무효화</span>
                </button>
              </form>
            </div>
          </div>

          {/* 중앙 관리자 긴급 직권 박탈 */}
          {Boolean(isAdmin) && (
            <div className="md:col-span-2 bg-slate-900/80 border border-rose-900/40 rounded-2xl p-6 shadow-xl">
              <div className="flex items-center gap-2 pb-3 border-b border-rose-900/40 text-rose-400">
                <AlertOctagon className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-white text-sm">관리자 긴급 직권 박탈 (Multi-sig Emergency Bypass)</h3>
                  <p className="text-[11px] text-slate-400">DEFAULT_ADMIN_ROLE 전용: 2단계를 우회하여 즉각 긴급 회수합니다.</p>
                </div>
              </div>

              <form onSubmit={handleEmergencyRevoke} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">토큰 ID *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    value={emergencyTokenId}
                    onChange={(e) => setEmergencyTokenId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">긴급 직권 사유 *</label>
                  <input
                    type="text"
                    required
                    value={emergencyReason}
                    onChange={(e) => setEmergencyReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={isEmergencyRevoking || isWaitingEmergencyRevoke}
                    className="w-full py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <AlertOctagon className="w-4 h-4" />
                    <span>즉각 긴급 박탈</span>
                  </button>
                </div>
              </form>
              {isEmergencyRevokeConfirmed && (
                <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> 직권 박탈이 온체인에 집행되었습니다.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. 분실 재발급 & 계보 탭 */}
      {activeTab === 'reissue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 재발급 제안 (Issuer) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-purple-400">
                <GitCommit className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-white text-sm">1단계: 대면 확인 후 재발급 제안 (Issuer)</h3>
                  <p className="text-[11px] text-slate-400">오프라인 실물 신원 확인 후 분실된 구 토큰을 신규 지갑으로 승계 제안합니다.</p>
                </div>
              </div>

              <form onSubmit={handleProposeReissue} className="mt-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">분실된 구 토큰 ID (Old Token ID) *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    value={reissueOldTokenId}
                    onChange={(e) => setReissueOldTokenId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">신규 승계 지갑 주소 (New Worker Address) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0x..."
                    value={reissueNewWorker}
                    onChange={(e) => setReissueNewWorker(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">대면 확인 사유 *</label>
                  <input
                    type="text"
                    required
                    value={reissueReason}
                    onChange={(e) => setReissueReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                {isProposeReissueConfirmed && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> 재발급 안건이 상정되었습니다.
                  </p>
                )}

                {proposeReissueError && (
                  <p className="text-xs text-rose-400">제안 오류: {proposeReissueError.message.slice(0, 100)}</p>
                )}

                <button
                  type="submit"
                  disabled={!isIssuer || isProposingReissue || isWaitingProposeReissue}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <GitCommit className="w-4 h-4" />
                  <span>재발급 안건 상정</span>
                </button>
              </form>
            </div>
          </div>

          {/* 재발급 승인 (Operator) */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-purple-400">
                <CheckCheck className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-white text-sm">2단계: 서류 대조 후 승인 (Operator)</h3>
                  <p className="text-[11px] text-slate-400">구 토큰 자동 폐기 + 신규 토큰 민팅 및 온체인 계보(Lineage)가 영구 결합됩니다.</p>
                </div>
              </div>

              <form onSubmit={handleApproveReissue} className="mt-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">재발급 안건 ID (Reissue Proposal ID) *</label>
                  <input
                    type="number"
                    required
                    placeholder="1"
                    value={approveReissueProposalId}
                    onChange={(e) => setApproveReissueProposalId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">승인 시 자동 수행 온체인 로직:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                    <li>구 토큰 소프트 폐기 (isRevoked = true, 사유 영구 보존)</li>
                    <li>신규 토큰 safeMint 발행 (동일 자격/만료일)</li>
                    <li>신규 토큰 previousTokenId = 구 토큰 ID 계보 체인 앵커링</li>
                  </ul>
                </div>

                {isApproveReissueConfirmed && (
                  <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> 재발급 및 계보 연결이 온체인에 성공적으로 완결되었습니다!
                  </p>
                )}

                {approveReissueError && (
                  <p className="text-xs text-rose-400">승인 오류: {approveReissueError.message.slice(0, 100)}</p>
                )}

                <button
                  type="submit"
                  disabled={!isOperator || isApprovingReissue || isWaitingApproveReissue}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs transition flex items-center justify-center gap-1.5"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>재발급 승인 및 계보 앵커링</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 4. 관리자 거버넌스 탭 */}
      {activeTab === 'admin' && Boolean(isAdmin) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 기관 인가/퇴출 제어 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-amber-400">
              <SlidersHorizontal className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-white text-sm">기관 인가 및 퇴출 제어 (setIssuerStatus)</h3>
                <p className="text-[11px] text-slate-400">협약 만료(기발급 유지)와 부정 퇴출(전부 소급 무효)을 구분합니다.</p>
              </div>
            </div>

            <form onSubmit={handleSetIssuerStatus} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">대상 기관 지갑 주소 *</label>
                <input
                  type="text"
                  required
                  placeholder="0x..."
                  value={targetIssuerAddress}
                  onChange={(e) => setTargetIssuerAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">기관 상태 지정 *</label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="1">Active (정상 협약 기관 - 신규 발급 가능)</option>
                  <option value="2">Decommissioned (단순 협약 종료 - 기발급 유효, 신규 불가)</option>
                  <option value="3">Blacklisted (부정 적발 퇴출 - 기발급 즉시 소급 무효)</option>
                </select>
              </div>

              {isStatusConfirmed && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> 기관 상태가 온체인에 반영되었습니다.
                </p>
              )}

              <button
                type="submit"
                disabled={isSettingStatus || isWaitingStatus}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>기관 상태 온체인 갱신</span>
              </button>
            </form>
          </div>

          {/* 자격 코드 등록/관리 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-amber-400">
              <Award className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-white text-sm">국가 자격 코드 온체인 등록 (registerCredentialCode)</h3>
                <p className="text-[11px] text-slate-400">화이트리스트에 등재되지 않은 코드는 발행 시 Revert(N-4)됩니다.</p>
              </div>
            </div>

            <form onSubmit={handleRegisterCode} className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">식별 문자열 또는 bytes32 해시 *</label>
                <input
                  type="text"
                  required
                  placeholder="예: KR.GOV.VISA.E7.TECH"
                  value={customCredentialCode}
                  onChange={(e) => setCustomCredentialCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {isRegisterCodeConfirmed && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-4 h-4" /> 신규 자격 코드가 레지스트리에 등록되었습니다.
                </p>
              )}

              <button
                type="submit"
                disabled={isRegisteringCode || isWaitingRegisterCode}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
              >
                <Award className="w-4 h-4" />
                <span>자격 코드 등록</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
