/**
 * User Avatar Utilities
 *
 * Generates avatar colors and initials from user information
 */

/**
 * Generate a consistent color from a user ID.
 * Uses the same algorithm everywhere to ensure colors match across users' views.
 *
 * IMPORTANT: Always use the user ID, not email or name, to ensure consistency.
 */
export function generateAvatarColor(userId: string): string {
  // Hash the user ID to get a consistent hue
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use the hash to generate a hue (0-360)
  const hue = Math.abs(hash) % 360;

  // Return a saturated, bright color in HSL format
  return `hsl(${hue}, 70%, 50%)`;
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
