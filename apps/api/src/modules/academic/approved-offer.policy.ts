import { BadRequestException } from '@nestjs/common';

export function requireConfirmedPrice(
  version: { standardPricingType: string | null; standardTuitionFeeVnd: number | null },
  review: { poPriceConfirmed?: boolean; poPriceReference?: string },
) {
  const fee = version.standardTuitionFeeVnd;
  if (
    !review.poPriceConfirmed ||
    !review.poPriceReference ||
    review.poPriceReference.trim().length < 10 ||
    review.poPriceReference.trim().length > 300 ||
    !Number.isSafeInteger(fee) ||
    !(
      (version.standardPricingType === 'PAID' && fee! > 0) ||
      (version.standardPricingType === 'FREE' && fee === 0)
    )
  )
    throw new BadRequestException({
      code: 'PO_APPROVED_PRICE_REQUIRED',
      message: 'Cần giá VND chính thức và nguồn quyết định PO; giá legacy không phải phê duyệt.',
    });
}
export function requireOfferWindow(
  dates: { enrollmentStart: Date; enrollmentEnd: Date; classStart: Date; classEnd: Date },
  now: Date,
) {
  const { enrollmentStart: a, enrollmentEnd: b, classStart: c, classEnd: d } = dates;
  if (
    [a, b, c, d].some((v) => !Number.isFinite(v.getTime())) ||
    b <= a ||
    c < b ||
    d <= c ||
    c <= now ||
    b <= now
  )
    throw new BadRequestException(
      'Cần khoảng tuyển sinh và thời gian lớp hợp lệ, có offset; không sửa lịch lớp cũ.',
    );
  return dates;
}
