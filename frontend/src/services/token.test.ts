import { describe, it, expect } from 'vitest';
import { getAccessToken, setAccessToken, clearAccessToken } from './token';

describe('token (memoria)', () => {
    it('set, get y clear del access token', () => {
        clearAccessToken();
        expect(getAccessToken()).toBeNull();
        setAccessToken('abc123');
        expect(getAccessToken()).toBe('abc123');
        clearAccessToken();
        expect(getAccessToken()).toBeNull();
    });
});
