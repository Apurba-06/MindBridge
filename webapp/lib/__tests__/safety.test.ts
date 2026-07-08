import { describe, it, expect } from "vitest";
import { hasCrisisSignal } from "../safety";

describe("hasCrisisSignal", () => {
  it("flags clearly high-risk phrasing", () => {
    expect(hasCrisisSignal("I don't want to be alive anymore")).toBe(true);
    expect(hasCrisisSignal("I think I want to end it all")).toBe(true);
    expect(hasCrisisSignal("everyone would be better off without me")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(hasCrisisSignal("I CAN'T DO THIS ANYMORE")).toBe(true);
  });

  it("does not flag ordinary difficult messages", () => {
    expect(hasCrisisSignal("I had a really rough day at work")).toBe(false);
    expect(hasCrisisSignal("My exams didn't go well and I'm stressed")).toBe(false);
  });

  it("does not flag unrelated use of overlapping words", () => {
    expect(hasCrisisSignal("This deadline is going to kill my schedule")).toBe(false);
  });
});
