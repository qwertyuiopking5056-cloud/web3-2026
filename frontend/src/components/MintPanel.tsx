'use client';

import contractData from '@/contracts/DigitalAsset.json';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { hardhat } from 'wagmi/chains';
import { useState, useEffect } from 'react';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ExternalLink, Image as ImageIcon } from 'lucide-react';

const CONTRACT_ADDRESS = contractData.address as `0x${string}`;
const CONTRACT_ABI = contractData.abi;

interface MintPanelProps {
  onMintSuccess?: () => void;
}

const PRESETS = [
  {
    title: 'Genesis Cyber Core #01',
    description: '디지털 자산 스튜디오의 창립 제네시스 한정판 코어 아이템입니다.',
    uri: 'https://ipfs.io/ipfs/bafkreic7x6hzkx6d6p7j7n23f4a2z3',
    image: 'https://picsum.photos/seed/cyber1/400/400',
  },
  {
    title: 'Quantum Node Protocol #02',
    description: '분산형 네트워크의 고속 블록 검증을 지원하는 노드 프로토콜 NFT.',
    uri: 'https://ipfs.io/ipfs/bafkreic4g3m8k2b7v9w1x5z8a9d0e2',
    image: 'https://picsum.photos/seed/node2/400/400',
  },
  {
    title: 'Nebula Sentinel Shield #03',
    description: '온체인 상태를 보호하는 스마트 컨트랙트 감시자 보안 실드.',
    uri: 'https://ipfs.io/ipfs/bafkreia9b8c7d6e5f4g3h2j1k0m9n8',
    image: 'https://picsum.photos/seed/shield3/400/400',
  },
];

export function MintPanel({ onMintSuccess }: MintPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [customUri, setCustomUri] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // 컨트랙트에서 현재 민팅 가격 조회 (Read)
  const { data: mintPriceRaw } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'mintPrice',
  });

  const mintPrice = (mintPriceRaw as bigint) ?? parseEther('0.01');

  // 트랜잭션 쓰기 훅 (Write)
  const { data: hash, writeContract, isPending: isSigning, error: writeError, reset } = useWriteContract();

  // 온체인 블록 확정 대기 훅
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isConfirmed) {
      onMintSuccess?.();
    }
  }, [isConfirmed]);

  const activeUri = useCustom ? customUri : PRESETS[selectedPresetIndex].uri;
  const isCorrectNetwork = chainId === hardhat.id;

  const handleMint = () => {
    if (!isConnected || !isCorrectNetwork) return;
    reset();

    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'mint',
      args: [activeUri],
      value: mintPrice,
    });
  };

  const getErrorMessage = () => {
    const err = writeError || confirmError;
    if (!err) return null;
    if (err.message.includes('User rejected')) {
      return '사용자가 지갑에서 서명을 취소했습니다.';
    }
    if (err.message.includes('MintPriceNotMet')) {
      return '전송된 ETH가 민팅 가격보다 부족합니다.';
    }
    if (err.message.includes('MaxSupplyReached')) {
      return '최대 발행량(MAX_SUPPLY)에 도달하여 더 이상 민팅할 수 없습니다.';
    }
    return err.message.slice(0, 120);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">NFT 온체인 민팅 (Write Call)</h3>
              <p className="text-xs text-slate-400">스마트 컨트랙트 상태를 갱신하고 새 블록에 기록합니다</p>
            </div>
          </div>
          <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-blue-300 font-semibold border border-slate-700">
            {formatEther(mintPrice)} ETH
          </span>
        </div>

        {/* Preset Selector */}
        <div className="mt-5 space-y-3">
          <label className="text-xs font-semibold text-slate-300">민팅할 자산 프리셋 선택</label>
          <div className="grid grid-cols-3 gap-2.5">
            {PRESETS.map((preset, idx) => {
              const isSelected = !useCustom && selectedPresetIndex === idx;
              return (
                <button
                  key={preset.title}
                  type="button"
                  onClick={() => {
                    setUseCustom(false);
                    setSelectedPresetIndex(idx);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition relative overflow-hidden flex flex-col items-center text-center ${
                    isSelected
                      ? 'bg-blue-600/10 border-blue-500 shadow-sm shadow-blue-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="w-full aspect-square rounded-lg bg-slate-800 overflow-hidden mb-2 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preset.image}
                      alt={preset.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className={`text-[11px] font-medium truncate w-full ${isSelected ? 'text-blue-300 font-bold' : 'text-slate-300'}`}>
                    {preset.title.split(' ')[0]} #{idx + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setUseCustom(!useCustom)}
              className="text-xs text-slate-400 hover:text-blue-400 transition underline underline-offset-4"
            >
              {useCustom ? '← 추천 프리셋 사용하기' : '+ 직접 메타데이터 URI 입력하기'}
            </button>
            {useCustom && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="https://ipfs.io/ipfs/... or https://..."
                  value={customUri}
                  onChange={(e) => setCustomUri(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action / State Area */}
      <div className="mt-6 pt-5 border-t border-slate-800 space-y-3">
        {/* Status messages */}
        {isSigning && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-950/50 border border-blue-800 text-blue-300 text-xs">
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-400" />
            <span>메타마스크에서 트랜잭션 서명 승인을 기다리고 있습니다...</span>
          </div>
        )}

        {isConfirming && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/50 border border-amber-800 text-amber-300 text-xs">
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
            <div>
              <p className="font-semibold">트랜잭션이 브로드캐스트되었습니다</p>
              <p className="text-[11px] text-amber-400/80 font-mono">로컬 블록체인 채굴(Confirmation) 대기 중...</p>
            </div>
          </div>
        )}

        {isConfirmed && hash && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>블록 채굴 및 NFT 민팅 완료!</span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
              <span>Tx Hash:</span>
              <span className="text-emerald-400 truncate">{hash}</span>
            </div>
          </div>
        )}

        {getErrorMessage() && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">트랜잭션 실패:</span>
              <p className="text-[11px] text-rose-300/80 mt-0.5">{getErrorMessage()}</p>
            </div>
          </div>
        )}

        {/* Submit button */}
        {!isConnected ? (
          <div className="text-center p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
            상단의 <span className="text-blue-400 font-semibold">[지갑 연결]</span> 버튼을 먼저 눌러주세요.
          </div>
        ) : !isCorrectNetwork ? (
          <div className="text-center p-3 rounded-xl bg-amber-950/40 border border-amber-800 text-xs text-amber-300">
            Hardhat 로컬 네트워크(31337)로 연결되어야 민팅이 가능합니다.
          </div>
        ) : (
          <button
            type="button"
            onClick={handleMint}
            disabled={isSigning || isConfirming || !activeUri}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 active:scale-98"
          >
            {isSigning || isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>트랜잭션 처리 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>NFT 1개 즉시 민팅 ({formatEther(mintPrice)} ETH)</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
