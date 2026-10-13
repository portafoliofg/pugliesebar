const CONFIG={MOVEMENTS_SHEET:'MOVIMIENTOS APP',HEADER_ROW:2,FIRST_DATA_ROW:3,TIMEZONE:'America/Argentina/Buenos_Aires'};

function doGet(){
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Sammartino Control de Stock-VDR')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

// =====================================================
// REGLAS DE CLASIFICACIÓN (color de fondo de la columna A)
//   #FFC000 (naranja oscuro) = Campo Agro
//   #FFFF00 / #FFFF1F (amarillo) = Villa del Rosario
//   Cualquier otro color o sin color = SE IGNORA
// =====================================================

const DEPOSITS={
  vdr:{key:'vdr',name:'Villa del Rosario',paint:'#ffff00'},
    campo:{key:'campo',name:'Campo Agro',paint:'#ffc000'},
  third:{key:'third',name:'Sammartino',paint:'#d9d9d9'}
};

function depositFromColor_(hex){
  const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex||'').trim());
  if(!m)return '';

  const r=parseInt(m[1],16);
  const g=parseInt(m[2],16);
  const b=parseInt(m[3],16);

  // Naranja oscuro #FFC000
  if(r>=250&&g>=185&&g<=200&&b<=20)return 'campo';

  // Amarillo #FFFF00 / #FFFF1F
  if(r>=250&&g>=250&&b<=60)return 'vdr';

  return '';
}

function isCampoDeposit_(d){
  return /campo\s*agro|dep[oó]sito\s*2/i.test(String(d||''));
}

function isThirdDeposit_(d){
  return /sammartino|dep[oó]sito\s*3/i.test(String(d||''));
}

// Para mostrar movimientos: "Fiduciaria" y similares pasan a Villa del Rosario.
function depositName_(v){
  const d=clean_(v);
  if(!d)return '';
  if(isCampoDeposit_(d))return DEPOSITS.campo.name;
  if(isThirdDeposit_(d))return DEPOSITS.third.name;
  return DEPOSITS.vdr.name;
}

// Convierte un nombre de depósito en su clave ('vdr' | 'campo' | 'third' | '').
function depositKey_(v){
  const d=clean_(v);
  if(!d)return '';
  if(isCampoDeposit_(d))return 'campo';
  if(isThirdDeposit_(d))return 'third';
  if(/villa|rosario|vdr|fiduciaria|dep[oó]sito\s*1/i.test(d))return 'vdr';
  return '';
}

// Depósito de una fila: color VDR / Campo; si no, Sammartino
// (solo si tiene nombre y stock, o si está pintada del gris de la app).
function depositOf_(hex,r){
  const d=depositFromColor_(hex);
  if(d)return d;
  if(!clean_(r[0]))return '';
  if(String(hex||'').toLowerCase()===DEPOSITS.third.paint)return 'third';
  return (num_(r[11])+num_(r[12]))!==0?'third':'';
}

// En qué columna (L / M) se guarda el stock de la fila.
function splitStock_(dep,next,data){
  if(dep==='vdr')return [next,0];
  if(dep==='campo')return [0,next];
  // Sammartino: conserva la columna donde ya estaba el stock
  const inM=num_(data[12])!==0&&num_(data[11])===0;
  return inM?[0,next]:[next,0];
}

// Si un producto de Sammartino queda en 0, se pinta de gris para que no desaparezca.
function keepThird_(stock,row,dep,next){
  if(dep==='third'&&next===0){
    stock.getRange(row,1).setBackground(DEPOSITS.third.paint);
  }
}

function round6_(x){
  return Math.round(num_(x)*1e6)/1e6;
}

// =====================================================
// DATOS DE LA APP
// =====================================================

function getAppData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stock = ss.getSheets()[0];

  if (!stock) {
    throw new Error('No se encontró la hoja principal de stock.');
  }

  const lastRow = stock.getLastRow();
  const lastCol = Math.max(stock.getLastColumn(), 22);
  const products = getUniqueProducts_(stock);

  if (lastRow < 2) {
    return {
      appName: 'VDR · Gestión de Stock',
      spreadsheetName: ss.getName(),
      sheetName: stock.getName(),
      products: products,
      items: [],
      movements: [],
      updatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm'),
      currency: 'U$S'
    };
  }

  const range = stock.getRange(2, 1, lastRow - 1, lastCol);
  const rawData = range.getValues();
  const displayData = range.getDisplayValues();

  // Color de fondo de la columna A: define el depósito de cada fila.
  const colors = stock.getRange(2, 1, lastRow - 1, 1).getBackgrounds();

  const headers = displayData[0] || [];

  const items = [];
  const masterByVariant = new Map();
  const fallbackByVariant = new Map();
  const metadataByArticle = new Map();

  const normalizeKey = value =>
    String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('es-AR');

  const articleKey = article => normalizeKey(article);

  // Una variante = artículo + activo + presentación + lote + depósito.
  const variantKey = item => [
    item.article,
    item.active,
    item.presentation,
    item.lot,
    item.deposit
  ].map(normalizeKey).join('||');

  function buildItem(i, values, textValues, dep) {
    // El stock de la fila (L + M) pertenece SIEMPRE al depósito
    // que indica el color de la columna A.
    const qty = round6_(num_(values[11]) + num_(values[12]));
    const price = num_(values[15]);
    const fid = dep === 'vdr' ? qty : 0;
    const camp = dep === 'campo' ? qty : 0;
    const third = dep === 'third' ? qty : 0;

    return {
      row: i + 2,
      article: clean_(textValues[0]),
      active: clean_(textValues[1]),
      presentation: clean_(textValues[2]),
      lot: clean_(textValues[3]),
      expiry: clean_(textValues[4]),
      movementType: clean_(textValues[5]),

      deposit: dep,
      depositName: DEPOSITS[dep].name,

      fiduciary: fid,   // Villa del Rosario
      samm: camp,       // Campo Agro
      third: third,     // Sammartino
      total: qty,

      seedRemitted: num_(values[14]),
      price: price,
      amountFiduciary: fid * price,
      amountSamm: camp * price,
      identification: clean_(textValues[20])
    };
  }

  // PASO 1: filas maestras y filas con tipo de movimiento (solo clasificadas por color).
  for (let i = 1; i < rawData.length; i++) {
    const values = rawData[i];
    const textValues = displayData[i];
    const article = clean_(textValues[0]);

    if (!article) continue;

    const dep = depositOf_(colors[i][0], values);
    if (!dep) continue; // sin nombre / sin stock ni color válido: se ignora

    const item = buildItem(i, values, textValues, dep);
    const aKey = articleKey(article);
    const vKey = variantKey(item);

    const prevMeta = metadataByArticle.get(aKey);

    if (!prevMeta) {
      metadataByArticle.set(aKey, Object.assign({}, item));
    } else {
      ['active', 'presentation', 'expiry', 'identification'].forEach(f => {
        if (!prevMeta[f] && item[f]) prevMeta[f] = item[f];
      });
      if (!prevMeta.price && item.price) prevMeta.price = item.price;
    }

    if (!item.movementType) {
      items.push(item);
      if (!masterByVariant.has(vKey)) masterByVariant.set(vKey, item);
    } else if (item.total !== 0) {
      // Fila histórica con stock: se conserva la última de cada variante.
      fallbackByVariant.set(vKey, item);
    }
  }

  // PASO 2: variantes con stock que solo aparecen en filas de movimientos.
  fallbackByVariant.forEach((candidate, vKey) => {
    const master = masterByVariant.get(vKey);

    if (!master) {
      const meta = metadataByArticle.get(articleKey(candidate.article));

      if (meta) {
        if (!candidate.active) candidate.active = meta.active;
        if (!candidate.presentation) candidate.presentation = meta.presentation;
      }

      items.push(candidate);
      return;
    }

    if (master.total === 0 && candidate.total !== 0) {
      master.fiduciary = candidate.fiduciary;
      master.samm = candidate.samm;
      master.third = candidate.third;
      master.total = candidate.total;
      master.amountFiduciary = master.fiduciary * master.price;
      master.amountSamm = master.samm * master.price;
    }
  });

  // PASO 3: todo producto del catálogo aparece al menos una vez.
  const representedArticles = new Set(items.map(item => articleKey(item.article)));

  products.forEach(product => {
    const aKey = articleKey(product.name);

    if (representedArticles.has(aKey)) return;

    const original = metadataByArticle.get(aKey);
    const dep = original ? original.deposit : (product.deposit || 'vdr');

    items.push({
      row: original ? original.row : 0,
      article: product.name,
      active: original ? original.active : '',
      presentation: original ? original.presentation : '',
      lot: original ? original.lot : '',
      expiry: original ? original.expiry : '',
      movementType: '',
      deposit: dep,
      depositName: DEPOSITS[dep].name,
      fiduciary: 0,
      samm: 0,
      total: 0,
      seedRemitted: 0,
      price: original ? original.price : 0,
      third: 0,
      amountFiduciary: 0,
      amountSamm: 0,
      identification: original ? original.identification : ''
    });
  });

  items.sort((a, b) => (a.row || 0) - (b.row || 0));

  // Movimientos de la app: solo los de productos clasificados.
  const allowed = new Set(products.map(p => normName_(p.name)));
  const movements = readMovements_().filter(m => allowed.has(normName_(m.article)));

  return {
    appName: 'VDR · Gestión de Stock',
    spreadsheetName: ss.getName(),
    sheetName: stock.getName(),
    headers: headers,
    products: products,
    items: items,
    movements: movements.slice().reverse(),
    descriptions: readDescriptions_(),
    fiduciary: computeFiduciary_(stock, items, movements),
    updatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm'),
    currency: 'U$S'
  };
}

// CATÁLOGO MAESTRO:
// Primera hoja, columna A, desde la fila 3. Solo filas con color
// de Villa del Rosario o Campo Agro. Sin duplicados exactos.
function getUniqueProducts_(sheet){
  const last=sheet.getLastRow();
  if(last<3)return[];

  const cols=Math.min(13,sheet.getMaxColumns());
  const vals=sheet.getRange(3,1,last-2,cols).getValues();
  const colors=sheet.getRange(3,1,last-2,1).getBackgrounds();

  const seen=new Set();
  const custom=getCustomNames_(sheet);
  const out=[];

  vals.forEach((r,i)=>{
    const n=clean_(r[0]);
    const dep=depositOf_(colors[i][0],r);

    if(n&&dep&&!seen.has(n)){
      seen.add(n);
      out.push({name:n,custom:custom.has(normName_(n)),deposit:dep});
    }
  });

  return out;
}

// Busca la fila de stock de un artículo + lote.
// - Solo filas con color válido (y del depósito pedido, si se indica).
// - Prefiere la fila maestra con stock; si no, la última fila histórica con stock;
//   si no hay stock en ninguna, la fila maestra o la última histórica.
function findStockRow_(values,colors,article,lot,wanted){
  const norm=function(v){
    return clean_(v)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase('es-AR');
  };

  const a=norm(article);
  const l=norm(lot);

  let master=null;
  let withStock=null;
  let anyMov=null;

  for(let i=0;i<values.length;i++){
    const r=values[i];

    if(!clean_(r[0]))continue;

    const dep=depositOf_(colors[i][0],r);
    if(!dep)continue;
    if(wanted&&dep!==wanted)continue;

    if(norm(r[0])!==a||norm(r[3])!==l)continue;

    const cand={row:i+3,data:r,deposit:dep};

    if(!clean_(r[5])){
      if(!master)master=cand;
    }else{
      anyMov=cand;
      if(num_(r[11])+num_(r[12])!==0)withStock=cand;
    }
  }

  if(master&&num_(master.data[11])+num_(master.data[12])!==0)return master;

  return withStock||master||anyMov;
}

function saveMovement(f){
  if(!f)throw new Error('No se recibieron los datos.');

  const article=clean_(f.article);
  const type=String(f.type||'').toUpperCase();
  const qty=num_(f.quantity);
  const wanted=depositKey_(f.deposit);
  const lot=clean_(f.lot);

  if(!article)throw new Error('Seleccioná un artículo.');
  if(!['INGRESO','SALIDA'].includes(type)){
    throw new Error('Tipo de movimiento inválido.');
  }
  if(!(qty>0)){
    throw new Error('La cantidad debe ser mayor que cero.');
  }
  if(!wanted){
    throw new Error('Seleccioná el depósito.');
  }

  const lock=LockService.getScriptLock();

  try{
    lock.waitLock(30000);

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const stock=ss.getSheets()[0];

    if(!stock){
      throw new Error('No se encontró la hoja principal de stock.');
    }

    if(!getUniqueProducts_(stock).some(p=>p.name===article)){
      throw new Error(
        'El artículo "'+article+'" no pertenece al catálogo (revisá el color de la columna A).'
      );
    }

    const lastRow=stock.getLastRow();

    if(lastRow<3){
      throw new Error('La hoja de stock no contiene renglones de existencias.');
    }

    const lastCol=Math.max(stock.getLastColumn(),22);
    const values=stock.getRange(3,1,lastRow-2,lastCol).getValues();
    const colors=stock.getRange(3,1,lastRow-2,1).getBackgrounds();

    const found=findStockRow_(values,colors,article,lot,wanted);

    if(!found){
      throw new Error(
        'No se encontró una fila de stock de "'+article+'"'+
        (lot?' con lote "'+lot+'"':'')+
        ' en '+DEPOSITS[wanted].name+'. Revisá el color de la columna A en la planilla.'
      );
    }

    const dep=found.deposit;
    const price=num_(found.data[15]);
    const current=num_(found.data[11])+num_(found.data[12]);
    const next=round6_(type==='INGRESO'?current+qty:current-qty);

    // El stock de la fila queda en la columna de su depósito:
    // L = Villa del Rosario, M = Campo Agro (Sammartino conserva su columna).
    const sp=splitStock_(dep,next,found.data);
    const fid=sp[0];
    const camp=sp[1];
    keepThird_(stock,found.row,dep,next);

    stock.getRange(found.row,12,1,3).setValues([[fid,camp,next]]);
    stock.getRange(found.row,17,1,2).setValues([[fid*price,camp*price]]);

    const sh=ensureMovementsSheet_();
    const now=new Date();
    const date=f.date?new Date(f.date+'T12:00:00'):now;

    sh.appendRow([
      now,
      date,
      type,
      article,
      clean_(f.active),
      clean_(f.presentation),
      lot,
      clean_(f.remito),
      clean_(f.observation),
      type==='INGRESO'?qty:0,
      type==='SALIDA'?qty:0,
      DEPOSITS[dep].name,
      clean_(f.responsible)
    ]);

    SpreadsheetApp.flush();

    return {
      ok:true,
      message:type+' registrado correctamente. Stock actualizado.',
      movementDate:Utilities.formatDate(date,CONFIG.TIMEZONE,'dd/MM/yyyy'),
      stock:{
        row:found.row,
        article:article,
        lot:lot,
        deposit:DEPOSITS[dep].name,
        fiduciary:fid,
        samm:camp,
        total:next
      }
    };

  }catch(err){

    throw new Error(
      err&&err.message?err.message:'No se pudo actualizar el stock.'
    );

  }finally{
    try{lock.releaseLock();}catch(e){}
  }
}

function getMovements(){
  return readMovements_().reverse();
}

function readMovements_(){
  const sh=SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.MOVEMENTS_SHEET);

  if(!sh||sh.getLastRow()<2)return[];

  const cols=Math.min(15,sh.getMaxColumns());

  return sh.getRange(2,1,sh.getLastRow()-1,cols).getValues().map((r,i)=>({
    id:i+2,
    createdAt:dateText_(r[0]),
    date:dateText_(r[1]),
    type:clean_(r[2]),
    article:clean_(r[3]),
    active:clean_(r[4]),
    presentation:clean_(r[5]),
    lot:clean_(r[6]),
    remito:clean_(r[7]),
    observation:clean_(r[8]),
    income:num_(r[9]),
    outcome:num_(r[10]),
    deposit:depositName_(r[11]),
    responsible:clean_(r[12]),
    status:clean_(r[13]).toUpperCase(),
    cancelledAt:dateText_(r[14])
  }));
}

function ensureMovementsSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(CONFIG.MOVEMENTS_SHEET);

  if(!sh){
    sh=ss.insertSheet(CONFIG.MOVEMENTS_SHEET);

    sh.getRange(1,1,1,13).setValues([[
      'Fecha de carga','Fecha del movimiento','Tipo','Artículo',
      'Principio activo','Presentación','Lote','N° remito',
      'Observación','Ingreso','Salida','Depósito','Responsable'
    ]]);

    sh.setFrozenRows(1);

    sh.getRange(1,1,1,13)
      .setFontWeight('bold')
      .setBackground('#14243a')
      .setFontColor('#ffffff');

    sh.autoResizeColumns(1,13);
    sh.getRange('A:B').setNumberFormat('dd/MM/yyyy HH:mm');
    sh.getRange('J:K').setNumberFormat('#,##0.###');
  }

  return sh;
}

function itemKey_(a,l){
  return clean_(a).toLocaleLowerCase()+'||'+clean_(l).toLocaleLowerCase();
}

function clean_(v){
  return v===null||v===undefined?'':String(v).trim();
}

function num_(v){
  if(typeof v==='number')return isFinite(v)?v:0;
  if(v===null||v===undefined||v==='')return 0;

  const n=Number(
    String(v)
      .trim()
      .replace(/\s/g,'')
      .replace(/\.(?=\d{3}(\D|$))/g,'')
      .replace(',','.')
  );

  return isFinite(n)?n:0;
}

function dateText_(v){
  if(!v)return'';

  const d=v instanceof Date?v:new Date(v);

  return isNaN(d.getTime())
    ?clean_(v)
    :Utilities.formatDate(d,CONFIG.TIMEZONE,'dd/MM/yyyy');
}

// =====================================================
// DESCRIPCIONES
// =====================================================

const DESC_SHEET = 'DESCRIPCIONES';

function readDescriptions_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DESC_SHEET);
  const out = {};

  if (!sh || sh.getLastRow() < 2) return out;

  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const name = clean_(r[0]);
    if (name) out[name] = clean_(r[1]);
  });

  return out;
}

function saveDescription(article, text) {
  article = clean_(article);
  text = clean_(text);

  if (!article) throw new Error('Falta el artículo.');

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(DESC_SHEET);

    if (!sh) {
      sh = ss.insertSheet(DESC_SHEET);
      sh.getRange(1, 1, 1, 2).setValues([['Artículo', 'Descripción']]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, 2)
        .setFontWeight('bold')
        .setBackground('#14243a')
        .setFontColor('#ffffff');
      sh.setColumnWidth(1, 280);
      sh.setColumnWidth(2, 600);
    }

    const last = sh.getLastRow();
    let row = -1;

    if (last >= 2) {
      const names = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < names.length; i++) {
        if (clean_(names[i][0]) === article) {
          row = i + 2;
          break;
        }
      }
    }

    if (row === -1) {
      sh.appendRow([article, text]);
    } else {
      sh.getRange(row, 2).setValue(text);
    }

    return { ok: true };

  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// =====================================================
// HOJAS ADICIONALES (solo lectura)
// =====================================================

const EXTRA_SHEETS = {
  pioneer: 'SEMILLAS PIONEER',
  maize: 'COMPARATIVO SEMILLAS MAIZ',
  control: 'CONTROL 2025 - S.M-ESTEBAN RIOS',
  brevant: 'DIF SEMILLA BREVANT',
  campo: 'COMPRA CAMPO AGRO'
};

const PIONEER_HEADERS = [
  'Artículo', 'Presentación', 'Tipo', 'N° remito', 'Detalle',
  'Fecha', 'Ingreso', 'Salida', 'Stock'
];

function getExtraData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stock = ss.getSheets()[0];
  const missing = {};
  const out = { missing: missing, snapshots: [] };

  function safe(key, fn) {
    try {
      out[key] = fn();
    } catch (e) {
      out[key] = emptyTable_();
      missing[key] = 'No se pudo leer esta hoja: ' +
        (e && e.message ? e.message : e);
    }
  }

  function named(key, headerRow, firstRow, headers) {
    safe(key, function () {
      const sh = findSheet_(ss, EXTRA_SHEETS[key]);
      if (!sh) {
        missing[key] = 'No se encontró la hoja "' + EXTRA_SHEETS[key] + '".';
        return emptyTable_();
      }
      return readTable_(sh, headerRow, firstRow, headers);
    });
  }

  safe('history', function () { return readSheetHistory_(stock); });
  safe('seedStock', function () { return readSeedTracking_(stock); });

  named('pioneer', 0, 1, PIONEER_HEADERS);
  named('maize', 1, 2);
  named('control', 1, 2);
  named('brevant', 1, 2);
  named('campo', 1, 2);

  try {
    const stockId = stock.getSheetId();

    out.snapshots = ss.getSheets()
      .filter(function (s) {
        return s.getSheetId() !== stockId &&
          /^STOCK AL/.test(normName_(s.getName()));
      })
      .map(function (s) {
        const t = readTable_(s, 2, 3);
        t.name = s.getName().trim();
        t.time = snapshotTime_(s.getName());
        return t;
      })
      .sort(function (a, b) { return b.time - a.time; });
  } catch (e) {
    missing.snaps = 'No se pudieron leer los stocks anteriores.';
  }

  return out;
}

function emptyTable_() {
  return { headers: [], rows: [], totals: [] };
}

function normName_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function findSheet_(ss, name) {
  const target = normName_(name);
  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (normName_(sheets[i].getName()) === target) return sheets[i];
  }
  return null;
}

function snapshotTime_(name) {
  const m = String(name).match(/(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (!m) return 0;

  let y = Number(m[3]);
  if (y < 100) y += 2000;

  return new Date(y, Number(m[2]) - 1, Number(m[1])).getTime();
}

function colLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellValue_(v) {
  if (v instanceof Date) {
    return isNaN(v.getTime())
      ? ''
      : Utilities.formatDate(v, CONFIG.TIMEZONE, 'dd/MM/yyyy');
  }
  if (typeof v === 'number') {
    return isFinite(v) ? Math.round(v * 10000) / 10000 : '';
  }
  return clean_(v);
}

function pruneEmptyColumns_(headers, rows) {
  const keep = [];

  headers.forEach(function (h, c) {
    if (rows.some(function (r) { return r[c] !== ''; })) keep.push(c);
  });

  return {
    headers: keep.map(function (c) { return headers[c]; }),
    rows: rows.map(function (r) {
      return keep.map(function (c) { return r[c]; });
    })
  };
}

function readTable_(sheet, headerRow, firstRow, customHeaders) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < firstRow || lastCol < 1) return emptyTable_();

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headerValues = headerRow ? values[headerRow - 1] : [];
  const body = values.slice(firstRow - 1);

  const keep = [];

  for (let c = 0; c < lastCol; c++) {
    const h = customHeaders
      ? clean_(customHeaders[c])
      : clean_(headerValues[c]);

    const hasData = body.some(function (r) {
      return clean_(r[c]) !== '';
    });

    if (h || hasData) {
      keep.push({ c: c, h: h || ('Col. ' + colLetter_(c + 1)) });
    }
  }

  const rows = [];
  const totals = [];

  body.forEach(function (r) {
    const vals = keep.map(function (k) { return cellValue_(r[k.c]); });

    if (vals.every(function (v) { return v === ''; })) return;

    const first = vals[0];
    const hasNumber = vals.some(function (v) { return typeof v === 'number'; });
    const isTotal = (first === '' && hasNumber) || /^total$/i.test(String(first));

    if (isTotal) {
      if (first === '') vals[0] = 'TOTAL';
      totals.push(rows.length);
    }

    rows.push(vals);
  });

  return {
    headers: keep.map(function (k) { return k.h; }),
    rows: rows,
    totals: totals
  };
}

// Movimientos cargados en la hoja principal (filas con "Tipo de movimiento").
// Solo filas con color de Villa del Rosario o Campo Agro.
function readSheetHistory_(stock) {
  const lastRow = stock.getLastRow();

  const headers = [
    'Fecha', 'Tipo', 'Depósito', 'Artículo', 'Principio activo', 'Presentación',
    'Lote', 'Vencimiento', 'N° remito', 'Observación', 'Ingreso',
    'Salida', 'Stock Villa del Rosario', 'Stock Campo Agro', 'Semilla remitada',
    'Precio', 'Col. X', 'Col. Y', 'Col. Z', 'Col. AA'
  ];

  if (lastRow < 3) return emptyTable_();

  const values = stock
    .getRange(3, 1, lastRow - 2, stock.getLastColumn())
    .getValues();
  const colors = stock.getRange(3, 1, lastRow - 2, 1).getBackgrounds();

  const found = [];

  values.forEach(function (r, i) {
    if (!clean_(r[0]) || !clean_(r[5])) return;

    const dep = depositFromColor_(colors[i][0]);
    if (!dep) return;

    const hasStock = clean_(r[11]) !== '' || clean_(r[12]) !== '';
    const qty = num_(r[11]) + num_(r[12]);

    found.push({
      time: r[8] instanceof Date ? r[8].getTime() : -1,
      idx: i,
      row: [
        r[8], r[5], DEPOSITS[dep].name, r[0], r[1], r[2], r[3], r[4], r[6], r[7],
        r[9], r[10],
        hasStock && dep === 'vdr' ? qty : '',
        hasStock && dep === 'campo' ? qty : '',
        r[14], r[15],
        r[23], r[24], r[25], r[26]
      ].map(cellValue_)
    });
  });

  found.sort(function (a, b) {
    return (b.time - a.time) || (b.idx - a.idx);
  });

  const t = pruneEmptyColumns_(
    headers,
    found.map(function (f) { return f.row; })
  );

  return { headers: t.headers, rows: t.rows, totals: [] };
}

// Filas con semilla remitada, carteles, identificación o diferencia.
function readSeedTracking_(stock) {
  const lastRow = stock.getLastRow();

  const headers = [
    'Artículo', 'Lote', 'Presentación', 'Villa del Rosario', 'Campo Agro',
    'Total', 'Semilla remitada', 'Carteles', 'Identificación', 'Dif. semilla'
  ];

  if (lastRow < 3) return emptyTable_();

  const values = stock
    .getRange(3, 1, lastRow - 2, stock.getLastColumn())
    .getValues();
  const colors = stock.getRange(3, 1, lastRow - 2, 1).getBackgrounds();

  const rows = [];

  values.forEach(function (r, i) {
    if (!clean_(r[0]) || clean_(r[5])) return;

    const dep = depositFromColor_(colors[i][0]);
    if (!dep) return;

    const hasSeedData = [r[14], r[19], r[20], r[21]].some(function (v) {
      return clean_(v) !== '';
    });

    if (!hasSeedData) return;

    const qty = num_(r[11]) + num_(r[12]);

    rows.push([
      r[0], r[3], r[2],
      dep === 'vdr' ? qty : 0,
      dep === 'campo' ? qty : 0,
      qty,
      r[14], r[19], r[20], r[21]
    ].map(cellValue_));
  });

  return { headers: headers, rows: rows, totals: [] };
}

// =====================================================
// ANULAR MOVIMIENTOS
// =====================================================

function cancelMovement(id){
  id=Number(id);
  if(!(id>=2))throw new Error('Movimiento inválido.');

  const lock=LockService.getScriptLock();

  try{
    lock.waitLock(30000);

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const sh=ss.getSheetByName(CONFIG.MOVEMENTS_SHEET);

    if(!sh||id>sh.getLastRow()){
      throw new Error('No se encontró el movimiento.');
    }

    if(sh.getMaxColumns()<15){
      sh.insertColumnsAfter(sh.getMaxColumns(),15-sh.getMaxColumns());
    }

    const r=sh.getRange(id,1,1,15).getValues()[0];

    if(clean_(r[13]).toUpperCase()==='ANULADO'){
      throw new Error('Este movimiento ya fue anulado.');
    }

    const type=clean_(r[2]).toUpperCase();
    const article=clean_(r[3]);
    const lot=clean_(r[6]);
    const qty=type==='INGRESO'?num_(r[9]):num_(r[10]);

    if(!['INGRESO','SALIDA'].includes(type)||!(qty>0)){
      throw new Error('El movimiento no tiene datos válidos para anular.');
    }

    const stock=ss.getSheets()[0];
    const lastRow=stock.getLastRow();

    if(lastRow<3){
      throw new Error('La hoja de stock no contiene renglones de existencias.');
    }

    const values=stock
      .getRange(3,1,lastRow-2,Math.max(stock.getLastColumn(),22))
      .getValues();
    const colors=stock.getRange(3,1,lastRow-2,1).getBackgrounds();

    // El depósito lo define el color de la fila del producto
    // (sirve también para movimientos viejos guardados como "Fiduciaria").
    const found=findStockRow_(values,colors,article,lot,'');

    if(!found){
      throw new Error(
        'No se encontró la fila de stock de "'+article+'"'+
        (lot?' lote "'+lot+'"':'')+'. No se pudo revertir.'
      );
    }

    const dep=found.deposit;
    const price=num_(found.data[15]);
    const current=num_(found.data[11])+num_(found.data[12]);

    // Se hace lo contrario del movimiento original
    const next=round6_(type==='INGRESO'?current-qty:current+qty);

    if(type==='INGRESO'&&next<0){
      throw new Error(
        'No se puede anular: el stock de '+DEPOSITS[dep].name+
        ' quedaría negativo ('+next+').'
      );
    }

    const sp=splitStock_(dep,next,found.data);
    const fid=sp[0];
    const camp=sp[1];
    keepThird_(stock,found.row,dep,next);

    stock.getRange(found.row,12,1,3).setValues([[fid,camp,next]]);
    stock.getRange(found.row,17,1,2).setValues([[fid*price,camp*price]]);

    if(clean_(sh.getRange(1,14).getValue())===''){
      sh.getRange(1,14,1,2).setValues([['Estado','Fecha de anulación']]);
      sh.getRange(1,14,1,2)
        .setFontWeight('bold')
        .setBackground('#14243a')
        .setFontColor('#ffffff');
    }

    sh.getRange(id,14,1,2).setValues([['ANULADO',new Date()]]);
    sh.getRange(id,15).setNumberFormat('dd/MM/yyyy HH:mm');

    SpreadsheetApp.flush();

    return {
      ok:true,
      message:'Movimiento anulado. El stock volvió a como estaba antes.'
    };

  }finally{
    try{lock.releaseLock();}catch(e){}
  }
}

// =====================================================
// PRODUCTOS NUEVOS (se guardan en la hoja PRODUCTOS APP)
// =====================================================

const PRODUCTS_SHEET='PRODUCTOS APP';

function getCustomNames_(stockSheet){
  const sh=stockSheet.getParent().getSheetByName(PRODUCTS_SHEET);
  const out=new Set();

  if(!sh||sh.getLastRow()<2)return out;

  sh.getRange(2,1,sh.getLastRow()-1,1).getValues().forEach(r=>{
    const n=clean_(r[0]);
    if(n)out.add(normName_(n));
  });

  return out;
}

function ensureProductsSheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(PRODUCTS_SHEET);

  if(!sh){
    sh=ss.insertSheet(PRODUCTS_SHEET);

    sh.getRange(1,1,1,8).setValues([[
      'Artículo','Principio activo','Presentación',
      'Lote','Vencimiento','Precio','Fecha de alta','Depósito'
    ]]);

    sh.setFrozenRows(1);

    sh.getRange(1,1,1,8)
      .setFontWeight('bold')
      .setBackground('#14243a')
      .setFontColor('#ffffff');

    sh.setColumnWidth(1,280);
    sh.getRange('G:G').setNumberFormat('dd/MM/yyyy HH:mm');
  }else if(clean_(sh.getRange(1,8).getValue())===''){
    sh.getRange(1,8).setValue('Depósito')
      .setFontWeight('bold')
      .setBackground('#14243a')
      .setFontColor('#ffffff');
  }

  return sh;
}

function addProduct(f){
  if(!f)throw new Error('No se recibieron los datos.');

  const article=clean_(f.article);
  if(!article)throw new Error('Ingresá el nombre del producto.');

  const dep=depositKey_(f.deposit);
  if(!dep)throw new Error('Elegí el depósito del producto.');

  const active=clean_(f.active);
  const presentation=clean_(f.presentation);
  const lot=clean_(f.lot);
  const expiry=clean_(f.expiry);
  const price=num_(f.price);

  const lock=LockService.getScriptLock();

  try{
    lock.waitLock(30000);

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const stock=ss.getSheets()[0];

    const exists=getUniqueProducts_(stock).some(p=>
      normName_(p.name)===normName_(article)
    );

    if(exists){
      throw new Error('El producto "'+article+'" ya existe en el catálogo.');
    }

    // Nueva fila de stock al final de la hoja principal
    const row=Math.max(stock.getLastRow(),2)+1;

    if(row>stock.getMaxRows()){
      stock.insertRowsAfter(stock.getMaxRows(),row-stock.getMaxRows());
    }

    stock.getRange(row,1,1,5).setValues([[
      article,active,presentation,lot,expiry
    ]]);
    stock.getRange(row,12,1,3).setValues([[0,0,0]]);
    stock.getRange(row,16).setValue(price);
    stock.getRange(row,17,1,2).setValues([[0,0]]);

    // El color de la columna A define el depósito del producto.
    stock.getRange(row,1).setBackground(DEPOSITS[dep].paint);

    ensureProductsSheet_().appendRow([
      article,active,presentation,lot,expiry,price,new Date(),DEPOSITS[dep].name
    ]);

    SpreadsheetApp.flush();

    return {
      ok:true,
      message:'Producto "'+article+'" agregado en '+DEPOSITS[dep].name+'.'
    };

  }finally{
    try{lock.releaseLock();}catch(e){}
  }
}

function deleteProduct(article){
  article=clean_(article);
  if(!article)throw new Error('Falta el artículo.');

  const lock=LockService.getScriptLock();

  try{
    lock.waitLock(30000);

    const ss=SpreadsheetApp.getActiveSpreadsheet();
    const stock=ss.getSheets()[0];
    const ps=ss.getSheetByName(PRODUCTS_SHEET);
    const target=normName_(article);

    // Solo se pueden borrar productos creados desde la app
    let pRow=-1;

    if(ps&&ps.getLastRow()>=2){
      const names=ps.getRange(2,1,ps.getLastRow()-1,1).getValues();
      for(let i=0;i<names.length;i++){
        if(normName_(names[i][0])===target){
          pRow=i+2;
          break;
        }
      }
    }

    if(pRow===-1){
      throw new Error('Solo se pueden borrar productos cargados desde la aplicación.');
    }

    const lastRow=stock.getLastRow();
    const lastCol=Math.max(stock.getLastColumn(),22);
    const toClear=[];

    if(lastRow>=3){
      const values=stock.getRange(3,1,lastRow-2,lastCol).getValues();

      for(let i=0;i<values.length;i++){
        const r=values[i];

        if(normName_(r[0])!==target)continue;
        if(clean_(r[5]))continue;

        if(num_(r[11])!==0||num_(r[12])!==0){
          throw new Error(
            'No se puede borrar: "'+article+'" todavía tiene stock. Dejalo en 0 primero.'
          );
        }

        toClear.push(i+3);
      }
    }

    // Se vacía la fila (no se elimina) para no desplazar otras filas ni fórmulas.
    // También se quita el color para que quede fuera de la clasificación.
    toClear.forEach(row=>{
      stock.getRange(row,1,1,lastCol).clearContent();
      stock.getRange(row,1).setBackground(null);
    });

    ps.deleteRow(pRow);

    SpreadsheetApp.flush();

    return {ok:true,message:'Producto "'+article+'" eliminado.'};

  }finally{
    try{lock.releaseLock();}catch(e){}
  }
}

// =====================================================
// ACUERDO FIDUCIARIO
// =====================================================

// Se usa solo si la celda S2 de la hoja principal está vacía.
const FIDUCIARY_DEFAULT = 2060660.4;

// Qué depósitos cuentan para el acuerdo: 'total' | 'vdr' | 'campo'
const FIDUCIARY_SCOPE = 'total';

function computeFiduciary_(stock, items, movements){
  let agreed=FIDUCIARY_DEFAULT;
  let date='';

  try{
    const v=stock.getRange('S2').getValue();
    if(typeof v==='number'&&v>0)agreed=v;

    const m=String(stock.getRange('S1').getValue())
      .match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/);
    if(m)date=m[0];
  }catch(e){}

  let vdr=0,campo=0;
  const priceLot={};
  const priceArt={};

  items.forEach(i=>{
    const p=num_(i.price);
    vdr+=num_(i.fiduciary)*p;
    campo+=num_(i.samm)*p;

    if(p){
      priceLot[itemKey_(i.article,i.lot)]=p;
      const ak=clean_(i.article).toLocaleLowerCase();
      if(!priceArt[ak])priceArt[ak]=p;
    }
  });

  // Valor de lo cargado desde la app (sin contar anulados)
  let appIn=0,appOut=0;

  movements.forEach(m=>{
    if(clean_(m.status).toUpperCase()==='ANULADO')return;

    if(isThirdDeposit_(m.deposit))return; // Sammartino no cuenta para el acuerdo
    const isCampo=isCampoDeposit_(m.deposit);
    if(FIDUCIARY_SCOPE==='vdr'&&isCampo)return;
    if(FIDUCIARY_SCOPE==='campo'&&!isCampo)return;

    const p=priceLot[itemKey_(m.article,m.lot)]||
            priceArt[clean_(m.article).toLocaleLowerCase()]||0;

    appIn+=num_(m.income)*p;
    appOut+=num_(m.outcome)*p;
  });

  const value=FIDUCIARY_SCOPE==='vdr'?vdr
    :FIDUCIARY_SCOPE==='campo'?campo
    :vdr+campo;

  const r2=x=>Math.round(x*100)/100;

  return {
    agreed:r2(agreed),
    date:date,
    scope:FIDUCIARY_SCOPE,
    value:r2(value),
    vdr:r2(vdr),
    campo:r2(campo),
    appIn:r2(appIn),
    appOut:r2(appOut)
  };
} 
