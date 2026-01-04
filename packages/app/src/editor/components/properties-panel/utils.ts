/**
 * Properties Panel - Utility Functions
 *
 * Helper functions used across properties panel components.
 */

/**
 * Get the default color for a datum plane based on its ID.
 * XY plane = blue, XZ plane = green, YZ plane = red.
 */
export function getDefaultPlaneColorHex(planeId: string): string {
  switch (planeId) {
    case "xy":
      return "#0088ff";
    case "xz":
      return "#00cc44";
    case "yz":
      return "#ff4444";
    default:
      return "#888888";
  }
}
