/**
 * User Avatar Utilities
 *
 * Generates avatar colors and initials from user information
 */

/**
 * Generate a consistent color from a string (username or email)
 * Uses a simple hash to create a hex color
 */
export function generateAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate RGB values from hash
  const r = (hash & 0xff0000) >> 16;
  const g = (hash & 0x00ff00) >> 8;
  const b = hash & 0x0000ff;

  // Ensure minimum brightness for readability
  const minBrightness = 100;
  const adjustedR = Math.max(r, minBrightness);
  const adjustedG = Math.max(g, minBrightness);
  const adjustedB = Math.max(b, minBrightness);

  // Convert to hex
  const toHex = (n: number) => {
    const hex = n.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(adjustedR)}${toHex(adjustedG)}${toHex(adjustedB)}`;
}

/**
 * Get initials from a name or email
 */
export function getInitials(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      // First letter of first name + first letter of last name
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      // First two letters of single name
      return parts[0].substring(0, 2).toUpperCase();
    }
  }

  if (email) {
    // Use first letter of email username
    const emailPart = email.split("@")[0];
    if (emailPart.length >= 2) {
      return emailPart.substring(0, 2).toUpperCase();
    } else if (emailPart.length === 1) {
      return emailPart.toUpperCase();
    }
  }

  return "?";
}
