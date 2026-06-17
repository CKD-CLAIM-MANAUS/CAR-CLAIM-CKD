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
let _stream     = null;   // MediaStream activo (para captura)
let qrOpen      = false;
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

// ── Captura robusta (foto estática + TRY_HARDER) ──────────────
// Decodificação pontual de um frame; NÃO mexe no scan ao vivo (que
// continua a correr). Síncrona e rápida — sem parar a câmara.
export function captureDecode() {
  if (_handled) return true;
  const video = document.getElementById('qrVideo');
  if (!video || !video.videoWidth || typeof ZXing === 'undefined') return false;

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
    return false; // não leu — o scan ao vivo continua a correr normalmente
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
