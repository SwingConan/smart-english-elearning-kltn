import { CalendarDays, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router';
import { courseLevelLabel, modalityLabel, skillScopeLabel } from '@/features/catalog/display';
import { pricingLabel } from '@/features/enrollments/display';
import type { PlacementRecommendation, PlacementRecommendationOffering } from './types';

const skillLabel = (skill: string) => ({ LISTENING: 'Listening', READING: 'Reading', SPEAKING: 'Speaking', WRITING: 'Writing' })[skill] ?? skill;
const stateLabel = { AVAILABLE: 'Đang nhận đăng ký', FULL: 'Đủ chỗ', UPCOMING: 'Chưa mở đăng ký', CLOSED: 'Đã đóng đăng ký' };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('vi-VN') : 'Chưa cập nhật';
const dayLabel = (day: number) => ({ 1: 'Thứ Hai', 2: 'Thứ Ba', 3: 'Thứ Tư', 4: 'Thứ Năm', 5: 'Thứ Sáu', 6: 'Thứ Bảy', 7: 'Chủ nhật' })[day] ?? `Ngày ${day}`;
const time = (value: string) => new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function RuleExplanation({ recommendation }: { recommendation: PlacementRecommendation }) {
  if (!recommendation.reason || recommendation.reasonStatus !== 'AVAILABLE') {
    return <p className="mt-3 text-sm text-slate-600">Lý do phù hợp hiện chưa thể hiển thị.</p>;
  }
  const matched = recommendation.reason.criteria.filter((criterion) => criterion.matched);
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4">
      <h4 className="font-semibold text-slate-900">Vì sao khóa học này phù hợp?</h4>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
        {matched.map((criterion, index) => (
          <li key={`${criterion.skill}-${index}`}>
            {skillLabel(criterion.skill)} {criterion.value === null ? 'chưa có kết quả' : `${criterion.value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}
            {' nằm trong khoảng phù hợp '}{criterion.min ?? 0}–{criterion.max ?? 100}%.
          </li>
        ))}
      </ul>
    </div>
  );
}

function OfferingCard({ offering }: { offering: PlacementRecommendationOffering }) {
  const enrolled = offering.currentEnrollmentStatus === 'ACTIVE';
  const pending = offering.currentEnrollmentStatus === 'PENDING_PAYMENT';
  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{offering.code}</p><h4 className="mt-1 font-bold text-slate-950">{offering.name}</h4></div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{enrolled ? 'Đã đăng ký' : pending ? 'Chờ thanh toán' : stateLabel[offering.registrationState]}</span>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <p><CalendarDays className="mr-1 inline" size={15} />{date(offering.classStart)} – {date(offering.classEnd)}</p>
        <p><MapPin className="mr-1 inline" size={15} />{modalityLabel(offering.modality)}</p>
        <p><Users className="mr-1 inline" size={15} />{offering.registeredCount} đã đăng ký{offering.remainingSeats === null ? '' : ` · còn ${offering.remainingSeats} chỗ`}</p>
        <p>{pricingLabel(offering.pricingType, offering.tuitionFeeVnd)}</p>
        {offering.instructor ? <p>Giảng viên: {offering.instructor.fullName}</p> : null}
        {offering.totalSessions ? <p>{offering.totalSessions} buổi{offering.totalPeriods ? ` · ${offering.totalPeriods} tiết` : ''}</p> : null}
        <p>Đăng ký: {date(offering.enrollmentStart)} – {date(offering.enrollmentEnd)}</p>
      </div>
      {offering.scheduleSlots.length ? <ul className="mt-3 space-y-1 text-sm text-slate-600">{offering.scheduleSlots.map((slot) => <li key={slot.id}>{dayLabel(slot.dayOfWeek)}, {time(slot.startTime)}–{time(slot.endTime)}{slot.locationText ? ` · ${slot.locationText}` : ''}</li>)}</ul> : null}
      {enrolled && offering.currentEnrollmentId ? <Link className="btn-secondary mt-4" to={`/student/enrollments/${offering.currentEnrollmentId}`}>Vào lớp học</Link> : pending ? <Link className="btn-secondary mt-4" to="/student/enrollments">Xem đăng ký của tôi</Link> : <Link className={offering.actionable ? 'btn-primary mt-4' : 'btn-secondary mt-4'} to={`/classes/${offering.id}`}>{offering.actionable ? 'Xem và đăng ký lớp' : 'Xem thông tin lớp'}</Link>}
    </li>
  );
}

export function CourseRecommendationCard({ recommendation }: { recommendation: PlacementRecommendation }) {
  const actionable = recommendation.classOfferings.some((offering) => offering.actionable);
  return (
    <article className="card">
      <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">{recommendation.kind === 'PRIMARY' ? 'Khóa học phù hợp chính' : 'Lựa chọn bổ sung'}</p>
      <h3 className="mt-2 text-2xl font-bold text-slate-950">{recommendation.course.title}</h3>
      <p className="mt-2 text-sm font-medium text-slate-500">{courseLevelLabel(recommendation.course.level)} · {skillScopeLabel(recommendation.course.skillScope)}</p>
      <p className="mt-4 leading-7 text-slate-700">{recommendation.course.description}</p>
      <Link className="mt-4 inline-block font-semibold text-indigo-700 underline" to={`/catalog/${recommendation.course.slug}`}>Xem chi tiết khóa học</Link>
      <RuleExplanation recommendation={recommendation} />
      <h4 className="mt-6 font-bold">Lớp đang có</h4>
      {recommendation.classOfferings.length ? <ul className="mt-3 grid gap-3">{recommendation.classOfferings.map((offering) => <OfferingCard key={offering.id} offering={offering} />)}</ul> : <p className="mt-2 text-sm text-slate-600">Khóa học phù hợp nhưng hiện chưa có lớp để đăng ký.</p>}
      {recommendation.classOfferings.length > 0 && !actionable ? <p className="mt-3 text-sm text-amber-800">Hiện chưa có lớp nào đang nhận đăng ký. Bạn vẫn có thể xem thông tin khóa học và quay lại sau.</p> : null}
    </article>
  );
}
