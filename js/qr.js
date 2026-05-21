// ── qr.js ─────────────────────────────────────────────────────
let qrStream = null;
let qrAnimFrame = null;
let qrOpen = false;
let onResultCallback = null;

// ── Open QR Scanner ───────────────────────────────────────────
export async function openQR(onResult, onError) {
  // Prevent double-open
  if (qrOpen) {
    closeQR();
    await new Promise(r => setTimeout(r, 300));
  }

  qrOpen = true;
  onResultCallback = onResult;

  const overlay = document.getElementById('qrOverlay');
  overlay.classList.add('open');

  // Stop any existing stream first
  stopAllStreams();

  try {
    // Request only ONE camera stream
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
    }

    qrStream = stream;
    const video = document.getElementById('qrVideo');

    // Clear any previous src
    video.srcObject = null;
    video.srcObject = stream;

    await new Promise((res, rej) => {
      video.onloadedmetadata = () => {
        video.play().then(res).catch(rej);
      };
      video.onerror = rej;
    });

    scanLoop(video);

  } catch (e) {
    qrOpen = false;
    overlay.classList.remove('open');
    onError(e);
  }
}

function scanLoop(video) {
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

    if (typeof jsQR === 'undefined') {
      qrAnimFrame = requestAnimationFrame(tick);
      return;
    }

    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth'
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

// ── Close QR Scanner ──────────────────────────────────────────
export function closeQR() {
  qrOpen = false;

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
  // Also stop any orphaned streams on the video element
  const video = document.getElementById('qrVideo');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

// ── Parse QR data ─────────────────────────────────────────────
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
