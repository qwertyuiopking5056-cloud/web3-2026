'use client';

import { useState, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { IssuerPortal } from '@/components/IssuerPortal';
import { WorkerCredentialCard } from '@/components/WorkerCredentialCard';
import { VerifierPortal } from '@/components/VerifierPortal';
import { ContractOverview } from '@/components/ContractOverview';
import { MintPanel } from '@/components/MintPanel';
import { UserAssetsGallery } from '@/components/UserAssetsGallery';
import { AdminPanel } from '@/components/AdminPanel';
import { Award, UserCheck, ShieldCheck, Layers, BookOpen, Copy, Check } from 'lucide-react';

export default function HomePage() {
  const [activeRole, setActiveRole] = useState<'issuer' | 'worker' | 'verifier' | 'nft'>('issuer');
  const [refreshKey, setRefreshKey] = useState(0);
  const [copiedKey, setCopiedKey] = useState(false);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const sampleIssuerPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Account #0 (Admin & Issuer)
  const sampleWorkerPrivateKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // Account #1 (Worker)

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Header */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-semibold mb-3">
              <Award className="w-3.5 h-3.5" />
              <span>SBT (Soulbound Token) 기반 신원 및 자격 검증 시스템</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
              외국인 노동자 자격 증명 <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                온체인 발급 및 암호학적 진위 검증
              </span>
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-400 leading-relaxed">
              양도가 불가능한 Soulbound 토큰(ERC-721 기반)과 AccessControl 권한 체계, SIWE 기반 챌린지-응답 서명 검증을 결합하여
              비자 및 기술 자격의 위변조·대여행위를 원천 방어합니다.
            </p>
          </div>
        </section>

        {/* 역할별 포털 전환 탭 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveRole('issuer')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
              activeRole === 'issuer'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>1. 발급기관 포털 (Issuer)</span>
          </button>

          <button
            onClick={() => setActiveRole('worker')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
              activeRole === 'worker'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>2. 노동자 자격증 지갑 (Worker)</span>
          </button>

          <button
            onClick={() => setActiveRole('verifier')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
              activeRole === 'verifier'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>3. 고용주/출입국 검증 (Verifier)</span>
          </button>

          <button
            onClick={() => setActiveRole('nft')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
              activeRole === 'nft'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>4. 기존 NFT 샌드박스</span>
          </button>
        </div>

        {/* 역할별 포털 본문 */}
        <section>
          {activeRole === 'issuer' && (
            <IssuerPortal onIssueSuccess={handleRefresh} />
          )}

          {activeRole === 'worker' && (
            <WorkerCredentialCard />
          )}

          {activeRole === 'verifier' && (
            <VerifierPortal />
          )}

          {activeRole === 'nft' && (
            <div className="space-y-8">
              <ContractOverview key={`overview-${refreshKey}`} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 flex flex-col">
                  <MintPanel onMintSuccess={handleRefresh} />
                </div>
                <div className="lg:col-span-7 flex flex-col">
                  <UserAssetsGallery refreshTrigger={refreshKey} />
                </div>
              </div>
              <AdminPanel onActionSuccess={handleRefresh} />
            </div>
          )}
        </section>

        {/* 온보딩 및 테스트 가이드 */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
            <BookOpen className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-base">SBT 종단간(E2E) 시나리오 테스트 가이드</h3>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Step 1 */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-mono text-[11px]">1</span>
                발급기관 계정 (Account #0)
              </span>
              <p className="text-slate-400 leading-relaxed">
                컨트랙트 배포자이자 `ISSUER_ROLE`이 부여된 관리자 계정입니다. 노동자 주소를 지정해 자격증을 발급합니다.
              </p>
              <button
                onClick={() => copyKey(sampleIssuerPrivateKey)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-blue-300 hover:border-slate-600 transition"
              >
                <span>발급기관 개인키 복사</span>
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-mono text-[11px]">2</span>
                노동자 수신 계정 (Account #1)
              </span>
              <p className="text-slate-400 leading-relaxed">
                자격증을 부여받는 노동자 계정입니다. 발급된 자격증을 확인하고 타인에게 양도 불가함을 검증합니다.
              </p>
              <button
                onClick={() => copyKey(sampleWorkerPrivateKey)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-purple-300 hover:border-slate-600 transition"
              >
                <span>노동자 개인키 복사</span>
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center font-mono text-[11px]">3</span>
                고용주/출입국 암호 검증
              </span>
              <p className="text-slate-400 leading-relaxed">
                노동자가 생성한 챌린지 서명 페이로드를 검증자 포털에 입력하여 온체인 유효기간 및 위변조 여부를 실시간 확인합니다.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        <p>Worker Credential SBT Platform &copy; 2026. Built with Next.js 16, OpenZeppelin v5 AccessControl, Wagmi & Viem.</p>
      </footer>
    </div>
  );
}
