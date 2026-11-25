'use strict';
const {connect}=require('./target.cjs');
const {programmeDescription}=require('./curriculum.cjs');
(async()=>{const {db}=await connect(false);try{
  const courses={
    'cdec25d1-9cee-4c1e-9df6-c1bf0b2e1df6':'TOEIC nền tảng · Nghe–Đọc và giao tiếp công sở',
    '0709f6b3-9abd-4ffa-abcc-d7aa43a05b1c':'TOEIC nền tảng 450+ · Xây dựng kỹ năng Nghe–Đọc',
    '538b63d6-a8f5-48c1-b92c-edf08e2afcc4':'Chương trình tiếng Anh công sở · Đang biên soạn',
  };
  for(const [id,title] of Object.entries(courses))await db.query('UPDATE courses SET title=$2,description=$3,"updatedAt"=clock_timestamp() WHERE id=$1',[id,title,id.startsWith('538')?'Chương trình đang được biên soạn, chưa mở ghi danh hoặc phát hành học liệu.':programmeDescription()]);
  const names={
    '18653fb2-d42a-4aea-8313-a20e7f911daa':'TOEIC nền tảng · Lớp trực tuyến buổi tối',
    '81478d09-833b-4e95-b403-8d596dac10df':'TOEIC nền tảng · Lớp giao tiếp công sở',
    '1a41de4b-429d-4c14-89c6-0d893f3f6b0d':'TOEIC nền tảng 450+ · Lớp Nghe–Đọc A',
    '9148bef2-b055-4c71-8440-7ecd46ca2508':'TOEIC nền tảng 450+ · Lớp Nghe–Đọc B',
    '19325a6c-0afc-4022-a8c6-2f5ccc005e52':'TOEIC nền tảng 450+ · Lớp buổi tối',
    '154f5049-1124-49d1-804a-0de4cf430174':'TOEIC nền tảng 450+ · Lớp thực hành bổ trợ',
    '086f2a83-fed2-4834-8ea5-7117bdee06d1':'TOEIC nền tảng 450+ · Lớp nhóm nhỏ',
    '0fc32d74-d617-403f-9a21-4fd4090ae02a':'Tiếng Anh công sở · Lớp đang chuẩn bị',
  };
  for(const [id,name]of Object.entries(names))await db.query('UPDATE class_offerings SET name=$2,"updatedAt"=clock_timestamp() WHERE id=$1',[id,name]);
  await db.query(`UPDATE modules SET title='Thư viện bài luyện bổ trợ',description='Bài luyện hiện có được giữ nguyên cùng lịch sử học tập. Lộ trình chính nằm trong các học phần được đánh số.' WHERE title IN ('Foreign module','Synthetic standard module')`);
  const roles={STUDENT:'Học viên Smart English',INSTRUCTOR:'Giảng viên tiếng Anh công sở',COUNSELOR:'Tư vấn học tập Smart English',CASHIER:'Kế toán học phí Smart English',SYSTEM_ADMIN:'Quản trị Smart English',ACADEMIC_MANAGER:'Học vụ Smart English',TEACHING_INSPECTOR:'Thanh tra đào tạo Smart English'};
  for(const [role,label]of Object.entries(roles))await db.query(`UPDATE users SET "fullName"=$2 WHERE role::text=$1 AND "fullName" ~* '(wave[0-9]|synthetic|\mDEV\M|\mTEST\M|W02B)'`,[role,label]);
  await db.query('COMMIT');console.log('Natural display names saved. IDs, roles, owners, prices and business states preserved.');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
