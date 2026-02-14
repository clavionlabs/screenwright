import { describe, it, expect } from 'vitest';
import { brandingSchema, configSchema } from '../../src/config/config-schema.js';

describe('brandingSchema', () => {
  it('accepts valid 6-digit hex colors', () => {
    const result = brandingSchema.parse({
      brandColor: '#4F46E5',
      textColor: '#FFFFFF',
    });
    expect(result.brandColor).toBe('#4F46E5');
    expect(result.textColor).toBe('#FFFFFF');
  });

  it('accepts 3-digit hex shorthand', () => {
    const result = brandingSchema.parse({
      brandColor: '#FFF',
      textColor: '#000',
    });
    expect(result.brandColor).toBe('#FFF');
  });

  it('accepts 8-digit hex with alpha', () => {
    const result = brandingSchema.parse({
      brandColor: '#4F46E5FF',
      textColor: '#FFFFFF80',
    });
    expect(result.brandColor).toBe('#4F46E5FF');
  });

  it('rejects color without hash', () => {
    expect(() => brandingSchema.parse({
      brandColor: '4F46E5',
      textColor: '#FFFFFF',
    })).toThrow();
  });

  it('rejects non-hex characters', () => {
    expect(() => brandingSchema.parse({
      brandColor: '#GGGGGG',
      textColor: '#FFFFFF',
    })).toThrow();
  });

  it('rejects empty string', () => {
    expect(() => brandingSchema.parse({
      brandColor: '',
      textColor: '#FFFFFF',
    })).toThrow();
  });

  it('accepts optional fontFamily', () => {
    const result = brandingSchema.parse({
      brandColor: '#4F46E5',
      textColor: '#FFFFFF',
      fontFamily: 'Inter',
    });
    expect(result.fontFamily).toBe('Inter');
  });

  it('fontFamily defaults to undefined when omitted', () => {
    const result = brandingSchema.parse({
      brandColor: '#4F46E5',
      textColor: '#FFFFFF',
    });
    expect(result.fontFamily).toBeUndefined();
  });
});

describe('configSchema branding field', () => {
  it('branding is optional — backwards compatible', () => {
    const result = configSchema.parse({});
    expect(result.branding).toBeUndefined();
  });

  it('accepts config with branding', () => {
    const result = configSchema.parse({
      branding: {
        brandColor: '#4F46E5',
        textColor: '#FFFFFF',
      },
    });
    expect(result.branding?.brandColor).toBe('#4F46E5');
  });

  it('rejects invalid branding nested inside config', () => {
    expect(() => configSchema.parse({
      branding: { brandColor: 'not-a-color', textColor: '#FFF' },
    })).toThrow();
  });
});
