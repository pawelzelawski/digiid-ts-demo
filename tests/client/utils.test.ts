import { describe, expect, it } from 'vitest';
import { getDigiByteAddressType } from '../../src/client/utils';

describe('getDigiByteAddressType', () => {
  it('returns unknown for empty values', () => {
    expect(getDigiByteAddressType(undefined)).toBe('Unknown');
    expect(getDigiByteAddressType(null)).toBe('Unknown');
    expect(getDigiByteAddressType('')).toBe('Unknown');
  });

  it('detects segwit addresses', () => {
    expect(getDigiByteAddressType('dgb1xyz')).toBe('SegWit (Bech32)');
  });

  it('detects script addresses', () => {
    expect(getDigiByteAddressType('Sxyz')).toBe('Script (P2SH)');
  });

  it('detects legacy addresses', () => {
    expect(getDigiByteAddressType('Dxyz')).toBe('Legacy (P2PKH)');
  });

  it('returns unknown for unsupported prefixes', () => {
    expect(getDigiByteAddressType('abc123')).toBe('Unknown');
  });
});
