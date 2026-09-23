'use client';

import contractData from '@/contracts/DigitalAsset.json';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useBalance } from 'wagmi';
import { parseEther, formatEther, formatUnits } from 'viem';
import { hardhat } from 'wagmi/chains';
import { useState } from 'react';
import { ShieldAlert, ArrowDownToLine, Settings2, Loader2, CheckCircle2 } from 'lucide-react';

const CONTRACT_ADDRESS = contractData.address as `0x${string}`;
const CONTRACT_ABI = contractData.abi;

interface AdminPanelProps {
  onActionSuccess?: () => void;
}

export function AdminPanel({ onActionSuccess }: AdminPanelProps) {
  const { address, isConnected, chainId } = useAccount();
  const [newPriceEth, setNewPriceEth] = useState('0.02');

  // 컨트랙트 Owner 주소 조회
  const { data: ownerAddress } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner',
  });

  // 컨트랙트가 보관 중인 ETH 잔액 조회
  const { data: contractBalance, refetch: refetchBalance } = useBalance({
    address: CONTRACT_ADDRESS,
  });

  const { data: withdrawHash, writeContract: writeWithdraw, isPending: isWithdrawing } = useWriteContract();
  const { isLoading: isWaitingWithdraw, isSuccess: isWithdrawSuccess } = useWaitForTransactionReceipt({
    hash: withdrawHash,
  });

  const { data: priceHash, writeContract: writeSetPrice, isPending: isSettingPrice } = useWriteContract();
  const { isLoading: isWaitingPrice, isSuccess: isPriceSuccess } = useWaitForTransactionReceipt({
    hash: priceHash,
  });

  const isOwner = Boolean(
    address && ownerAddress && address.toLowerCase() === (ownerAddress as string).toLowerCase()
  );

  const isCorrectNetwork = chainId === hardhat.id;

  if (!isConnected || !isOwner || !isCorrectNetwork) {
    return null; // Owner가 아니거나 연결되지 않은 경우 노출하지 않음
  }

  const handleWithdraw = () => {
    writeWithdraw({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'withdraw',
    });
  };

  const handleSetPrice = () => {
    if (!newPriceEth || isNaN(Number(newPriceEth))) return;
    writeSetPrice({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'setMintPrice',
      args: [parseEther(newPriceEth)],
    });
  };

  return (
    <div className="bg-amber-950/20 border border-amber-800/60 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="flex items-center justify-between pb-4 border-b border-amber-800/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-amber-200 text-base">관리자(Owner) 전용 제어판</h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700">
                Authorized
              </span>
            </div>
            <p className="text-xs text-amber-400/80">컨트랙트 소유자 지갑으로만 실행 가능한 권한 제어 기능입니다</p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-slate-400">컨트랙트 누적 잔액</span>
          <div className="font-mono text-sm font-bold text-amber-300">
            {contractBalance ? Number(formatUnits(contractBalance.value, contractBalance.decimals)).toFixed(4) : '0.0000'} ETH
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Withdraw Section */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-900/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold mb-1">
              <ArrowDownToLine className="w-4 h-4 text-amber-400" />
              <span>판매 대금 출금 (Withdraw)</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              NFT 판매로 컨트랙트에 모인 모든 ETH를 Owner 지갑으로 즉시 인출합니다.
            </p>
          </div>

          <div>
            {isWithdrawSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 mb-2 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> 출금 트랜잭션이 성공적으로 처리되었습니다.
              </p>
            )}
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isWithdrawing || isWaitingWithdraw || !contractBalance || contractBalance.value === BigInt(0)}
              className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-1.5"
            >
              {isWithdrawing || isWaitingWithdraw ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="w-3.5 h-3.5" />
              )}
              <span>전액 출금 실행</span>
            </button>
          </div>
        </div>

        {/* Set Mint Price Section */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-900/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold mb-1">
              <Settings2 className="w-4 h-4 text-amber-400" />
              <span>민팅 가격 변경 (setMintPrice)</span>
            </div>
            <p className="text-xs text-slate-400 mb-2">
              향후 발행될 NFT의 단가를 온체인에서 실시간으로 변경합니다.
            </p>
          </div>

          <div className="space-y-2">
            {isPriceSuccess && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> 가격 변경이 온체인에 반영되었습니다.
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="number"
                step="0.001"
                value={newPriceEth}
                onChange={(e) => setNewPriceEth(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                placeholder="0.02"
              />
              <button
                type="button"
                onClick={handleSetPrice}
                disabled={isSettingPrice || isWaitingPrice}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-xs border border-amber-800/60 whitespace-nowrap disabled:opacity-50 transition"
              >
                {isSettingPrice || isWaitingPrice ? '반영 중...' : '가격 수정'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
