'use client';

import contractData from '@/contracts/DigitalAsset.json';
import { useAccount, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { useState } from 'react';
import { Database, Copy, Check, ShieldCheck, Coins, Layers, RefreshCw } from 'lucide-react';

const CONTRACT_ADDRESS = contractData.address as `0x${string}`;
const CONTRACT_ABI = contractData.abi;

export function ContractOverview() {
  const { address } = useAccount();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useReadContracts({
    contracts: [
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'name',
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'symbol',
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'mintPrice',
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'totalSupply',
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'MAX_SUPPLY',
      },
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'owner',
      },
    ],
  });

  const name = (data?.[0]?.result as string) ?? '로딩 중...';
  const symbol = (data?.[1]?.result as string) ?? '...';
  const mintPriceRaw = data?.[2]?.result as bigint | undefined;
  const mintPriceEth = mintPriceRaw ? formatEther(mintPriceRaw) : '0.01';
  const totalSupply = data?.[3]?.result !== undefined ? Number(data[3].result) : 0;
  const maxSupply = data?.[4]?.result !== undefined ? Number(data[4].result) : 1000;
  const ownerAddress = (data?.[5]?.result as string) ?? '';

  const isOwner = Boolean(
    address && ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase()
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(CONTRACT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Top bar with Contract Address and Live Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">온체인 스마트 컨트랙트 상태</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live RPC
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">로컬 EVM 블록체인에서 직접 읽어온 데이터입니다</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
            <span className="text-slate-500 mr-2">주소:</span>
            <span>{CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-6)}</span>
            <button
              onClick={handleCopy}
              title="컨트랙트 주소 복사"
              className="ml-2 text-slate-400 hover:text-white transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            title="새로고침"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-xs text-slate-400 font-medium">토큰 이름 / 심볼</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-bold text-white">{name}</span>
            <span className="text-xs font-mono text-blue-400 font-semibold">({symbol})</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">민팅 가격 (단가)</span>
            <Coins className="w-4 h-4 text-amber-400/70" />
          </div>
          <div className="mt-1">
            <span className="text-lg font-bold text-white font-mono">{mintPriceEth}</span>
            <span className="text-xs text-slate-400 ml-1">ETH</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">현재 총 발행량</span>
            <Layers className="w-4 h-4 text-indigo-400/70" />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-lg font-bold text-white font-mono">{totalSupply}</span>
            <span className="text-xs text-slate-500">/ {maxSupply} MAX</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">권한 상태</span>
            <ShieldCheck className={`w-4 h-4 ${isOwner ? 'text-emerald-400' : 'text-slate-500'}`} />
          </div>
          <div className="mt-1">
            {isOwner ? (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300">
                컨트랙트 소유자 (Admin)
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-400">일반 유저</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
