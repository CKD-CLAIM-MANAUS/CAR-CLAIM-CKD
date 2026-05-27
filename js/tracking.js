// ── tracking.js — smart carrier detection ─────────────────────

// ── Detecta o carrier pelo formato do número ──────────────────
export function detectCarrier(trackNum) {
  const t = (trackNum || '').trim().toUpperCase().replace(/\s/g, '');
  if (!t) return 'generic';

  // UPS — começa com 1Z
  if (/^1Z[A-Z0-9]{16}$/.test(t)) return 'ups';

  // DHL Express — começa com JD + 18 dígitos, ou pares de letras
  if (/^JD\d{18}$/.test(t)) return 'dhl';
  if (/^(GM|LX|RX|CP|CJ|CA)\d{9,}$/.test(t)) return 'dhl';

  // FedEx — 12, 15 ou 20 dígitos puros
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20}$/.test(t)) return 'fedex';
  // FedEx — prefixos conhecidos (96xx, 98xx, 74xx, 7489xx…)
  if (/^(96\d{20}|98\d{16}|74\d{10,})$/.test(t)) return 'fedex';

  // Fallback — 17track suporta todos os carriers
  return 'generic';
}

// ── Nome legível do carrier ────────────────────────────────────
export function getCarrierLabel(trackNum) {
  const map = { fedex: 'FedEx', ups: 'UPS', dhl: 'DHL', generic: '17track' };
  return map[detectCarrier(trackNum)] || '17track';
}

// ── URL de tracking do carrier certo ──────────────────────────
export function getTrackingUrl(trackNum) {
  const enc = encodeURIComponent((trackNum || '').trim());
  switch (detectCarrier(trackNum)) {
    case 'fedex': return `https://www.fedex.com/fedextrack/?trknbr=${enc}`;
    case 'ups':   return `https://www.ups.com/track?tracknum=${enc}&loc=pt_BR`;
    case 'dhl':   return `https://www.dhl.com/pt-br/home/rastrear-e-rastrear.html?tracking-id=${enc}`;
    default:      return `https://t.17track.net/pt#nums=${enc}`;
  }
}
