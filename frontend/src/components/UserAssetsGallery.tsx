'use client';

import contractData from '@/contracts/DigitalAsset.json';
import { useAccount, useReadContract, useWatchContractEvent } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { useState, useEffect } from 'react';
import { FolderGit2, Sparkles, ExternalLink, ShieldCheck, RefreshCw, KeyRound } from 'lucide-react';

const CONTRACT_ADDRESS = contractData.address as `0x${string}`;
const CONTRACT_ABI = contractData.abi;

interface UserAssetsGalleryProps {
  refreshTrigger?: number;
}

export function UserAssetsGallery({ refreshTrigger }: UserAssetsGalleryProps) {
  const { address, isConnected, chainId } = useAccount();

  // 내 지갑이 보유한 토큰 ID 배열 조회
  const { data: tokenIdsRaw, isLoading, refetch, isRefetching } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getTokensByOwner',
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(isConnected && address && chainId === hardhat.id),
    },
  });

  // 온체인 이벤트 실시간 리스닝: 누군가 민팅했을 때 자동 갱신
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    eventName: 'AssetMinted',
    onLogs() {
      refetch();
    },
  });

  useEffect(() => {
    if (isConnected && address) {
      refetch();
    }
  }, [refreshTrigger, isConnected, address, refetch]);

  const tokenIds = (tokenIdsRaw as bigint[]) ?? [];

  if (!isConnected) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center">
        <FolderGit2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
        <h3 className="font-bold text-slate-300 text-base">내 온체인 자산 갤러리</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          지갑을 연결하면 스마트 컨트랙트에서 조회한 소유 NFT 목록이 여기에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between pb-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-base">내 지갑 보유 자산 (NFTs)</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                {tokenIds.length}개 보유
              </span>
            </div>
            <p className="text-xs text-slate-400">
              컨트랙트의 <code className="font-mono text-purple-300">getTokensByOwner()</code>를 통해 온체인 소유권을 입증합니다
            </p>
          </div>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isRefetching || isLoading}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition"
          title="목록 새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin text-purple-400' : ''}`} />
        </button>
      </div>

      {/* Grid or Empty state */}
      <div className="mt-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className="h-56 rounded-xl bg-slate-950/70 border border-slate-800 animate-pulse" />
            ))}
          </div>
        ) : tokenIds.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-400">아직 보유한 NFT가 없습니다</p>
            <p className="text-xs text-slate-500 mt-1">위의 민팅 패널에서 첫 번째 디지털 자산을 발행해 보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tokenIds.map((id) => (
              <div
                key={id.toString()}
                className="group p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/50 transition duration-200 shadow-md"
              >
                <div className="relative aspect-video rounded-lg bg-gradient-to-tr from-slate-900 via-indigo-950 to-purple-900 border border-slate-800 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#818cf8_1px,transparent_1px)] [background-size:16px_16px]" />
                  <div className="text-center z-10">
                    <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                      #{id.toString()}
                    </span>
                    <p className="text-[10px] font-mono text-purple-300/70 uppercase tracking-widest mt-1">Digital Asset</p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">Token #{id.toString()}</span>
                    <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      온체인 소유
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>표준 규격</span>
                    <span className="text-slate-300">ERC-721</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
