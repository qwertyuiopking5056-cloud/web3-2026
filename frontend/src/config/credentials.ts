/**
 * 대한민국 외국인 노동자 국가 공인 자격증 및 비자 식별자 레지스트리 (Phase 2 표준 규격)
 */
export const CREDENTIAL_REGISTRY = [
  {
    code: '0x497f9b28057e6a6e7af4222d2156e6d6ee2c801608410c5026dfd7f4eab06bfa' as `0x${string}`,
    name: 'KR.GOV.VISA.E9.MFG',
    label: 'E-9-비전문취업 (제조업)',
    description: '대한민국 법무부/고용노동부 지정 비전문취업 사증',
  },
  {
    code: '0x9e920ba5a0f22fcee6eed4e8da67d3eaafd2c6f93c9e6040c8857f8eff80186a' as `0x${string}`,
    name: 'KR.GOV.VISA.E7.SHIP',
    label: 'E-7-숙련기능 (조선용접)',
    description: '조선 및 플랜트 특화 숙련기능인력 사증',
  },
  {
    code: '0x4a6a7157a413a21ccecf9fc28d48e22c78d5cc02325ee8bc2dcd376db328de63' as `0x${string}`,
    name: 'KR.HRD.CERT.WELDING.G1',
    label: '용접기능사 1급 (국가공인)',
    description: '한국산업인력공단 주관 국가기술자격',
  },
] as const;

export const CREDENTIAL_LABEL_MAP: Record<string, string> = Object.fromEntries(
  CREDENTIAL_REGISTRY.map((item) => [item.code.toLowerCase(), item.label])
);

export function getCredentialLabel(codeOrType?: string): string {
  if (!codeOrType) return '미등록 자격';
  const lower = codeOrType.toLowerCase();
  return CREDENTIAL_LABEL_MAP[lower] || codeOrType;
}
