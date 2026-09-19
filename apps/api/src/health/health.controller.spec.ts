import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok', () => {
    const controller = new HealthController();
    expect(controller.getHealth()).toMatchObject({
      status: 'ok',
      service: 'smart-english-elearning-api',
    });
  });
});
