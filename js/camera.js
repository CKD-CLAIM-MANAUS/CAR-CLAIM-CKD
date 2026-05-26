// ── camera.js ─────────────────────────────────────────────────

const MAX_FILE_SIZE  = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES  = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

function showFileError(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

let cameraStream = null;

// ── Compress image ────────────────────────────────────────────
export async function compressImage(file, maxW = 1600, maxKB = 900) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let quality = 0.82;
        const encode = () => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const kb = (dataUrl.length * 3 / 4) / 1024;
          if (kb > maxKB && quality > 0.35) { quality -= 0.1; encode(); return; }
          const byteStr = atob(dataUrl.split(',')[1]);
          const arr = new Uint8Array(byteStr.length);
          for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
          const blob = new Blob([arr], { type: 'image/jpeg' });
          const compFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve({ dataUrl, compFile });
        };
        encode();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Upload to Cloudinary ──────────────────────────────────────
export async function uploadPhoto(file) {
  const cloudName    = 'dos2jsgzg';
  const uploadPreset = 'Garantia CAR';
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', uploadPreset);
  fd.append('folder', 'garantia-car');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST', body: fd
  });
  if (!res.ok) throw new Error('Falha no upload da foto');
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}

// ── Preview overlay — mostra foto antes de confirmar ─────────
function showPhotoPreview(dataUrl, onConfirm, onRetry, onCancel) {
  const overlay = document.createElement('div');
  overlay.id = 'photoPreviewOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: #000; z-index: 600;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  `;

  overlay.innerHTML = `
    <div style="position:relative; width:100%; max-width:500px; flex:1; display:flex; align-items:center; justify-content:center; padding:16px;">
      <img src="${dataUrl}" style="max-width:100%; max-height:75vh; border-radius:10px; object-fit:contain;" alt="Preview">
    </div>
    <div style="padding:20px 24px 36px; width:100%; max-width:500px; display:flex; flex-direction:column; gap:10px;">
      <div style="text-align:center; font-size:13px; color:rgba(255,255,255,0.5); margin-bottom:4px;">Confirmar esta foto?</div>
      <div style="display:flex; gap:10px;">
        <button id="previewRetry" style="
          flex:1; padding:14px; border-radius:10px; border:1.5px solid rgba(255,255,255,0.15);
          background:transparent; color:rgba(255,255,255,0.7); font-size:14px; font-weight:600;
          cursor:pointer; font-family:var(--font-sans);">
          🔄 Tentar outra vez
        </button>
        <button id="previewConfirm" style="
          flex:2; padding:14px; border-radius:10px; border:none;
          background:#1A56CC; color:white; font-size:14px; font-weight:700;
          cursor:pointer; font-family:var(--font-sans);">
          ✓ Usar esta foto
        </button>
      </div>
      <button id="previewCancel" style="
        width:100%; padding:11px; border-radius:10px; border:none;
        background:transparent; color:rgba(255,255,255,0.35); font-size:13px;
        cursor:pointer; font-family:var(--font-sans);">
        Cancelar
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('previewConfirm').onclick = () => { overlay.remove(); onConfirm(); };
  document.getElementById('previewRetry').onclick   = () => { overlay.remove(); onRetry(); };
  document.getElementById('previewCancel').onclick  = () => { overlay.remove(); onCancel(); };
}

// ── Process files from gallery — com preview ─────────────────
export async function processFiles(files, onPhoto) {
  for (const file of Array.from(files)) {
    await processOneFile(file, onPhoto);
  }
}

async function processOneFile(file, onPhoto) {
  // Validação de tipo
  if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
    showFileError(`❌ Formato não suportado: ${file.type || 'desconhecido'}. Use JPG, PNG ou WebP.`);
    return;
  }
  // Validação de tamanho (10 MB)
  if (file.size > MAX_FILE_SIZE) {
    showFileError(`❌ Foto demasiado grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 10 MB.`);
    return;
  }

  try {
    const { dataUrl, compFile } = await compressImage(file);

    // Mostra preview e espera confirmação
    await new Promise((resolve) => {
      showPhotoPreview(
        dataUrl,
        // Confirmar — faz upload imediato
        async () => {
          await uploadAndAdd(compFile, dataUrl, onPhoto);
          resolve();
        },
        // Tentar outra vez — abre galeria novamente
        () => {
          document.getElementById('galleryInput')?.click();
          resolve();
        },
        // Cancelar
        () => resolve()
      );
    });
  } catch {
    const reader = new FileReader();
    await new Promise(res => {
      reader.onload = async (ev) => {
        onPhoto({ url: ev.target.result, localPreview: ev.target.result, isNew: true, file });
        res();
      };
      reader.readAsDataURL(file);
    });
  }
}

// ── Upload imediato e adiciona à lista ────────────────────────
async function uploadAndAdd(file, localPreview, onPhoto) {
  // Adiciona placeholder com estado "a enviar"
  const tempId = 'temp_' + Date.now();

  // Mostra toast de progresso
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = '⏳ A enviar foto...';
    toast.classList.add('visible');
  }

  try {
    const result = await uploadPhoto(file);
    if (toast) toast.classList.remove('visible');
    onPhoto({ url: result.url, publicId: result.publicId, localPreview, isNew: false });
  } catch (e) {
    if (toast) {
      toast.textContent = '❌ Erro no upload. Tenta novamente.';
      setTimeout(() => toast.classList.remove('visible'), 3000);
    }
    // Adiciona mesmo assim com flag isNew para tentar upload ao guardar
    onPhoto({ url: localPreview, localPreview, isNew: true, file });
  }
}

// ── Open native camera com preview ───────────────────────────
export async function openCamera(onCapture, onError) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    onError(new Error('Camera API not supported'));
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });

    const overlay = createCameraOverlay(
      cameraStream,
      async (canvas) => {
        closeCamera();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const byteStr = atob(dataUrl.split(',')[1]);
        const arr = new Uint8Array(byteStr.length);
        for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
        const blob = new Blob([arr], { type: 'image/jpeg' });
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const { dataUrl: compUrl, compFile } = await compressImage(file);

        // Mostra preview antes de confirmar
        showPhotoPreview(
          compUrl,
          // Confirmar — upload imediato
          async () => { await uploadAndAdd(compFile, compUrl, onCapture); },
          // Tentar outra vez — reabre câmera
          () => { openCamera(onCapture, onError); },
          // Cancelar
          () => {}
        );
      },
      () => { closeCamera(); }
    );

    document.body.appendChild(overlay);

  } catch (e) {
    console.warn('getUserMedia failed:', e.message);
    onError(e);
  }
}

function createCameraOverlay(stream, onCapture, onClose) {
  const overlay = document.createElement('div');
  overlay.id = 'cameraOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; background: #000; z-index: 500;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  `;

  const video = document.createElement('video');
  video.autoplay = true; video.playsInline = true; video.muted = true;
  video.srcObject = stream;
  video.style.cssText = 'width: 100%; max-height: 80vh; object-fit: cover;';

  const canvas = document.createElement('canvas');
  canvas.style.display = 'none';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex; gap:20px; padding:24px; align-items:center;';

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;color:white;font-size:22px;cursor:pointer;`;
  closeBtn.onclick = onClose;

  const captureBtn = document.createElement('button');
  captureBtn.style.cssText = `width:72px;height:72px;border-radius:50%;background:white;border:4px solid rgba(255,255,255,0.5);cursor:pointer;box-shadow:0 0 0 3px rgba(255,255,255,0.3);`;
  captureBtn.onclick = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    onCapture(canvas);
  };

  btnRow.appendChild(closeBtn);
  btnRow.appendChild(captureBtn);
  overlay.appendChild(video);
  overlay.appendChild(canvas);
  overlay.appendChild(btnRow);
  return overlay;
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
  document.getElementById('cameraOverlay')?.remove();
}
