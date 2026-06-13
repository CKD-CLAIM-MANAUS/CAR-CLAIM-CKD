// ── qr.js ─────────────────────────────────────────────────────
let qrStream = null;
let qrAnimFrame = null;
let qrOpen = false;
let onResultCallback = null;

// ── Open QR Scanner ───────────────────────────────────────────
export async function openQR(onResult, onError) {
  if (qrOpen) {
    closeQR();
    await new Promise(r => setTimeout(r, 300));
  }

  qrOpen = true;
  onResultCallback = onResult;

  const overlay = document.getElementById('qrOverlay');
  overlay.classList.add('open');

  stopAllStreams();

  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          // Resolução alta — QR de peça (pack list) são densos e precisam
          // de detalhe suficiente para decodificar
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    qrStream = stream;
    const video = document.getElementById('qrVideo');
    video.srcObject = null;
    video.srcObject = stream;

    await new Promise((res, rej) => {
      video.onloadedmetadata = () => { video.play().then(res).catch(rej); };
      video.onerror = rej;
    });

    scanLoop(video);

  } catch (e) {
    qrOpen = false;
    overlay.classList.remove('open');
    onError(e);
  }
}

// ── Scan loop — corre a cada frame mas só processa 1 em cada 3 ─
let frameCount = 0;
const canvas = document.createElement('canvas');  // canvas reutilizável fora do DOM

function scanLoop(video) {
  const tick = () => {
    if (!qrOpen) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    // Só processa 1 em cada 4 frames (resolução alta é mais pesada para jsQR)
    frameCount++;
    if (frameCount % 4 !== 0) {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    // Usa resolução alta (até 1280 de largura) — QR de peça densos precisam
    // de detalhe; abaixo disto o jsQR não os decodifica
    const maxW   = 1280;
    const scale  = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
    const scanW  = Math.round(video.videoWidth  * scale);
    const scanH  = Math.round(video.videoHeight * scale);
    canvas.width  = scanW;
    canvas.height = scanH;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, scanW, scanH);

    const imageData = ctx.getImageData(0, 0, scanW, scanH);

    if (typeof jsQR === 'undefined') {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'  // tenta normal e invertido — mais robusto
    });

    if (code && code.data) {
      const result = code.data;
      closeQR();
      if (onResultCallback) onResultCallback(result);
      return;
    }

    qrAnimFrame = requestAnimationFrame(tick);
  };

  qrAnimFrame = requestAnimationFrame(tick);
}

// ── Close ─────────────────────────────────────────────────────
export function closeQR() {
  qrOpen = false;
  frameCount = 0;

  if (qrAnimFrame) {
    cancelAnimationFrame(qrAnimFrame);
    qrAnimFrame = null;
  }

  stopAllStreams();

  const overlay = document.getElementById('qrOverlay');
  if (overlay) overlay.classList.remove('open');

  const video = document.getElementById('qrVideo');
  if (video) video.srcObject = null;
}

function stopAllStreams() {
  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }
  const video = document.getElementById('qrVideo');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
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
