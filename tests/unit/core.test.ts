import {
  addDays,
  addMonths,
  diffDays,
  formatMoney,
  isValidCuit,
  mulMoney,
  nextOccurrence,
  percentOf,
  splitByPercents,
  toCents,
  todayAR,
  zMoney,
} from "@agencyos/core";
import { describe, expect, it, vi } from "vitest";

describe("dinero", () => {
  it("convierte a centavos sin float", () => {
    expect(toCents("1234.56")).toBe(123456n);
    expect(toCents("0.1")).toBe(10n);
    expect(toCents("10.005")).toBe(1001n);
  });
  it("multiplica y calcula porcentajes con redondeo al centavo", () => {
    expect(mulMoney("33.33", "3")).toBe("99.99");
    expect(mulMoney("100", "1.5")).toBe("150.00");
    expect(percentOf("1000", "12.5")).toBe("125.00");
  });
  it("reparte 50/50 sin perder centavos", () => {
    expect(splitByPercents("100.01", [50, 50])).toEqual(["50.01", "50.00"]);
  });
  it("formatea en es-AR", () => {
    expect(formatMoney("1234.56", "ARS")).toBe("$ 1.234,56");
    expect(formatMoney("20", "USD")).toBe("US$ 20");
  });
  it("valida montos con coma decimal", () => {
    expect(zMoney.parse("1.234,50")).toBe("1234.50");
    expect(zMoney.parse("99")).toBe("99.00");
    expect(() => zMoney.parse("-1")).toThrow();
  });
});

describe("fechas Argentina", () => {
  it("hoy en ART aunque en UTC ya sea mañana", () => {
    vi.setSystemTime(new Date("2026-11-04T02:30:00Z")); // 23:30 ART del 3/11
    expect(todayAR()).toBe("2026-11-03");
    vi.useRealTimers();
  });
  it("suma días y meses con fin de mes", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(diffDays("2026-11-10", "2026-11-03")).toBe(7);
  });
});

describe("recurrencia", () => {
  it("días hábiles saltea el fin de semana", () => {
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", "2026-11-06")).toBe("2026-11-09"); // vie → lun
  });
  it("mensual y semanal", () => {
    expect(nextOccurrence("FREQ=MONTHLY", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2", "2026-11-03")).toBe("2026-11-17");
  });
});

describe("CUIT", () => {
  it("acepta dígito verificador válido y rechaza inválido", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20-12345678-1")).toBe(false);
    expect(isValidCuit("30-71234567-1")).toBe(isValidCuit("30712345671"));
  });
});
