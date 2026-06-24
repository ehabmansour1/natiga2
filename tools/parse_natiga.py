# -*- coding: utf-8 -*-
"""
محوّل اسطوانات نتيجة الشهادة الإعدادية (PDF) إلى JSON موحّد.
يعمل مع التخطيطات الثلاثة (شمال/جنوب/وسط) دون مواضع ثابتة:
  - يرتكز على عمود "النوع" (ذكر/أنثى) الذي يقع دائمًا يسار الدرجات.
  - يتحقق من الدرجات عبر: المجموع الكلي = مجموع المواد الست.

التشغيل:
    python tools/parse_natiga.py                 # كل الملفات -> data/students.json
    python tools/parse_natiga.py --validate      # فحص + عينات (لا يكتب JSON)
    python tools/parse_natiga.py --pages=15       # حدّ صفحات لكل ملف (للاختبار)
    python tools/parse_natiga.py --only=وسط
"""
import sys, os, json, re
import fitz  # PyMuPDF

# ── المواد ودرجاتها العظمى (للتحقق وللإقصاء عند الخطأ) ──
ACADEMIC = ["arabic", "foreign", "social", "algebra", "geometry", "mathTotal", "science", "grandTotal"]
EXTRAS   = ["activity1", "activity2", "religion", "art", "computer"]
MAXES = {
    "arabic": 80, "foreign": 60, "social": 40, "algebra": 30, "geometry": 30,
    "mathTotal": 60, "science": 40, "grandTotal": 280,
    "activity1": 20, "activity2": 20, "religion": 40, "art": 20, "computer": 20,
}
SUM_KEYS = ["arabic", "foreign", "social", "algebra", "geometry", "science"]

NUM_RE = re.compile(r"^\d{1,3}(\.\d+)?$")

def is_ar(t):
    return any('؀' <= c <= 'ۿ' for c in t)

def fix_arabic(s):
    if not s:
        return ""
    s = s.replace("ٌ", "ي").replace("ً", "").replace("ـ", "")
    s = s.replace("دمحم", "محمد").replace("هللا", "الله")
    return s.strip()

def cx(w):
    return (w[0] + w[2]) / 2

def find_gender(row):
    """يعيد (token, gender, system) لخلية النوع/النظام."""
    for w in row:
        t = w[4]
        if "انث" in t or "ذكر" in t or t.startswith("ذ"):
            gender = "أنثى" if "انث" in t else "ذكر"
            rest = t.replace("انثى", "").replace("انثي", "").replace("ذكر", "")
            return w, gender, rest
    return None, "", ""

def detect_system(row, gtoken, gx, arabic_x):
    """النظام: توكن يحتوي نظام/منازل/انتساب بين النوع والعربي، أو مدمج مع النوع."""
    cand = []
    for w in row:
        t = w[4]
        if any(k in t for k in ["نظام", "منازل", "نتساب", "نتسب", "منتسب"]):
            cand.append(t)
    blob = " ".join(cand)
    if "منازل" in blob:
        return "منازل"
    if "نتساب" in blob or "نتسب" in blob or "منتسب" in blob:
        return "انتساب"
    if "نظام" in blob:
        return "نظامي"
    return ""

def parse_number(t):
    t = t.replace("٫", ".")
    return float(t) if NUM_RE.match(t) else None

def parse_row(row):
    gtoken, gender, _g = find_gender(row)
    if gtoken is None:
        return None
    gx = cx(gtoken)

    # ── الدرجات: توكنات رقمية يسار النوع ──
    grade_tokens = []
    for w in row:
        if cx(w) < gx - 2:
            v = parse_number(w[4])
            if v is not None:
                grade_tokens.append((cx(w), v))
    grade_tokens.sort(key=lambda t: -t[0])  # يمين -> يسار
    nums = [v for _, v in grade_tokens]
    if len(nums) < 8:
        return None
    academic = nums[0:8]
    extras = (nums[8:13] + [None] * 5)[:5]

    g = {}
    for i, k in enumerate(ACADEMIC):
        g[k] = academic[i]
    for i, k in enumerate(EXTRAS):
        g[k] = extras[i]

    # تحقق المجموع الكلي
    if g["grandTotal"] is None:
        return None
    s = sum(g[k] for k in SUM_KEYS if g[k] is not None)
    if abs(s - g["grandTotal"]) > 0.75:
        return None  # صف غير صالح/تالف

    # إقصاء القيم الخارجة عن الحد الأعلى (أخطاء استخراج نادرة)
    for k, mx in MAXES.items():
        if g.get(k) is not None and g[k] > mx + 0.5:
            g[k] = None

    # ── الحقول النصية والمعرّفات يمين النوع ──
    right = [w for w in row if cx(w) > gx]
    # المعرّفات الرقمية
    seat = code = natid = ""
    seat_x = code_x = natid_x = None
    for w in right:
        t = w[4]
        if t.isdigit():
            if len(t) >= 12:
                natid, natid_x = t, cx(w)
            elif 6 <= len(t) <= 11 and code == "":
                # الأبعد يمينًا بعد الجلوس = الكود
                pass
    # الجلوس = أكبر x رقمي ، الكود = الرقمي التالي (6-11 رقم)
    digit_ws = sorted([w for w in right if w[4].isdigit()], key=lambda w: -cx(w))
    for w in digit_ws:
        t = w[4]
        if seat == "" and len(t) <= 6:
            seat, seat_x = t, cx(w)
        elif code == "" and 6 <= len(t) <= 11 and (seat_x is None or cx(w) < seat_x):
            code, code_x = t, cx(w)
        elif len(t) >= 12:
            natid, natid_x = t, cx(w)
    if not seat:
        return None

    # الاسم: توكنات عربية بين الرقم القومي والكود
    lo = natid_x if natid_x else gx
    hi = code_x if code_x else (seat_x - 1 if seat_x else 1e9)
    name_ws = [w for w in right if is_ar(w[4]) and lo < cx(w) < hi]
    name = fix_arabic(" ".join(t for t in [w[4] for w in sorted(name_ws, key=lambda w: -cx(w))]))

    # الإدارة + المدرسة: توكنات عربية بين النوع والرقم القومي (باستثناء النوع/النظام)
    sys_words = set()
    for w in right:
        if any(k in w[4] for k in ["نظام", "منازل", "نتساب", "نتسب", "منتسب"]) or w[4] == gtoken[4]:
            sys_words.add(id(w))
    ds = [w for w in right if is_ar(w[4]) and gx < cx(w) < (natid_x if natid_x else hi) and id(w) not in sys_words]
    ds.sort(key=lambda w: -cx(w))
    directorate, school = split_dir_school(ds)

    system = detect_system(row, gtoken, gx, None)

    return {
        "seat": seat, "code": code, "nationalId": natid,
        "name": name, "directorate": fix_arabic(directorate), "school": fix_arabic(school),
        "gender": gender, "system": system, "grades": g,
    }

def split_dir_school(ds):
    """يفصل الإدارة (يمين) عن المدرسة (يسار) عند أكبر فجوة أفقية."""
    if not ds:
        return "", ""
    if len(ds) == 1:
        return ds[0][4], ""
    centers = [cx(w) for w in ds]
    gaps = [(centers[i] - centers[i + 1], i) for i in range(len(centers) - 1)]
    maxgap, idx = max(gaps)
    if maxgap < 34:
        # لا فجوة واضحة: اعتبر التوكن الأيمن إدارة والباقي مدرسة
        idx = 0
    dir_tokens = ds[:idx + 1]
    sch_tokens = ds[idx + 1:]
    directorate = " ".join(w[4] for w in dir_tokens)
    school = " ".join(w[4] for w in sch_tokens)
    return directorate, school

def parse_page(page):
    words = page.get_text("words")
    pw = page.rect.width
    anchors = []
    for w in words:
        if cx(w) > pw - 130 and w[4].isdigit() and 3 <= len(w[4]) <= 6:
            anchors.append((w[1], w[4]))
    seen_y = set()
    out = []
    for y0, seat in anchors:
        key = round(y0)
        if key in seen_y:
            continue
        seen_y.add(key)
        row = [w for w in words if abs((w[1] + w[3]) / 2 - (y0 + 6)) <= 8 or abs(w[1] - y0) <= 7]
        rec = parse_row(row)
        if rec:
            out.append(rec)
    return out

def process_pdf(path, sector, max_pages=None):
    doc = fitz.open(path)
    out = []
    n = doc.page_count if max_pages is None else min(max_pages, doc.page_count)
    for i in range(n):
        out.extend(parse_page(doc[i]))
    # إزالة التكرار حسب الجلوس داخل الملف
    dedup = {}
    for r in out:
        r["sector"] = sector
        dedup[r["seat"]] = r
    return list(dedup.values())

SECTORS = [
    ("اسطوان قطاع شمال ناجحون 2026نهائى.pdf", "شمال"),
    ("اسطوانة الدور الأول 2026 قطاع جنوب.pdf", "جنوب"),
    ("اسطوانة وسط.pdf", "وسط"),
]

def main():
    base = os.path.join(os.path.dirname(__file__), "..")
    natiga = os.path.join(base, "natiga")
    validate = "--validate" in sys.argv
    max_pages = None
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--pages="):
            max_pages = int(a.split("=", 1)[1])
        if a.startswith("--only="):
            only = a.split("=", 1)[1]

    allst, stats = [], []
    for fname, sector in SECTORS:
        if only and only != sector and only not in fname:
            continue
        p = os.path.join(natiga, fname)
        if not os.path.exists(p):
            stats.append(f"MISSING {fname}")
            continue
        st = process_pdf(p, sector, max_pages)
        allst.extend(st)
        seats = [s["seat"] for s in st]
        stats.append(f"[{sector}] rows={len(st)} unique={len(set(seats))} "
                     f"seat_range={min(seats,key=int) if seats else '-'}..{max(seats,key=int) if seats else '-'}")

    rep = ["=== STATS ==="] + stats
    rep.append(f"TOTAL={len(allst)} global_unique_seats={len(set(s['seat'] for s in allst))}")
    for k in ["activity1", "activity2", "religion", "art", "computer"]:
        vals = [s["grades"][k] for s in allst if s["grades"].get(k) is not None]
        if vals:
            rep.append(f"  {k}: {min(vals)}..{max(vals)} n={len(vals)}")

    out_txt = os.path.join(base, "_parse_report.txt")
    samp = allst[:5] + (allst[len(allst)//2: len(allst)//2 + 3] if len(allst) > 8 else [])
    with open(out_txt, "w", encoding="utf-8") as f:
        f.write("\n".join(rep) + "\n\n=== SAMPLES ===\n")
        for s in samp:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    if not validate:
        write_compact(allst, os.path.join(base, "data", "students.json"), out_txt)
    print("OK -> _parse_report.txt")

def _rank_competition(members):
    """ترتيب تنافسي تنازلي حسب المجموع الكلي (المتساوون نفس الترتيب)."""
    mem = [s for s in members if s["grades"].get("grandTotal") is not None]
    mem.sort(key=lambda s: -s["grades"]["grandTotal"])
    last, rank = None, 0
    for i, s in enumerate(mem):
        gt = s["grades"]["grandTotal"]
        if gt != last:
            rank, last = i + 1, gt
        s["_rank"] = rank

def compute_ranks(students):
    """يحسب الترتيب على المحافظة وعلى المدرسة لكل طالب."""
    from collections import defaultdict
    # المحافظة (كل القطاعات)
    _rank_competition(students)
    for s in students:
        s["govRank"] = s.pop("_rank", None)
    gov_total = sum(1 for s in students if s["grades"].get("grandTotal") is not None)
    # المدرسة (مجموعة حسب القطاع + الإدارة + المدرسة لتفادي دمج المتشابهة)
    groups = defaultdict(list)
    for s in students:
        groups[(s.get("sector", ""), s.get("directorate", ""), s.get("school", ""))].append(s)
    for members in groups.values():
        _rank_competition(members)
        cnt = sum(1 for s in members if s["grades"].get("grandTotal") is not None)
        for s in members:
            s["schoolRank"] = s.pop("_rank", None)
            s["schoolCount"] = cnt
    return gov_total

SECTOR_CODE = {"شمال": "N", "جنوب": "S", "وسط": "C"}

def _num(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v

def write_compact(students, path, out_txt):
    """تنسيق مدمج: [seat,name,school,gender,sector, ...13 درجة, govRank, schoolRank, schoolCount]."""
    gov_total = compute_ranks(students)
    GKEYS = ACADEMIC + EXTRAS
    EXTRA_COLS = ["govRank", "schoolRank", "schoolCount"]
    rows = []
    for s in students:
        g = s["grades"]
        rows.append([
            s["seat"], s["name"], s["school"], s["gender"], SECTOR_CODE.get(s["sector"], s["sector"]),
            *[_num(g.get(k)) for k in GKEYS],
            *[s.get(k) for k in EXTRA_COLS],
        ])
    payload = {
        "fields": ["seat", "name", "school", "gender", "sector"] + GKEYS + EXTRA_COLS,
        "sectorMap": {"N": "شمال", "S": "جنوب", "C": "وسط"},
        "govTotal": gov_total,
        "rows": rows,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(path)
    with open(out_txt, "a", encoding="utf-8") as f:
        f.write(f"\nWROTE {path} ({size/1024/1024:.2f} MB, {len(rows)} students, govTotal={gov_total})\n")

if __name__ == "__main__":
    main()
