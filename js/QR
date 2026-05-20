// ── qr.js ─────────────────────────────────────────────────────
let qrStream = null;
let qrAnimFrame = null;
let qrOpen = false;

export function initQR() {
  // jsQR is loaded via script tag in index.html
}

// ── Open QR Scanner ───────────────────────────────────────────
export async function openQR(onResult, onError) {
  if (qrOpen) return;
  qrOpen = true;

  const overlay = document.getElementById('qrOverlay');
  overlay.classList.add('open');

  try {
    // Try rear camera first, fall back to any camera
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    }

    qrStream = stream;
    const video = document.getElementById('qrVideo');
    video.srcObject = stream;

    await new Promise(res => {
      video.onloadedmetadata = () => { video.play(); res(); };
    });

    scanLoop(video, onResult);

  } catch (e) {
    qrOpen = false;
    overlay.classList.remove('open');
    onError(e);
  }
}

function scanLoop(video, onResult) {
  const canvas = document.getElementById('qrCanvas');

  const tick = () => {
    if (!qrOpen) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // jsQR must be loaded globally
    if (typeof jsQR === 'undefined') {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (code && code.data) {
      closeQR();
      onResult(code.data);
      return;
    }

    qrAnimFrame = requestAnimationFrame(tick);
  };

  qrAnimFrame = requestAnimationFrame(tick);
}

// ── Close QR Scanner ──────────────────────────────────────────
export function closeQR() {
  qrOpen = false;

  if (qrAnimFrame) {
    cancelAnimationFrame(qrAnimFrame);
    qrAnimFrame = null;
  }

  if (qrStream) {
    qrStream.getTracks().forEach(t => t.stop());
    qrStream = null;
  }

  const overlay = document.getElementById('qrOverlay');
  if (overlay) overlay.classList.remove('open');
}

// ── Parse QR data ─────────────────────────────────────────────
// Format: orderNo&partNo&qty&lotNo
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
