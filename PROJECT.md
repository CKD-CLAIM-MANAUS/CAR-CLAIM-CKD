# CAR · Garantia — CFMOTO da Amazônia
## Documentação Completa do Projecto

---

## 1. Visão Geral

Sistema de gestão de incidentes de garantia de peças automotivas CFMOTO.  
Permite registar defeitos de peças, acompanhar o fluxo de comunicação com a China, gerir stock e controlar peças enviadas para pintura externa.

| Atributo | Valor |
|---|---|
| **Tipo** | PWA (Progressive Web App) — funciona como app instalada |
| **Plataforma** | Mobile-first + Desktop |
| **Idioma** | Português (pt-BR) |
| **Tema** | Dark Industrial |
| **URL produção** | https://ckd-claim-manaus.github.io/CAR-CLAIM-CKD/ |
| **Repositório GitHub** | https://github.com/CKD-CLAIM-MANAUS/CAR-CLAIM-CKD |

---

## 2. Localização dos Ficheiros Locais

| Pasta / Ficheiro | Caminho completo |
|---|---|
| **Raiz do projecto** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\` |
| **HTML principal** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\index.html` |
| **CSS principal (mobile)** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\css\app.css` |
| **CSS desktop** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\css\desktop.css` |
| **JS principal** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\app.js` |
| **JS autenticação** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\auth.js` |
| **JS incidentes** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\incidents.js` |
| **JS câmera / fotos** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\camera.js` |
| **JS geração CAR Excel** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\car.js` |
| **JS dashboard** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\dashboard.js` |
| **JS Firebase config** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\firebase.js` |
| **JS importação pack list** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\packList.js` |
| **JS scanner QR** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\qr.js` |
| **JS gestão de stock** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\stock.js` |
| **JS tracking / rastreio** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\tracking.js` |
| **JS utilitários UI** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\js\ui.js` |
| **Service Worker** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\sw.js` |
| **Manifest PWA** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\manifest.json` |
| **Regras Firestore** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\firestore.rules` |
| **Template Excel CAR** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\template.xlsx` |
| **Logo** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\logo.png` |
| **gitignore** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\.gitignore` |
| **Design system** | `C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT\DESIGN.md` *(local apenas, não publicado)* |

---

## 3. Arquitectura Técnica

### Stack
- **Frontend:** HTML5 + CSS3 + JavaScript ES Modules (vanilla, sem framework)
- **Backend / BD:** Firebase (Firestore + Authentication)
- **Fotos:** Cloudinary (upload e hosting de imagens)
- **CAR Excel:** Servidor Railway (Python / Flask) — gera o Excel a partir de template
- **Deploy:** GitHub Pages (serve directamente do branch `main`)
- **Service Worker:** Cache offline, update automático a cada hora

### Estrutura de módulos JS

```
app.js          ← orquestrador principal: renderização, eventos, lógica UI
├── auth.js         sessão, login/logout, roles (admin/user)
├── incidents.js    CRUD incidentes, status flow, batch operations
├── car.js          geração do CAR Excel via API Railway
├── camera.js       câmera nativa, compressão, upload Cloudinary
├── qr.js           scanner QR (jsQR), parser de dados QR
├── stock.js        gestão de stock, movimentos, histórico
├── tracking.js     detecção de carrier (FedEx/DHL/UPS), URLs de rastreio
├── dashboard.js    KPIs, gráficos Chart.js, relatórios
├── packList.js     importação de pack list Excel → base de peças
├── ui.js           utilitários de UI (toasts, modais, formatação)
└── firebase.js     configuração Firebase, exports de helpers
```

---

## 4. Serviços Externos

### Firebase (Google)
- **Projecto:** `car-garantia`
- **Auth Domain:** `car-garantia.firebaseapp.com`
- **Firestore:** base de dados em tempo real (onSnapshot)
- **App ID:** `1:1038572043129:web:6769b31e0d3be9fd4c0da8`
- **Console:** https://console.firebase.google.com/project/car-garantia

### Cloudinary (fotos)
- **Cloud name:** `dos2jsgzg`
- **Upload preset:** `Garantia CAR` (unsigned)
- **Pasta:** `garantia-car/`
- **Limite:** 10 MB por foto, formatos: JPG, PNG, WebP, GIF, HEIC
- **Console:** https://cloudinary.com/console

### Railway (CAR Excel)
- **URL API:** `https://web-production-6bff6.up.railway.app`
- **Autenticação:** token Firebase JWT em cada pedido
- **Função:** recebe dados do incidente + número CAR → devolve ficheiro `.xlsx`
- **Template:** `template.xlsx` na raiz do projecto

### GitHub Pages (deploy)
- **Branch publicado:** `main`
- **URL:** `https://ckd-claim-manaus.github.io/CAR-CLAIM-CKD/`
- **Deploy:** automático ao fazer `git push origin main`

---

## 5. Colecções Firestore

| Colecção | Descrição | Acesso |
|---|---|---|
| `incidents` | Incidentes de garantia | Autenticados lêem/criam; dono ou admin edita/elimina |
| `users` | Perfis de utilizador (role: admin/user) | Cada um lê o próprio; admin gere todos |
| `carNumbers` | Sequência numérica do CAR | Autenticados lêem e escrevem |
| `partsDB` | Base de dados de peças (import pack list) | Autenticados lêem; só admin escreve |
| `stock` | Quantidade actual de cada peça em stock | Autenticados lêem e escrevem |
| `stockMovements` | Histórico de entradas/saídas de stock | Autenticados criam; só admin elimina |

### Estrutura de um incidente (`incidents`)
```json
{
  "partName": "LH SIDE COVER, LONG MODEL",
  "partNo": "9CQV-042021-3000-0YD00",
  "model": "NK 400",
  "orderNo": "PO-2024-001",
  "lotNo": "BT-2024-04",
  "ngQty": 2,
  "defect": "Descrição do defeito...",
  "detected": "Como foi detectado...",
  "status": "pending",
  "incidentType": "normal",
  "carNum": "123",
  "photos": [{ "url": "https://cloudinary...", "publicId": "garantia-car/..." }],
  "history": [{ "status": "pending", "timestamp": 1234567890, "user": "user@email.com", "note": "..." }],
  "eta": "2026-06-15",
  "tracking": "748926481935",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "userId": "firebase-uid"
}
```

---

## 6. Fluxo de Status — Peças Normais

```
Pendente → Enviado → Envio Confirmado → Recebido → Encerrado
```

| Status (código) | Label | Cor | Descrição |
|---|---|---|---|
| `pending` | Pendente | Âmbar `#F59E0B` | Incidente registado, a aguardar envio do CAR |
| `sent` | Enviado | Azul `#3B82F6` | CAR Excel enviado para a China |
| `awaiting` | Aguardando | Púrpura `#8B5CF6` | *(legado — removido do fluxo activo, mantido para compatibilidade com dados antigos)* |
| `eta_confirmed` | Envio Confirmado | Ciano `#06B6D4` | China confirmou envio com tracking e data prevista |
| `received` | Recebido | Lima `#84CC16` | Peça recebida fisicamente |
| `done` | Encerrado | Verde `#22C55E` | Incidente encerrado |

**Nota sobre `awaiting`:** Removido do fluxo activo. Incidentes existentes neste status são tratados automaticamente como `sent` para cálculo do próximo passo.

### Fluxo de Status — Pintura (incidentType: "paint")

```
Aguardando Envio → Na Pintoria → Encerrado
```

Transições exigem **scan de QR** (ou bypass de admin). QR codificado com URL `?paint=<incidentId>`.

---

## 7. Funcionalidades Principais

### Gestão de Incidentes
- Registo com fotos (câmera nativa ou galeria)
- Dois tipos: **Peças Normais** e **Pintura**
- Filtros por status, tipo, pesquisa por nome/código
- Histórico de alterações com timestamps e utilizador
- Notas manuais no histórico

### Geração CAR Excel
- Botão disponível quando todos os campos obrigatórios estão preenchidos
- Numeração automática sequencial (`001/26`, `002/26`, …)
- Gerado via API Railway com `template.xlsx`
- **Ao confirmar geração → avança automaticamente para `Enviado`**

### Scanner QR
- Lê QR codes via câmera do dispositivo (jsQR library)
- Usado para: confirmar envio para pintura, confirmar retorno de pintura
- Formato QR pintura: `https://[app-url]/?paint=[incidentId]`

### Etiqueta de Pintura
- QR code + número CAR + nome da peça + data
- Impressão directa em etiqueta 58×40mm (`@page` CSS)
- QR tipo 0 (auto-detecção, selecciona tipo 6 — 41 módulos)
- QR tamanho impressão: 22mm × 22mm

### Tracking / Rastreio
- Detecção automática de carrier: FedEx, DHL, UPS, genérico (17track)
- Botão abre o site de tracking do carrier certo
- Registo no passo "Confirmar Envio" (com tracking + data prevista)

### Confirmação de Envio em Lote (Batch)
- Confirma envio (`eta_confirmed`) para múltiplos incidentes de uma vez
- Aplica mesmo tracking e data a todos os seleccionados
- Útil quando a China envia uma remessa com várias peças

### Gestão de Stock
- Lista de peças com quantidade actual
- Entrada / saída / ajuste manual
- Histórico de movimentos por peça
- Associação de saída a incidente específico

### Dashboard
- KPIs: total, pendentes, em progresso, concluídos
- Gráfico de barras mensais (Chart.js)
- Top peças defeituosas, distribuição por modelo
- Tempo médio de resolução
- Filtros: mês actual, 3 meses, todos

### Relatório Pintoria
- Sub-tab dedicada mostrando todas as peças actualmente em pintura
- Filtros por status (Aguardando Envio / Na Pintoria)
- Exportação Excel para pagamento à empresa subcontratada

---

## 8. Autenticação e Roles

- **Firebase Authentication** (email + password)
- **Sessão:** 8 horas com timeout automático; renovada a cada interacção
- **Roles** (colecção `users`, campo `role`):
  - `admin` — acesso total: editar/eliminar qualquer incidente, bypass QR de pintura, ajustes de stock
  - *(sem role)* — acesso normal: criar e editar os próprios incidentes

---

## 9. Layout e CSS

- **Mobile-first** — `css/app.css` contém todos os estilos base
- **Desktop** — `css/desktop.css` activa sob `html.is-desktop` (≥ 900px, definido por JS antes do primeiro paint)
- **Fontes:** DM Sans (UI) + DM Mono (códigos, dados técnicos) — Google Fonts
- **Glassmorphism:** header e bottom nav com `backdrop-filter: blur`
- **Animações:** `fadeInUp` (cards), `stepperPulse` (status activo), `navQrGlow` (botão QR)
- **Sem framework CSS** — vanilla CSS com custom properties

---

## 10. PWA / Service Worker

- **Manifest:** `manifest.json` — nome, ícone, cor, orientação portrait
- **Service Worker:** `sw.js` — cache offline, update automático a cada hora
- **Update banner:** aparece quando há nova versão disponível
- **Instalável** em iOS (Safari → Adicionar ao ecrã inicial) e Android (Chrome → Instalar)
- **theme-color:** `#060E1A`

---

## 11. Como Correr Localmente

```powershell
# Na pasta do projecto
cd C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT

# Instalar servidor HTTP (só uma vez)
npm install -g serve

# Iniciar servidor local
npx serve . -p 3000
```

Abrir em `http://localhost:3000`

> A app requer servidor HTTP (não funciona por `file://`) devido a ES Modules e CORS do Firebase.

---

## 12. Deploy para Produção

```powershell
cd C:\Users\lhernandez\Desktop\CAR-CLAIM-CKD-GIT

# Commitar alterações
git add .
git commit -m "descrição das alterações"

# Publicar no GitHub Pages (deploy automático)
git push origin main
```

O GitHub Pages serve directamente o branch `main`. O deploy propaga em 1-2 minutos.

---

## 13. Branches Git

| Branch | Propósito |
|---|---|
| `main` | Produção — o que está publicado em GitHub Pages |
| `stitch-design` | Experiências de design Stitch (mantido como referência, não em produção) |

---

## 14. Ficheiros que NÃO vão para o repositório

Definido em `.gitignore`:
```
DESIGN.md       # documentação local de design
.claude/        # configuração do Claude Code
```

---

*Documento gerado em 31/05/2026 · CAR-CLAIM-CKD*
