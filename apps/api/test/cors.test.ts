import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, parseExtraOrigins } from '../src/cors';

describe('isAllowedOrigin', () => {
  it('localhost aur private network IPs (web port 5173) allowed', () => {
    for (const o of [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://192.168.1.20:5173',
      'http://10.0.0.5:5173',
      'http://172.16.0.9:5173',
      'http://172.31.255.1:5173',
    ]) {
      expect(isAllowedOrigin(o), o).toBe(true);
    }
  });

  it('public sites, galat port, https, private range ke bahar ke IP block', () => {
    for (const o of [
      'http://evil.com',
      'http://evil.com:5173',
      'http://localhost:9999',
      'http://localhost',
      'https://localhost:5173',
      'http://8.8.8.8:5173',
      'http://172.32.0.1:5173',
      'http://192.168.1.20.evil.com:5173',
      'http://localhost.evil.com:5173',
      'not a url',
      'null',
    ]) {
      expect(isAllowedOrigin(o), o).toBe(false);
    }
  });

  it('origin header nahi (same-origin/curl) allowed; extra origins allowed', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin('https://game.example.com', ['https://game.example.com'])).toBe(true);
    expect(isAllowedOrigin('https://other.example.com', ['https://game.example.com'])).toBe(false);
  });

  it('parseExtraOrigins', () => {
    expect(parseExtraOrigins(' https://a.com , ,https://b.com ')).toEqual(['https://a.com', 'https://b.com']);
    expect(parseExtraOrigins(undefined)).toEqual([]);
  });
});
