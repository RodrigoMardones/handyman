import { describe, expect, it } from "vitest";
import { formatHalfEven } from "./rounding.js";

// Expected values generated with CPython 3.12:
//   python3 -c "print(f'{x:.{n}f}')"
// (batch-generated; see the parity table below). CPython rounds the true
// double value half-to-even, so this is the ground truth we mirror.
const cases: Array<[value: number, decimals: number, expected: string]> = [
  [2.5, 0, "2"],
  [0.125, 2, "0.12"],
  [0.135, 2, "0.14"],
  [2.675, 2, "2.67"],
  [2.5, 2, "2.50"],
  [3.5, 2, "3.50"],
  [1.005, 2, "1.00"],
  [0.5, 0, "0"],
  [1.5, 0, "2"],
  [3.5, 0, "4"],
  [-2.5, 0, "-2"],
  [-0.125, 2, "-0.12"],
  [2.345, 2, "2.35"],
  [2.355, 2, "2.35"],
  [1.255, 2, "1.25"],
  [0.0, 2, "0.00"],
  [123.456, 2, "123.46"],
  [1.0, 0, "1"],
  [10.0, 2, "10.00"],
  [0.001, 2, "0.00"],
  [2.5, 1, "2.5"],
  [0.15, 1, "0.1"],
  [0.25, 1, "0.2"],
  [0.35, 1, "0.3"],
  [0.45, 1, "0.5"],
];

describe("formatHalfEven", () => {
  it.each(cases)("formatHalfEven(%f, %i) === %s", (value, decimals, expected) => {
    expect(formatHalfEven(value, decimals)).toBe(expected);
  });

  it("required acceptance cases", () => {
    expect(formatHalfEven(2.5, 0)).toBe("2");
    expect(formatHalfEven(0.125, 2)).toBe("0.12");
  });

  it("rejects non-finite values", () => {
    expect(() => formatHalfEven(Number.NaN, 2)).toThrow(RangeError);
    expect(() => formatHalfEven(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
  });

  it("rejects invalid decimals", () => {
    expect(() => formatHalfEven(1.0, -1)).toThrow(RangeError);
    expect(() => formatHalfEven(1.0, 1.5)).toThrow(RangeError);
  });
});
