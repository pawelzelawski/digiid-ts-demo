// Utility to determine DigiByte address type based on prefix

export type DigiByteAddressFormat = 'Legacy (P2PKH)' | 'Script (P2SH)' | 'SegWit (Bech32)' | 'Unknown';

/**
 * Determines the format of a DigiByte address based on its prefix.
 * Note: P2SH addresses on DigiByte often start with 'S', but complex scripts
 * might result in different prefixes. This function covers common cases.
 * Legacy starts with 'D'. SegWit starts with 'dgb1'.
 *
 * @param address The DigiByte address string.
 * @returns The determined address format.
 */
export function getDigiByteAddressType(address: string | undefined | null): DigiByteAddressFormat {
  if (!address) {
    return 'Unknown';
  }
  if (address.startsWith('dgb1')) {
    return 'SegWit (Bech32)';
  }
  if (address.startsWith('S')) { // Common prefix for P2SH on DGB
      return 'Script (P2SH)';
  }
  if (address.startsWith('D')) {
      return 'Legacy (P2PKH)';
  }

  // If it doesn't match known prefixes, return Unknown
  // Could potentially add DigiAsset checks here if they have distinct prefixes
  return 'Unknown';
} 