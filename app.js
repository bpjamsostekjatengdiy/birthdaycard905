const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const sampleCsv = `name,birth_date,wa,photo_url
Andi Pratama,1992-09-22,081234567890,https://hcis.bpjsketenagakerjaan.go.id/hcis/sunfish5upload/ehrm/photo/244570780.jpg
Siti Rahma,1990-09-22,6281122233344,
Budi Santoso,1988-09-29,081298765432,
Maya Lestari,1995-10-04,6285211122233,
Dian Permata,1991-10-04,081377788899`;

const defaultEmployeeSheetUrl =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQPVNPKX-CAp6Qw8dssXsBf_KzfJldqOyxpiaqGnPHHQY9zmxNYxJWXYHea6vp6siFiYSb-yCqQTXNE/pubhtml?gid=0&single=true";
const templateStorageKey = "birthday-card-template-v1";

const state = {
  people: [],
  selectedIds: new Set(),
  generatedCards: [],
  displayDate: new Date(),
  templateImage: null,
  templateName: "",
};

const elements = {
  calendarGrid: document.querySelector("#calendarGrid"),
  currentMonth: document.querySelector("#currentMonth"),
  currentYear: document.querySelector("#currentYear"),
  todayList: document.querySelector("#todayList"),
  todayDateLabel: document.querySelector("#todayDateLabel"),
  todayCount: document.querySelector("#todayCount"),
  selectAllToday: document.querySelector("#selectAllToday"),
  selectAllTodayWrap: document.querySelector("#selectAllTodayWrap"),
  selectedCount: document.querySelector("#selectedCount"),
  templateInput: document.querySelector("#templateInput"),
  templateStatus: document.querySelector("#templateStatus"),
  resetTemplateBtn: document.querySelector("#resetTemplateBtn"),
  waDialog: document.querySelector("#waDialog"),
  waPersonName: document.querySelector("#waPersonName"),
  waPreviewImage: document.querySelector("#waPreviewImage"),
  waCaptionInput: document.querySelector("#waCaptionInput"),
  waFileName: document.querySelector("#waFileName"),
  downloadWaImageBtn: document.querySelector("#downloadWaImageBtn"),
  openWaLink: document.querySelector("#openWaLink"),
  previewDialog: document.querySelector("#previewDialog"),
  previewList: document.querySelector("#previewList"),
  generationStatus: document.querySelector("#generationStatus"),
  downloadAllBtn: document.querySelector("#downloadAllBtn"),
  canvas: document.querySelector("#cardCanvas"),
};

document.querySelector("#prevMonthBtn").addEventListener("click", () => moveMonth(-1));
document.querySelector("#nextMonthBtn").addEventListener("click", () => moveMonth(1));
document.querySelector("#todayBtn").addEventListener("click", goToday);
document.querySelector("#generateBtn").addEventListener("click", generateSelectedCards);
elements.selectAllToday.addEventListener("change", toggleSelectAllToday);
elements.downloadAllBtn.addEventListener("click", () => downloadAllGeneratedCards());
elements.downloadWaImageBtn.addEventListener("click", downloadCurrentWaImage);
elements.openWaLink.addEventListener("click", openWaWithCopiedCard);
elements.waCaptionInput.addEventListener("input", updateOpenWaLinkCaption);
elements.templateInput.addEventListener("change", importTemplate);
elements.resetTemplateBtn.addEventListener("click", resetTemplate);

initApp();

async function initApp() {
  await loadSavedTemplate();
  await loadDefaultEmployeeData();
}

function moveMonth(step) {
  state.displayDate = new Date(state.displayDate.getFullYear(), state.displayDate.getMonth() + step, 1);
  render();
}

function goToday() {
  state.displayDate = new Date();
  render();
}

function loadCsv(csvText) {
  const rows = parseCsv(csvText);
  state.people = rows
    .map((row, index) => normalizePerson(row, index))
    .filter((person) => person.name && person.birthDate && !Number.isNaN(person.birthDate.getTime()));
  state.selectedIds.clear();
  render();
}

async function loadDefaultEmployeeData() {
  try {
    elements.todayList.className = "person-list empty-state";
    elements.todayList.textContent = "Memuat data karyawan...";
    const response = await fetch(toCsvUrl(defaultEmployeeSheetUrl));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadCsv(await response.text());
  } catch (error) {
    console.warn("Gagal memuat data karyawan default, memakai data contoh.", error);
    loadCsv(sampleCsv);
  }
}

function toCsvUrl(value) {
  const url = new URL(value);
  if (url.hostname === "docs.google.com" && url.pathname.includes("/spreadsheets/")) {
    url.pathname = url.pathname.replace(/\/pubhtml$/, "/pub");
    url.searchParams.set("output", "csv");
  }
  return url.toString();
}

async function importTemplate(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  state.templateImage = await urlToImage(dataUrl);
  state.templateName = file.name;
  elements.templateStatus.textContent = `Template aktif: ${file.name}`;
  await saveTemplate(dataUrl, file.name);
}

async function resetTemplate() {
  state.templateImage = null;
  state.templateName = "";
  elements.templateInput.value = "";
  elements.templateStatus.textContent = "Template bawaan aktif.";
  localStorage.removeItem(templateStorageKey);
  try {
    await fetch("/template", { method: "DELETE" });
  } catch (error) {
    console.warn("Template baku di server belum bisa dihapus.", error);
  }
}

async function loadSavedTemplate() {
  if (await loadServerTemplate()) return;

  try {
    const saved = JSON.parse(localStorage.getItem(templateStorageKey) || "null");
    if (!saved?.dataUrl) return;
    state.templateImage = await urlToImage(saved.dataUrl);
    state.templateName = saved.name || "template tersimpan";
    elements.templateStatus.textContent = `Template aktif: ${state.templateName}`;
    await saveTemplate(saved.dataUrl, state.templateName);
  } catch (error) {
    console.warn("Template tersimpan tidak bisa dimuat.", error);
    localStorage.removeItem(templateStorageKey);
  }
}

async function loadServerTemplate() {
  try {
    const metaResponse = await fetch("/template-meta", { cache: "no-store" });
    if (!metaResponse.ok) return false;
    const meta = await metaResponse.json();
    state.templateImage = await urlToImage(`/saved-template?v=${encodeURIComponent(meta.savedAt || Date.now())}`);
    state.templateName = meta.name || "template baku";
    elements.templateStatus.textContent = `Template aktif: ${state.templateName}`;
    return true;
  } catch (error) {
    console.warn("Template baku server tidak bisa dimuat.", error);
    return false;
  }
}

async function saveTemplate(dataUrl, name) {
  try {
    localStorage.setItem(templateStorageKey, JSON.stringify({ dataUrl, name }));
    const response = await fetch("/template", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dataUrl, name }),
    });
    if (!response.ok) throw new Error(await response.text());
  } catch (error) {
    console.warn("Template tidak bisa disimpan permanen.", error);
    elements.templateStatus.textContent = `Template aktif: ${name}. Tidak bisa disimpan sebagai template baku.`;
  }
}

function normalizePerson(row, index) {
  const name = pick(row, ["name", "nama", "nama pegawai", "employee", "karyawan"]);
  const birthValue = pick(row, ["birth_date", "tanggal_lahir", "tanggal lahir", "tgl_lahir", "dob", "birthday"]);
  const birthDate = parseDate(birthValue);
  const wa = pick(row, ["wa", "whatsapp", "no_wa", "phone", "nomor_wa"]);
  const photoUrl = pick(row, ["photo_url", "photolink", "foto", "photo", "image"]);
  const jabatan = pick(row, ["jabatan", "position", "job_title", "job title"]);
  const unitKerja = pick(row, ["unit kerja", "kantor cabang", "unit", "cabang", "branch"]);

  return {
    id: `${slugify(name)}-${index}`,
    name,
    birthDate,
    wa,
    photoUrl,
    jabatan,
    unitKerja,
  };
}

function pick(row, keys) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value.trim()]));
  for (const key of keys) {
    if (normalized[key]) return normalized[key];
  }
  return "";
}

function parseDate(value) {
  if (!value) return null;
  const clean = value.trim();
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  const mdy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);

  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  if (mdy) return new Date(2000 + Number(mdy[3]), Number(mdy[2]) - 1, Number(mdy[1]));
  return new Date(clean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === "," && !insideQuote) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuote) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(Boolean)) rows.push(row);

  const headers = rows.shift()?.map((item) => item.trim()) || [];
  return rows.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] || ""])));
}

function render() {
  renderCalendar();
  renderToday();
  renderSelectedCount();
}

function renderCalendar() {
  const year = state.displayDate.getFullYear();
  const month = state.displayDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const today = new Date();

  elements.currentMonth.textContent = monthNames[month];
  elements.currentYear.textContent = String(year);
  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const birthdays = peopleOn(date);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    cell.title = birthdays.length
      ? `${birthdays.length} ulang tahun: ${birthdays.map((person) => person.name).join(", ")}`
      : `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    if (date.getMonth() !== month) cell.classList.add("is-muted");
    if (sameDate(date, today)) cell.classList.add("is-today");
    if (birthdays.length) cell.classList.add("has-birthday");
    cell.innerHTML = `
      <span class="date-number">${date.getDate()}</span>
      ${birthdays.length ? `<span class="birthday-dot">${birthdays.length}</span>` : ""}
      ${birthdays.length ? renderBirthdayTooltip(date, birthdays) : ""}
    `;
    cell.addEventListener("click", () => {
      if (!sameDate(date, new Date())) return;
      birthdays.forEach((person) => state.selectedIds.add(person.id));
      render();
    });
    elements.calendarGrid.appendChild(cell);
  }
}

function renderBirthdayTooltip(date, birthdays) {
  return `
    <span class="birthday-tooltip" role="tooltip">
      <strong>${formatBirthday(date)}</strong>
      ${birthdays.map((person) => `<span>${escapeHtml(person.name)}</span>`).join("")}
    </span>
  `;
}

function renderToday() {
  const birthdays = peopleOn(new Date());
  elements.todayDateLabel.textContent = formatTodayWithYear();
  elements.todayCount.textContent = String(birthdays.length);

  if (!birthdays.length) {
    elements.todayList.className = "person-list empty-state";
    elements.todayList.textContent = "Belum ada data ulang tahun hari ini.";
    elements.selectAllTodayWrap.hidden = true;
    elements.selectAllToday.checked = false;
    elements.selectAllToday.indeterminate = false;
    return;
  }

  elements.selectAllTodayWrap.hidden = false;
  elements.todayList.className = "person-list";
  elements.todayList.innerHTML = "";
  birthdays.forEach((person) => elements.todayList.appendChild(createPersonCard(person)));
  syncSelectAllToday();
}

function createPersonCard(person) {
  const card = document.createElement("label");
  card.className = "person-card";
  const avatar = person.photoUrl
    ? `<span class="avatar has-photo"><img src="${avatarPhotoUrl(person.photoUrl)}" alt="Foto ${escapeHtml(person.name)}" onerror="this.remove(); this.parentElement.textContent='${initials(person.name)}';" /></span>`
    : `<span class="avatar">${initials(person.name)}</span>`;
  card.innerHTML = `
    <input type="checkbox" ${state.selectedIds.has(person.id) ? "checked" : ""} />
    ${avatar}
    <span>
      <span class="person-name">${escapeHtml(person.name)}</span>
      <span class="person-meta">${formatBirthday(person.birthDate)} · ${escapeHtml(person.wa || "WA belum ada")}</span>
    </span>
  `;
  card.querySelector("input").addEventListener("change", (event) => {
    if (event.target.checked) state.selectedIds.add(person.id);
    else state.selectedIds.delete(person.id);
    renderSelectedCount();
    syncSelectAllToday();
  });
  return card;
}

function renderSelectedCount() {
  const todayIds = new Set(getTodayBirthdayPeople().map((person) => person.id));
  const count = Array.from(state.selectedIds).filter((id) => todayIds.has(id)).length;
  elements.selectedCount.textContent = `${count} orang`;
}

function toggleSelectAllToday(event) {
  const today = getTodayBirthdayPeople();
  if (event.target.checked) {
    today.forEach((person) => state.selectedIds.add(person.id));
  } else {
    today.forEach((person) => state.selectedIds.delete(person.id));
  }
  renderToday();
  renderSelectedCount();
}

function syncSelectAllToday() {
  const today = getTodayBirthdayPeople();
  const selectedCount = today.filter((person) => state.selectedIds.has(person.id)).length;
  elements.selectAllToday.checked = today.length > 0 && selectedCount === today.length;
  elements.selectAllToday.indeterminate = selectedCount > 0 && selectedCount < today.length;
}

function peopleOn(date) {
  return state.people.filter(
    (person) => person.birthDate.getMonth() === date.getMonth() && person.birthDate.getDate() === date.getDate()
  );
}

function getTodayBirthdayPeople() {
  return peopleOn(new Date());
}

function avatarPhotoUrl(url) {
  return `/proxy-image?url=${encodeURIComponent(url)}`;
}

async function generateSelectedCards() {
  const selected = getTodayBirthdayPeople();
  if (!selected.length) {
    alert("Tidak ada karyawan yang ulang tahun hari ini.");
    return;
  }

  state.selectedIds.clear();
  selected.forEach((person) => state.selectedIds.add(person.id));
  render();
  elements.previewList.innerHTML = "";
  state.generatedCards = [];
  elements.previewDialog.dataset.cardCount = String(selected.length);
  elements.generationStatus.textContent = "Generate dikunci untuk ulang tahun hari ini. Membuka link foto dan menempelkan ke template...";
  elements.previewDialog.showModal();

  for (const person of selected) {
    try {
      await drawCard(person);
      const dataUrl = elements.canvas.toDataURL("image/png");
      const filename = `${slugify(person.name)}-birthday-card.png`;
      state.generatedCards.push({ person, dataUrl, filename });
      addPreviewCard(person, dataUrl, filename);
      elements.generationStatus.textContent = `Preview siap: ${elements.previewList.children.length} dari ${selected.length} card.`;
      await wait(80);
    } catch (error) {
      addPreviewError(person, error);
    }
  }

  elements.generationStatus.textContent = "Preview selesai. Cek hasilnya sebelum download atau kirim WA.";
}

async function sendSelectedWa() {
  const selected = getTodayBirthdayPeople();
  if (!selected.length) {
    alert("Tidak ada karyawan yang ulang tahun hari ini.");
    return;
  }

  const firstCard = state.generatedCards.find((card) => selected.some((person) => person.id === card.person.id));
  if (firstCard) {
    openWaPreview(firstCard);
    return;
  }

  await generateSelectedCards();
  if (state.generatedCards[0]) openWaPreview(state.generatedCards[0]);
}

async function downloadAllGeneratedCards(showAlert = true) {
  if (!state.generatedCards.length) {
    if (showAlert) alert("Generate card dulu sebelum download semua.");
    return;
  }

  for (const card of state.generatedCards) {
    downloadDataUrl(card.filename, card.dataUrl);
    await wait(180);
  }
}

async function drawCard(person) {
  const canvas = elements.canvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (state.templateImage) {
    drawCover(ctx, state.templateImage, 0, 0, canvas.width, canvas.height);
  } else {
    drawDefaultTemplate(ctx);
  }

  const photo = await getPersonPhoto(person);
  const photoLayer = photo ? removeBackgroundByEdgeColor(photo) : null;

  if (state.templateImage) {
    drawUploadedTemplateContent(ctx, person, photoLayer);
  } else {
    drawDefaultCardContent(ctx, person, photoLayer);
  }
}

function drawUploadedTemplateContent(ctx, person, photoLayer) {
  if (photoLayer) {
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 8;
    drawContain(ctx, photoLayer, 347, 322, 386, 430);
    ctx.restore();
  }

  ctx.textAlign = "center";
  const identityX = 555;
  ctx.fillStyle = "#ffffff";
  const nameBottom = drawFittedWrappedText(ctx, person.name, identityX, 817, 500, 37, 24, 34, "800", 2);

  ctx.fillStyle = "#eaf2ff";
  const jobY = Math.max(nameBottom + 29, 867);
  drawFittedText(ctx, person.jabatan || "Jabatan Karyawan", identityX, jobY, 500, 21, 15, "700");
  drawFittedText(ctx, person.unitKerja || "Kantor Cabang Karyawan", identityX, jobY + 32, 500, 20, 15, "700");

  ctx.fillStyle = "#1d4ed8";
  drawFittedText(ctx, formatTodayWithYear(), identityX, 946, 420, 22, 17, "800");
}

function drawDefaultCardContent(ctx, person, photoLayer) {
  if (photoLayer) {
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 14;
    drawContain(ctx, photoLayer, 300, 175, 480, 500);
    ctx.restore();
  }

  ctx.fillStyle = "#172033";
  ctx.textAlign = "center";
  ctx.font = "700 56px Arial";
  wrapText(ctx, "Selamat Ulang Tahun", 540, 760, 860, 64);

  ctx.fillStyle = "#1d4ed8";
  ctx.font = "800 72px Arial";
  wrapText(ctx, person.name, 540, 865, 880, 84);

  ctx.fillStyle = "#4b5563";
  ctx.font = "400 34px Arial";
  wrapText(ctx, "Semoga sehat, bahagia, dan sukses selalu.", 540, 1065, 850, 46);
  ctx.fillStyle = "#8a4b0a";
  ctx.font = "700 30px Arial";
  ctx.fillText(formatBirthday(person.birthDate), 540, 1170);
}

function drawDefaultTemplate(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#eff6ff");
  gradient.addColorStop(0.52, "#ffffff");
  gradient.addColorStop(1, "#fef3c7");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, 1080, 18);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 1332, 1080, 18);
  ctx.fillStyle = "rgba(37, 99, 235, 0.1)";
  ctx.beginPath();
  ctx.arc(930, 160, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
  ctx.beginPath();
  ctx.arc(120, 1230, 220, 0, Math.PI * 2);
  ctx.fill();
}

function drawCover(ctx, image, x, y, width, height) {
  const ratio = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawContain(ctx, image, x, y, width, height) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + height - drawHeight, drawWidth, drawHeight);
}

async function getPersonPhoto(person) {
  if (!person.photoUrl) return null;
  try {
    return await urlToImage(`/proxy-image?url=${encodeURIComponent(person.photoUrl)}`);
  } catch (proxyError) {
    console.warn(`Foto ${person.name} gagal lewat proxy.`, proxyError);
    try {
      return await urlToImage(person.photoUrl);
    } catch (directError) {
      console.warn(`Foto ${person.name} tidak bisa dimuat.`, directError);
      return null;
    }
  }
}

function removeBackgroundByEdgeColor(image) {
  const canvas = document.createElement("canvas");
  const maxSize = 900;
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const originalData = new Uint8ClampedArray(data);
  const bg = sampleEdgeColor(data, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const hardThreshold = 64;
  const softThreshold = 118;

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  while (head < tail) {
    const position = queue[head];
    head += 1;
    const x = position % width;
    const y = Math.floor(position / width);

    enqueueIfBackground(x + 1, y);
    enqueueIfBackground(x - 1, y);
    enqueueIfBackground(x, y + 1);
    enqueueIfBackground(x, y - 1);
  }

  for (let pixel = 0; pixel < total; pixel += 1) {
    if (!visited[pixel]) continue;
    const index = pixel * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (isSkinTone(r, g, b)) continue;
    const distance = colorDistance(r, g, b, bg.r, bg.g, bg.b);
    if (isBlueGreenBackground(r, g, b) || distance < hardThreshold) {
      data[index + 3] = 0;
    } else if (distance < softThreshold) {
      data[index + 3] = Math.min(
        data[index + 3],
        Math.round(((distance - hardThreshold) / (softThreshold - hardThreshold)) * 255)
      );
    }
  }

  removeDetachedColorSpill(data, width, height);
  erodeGreenEdgePixels(data, width, height);
  restoreProtectedClothing(data, originalData, width, height);
  removePortraitBackdrop(data, width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;

  function enqueueIfBackground(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const pixel = y * width + x;
    if (visited[pixel]) return;

    const index = pixel * 4;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const nx = (x + 0.5) / width;
    const ny = (y + 0.5) / height;
    if (isTorsoProtectionZone(nx, ny) && !isBlueGreenBackground(r, g, b)) return;
    if (getPortraitMaskStrength(nx, ny) > 0.56 && !isBlueGreenBackground(r, g, b)) return;
    if (!isLikelyBackgroundPixel(r, g, b, bg, softThreshold)) return;

    visited[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }
}

function removeDetachedColorSpill(data, width, height) {
  const total = width * height;

  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const alpha = data[index + 3];
    if (!alpha) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (isSkinTone(r, g, b)) continue;

    if (isStrongGreenSpill(r, g, b)) {
      data[index + 3] = 0;
      continue;
    }

    if (isSoftGreenSpill(r, g, b)) {
      data[index + 1] = Math.max(r, b, Math.round(g * 0.62));
      data[index + 3] = Math.min(alpha, 150);
    }
  }
}

function erodeGreenEdgePixels(data, width, height) {
  const remove = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      if (!data[index + 3]) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      if (isSkinTone(r, g, b) || !isSoftGreenSpill(r, g, b)) continue;

      const touchesTransparent =
        data[((y - 1) * width + x) * 4 + 3] < 32 ||
        data[((y + 1) * width + x) * 4 + 3] < 32 ||
        data[(y * width + x - 1) * 4 + 3] < 32 ||
        data[(y * width + x + 1) * 4 + 3] < 32;

      if (touchesTransparent) remove.push(index);
    }
  }

  remove.forEach((index) => {
    data[index + 3] = 0;
  });
}

function restoreProtectedClothing(data, originalData, width, height) {
  const total = width * height;

  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nx = (x + 0.5) / width;
    const ny = (y + 0.5) / height;
    if (!isTorsoProtectionZone(nx, ny)) continue;

    const r = originalData[index];
    const g = originalData[index + 1];
    const b = originalData[index + 2];
    if (isBlueGreenBackground(r, g, b) || isStrongGreenSpill(r, g, b)) continue;
    if (!isLikelyClothingPixel(r, g, b)) continue;

    data[index] = r;
    data[index + 1] = g;
    data[index + 2] = b;
    data[index + 3] = Math.max(data[index + 3], Math.round(originalData[index + 3] || 255));
  }
}

function removePortraitBackdrop(data, width, height) {
  const total = width * height;

  for (let pixel = 0; pixel < total; pixel += 1) {
    const index = pixel * 4;
    const alpha = data[index + 3];
    if (!alpha) continue;

    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nx = (x + 0.5) / width;
    const ny = (y + 0.5) / height;
    if (isTorsoProtectionZone(nx, ny)) continue;
    const mask = getPortraitMaskStrength(nx, ny);
    if (mask >= 0.98) continue;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (isSkinTone(r, g, b)) continue;

    const backdrop = isLightNeutralBackdrop(r, g, b) || isSoftGreenSpill(r, g, b);
    if (!backdrop) continue;

    if (mask <= 0.02) {
      data[index + 3] = 0;
    } else {
      data[index + 3] = Math.min(alpha, Math.round(alpha * mask));
    }
  }
}

function getPortraitMaskStrength(nx, ny) {
  const head = ellipseMask(nx, ny, 0.5, 0.36, 0.26, 0.25);
  const neck = ellipseMask(nx, ny, 0.5, 0.55, 0.22, 0.16);
  let torso = 0;

  if (ny >= 0.44 && ny <= 0.99) {
    const progress = (ny - 0.44) / 0.55;
    const halfWidth = 0.24 + progress * 0.2;
    const horizontal = 1 - Math.max(0, (Math.abs(nx - 0.5) - halfWidth) / 0.1);
    const vertical = ny < 0.95 ? 1 : 1 - (ny - 0.95) / 0.04;
    torso = clamp01(Math.min(horizontal, vertical));
  }

  return Math.max(head, neck, torso);
}

function isTorsoProtectionZone(nx, ny) {
  if (ny < 0.48 || ny > 0.98) return false;
  const progress = (ny - 0.48) / 0.5;
  const halfWidth = 0.16 + progress * 0.22;
  return Math.abs(nx - 0.5) <= halfWidth;
}

function isLikelyClothingPixel(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightCloth = hsv.v > 0.52 && hsv.s < 0.24 && max - min < 58;
  const darkCloth = hsv.v < 0.5 && hsv.s < 0.55;
  return lightCloth || darkCloth || isSkinTone(r, g, b);
}

function ellipseMask(nx, ny, cx, cy, rx, ry) {
  const distance = ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2;
  if (distance <= 1) return 1;
  if (distance >= 1.42) return 0;
  return 1 - (distance - 1) / 0.42;
}

function isLightNeutralBackdrop(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return hsv.v > 0.58 && hsv.s < 0.2 && max - min < 42;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function isLikelyBackgroundPixel(r, g, b, bg, threshold) {
  if (isSkinTone(r, g, b)) return false;

  const distance = colorDistance(r, g, b, bg.r, bg.g, bg.b);
  return distance <= threshold || isBlueGreenBackground(r, g, b);
}

function isSkinTone(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return r > 78 && g > 42 && b > 28 && r > g * 1.04 && r > b * 1.18 && max - min > 15;
}

function isBlueGreenBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const hsv = rgbToHsv(r, g, b);
  const chromaGreen = hsv.h >= 42 && hsv.h <= 175 && hsv.s > 0.16 && hsv.v > 0.24;
  return chromaGreen || ((g > 76 || b > 88) && g + b > r * 1.18 && max - min > 20);
}

function isStrongGreenSpill(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  return (hsv.h >= 45 && hsv.h <= 165 && hsv.s > 0.2 && hsv.v > 0.22) || (g > 82 && g > r * 1.08 && g > b * 1.02);
}

function isSoftGreenSpill(r, g, b) {
  const hsv = rgbToHsv(r, g, b);
  return (hsv.h >= 38 && hsv.h <= 180 && hsv.s > 0.1 && hsv.v > 0.18) || (g > 68 && g > r * 1.01 && g > b * 0.96);
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;

  if (delta) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }

  if (h < 0) h += 360;
  return { h, s: max ? delta / max : 0, v: max };
}

function sampleEdgeColor(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 18));

  for (let x = 0; x < width; x += step) {
    addSample(x, 0);
    addSample(x, height - 1);
  }

  for (let y = 0; y < height; y += step) {
    addSample(0, y);
    addSample(width - 1, y);
  }

  function addSample(x, y) {
    const index = (y * width + x) * 4;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  }

  return { r: r / count, g: g / count, b: b / count };
}

function colorDistance(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function addPreviewCard(person, dataUrl, filename = `${slugify(person.name)}-birthday-card.png`) {
  const card = document.createElement("article");
  card.className = "preview-card";
  card.innerHTML = `
    <img src="${dataUrl}" alt="Preview birthday card ${escapeHtml(person.name)}" />
    <div class="preview-meta">
      <strong>${escapeHtml(person.name)}</strong>
      <div class="button-row">
        <a class="primary-btn link-btn" download="${filename}" href="${dataUrl}"><span aria-hidden="true">⬇</span> Download</a>
        <button class="success-btn link-btn" type="button"><span aria-hidden="true">💬</span> WA</button>
      </div>
    </div>
  `;
  card.querySelector("button").addEventListener("click", () => openWaPreview({ person, dataUrl, filename }));
  elements.previewList.appendChild(card);
}

function addPreviewError(person, error) {
  const card = document.createElement("article");
  card.className = "preview-card preview-error";
  card.innerHTML = `
    <div class="preview-meta">
      <strong>${escapeHtml(person.name)}</strong>
      <p class="hint">Gagal membuat preview. Link foto mungkin tidak bisa diproses canvas atau tidak bisa diambil server lokal.</p>
      <small>${escapeHtml(error.message || String(error))}</small>
    </div>
  `;
  elements.previewList.appendChild(card);
}

function downloadCanvas(filename) {
  downloadDataUrl(filename, elements.canvas.toDataURL("image/png"));
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

function openWaPreview(card) {
  const caption = makeWaCaption(card.person);
  elements.waPersonName.textContent = `Kirim ke ${card.person.name}`;
  elements.waPreviewImage.src = card.dataUrl;
  elements.waCaptionInput.value = caption;
  elements.waFileName.textContent = `File: ${card.filename}`;
  elements.downloadWaImageBtn.dataset.filename = card.filename;
  elements.downloadWaImageBtn.dataset.dataUrl = card.dataUrl;
  elements.openWaLink.dataset.dataUrl = card.dataUrl;
  elements.openWaLink.dataset.waUrl = makeWaUrl(card.person, caption);
  elements.waDialog.showModal();
}

function downloadCurrentWaImage() {
  const filename = elements.downloadWaImageBtn.dataset.filename;
  const dataUrl = elements.downloadWaImageBtn.dataset.dataUrl;
  if (filename && dataUrl) downloadDataUrl(filename, dataUrl);
}

async function copyCurrentWaImage() {
  const dataUrl = elements.openWaLink.dataset.dataUrl;
  if (!dataUrl) return false;

  try {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    return true;
  } catch {
    return false;
  }
}

function updateOpenWaLinkCaption() {
  const card = state.generatedCards.find((item) => item.filename === elements.downloadWaImageBtn.dataset.filename);
  if (!card) return;
  elements.openWaLink.dataset.waUrl = makeWaUrl(card.person, elements.waCaptionInput.value);
}

async function openWaWithCopiedCard() {
  setButtonLabel(elements.openWaLink, "…", "Copying");
  await copyCurrentWaImage();
  setButtonLabel(elements.openWaLink, "💬", "Buka WA");
  const url = elements.openWaLink.dataset.waUrl;
  if (url) window.open(url, "_blank", "noreferrer");
}

function setButtonLabel(button, icon, label) {
  button.innerHTML = `<span aria-hidden="true">${icon}</span> ${escapeHtml(label)}`;
}

function makeWaCaption(person) {
  return `Selamat Ulang Tahun ${person.name}

Semoga panjang umur, senantiasa diberikan kesehatan, kebahagiaan, keberkahan, serta kesuksesan
dalam setiap perjalanan.

Terima kasih atas dedikasi dan kontribusi terbaiknya. Semoga terus tumbuh, menginspirasi, dan membawa kebaikan bagi keluarga besar kita.

Salam Hangat
Kanwil Jateng & DIY`;
}

function makeWaUrl(person, caption = makeWaCaption(person)) {
  const number = normalizeWa(person.wa);
  return `https://wa.me/${number}?text=${encodeURIComponent(caption)}`;
}

function normalizeWa(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function getSelectedPeople() {
  return state.people.filter((person) => state.selectedIds.has(person.id));
}

function sameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatBirthday(date) {
  return `${date.getDate()} ${monthNames[date.getMonth()]}`;
}

function formatTodayWithYear() {
  const today = new Date();
  return `${today.getDate()} ${monthNames[today.getMonth()]} ${today.getFullYear()}`;
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function fileToImage(file) {
  return urlToImage(URL.createObjectURL(file));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function urlToImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Gambar tidak bisa dimuat: ${url}`));
    image.src = url;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  const lines = [];

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  lines.push(line);

  lines.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight));
}

function drawFittedText(ctx, text, x, y, maxWidth, maxSize, minSize, weight = "700") {
  const value = String(text || "").trim();
  let size = maxSize;

  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial`;
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 1;
  }

  ctx.font = `${weight} ${size}px Arial`;
  ctx.fillText(value, x, y);
}

function drawFittedWrappedText(ctx, text, x, centerY, maxWidth, maxSize, minSize, lineHeight, weight = "700", maxLines = 2) {
  const value = String(text || "").trim();
  let size = maxSize;
  let lines = [value];

  while (size >= minSize) {
    ctx.font = `${weight} ${size}px Arial`;
    lines = wrapIntoLines(ctx, value, maxWidth, maxLines);
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth && lines.length <= maxLines) break;
    size -= 1;
  }

  const actualLineHeight = Math.round(lineHeight * (size / maxSize));
  const startY = centerY - ((lines.length - 1) * actualLineHeight) / 2;
  ctx.font = `${weight} ${size}px Arial`;
  lines.forEach((line, index) => ctx.fillText(line, x, startY + index * actualLineHeight));
  return startY + (lines.length - 1) * actualLineHeight;
}

function wrapIntoLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(" ")}`.trim();
    return kept;
  }

  return lines;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
