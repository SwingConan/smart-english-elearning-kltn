import argparse
import base64
import concurrent.futures
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.request
from pathlib import Path
from PIL import Image
import pymupdf

REPO_ROOT = Path(__file__).resolve().parents[2]
TEST_SRC_ROOT = REPO_ROOT / 'Test'
RAW_CACHE_ROOT = REPO_ROOT / '.local-storage' / 'toeic-raw-pages'
MEDIA_OUT_ROOT = REPO_ROOT / '.local-storage' / 'toeic-practice-media'
BANK_OUT_ROOT = REPO_ROOT / 'apps' / 'api' / 'content' / 'toeic-mock-v1'

TESTS_CONFIG = {
    1: {
        'slug': 'test-1',
        'uuid': '91000000-0000-4000-8000-000000000001',
        'title': 'TOEIC Practice Test 1 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 1 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 1' / 'Đề Listening - Test 1.PDF',
        'reading_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 1' / 'Đề Reading - Test 1.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 1' / 'Đáp án Test 1.pdf',
        'audio_dir': TEST_SRC_ROOT / 'NEW TOEIC - TEST 1' / 'File Nghe Từng Câu',
    },
    2: {
        'slug': 'test-2',
        'uuid': '91000000-0000-4000-8000-000000000002',
        'title': 'TOEIC Practice Test 2 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 2 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 2' / 'Đề Listening - Test 2.pdf',
        'reading_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 2' / 'Đề Reading - Test 2.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 2' / 'Đáp án Test 2.pdf',
        'audio_dir': TEST_SRC_ROOT / 'NEW TOEIC - TEST 2' / 'File Nghe từng câu - Test 2',
    },
    3: {
        'slug': 'test-3',
        'uuid': '91000000-0000-4000-8000-000000000003',
        'title': 'TOEIC Practice Test 3 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 3 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 3' / 'TEST 3 - LISTENING.pdf',
        'reading_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 3' / 'TEST 3 - READING.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 3' / 'ĐÁP ÁN TEST 3.pdf',
        'audio_dir': TEST_SRC_ROOT / 'NEW TOEIC - TEST 3' / 'File nghe từng câu Test 3',
    },
    4: {
        'slug': 'test-4',
        'uuid': '91000000-0000-4000-8000-000000000004',
        'title': 'TOEIC Practice Test 4 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 4 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 4' / 'Đề Listening Test 4.pdf',
        'reading_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 4' / 'Đề Reading Test 4.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 4' / 'Đáp án Test 4.pdf',
        'audio_dir': TEST_SRC_ROOT / 'NEW TOEIC - TEST 4' / 'File nghe từng câu',
    },
    5: {
        'slug': 'test-5',
        'uuid': '91000000-0000-4000-8000-000000000005',
        'title': 'TOEIC Practice Test 5 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 5 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'Listening Test 5.pdf',
        'reading_pdf': TEST_SRC_ROOT / 'Reading Test 5.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'Đáp án Test 5.pdf',
        'audio_dir': TEST_SRC_ROOT / 'File nghe từng câu - Test 5',
    },
    6: {
        'slug': 'test-6',
        'uuid': '91000000-0000-4000-8000-000000000006',
        'title': 'TOEIC Practice Test 6 — Full 200 câu L&R',
        'description': 'Bộ đề mô phỏng thi thật TOEIC Listening & Reading số 6 (200 câu · 120 phút), audio phát tuần tự 1 lần và cắt ảnh gốc Part 6–7.',
        'listening_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 6' / 'Listening Test 6.pdf',
        'reading_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 6' / 'Reading Test 6.pdf',
        'answer_pdf': TEST_SRC_ROOT / 'NEW TOEIC - TEST 6' / 'Dap an Test 6.pdf',
        'audio_dir': TEST_SRC_ROOT / 'NEW TOEIC - TEST 6' / 'File nghe tung cau Test 6',
    },
}

LISTENING_GROUPS_SPEC = (
    [(i, i, 1) for i in range(1, 7)] +
    [(i, i, 2) for i in range(7, 32)] +
    [(i, i + 2, 3) for i in range(32, 71, 3)] +
    [(i, i + 2, 4) for i in range(71, 101, 3)]
)


def load_gemini_key() -> str:
    env_path = REPO_ROOT / 'apps' / 'api' / '.env'
    for line in env_path.read_text(encoding='utf-8').splitlines():
        if line.startswith('GEMINI_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise RuntimeError('GEMINI_API_KEY missing in apps/api/.env')


GEMINI_KEY = load_gemini_key()


MODEL_ROTATION = [
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite-preview',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3-flash-preview',
]


def call_gemini_json(
    parts: list[dict],
    response_schema: dict | None = None,
    models: list[str] | None = None,
    max_retries: int = 8,
):
    candidate_models = models or MODEL_ROTATION
    last_err = None
    for attempt in range(max_retries):
        model = candidate_models[attempt % len(candidate_models)]
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}'
        gen_cfg: dict = {
            'responseMimeType': 'application/json',
            'temperature': 0.1,
        }
        if response_schema is not None:
            gen_cfg['responseSchema'] = response_schema
        payload = json.dumps({
            'contents': [{'parts': parts}],
            'generationConfig': gen_cfg,
        }).encode('utf-8')
        try:
            req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=90) as resp:
                body = json.loads(resp.read().decode('utf-8'))
            text = body['candidates'][0]['content']['parts'][0]['text']
            return json.loads(text)
        except urllib.error.HTTPError as err:
            last_err = f'{model} HTTP {err.code}'
            if err.code in (429, 500, 503):
                # Rotate to next model quickly, add short pause only after full sweep
                if (attempt + 1) % len(candidate_models) == 0:
                    time.sleep(8)
                else:
                    time.sleep(1.0)
                continue
            raise
        except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as err:
            last_err = f'{model} {err}'
            time.sleep(min(10, 1.5 * (attempt + 1)))
    raise RuntimeError(f'Gemini call failed after {max_retries} attempts: {last_err}')


def image_part(path: Path, mime: str = 'image/png') -> dict:
    return {
        'inline_data': {
            'mime_type': mime,
            'data': base64.b64encode(path.read_bytes()).decode('ascii'),
        }
    }


def parse_answer_key(pdf_path: Path) -> dict[int, str]:
    doc = pymupdf.open(str(pdf_path))
    txt = '\n'.join(p.get_text('text') for p in doc)
    tokens = re.findall(r'\b(\d{1,3})\s+([ABCD])\b', txt)
    answers: dict[int, str] = {}
    for num_s, opt in tokens:
        num = int(num_s)
        if 1 <= num <= 200:
            answers[num] = opt
    if len(answers) != 200:
        raise RuntimeError(f'Expected 200 answers from {pdf_path}, got {len(answers)}')
    return answers


def render_pdf_pages(pdf_path: Path, out_dir: Path, prefix: str, dpi: int = 180) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(str(pdf_path))
    paths: list[Path] = []
    for idx, page in enumerate(doc):
        out_file = out_dir / f'{prefix}_p{idx + 1:02d}.png'
        if not out_file.exists():
            pix = page.get_pixmap(dpi=dpi)
            pix.save(str(out_file))
        paths.append(out_file)
    return paths


def copy_audio_tracks(test_num: int, cfg: dict) -> dict[tuple[int, int], str]:
    audio_dir: Path = cfg['audio_dir']
    out_audio_dir = MEDIA_OUT_ROOT / cfg['slug'] / 'audio'
    out_audio_dir.mkdir(parents=True, exist_ok=True)

    found: dict[tuple[int, int], Path] = {}
    for p in audio_dir.iterdir():
        if p.suffix.lower() not in ('.mp3', '.m4a'):
            continue
        cleaned = re.sub(r'(?i)test\s*0?\d+[\s_-]*', '', p.name)
        cleaned = re.sub(r'(?i)part\s*\d+[\s_-]*', '', cleaned)
        m_range = re.search(r'(\d+)\s*[-–_]\s*(\d+)', cleaned)
        m_single = re.search(r'(\d+)', cleaned)
        if m_range:
            key = (int(m_range.group(1)), int(m_range.group(2)))
        elif m_single:
            v = int(m_single.group(1))
            key = (v, v)
        else:
            continue
        found[key] = p

    # Special case: Test 6 q077-079 already sliced into out_audio_dir/q077-079.m4a
    if test_num == 6 and (77, 79) not in found:
        fallback_77 = out_audio_dir / 'q077-079.m4a'
        if fallback_77.exists():
            found[(77, 79)] = fallback_77

    rel_map: dict[tuple[int, int], str] = {}
    for idx, (start, end, _part) in enumerate(LISTENING_GROUPS_SPEC, start=1):
        src = found.get((start, end))
        if not src:
            raise RuntimeError(f'Test {test_num} missing audio for {start}-{end}')
        ext = src.suffix.lower()
        dest_name = f'g{idx:03d}_q{start:03d}-{end:03d}{ext}'
        dest = out_audio_dir / dest_name
        if not dest.exists() and src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        elif src.resolve() == dest.resolve():
            pass
        if dest.exists():
            rel_map[(start, end)] = f"{cfg['slug']}/audio/{dest_name}"
        else:
            shutil.copy2(src, dest)
            rel_map[(start, end)] = f"{cfg['slug']}/audio/{dest_name}"
    return rel_map


LISTENING_PAGE_PROMPT = """Inspect this ETS TOEIC Listening test page image carefully.
Return ONLY valid JSON:
{
  "pageType": "COVER_OR_DIRECTIONS" | "PART1" | "PART2" | "PART3" | "PART4" | "MIXED",
  "part1": [
    {
      "qNum": 1,
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ],
  "part3_4_groups": [
    {
      "part": 3 | 4,
      "questionRange": [32, 34],
      "instruction": "Questions 32-34 refer to the following conversation.",
      "graphic_box_2d": [ymin, xmin, ymax, xmax] | null,
      "questions": [
        {
          "qNum": 32,
          "text": "Exact printed question text",
          "options": {"A": "...", "B": "...", "C": "...", "D": "..."}
        }
      ]
    }
  ]
}
Strict rules:
- Coordinate scale is 0..1000 ([ymin, xmin, ymax, xmax]).
- For part1: box_2d MUST tightly enclose ONLY the photograph itself (exclude the printed question number "1." outside the photo).
- For part3_4_groups: include "graphic_box_2d" ONLY if this question group actually has a visual graphic/chart/map/table/schedule/menu/coupon/diagram printed with it; otherwise set graphic_box_2d to null. Do NOT include numbered questions in graphic_box_2d.
- Keep exact English spelling/punctuation for all questions and options A-D.
- If a page is only directions or "Mark your answers on your answer sheet" with no photos/questions, return empty arrays."""

READING_PAGE_PROMPT = """Inspect this ETS TOEIC Reading test page image carefully.
Return ONLY valid JSON:
{
  "pageType": "COVER_OR_DIRECTIONS" | "PART5" | "PART6" | "PART7" | "MIXED",
  "part5_questions": [
    {
      "qNum": 101,
      "text": "Ms. Hsu ------- the monthly sales report before leaving the office.",
      "options": {"A": "review", "B": "reviewed", "C": "reviewing", "D": "reviewer"}
    }
  ],
  "passages": [
    {
      "part": 6 | 7,
      "questionRange": [131, 134],
      "instruction": "Questions 131-134 refer to the following e-mail." | null,
      "box_2d": [ymin, xmin, ymax, xmax]
    }
  ],
  "reading_questions": [
    {
      "qNum": 131,
      "text": "Blank [131] — Choose the best option to complete the text." | "Exact question stem",
      "options": {"A": "...", "B": "...", "C": "...", "D": "..."}
    }
  ]
}
Strict rules:
- Coordinate scale is 0..1000 ([ymin, xmin, ymax, xmax]).
- CRITICAL for passages[].box_2d: tightly enclose ONLY the visual reading document/email/letter/notice/advertisement/article/chat/form/web-page box(es) on THIS page.
  - NEVER include the "Questions 149-150 refer to..." instruction line above if outside the document box.
  - NEVER include the numbered questions & (A)-(D) options below the passage.
  - If a Double or Triple Passage shows 2 separate document boxes on this page (e.g. a book list AND a web page, or an ad AND an email), emit TWO items in `passages` in top-to-bottom / reading order with the SAME `questionRange`, one `box_2d` per document box!
  - If this page is a continuation page of a Double/Triple Passage started on the previous page (e.g. shows the 3rd email for 186-190 + questions 186-190), still emit that email's `passages` item with `questionRange: [186, 190]` and `reading_questions` for 186-190!
- Preserve blanks in Part 5 sentences as "-------".
- For Part 6 questions (131-146), if no separate sentence prompt is printed before (A)-(D), set text to "Blank [<qNum>] — Choose the best option to complete the text.".
- Copy every printed word cleanly and accurately."""


OPTIONS_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'A': {'type': 'STRING'},
        'B': {'type': 'STRING'},
        'C': {'type': 'STRING'},
        'D': {'type': 'STRING'},
    },
    'required': ['A', 'B', 'C', 'D'],
}

LISTENING_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'pageType': {'type': 'STRING'},
        'part1': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'qNum': {'type': 'INTEGER'},
                    'box_2d': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
                },
                'required': ['qNum', 'box_2d'],
            },
        },
        'part3_4_groups': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'part': {'type': 'INTEGER'},
                    'questionRange': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
                    'instruction': {'type': 'STRING'},
                    'graphic_box_2d': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}, 'nullable': True},
                    'questions': {
                        'type': 'ARRAY',
                        'items': {
                            'type': 'OBJECT',
                            'properties': {
                                'qNum': {'type': 'INTEGER'},
                                'text': {'type': 'STRING'},
                                'options': OPTIONS_SCHEMA,
                            },
                            'required': ['qNum', 'text', 'options'],
                        },
                    },
                },
                'required': ['part', 'questionRange', 'instruction', 'questions'],
            },
        },
    },
    'required': ['pageType', 'part1', 'part3_4_groups'],
}

READING_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'pageType': {'type': 'STRING'},
        'part5_questions': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'qNum': {'type': 'INTEGER'},
                    'text': {'type': 'STRING'},
                    'options': OPTIONS_SCHEMA,
                },
                'required': ['qNum', 'text', 'options'],
            },
        },
        'passages': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'part': {'type': 'INTEGER'},
                    'questionRange': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
                    'instruction': {'type': 'STRING', 'nullable': True},
                    'box_2d': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
                },
                'required': ['part', 'questionRange', 'box_2d'],
            },
        },
        'reading_questions': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'qNum': {'type': 'INTEGER'},
                    'text': {'type': 'STRING'},
                    'options': OPTIONS_SCHEMA,
                },
                'required': ['qNum', 'text', 'options'],
            },
        },
    },
    'required': ['pageType', 'part5_questions', 'passages', 'reading_questions'],
}

EXPLAIN_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'explanations': {
            'type': 'ARRAY',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'qNum': {'type': 'INTEGER'},
                    'explanation': {'type': 'STRING'},
                },
                'required': ['qNum', 'explanation'],
            },
        },
    },
    'required': ['explanations'],
}


def extract_page_cached(png_path: Path, cache_path: Path, prompt: str, schema: dict) -> dict:
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding='utf-8'))
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    result = call_gemini_json([image_part(png_path), {'text': prompt}], response_schema=schema)
    cache_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


def crop_box_to_webp(src_png: Path, box_2d: list[int | float], out_webp: Path, pad_px: int = 8) -> dict:
    if not box_2d or len(box_2d) < 4:
        raise RuntimeError(f'Invalid box_2d {box_2d} on {src_png.name}')
    im = Image.open(src_png)
    w, h = im.size
    ymin, xmin, ymax, xmax = box_2d[:4]
    ymin = max(0, min(1000, float(ymin)))
    xmin = max(0, min(1000, float(xmin)))
    ymax = max(0, min(1000, float(ymax)))
    xmax = max(0, min(1000, float(xmax)))
    x1 = max(0, int(xmin * w / 1000) - pad_px)
    y1 = max(0, int(ymin * h / 1000) - pad_px)
    x2 = min(w, int(xmax * w / 1000) + pad_px)
    y2 = min(h, int(ymax * h / 1000) + pad_px)
    if x2 - x1 < 60 or y2 - y1 < 40:
        raise RuntimeError(f'Suspicious tiny crop {box_2d} on {src_png.name}: {(x1,y1,x2,y2)}')
    crop = im.crop((x1, y1, x2, y2))
    out_webp.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out_webp, format='WEBP', quality=90, method=6)
    return {'width': crop.width, 'height': crop.height}


EXPLAIN_READING_PROMPT = """You are a senior Vietnamese TOEIC instructor writing post-exam explanations for students who got questions wrong.
For the given TOEIC Reading group (Part 5, 6, or 7), use the provided passage image(s) (if any), question stems, four options A/B/C/D, and the VERIFIED correct option letter to write crisp, accurate Vietnamese explanations for EACH question.

Return ONLY valid JSON:
{
  "explanations": [
    {
      "qNum": 101,
      "explanation": "..."
    }
  ]
}
Requirements for each `explanation` (2–4 concise, clear Vietnamese sentences):
1. Nêu rõ **Đáp án đúng (<letter>)** và **tại sao đúng**: giải thích cấu trúc ngữ pháp / từ loại / collocation / nghĩa (Part 5–6) hoặc trích dẫn cụm từ dẫn chứng cụ thể trong bài đọc kèm dịch ngắn (Part 6–7).
2. Giải thích ngắn gọn **tại sao các đáp án nhiễu còn lại sai** (sai loại từ, sai thì, sai ngữ cảnh, hoặc thông tin trái/không có trong bài) để học viên rút kinh nghiệm.
3. Không bao giờ mâu thuẫn với `correctOption` đã cho."""


def build_test(test_num: int):
    cfg = TESTS_CONFIG[test_num]
    slug = cfg['slug']
    print(f'\n================ BUILDING {slug.upper()} ================')

    answers = parse_answer_key(cfg['answer_pdf'])
    audio_map = copy_audio_tracks(test_num, cfg)
    print(f'[{slug}] Answer keys: {len(answers)}, Audio tracks: {len(audio_map)}')

    raw_dir = RAW_CACHE_ROOT / slug
    cache_dir = raw_dir / 'cache'
    l_pages = render_pdf_pages(cfg['listening_pdf'], raw_dir / 'pages', 'l', dpi=180)
    r_pages = render_pdf_pages(cfg['reading_pdf'], raw_dir / 'pages', 'r', dpi=180)
    print(f'[{slug}] Rendered pages: L={len(l_pages)}, R={len(r_pages)}')

    # Run Gemini Vision extraction concurrently across pages
    l_jobs = [(p, cache_dir / f'{p.stem}.json', LISTENING_PAGE_PROMPT, LISTENING_SCHEMA) for p in l_pages]
    r_jobs = [(p, cache_dir / f'{p.stem}.json', READING_PAGE_PROMPT, READING_SCHEMA) for p in r_pages]

    def run_jobs(jobs):
        results = [None] * len(jobs)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            futs = {pool.submit(extract_page_cached, p, cp, pr, sc): idx for idx, (p, cp, pr, sc) in enumerate(jobs)}
            for fut in concurrent.futures.as_completed(futs):
                idx = futs[fut]
                results[idx] = fut.result()
        return results

    l_data = run_jobs(l_jobs)
    r_data = run_jobs(r_jobs)
    print(f'[{slug}] Page Vision extraction finished.')

    img_out_dir = MEDIA_OUT_ROOT / slug / 'images'
    img_out_dir.mkdir(parents=True, exist_ok=True)

    # Assemble Part 1..4
    part1_crops: dict[int, str] = {}
    p34_questions: dict[int, dict] = {}
    p34_group_meta: dict[tuple[int, int], dict] = {}

    for page_idx, item in enumerate(l_data):
        src_png = l_pages[page_idx]
        for p1 in item.get('part1') or []:
            qn = int(p1['qNum'])
            if 1 <= qn <= 6 and p1.get('box_2d') and qn not in part1_crops:
                fname = f'p1_q{qn:03d}.webp'
                crop_box_to_webp(src_png, p1['box_2d'], img_out_dir / fname, pad_px=4)
                part1_crops[qn] = f'{slug}/images/{fname}'
        for grp in item.get('part3_4_groups') or []:
            qs = grp.get('questions') or []
            if not qs:
                continue
            qnums = sorted(int(q['qNum']) for q in qs)
            # Determine canonical 3-q chunk range
            rng = grp.get('questionRange') or [qnums[0], qnums[-1]]
            s0 = int(rng[0])
            # Snap to valid ETS TOEIC Part 3/4 triad start
            if 32 <= s0 <= 100:
                pass
            gbox = grp.get('graphic_box_2d')
            g_rel = None
            if gbox and isinstance(gbox, list) and len(gbox) >= 4:
                fname = f'p34_q{qnums[0]:03d}-{qnums[-1]:03d}_{page_idx+1}.webp'
                try:
                    crop_box_to_webp(src_png, gbox, img_out_dir / fname, pad_px=8)
                    g_rel = f'{slug}/images/{fname}'
                except RuntimeError as e:
                    print(f'  [warn] skipping tiny p34 graphic on page {page_idx+1}: {e}')
            key = (qnums[0], qnums[-1])
            meta = p34_group_meta.setdefault(key, {'instruction': grp.get('instruction'), 'images': []})
            if grp.get('instruction') and not meta['instruction']:
                meta['instruction'] = grp['instruction']
            if g_rel and g_rel not in meta['images']:
                meta['images'].append(g_rel)
            for q in qs:
                p34_questions[int(q['qNum'])] = {
                    'qNum': int(q['qNum']),
                    'text': str(q['text']).strip(),
                    'options': {k: str(q['options'][k]).strip() for k in ('A', 'B', 'C', 'D')},
                }

    # Assemble Reading Part 5, 6, 7
    part5_questions: dict[int, dict] = {}
    reading_questions: dict[int, dict] = {}
    passage_groups_map: dict[tuple[int, int], dict] = {}

    for page_idx, item in enumerate(r_data):
        src_png = r_pages[page_idx]
        for q in item.get('part5_questions') or []:
            qn = int(q['qNum'])
            if 101 <= qn <= 130:
                part5_questions[qn] = {
                    'qNum': qn,
                    'text': str(q['text']).strip(),
                    'options': {k: str(q['options'][k]).strip() for k in ('A', 'B', 'C', 'D')},
                }
        for q in item.get('reading_questions') or []:
            qn = int(q['qNum'])
            if 131 <= qn <= 200:
                stem = str(q.get('text') or '').strip()
                if not stem or qn <= 146 and ('blank' in stem.lower() or len(stem) < 12):
                    stem = f'Blank [{qn}] — Choose the best option to complete the text.'
                reading_questions[qn] = {
                    'qNum': qn,
                    'text': stem,
                    'options': {k: str(q['options'][k]).strip() for k in ('A', 'B', 'C', 'D')},
                }
        for p_idx, pbox in enumerate(item.get('passages') or []):
            rng = pbox.get('questionRange') or []
            if len(rng) != 2 or not pbox.get('box_2d'):
                continue
            start_q, end_q = int(rng[0]), int(rng[1])
            key = (start_q, end_q)
            entry = passage_groups_map.setdefault(key, {
                'part': 6 if start_q <= 146 else 7,
                'start': start_q,
                'end': end_q,
                'instruction': pbox.get('instruction'),
                'images': [],
            })
            if pbox.get('instruction') and not entry['instruction']:
                entry['instruction'] = pbox['instruction']
            fname = f'p{entry["part"]}_q{start_q:03d}-{end_q:03d}_p{page_idx+1}_{p_idx+1}.webp'
            try:
                crop_box_to_webp(src_png, pbox['box_2d'], img_out_dir / fname, pad_px=8)
                entry['images'].append(f'{slug}/images/{fname}')
            except RuntimeError as e:
                print(f'  [warn] skipped tiny reading passage box on page {page_idx+1}: {e}')

    # Validate questions 1..200 coverage
    missing_p1 = [q for q in range(1, 7) if q not in part1_crops]
    missing_p34 = [q for q in range(32, 101) if q not in p34_questions]
    missing_p5 = [q for q in range(101, 131) if q not in part5_questions]
    missing_r = [q for q in range(131, 201) if q not in reading_questions]
    print(f'[{slug}] Coverage check missing -> P1:{missing_p1} P34:{missing_p34} P5:{missing_p5} P67:{missing_r}')
    if missing_p1 or missing_p34 or missing_p5 or missing_r:
        raise RuntimeError(f'[{slug}] Missing questions detected! Aborting before explanation generation.')

    # Build canonical groups list
    groups: list[dict] = []
    g_order = 1

    # Part 1: Q1..Q6
    for qn in range(1, 7):
        groups.append({
            'groupOrder': g_order,
            'part': 1,
            'skill': 'LISTENING',
            'taskCode': 'TOEIC_PART_1',
            'title': f'Part 1 · Câu {qn}',
            'instructions': 'Listen and choose the statement that best describes what you see in the picture.',
            'audioKey': audio_map[(qn, qn)],
            'imageKeys': [part1_crops[qn]],
            'questions': [{
                'qNum': qn,
                'text': f'Question {qn} — Listen and choose the statement (A), (B), (C), or (D) that best describes the picture.',
                'options': {'A': '(A)', 'B': '(B)', 'C': '(C)', 'D': '(D)'},
                'correctOption': answers[qn],
                'explanation': None,
            }],
        })
        g_order += 1

    # Part 2: Q7..Q31 (3 options A, B, C)
    for qn in range(7, 32):
        groups.append({
            'groupOrder': g_order,
            'part': 2,
            'skill': 'LISTENING',
            'taskCode': 'TOEIC_PART_2',
            'title': f'Part 2 · Câu {qn}',
            'instructions': 'Listen to the question or statement and choose the best response (A), (B), or (C).',
            'audioKey': audio_map[(qn, qn)],
            'imageKeys': [],
            'questions': [{
                'qNum': qn,
                'text': f'Question {qn} — Listen to the question/statement and select the best response.',
                'options': {'A': '(A)', 'B': '(B)', 'C': '(C)'},
                'correctOption': answers[qn],
                'explanation': None,
            }],
        })
        g_order += 1

    # Part 3 (32..70) & Part 4 (71..100)
    for start, end, part_no in [(i, i + 2, 3) for i in range(32, 71, 3)] + [(i, i + 2, 4) for i in range(71, 101, 3)]:
        # Collect any graphic from overlapping p34_group_meta
        imgs = []
        instr = None
        for (ms, me), m in p34_group_meta.items():
            if not (me < start or ms > end):
                if m['instruction'] and not instr:
                    instr = m['instruction']
                for img in m['images']:
                    if img not in imgs:
                        imgs.append(img)
        groups.append({
            'groupOrder': g_order,
            'part': part_no,
            'skill': 'LISTENING',
            'taskCode': f'TOEIC_PART_{part_no}',
            'title': f'Part {part_no} · Câu {start}–{end}',
            'instructions': instr or (
                f'Questions {start}-{end} refer to the following conversation.' if part_no == 3
                else f'Questions {start}-{end} refer to the following talk.'
            ),
            'audioKey': audio_map[(start, end)],
            'imageKeys': imgs,
            'questions': [{
                'qNum': qn,
                'text': p34_questions[qn]['text'],
                'options': p34_questions[qn]['options'],
                'correctOption': answers[qn],
                'explanation': None,
            } for qn in range(start, end + 1)],
        })
        g_order += 1

    # Part 5: Q101..Q130 (individual groups for clean focus or question-by-question navigation)
    for qn in range(101, 131):
        groups.append({
            'groupOrder': g_order,
            'part': 5,
            'skill': 'READING',
            'taskCode': 'TOEIC_PART_5',
            'title': f'Part 5 · Câu {qn}',
            'instructions': 'Choose the word or phrase that best completes the sentence.',
            'audioKey': None,
            'imageKeys': [],
            'questions': [{
                'qNum': qn,
                'text': part5_questions[qn]['text'],
                'options': part5_questions[qn]['options'],
                'correctOption': answers[qn],
                'explanation': None,
            }],
        })
        g_order += 1

    # Part 6 & Part 7: merge passage_groups_map sorted by start qNum
    sorted_passages = sorted(passage_groups_map.values(), key=lambda x: (x['start'], x['end']))
    covered_r = set()
    for pgrp in sorted_passages:
        s, e = pgrp['start'], pgrp['end']
        if not pgrp['images']:
            raise RuntimeError(f'[{slug}] Passage group {s}-{e} has NO images!')
        # Avoid accidental duplicate sub-ranges
        qs_in_range = [qn for qn in range(s, e + 1) if qn not in covered_r]
        if not qs_in_range:
            continue
        for qn in qs_in_range:
            covered_r.add(qn)
        groups.append({
            'groupOrder': g_order,
            'part': pgrp['part'],
            'skill': 'READING',
            'taskCode': f"TOEIC_PART_{pgrp['part']}",
            'title': f"Part {pgrp['part']} · Câu {s}–{e}",
            'instructions': pgrp['instruction'] or f'Questions {s}-{e} refer to the following passage.',
            'audioKey': None,
            'imageKeys': pgrp['images'],
            'questions': [{
                'qNum': qn,
                'text': reading_questions[qn]['text'],
                'options': reading_questions[qn]['options'],
                'correctOption': answers[qn],
                'explanation': None,
            } for qn in range(s, e + 1)],
        })
        g_order += 1

    missing_covered_r = [qn for qn in range(131, 201) if qn not in covered_r]
    if missing_covered_r:
        raise RuntimeError(f'[{slug}] Reading passage groups missed questions: {missing_covered_r}')

    # Step 7: Generate Vietnamese explanations for Q101..Q200 (cached!)
    exp_cache_file = cache_dir / 'explanations_part5_7.json'
    explanations_map: dict[str, str] = {}
    if exp_cache_file.exists():
        explanations_map = json.loads(exp_cache_file.read_text(encoding='utf-8'))

    # Batch Part 5 (10 questions per call) + 1 call per Part 6/7 group with images!
    p5_groups = [g for g in groups if g['part'] == 5]
    explain_tasks = []
    for i in range(0, len(p5_groups), 10):
        chunk = [g['questions'][0] for g in p5_groups[i:i + 10]]
        if any(str(q['qNum']) not in explanations_map for q in chunk):
            explain_tasks.append(('part5', chunk, []))
    for g in groups:
        if g['part'] in (6, 7):
            if any(str(q['qNum']) not in explanations_map for q in g['questions']):
                explain_tasks.append((f'p{g["part"]}', g['questions'], g['imageKeys']))

    if explain_tasks:
        print(f'[{slug}] Generating Vietnamese explanations for {len(explain_tasks)} Reading batches...')

        def run_explain(task):
            kind, qs, img_keys = task
            parts = []
            for ik in img_keys:
                parts.append(image_part(MEDIA_OUT_ROOT / ik, mime='image/webp'))
            q_payload = [
                {
                    'qNum': q['qNum'],
                    'text': q['text'],
                    'options': q['options'],
                    'correctOption': q['correctOption'],
                }
                for q in qs
            ]
            parts.append({'text': EXPLAIN_READING_PROMPT + '\n\nQuestions JSON:\n' + json.dumps(q_payload, ensure_ascii=False)})
            return call_gemini_json(parts, response_schema=EXPLAIN_SCHEMA)

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for res in pool.map(run_explain, explain_tasks):
                for item in res.get('explanations') or []:
                    explanations_map[str(item['qNum'])] = str(item['explanation']).strip()
        exp_cache_file.write_text(json.dumps(explanations_map, ensure_ascii=False, indent=2), encoding='utf-8')

    for g in groups:
        if g['part'] >= 5:
            for q in g['questions']:
                q['explanation'] = explanations_map.get(str(q['qNum']))
                if not q['explanation']:
                    raise RuntimeError(f'[{slug}] Missing explanation for Q{q["qNum"]}')

    BANK_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    out_json = BANK_OUT_ROOT / f'{slug}.json'
    bank_doc = {
        'testNumber': test_num,
        'id': cfg['uuid'],
        'slug': slug,
        'title': cfg['title'],
        'description': cfg['description'],
        'timeLimitMinutes': 120,
        'listeningQuestions': 100,
        'readingQuestions': 100,
        'totalQuestions': 200,
        'groups': groups,
    }
    out_json.write_text(json.dumps(bank_doc, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'[{slug}] SUCCESS! Wrote {out_json} ({len(groups)} groups, 200 questions, 100 explanations).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--tests', nargs='+', type=int, default=[1])
    args = parser.parse_args()
    for t in args.tests:
        build_test(t)
