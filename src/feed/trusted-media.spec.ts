import { BadRequestException } from '@nestjs/common';
import { assertMedia, assertTrustedMediaUrl } from './publish-input';

describe('post photos come only from Kentexa uploads', () => {
  it('accepts Cloudinary https photos', () => {
    expect(() => assertTrustedMediaUrl('https://res.cloudinary.com/kentexa/image/upload/v1/p.jpg')).not.toThrow();
  });

  it('accepts a relative path (it resolves to Kentexa itself)', () => {
    expect(() => assertTrustedMediaUrl('b.jpg')).not.toThrow();
  });

  it('refuses another host', () => {
    expect(() => assertTrustedMediaUrl('https://evil.example.com/a.jpg')).toThrow(BadRequestException);
  });

  it('refuses plain http even on a trusted host', () => {
    expect(() => assertTrustedMediaUrl('http://res.cloudinary.com/kentexa/p.jpg')).toThrow(BadRequestException);
  });

  it('refuses script addresses', () => {
    expect(() => assertTrustedMediaUrl('javascript:alert(1)')).toThrow(BadRequestException);
  });

  it('applies the rule to every photo in a post', () => {
    expect(() => assertMedia([
      { url: 'https://res.cloudinary.com/kentexa/a.jpg' },
      { url: 'https://evil.example.com/b.jpg' },
    ])).toThrow(BadRequestException);
  });
});
