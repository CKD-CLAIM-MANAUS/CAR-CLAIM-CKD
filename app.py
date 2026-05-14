from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import openpyxl
from datetime import datetime
import os, io
import urllib.request
import urllib.parse
import json

app = Flask(__name__)
CORS(app)

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), 'template.xlsx')

def translate_to_english(text):
    """Translate any text to English using Google Translate (free tier)."""
    if not text:
        return ''
    text = text.strip()
    # Check if already mostly English
    pt_words = ['de', 'do', 'da', 'em', 'no', 'na', 'ao', 'foi', 'com', 'para',
                'uma', 'um', 'que', 'por', 'nossa', 'nosso', 'este', 'esta',
                'detectamos', 'modelo', 'durante', 'processo', 'item', 'danos']
    text_lower = text.lower()
    is_portuguese = sum(1 for w in pt_words if f' {w} ' in f' {text_lower} ') >= 2
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

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

@app.route('/generate-car', methods=['POST'])
def generate_car():
    try:
        data = request.get_json()

        car_num     = data.get('carNum', '000/26')
        part_name   = (data.get('partName', '') or '').upper()
        part_no     = (data.get('partNo', '') or '').upper()
        model       = (data.get('model', '') or '').upper()
        order_no    = (data.get('orderNo', '') or '').upper()
        lot_no      = (data.get('lotNo', '') or '').upper()
        ng_qty      = int(data.get('ngQty', 1) or 1)
        defect      = (data.get('defect', '') or '').upper()
        detected    = data.get('detected', '') or ''
        user        = (data.get('user', 'LUIS HERNANDEZ') or '').upper()
        replacement = data.get('replacement', 'NEED')
        repl_qty    = 0 if replacement == 'NO NEED' else ng_qty
        issue_date  = data.get('issueDate', datetime.now().strftime('%d/%m/%Y'))

        # Translate detected text to English
        detected_en = translate_to_english(detected)

        short_defect = part_name + (' (' + defect[:50] + ')' if defect else ' (DEFECT)')
        full_desc = ('HOW DETECTED: ' + detected_en + '. ' if detected_en else '') + \
                    (defect + ' ' if defect else '') + \
                    'PHOTOS ARE ATTACHED FOR YOUR REFERENCE.'

        # Load template
        wb = openpyxl.load_workbook(TEMPLATE_PATH)
        ws = wb['CAR']

        # Fill yellow cells
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

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        part_code = (data.get('partNo', 'PART') or 'PART').replace(' ', '_')[:20]
        car_code = car_num.replace('/', '_')
        filename = f'CAR_No_{car_code}_{part_code}.xlsx'

        return send_file(
            buf,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
