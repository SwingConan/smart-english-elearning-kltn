import { requireConfirmedPrice, requireOfferWindow } from './approved-offer.policy';

describe('PO approved offer price', () => {
  const paid = { standardPricingType: 'PAID', standardTuitionFeeVnd: 100000 };
  const review = {
    poPriceConfirmed: true,
    poPriceReference: 'PO decision fixture only; not operational approval',
  };
  it('requires explicit independent reviewer confirmation and source', () => {
    expect(() => requireConfirmedPrice(paid, {})).toThrow();
    expect(() => requireConfirmedPrice(paid, { ...review, poPriceConfirmed: false })).toThrow();
    expect(() => requireConfirmedPrice(paid, { ...review, poPriceReference: '    ' })).toThrow();
    expect(() => requireConfirmedPrice(paid, review)).not.toThrow();
  });
  it('never interprets unknown price as free', () => {
    expect(() =>
      requireConfirmedPrice({ standardPricingType: null, standardTuitionFeeVnd: null }, review),
    ).toThrow();
    expect(() => requireConfirmedPrice({ ...paid, standardTuitionFeeVnd: null }, review)).toThrow();
    expect(() => requireConfirmedPrice({ ...paid, standardTuitionFeeVnd: 0 }, review)).toThrow();
  });
  it('accepts only explicit FREE/0 or PAID positive integer', () => {
    expect(() =>
      requireConfirmedPrice({ standardPricingType: 'FREE', standardTuitionFeeVnd: 0 }, review),
    ).not.toThrow();
    for (const fee of [-1, 0.5, NaN, Infinity])
      expect(() =>
        requireConfirmedPrice({ ...paid, standardTuitionFeeVnd: fee }, review),
      ).toThrow();
    expect(() =>
      requireConfirmedPrice({ standardPricingType: 'FREE', standardTuitionFeeVnd: 1 }, review),
    ).toThrow();
  });
});
describe('Approved offer enrollment window', () => {
  const now = new Date('2026-11-08T00:00:00Z'),
    dates = {
      enrollmentStart: new Date('2026-11-08T00:00:00Z'),
      enrollmentEnd: new Date('2026-11-09T00:00:00Z'),
      classStart: new Date('2026-11-10T00:00:00Z'),
      classEnd: new Date('2026-12-10T00:00:00Z'),
    };
  it('requires future class and open enrollment window', () => {
    expect(requireOfferWindow(dates, now)).toEqual(dates);
    expect(() => requireOfferWindow({ ...dates, enrollmentEnd: now }, now)).toThrow();
    expect(() => requireOfferWindow({ ...dates, classStart: now }, now)).toThrow();
  });
  it('rejects reversed and invalid dates', () => {
    expect(() => requireOfferWindow({ ...dates, classEnd: dates.classStart }, now)).toThrow();
    expect(() =>
      requireOfferWindow({ ...dates, enrollmentStart: dates.classStart }, now),
    ).toThrow();
    expect(() => requireOfferWindow({ ...dates, classStart: new Date(NaN) }, now)).toThrow();
  });
});
