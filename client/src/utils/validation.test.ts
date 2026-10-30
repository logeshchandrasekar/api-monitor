import { describe, expect, it } from "vitest";
import {
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  validateConfirmation,
  validateEmail,
  validateName,
  validateNewPassword,
} from "./validation";

describe("validation", () => {
  it("validateEmail", () => {
    expect(validateEmail("")).not.toBeNull();
    expect(validateEmail("nope")).not.toBeNull();
    expect(validateEmail("a@b")).not.toBeNull();
    expect(validateEmail("  loki@example.com  ")).toBeNull();
  });
  it("validateName trims and limits", () => {
    expect(validateName("   ")).not.toBeNull();
    expect(validateName("x".repeat(MAX_NAME_LENGTH + 1))).not.toBeNull();
    expect(validateName("  Loki ")).toBeNull();
  });
  it("validateNewPassword enforces the minimum length", () => {
    expect(validateNewPassword("")).not.toBeNull();
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
    expect(validateNewPassword("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
  it("validateConfirmation", () => {
    expect(validateConfirmation("secret-123", "")).not.toBeNull();
    expect(validateConfirmation("secret-123", "secret-124")).not.toBeNull();
    expect(validateConfirmation("secret-123", "secret-123")).toBeNull();
  });
});
