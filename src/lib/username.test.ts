import { describe, expect, it } from "vitest";
import { usernameToAuthEmail } from "./supabase";

describe("username authentication aliases", () => {
  it("normalizes whitespace and case", () => {
    expect(usernameToAuthEmail("  Aryan_08  ")).toBe("aryan_08@accounts.areyouok.app");
  });
  it("accepts supported punctuation", () => {
    expect(usernameToAuthEmail("aryan.singh-08")).toBe("aryan.singh-08@accounts.areyouok.app");
  });
  it("rejects usernames shorter than three characters", () => {
    expect(() => usernameToAuthEmail("ab")).toThrow(/3–24 characters/);
  });
  it("rejects usernames longer than 24 characters", () => {
    expect(() => usernameToAuthEmail("a".repeat(25))).toThrow(/3–24 characters/);
  });
  it("rejects spaces and unsupported characters", () => {
    expect(() => usernameToAuthEmail("aryan singh")).toThrow(/3–24 characters/);
    expect(() => usernameToAuthEmail("aryan@singh")).toThrow(/3–24 characters/);
  });
});
