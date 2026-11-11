// Invoice presentation settings are independent of website branding and order data.
const INVOICE_SETTINGS_URL = FIREBASE_URL.replace(/\/data\.json$/, '/invoice-settings.json');
const INVOICE_SETTINGS_CACHE = 'versel_invoice_settings';
let invoicePreferences = {};
let invoiceLogoDraft = '';
let invoiceLogoVersion = 0;
let invoiceLogoLoading = false;
let invoicePreferencesSaving = false;
let invoiceExportBusy = false;
let invoiceExportCancelled = false;
let invoiceRowsLimit = 60;
let invoiceDownloadUrls = [];
try { invoicePreferences = sanitizeInvoicePreferences(JSON.parse(localStorage.getItem(INVOICE_SETTINGS_CACHE) || '{}')); } catch (_) {}

function il(ar, en) { return currentLang === 'en' ? en : ar; }
function sanitizeInvoicePreferences(value) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    company: typeof v.company === 'string' ? v.company.slice(0, 160) : '',
    contact: typeof v.contact === 'string' ? v.contact.slice(0, 160) : '',
    thanks: typeof v.thanks === 'string' ? v.thanks.slice(0, 200) : '',
    theme: v.theme === 'white' ? 'white' : 'navy',
    logo: typeof v.logo === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.logo) && v.logo.length < 1500000 ? v.logo : ''
  };
}
async function invoiceSettingsRequest(options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(INVOICE_SETTINGS_URL, {...options, signal: controller.signal, cache: 'no-store'});
    if (!response.ok) throw new Error('Invoice settings HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}
async function loadInvoicePreferences() {
  try {
    const value = await invoiceSettingsRequest();
    if (invoicePreferencesSaving || invoiceExportBusy || document.getElementById('invoiceSettingsModal').classList.contains('open')) return;
    invoicePreferences = sanitizeInvoicePreferences(value);
    try { localStorage.setItem(INVOICE_SETTINGS_CACHE, JSON.stringify(invoicePreferences)); } catch (_) {}
    if (document.getElementById('invoiceModal').classList.contains('open')) applyInvoicePreferences(document.getElementById('invoiceEl'));
  } catch (_) { /* The last cached settings remain usable offline. */ }
}
function applyInvoicePreferences(el, preferences = invoicePreferences) {
  const p = sanitizeInvoicePreferences(preferences);
  el.setAttribute('data-invoice-theme', p.theme);
  el.querySelector('.company-name').textContent = p.company || t('invCompanyName');
  el.querySelector('.inv-thanks').textContent = p.thanks || t('invThanks');
  const contact = el.querySelector('#inv_seller_contact');
  contact.textContent = p.contact;
  contact.hidden = !p.contact;
  const logo = el.querySelector('#invoiceLogo');
  logo.hidden = !p.logo;
  if (p.logo) logo.src = p.logo;
  else logo.removeAttribute('src');
}
function renderInvoiceContent(order, el, preferences = invoicePreferences) {
  const put = (id, text) => { el.querySelector('#' + id).textContent = text; };
  put('inv_client', tt(order.name) || '—'); put('inv_num', order.id); put('inv_date', order.date || '—');
  put('inv_phone', order.phone ? `${t('invPhoneLabel')} : ${order.phone}` : `${t('invPhoneLabel')} : —`);
  put('inv_pay', tt(order.payment) || '—');
  put('inv_del', (Number(order.delivery) || 0).toFixed(3) + ' KD');
  put('inv_total', (Number(order.total) || 0).toFixed(3) + ' KD');
  const items = order.items || [];
  el.querySelector('#inv_body').innerHTML = items.map(item => `<tr><td>${escapeHtml(iname(item))}</td><td>${(Number(item.price) || 0).toFixed(3)} KD</td><td>${escapeHtml(String(item.qty))}</td><td><strong>${((Number(item.price) || 0) * (Number(item.qty) || 0)).toFixed(3)} KD</strong></td></tr>`).join('') + '<tr class="erow"><td colspan="4"></td></tr>'.repeat(Math.max(0, 2 - items.length));
  applyInvoicePreferences(el, preferences);
}
function updateInvoiceLabels() {
  const labels = {
    invoiceTabLabel: ['الفواتير', 'Invoices'], invoiceCenterTitle: ['الفواتير', 'Invoices'],
    invoiceSettingsTitle: ['إعدادات الفاتورة', 'Invoice settings'], invoiceSettingsRowTitle: ['إعدادات الفاتورة', 'Invoice settings'],
    invoiceSettingsRowSub: ['لوقو مستقل، اسم المنشأة، والخلفية', 'Separate logo, business name, and background'],
    invoicePeriodLabel: ['الفترة', 'Period'], invoiceYearLabel: ['السنة', 'Year'], invoiceFromLabel: ['من تاريخ', 'From'], invoiceToLabel: ['إلى تاريخ', 'To'],
    invoiceSearchLabel: ['بحث برقم الفاتورة أو اسم العميل', 'Search invoice number or customer'],
    invoiceBatchDownload: ['تحميل فواتير الفترة PDF', 'Download period invoices as PDF'], invoiceCenterSettingsButton: ['إعدادات الفاتورة', 'Invoice settings'],
    invoiceBatchCancel: ['إيقاف التجهيز', 'Stop export'], invoiceListMore: ['عرض أكثر', 'Show more'],
    invoiceBatchHint: ['كل طلب له فاتورة. الفترات الكبيرة تتقسم إلى ملفات، كل ملف حتى 50 فاتورة. الطلبات بدون تاريخ تظهر في «كل الفواتير» فقط.', 'Each order has an invoice. Large exports are split into files of up to 50 invoices. Undated orders appear only in All invoices.'],
    invoiceSettingsHint: ['إعدادات مستقلة عن صورة الموقع. PNG الشفاف يحتفظ بخلفيته الشفافة.', 'Independent of the website logo. Transparent PNG images keep their transparency.'],
    invoiceLogoLabel: ['لوقو الفاتورة — PNG أو JPG أو WebP', 'Invoice logo — PNG, JPG, or WebP'], invoiceLogoRemove: ['بدون لوقو', 'No logo'],
    invoiceCompanyLabel: ['اسم المنشأة', 'Business name'], invoiceContactLabel: ['هاتف أو معلومات المنشأة', 'Business contact details'],
    invoiceThanksLabel: ['عبارة أسفل الفاتورة', 'Footer message'], invoiceThemeLabel: ['خلفية الفاتورة', 'Invoice background'],
    invoiceSettingsSave: ['حفظ الإعدادات', 'Save settings'], invoiceSettingsCancel: ['إلغاء', 'Cancel']
  };
  Object.entries(labels).forEach(([id, value]) => { document.getElementById(id).textContent = il(...value); });
  const periods = [['كل الفواتير','All invoices'],['السنة الحالية','This year'],['اختيار سنة','Choose year'],['آخر 30 يوم','Last 30 days'],['الشهر السابق','Previous month'],['من تاريخ إلى تاريخ','Date range']];
  [...document.getElementById('invoicePeriod').options].forEach((option, i) => { option.textContent = il(...periods[i]); });
  const themes = document.getElementById('invoiceTheme').options;
  themes[0].textContent = il('كحلي', 'Navy'); themes[1].textContent = il('أبيض', 'White');
}
function invoiceDate(value) {
  const s = String(value || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  const ar = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !ar) return null;
  const [year, month, day] = iso ? [+iso[1], +iso[2], +iso[3]] : [+ar[3], +ar[2], +ar[1]];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}
function invoiceDateRange(period, now, year, fromText, toText) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = null, to = null;
  if (period === 'thisYear' || period === 'year') {
    const y = period === 'thisYear' ? today.getFullYear() : Number(year);
    if (!Number.isInteger(y) || y < 1900 || y > 9999) return {error: true};
    from = new Date(y, 0, 1); to = new Date(y, 11, 31);
  } else if (period === 'last30') {
    to = today; from = new Date(today); from.setDate(from.getDate() - 29);
  } else if (period === 'lastMonth') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1); to = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (period === 'custom') {
    from = fromText ? invoiceDate(fromText) : null; to = toText ? invoiceDate(toText) : null;
    if ((!from && !to) || (fromText && !from) || (toText && !to)) return {error: true};
  }
  return from && to && from > to ? {error: true} : {from, to};
}
function currentInvoiceSelection() {
  const period = document.getElementById('invoicePeriod').value;
  const range = invoiceDateRange(period, new Date(), document.getElementById('invoiceYear').value, document.getElementById('invoiceFrom').value, document.getElementById('invoiceTo').value);
  if (range.error) return {error: true, orders: []};
  const search = document.getElementById('invoiceSearch').value.trim().toLocaleLowerCase();
  const selected = withoutDeletedOrders(orders).filter(order => {
    const date = invoiceDate(order.date);
    if (period !== 'all' && (!date || (range.from && date < range.from) || (range.to && date > range.to))) return false;
    return !search || `${order.id} ${order.name || ''}`.toLocaleLowerCase().includes(search);
  }).slice().sort((a,b) => (invoiceDate(b.date) || 0) - (invoiceDate(a.date) || 0));
  return {orders: selected, period, range};
}
async function openInvoiceCenter() {
  if (!isOwner()) return;
  updateInvoiceLabels();
  const select = document.getElementById('invoiceYear');
  const previous = select.value;
  const years = new Set([new Date().getFullYear()]);
  orders.forEach(order => { const d = invoiceDate(order.date); if (d) years.add(d.getFullYear()); });
  select.replaceChildren(...[...years].sort((a,b) => b-a).map(year => new Option(String(year), String(year))));
  if ([...years].includes(Number(previous))) select.value = previous;
  document.getElementById('invoiceCenterModal').classList.add('open');
  invoiceRowsLimit = 60; invoicePeriodChanged();
  await loadInvoicePreferences();
}
function closeInvoiceCenter() {
  if (invoiceExportBusy) invoiceExportCancelled = true;
  document.getElementById('invoiceCenterModal').classList.remove('open');
}
function invoicePeriodChanged() {
  const period = document.getElementById('invoicePeriod').value;
  document.getElementById('invoiceYearField').hidden = period !== 'year';
  document.getElementById('invoiceFromField').hidden = period !== 'custom';
  document.getElementById('invoiceToField').hidden = period !== 'custom';
  invoiceFiltersChanged();
}
function invoiceFiltersChanged() { invoiceRowsLimit = 60; renderInvoiceCenter(); }
function moreInvoiceRows() { invoiceRowsLimit += 60; renderInvoiceCenter(); }
function renderInvoiceCenter() {
  const selection = currentInvoiceSelection();
  const list = document.getElementById('invoiceCenterList');
  list.replaceChildren();
  document.getElementById('invoiceSummary').textContent = selection.error ? il('تأكد من الفترة: تاريخ البداية لازم يكون قبل النهاية.', 'Check the date range: From must not be after To.') : `${selection.orders.length} ${il('فاتورة', 'invoices')} · ${selection.orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0).toFixed(3)} KD`;
  document.getElementById('invoiceBatchDownload').disabled = invoiceExportBusy || selection.error || !selection.orders.length;
  selection.orders.slice(0, invoiceRowsLimit).forEach(order => {
    const row = document.createElement('div'); row.className = 'invoice-list-row';
    const info = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = `#${order.id} · ${order.name || '—'}`;
    const sub = document.createElement('small'); sub.textContent = `${order.date || il('بدون تاريخ', 'No date')} · ${(Number(order.total) || 0).toFixed(3)} KD`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'manage-btn'; button.textContent = il('عرض', 'View');
    button.onclick = () => showInvoice(order.id);
    info.append(title, sub); row.append(info, button); list.append(row);
  });
  if (!selection.error && !selection.orders.length) list.textContent = il('ما فيه فواتير بهالفترة.', 'No invoices in this period.');
  document.getElementById('invoiceListMore').hidden = selection.orders.length <= invoiceRowsLimit;
}
function updateInvoiceLogoPreview() {
  const img = document.getElementById('invoiceLogoPreview'); img.hidden = !invoiceLogoDraft;
  if (invoiceLogoDraft) img.src = invoiceLogoDraft; else img.removeAttribute('src');
}
async function openInvoiceSettings() {
  if (!isOwner() || invoiceExportBusy) return;
  await loadInvoicePreferences(); updateInvoiceLabels();
  invoiceLogoDraft = invoicePreferences.logo || ''; invoiceLogoLoading = false; ++invoiceLogoVersion;
  document.getElementById('invoiceSettingsSave').disabled = false;
  document.getElementById('invoiceLogoFile').value = '';
  document.getElementById('invoiceCompany').value = invoicePreferences.company || '';
  document.getElementById('invoiceContact').value = invoicePreferences.contact || '';
  document.getElementById('invoiceThanks').value = invoicePreferences.thanks || '';
  document.getElementById('invoiceTheme').value = invoicePreferences.theme || 'navy';
  updateInvoiceLogoPreview(); document.getElementById('invoiceSettingsModal').classList.add('open');
}
function closeInvoiceSettings() {
  if (invoicePreferencesSaving) return;
  ++invoiceLogoVersion; invoiceLogoLoading = false;
  document.getElementById('invoiceSettingsModal').classList.remove('open');
}
function removeInvoiceLogo() {
  ++invoiceLogoVersion; invoiceLogoDraft = ''; invoiceLogoLoading = false;
  document.getElementById('invoiceLogoFile').value = ''; document.getElementById('invoiceSettingsSave').disabled = false;
  updateInvoiceLogoPreview();
}
async function previewInvoiceLogo(input) {
  const version = ++invoiceLogoVersion, file = input.files[0];
  if (!file || invoicePreferencesSaving) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10*1024*1024) {
    input.value = ''; showToast(il('اختر صورة PNG أو JPG أو WebP بحد أقصى 10 ميغابايت', 'Choose PNG, JPG, or WebP up to 10 MB'), true); return;
  }
  invoiceLogoLoading = true; document.getElementById('invoiceSettingsSave').disabled = true;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (version !== invoiceLogoVersion) return;
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000) throw new Error('Image too large');
    const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    // No background fill: preserve the source image's alpha channel.
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const logo = canvas.toDataURL('image/png');
    if (logo.length >= 1500000) throw new Error('Image too large');
    invoiceLogoDraft = logo; updateInvoiceLogoPreview();
  } catch (_) { if (version === invoiceLogoVersion) showToast(il('تعذر قراءة الصورة، جرّب صورة أصغر', 'Could not read the image; try a smaller image'), true); }
  finally { URL.revokeObjectURL(url); if (version === invoiceLogoVersion) { invoiceLogoLoading = false; document.getElementById('invoiceSettingsSave').disabled = false; } }
}
async function saveInvoiceSettings() {
  if (!isOwner() || invoicePreferencesSaving || invoiceLogoLoading || invoiceExportBusy) return;
  const value = sanitizeInvoicePreferences({logo: invoiceLogoDraft, company: document.getElementById('invoiceCompany').value.trim(), contact: document.getElementById('invoiceContact').value.trim(), thanks: document.getElementById('invoiceThanks').value.trim(), theme: document.getElementById('invoiceTheme').value});
  invoicePreferencesSaving = true;
  const controls = [...document.querySelectorAll('#invoiceSettingsModal input, #invoiceSettingsModal select, #invoiceSettingsModal button')];
  controls.forEach(control => { control.disabled = true; });
  try {
    await invoiceSettingsRequest({method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(value)});
    invoicePreferences = value;
    try { localStorage.setItem(INVOICE_SETTINGS_CACHE, JSON.stringify(value)); } catch (_) {}
    applyInvoicePreferences(document.getElementById('invoiceEl'));
    invoicePreferencesSaving = false; closeInvoiceSettings(); showToast(il('✓ تم حفظ إعدادات الفاتورة', '✓ Invoice settings saved'));
  } catch (_) { showToast(il('تعذر الحفظ، تأكد من الاتصال وحاول مرة ثانية', 'Could not save; check your connection and try again'), true); }
  finally { invoicePreferencesSaving = false; controls.forEach(control => { control.disabled = false; }); }
}
function addInvoiceCanvasToPdf(pdf, canvas, firstPage) {
  const width = 190, pageHeight = 277;
  const sliceHeight = Math.max(1, Math.floor(canvas.width * pageHeight / width));
  for (let top = 0; top < canvas.height; top += sliceHeight) {
    if (!firstPage || top > 0) pdf.addPage('a4', 'portrait');
    const slice = document.createElement('canvas'); slice.width = canvas.width; slice.height = Math.min(sliceHeight, canvas.height - top);
    slice.getContext('2d').drawImage(canvas, 0, top, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    pdf.addImage(slice.toDataURL('image/jpeg', .88), 'JPEG', 10, 10, width, slice.height * width / slice.width);
    slice.width = slice.height = 1;
  }
}
function cancelInvoiceExport() { invoiceExportCancelled = true; }
function clearInvoiceDownloads() {
  invoiceDownloadUrls.forEach(url => URL.revokeObjectURL(url)); invoiceDownloadUrls = [];
  document.getElementById('invoiceDownloadLinks').replaceChildren();
}
async function exportInvoiceBatch() {
  if (!isOwner() || invoiceExportBusy) return;
  const selection = currentInvoiceSelection();
  if (selection.error || !selection.orders.length) return;
  if (!window.jspdf || typeof html2canvas !== 'function') { showToast(il('تعذر تحميل أدوات PDF، حدّث الصفحة وتأكد من الإنترنت', 'PDF tools unavailable; reload and check your connection'), true); return; }
  const snapshot = selection.orders.map(order => ({id:order.id,name:order.name,phone:order.phone,date:order.date,total:order.total,delivery:order.delivery,payment:order.payment,items:JSON.parse(JSON.stringify(order.items || []))}));
  const preferences = {...invoicePreferences};
  const batchDate = new Date().toISOString().slice(0,10);
  const periodName = selection.period === 'all' ? 'all' : `${selection.range.from ? localInvoiceDate(selection.range.from) : 'start'}_${selection.range.to ? localInvoiceDate(selection.range.to) : 'end'}`;
  invoiceExportBusy = true; invoiceExportCancelled = false; clearInvoiceDownloads(); renderInvoiceCenter();
  document.getElementById('invoiceBatchCancel').hidden = false;
  const stage = document.createElement('div'); stage.className = 'invoice-export-stage'; stage.setAttribute('aria-hidden','true');
  const invoice = document.getElementById('invoiceEl').cloneNode(true); invoice.removeAttribute('id'); invoice.style.width = '760px'; invoice.style.maxWidth = 'none'; stage.append(invoice); document.body.append(stage);
  let completed = 0;
  try {
    for (let offset = 0; offset < snapshot.length && !invoiceExportCancelled; offset += 50) {
      const pdf = new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
      const group = snapshot.slice(offset, offset + 50);
      let groupCompleted = 0;
      for (const order of group) {
        if (invoiceExportCancelled) break;
        document.getElementById('invoiceBatchProgress').textContent = il(`جاري تجهيز الفاتورة ${completed + 1} من ${snapshot.length}…`, `Preparing invoice ${completed + 1} of ${snapshot.length}…`);
        renderInvoiceContent(order, invoice, preferences);
        const canvas = await _captureInvoice(invoice, 1.5);
        addInvoiceCanvasToPdf(pdf, canvas, groupCompleted === 0); canvas.width = canvas.height = 1;
        ++completed; ++groupCompleted;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      if (groupCompleted) {
        const url = URL.createObjectURL(pdf.output('blob')); invoiceDownloadUrls.push(url);
        const link = document.createElement('a'); link.className = 'invoice-download'; link.href = url;
        link.download = `invoices_${periodName}_${batchDate}_part-${invoiceDownloadUrls.length}.pdf`;
        link.textContent = il(`تحميل PDF — الجزء ${invoiceDownloadUrls.length} (${groupCompleted} فاتورة)`, `Download PDF — part ${invoiceDownloadUrls.length} (${groupCompleted} invoices)`);
        document.getElementById('invoiceDownloadLinks').append(link);
      }
    }
    document.getElementById('invoiceBatchProgress').textContent = il(`${invoiceExportCancelled ? 'تم الإيقاف.' : 'تم التجهيز.'} جاهز للتحميل: ${completed} من ${snapshot.length} فاتورة. اضغط روابط PDF أدناه.`, `${invoiceExportCancelled ? 'Stopped.' : 'Ready.'} ${completed} of ${snapshot.length} invoices ready. Use the PDF links below.`);
  } catch(e) {
    console.error('Invoice export failed', e);
    document.getElementById('invoiceBatchProgress').textContent = il('تعذر إكمال التجهيز. الأجزاء الظاهرة جاهزة؛ جرّب فترة أصغر للباقي.', 'Export could not finish. Completed parts remain available; try a smaller period for the rest.');
  } finally {
    stage.remove(); invoiceExportBusy = false; document.getElementById('invoiceBatchCancel').hidden = true; renderInvoiceCenter();
  }
}
function localInvoiceDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
updateInvoiceLabels();
loadInvoicePreferences();
