export type M04ErrorCode =
  | 'EVALUATION_POLICY_NOT_CONFIGURED'
  | 'EVALUATION_POLICY_AMBIGUOUS'
  | 'EVALUATION_POLICY_INVALID'
  | 'EVALUATION_INPUT_INVALID'
  | 'RECOMMENDATION_CONFIG_INVALID';

export class M04DomainError extends Error {
  constructor(
    readonly code: M04ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'M04DomainError';
  }
}
