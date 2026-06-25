import { describe, it, expect } from "vitest";
import { analyzeThreatLevel } from "../internal/edge-ai.js";

describe("analyzeThreatLevel", () => {
  it("detects CRITICAL threat for weapons/terrorism keywords", () => {
    const result = analyzeThreatLevel("Someone is planning a bomb attack with guns");
    expect(result.priority).toBe("CRITICAL");
    expect(result.routeTo).toBe("NSS");
  });

  it("detects HIGH threat for corruption keywords", () => {
    const result = analyzeThreatLevel("The minister took a bribe for the contract");
    expect(result.priority).toBe("HIGH");
    expect(result.routeTo).toBe("ANTI-CORRUPTION");
  });

  it("detects HIGH threat for drug trafficking", () => {
    const result = analyzeThreatLevel("There is a cocaine trafficking ring operating");
    expect(result.priority).toBe("HIGH");
    expect(result.routeTo).toBe("POLICE");
  });

  it("detects HIGH threat for violent crime", () => {
    const result = analyzeThreatLevel("I witnessed a robbery and assault at the store");
    expect(result.priority).toBe("HIGH");
    expect(result.routeTo).toBe("POLICE");
  });

  it("routes LOW/clean to POLICE by default", () => {
    const result = analyzeThreatLevel("I want to report suspicious activity near the park");
    expect(result.priority).toBe("LOW");
    expect(result.routeTo).toBe("POLICE");
  });

  it("returns SPAM for empty input", () => {
    const result = analyzeThreatLevel("");
    expect(result.routeTo).toBe("SPAM");
    expect(result.priority).toBe("LOW");
  });

  it("returns SPAM for whitespace-only input", () => {
    const result = analyzeThreatLevel("   \n\t  ");
    expect(result.routeTo).toBe("SPAM");
  });

  it("detects SPAM for low-signal short messages", () => {
    const result = analyzeThreatLevel("test message");
    expect(result.routeTo).toBe("SPAM");
    expect(result.priority).toBe("LOW");
  });

  it("is case-insensitive", () => {
    const result = analyzeThreatLevel("MURDER and KILL threats");
    expect(result.priority).toBe("CRITICAL");
    expect(result.routeTo).toBe("NSS");
  });

  it("prioritizes higher threat when multiple keywords match", () => {
    // Both "bomb" (CRITICAL/NSS) and "assault" (HIGH/POLICE) → CRITICAL wins
    const result = analyzeThreatLevel("bomb assault at the location");
    expect(result.priority).toBe("CRITICAL");
    expect(result.routeTo).toBe("NSS");
  });

  it("handles Armenian keywords correctly (currently English-only)", () => {
    // Armenian keywords not yet supported — should default to LOW/POLICE
    const result = analyzeThreatLevel("Կոռուպցիա և կաշառք");
    // Current behavior: no matches → LOW/POLICE
    // This test documents current state; Phase 2 will fix this
    expect(result.priority).toBe("LOW");
    expect(result.routeTo).toBe("POLICE");
  });
});
