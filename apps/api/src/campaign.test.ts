import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("isAdventDayUnlocked", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("при TESTING_UNLOCK_ALL_ADVENT открывает любой день даже «до» кампании", async () => {
    vi.stubEnv("TESTING_UNLOCK_ALL_ADVENT", "1");
    vi.stubEnv("CAMPAIGN_START_DATE", "2099-01-01");
    const { isAdventDayUnlocked } = await import("./campaign.js");
    expect(isAdventDayUnlocked(1)).toBe(true);
    expect(isAdventDayUnlocked(21)).toBe(true);
  });

  it("без флага и при дате в будущем — дни закрыты", async () => {
    vi.stubEnv("TESTING_UNLOCK_ALL_ADVENT", "0");
    vi.stubEnv("CAMPAIGN_START_DATE", "2099-01-01");
    const { isAdventDayUnlocked } = await import("./campaign.js");
    expect(isAdventDayUnlocked(1)).toBe(false);
  });
});
