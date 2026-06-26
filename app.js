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

// عدّاد الزيارات (خدمة مجانية بدون تسجيل). غيّر namespace لاسم فريد لموقعك.
const COUNTER = { enabled: true, namespace: "natiga-minya-2026", key: "visits" };

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
const State = { students: [], index: new Map(), source: "loading", govTotal: 0, current: null };

async function loadData() {
  try {
    const res = await fetch(CONFIG.dataPath);
    if (res.ok) {
      const data = await res.json();
      const f = data.fields;
      const gi = {}; // grade key → column index
      const meta = {
        seat: f.indexOf("seat"), name: f.indexOf("name"), school: f.indexOf("school"),
        gender: f.indexOf("gender"), sector: f.indexOf("sector"),
        govRank: f.indexOf("govRank"), schoolRank: f.indexOf("schoolRank"), schoolCount: f.indexOf("schoolCount"),
      };
      [...MAIN_SUBJECTS, GRAND_TOTAL, ...EXTRA_SUBJECTS].forEach(s => { gi[s.key] = f.indexOf(s.key); });
      State.govTotal = data.govTotal || 0;
      const students = data.rows.map(r => {
        const grades = {};
        for (const k in gi) grades[k] = gi[k] >= 0 ? r[gi[k]] : null;
        const st = {
          seat: String(r[meta.seat]),
          name: r[meta.name] || "",
          school: r[meta.school] || "",
          gender: r[meta.gender] || "",
          sector: r[meta.sector] || "",
          govRank: meta.govRank >= 0 ? r[meta.govRank] : null,
          schoolRank: meta.schoolRank >= 0 ? r[meta.schoolRank] : null,
          schoolCount: meta.schoolCount >= 0 ? r[meta.schoolCount] : null,
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
  certBtn: document.getElementById("certBtn"),
  brandHome: document.getElementById("brandHome"),
  counterWrap: document.getElementById("counterWrap"),
  visitCount: document.getElementById("visitCount"),
};
let mode = "seat";

/* ━━━ عدّاد الزيارات ━━━ */
async function loadCounter() {
  if (!COUNTER.enabled || !dom.counterWrap) return;
  const { namespace: ns, key } = COUNTER;
  const firstVisit = !sessionStorage.getItem("nt_visited");
  let value = null;
  // 1) Abacus
  try {
    const r = await fetch(`https://abacus.jasoncameron.dev/${firstVisit ? "hit" : "get"}/${ns}/${key}`);
    if (r.ok) { const j = await r.json(); if (typeof j.value === "number") value = j.value; }
  } catch (e) { /* offline */ }
  // 2) احتياطي عند أول زيارة فقط
  if (value == null && firstVisit) {
    try {
      const r = await fetch(`https://api.counterapi.dev/v1/${ns}/${key}/up`);
      if (r.ok) { const j = await r.json(); if (typeof j.count === "number") value = j.count; }
    } catch (e) {}
  }
  if (value == null) { dom.counterWrap.hidden = true; return; }
  if (firstVisit) sessionStorage.setItem("nt_visited", "1");
  dom.counterWrap.hidden = false;
  animateCount(dom.visitCount, value);
}

function animateCount(node, to) {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || to < 1) { node.textContent = Number(to).toLocaleString("ar-EG"); return; }
  const dur = 900, t0 = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = Math.round(to * eased).toLocaleString("ar-EG");
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

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
  State.current = student;
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

  // شريط الترتيب (المدرسة / المحافظة)
  if (student.schoolRank != null || student.govRank != null) {
    const arNum = n => (n == null ? "—" : Number(n).toLocaleString("ar-EG"));
    const CAP = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v4c0 1.2 2.5 2.2 5 2.2s5-1 5-2.2v-4"/><path d="M21 9v4"/></svg>`;
    const PIN = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.6 7-13a7 7 0 1 0-14 0c0 5.4 7 13 7 13z"/><circle cx="12" cy="9" r="2.6"/></svg>`;
    const TROPHY = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0zM6 5H4a2 2 0 0 0 0 4h2m12-4h2a2 2 0 0 1 0 4h-2"/></svg>`;
    const ranks = el("div", "ranks reveal");
    ranks.style.animationDelay = ".12s";
    const sFirst = student.schoolRank === 1, gFirst = student.govRank === 1;
    const card = (cls, icon, label, rank, total, ordinalFirst) => `
      <div class="rank-card${cls}">
        <span class="rank-card__ic">${icon}</span>
        <span class="rank-card__txt">
          <span class="rank-card__label">${label}</span>
          <span class="rank-card__value">${rank === 1 ? "<b>الأول</b>" : "<b>" + arNum(rank) + "</b>"} <small>من ${arNum(total)}</small></span>
        </span>
      </div>`;
    ranks.innerHTML =
      card(sFirst ? " is-first" : "", sFirst ? TROPHY : CAP, "الترتيب على المدرسة", student.schoolRank, student.schoolCount) +
      card(gFirst ? " is-first" : "", gFirst ? TROPHY : PIN, "الترتيب على المحافظة", student.govRank, State.govTotal);
    inner.appendChild(ranks);
  }

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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   شهادة تقدير (PNG عالية الدقة — تُرسم على Canvas)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const toAr = s => String(s).replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

async function onCertClick() {
  if (!State.current) return;
  const btn = dom.certBtn;
  btn.classList.add("is-busy");
  const old = btn.querySelector("span") ? null : btn.lastChild;
  try {
    await drawAppreciation(State.current);
  } catch (e) {
    console.error(e);
    alert("تعذّر إنشاء الشهادة. حاول مرة أخرى.");
  } finally {
    btn.classList.remove("is-busy");
  }
}

function star8(x, ctx, cx, cy, rOut, rIn) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 ? rIn : rOut;
    ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

async function drawAppreciation(student) {
  const r = computeResult(student);
  const isF = (student.gender || "").includes("أنث");
  const C = {
    ink: "#0e4a42", inkDeep: "#07332d", gold: "#c2982f", goldB: "#d8af49",
    paper: "#f3ecd8", sheet: "#fffdf7", muted: "#7a6f59", line: "#d8cdb4",
  };
  // تأكد من تحميل الخطوط قبل الرسم
  try {
    await Promise.all([
      document.fonts.load("700 130px 'Aref Ruqaa'"),
      document.fonts.load("400 90px 'Aref Ruqaa'"),
      document.fonts.load("700 64px 'Reem Kufi'"),
      document.fonts.load("500 44px 'Tajawal'"),
      document.fonts.load("700 44px 'Tajawal'"),
    ]);
    await document.fonts.ready;
  } catch (e) { /* fallback fonts */ }

  const W = 2000, H = 1414, cx = W / 2;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "middle";

  const center = (t, y, font, color, ls) => {
    x.font = font; x.fillStyle = color;
    if (ls) x.letterSpacing = ls + "px";
    x.fillText(t, cx, y);
    if (ls) x.letterSpacing = "0px";
  };

  // خلفية
  x.fillStyle = C.paper; x.fillRect(0, 0, W, H);
  // ورقة داخلية
  const m = 56;
  x.fillStyle = C.sheet;
  x.beginPath(); x.roundRect(m, m, W - 2 * m, H - 2 * m, 22); x.fill();

  // علامة مائية (نجمة باهتة)
  x.save(); x.globalAlpha = 0.05; x.fillStyle = C.ink;
  star8(x, x, cx, H / 2 + 40, 470, 200); x.fill(); x.restore();

  // إطار ذهبي مزدوج
  x.strokeStyle = C.gold; x.lineWidth = 5;
  x.beginPath(); x.roundRect(m + 22, m + 22, W - 2 * (m + 22), H - 2 * (m + 22), 14); x.stroke();
  x.strokeStyle = C.goldB; x.lineWidth = 2;
  x.beginPath(); x.roundRect(m + 34, m + 34, W - 2 * (m + 34), H - 2 * (m + 34), 10); x.stroke();
  // زخارف الأركان
  [[m + 70, m + 70], [W - m - 70, m + 70], [m + 70, H - m - 70], [W - m - 70, H - m - 70]].forEach(([px, py]) => {
    x.fillStyle = C.gold; star8(x, x, px, py, 24, 10); x.fill();
  });

  // شعار علوي
  x.save(); x.translate(cx, 218);
  x.fillStyle = C.gold; star8(x, x, 0, 0, 54, 23); x.fill();
  x.fillStyle = C.sheet; x.beginPath(); x.arc(0, 0, 20, 0, 7); x.fill();
  x.fillStyle = C.ink; x.beginPath(); x.arc(0, 0, 11, 0, 7); x.fill();
  x.restore();

  // العنوان
  center("شهادة تقدير", 360, "700 132px 'Aref Ruqaa', serif", C.inkDeep);
  // فاصل زخرفي
  x.strokeStyle = C.gold; x.lineWidth = 2.5;
  x.beginPath(); x.moveTo(cx - 230, 442); x.lineTo(cx - 34, 442); x.moveTo(cx + 34, 442); x.lineTo(cx + 230, 442); x.stroke();
  x.fillStyle = C.gold; x.font = "400 40px 'Reem Kufi'"; x.fillText("۞", cx, 444);

  // مقدمة
  center("تتقدّم مديرية التربية والتعليم بالمنيا بأطيب التهاني والتقدير", 540, "500 46px 'Tajawal', sans-serif", C.muted);
  center(isF ? "إلى الطالبة المتميّزة" : "إلى الطالب المتميّز", 606, "700 48px 'Reem Kufi', sans-serif", C.ink);

  // الاسم
  center(student.name || "—", 712, "700 92px 'Aref Ruqaa', serif", C.inkDeep);
  // تسطير الاسم
  const nameW = Math.min(W - 320, x.measureText(student.name || "—").width + 120);
  x.strokeStyle = C.gold; x.lineWidth = 3;
  x.beginPath(); x.moveTo(cx - nameW / 2, 772); x.lineTo(cx - 22, 772); x.moveTo(cx + 22, 772); x.lineTo(cx + nameW / 2, 772); x.stroke();
  x.fillStyle = C.gold; x.beginPath(); x.moveTo(cx, 764); x.lineTo(cx + 11, 772); x.lineTo(cx, 780); x.lineTo(cx - 11, 772); x.closePath(); x.fill();

  // سبب التكريم
  const reason = r.kind === "pass"
    ? `${isF ? "لحصولها" : "لحصوله"} على تقدير «${r.grade}» في نتيجة الشهادة الإعدادية`
    : `${isF ? "لاجتيازها" : "لاجتيازه"} امتحان الشهادة الإعدادية`;
  center(reason, 840, "500 48px 'Tajawal', sans-serif", C.ink);
  center(`للعام الدراسي ${toAr("2025 / 2026")}`, 902, "500 40px 'Tajawal', sans-serif", C.muted);

  // بطاقات الإحصاء (صفّان × بطاقتان)
  const chip = (label, value, ccx, ccy) => {
    x.font = "700 40px 'Reem Kufi', sans-serif";
    const vw = x.measureText(value).width;
    x.font = "500 34px 'Tajawal', sans-serif";
    const lw = x.measureText(label).width;
    const w = Math.max(vw, lw) + 90, h = 116;
    x.fillStyle = "rgba(194,152,47,0.10)";
    x.strokeStyle = C.line; x.lineWidth = 2;
    x.beginPath(); x.roundRect(ccx - w / 2, ccy - h / 2, w, h, 16); x.fill(); x.stroke();
    x.fillStyle = C.muted; x.font = "500 32px 'Tajawal', sans-serif"; x.fillText(label, ccx, ccy - 26);
    x.fillStyle = C.inkDeep; x.font = "700 42px 'Reem Kufi', sans-serif"; x.fillText(value, ccx, ccy + 22);
    return w;
  };
  const total = toAr(fmtNum(r.total)), max = toAr(GRAND_TOTAL.max), pct = toAr(r.pct.toFixed(1));
  // الصف الأول: المجموع + النسبة
  chip("المجموع الكلي", `${total} / ${max}`, cx + 250, 1030);
  chip("النسبة المئوية", `${pct}٪`, cx - 250, 1030);
  // الصف الثاني: الترتيبان (إن وُجدا)
  if (student.schoolRank != null || student.govRank != null) {
    const sr = student.schoolRank === 1 ? "الأول" : toAr(student.schoolRank);
    const gr = student.govRank === 1 ? "الأول" : toAr(student.govRank);
    chip("الترتيب على المدرسة", `${sr} / ${toAr(student.schoolCount)}`, cx + 250, 1166);
    chip("الترتيب على المحافظة", `${gr} / ${toAr(State.govTotal)}`, cx - 250, 1166);
  } else {
    center(student.school || "", 1150, "500 40px 'Tajawal', sans-serif", C.muted);
  }

  // ختم سفلي + التوقيع
  x.save(); x.translate(cx, 1268);
  x.strokeStyle = C.gold; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 78, 0, 7); x.stroke();
  x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 66, 0, 7); x.stroke();
  x.fillStyle = C.gold; x.font = "400 26px 'Reem Kufi'"; x.fillText("تقدير", 0, -22);
  x.fillStyle = C.inkDeep; x.font = "700 46px 'Aref Ruqaa'"; x.fillText(r.kind === "pass" ? r.grade.split(" ")[0] : "ناجح", 0, 18);
  x.restore();

  // التذييل: رقم الجلوس + المدرسة
  x.fillStyle = C.muted; x.font = "500 32px 'Tajawal', sans-serif";
  x.textAlign = "right"; x.fillText(`رقم الجلوس: ${toAr(student.seat)}`, W - m - 60, H - m - 70);
  x.textAlign = "left"; x.fillText(`${student.school || ""}`, m + 60, H - m - 70);
  x.textAlign = "center";

  // تنزيل
  const blob = await new Promise(res => cv.toBlob(res, "image/png"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `شهادة-تقدير-${student.seat}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ━━━ التهيئة ━━━ */
async function init() {
  dom.segBtns.forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  dom.form.addEventListener("submit", doSearch);
  dom.backBtn.addEventListener("click", goHome);
  dom.printBtn.addEventListener("click", () => window.print());
  dom.certBtn.addEventListener("click", onCertClick);
  dom.brandHome.addEventListener("click", e => { e.preventDefault(); goHome(); });

  loadCounter();

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
