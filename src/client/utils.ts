// Simple utility to determine DigiByte address type based on prefix

export type DigiByteAddressType = 'DigiByte (DGB)' | 'DigiAsset (DGA)' | 'Unknown';

export function getDigiByteAddressType(address: string | undefined | null): DigiByteAddressType {
  if (!address) {
    return 'Unknown';
  }
  if (address.startsWith('dgb1')) {
    return 'DigiByte (DGB)';
  }
  // Add other prefixes if DigiAssets use a distinct one, e.g., 'dga1'
  // For now, assume non-DGB is DigiAsset, but this might need refinement
  // depending on actual DigiAsset address formats.
  else {
    // Assuming DigiAssets might start differently or be the fallback
    // This is a placeholder assumption.
    return 'DigiAsset (DGA)'; // Placeholder - ADJUST BASED ON ACTUAL DGA PREFIX
  }
} 