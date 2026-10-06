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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
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
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
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
const classroom = classes.find((item) => item.activeLearnerCount >= 10) ?? classes[0];
if (!classroom) throw new Error('No instructor class fixture was found');
const classId = classroom.id;
const courseId = classroom.course.id;
const overview = requireOk(await browserFetch(`/instructor/classes/${classId}/overview`), 'Overview');
if (!Number.isInteger(overview.lessonProgress?.completed) || !Number.isInteger(overview.lessonProgress?.total)) throw new Error('Overview is missing real lesson progress numerator/denominator');
const roster = requireOk(await browserFetch(`/instructor/classes/${classId}/learners`), 'Roster');
if (roster.learners.length < 10) throw new Error(`Expected at least 10 active demo learners, got ${roster.learners.length}`);
const learner = roster.learners[0];
const learnerDetail = requireOk(await browserFetch(`/instructor/classes/${classId}/learners/${learner.id}`), 'Learner detail');
if (!Array.isArray(learnerDetail.attempts)) throw new Error('Learner attempt history is unavailable');
const grading = requireOk(await browserFetch(`/instructor/classes/${classId}/grading`), 'Grading inbox');
const results = requireOk(await browserFetch(`/instructor/classes/${classId}/results`), 'Class results');
const tests = requireOk(await browserFetch(`/instructor/courses/${courseId}/tests`), 'Test templates');
let groupedTest;
for (const summary of tests) {
  const detail = requireOk(await browserFetch(`/instructor/tests/${summary.id}`), 'Test detail');
  if (detail.questionGroups?.length) { groupedTest = detail; break; }
}
if (!groupedTest) throw new Error('No grouped four-skill test fixture was found');
const checks = [];

const scaleMarker = `M07-SCALE-${Date.now()}`;
const scaleRows = Array.from({ length: 1000 }, (_, index) => ({
  type: 'SINGLE_CHOICE', toeicSkill: 'READING', difficulty: index % 3 === 0 ? 'EASY' : index % 3 === 1 ? 'MEDIUM' : 'HARD',
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
  const scalePage = requireOk(await browserFetch(`/instructor/courses/${courseId}/questions?page=1&pageSize=20&search=${encodeURIComponent(scaleMarker)}&skill=READING`), '1,000-question paginated query');
  if (scalePage.total !== 1000 || scalePage.totalPages !== 50 || scalePage.items.length !== 20) throw new Error(`Unexpected scale page: ${JSON.stringify({ total: scalePage.total, totalPages: scalePage.totalPages, items: scalePage.items.length })}`);
  await navigate(`/instructor/tests/${groupedTest.id}/edit`, ['Mở bộ chọn câu hỏi']);
  await evaluate(`(() => {
    const readingCard = [...document.querySelectorAll('article')].find((article) => [...article.querySelectorAll('span')].some((span) => span.textContent?.trim() === 'Đọc'));
    const selectPart = readingCard ? [...readingCard.querySelectorAll('button')].find((button) => button.textContent?.includes('Chọn để thêm câu hỏi')) : null;
    if (!selectPart) throw new Error('No Reading Part selection action was rendered');
    selectPart.click();
    return true;
  })()`);
  await delay(200);
  await evaluate(`(() => {
    const open = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Mở bộ chọn câu hỏi'));
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
    for (let offset = 0; offset < ids.length; offset += 25) {
      const responses = await Promise.all(ids.slice(offset, offset + 25).map((id) => fetch('/api/instructor/questions/' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' })));
      if (responses.some((response) => !response.ok)) return false;
    }
    return true;
  })()`);
  if (!cleanup) throw new Error('Could not clean the isolated 1,000-question fixture');
}

checks.push(['teaching list', await navigate('/instructor/teaching', ['Lớp giảng dạy của tôi', 'Vào lớp'])]);
checks.push(['class overview', await navigate(`/instructor/classes/${classId}`, ['Tổng quan lớp', 'Bài chờ chấm'])]);
checks.push(['roster', await navigate(`/instructor/classes/${classId}/learners`, ['Học viên', 'Theo dõi tiến độ học tập'])]);
checks.push(['learner detail', await navigate(`/instructor/classes/${classId}/learners/${learner.id}`, ['Kết quả 4 kỹ năng gần nhất', 'Tiến độ bài học', 'Lịch sử bài kiểm tra'])]);
checks.push(['shared content warning', await navigate(`/instructor/classes/${classId}/content`, ['Nội dung này dùng chung cho các lớp thuộc khóa học này.', 'Quản lý nội dung khóa học'])]);
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
await evaluate(`(async () => {
  const response = await fetch('/api/instructor/courses/${courseId}/questions/import-template', { credentials: 'include' });
  if (!response.ok) throw new Error('Could not download XLSX import template');
  const file = new File([await response.blob()], 'm07-browser-smoke-template.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const input = document.querySelector('input[type="file"][accept=".xlsx"]');
  if (!input) throw new Error('XLSX picker was not rendered');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
let xlsxPreview;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await delay(250);
  xlsxPreview = await evaluate(`({ text: document.body.innerText, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2 })`);
  if (xlsxPreview.text.includes('Xem trước dữ liệu XLSX') && xlsxPreview.text.includes('1/1 dòng hợp lệ')) break;
}
if (!xlsxPreview.text.includes('Xem trước dữ liệu XLSX') || !xlsxPreview.text.includes('1/1 dòng hợp lệ')) throw new Error('XLSX validation preview did not render');
checks.push(['XLSX validation preview without confirm', xlsxPreview]);
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
checks.push(['guided test builder', await navigate(`/instructor/tests/${groupedTest.id}/edit`, ['Phần thi theo bốn kỹ năng', 'Mở bộ chọn câu hỏi', 'Xem trước đề'])]);
checks.push(['class scheduling', await navigate(`/instructor/classes/${classId}/assessments`, ['Lịch đã giao', 'Áp dụng cho lớp này'])]);
checks.push(['grading inbox', await navigate(`/instructor/classes/${classId}/grading`, ['Ưu tiên bài nộp sớm nhất', 'Chấm bài'])]);
if (grading.submissions.length) {
  const submission = grading.submissions[0];
  const gradingDetail = await navigate(`/instructor/classes/${classId}/assessments/${submission.classAssessment.id}/attempts/${submission.id}/grading`, ['Câu 1 ·', 'Danh sách chấm bài']);
  const hasResponseNavigator = await evaluate(`Boolean(document.querySelector('nav[aria-label="Điều hướng câu chấm"]'))`);
  if (!hasResponseNavigator) throw new Error('Same-attempt grading response navigator was not rendered');
  checks.push(['grading detail + same-attempt navigator', gradingDetail]);
}
checks.push(['class results', await navigate(`/instructor/classes/${classId}/results`, ['Kết quả lớp', 'Mẫu'])]);

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
const delivery = await browserFetch(`/learning/enrollments/${enrollment.id}/resources/${storedResource.id}/download`);
if (!delivery.ok || !delivery.disposition?.includes('attachment') || !String(delivery.body).includes('Smart English')) {
  throw new Error(`Protected student document delivery failed: HTTP ${delivery.status}`);
}
checks.push(['protected student document delivery', { overflow: false }]);

await logout();
await login('instructor.demo@smart-elearning.local');
const mobile = await navigate(`/instructor/classes/${classId}/learners`, ['Học viên', 'Theo dõi tiến độ học tập'], 390, 844);
const hasMobileDrawerTrigger = await evaluate(`Boolean(document.querySelector('[aria-label="Mở điều hướng lớp"]'))`);
if (!hasMobileDrawerTrigger) throw new Error('Mobile class workspace drawer trigger was not rendered');
checks.push(['mobile workspace navigation', mobile]);
const tablet = await navigate(`/instructor/classes/${classId}/results`, ['Kết quả lớp'], 820, 1180);
checks.push(['tablet results', tablet]);

const summary = {
  classCode: classroom.code,
  activeLearners: roster.learners.length,
  gradingItems: grading.submissions.length,
  resultAssessments: results.assessments.length,
  groupedTestGroups: groupedTest.questionGroups.length,
  instructorClasses: classes.length,
  storedDocument: storedResource.originalFileName,
  checks: checks.map(([name, state]) => ({ name, pass: true, horizontalOverflow: state.overflow })),
};
console.log(JSON.stringify(summary, null, 2));
socket.close();
