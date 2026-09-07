/** 数字格式化：1.23M / 456K / 1.2B */
export function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
}

/** ISK 完整显示（千分位） */
export function fmtIsk(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0 ISK';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 }) + ' ISK';
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('zh-CN');
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}
