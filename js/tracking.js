// ── tracking.js — 17track in-app tracking ─────────────────────
//  API docs: https://api.17track.net/en/doc

const API_BASE = 'https://api.17track.net/track/v2.2';
const KEY_STORAGE = 'track17_api_key';

// ── API key (guardado em localStorage) ────────────────────────
export function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || '';
}

export function saveApiKey(key) {
  localStorage.setItem(KEY_STORAGE, key.trim());
}

export function clearApiKey() {
  localStorage.removeItem(KEY_STORAGE);
}

// ── Carrier codes comuns ───────────────────────────────────────
// 0 = auto-detect (17track detecta automaticamente)
const CARRIER_AUTO = 0;

// ── Registar tracking number (obrigatório antes de gettrackinfo)
async function registerTracking(trackNum, apiKey) {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '17token': apiKey,
    },
    body: JSON.stringify([{ number: trackNum, carrier: CARRIER_AUTO }]),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Accepted ou Already registered — ambos são OK
  const code = json.code ?? 0;
  if (code !== 0) throw new Error(`17track register error: code ${code}`);
  return json;
}

// ── Obter info de tracking ─────────────────────────────────────
async function getTrackInfo(trackNum, apiKey) {
  const res = await fetch(`${API_BASE}/gettrackinfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      '17token': apiKey,
    },
    body: JSON.stringify([{ number: trackNum, carrier: CARRIER_AUTO }]),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(`17track error: code ${json.code}`);
  return json;
}

// ── Mapa de status code → texto legível ───────────────────────
const TRACK_STATUS_MAP = {
  0:   { label: 'Não rastreado',      icon: '❓', color: '#6B7280' },
  10:  { label: 'Em trânsito',        icon: '🚚', color: '#3B82F6' },
  20:  { label: 'Expirado',           icon: '⚠️', color: '#9CA3AF' },
  30:  { label: 'Entregue',           icon: '✅', color: '#22C55E' },
  35:  { label: 'Não entregue',       icon: '❌', color: '#EF4444' },
  40:  { label: 'Devolvido',          icon: '↩️', color: '#F59E0B' },
  50:  { label: 'Pronto p/ retirada', icon: '📦', color: '#84CC16' },
  60:  { label: 'Alerta',             icon: '⚠️', color: '#F97316' },
  65:  { label: 'Entrega falhada',    icon: '❌', color: '#EF4444' },
  70:  { label: 'Devolvido remetente',icon: '↩️', color: '#F59E0B' },
  80:  { label: 'Entregue confirmado',icon: '✅', color: '#22C55E' },
};

// ── Parsear resposta da API ────────────────────────────────────
export function parseTrackInfo(json) {
  const accepted = json?.data?.accepted;
  if (!accepted || accepted.length === 0) {
    const rejected = json?.data?.rejected;
    if (rejected && rejected.length > 0) {
      const errCode = rejected[0]?.error?.code;
      if (errCode === -18019902) throw new Error('Número de tracking inválido ou não suportado.');
      throw new Error(`Tracking rejeitado (código ${errCode}).`);
    }
    throw new Error('Sem dados de tracking.');
  }

  const item   = accepted[0];
  const track  = item.track || {};
  const e1     = track.e ?? track.b ?? 0; // estado principal
  const stInfo = TRACK_STATUS_MAP[e1] || { label: `Estado ${e1}`, icon: '📦', color: '#6B7280' };

  // Carrier detectado
  const carrier = item.carrier || item['carrier_name'] || track.ca_name || track.carrier_name || '';
  const trackNo  = item.number || '';

  // Eventos (timeline)
  const events = (track.z || []).map(ev => ({
    date:     ev.a || '',   // data/hora
    desc:     ev.z || '',   // descrição
    location: ev.c || '',   // localização
    status:   ev.d || '',   // sub-status
  }));

  // Data estimada de entrega
  const etaRaw = track.f || null;

  return {
    statusCode:  e1,
    statusLabel: stInfo.label,
    statusIcon:  stInfo.icon,
    statusColor: stInfo.color,
    carrier,
    trackNo,
    etaDate: etaRaw,
    events,          // mais recente primeiro (API já ordena assim)
    raw: json,
  };
}

// ── Função principal: registar + obter info ───────────────────
export async function fetchTrackInfo(trackNum, apiKey) {
  if (!trackNum) throw new Error('Número de tracking em falta.');
  if (!apiKey)   throw new Error('API key 17track em falta.');

  // Passo 1: registar (silencia erros de "já registado")
  try { await registerTracking(trackNum, apiKey); } catch { /* já registado ou timeout — continua */ }

  // Passo 2: obter info
  const json = await getTrackInfo(trackNum, apiKey);
  return parseTrackInfo(json);
}
