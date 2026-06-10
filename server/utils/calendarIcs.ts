import crypto from "crypto";

/** Escape text for inclusion in an iCalendar (.ics) field. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Format a Date as an iCalendar UTC timestamp (YYYYMMDDTHHMMSSZ). */
export function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Deterministic per-user token for the public calendar feed URL.
 * NOTE: secret source kept identical to the original inline implementation so
 * existing subscription URLs remain valid. (In production JWT_SECRET is set.)
 */
export function generateCalendarToken(userId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}-${process.env.JWT_SECRET || "doapp-secret"}-calendar`)
    .digest("hex")
    .substring(0, 32);
}
