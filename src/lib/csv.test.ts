import { describe, it, expect } from "vitest";
import { parseCsv, parseMoneyToCents, parseDateToIso } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    const text = `name,notes\n"Smith, Jane","She said ""hi""\nand left"`;
    expect(parseCsv(text)).toEqual([
      ["name", "notes"],
      ["Smith, Jane", 'She said "hi"\nand left'],
    ]);
  });

  it("handles CRLF line endings and a UTF-8 BOM", () => {
    const text = "﻿a,b\r\n1,2\r\n";
    expect(parseCsv(text)).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("keeps intentional empty cells but drops fully-empty lines", () => {
    expect(parseCsv("a,b\n,2\n\n3,\n")).toEqual([["a", "b"], ["", "2"], ["3", ""]]);
  });
});

describe("parseMoneyToCents", () => {
  it("parses dollars, commas, and $ signs", () => {
    expect(parseMoneyToCents("$1,234.56")).toBe(123456);
    expect(parseMoneyToCents("1234.56")).toBe(123456);
    expect(parseMoneyToCents("1,234")).toBe(123400);
    expect(parseMoneyToCents("0.01")).toBe(1);
  });

  it("rejects junk and negatives", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-5")).toBeNull();
  });
});

describe("parseDateToIso", () => {
  it("parses ISO, US slash, and 2-digit-year dates", () => {
    expect(parseDateToIso("2024-03-05")).toBe("2024-03-05");
    expect(parseDateToIso("3/5/2024")).toBe("2024-03-05");
    expect(parseDateToIso("03/05/24")).toBe("2024-03-05");
    expect(parseDateToIso("12/31/99")).toBe("1999-12-31");
  });

  it("rejects junk and out-of-range values", () => {
    expect(parseDateToIso("")).toBeNull();
    expect(parseDateToIso("13/45/2024")).toBeNull();
    expect(parseDateToIso("not a date")).toBeNull();
  });
});
