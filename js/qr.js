// ── qr.js ─────────────────────────────────────────────────────
// Leitura de QR/códigos com ZXing (@zxing/library, carregado via CDN
// como global `ZXing`). Mais robusto que jsQR com códigos impressos,
// em ângulo ou com foco imperfeito; também lê Data Matrix e barras.

let _reader  = null;   // instância BrowserMultiFormatReader
let qrOpen   = false;

// ── Open QR Scanner ───────────────────────────────────────────
export async function openQR(onResult, onError) {
  if (qrOpen) { closeQR(); await new Promise(r => setTimeout(r, 300)); }

  const overlay = document.getElementById('qrOverlay');
  const video   = document.getElementById('qrVideo');
  if (overlay) overlay.classList.add('open');

  if (typeof ZXing === 'undefined') {
    if (overlay) overlay.classList.remove('open');
    onError(new Error('Biblioteca de leitura não carregada. Recarregue a página.'));
    return;
  }

  qrOpen = true;
  let _handled = false;

  try {
    // Hints: TRY_HARDER aumenta muito a taxa de leitura (mais esforço por frame)
    const hints = new Map();
    try { hints.set(ZXing.DecodeHintType.TRY_HARDER, true); } catch { /* ignore */ }

    // Intervalo curto entre tentativas (200ms em vez de 500ms) → tenta mais vezes
    _reader = new ZXing.BrowserMultiFormatReader(hints, 200);

    // Câmara traseira, resolução alta e foco contínuo — essenciais para QR
    // impressos/densos focarem e decodificarem de forma consistente
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
        advanced: [{ focusMode: 'continuous' }],
      },
    };

    await _reader.decodeFromConstraints(constraints, video, (result, err) => {
      if (result && !_handled) {
        _handled = true;
        const text = (typeof result.getText === 'function') ? result.getText() : result.text;
        _flashDetected();             // feedback: vibração + moldura verde + texto
        setTimeout(() => {            // breve instante para o utilizador ver que reconheceu
          closeQR();
          if (onResult) onResult(text);
        }, 400);
      }
      // err em cada frame sem código (NotFoundException) é normal — ignora-se
    });
  } catch (e) {
    qrOpen = false;
    if (overlay) overlay.classList.remove('open');
    onError(e);
  }
}

// ── Feedback ao reconhecer um código ──────────────────────────
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

  if (_reader) {
    try { _reader.reset(); } catch { /* ignore */ }
    _reader = null;
  }

  const overlay = document.getElementById('qrOverlay');
  if (overlay) overlay.classList.remove('open');

  const video = document.getElementById('qrVideo');
  if (video && video.srcObject) {
    try { video.srcObject.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
    video.srcObject = null;
  }

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
