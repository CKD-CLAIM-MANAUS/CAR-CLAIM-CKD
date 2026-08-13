// ── camera.js ─────────────────────────────────────────────────
import { auth } from './firebase.js';

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
let cameraOpening = false; // trava contra abertura dupla (duplo-toque no botão)

// ── Compress image ────────────────────────────────────────────
// Caminho rápido: createImageBitmap decodifica FORA da main thread (o decode
// da foto é a parte mais cara e o que mais travava a UI) e já aplica a
// orientação EXIF. Fallback para FileReader+Image em browsers/formatos sem
// suporte (ex.: HEIC no Chrome).
export async function compressImage(file, maxW = 1280) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    let w = bitmap.width, h = bitmap.height;
    if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close(); // liberta a memória do bitmap decodificado

    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) throw new Error('toBlob vazio');
    const compFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    const dataUrl  = URL.createObjectURL(blob); // preview leve (sem base64 gigante)
    return { dataUrl, compFile };
  } catch {
    // Sem createImageBitmap ou formato não decodificável por ele → método antigo
    return _compressImageLegacy(file, maxW);
  }
}

// Método antigo (FileReader + Image) — rede de segurança
function _compressImageLegacy(file, maxW = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Falha ao processar a imagem')); return; }
          const compFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          const dataUrl  = URL.createObjectURL(blob);
          resolve({ dataUrl, compFile });
        }, 'image/jpeg', 0.8);
      };
      img.onerror = () => reject(new Error('Falha ao ler a imagem'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o ficheiro'));
    reader.readAsDataURL(file);
  });
}

// ── Upload to Cloudinary (signed) ─────────────────────────────
// O servidor assina o upload com o segredo Cloudinary; o preset público
// (unsigned) foi desactivado. Sem assinatura do servidor não há upload.
const SIGN_URL = 'https://car-claim-manaus.onrender.com/sign-upload';

// fetch com timeout (AbortController) — impede que um upload fique preso para
// sempre quando o backend Render está a acordar (cold start) ou a rede falha.
// Sem isto, o "A guardar..." podia ficar congelado indefinidamente.
async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Pede a assinatura ao backend. Tenta 2x: o plano free hiberna e a 1ª chamada
// pode expirar no cold start; a 2ª já apanha o servidor a acordar.
async function getUploadSignature(token) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithTimeout(SIGN_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }, 45000);
      if (!res.ok) throw new Error('Falha ao autorizar o upload da foto');
      return await res.json();
    } catch (e) {
      if (attempt === 2) {
        throw new Error('O servidor demorou a responder. Tente guardar novamente em alguns segundos.');
      }
      // 1ª tentativa falhou (provável cold start) → repete
    }
  }
}

export async function uploadPhoto(file) {
  // Bloqueia uploads sem sessão Firebase activa
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  // 1. Pede uma assinatura ao servidor (autenticado com token Firebase)
  const token = await auth.currentUser.getIdToken();
  const { signature, timestamp, apiKey, folder, allowedFormats, cloudName } =
    await getUploadSignature(token);

  // 2. Upload assinado ao Cloudinary
  // allowed_formats tem de ser enviado tal como foi assinado pelo servidor.
  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', apiKey);
  fd.append('timestamp', timestamp);
  fd.append('folder', folder);
  if (allowedFormats) fd.append('allowed_formats', allowedFormats);
  fd.append('signature', signature);
  const res = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd },
    90000
  );
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

// ── Preview instantâneo + upload em 2º plano ──────────────────
// A foto aparece NA HORA (imagem local) e o upload corre em segundo
// plano, sem travar. Se o upload não terminar antes de guardar, o
// incidente é salvo na mesma (a foto sobe ao guardar — isNew:true).
async function uploadAndAdd(file, localPreview, onPhoto) {
  const photo = { url: localPreview, localPreview, isNew: true, file, _uploading: true };
  onPhoto(photo); // aparece imediatamente na grelha

  try {
    const result = await uploadPhoto(file);
    photo.url      = result.url;
    photo.publicId = result.publicId;
    photo.isNew    = false; // já no Cloudinary → não re-envia ao guardar
  } catch (e) {
    // Falhou agora — mantém isNew:true e sobe ao guardar o incidente
    console.warn('Upload em 2º plano falhou:', e.message);
  } finally {
    photo._uploading = false;
    // Atualiza a grelha (estado final da foto)
    if (window._refreshPhotoGrid) window._refreshPhotoGrid();
  }
}

// ── Open native camera com preview ───────────────────────────
export async function openCamera(onCapture, onError) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    onError(new Error('Camera API not supported'));
    return;
  }
  // Limpa qualquer overlay/stream anterior e evita corrida de duplo-toque
  // (dois overlays com o mesmo id ficavam presos na tela ao fechar).
  closeCamera();
  if (cameraOpening) return;
  cameraOpening = true;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });

    const overlay = createCameraOverlay(
      cameraStream,
      async (canvas) => {
        closeCamera();
        try {
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
        } catch (err) {
          // Falha ao processar a captura — a câmera já foi fechada acima.
          console.warn('Captura falhou:', err);
          showFileError('❌ Não foi possível processar a foto. Tente de novo.');
        }
      },
      () => { closeCamera(); }
    );

    document.body.appendChild(overlay);

  } catch (e) {
    console.warn('getUserMedia failed:', e.message);
    onError(e);
  } finally {
    cameraOpening = false;
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
  // Remove TODOS os overlays de câmera — defensivo contra duplicados que
  // ficavam presos na tela (getElementById só removia um). Para também o
  // stream de cada <video>, garantindo que a câmera/LED desliga mesmo em
  // overlays que perderam a referência global.
  document.querySelectorAll('#cameraOverlay').forEach(el => {
    el.querySelectorAll('video').forEach(v => {
      const s = v.srcObject;
      if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
      v.srcObject = null;
    });
    el.remove();
  });
}
