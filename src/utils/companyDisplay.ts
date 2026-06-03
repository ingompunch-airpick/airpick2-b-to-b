/** 업체 표시명 (드롭다운·헤더): '와와주차장', '본사' 등 제거 */
export function formatPartnerDisplayName(name?: string, companyId?: string): string {
  const id = (companyId || '').trim().toLowerCase();
  const raw = (name || '').trim();

  if (id === 'wawa' || id === 'wawa_valet' || raw.includes('와와')) {
    return '와와';
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
