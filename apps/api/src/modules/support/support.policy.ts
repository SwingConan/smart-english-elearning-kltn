import { BadRequestException } from '@nestjs/common';
export const SUPPORT_CAPABILITIES = [
  'support.ticket.read',
  'support.ticket.assign',
  'support.ticket.reply',
  'support.ticket.transfer',
  'support.ticket.close',
  'support.application.write',
  'support.application.review',
  'support.referral.respond',
  'support.taxonomy.author',
  'support.taxonomy.approve',
] as const;
export const ROUTES: Record<string, string> = {
  ACADEMIC: 'ACADEMIC_MANAGER',
  FINANCE: 'CASHIER',
  LEARNING: 'INSTRUCTOR',
};
export const transitions: Record<string, string[]> = {
  NEW: ['TRIAGED', 'IN_PROGRESS'],
  TRIAGED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_SPECIALIST', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  WAITING_SPECIALIST: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS'],
};
export function safeSupportText(text: string) {
  if (
    /\b(password|mật khẩu|mat khau|cccd|cvv|cvc)\s*[:=]/iu.test(text) ||
    /\b\d[\d -]{10,23}\d\b/u.test(text)
  )
    throw new BadRequestException(
      'Do not submit passwords, identity documents or payment card data',
    );
  return text.trim();
}
export function supportTransition(from: string, to: string, learner: boolean) {
  if (!(transitions[from] ?? []).includes(to) || (learner && !['CLOSED', 'REOPENED'].includes(to)))
    throw new BadRequestException('Unsupported ticket transition');
}
