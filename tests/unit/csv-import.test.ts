import { columnIndex, detectDelimiter, parseAmount, parseCsv, parseDateCell } from "@agencyos/modules/import/csv";
import { describe, expect, it } from "vitest";

describe("parseCsv", () => {
  it("detecta ; y , y respeta comillas, saltos de línea y BOM", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b\n1,2")).toBe(",");
    const rows = parseCsv('﻿Nombre;Notas\r\n"Panadería ""Sol""";"línea 1\nlínea 2"\r\n\r\nOtro;x');
    expect(rows).toEqual([
      ["Nombre", "Notas"],
      ['Panadería "Sol"', "línea 1\nlínea 2"],
      ["Otro", "x"],
    ]);
  });
  it("encuentra columnas por alias sin tildes ni mayúsculas", () => {
    expect(columnIndex(["Fecha", "Descripción", "Importe"], ["monto", "importe"])).toBe(2);
    expect(columnIndex(["TELÉFONO / WhatsApp"], ["telefono / whatsapp"])).toBe(0);
    expect(columnIndex(["x"], ["y"])).toBe(-1);
  });
});

describe("parseAmount", () => {
  it("formatos es-AR, internacionales y negativos", () => {
    expect(parseAmount("$ 1.234,56")).toEqual({ value: "1234.56", negative: false });
    expect(parseAmount("-1234.5")).toEqual({ value: "1234.50", negative: true });
    expect(parseAmount("(1.500,00)")).toEqual({ value: "1500.00", negative: true });
    expect(parseAmount("1,234.56")).toEqual({ value: "1234.56", negative: false });
    expect(parseAmount("1.234")).toEqual({ value: "1234.00", negative: false });
    expect(parseAmount("12.345.678")).toEqual({ value: "12345678.00", negative: false });
    expect(parseAmount("500-")).toEqual({ value: "500.00", negative: true });
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("parseDateCell", () => {
  it("dd/mm/aaaa, dd-mm-aa e ISO; rechaza fechas imposibles", () => {
    expect(parseDateCell("05/11/2026")).toBe("2026-11-05");
    expect(parseDateCell("5-1-26")).toBe("2026-01-05");
    expect(parseDateCell("2026-11-05")).toBe("2026-11-05");
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("ayer")).toBeNull();
  });
});
