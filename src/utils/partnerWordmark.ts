/** 「가유 주차대행」 → 「가유」 */
export function shortPartnerName(name: string) {
  return (
    name.replace(/\s*(주차대행|주차|발렛파킹|발렛)\s*$/u, '').trim() || name.trim() || 'P'
  );
}

/** 헤더 마크용 1~2글자 */
export function partnerMarkText(name: string) {
  const chars = [...shortPartnerName(name).replace(/\s+/g, '')];
  if (chars.length === 0) return 'P';
  if (chars.length <= 2) return chars.join('');
  return chars.slice(0, 2).join('');
}
