'use client';

import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { hardhat } from 'wagmi/chains';
import { formatUnits } from 'viem';
import { useState, useEffect } from 'react';
import { Wallet, LogOut, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function Navbar() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, chainId } = useAccount();
  const { data: balance } = useBalance({ address });
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white">
              dApp
            </div>
            <span className="font-semibold text-lg tracking-tight">Web3 Studio</span>
          </div>
          <div className="h-9 w-32 bg-slate-800 rounded-lg animate-pulse" />
        </div>
      </header>
    );
  }

  const isCorrectNetwork = chainId === hardhat.id;

  const formatAddress = (addr?: string) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-blue-500/20">
            D
          </div>
          <div>
            <span className="font-bold text-base sm:text-lg tracking-tight text-white">
              DigitalAsset <span className="text-blue-400">dApp</span>
            </span>
            <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              v1.0.0
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              {/* Network Status / Switcher */}
              {isCorrectNetwork ? (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hardhat Local (31337)</span>
                </div>
              ) : (
                <button
                  onClick={() => switchChain({ chainId: hardhat.id })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-700 text-amber-300 hover:bg-amber-900/80 text-xs font-semibold transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>로컬 네트워크 전환</span>
                </button>
              )}

              {/* Wallet Info & Balance */}
              <div className="flex items-center bg-slate-800/80 border border-slate-700 rounded-xl p-1 gap-2">
                {balance && (
                  <span className="hidden md:inline-block px-2 text-xs font-mono text-slate-300">
                    {Number(formatUnits(balance.value, balance.decimals)).toFixed(4)} {balance.symbol}
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 font-mono text-xs text-blue-300 font-medium border border-slate-700">
                  {formatAddress(address)}
                </span>
                <button
                  onClick={() => disconnect()}
                  title="지갑 연결 해제"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  disabled={isConnecting}
                  onClick={() => connect({ connector })}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-blue-600/30 transition active:scale-95"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isConnecting ? '연결 중...' : '지갑 연결'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
