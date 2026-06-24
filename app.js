/* ============================================================
   بوابة نتيجة الشهادة الإعدادية — محافظة المنيا 2025/2026
   بحث برقم الجلوس أو بالاسم في 83٬823 طالبًا (٣ قطاعات).
   البيانات: data/students.json (مستخرجة من اسطوانات النتيجة).
   ============================================================ */
"use strict";

/* ━━━ الإعدادات ━━━ */
const CONFIG = {
  authority: "مديرية التربية والتعليم بالمنيا",
  examTitle: "نتيجة الشهادة الإعدادية",
  year: "2025 / 2026",
  dataPath: "data/students.json",
};

/* ━━━ المواد ━━━ */
// judged: مادة يُحسب النجاح/الرسوب بناءً عليها (تظهر إشارة ✓/✕).
// الجبر والهندسة مكوّنان للرياضيات؛ الحكم يكون على "مجموع الرياضيات" فقط.
const MAIN_SUBJECTS = [
  { key: "arabic",    label: "اللغة العربية",       max: 80, min: 40, judged: true },
  { key: "foreign",   label: "اللغة الأجنبية",      max: 60, min: 30, judged: true },
  { key: "social",    label: "الدراسات الاجتماعية", max: 40, min: 20, judged: true },
  { key: "algebra",   label: "الجبر",               max: 30, min: 15 },
  { key: "geometry",  label: "الهندسة",             max: 30, min: 15 },
  { key: "mathTotal", label: "مجموع الرياضيات",     max: 60, min: 30, sum: true, judged: true },
  { key: "science",   label: "العلوم",              max: 40, min: 20, judged: true },
];
const GRAND_TOTAL = { key: "grandTotal", label: "المجموع الكلي", max: 280, min: 140, total: true, judged: true };
const EXTRA_SUBJECTS = [
  { key: "religion",  label: "التربية الدينية", max: 40, min: 20 },
  { key: "art",       label: "التربية الفنية",  max: 20, min: 10 },
  { key: "computer",  label: "الحاسب الآلي",     max: 20, min: 10 },
  { key: "activity1", label: "النشاط (1)",       max: 20, min: 10 },
  { key: "activity2", label: "النشاط (2)",       max: 20, min: 10 },
];
// المواد التي يُبنى عليها النجاح (كل منها ≥ الصغرى)، عدا المجموع الكلي.
const JUDGED_SUBJECTS = MAIN_SUBJECTS.filter(s => s.judged);

/* ━━━ أدوات ━━━ */
function toWesternDigits(s) {
  return String(s ?? "")
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);
}
// تطبيع متسامح للبحث بالاسم (يُطبّق على المخزّن والاستعلام معًا)
function normalizeAr(s) {
  return toWesternDigits(s)
    .replace(/[ً-ْٰ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
    .replace(/ؤ/g, "و")                       // ؤ → و
    .replace(/ئ/g, "ي")                       // ئ → ي
    .replace(/ى/g, "ي")                       // ى → ي
    .replace(/ة/g, "ه")                       // ة → ه
    .replace(/ق/g, "ل")                       // ق ↔ ل (تسامح مع ترميز قطاع جنوب)
    .replace(/ال/g, "لا")           // ال ↔ لا (توحيد ليغاتورة لام-ألف)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
const SECTOR_LABEL = { N: "قطاع شمال", S: "قطاع جنوب", C: "قطاع وسط", "شمال": "قطاع شمال", "جنوب": "قطاع جنوب", "وسط": "قطاع وسط" };

/* ━━━ الحالة ━━━ */
const State = { students: [], index: new Map(), source: "loading" };

async function loadData() {
  try {
    const res = await fetch(CONFIG.dataPath);
    if (res.ok) {
      const data = await res.json();
      const f = data.fields;
      const gi = {}; // grade key → column index
      const meta = { seat: f.indexOf("seat"), name: f.indexOf("name"), school: f.indexOf("school"), gender: f.indexOf("gender"), sector: f.indexOf("sector") };
      [...MAIN_SUBJECTS, GRAND_TOTAL, ...EXTRA_SUBJECTS].forEach(s => { gi[s.key] = f.indexOf(s.key); });
      const students = data.rows.map(r => {
        const grades = {};
        for (const k in gi) grades[k] = gi[k] >= 0 ? r[gi[k]] : null;
        const st = {
          seat: String(r[meta.seat]),
          name: r[meta.name] || "",
          school: r[meta.school] || "",
          gender: r[meta.gender] || "",
          sector: r[meta.sector] || "",
          grades,
        };
        st._k = normalizeAr(st.name);
        return st;
      });
      if (students.length) return { students, source: "data" };
    }
  } catch (e) {
    console.info("تعذّر تحميل قاعدة البيانات، سيتم استخدام البيانات التجريبية.", e);
  }
  // احتياطي تجريبي
  const samp = (window.SAMPLE_STUDENTS || []).map(s => ({ ...s, sector: "", _k: normalizeAr(s.name) }));
  return { students: samp, source: "sample" };
}

/* ━━━ الحسابات ━━━ */
function computeResult(student) {
  const g = student.grades;
  const total = g.grandTotal;
  const pct = total != null ? (total / GRAND_TOTAL.max) * 100 : 0;
  const failed = [];
  for (const def of JUDGED_SUBJECTS) {
    const v = g[def.key];
    if (v != null && v < def.min) failed.push(def.label);
  }
  let status, kind;
  if (failed.length === 0 && (total == null || total >= GRAND_TOTAL.min)) {
    status = "ناجح"; kind = "pass";
  } else if (failed.length <= 2) {
    status = "له دور ثانٍ"; kind = "second";
  } else {
    status = "غير حاصل على النجاح"; kind = "fail";
  }
  let grade = "—";
  if (kind === "pass") {
    if (pct >= 90) grade = "امتياز";
    else if (pct >= 80) grade = "جيد جدًا";
    else if (pct >= 65) grade = "جيد";
    else grade = "مقبول";
  }
  return { total, pct, failed, status, kind, grade };
}

/* ━━━ DOM ━━━ */
const dom = {
  searchView: document.getElementById("searchView"),
  resultView: document.getElementById("resultView"),
  form: document.getElementById("searchForm"),
  input: document.getElementById("searchInput"),
  hint: document.getElementById("searchHint"),
  segBtns: document.querySelectorAll(".seg__btn"),
  seg: document.querySelector(".seg"),
  searchBtn: document.getElementById("searchBtn"),
  statePanel: document.getElementById("statePanel"),
  matchesPanel: document.getElementById("matchesPanel"),
  certificate: document.getElementById("certificate"),
  dataBadge: document.getElementById("dataBadge"),
  backBtn: document.getElementById("backBtn"),
  printBtn: document.getElementById("printBtn"),
  brandHome: document.getElementById("brandHome"),
};
let mode = "seat";

function setMode(next) {
  mode = next;
  dom.segBtns.forEach(b => {
    const active = b.dataset.mode === next;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  dom.seg.dataset.mode = next;
  if (next === "seat") {
    dom.input.inputMode = "numeric";
    dom.input.placeholder = "أدخل رقم الجلوس";
    dom.input.setAttribute("aria-label", "رقم الجلوس");
    dom.hint.textContent = "اكتب رقم الجلوس المكوّن من أرقام ثم اضغط بحث.";
  } else {
    dom.input.inputMode = "text";
    dom.input.placeholder = "أدخل اسم الطالب (كاملًا أو جزءًا منه)";
    dom.input.setAttribute("aria-label", "اسم الطالب");
    dom.hint.textContent = "اكتب الاسم كاملًا أو جزءًا منه؛ البحث بالاسم تقريبي وقد يظهر عدة نتائج.";
  }
  dom.input.value = "";
  hidePanels();
  dom.input.focus();
}
function hidePanels() {
  dom.statePanel.hidden = true; dom.matchesPanel.hidden = true;
  dom.statePanel.innerHTML = ""; dom.matchesPanel.innerHTML = "";
}
function showLoading(msg) {
  hidePanels();
  dom.statePanel.hidden = false;
  dom.statePanel.innerHTML =
    `<div class="loader" role="status"><span></span><span></span><span></span></div>
     <p class="panel__text" style="margin-top:14px">${msg || "جارٍ البحث…"}</p>`;
}
function showEmpty(msg) {
  hidePanels();
  dom.statePanel.hidden = false;
  dom.statePanel.innerHTML =
    `<div class="panel__icon">🔍</div><h3 class="panel__title">لا توجد نتيجة</h3><p class="panel__text">${msg}</p>`;
}
function showMatches(list, total) {
  hidePanels();
  dom.matchesPanel.hidden = false;
  const more = total > list.length ? ` (تُعرض أول ${list.length} من ${total})` : "";
  dom.matchesPanel.appendChild(el("p", "matches__head", `وُجد ${total} طالبًا${more} — اختر الاسم لعرض النتيجة:`));
  list.forEach((s, i) => {
    const card = el("button", "match");
    card.type = "button";
    card.style.animationDelay = `${Math.min(i, 12) * 0.03}s`;
    card.innerHTML =
      `<span class="match__seat">${s.seat}</span>
       <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
         <span class="match__name">${s.name}</span>
         <span class="match__school">${s.school || ""} · ${SECTOR_LABEL[s.sector] || ""}</span>
       </span>
       <span class="match__go" aria-hidden="true">‹</span>`;
    card.addEventListener("click", () => renderResult(s));
    dom.matchesPanel.appendChild(card);
  });
}

/* ━━━ جدول الدرجات ━━━ */
function gradeRow(student, def) {
  const value = student.grades[def.key];
  const judged = def.judged;
  const st = (judged && value != null) ? (value >= def.min ? "pass" : "fail") : "none";
  const tr = el("tr");
  if (def.sum) tr.className = "is-sum";
  if (def.total) tr.className = "is-total";
  const scoreCls = value == null ? "empty" : (judged ? st : "");
  const pill = value == null ? `<span class="pill none">—</span>`
    : judged ? `<span class="pill ${st}">${st === "pass" ? "✓" : "✕"}</span>`
    : `<span class="pill none">·</span>`;
  tr.innerHTML =
    `<td>${def.label}</td>
     <td class="max">${def.max}</td>
     <td class="min">${def.min}</td>
     <td class="score ${scoreCls}">${fmtNum(value)}</td>
     <td class="stat">${pill}</td>`;
  return tr;
}
function gradeTable(student, defs) {
  const table = el("table", "gtable");
  table.innerHTML = `<thead><tr><th>المادة</th><th>الكبرى</th><th>الصغرى</th><th>درجة الطالب</th><th class="stat"></th></tr></thead>`;
  const tbody = el("tbody");
  defs.forEach(def => tbody.appendChild(gradeRow(student, def)));
  table.appendChild(tbody);
  return table;
}

/* ━━━ بطاقة النتيجة ━━━ */
function renderResult(student) {
  const r = computeResult(student);
  const inner = el("div", "cert-inner");

  inner.appendChild(el("div", "cert-head reveal",
    `<p class="cert-head__auth">${CONFIG.authority}</p>
     <h2 class="cert-head__title">${CONFIG.examTitle}</h2>
     <p class="cert-head__year">العام الدراسي <span dir="ltr">${CONFIG.year}</span></p>`));

  const id = el("div", "cert-id reveal");
  id.style.animationDelay = ".05s";
  id.innerHTML =
    `<div class="id-name">
       <span class="id-name__label">اسم الطالب</span>
       <span class="id-name__value">${student.name || "—"}</span>
     </div>
     <div class="id-field id-field--seat"><p class="id-field__label">رقم الجلوس</p><p class="id-field__value">${student.seat}</p></div>
     <div class="id-field"><p class="id-field__label">النوعية</p><p class="id-field__value">${student.gender || "—"}</p></div>
     <div class="id-field" style="grid-column:1 / -1"><p class="id-field__label">المدرسة</p><p class="id-field__value">${student.school || "—"} ${student.sector ? `<span class="tag">${SECTOR_LABEL[student.sector] || ""}</span>` : ""}</p></div>`;
  inner.appendChild(id);

  const verdict = el("div", `verdict verdict--${r.kind} reveal`);
  verdict.style.animationDelay = ".1s";
  const detail = r.failed.length
    ? `مواد دور ثانٍ: ${r.failed.join("، ")}`
    : "اجتاز الطالب جميع المواد بنجاح.";
  verdict.innerHTML =
    `<div class="verdict__seal" aria-hidden="true">
       <b>${r.kind === "pass" ? (r.grade.split(" ")[0]) : (r.kind === "second" ? "د.ثان" : "—")}</b>
       <small>${r.kind === "pass" ? "التقدير" : "النتيجة"}</small>
     </div>
     <div class="verdict__main">
       <span class="verdict__status">${r.status}</span>
       <span class="verdict__detail">${detail}</span>
     </div>
     <div class="verdict__stats">
       <div class="vstat"><b>${fmtNum(r.total)}</b><span>من ${GRAND_TOTAL.max}</span></div>
       <div class="vstat"><b>${r.pct.toFixed(1)}%</b><span>النسبة المئوية</span></div>
       <div class="vstat"><b>${r.grade}</b><span>التقدير</span></div>
     </div>`;
  inner.appendChild(verdict);

  const main = el("div", "grades reveal"); main.style.animationDelay = ".15s";
  main.appendChild(el("h3", "grades__cap", "درجات المواد الدراسية"));
  main.appendChild(gradeTable(student, [...MAIN_SUBJECTS, GRAND_TOTAL]));
  inner.appendChild(main);

  const extra = el("div", "grades reveal"); extra.style.animationDelay = ".2s";
  extra.appendChild(el("h3", "grades__cap", "المواد الإضافية والأنشطة"));
  extra.appendChild(gradeTable(student, EXTRA_SUBJECTS));
  inner.appendChild(extra);

  inner.appendChild(el("div", "cert-foot reveal",
    `<span>تاريخ الإصدار: <span dir="ltr">${new Date().toLocaleDateString("ar-EG")}</span></span>
     <span class="cert-foot__sign"><b>مدير الإدارة التعليمية</b></span>`));

  dom.certificate.innerHTML = "";
  dom.certificate.appendChild(inner);
  dom.searchView.hidden = true;
  dom.resultView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ━━━ البحث ━━━ */
function doSearch(e) {
  e?.preventDefault();
  const raw = dom.input.value.trim();
  if (!raw) { dom.input.focus(); return; }
  if (State.source === "loading") { showLoading("جارٍ تحميل قاعدة البيانات…"); return; }

  if (mode === "seat") {
    const seat = toWesternDigits(raw).replace(/\D/g, "");
    const student = State.index.get(seat);
    if (student) renderResult(student);
    else showEmpty(`لم نعثر على طالب برقم الجلوس <strong dir="ltr">${seat || raw}</strong>. تأكد من الرقم وحاول مرة أخرى.`);
    return;
  }

  const tokens = normalizeAr(raw).split(" ").filter(Boolean);
  if (!tokens.length) { dom.input.focus(); return; }
  const matches = [];
  for (const s of State.students) {
    if (tokens.every(t => s._k.includes(t))) { matches.push(s); if (matches.length > 300) break; }
  }
  if (matches.length === 0)
    showEmpty(`لم نعثر على طالب باسم <strong>${raw}</strong>. جرّب جزءًا من الاسم أو ابحث برقم الجلوس.`);
  else if (matches.length === 1)
    renderResult(matches[0]);
  else
    showMatches(matches.slice(0, 60), matches.length);
}

function goHome() {
  dom.resultView.hidden = true;
  dom.searchView.hidden = false;
  dom.input.value = "";
  hidePanels();
  dom.input.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ━━━ التهيئة ━━━ */
async function init() {
  dom.segBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  dom.form.addEventListener("submit", doSearch);
  dom.backBtn.addEventListener("click", goHome);
  dom.printBtn.addEventListener("click", () => window.print());
  dom.brandHome.addEventListener("click", e => { e.preventDefault(); goHome(); });

  dom.dataBadge.hidden = false;
  dom.dataBadge.classList.add("is-loading");
  dom.dataBadge.textContent = "جارٍ تحميل قاعدة بيانات النتائج…";
  dom.input.focus();

  const data = await loadData();
  State.students = data.students;
  State.source = data.source;
  State.index = new Map();
  for (const s of data.students) State.index.set(toWesternDigits(s.seat).replace(/\D/g, ""), s);

  dom.dataBadge.classList.remove("is-loading");
  if (data.source === "sample") {
    dom.dataBadge.textContent = "بيانات تجريبية — لم يتم العثور على قاعدة البيانات";
  } else {
    dom.dataBadge.textContent = `جاهز للبحث — ${State.students.length.toLocaleString("ar-EG")} طالب وطالبة`;
    dom.dataBadge.classList.add("is-ready");
  }
}
document.addEventListener("DOMContentLoaded", init);
