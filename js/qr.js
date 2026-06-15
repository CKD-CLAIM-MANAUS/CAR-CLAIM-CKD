// ── qr.js ─────────────────────────────────────────────────────
// Leitura de QR/Data Matrix/códigos com ZXing (global `ZXing`).
//
// Arquitetura (para não travar o telemóvel):
//  • Scan ao vivo LEVE — sem TRY_HARDER, resolução moderada, intervalo padrão.
//    Lê bem QR nítidos sem sobrecarregar a CPU.
//  • Captura ROBUSTA — ao tocar em "Capturar", para o scan (liberta CPU),
//    tira um frame em resolução nativa e decodifica em modo pesado (TRY_HARDER)
//    de forma síncrona. Ideal para etiquetas amassadas/difíceis.

let _reader     = null;   // BrowserMultiFormatReader (scan ao vivo)
let _stream     = null;   // MediaStream activo (para captura e lanterna)
let qrOpen      = false;
let _torchTrack = null;
let _torchOn    = false;
let _onResult   = null;
let _onError    = null;
let _handled    = false;

// ── Open ──────────────────────────────────────────────────────
export async function openQR(onResult, onError) {
  if (qrOpen) { closeQR(); await new Promise(r => setTimeout(r, 250)); }

  const overlay = document.getElementById('qrOverlay');
  const video   = document.getElementById('qrVideo');
  if (overlay) overlay.classList.add('open');

  if (typeof ZXing === 'undefined') {
    if (overlay) overlay.classList.remove('open');
    onError(new Error('Biblioteca de leitura não carregada. Recarregue a página.'));
    return;
  }

  qrOpen    = true;
  _handled  = false;
  _onResult = onResult;
  _onError  = onError;

  try {
    // Câmara traseira, resolução moderada (1280) e foco contínuo.
    // 1280 é suficiente para QR e não trava como 1920.
    _stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
        advanced: [{ focusMode: 'continuous' }],
      },
    });

    video.srcObject = _stream;
    await video.play().catch(() => {});

    _setupTorch();

    // Scan ao vivo LEVE — reader sem TRY_HARDER, intervalo padrão (500ms)
    _reader = new ZXing.BrowserMultiFormatReader();
    _reader.decodeFromStream(_stream, video, (result) => {
      if (result && !_handled) _accept(result);
    }).catch(() => { /* parado ao fechar — normal */ });

  } catch (e) {
    qrOpen = false;
    if (overlay) overlay.classList.remove('open');
    onError(e);
  }
}

// ── Captura robusta (foto estática + TRY_HARDER, síncrono) ────
export async function captureDecode() {
  if (_handled) return true;
  const video = document.getElementById('qrVideo');
  if (!video || !video.videoWidth || typeof ZXing === 'undefined') return false;

  // Para o scan ao vivo para libertar a CPU para a decodificação pesada
  if (_reader) { try { _reader.stopContinuousDecode(); } catch { /* ignore */ } }

  // Frame em resolução nativa completa
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);

  try {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

    const reader = new ZXing.MultiFormatReader();
    reader.setHints(hints);
    const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
    const result = reader.decode(bitmap);

    _accept(result);
    return true;
  } catch {
    // Não leu — retoma o scan ao vivo para o utilizador tentar de novo
    if (qrOpen && _reader && _stream) {
      _reader.decodeFromStream(_stream, video, (r) => { if (r && !_handled) _accept(r); })
             .catch(() => {});
    }
    return false;
  }
}

// ── Aceita um resultado (scan ou captura) ─────────────────────
function _accept(result) {
  if (_handled) return;
  _handled = true;
  const text = (typeof result.getText === 'function') ? result.getText() : result.text;
  _flashDetected();
  setTimeout(() => { closeQR(); if (_onResult) _onResult(text); }, 400);
}

// ── Lanterna ──────────────────────────────────────────────────
function _setupTorch() {
  const btn = document.getElementById('qrTorchBtn');
  _torchTrack = null; _torchOn = false;
  if (!btn) return;
  const track = _stream && _stream.getVideoTracks ? _stream.getVideoTracks()[0] : null;
  let supported = false;
  try { supported = !!(track && track.getCapabilities && track.getCapabilities().torch); }
  catch { supported = false; }
  if (supported) { _torchTrack = track; btn.style.display = 'flex'; btn.classList.remove('on'); }
  else           { btn.style.display = 'none'; }
}

export async function toggleTorch() {
  if (!_torchTrack) return;
  try {
    _torchOn = !_torchOn;
    await _torchTrack.applyConstraints({ advanced: [{ torch: _torchOn }] });
    const btn = document.getElementById('qrTorchBtn');
    if (btn) btn.classList.toggle('on', _torchOn);
  } catch { /* não suportado */ }
}

// ── Feedback visual ───────────────────────────────────────────
function _flashDetected() {
  const vf   = document.querySelector('#qrOverlay .qr-viewfinder');
  const hint = document.querySelector('#qrOverlay .qr-hint');
  if (vf)   vf.classList.add('qr-detected');
  if (hint) { hint.textContent = '✓ Código reconhecido!'; hint.classList.add('qr-hint-ok'); }
  try { if (navigator.vibrate) navigator.vibrate(120); } catch { /* ignore */ }
}

function _resetFeedback() {
  const vf   = document.querySelector('#qrOverlay .qr-viewfinder');
  const hint = document.querySelector('#qrOverlay .qr-hint');
  if (vf)   vf.classList.remove('qr-detected');
  if (hint) { hint.textContent = 'Aponte para o QR code da etiqueta da peça'; hint.classList.remove('qr-hint-ok'); }
}

// ── Close ─────────────────────────────────────────────────────
export function closeQR() {
  qrOpen = false;

  if (_torchTrack && _torchOn) {
    try { _torchTrack.applyConstraints({ advanced: [{ torch: false }] }); } catch { /* ignore */ }
  }
  _torchTrack = null; _torchOn = false;

  if (_reader) { try { _reader.reset(); } catch { /* ignore */ } _reader = null; }

  if (_stream) {
    try { _stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    _stream = null;
  }

  const overlay = document.getElementById('qrOverlay');
  if (overlay) overlay.classList.remove('open');
  const video = document.getElementById('qrVideo');
  if (video) video.srcObject = null;

  _resetFeedback();
}

// ── Parse QR data — formato: orderNo&partNo&qty&lotNo ─────────
export function parseQRData(data) {
  const parts = data.split('&');
  if (parts.length >= 4) {
    return {
      orderNo: parts[0].trim(),
      partNo:  parts[1].trim(),
      qty:     parts[2].trim(),
      lotNo:   parts[3].trim(),
    };
  }
  return null;
}
