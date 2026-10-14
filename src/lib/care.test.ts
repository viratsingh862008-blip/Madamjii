import { describe, expect, it } from "vitest";
import {
  canInviteMember,
  canReviewSharedSchedule,
  canSendGentleFollowUp,
  getSharedCheckInSummary,
  isWithinQuietHours,
} from "./care";

describe("care permissions", () => {
  it("allows only the admin to create an invitation", () => {
    expect(canInviteMember("admin")).toBe(true);
    expect(canInviteMember("friend")).toBe(false);
  });

  it("allows the friend to review shared schedule proposals", () => {
    expect(canReviewSharedSchedule("friend")).toBe(true);
    expect(canReviewSharedSchedule("admin")).toBe(false);
  });
});

describe("shared check-in summaries", () => {
  const checkIn = {
    mood: "steady",
    energy: 3,
    note: "This private note must never be shared.",
    createdAt: "2026-10-15T08:00:00.000Z",
  };

  it("returns only approved summary fields", () => {
    expect(getSharedCheckInSummary(checkIn, true)).toEqual({
      mood: "steady",
      energy: 3,
      createdAt: "2026-10-15T08:00:00.000Z",
    });
  });

  it("returns no summary when sharing is disabled", () => {
    expect(getSharedCheckInSummary(checkIn, false)).toBeNull();
  });

  it("never includes a private note in a shared summary", () => {
    expect(getSharedCheckInSummary(checkIn, true)).not.toHaveProperty("note");
  });
});

describe("quiet hours", () => {
  it("treats 23:00 and 06:59 as quiet time", () => {
    expect(isWithinQuietHours(23 * 60)).toBe(true);
    expect(isWithinQuietHours(6 * 60 + 59)).toBe(true);
  });

  it("treats 07:00 and daytime as allowed time", () => {
    expect(isWithinQuietHours(7 * 60)).toBe(false);
    expect(isWithinQuietHours(12 * 60)).toBe(false);
  });

  it("rejects invalid time values", () => {
    expect(() => isWithinQuietHours(-1)).toThrow(RangeError);
    expect(() => isWithinQuietHours(1440)).toThrow(RangeError);
  });
});

describe("gentle follow-up eligibility", () => {
  it("allows one follow-up for a pending task after original dispatch", () => {
    expect(canSendGentleFollowUp({
      originalDispatched: true, taskStatus: "pending", followUpConsumed: false,
    })).toBe(true);
  });

  it("does not follow up if the original was not dispatched", () => {
    expect(canSendGentleFollowUp({
      originalDispatched: false, taskStatus: "pending", followUpConsumed: false,
    })).toBe(false);
  });

  it("does not follow up after completion or after a follow-up was consumed", () => {
    expect(canSendGentleFollowUp({
      originalDispatched: true, taskStatus: "completed", followUpConsumed: false,
    })).toBe(false);
    expect(canSendGentleFollowUp({
      originalDispatched: true, taskStatus: "pending", followUpConsumed: true,
    })).toBe(false);
  });
});