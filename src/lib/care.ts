export type CareRole = "admin" | "friend";

export interface CheckInFields {
  mood: string;
  energy: number;
  note?: string | null;
  createdAt: string;
}

export function canInviteMember(role: CareRole): boolean {
  return role === "admin";
}

export function canReviewSharedSchedule(role: CareRole): boolean {
  return role === "friend";
}

export function getSharedCheckInSummary(
  checkIn: CheckInFields,
  shareDailySummary: boolean,
): Pick<CheckInFields, "mood" | "energy" | "createdAt"> | null {
  if (!shareDailySummary) return null;
  return { mood: checkIn.mood, energy: checkIn.energy, createdAt: checkIn.createdAt };
}

export function isWithinQuietHours(
  localMinutes: number,
  startMinutes = 23 * 60,
  endMinutes = 7 * 60,
): boolean {
  const valid = (value: number) => Number.isInteger(value) && value >= 0 && value < 24 * 60;
  if (!valid(localMinutes) || !valid(startMinutes) || !valid(endMinutes)) {
    throw new RangeError("Times must be integer minutes within a local day.");
  }
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return localMinutes >= startMinutes && localMinutes < endMinutes;
  return localMinutes >= startMinutes || localMinutes < endMinutes;
}

export function canSendGentleFollowUp(input: {
  originalDispatched: boolean;
  taskStatus: "pending" | "completed" | "skipped" | "cancelled";
  followUpConsumed: boolean;
}): boolean {
  return input.originalDispatched && input.taskStatus === "pending" && !input.followUpConsumed;
}