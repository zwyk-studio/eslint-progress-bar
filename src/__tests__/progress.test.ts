import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shouldShowProgress, createProgressBar } from "../progress.js";

describe("shouldShowProgress", () => {
  const originalEnv = process.env;
  const originalIsTTY = process.stderr.isTTY;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear CI variables
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.TRAVIS;
    delete process.env.CIRCLECI;
    delete process.env.GITLAB_CI;
    delete process.env.JENKINS_URL;
    delete process.env.BUILDKITE;
    delete process.env.TF_BUILD;
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY });
  });

  it("returns true when stderr is TTY and not in CI", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    expect(shouldShowProgress()).toBe(true);
  });

  it("returns false when stderr is not TTY", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(shouldShowProgress()).toBe(false);
  });

  it("returns false when stderr.isTTY is undefined", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: undefined, configurable: true });
    expect(shouldShowProgress()).toBe(false);
  });

  it("returns false when CI env var is set", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.CI = "true";
    expect(shouldShowProgress()).toBe(false);
  });

  it("returns false when GITHUB_ACTIONS is set", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.GITHUB_ACTIONS = "true";
    expect(shouldShowProgress()).toBe(false);
  });

  it("returns false when TRAVIS is set", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.TRAVIS = "true";
    expect(shouldShowProgress()).toBe(false);
  });

  it("returns false when GITLAB_CI is set", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.GITLAB_CI = "true";
    expect(shouldShowProgress()).toBe(false);
  });
});

describe("createProgressBar", () => {
  const originalIsTTY = process.stderr.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY });
  });

  it("returns no-op implementation when not TTY", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    const bar = createProgressBar();

    // Should not throw
    expect(() => {
      bar.start(100);
      bar.increment(10);
      bar.stop();
    }).not.toThrow();
  });

  it("returns no-op implementation in CI", () => {
    Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
    process.env.CI = "true";
    const bar = createProgressBar();

    // Should not throw
    expect(() => {
      bar.start(100);
      bar.increment(10);
      bar.stop();
    }).not.toThrow();

    delete process.env.CI;
  });
});
