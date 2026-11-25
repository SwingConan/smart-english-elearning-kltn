from pathlib import Path
import csv, difflib, hashlib, json, re, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/v2/br136'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name, value): (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')

existing = [f'apps/api/src/modules/placement/{p.name}' for p in (OUT / 'before').glob('*.ts')]
added = ['apps/api/src/modules/placement/structured-advice.ts', 'apps/api/src/modules/placement/br136-advisory.spec.ts',
         'apps/api/test/br136-advisory-http.e2e-spec.ts'] + [p.relative_to(ROOT).as_posix() for p in (ROOT / 'scripts').glob('*br136*')]
touched = sorted(set(existing + added))
patch = []
for name in touched:
    p = ROOT / name
    original = OUT / 'before' / p.name
    before = original.read_text(encoding='utf-8').splitlines(True) if name in existing else []
    after = p.read_text(encoding='utf-8').splitlines(True)
    patch.extend(difflib.unified_diff(before, after, fromfile='a/'+name if before else '/dev/null', tofile='b/'+name))
    target = OUT / 'source' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(p.read_bytes())
(OUT / '09_SOURCE_CHANGESET_DIFF.patch').write_text(''.join(patch), encoding='utf-8', newline='\n')
save('SOURCE_SHA256.json', [{'path':name,'bytes':(ROOT/name).stat().st_size,'sha256':digest(ROOT/name),'kind':'modified_from_pre_BR136_snapshot' if name in existing else 'added_BR136'} for name in touched])
save('SOURCE_SYMBOLS.json', [{'path':n,'symbols':[{'line':i,'text':l.strip()} for i,l in enumerate((ROOT/n).read_text(encoding='utf-8').splitlines(),1) if re.search(r'buildDeidentifiedPayload|computeEvidenceDigest|renderStructuredAdvice|enforceBudgetLimitAndReserve|publishedRevisionId|async executeAdvisory|ADVICE_SCHEMA_VERSION',l)]} for n in touched if n.endswith('.ts') and '.spec.' not in n and '.e2e-' not in n])

tests = {}
for label, filename in [('RED','RED.json'),('GREEN','GREEN.json'),('HTTP','HTTP-jest.json'),('API','API-full.json'),('Web','Web-full.json')]:
    r=json.loads((OUT/filename).read_text(encoding='utf-8'))
    tests[label]={'raw':filename,'sha256':digest(OUT/filename), 'success':r.get('success'),
      'passed':r['numPassedTests'],'failed':r['numFailedTests'],'total':r['numTotalTests'],
      'suites':r['numTotalTestSuites'],'files':len(r['testResults']),
      'inventory':[{'name':t['name'],'status':t['status'],'tests':[{'name':a['fullName'],'status':a['status']} for a in t['assertionResults']]} for t in r['testResults']]}
save('TEST_INVENTORY.json',tests)
commands=json.loads((OUT/'regression-commands.json').read_text(encoding='utf-8'))
lint=json.loads((OUT/'LINT_BASELINE_PARITY.json').read_text(encoding='utf-8'))
summary={'status':'OFFLINE_TECHNICAL_EVIDENCE_READY_WITH_LINT_FAILURES_AND_EXTERNAL_GATES',
 'api':{k:v for k,v in tests['API'].items() if k!='inventory'},'web':{k:v for k,v in tests['Web'].items() if k!='inventory'},
 'target':{k:v for k,v in tests['GREEN'].items() if k!='inventory'},'http':{k:v for k,v in tests['HTTP'].items() if k!='inventory'},
 'uniqueFullApiPlusWeb':tests['API']['passed']+tests['Web']['passed'],'targetIncludedInApi':True,'httpReportedSeparately':True,
 'checks':[{k:r[k] for k in ['name','exit']} for r in commands], 'lintPatchParity':lint['status'],
 'qaFingerprintFresh':False,'geminiLiveVerified':False,'protectedOidRejections':json.loads((OUT/'DB-proof.json').read_text(encoding='utf-8'))['guardRejections']}
save('ACCEPTANCE_SUMMARY.json',summary)
table='\n'.join(f'| {key} | {tests[key]["passed"]}/{tests[key]["total"]} | {tests[key]["failed"]} | {tests[key]["suites"]} | {tests[key]["files"]} | `{tests[key]["raw"]}` |' for key in ['RED','GREEN','HTTP','API','Web'])
(OUT/'05_TEST_RESULTS_AND_BASELINE_PARITY.md').write_text('''# Kiểm thử và đối chiếu baseline

| Bộ | PASS/tổng | FAIL | Suite khai báo | File thực | JSON gốc |
|---|---:|---:|---:|---:|---|
'''+table+f'''

Baseline BR135S: API1593 + Web844. BR136 API tăng 42 test, không giảm baseline; Web giữ 844. Tổng duy nhất từ hai bộ full là **{summary['uniqueFullApiPlusWeb']}**. GREEN là tập con trong API full; không cộng lại. HTTP SQL5 được báo riêng, không cộng các lần chạy lặp. Web khai báo 166 suite nhưng có 69 file testResults; không gọi 166 là số file.

Lệnh đầy đủ, cwd, thời gian và exit: `target-commands.json`, `regression-commands.json`, `DB-proof.json`; tên file/test lấy trực tiếp JSON tại `TEST_INVENTORY.json`. Typecheck và build API/Web đều exit0. Full lint **FAIL**: API116 lỗi, Web15 lỗi. `LINT_BASELINE_PARITY.json` dùng ESLint trên bảy snapshot trước và source hiện tại chứng minh không tăng số rule finding trong patch; ba tệp TS mới không có lỗi lint. Không sửa hàng loạt module khác để che debt cũ.

Một lệnh trung gian dùng nhầm tên option Jest29 (`--testPathPatterns`) đã chạy rộng từ cwd root: `TARGET-initial.json`/log giữ nguyên thất bại, gồm fixture positive chưa đổi schema, compile lỗi trong test mới và media-root test phụ thuộc cwd. Đây không phải kết quả hồi quy cuối hoặc bằng chứng RED gốc. Sau đổi sang option đúng `--testPathPattern`, sửa fixture theo schema mới và chạy từ cwd API, GREEN72 và full API1635 đều PASS. Các lần chỉnh expectation từ prose cũ sang server-rendered output không làm mất negative test; lý do lỗi schema nay có mã chính xác INVALID_AI_OUTPUT_SCHEMA. RED gốc là file riêng, chạy trước bản sửa production và có hai assertion đúng lỗi cần sửa.

Lint lỗi và cổng LIVE/học thuật bên ngoài vẫn mở; không tuyên bố tất cả kiểm tra đều PASS. Không có browser screenshot mới vì BR136 không thay UI; hồi quy Web là Vitest thật, không được mô tả thành browser E2E.
''',encoding='utf-8')

source=[]
for name in ['apps','scripts','.github','.githooks']:
 for p in (ROOT/name).rglob('*'):
  if not p.is_file():continue
  if any(x in {'node_modules','dist','coverage','generated','.local-storage','.git','test-results','playwright-report','__pycache__'} for x in p.relative_to(ROOT).parts):continue
  if p.name.startswith('.env') and not p.name.endswith('example'):continue
  if any(x in p.name.lower() for x in ['.private','credentials','service-account']):continue
  source.append(p)
source += [p for p in ROOT.iterdir() if p.is_file() and (not p.name.startswith('.env') or p.name.endswith('example')) and p.suffix not in {'.zip','.dump','.key','.pem','.pfx'}]
source=sorted(set(source))
secret_patterns=[re.compile(rb'AIza[0-9A-Za-z_-]{30,}'),re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),re.compile(rb'ya29\.[0-9A-Za-z_-]{20,}')]
suspect=[]
for p in source:
 if p.suffix.lower() in {'.ts','.tsx','.js','.mjs','.cjs','.json','.yaml','.yml','.ps1','.py','.md'}:
  if any(pattern.search(p.read_bytes()) for pattern in secret_patterns):suspect.append(p.relative_to(ROOT).as_posix())
if suspect:raise RuntimeError('SOURCE_SECRET_PATTERN_REJECTED: filenames only '+repr(suspect))
save('SOURCE_ARCHIVE_INVENTORY.json',{'files':[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size,'sha256':digest(p)} for p in source], 'excluded':['real .env files','credentials/private files','node_modules','generated Prisma','dist/coverage','.git','.local-storage/databases','IDE worktrees','historical evidence/docs and UI demos (not build source)'],'secretPatternFindings':suspect})
with zipfile.ZipFile(OUT/'BR136_FULL_SOURCE.zip','w',zipfile.ZIP_DEFLATED,6) as z:
 for p in source:z.write(p,p.relative_to(ROOT).as_posix())
 z.write(OUT/'SOURCE_ARCHIVE_INVENTORY.json','SOURCE_ARCHIVE_INVENTORY.json')

with zipfile.ZipFile(OUT/'BR136_EVIDENCE.zip','w',zipfile.ZIP_DEFLATED,6) as z:
 for p in sorted(OUT.rglob('*')):
  if not p.is_file() or p.suffix=='.zip' or 'readback' in p.parts or '.drive-readback.' in p.name or p.name.startswith(('11_','00_')):continue
  z.write(p,p.relative_to(OUT).as_posix())
save('UPLOAD_LOCAL_MANIFEST.json',[{'name':p.name,'bytes':p.stat().st_size,'sha256':digest(p)} for p in [OUT/'BR136_FULL_SOURCE.zip',OUT/'BR136_EVIDENCE.zip']])
print(json.dumps({'sourceFiles':len(source),'sourceZipBytes':(OUT/'BR136_FULL_SOURCE.zip').stat().st_size,'evidenceZipBytes':(OUT/'BR136_EVIDENCE.zip').stat().st_size,'tests':{k:v['passed'] for k,v in tests.items()}},indent=2))
