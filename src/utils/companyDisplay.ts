/**
 * 후보 중 비어 있지 않은 업체 ID.
 * 없으면 null — 와와 등 특정 업체로 임의 귀속하지 않음.
 */
export function resolveRequiredCompanyId(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const id = (candidate || '').trim();
    if (id) return id;
  }
  return null;
}

/** 업체 표시명 (드롭다운·헤더): '와와주차장', '본사' 등 제거 */
export function formatPartnerDisplayName(name?: string, companyId?: string): string {
  const id = (companyId || '').trim().toLowerCase();
  const raw = (name || '').trim();

  if (id === 'wawa' || id === 'wawa_valet' || raw.includes('와와')) {
    return '와와';
  }
  if (id === 'gayu' || id === 'gayu_partner' || raw.includes('가유')) {
    return '가유';
  }
  if (id === 'airpick') {
    return '에어픽';
  }

  return raw
    .replace(/🏢\s*/g, '')
    .replace(/\(본사\)/g, '')
    .replace(/\(직영\)/g, '')
    .replace(/주차장/g, '')
    .replace(/\s+/g, ' ')
    .trim() || companyId || raw || '업체';
}
