import { execFileSync } from 'node:child_process';

const port = process.env.M07_CDP_PORT ?? '9222';
const password = process.env.M07_SMOKE_PASSWORD;
if (!password) throw new Error('M07_SMOKE_PASSWORD is required');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    if (targets.some((target) => target.type === 'page')) break;
  } catch {}
  await delay(250);
}
const target = targets?.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('http://localhost:5173'))
  ?? targets?.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('No Chromium page target is available');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
const networkResponses = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Network.responseReceived') networkResponses.push(message.params.response);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});
function command(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}
async function navigate(path, expected, width = 1440, height = 900) {
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await command('Page.navigate', { url: `http://localhost:5173${path}` });
  const markers = Array.isArray(expected) ? expected : [expected];
  let state;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await delay(250);
    state = await evaluate(`({
      text: document.body.innerText,
      path: location.pathname,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      overflowDetails: [...document.querySelectorAll('body *')]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > document.documentElement.clientWidth + 2 || rect.left < -2)
        .slice(0, 8)
        .map(({ element, rect }) => ({ tag: element.tagName, className: String(element.className).slice(0, 160), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), text: (element.textContent ?? '').trim().slice(0, 80) }))
    })`);
    if (state.path === '/login') throw new Error(`Session was lost while opening ${path}`);
    if (markers.every((marker) => state.text.includes(marker))) return state;
  }
  if (!markers.every((marker) => state.text.includes(marker))) {
    throw new Error(`Expected marker was not rendered at ${path}: ${markers.join(' | ')}\nRendered: ${state.text.slice(0, 800)}`);
  }
  return state;
}
async function browserFetch(path, init = {}) {
  return evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(`/api${path}`)}, ${JSON.stringify(init)});
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await response.json() : await response.text();
    return { status: response.status, ok: response.ok, body, disposition: response.headers.get('content-disposition') };
  })()`);
}
async function login(email) {
  const response = await browserFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login failed for ${email}: ${response.status}`);
}
async function logout() {
  const response = await browserFetch('/auth/logout', { method: 'POST' });
  if (!response.ok) throw new Error(`Logout failed: ${response.status}`);
}
function requireOk(response, label) {
  if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
  return response.body;
}

async function editVisibleStoredResourceTitle(classId, currentTitle, nextTitle) {
  await navigate(`/instructor/classes/${classId}/content`, [currentTitle, 'Quản lý nội dung khóa học']);
  await evaluate(`(() => {
    const currentTitle = ${JSON.stringify(currentTitle)};
    const title = [...document.querySelectorAll('p')].find((item) => item.textContent?.trim() === currentTitle);
    const card = title?.parentElement?.parentElement;
    const editButton = card ? [...card.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Sửa') : null;
    if (!editButton) throw new Error('Visible stored-resource metadata edit action was not rendered');
    editButton.click();
    return true;
  })()`);
  await delay(200);
  await evaluate(`(() => {
    const heading = [...document.querySelectorAll('h2')].find((item) => item.textContent?.includes('Sửa Tài liệu'));
    const form = heading?.parentElement?.querySelector('form');
    const titleInput = form?.querySelector('input[name="title"]');
    if (!form || !titleInput) throw new Error('Stored-resource metadata form was not rendered');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Native input value setter is unavailable');
    setter.call(titleInput, ${JSON.stringify(nextTitle)});
    titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput.dispatchEvent(new Event('change', { bubbles: true }));
    form.requestSubmit();
    return true;
  })()`);
  await delay(900);
}

await command('Page.enable');
await command('Runtime.enable');
await command('Network.enable');
await command('Page.navigate', { url: 'http://localhost:5173/login' });
await delay(500);
await login('instructor.demo@smart-elearning.local');

const classes = requireOk(await browserFetch('/instructor/classes'), 'Instructor classes');
if (classes.length < 10) throw new Error(`Expected at least 10 instructor classes, got ${classes.length}`);
if (JSON.stringify(classes).includes('1970-01-01')) throw new Error('Instructor schedule leaked the database transport date');
if (JSON.stringify(classes).includes('undefined')) throw new Error('Instructor schedule rendered an undefined field');
if (!classes.some((item) => item.status === 'CANCELLED')) throw new Error('Instructor classes do not preserve the CANCELLED state');
if (classes.some((item) => item.status === 'CLOSED')) throw new Error('Instructor classes expose the removed pseudo-CLOSED state');
const classroom = classes.find((item) => item.activeLearnerCount >= 10) ?? classes[0];
if (!classroom) throw new Error('No instructor class fixture was found');
const classId = classroom.id;
const courseId = classroom.course.id;
const overview = requireOk(await browserFetch(`/instructor/classes/${classId}/overview`), 'Overview');
if (!Number.isInteger(overview.lessonProgress?.completed) || !Number.isInteger(overview.lessonProgress?.total)) throw new Error('Overview is missing real lesson progress numerator/denominator');
const roster = requireOk(await browserFetch(`/instructor/classes/${classId}/learners`), 'Roster');
const activeRosterLearners = roster.learners.filter((item) => item.status === 'ACTIVE');
if (activeRosterLearners.length !== 11) throw new Error(`Expected exactly 11 active demo learners, got ${activeRosterLearners.length}`);
const learner = roster.learners.find((item) => item.status === 'ACTIVE') ?? roster.learners[0];
const learnerDetail = requireOk(await browserFetch(`/instructor/classes/${classId}/learners/${learner.id}`), 'Learner detail');
if (!Array.isArray(learnerDetail.attempts)) throw new Error('Learner attempt history is unavailable');
const assessmentTrendIds = learnerDetail.skillTrend.map((point) => point.assessmentTitle);
if (new Set(assessmentTrendIds).size !== assessmentTrendIds.length) throw new Error('Learner trend contains duplicate assessment points');
if (learnerDetail.skillTrend.some((point) => point.scores.length !== 4)) throw new Error('Learner trend includes a partially graded attempt');
const grading = requireOk(await browserFetch(`/instructor/classes/${classId}/grading`), 'Grading inbox');
const results = requireOk(await browserFetch(`/instructor/classes/${classId}/results`), 'Class results');
const resultTrendTitles = results.trend.map((point) => point.title);
if (JSON.stringify(resultTrendTitles) !== JSON.stringify(['Kiểm tra thường kỳ 01', 'Kiểm tra giữa kỳ'])) throw new Error(`Class results API trend is not the scored Periodic → Midterm story: ${JSON.stringify(resultTrendTitles)}`);
if (results.trend.some((point, index) => index > 0 && new Date(point.date) < new Date(results.trend[index - 1].date))) throw new Error('Class results API trend dates are not monotonic ascending');
if (results.trend.some((point) => point.skills.length === 0 || point.skills.some((skill) => skill.sampleCount < 1 || skill.average === null))) throw new Error('Class results API trend fabricated or retained an empty sample');
const tests = requireOk(await browserFetch(`/instructor/courses/${courseId}/tests`), 'Test templates');
let groupedTest;
for (const summary of tests) {
  const detail = requireOk(await browserFetch(`/instructor/tests/${summary.id}`), 'Test detail');
  if (detail.title === 'VG-R3 — Đề demo hướng dẫn') { groupedTest = detail; break; }
  if (!groupedTest && detail.questionGroups?.length) groupedTest = detail;
}
if (!groupedTest) throw new Error('No grouped four-skill test fixture was found');
const checks = [];

// Recover safely from an interrupted prior smoke before creating a new isolated fixture.
for (;;) {
  const stale = requireOk(await browserFetch(`/instructor/courses/${courseId}/questions?page=1&pageSize=100&search=M07-SCALE-`), 'Stale scale fixture lookup');
  if (!stale.items.length) break;
  for (const question of stale.items) requireOk(await browserFetch(`/instructor/questions/${question.id}`, { method: 'DELETE' }), 'Stale scale fixture cleanup');
}

const scaleMarker = `M07-SCALE-${Date.now()}`;
const scaleRows = Array.from({ length: 1000 }, (_, index) => ({
  type: 'SINGLE_CHOICE', toeicSkill: 'LISTENING', difficulty: index % 3 === 0 ? 'EASY' : index % 3 === 1 ? 'MEDIUM' : 'HARD',
  content: `${scaleMarker} question ${String(index + 1).padStart(4, '0')}`, explanation: 'Isolated browser-smoke fixture', rubricId: null,
  options: [{ content: 'Correct', isCorrect: true }, { content: 'Distractor', isCorrect: false }],
}));
const scaleImport = { questionIds: [] };
for (let offset = 0; offset < scaleRows.length; offset += 100) {
  const imported = requireOk(await browserFetch(`/instructor/courses/${courseId}/questions/import-confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: scaleRows.slice(offset, offset + 100) }),
  }), `1,000-question isolated fixture batch ${offset / 100 + 1}`);
  scaleImport.questionIds.push(...imported.questionIds);
}
if (scaleImport.questionIds.length !== 1000) throw new Error(`Expected 1,000 isolated questions, got ${scaleImport.questionIds.length}`);
try {
  const scalePage = requireOk(await browserFetch(`/instructor/courses/${courseId}/questions?page=1&pageSize=20&search=${encodeURIComponent(scaleMarker)}&skill=LISTENING`), '1,000-question paginated query');
  if (scalePage.total !== 1000 || scalePage.totalPages !== 50 || scalePage.items.length !== 20) throw new Error(`Unexpected scale page: ${JSON.stringify({ total: scalePage.total, totalPages: scalePage.totalPages, items: scalePage.items.length })}`);
  await navigate(`/instructor/tests/${groupedTest.id}/edit`, ['Bước 1 / 5']);
  await evaluate(`(() => { const step=[...document.querySelectorAll('button')].find((button) => button.textContent?.trim().startsWith('3.')); if(!step) throw new Error('Builder Step 3 was not rendered'); step.click(); return true; })()`);
  await delay(200);
  const listeningContext = await evaluate(`document.body.innerText.includes('Đang soạn: Phần Nghe')`);
  if (!listeningContext) throw new Error('The deterministic Listening group was not selected in Step 3');
  await evaluate(`(() => {
    const open = document.querySelector('button[aria-label="Mở bộ chọn câu hỏi"]');
    if (!open) throw new Error('Question picker action was not rendered');
    open.click();
    return true;
  })()`);
  await delay(300);
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Tìm trong bộ chọn câu hỏi"]');
    if (!input) throw new Error('Question picker search was not rendered');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter.call(input, ${JSON.stringify(scaleMarker)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  let pickerState;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(250);
    pickerState = await evaluate(`({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 })`);
    if (pickerState.text.includes('1000 câu phù hợp') && pickerState.text.includes('1/50')) break;
  }
  if (!pickerState.text.includes('1000 câu phù hợp') || !pickerState.text.includes('1/50')) throw new Error(`1,000-question picker did not expose the expected server pagination: ${pickerState.text.slice(-1200)}`);
  checks.push(['isolated 1,000-question picker', pickerState]);
} finally {
  const cleanup = await evaluate(`(async () => {
    const ids = ${JSON.stringify(scaleImport.questionIds)};
    for (const id of ids) {
      let response;
      for (let retry = 0; retry < 3; retry += 1) { try { response = await fetch('/api/instructor/questions/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' }); if (response.ok) break; } catch {} }
      if (!response?.ok) return false;
    }
    return true;
  })()`);
  if (!cleanup) throw new Error('Could not clean the isolated 1,000-question fixture');
}
await delay(1000);

const teachingState = await navigate('/instructor/teaching', ['Lớp giảng dạy của tôi', 'Vào lớp']);
const teachingUi = await evaluate(`(() => { const course=document.querySelector('[aria-label="Lọc khóa học"]'); const status=document.querySelector('[aria-label="Lọc trạng thái lớp"]'); const day=document.querySelector('[aria-label="Lọc ngày học"]'); const duplicateSchedules=[...document.querySelectorAll('tbody tr')].filter((row)=>{const values=[...row.querySelectorAll('td:nth-child(2) span span')].map((node)=>node.textContent?.trim());return values.length!==new Set(values).size;}).length; return { groups: document.querySelectorAll('details').length, filters: Boolean(course&&status&&day), duplicateSchedules, semantic: document.body.innerText.includes('Đang học') || document.body.innerText.includes('Đang mở đăng ký') }; })()`);
if (teachingUi.groups < 1 || !teachingUi.filters || teachingUi.duplicateSchedules || !teachingUi.semantic) throw new Error(`Teaching Round 3 checks failed: ${JSON.stringify(teachingUi)}`);
const cancelledUi = await evaluate(`(() => { const filter=document.querySelector('[aria-label="Lọc trạng thái lớp"]'); return { hasCancelledOption:[...filter.options].some((item)=>item.value==='CANCELLED'), hasClosedOption:[...filter.options].some((item)=>item.value==='CLOSED'), cancelledLabel:document.body.innerText.includes('Đã hủy') }; })()`);
if (!cancelledUi.hasCancelledOption || cancelledUi.hasClosedOption || !cancelledUi.cancelledLabel) throw new Error(`Cancelled class presentation failed: ${JSON.stringify(cancelledUi)}`);
checks.push(['teaching course groups and filters', teachingState]);
checks.push(['cancelled class semantics', { overflow: teachingState.overflow }]);
const overviewState = await navigate(`/instructor/classes/${classId}`, ['Tổng quan lớp', 'Phân bố tiến độ', 'Cần theo dõi', 'Mốc sắp tới']);
const timelineEvidence = await evaluate(`(() => { const heading=[...document.querySelectorAll('h3')].find((node)=>node.textContent?.includes('Mốc sắp tới')); const panel=heading?.closest('section'); const item=panel?.querySelector('ol li'); return { item:Boolean(item), time:Boolean(item?.querySelector('time[datetime]')), chip:[...(item?.querySelectorAll('span') ?? [])].some((node)=>['Mở','Đóng'].includes(node.textContent?.trim())), wrapping:Boolean(item?.querySelector('.break-words')) }; })()`);
if (overview.upcomingDeadlines.length && (!timelineEvidence.item || !timelineEvidence.time || !timelineEvidence.chip || !timelineEvidence.wrapping)) throw new Error(`Overview timeline structure failed: ${JSON.stringify(timelineEvidence)}`);
checks.push(['class overview timeline', overviewState]);
checks.push(['roster', await navigate(`/instructor/classes/${classId}/learners`, ['Học viên', 'Theo dõi tiến độ học tập'])]);
const learnerState = await navigate(`/instructor/classes/${classId}/learners/${learner.id}`, ['Kết quả 4 kỹ năng gần nhất', 'Tiến độ theo mô-đun', 'Hoạt động gần đây', 'Xu hướng kỹ năng', 'Lịch sử bài kiểm tra']);
const learnerChart = await evaluate(`Boolean(document.querySelector('svg[aria-label="Biểu đồ xu hướng kỹ năng theo đợt kiểm tra"], [data-testid="two-point-skill-slope"]'))`);
if (learnerDetail.skillTrend.length && !learnerChart) throw new Error('Learner trend chart did not render');
checks.push(['learner detail and trend chart', learnerState]);
checks.push(['shared content warning', await navigate(`/instructor/classes/${classId}/content`, ['Nội dung này dùng chung cho các lớp thuộc khóa học này.', 'Quản lý nội dung khóa học', 'BÀI HỌC ĐANG CHỌN'])]);
await evaluate(`(() => {
  const add = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === '+ Tài liệu');
  if (!add) throw new Error('Resource creation action was not rendered');
  add.click();
  return true;
})()`);
await delay(200);
const resourceModes = await evaluate(`({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 })`);
for (const mode of ['Tải tài liệu lên', 'Video từ liên kết', 'Liên kết ngoài']) {
  if (!resourceModes.text.includes(mode)) throw new Error('Missing resource creation mode: ' + mode);
}
checks.push(['resource creation modes', resourceModes]);
await evaluate(`(() => { [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Hủy')?.click(); return true; })()`);

const bankPath = `/instructor/courses/${courseId}/question-bank?returnTo=${encodeURIComponent(`/instructor/classes/${classId}/assessments`)}`;
checks.push(['question bank pagination/import', await navigate(bankPath, ['Ngân hàng câu hỏi', 'Tải mẫu XLSX', 'Trang 1/'])]);
await evaluate(`(() => {
  const input = document.querySelector('input[type="file"][accept=".xlsx"]');
  if (!input) throw new Error('XLSX picker was not rendered');
  const transfer = new DataTransfer();
  transfer.items.add(new File([new Uint8Array([0, 1, 2, 3])], 'invalid.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
let xlsxError;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await delay(250);
  xlsxError = await evaluate(`({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 })`);
  if (xlsxError.text.includes('Dữ liệu chưa hợp lệ')) break;
}
if (!xlsxError.text.includes('Dữ liệu chưa hợp lệ')) throw new Error(`XLSX row/file error state did not render: ${xlsxError.text.slice(-600)}`);
checks.push(['XLSX error display', xlsxError]);

const xlsxFixture = await evaluate(`(async () => {
  const response = await fetch('/api/instructor/courses/${courseId}/questions/import-template', { credentials: 'include' });
  if (!response.ok) throw new Error('Could not download XLSX import template');
  const file = new File([await response.blob()], 'm07-browser-smoke-template.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', file);
  const previewResponse = await fetch('/api/instructor/courses/${courseId}/questions/import-preview', { method: 'POST', credentials: 'include', body: formData });
  if (!previewResponse.ok) throw new Error('Could not preview XLSX import template');
  const preview = await previewResponse.json();
  const confirmResponse = await fetch('/api/instructor/courses/${courseId}/questions/import-confirm', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: preview.rows.map((row) => row.input) })
  });
  if (!confirmResponse.ok) throw new Error('Could not create isolated XLSX duplicate fixture');
  const confirmed = await confirmResponse.json();
  const input = document.querySelector('input[type="file"][accept=".xlsx"]');
  if (!input) throw new Error('XLSX picker was not rendered');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { questionId: confirmed.questionIds[0] };
})()`);
let xlsxPreview;
try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await delay(250);
    xlsxPreview = await evaluate(`({
      text: document.body.innerText,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      confirmDisabled: [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Xác nhận nhập')?.disabled
    })`);
    if (xlsxPreview.text.includes('Xem trước dữ liệu XLSX') && xlsxPreview.text.includes('1/1 dòng hợp lệ') && xlsxPreview.text.includes('1 cảnh báo')) break;
  }
  if (!xlsxPreview.text.includes('Xem trước dữ liệu XLSX') || !xlsxPreview.text.includes('1/1 dòng hợp lệ') || !xlsxPreview.text.includes('trùng với câu hỏi hiện có') || xlsxPreview.confirmDisabled !== false) {
    throw new Error('XLSX warning preview or safe warning-only confirm state did not render');
  }
  await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent?.trim()==='Xác nhận nhập'); if(!button) throw new Error('XLSX confirm action missing'); button.click(); return true; })()`);
  await delay(150);
  const destinationDialog = await evaluate(`(() => { const dialog=document.querySelector('[role="dialog"][aria-label="Xác nhận nhập câu hỏi"]'); return { open:Boolean(dialog), hasTitle:dialog?.innerText.includes(${JSON.stringify(classroom.course.title)}) ?? false, leaksUuid:dialog?.innerText.includes(${JSON.stringify(courseId)}) ?? false }; })()`);
  if (!destinationDialog.open || !destinationDialog.hasTitle || destinationDialog.leaksUuid) throw new Error(`XLSX destination title failed: ${JSON.stringify(destinationDialog)}`);
  await evaluate(`(() => { const dialog=document.querySelector('[role="dialog"][aria-label="Xác nhận nhập câu hỏi"]'); [...dialog.querySelectorAll('button')].find((item)=>item.textContent?.includes('Quay lại xem trước'))?.click(); return true; })()`);
  checks.push(['XLSX warning preview without confirm', xlsxPreview]);
  checks.push(['XLSX human-readable destination', { overflow: xlsxPreview.overflow }]);
} finally {
  if (xlsxFixture?.questionId) requireOk(await browserFetch(`/instructor/questions/${xlsxFixture.questionId}`, { method: 'DELETE' }), 'XLSX duplicate fixture cleanup');
}
await evaluate(`(() => { [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Hủy')?.click(); return true; })()`);
await evaluate(`(() => {
  const back = [...document.querySelectorAll('a')].find((link) => link.textContent?.trim() === 'Quay lại');
  if (!back) throw new Error('Safe return link was not rendered');
  back.click();
  return true;
})()`);
let returnPath;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(200);
  returnPath = await evaluate('location.pathname');
  if (returnPath === `/instructor/classes/${classId}/assessments`) break;
}
if (returnPath !== `/instructor/classes/${classId}/assessments`) throw new Error(`Question Bank return context was lost: ${returnPath}`);
checks.push(['question bank safe return context', { overflow: false }]);
const builder = await navigate(`/instructor/tests/${groupedTest.id}/edit`, ['Bước 1 / 5', '1. Thông tin đề']);
const step1 = await evaluate(`({ hasTitle:Boolean(document.querySelector('input[maxlength="300"]')), hasAttempts:[...document.querySelectorAll('label')].some((item)=>item.textContent.includes('Số lượt làm') && !item.closest('.hidden')) })`);
if (!step1.hasTitle || step1.hasAttempts) throw new Error(`Builder Step 1 separation failed: ${JSON.stringify(step1)}`);
for (const step of [2,3,4,5]) {
  await evaluate(`(() => { const target=[...document.querySelectorAll('button')].find((button)=>button.textContent?.trim().startsWith('${step}.')); if(!target) throw new Error('Missing wizard step ${step}'); target.click(); return true; })()`);
  await delay(100);
  const marker = await evaluate('document.body.innerText');
  if (!marker.includes(`Bước ${step} / 5`)) throw new Error('Wizard did not move to step ${step}');
  if (step === 2 && !marker.includes('Cụm câu hỏi theo bốn kỹ năng')) throw new Error('Builder Step 2 structure is missing');
  if (step === 3 && (!marker.includes('Soạn cụm câu hỏi') || !marker.includes('Tài liệu đi kèm câu hỏi') || !marker.includes('Thêm từ ngân hàng câu hỏi'))) throw new Error('Builder Step 3 grouped content authoring is missing');
  if (step === 4 && (!marker.includes('Số lượt làm') || !marker.includes('Kiểm tra khả năng xuất bản'))) throw new Error('Builder Step 4 settings/readiness is missing');
  if (step === 5) {
    const preview = await evaluate(`(() => { const root=document.querySelector('[aria-label="Bản xem trước dành cho học viên"]'); return { root:Boolean(root), choices:root?.querySelectorAll('input[type="radio"],input[type="checkbox"]').length ?? 0, leaked:[...(root?.querySelectorAll('*') ?? [])].some((node)=>/đáp án đúng/i.test(node.textContent ?? '')) }; })()`);
    if (!preview.root || preview.choices < 1 || preview.leaked) throw new Error(`Builder Step 5 safe preview failed: ${JSON.stringify(preview)}`);
  }
}
checks.push(['guided five-step test builder', builder]);
const originalQuestionIds = new Set(groupedTest.testQuestions.map((item) => item.id));
await evaluate(`(() => { const target=[...document.querySelectorAll('button')].find((button)=>button.textContent?.trim().startsWith('3.')); target?.click(); return Boolean(target); })()`);
await delay(150);
await evaluate(`(() => { const open=document.querySelector('button[aria-label="Mở bộ chọn câu hỏi"]'); open?.click(); return Boolean(open); })()`);
await delay(200);
await evaluate(`(() => { const input=document.querySelector('input[aria-label="Tìm trong bộ chọn câu hỏi"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set; if(!input||!setter) return false; setter.call(input,'M07-VG-L-13'); input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(200);
  if (await evaluate(`document.body.innerText.includes('M07-VG-L-13')`)) break;
}
await evaluate(`(() => { const dialog=document.querySelector('[aria-label="Bộ chọn câu hỏi"]'); const checkbox=dialog?.querySelector('input[type="checkbox"]'); if(!checkbox) throw new Error('L-13 was not available in the selected Listening group'); checkbox.click(); const add=[...dialog.querySelectorAll('button')].find((button)=>button.textContent?.includes('Thêm 1 câu')); if(!add) throw new Error('L-13 batch add action was not enabled'); add.click(); return true; })()`);
for (let attempt = 0; attempt < 20; attempt += 1) {
  await delay(200);
  if ((await evaluate(`document.body.innerText.match(/M07-VG-L-13/g)?.length ?? 0`)) === 1) break;
}
await evaluate(`(() => { const target=[...document.querySelectorAll('button')].find((button)=>button.textContent?.trim().startsWith('5.')); target?.click(); return Boolean(target); })()`);
await delay(200);
const immediatePreview = await evaluate(`(() => { const root=document.querySelector('[aria-label="Bản xem trước dành cho học viên"]'); return { count:(root?.innerText.match(/M07-VG-L-13/g) ?? []).length, hierarchy:Boolean(root?.textContent?.includes('Phần Nghe') && root?.textContent?.includes('Cụm câu hỏi')), leaked:/đáp án đúng/i.test(root?.textContent ?? '') }; })()`);
if (immediatePreview.count !== 1 || !immediatePreview.hierarchy || immediatePreview.leaked) throw new Error(`L-13 immediate preview failed: ${JSON.stringify(immediatePreview)}`);
checks.push(['L-13 immediate grouped preview', { overflow: false }]);
const mutatedTest = requireOk(await browserFetch(`/instructor/tests/${groupedTest.id}`), 'Mutated test detail');
const addedQuestion = mutatedTest.testQuestions.find((item) => !originalQuestionIds.has(item.id));
if (!addedQuestion) throw new Error('Could not identify L-13 for smoke cleanup');
requireOk(await browserFetch(`/instructor/tests/${groupedTest.id}/questions/${addedQuestion.id}`, { method: 'DELETE' }), 'L-13 smoke cleanup');
checks.push(['class scheduling', await navigate(`/instructor/classes/${classId}/assessments`, ['Ngân hàng câu hỏi', 'Đề kiểm tra', 'Lịch kiểm tra của lớp', 'Chuẩn bị câu hỏi', 'Tạo đề kiểm tra', 'Giao đề cho lớp'])]);
checks.push(['grading inbox', await navigate(`/instructor/classes/${classId}/grading`, ['Ưu tiên bài nộp sớm nhất', 'Chấm bài'])]);
if (grading.submissions.length) {
  const submission = grading.submissions[0];
  const gradingDetail = await navigate(`/instructor/classes/${classId}/assessments/${submission.classAssessment.id}/attempts/${submission.id}/grading`, ['Câu 1 ·', 'Danh sách chấm bài']);
  const hasResponseNavigator = await evaluate(`Boolean(document.querySelector('nav[aria-label="Điều hướng câu chấm"]'))`);
  if (!hasResponseNavigator) throw new Error('Same-attempt grading response navigator was not rendered');
  checks.push(['grading detail + same-attempt navigator', gradingDetail]);
}
const resultState = await navigate(`/instructor/classes/${classId}/results`, ['Kết quả lớp', 'Mức độ hoàn chỉnh kết quả', 'So sánh kỹ năng', 'Phân bố điểm', 'Xu hướng qua các đợt kiểm tra', 'Kết quả từng học viên']);
if (resultState.text.includes('Mẫu ') || resultState.text.includes('loại trừ')) throw new Error('Results still exposes technical sample/exclusion jargon');
const resultsChart = await evaluate(`(() => {
  const chart=document.querySelector('svg[aria-label="Biểu đồ xu hướng kỹ năng theo đợt kiểm tra"]');
  const slope=document.querySelector('[data-testid="two-point-skill-slope"]');
  const table=[...document.querySelectorAll('.sr-only table')].find((item)=>item.querySelector('caption')?.textContent?.includes('xu hướng kỹ năng'));
  const rowTitles=[...(table?.querySelectorAll('tbody th') ?? [])].map((node)=>node.textContent?.trim());
  return { visual:Boolean(chart || slope), sample:(chart?.textContent ?? slope?.textContent ?? '').includes('n='), slope:Boolean(slope), rowTitles, table:Boolean(table) };
})()`);
if (!resultsChart.visual || !resultsChart.sample || !resultsChart.table || !resultsChart.slope || JSON.stringify(resultsChart.rowTitles) !== JSON.stringify(['Kiểm tra thường kỳ 01', 'Kiểm tra giữa kỳ'])) throw new Error(`Class results chronological trend evidence failed: ${JSON.stringify(resultsChart)}`);
const resultGrammar = await evaluate(`(() => { const skillHeading=[...document.querySelectorAll('h3')].find((node)=>node.textContent?.includes('So sánh kỹ năng')); return { completion: Boolean(document.querySelector('[aria-label="Thanh tiến độ kết quả 100 phần trăm"]')), distributions: document.querySelectorAll('[aria-label^="Phân bố "][aria-label$="100 phần trăm"]').length, skillBars: skillHeading?.parentElement?.querySelectorAll('button').length ?? 0 }; })()`);
if (!resultGrammar.completion || resultGrammar.distributions < 4 || resultGrammar.skillBars < 4) throw new Error(`Class results chart grammar failed: ${JSON.stringify(resultGrammar)}`);
checks.push(['class results Round 3 story', resultState]);

const modules = requireOk(await browserFetch(`/instructor/courses/${courseId}/modules`), 'Course modules');
let storedResource;
let storedLesson;
for (const module of modules) {
  const lessons = requireOk(await browserFetch(`/instructor/modules/${module.id}/lessons`), 'Module lessons');
  for (const lesson of lessons) {
    const resources = requireOk(await browserFetch(`/instructor/lessons/${lesson.id}/resources`), 'Lesson resources');
    storedResource = resources.find((resource) => resource.storageKey && resource.isDownloadable);
    if (storedResource) { storedLesson = lesson; break; }
  }
  if (storedResource) break;
}
if (!storedResource) throw new Error('No stored downloadable document fixture was found');

const smokeResourceTitles = new Set(['M07 Round 3 YouTube smoke', 'M07 Round 3 external video smoke']);
const existingSmokeResources = requireOk(
  await browserFetch(`/instructor/lessons/${storedLesson.id}/resources`),
  'Existing smoke resources',
).filter((resource) => smokeResourceTitles.has(resource.title));
for (const resource of existingSmokeResources) {
  requireOk(
    await browserFetch(`/instructor/resources/${resource.id}`, { method: 'DELETE' }),
    'Previous smoke resource cleanup',
  );
}

const youtubeResource = requireOk(await browserFetch(`/instructor/lessons/${storedLesson.id}/resources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'M07 Round 3 YouTube smoke', type: 'VIDEO', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', isDownloadable: false }) }), 'YouTube smoke resource');
const externalVideoResource = requireOk(await browserFetch(`/instructor/lessons/${storedLesson.id}/resources`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'M07 Round 3 external video smoke', type: 'VIDEO', url: 'https://example.com/video', isDownloadable: false }) }), 'External video smoke resource');

const originalStoredTitle = storedResource.title;
const smokeStoredTitle = `${originalStoredTitle} — smoke metadata`;
await editVisibleStoredResourceTitle(classId, originalStoredTitle, smokeStoredTitle);
try {
  const storedMetadataReload = await navigate(`/instructor/classes/${classId}/content`, [smokeStoredTitle, storedResource.originalFileName, 'Quản lý nội dung khóa học']);
  checks.push(['visible stored-document metadata edit + reload', storedMetadataReload]);
} finally {
  await editVisibleStoredResourceTitle(classId, smokeStoredTitle, originalStoredTitle);
}
await navigate(`/instructor/classes/${classId}/content`, [originalStoredTitle, 'Quản lý nội dung khóa học']);

await logout();
await login('student.demo@smart-elearning.local');
const enrollments = requireOk(await browserFetch('/enrollments/my'), 'Student enrollments');
const enrollment = enrollments.find((item) => item.classOffering?.id === classId || item.classOfferingId === classId);
if (!enrollment) throw new Error('Student is not enrolled in the M07 demo class');
const lessonState = await navigate(`/student/enrollments/${enrollment.id}/lessons/${storedLesson.id}`, [storedResource.title, 'Tải xuống']);
await evaluate(`(() => {
  const title = ${JSON.stringify(storedResource.title)};
  const card = [...document.querySelectorAll('div')].find((item) => item.querySelector(':scope > div > p.font-semibold')?.textContent === title);
  const button = card ? [...card.querySelectorAll('button')].find((item) => item.textContent.includes('Tải xuống')) : null;
  if (!button) throw new Error('Visible stored-resource download action was not rendered');
  button.click();
  return true;
})()`);
await delay(800);
const visibleDelivery = networkResponses.find((response) => response.url.includes(`/resources/${storedResource.id}/download`));
if (!visibleDelivery || visibleDelivery.status !== 200 || !String(visibleDelivery.headers['content-disposition'] ?? '').includes('attachment')) {
  throw new Error('Visible LessonPage download did not complete with a protected attachment response');
}
checks.push(['visible student LessonPage download', lessonState]);
const videoLessonState = await navigate(`/student/enrollments/${enrollment.id}/lessons/${storedLesson.id}`, [youtubeResource.title, externalVideoResource.title, 'Mở trên YouTube']);
const collapsedVideoEvidence = await evaluate(`(() => ({ iframe: Boolean(document.querySelector('iframe[src*="www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]')), expand: [...document.querySelectorAll('button')].some((button) => button.textContent.includes('Xem video trong bài học')) }))()`);
if (collapsedVideoEvidence.iframe || !collapsedVideoEvidence.expand) throw new Error(`YouTube lazy/collapsed evidence failed: ${JSON.stringify(collapsedVideoEvidence)}`);
await evaluate(`(() => { const card=[...document.querySelectorAll('[data-testid="youtube-resource"]')].find((item)=>item.innerText.includes(${JSON.stringify(youtubeResource.title)})); const button=card ? [...card.querySelectorAll('button')].find((item)=>item.textContent.includes('Xem video trong bài học')) : null; if (!button) throw new Error('YouTube expand action missing'); button.click(); return true; })()`);
await delay(300);
const videoEvidence = await evaluate(`(() => { const iframe=document.querySelector('iframe[src*="www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]'); const external=[...document.querySelectorAll('a')].find((link)=>link.closest('div')?.innerText.includes(${JSON.stringify('M07 Round 3 external video smoke')})); return { iframe: Boolean(iframe), src: iframe?.src, autoplay: iframe?.src.includes('autoplay'), responsive: Boolean(iframe?.parentElement?.classList.contains('aspect-video')), externalIframe: [...document.querySelectorAll('iframe')].some((item)=>item.src.includes('example.com')), externalLink: Boolean(external) }; })()`);
if (!videoEvidence.iframe || videoEvidence.autoplay || !videoEvidence.responsive || videoEvidence.externalIframe || !videoEvidence.externalLink) throw new Error(`YouTube inline evidence failed: ${JSON.stringify(videoEvidence)}`);
checks.push(['student inline YouTube + safe fallback', videoLessonState]);
for (const [width, height, label] of [[1440,900,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) checks.push([`${label} student YouTube`, await navigate(`/student/enrollments/${enrollment.id}/lessons/${storedLesson.id}`, 'Mở trên YouTube', width, height)]);
const delivery = await browserFetch(`/learning/enrollments/${enrollment.id}/resources/${storedResource.id}/download`);
if (!delivery.ok || !delivery.disposition?.includes('attachment') || !String(delivery.body).includes('Smart English')) {
  throw new Error(`Protected student document delivery failed: HTTP ${delivery.status}`);
}
checks.push(['protected student document delivery', { overflow: false }]);

await logout();
await login('instructor.demo@smart-elearning.local');
requireOk(await browserFetch(`/instructor/resources/${youtubeResource.id}`, { method: 'DELETE' }), 'YouTube fixture cleanup');
requireOk(await browserFetch(`/instructor/resources/${externalVideoResource.id}`, { method: 'DELETE' }), 'External video fixture cleanup');
const mobile = await navigate(`/instructor/classes/${classId}/learners`, ['Học viên', 'Theo dõi tiến độ học tập'], 390, 844);
const hasMobileDrawerTrigger = await evaluate(`Boolean(document.querySelector('[aria-label="Mở điều hướng lớp"]'))`);
if (!hasMobileDrawerTrigger) throw new Error('Mobile class workspace drawer trigger was not rendered');
checks.push(['mobile workspace navigation', mobile]);
const tablet = await navigate(`/instructor/classes/${classId}/results`, ['Kết quả lớp'], 820, 1180);
checks.push(['tablet results', tablet]);
for (const [width, height, label] of [[1440,900,'desktop'],[820,1180,'tablet'],[390,844,'mobile']]) {
  for (const [path, marker, page] of [['/instructor/teaching','Lớp giảng dạy của tôi','teaching'],[`/instructor/classes/${classId}`,'Tổng quan lớp','overview'],[`/instructor/classes/${classId}/learners/${learner.id}`,'Tiến độ theo mô-đun','learner'],[`/instructor/tests/${groupedTest.id}/edit`,'Bước 1 / 5','builder'],[`/instructor/classes/${classId}/results`,'Kết quả lớp','results']]) checks.push([`${label} ${page}`, await navigate(path, marker, width, height)]);
}

const overflowFailures = checks.filter(([, state]) => state.overflow);
if (overflowFailures.length) throw new Error(`Horizontal overflow: ${JSON.stringify(overflowFailures.map(([name, state]) => ({ name, details: state.overflowDetails })))}`);
const summary = {
  classCode: classroom.code,
  activeLearners: activeRosterLearners.length,
  gradingItems: grading.submissions.length,
  resultAssessments: results.assessments.length,
  groupedTestGroups: groupedTest.questionGroups.length,
  instructorClasses: classes.length,
  storedDocument: storedResource.originalFileName,
  fixtureCleanup: { scaleQuestions: 1000, xlsxQuestion: true, youtubeResources: 2 },
  candidateHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  totalChecks: checks.length,
  passedChecks: checks.length,
  horizontalOverflowFailures: overflowFailures.length,
  checks: checks.map(([name, state]) => ({ name, pass: true, horizontalOverflow: state.overflow })),
};
console.log(JSON.stringify(summary, null, 2));
socket.close();
