from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth as fb_auth
import openpyxl
from openpyxl.drawing.image import Image as XLImage
from datetime import datetime
import os, io, tempfile
import urllib.request
import urllib.parse
import json
import re
from PIL import Image as PILImage

# ── Firebase Admin SDK ────────────────────────────────────────
# Credenciais definidas como variável de ambiente no Railway
_firebase_initialized = False
_firebase_init_error  = None
_cred_json = os.environ.get('FIREBASE_ADMIN_CREDENTIALS')
if _cred_json:
    try:
        _cred = credentials.Certificate(json.loads(_cred_json))
        firebase_admin.initialize_app(_cred)
        _firebase_initialized = True
        print('Firebase Admin: inicializado com sucesso')
    except Exception as _e:
        _firebase_init_error = str(_e)
        print(f'Firebase Admin ERRO: {_e}')
else:
    _firebase_init_error = 'FIREBASE_ADMIN_CREDENTIALS nao definido'
    print('Firebase Admin: variavel FIREBASE_ADMIN_CREDENTIALS em falta')

# ── App & CORS ────────────────────────────────────────────────
ALLOWED_ORIGIN  = os.environ.get('ALLOWED_ORIGIN', 'https://ckd-claim-manaus.github.io')
CLOUDINARY_BASE = 'https://res.cloudinary.com/dos2jsgzg/'
TEMPLATE_PATH   = os.path.join(os.path.dirname(__file__), 'template.xlsx')

app = Flask(__name__)
CORS(app,
     origins=[ALLOWED_ORIGIN],
     methods=['GET', 'POST', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization'])

# ── Auth ──────────────────────────────────────────────────────
def verify_token():
    """Verifica o Firebase ID token no header Authorization: Bearer <token>"""
    if not _firebase_initialized:
        print(f'verify_token: Firebase nao inicializado — {_firebase_init_error}')
        return None
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        print('verify_token: header Authorization ausente ou mal formado')
        return None
    token = header.split('Bearer ', 1)[1].strip()
    try:
        return fb_auth.verify_id_token(token)
    except Exception as e:
        print(f'verify_token: token invalido — {e}')
        return None

# ── Validação ─────────────────────────────────────────────────
def is_valid_cloudinary_url(url):
    """Aceita apenas URLs do Cloudinary do projeto."""
    if not url or not isinstance(url, str):
        return False
    return url.startswith(CLOUDINARY_BASE)

def sanitize_str(value, max_len=500):
    if not value:
        return ''
    return str(value).strip()[:max_len]

def sanitize_int(value, default=1, min_val=0, max_val=9999):
    try:
        v = int(value if value is not None else default)
        return max(min_val, min(max_val, v))
    except (TypeError, ValueError):
        return default

# ── Tradução ──────────────────────────────────────────────────
def translate_to_english(text):
    if not text:
        return ''
    text = text.strip()
    pt_words = ['de', 'do', 'da', 'em', 'no', 'na', 'ao', 'foi', 'com', 'para',
                'uma', 'um', 'que', 'por', 'nossa', 'nosso', 'este', 'esta',
                'detectamos', 'modelo', 'durante', 'processo', 'item', 'danos']
    is_portuguese = sum(1 for w in pt_words if f' {w} ' in f' {text.lower()} ') >= 2
    if not is_portuguese:
        return text.upper()
    try:
        params = urllib.parse.urlencode({
            'client': 'gtx', 'sl': 'pt', 'tl': 'en', 'dt': 't', 'q': text
        })
        url = f'https://translate.googleapis.com/translate_a/single?{params}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode('utf-8'))
            translated = ''.join([item[0] for item in result[0] if item[0]])
            return translated.upper()
    except Exception as e:
        print(f'Translation error: {e}')
        return text.upper()

# ── Processamento de imagem ───────────────────────────────────
def download_and_process(url, width, height):
    """Baixa imagem apenas de URLs Cloudinary e processa com Pillow."""
    if not is_valid_cloudinary_url(url):
        print(f'URL rejeitada (não Cloudinary): {url}')
        return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as response:
            img_data = response.read()
        print(f'Downloaded {len(img_data)} bytes')
        img = PILImage.open(io.BytesIO(img_data))
        if img.mode in ('RGBA', 'P', 'LA'):
            img = img.convert('RGB')
        img.thumbnail((width, height), PILImage.LANCZOS)
        tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        img.save(tmp.name, 'JPEG', quality=85)
        tmp.close()
        print(f'Processed image: {img.size} -> saved to {tmp.name}')
        return tmp.name
    except Exception as e:
        print(f'Image processing error: {e}')
        return None

# ── Rotas ─────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'pillow': PILImage.__version__,
        'firebase_initialized': _firebase_initialized,
        'firebase_error': _firebase_init_error
    })

@app.route('/generate-car', methods=['POST'])
def generate_car():
    # 1. Autenticação obrigatória
    user_token = verify_token()
    if not user_token:
        return jsonify({'error': 'Não autorizado. Faça login novamente.'}), 401

    tmp_files = []
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({'error': 'Dados inválidos.'}), 400

        # 2. Sanitização de todos os inputs
        car_num     = sanitize_str(data.get('carNum', '000/26'), 20)
        part_name   = sanitize_str(data.get('partName', ''), 200).upper()
        part_no     = sanitize_str(data.get('partNo', ''), 100).upper()
        model       = sanitize_str(data.get('model', ''), 100).upper()
        order_no    = sanitize_str(data.get('orderNo', ''), 100).upper()
        lot_no      = sanitize_str(data.get('lotNo', ''), 100).upper()
        ng_qty      = sanitize_int(data.get('ngQty', 1))
        defect      = sanitize_str(data.get('defect', ''), 500).upper()
        detected    = sanitize_str(data.get('detected', ''), 500)
        user        = sanitize_str(data.get('user', ''), 100).upper()
        replacement = sanitize_str(data.get('replacement', 'NEED'), 20)
        issue_date  = sanitize_str(data.get('issueDate', datetime.now().strftime('%d/%m/%Y')), 20)
        photos_raw  = data.get('photos', [])

        # 3. Validação das URLs das fotos (apenas Cloudinary)
        if not isinstance(photos_raw, list):
            return jsonify({'error': 'Formato de fotos inválido.'}), 400
        photos = [p for p in photos_raw[:10] if is_valid_cloudinary_url(p)]

        repl_qty    = 0 if replacement == 'NO NEED' else ng_qty
        detected_en = translate_to_english(detected)
        short_defect = part_name + (' (' + defect[:50] + ')' if defect else '')
        parts_desc = []
        if detected_en:
            parts_desc.append(detected_en + '.')
        parts_desc.append('PHOTOS ARE ATTACHED FOR YOUR REFERENCE.')
        full_desc = ' '.join(parts_desc)

        wb = openpyxl.load_workbook(TEMPLATE_PATH)
        ws = wb['CAR']

        ws['U2'] = 'IRU No. ' + car_num
        ws['U4'] = user
        ws['U5'] = issue_date
        ws['G6'] = part_no
        ws['U6'] = part_name
        ws['AE4'] = part_name
        ws['AE6'] = part_no
        ws['G7'] = order_no
        ws['U7'] = order_no
        ws['D8'] = model
        ws['K8'] = ng_qty
        ws['U8'] = lot_no
        ws['G9'] = short_defect
        ws['A11'] = full_desc
        ws['V16'] = repl_qty

        photo_anchors = ['A16', 'Z22', 'A37', 'Z50', 'A63', 'Z63']

        for i, photo_url in enumerate(photos):
            anchor = photo_anchors[i] if i < len(photo_anchors) else f'A{16 + (i * 15)}'
            tmp_path = download_and_process(photo_url, 800, 600)
            if tmp_path:
                tmp_files.append(tmp_path)
                try:
                    xl_img = XLImage(tmp_path)
                    xl_img.anchor = anchor
                    ws.add_image(xl_img)
                    print(f'Photo {i+1} inserted at {anchor}')
                except Exception as e:
                    print(f'Photo {i+1} insert error: {e}')

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        part_code = (part_no or 'PART').replace(' ', '_')[:20]
        car_code  = car_num.replace('/', '_')
        filename  = f'CAR_No_{car_code}_{part_code}.xlsx'

        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        # 4. Sem stack trace em produção
        print(f'Error in generate_car: {e}')
        return jsonify({'error': 'Erro interno ao gerar o relatório.'}), 500

    finally:
        for f in tmp_files:
            try:
                os.unlink(f)
            except Exception:
                pass

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
