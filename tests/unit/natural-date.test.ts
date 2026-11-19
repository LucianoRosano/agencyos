import { parseNaturalDate } from "@agencyos/core";
import { describe, expect, it } from "vitest";

// 2026-11-19 es jueves
const T = "2026-11-19";

describe("parseNaturalDate", () => {
  it("hoy, mañana y pasado mañana, limpiando el título", () => {
    expect(parseNaturalDate("Llamar a Sofía mañana", T)).toMatchObject({ date: "2026-11-20", time: null, rest: "Llamar a Sofía" });
    expect(parseNaturalDate("Pagar hosting hoy", T)).toMatchObject({ date: T, rest: "Pagar hosting" });
    expect(parseNaturalDate("Mandar propuesta pasado mañana", T)).toMatchObject({ date: "2026-11-21", rest: "Mandar propuesta" });
    expect(parseNaturalDate("Revisar sitio para mañana", T).rest).toBe("Revisar sitio");
  });

  it("días de la semana", () => {
    expect(parseNaturalDate("Reunión el viernes", T).date).toBe("2026-11-20");
    expect(parseNaturalDate("Reunión el jueves", T).date).toBe("2026-11-26"); // hoy es jueves → el próximo
    expect(parseNaturalDate("Reunión este jueves", T).date).toBe(T);
    expect(parseNaturalDate("Backup el lunes", T).date).toBe("2026-11-23");
    expect(parseNaturalDate("Deploy miércoles", T).date).toBe("2026-11-25");
    expect(parseNaturalDate("Planificar la semana que viene", T)).toMatchObject({ date: "2026-11-23", rest: "Planificar" });
  });

  it("plazos relativos y fin de mes", () => {
    expect(parseNaturalDate("Renovar dominio en 3 días", T).date).toBe("2026-11-22");
    expect(parseNaturalDate("Seguimiento en dos semanas", T).date).toBe("2026-12-03");
    expect(parseNaturalDate("Cobrar en un mes", T).date).toBe("2026-12-19");
    expect(parseNaturalDate("Cerrar caja a fin de mes", T)).toMatchObject({ date: "2026-11-30", rest: "Cerrar caja" });
  });

  it("fechas explícitas, con y sin año (próxima ocurrencia)", () => {
    expect(parseNaturalDate("Exportar diseños 14/12", T).date).toBe("2026-12-14");
    expect(parseNaturalDate("Vence 10/01", T).date).toBe("2027-01-10");
    expect(parseNaturalDate("Turno 3/2/27", T).date).toBe("2027-02-03");
    expect(parseNaturalDate("Entrega el 15 de diciembre", T)).toMatchObject({ date: "2026-12-15", rest: "Entrega" });
    expect(parseNaturalDate("Examen 2 de marzo de 2027", T).date).toBe("2027-03-02");
    expect(parseNaturalDate("Fecha imposible 31/02", T).date).toBeNull();
  });

  it("horas", () => {
    expect(parseNaturalDate("Llamar mañana 10hs", T)).toMatchObject({ date: "2026-11-20", time: "10:00", rest: "Llamar" });
    expect(parseNaturalDate("Reunión el viernes a las 18:30", T)).toMatchObject({ date: "2026-11-20", time: "18:30", rest: "Reunión" });
    expect(parseNaturalDate("Daily 9am", T)).toMatchObject({ date: T, time: "09:00", rest: "Daily" });
    expect(parseNaturalDate("Cena 9 pm", T).time).toBe("21:00");
    expect(parseNaturalDate("Algo a las 25", T).time).toBeNull();
  });

  it("no toca textos sin fecha ni números que no son fechas", () => {
    expect(parseNaturalDate("Comprar 3 cables HDMI", T)).toEqual({ date: null, time: null, rest: "Comprar 3 cables HDMI", matched: [] });
    expect(parseNaturalDate("Mañanero no es mañana?", T).date).toBe("2026-11-20");
    expect(parseNaturalDate("Hoyo en el jardín", T).date).toBeNull();
  });
});
