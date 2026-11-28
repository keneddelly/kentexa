import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { featureFromRoute, redactErrorMessage, routeWithoutQuery, serverErrorStatus } from './server-errors';

describe('server errors (Error Watch)', () => {
  it('records only 5xx responses', () => {
    expect(serverErrorStatus(new BadRequestException('bad'))).toBeNull();
    expect(serverErrorStatus(new InternalServerErrorException('x'))).toBe(500);
    expect(serverErrorStatus(new Error('boom'))).toBe(500);
  });

  it('redacts tokens, emails and phone numbers', () => {
    const msg = redactErrorMessage('Bearer abc.def-123 failed for jane@example.com call +255 712 345 678 eyJhbGci.eyJzdWIi.sig');
    expect(msg).not.toContain('jane@example.com');
    expect(msg).not.toContain('712 345 678');
    expect(msg).not.toContain('abc.def-123');
    expect(msg).not.toContain('eyJhbGci');
    expect(msg).toContain('[redacted-email]');
  });

  it('caps the message at 300 characters', () => {
    expect(redactErrorMessage('x'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });

  it('never stores the query string and derives the feature', () => {
    expect(routeWithoutQuery('/feed/moments?token=secret')).toBe('/feed/moments');
    expect(featureFromRoute('/feed/moments')).toBe('feed');
    expect(featureFromRoute('/')).toBe('root');
  });
});
