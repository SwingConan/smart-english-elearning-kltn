export function schoolTimestamp(iso: string | null | undefined) {
  if (!iso) return 'Chưa ghi nhận';
  return (
    new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso)) + ' (giờ trung tâm)'
  );
}
