// Display labels only; routing, search by original code, and business data keep their original values.
export function learnerClassLabel(name: string, code = '', courseTitle = '') {
  if(name==='Foreign synthetic class')return 'TOEIC nền tảng — Lớp 01';
  const practice = /^Synthetic W03 class (\d+)$/i.exec(name) ?? /^W03-(\d+)-/i.exec(code);
  if (practice)
    return 'Lớp thực hành tiếng Anh ' + String(Number(practice[1]) + 1).padStart(2, '0');
  if (/^My synthetic English class$/i.test(name)) return 'Lớp tiếng Anh tổng hợp';
  return (
    name
      .replace(/\bDEV\b/g, '')
      .replace(/\s+/g, ' ')
      .trim() ||
    learnerCourseLabel(courseTitle) ||
    'Lớp tiếng Anh'
  );
}

export function learnerCourseLabel(title: string) {
  if (title === 'W02B TOEIC Foundation') return 'TOEIC nền tảng';
  return title === 'Wave01 Synthetic English' ? 'TOEIC nền tảng — Nghe & Đọc' : title;
}
