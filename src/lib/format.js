/**
 * lib/format.js — display formatting helpers (Indonesian locale).
 */

/** 12345 -> "12.450" */
export function formatNumber(n) {
  return new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
}

/** 29000 -> "Rp 29.000" */
export function formatRupiah(n) {
  return `Rp ${formatNumber(n)}`;
}

/** 29000 -> "Rp29.000" (no space, as used on price chips) */
export function formatRupiahTight(n) {
  return `Rp${formatNumber(n)}`;
}

/**
 * Seconds -> "MM:SS" (always two-digit minutes/seconds).
 * Negative values clamp to 00:00.
 */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Seconds -> "2 jam 15 menit" / "45 menit" */
export function formatCountdownHuman(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  if (h > 0) return `${h} jam ${m} menit`;
  if (m > 0) return `${m} menit`;
  return `${s} detik`;
}

/** Time remaining until an ISO date, in seconds. */
export function secondsUntil(isoString) {
  if (!isoString) return 0;
  return Math.max(0, (new Date(isoString).getTime() - Date.now()) / 1000);
}

/** "2 menit lalu" */
export function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.max(0, (Date.now() - new Date(isoString).getTime()) / 1000);

  if (diff < 60) return 'baru saja';
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return `${Math.floor(diff / 604800)} minggu lalu`;
}

/** 0.856 -> "86%" */
export function formatPercent(ratio) {
  if (!isFinite(ratio)) return '0%';
  return `${Math.round((ratio || 0) * 100)}%`;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Today as YYYY-MM-DD in UTC (matches the DB's daily reset). */
export function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}
