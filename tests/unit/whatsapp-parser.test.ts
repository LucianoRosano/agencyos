import { dayTranscript, groupByDay, isMediaText, parseWhatsappChat } from "@agencyos/modules/crm/whatsapp";
import { effectiveHourlyRate, formatMinutes, hoursLabel, parseDuration } from "@agencyos/modules/time/duration";
import { describe, expect, it } from "vitest";

describe("parser de chats de WhatsApp", () => {
  it("Android 24 h con dd/mm/aa, multilínea, sistema y multimedia", () => {
    const txt = [
      "12/03/24, 09:15 - Los mensajes y las llamadas están cifrados de extremo a extremo. Nadie fuera de este chat puede leerlos.",
      "12/03/24, 09:16 - Juan Pérez: Hola Luciano!",
      "¿Cómo va la web?",
      "12/03/24, 09:20 - Luciano: Bien, mañana te paso el link",
      "12/03/24, 09:21 - Juan Pérez: <Multimedia omitido>",
      "13/03/24, 18:02 - Luciano: Listo: https://ejemplo.com",
    ].join("\n");
    const c = parseWhatsappChat(txt);
    expect(c.messages).toHaveLength(4);
    expect(c.messages[0]).toMatchObject({ date: "2024-03-12", time: "09:16", author: "Juan Pérez", text: "Hola Luciano!\n¿Cómo va la web?", media: false });
    expect(c.messages[2]?.media).toBe(true);
    expect(c.from).toBe("2024-03-12");
    expect(c.to).toBe("2024-03-13");
    expect(c.days).toBe(2);
    expect(c.participants.map((p) => p.name).sort()).toEqual(["Juan Pérez", "Luciano"]);
  });

  it("Android 12 h con dd/mm/aaaa y «p. m.» con espacio fino", () => {
    const txt = "5/1/2025, 2:05 p. m. - Ana: Te llamo a la tarde\n5/1/2025, 12:30 a. m. - Luciano: Dale\n5/1/2025, 12:10 p. m. - Ana: ok";
    const c = parseWhatsappChat(txt);
    expect(c.messages.map((m) => `${m.date} ${m.time}`)).toEqual(["2025-01-05 14:05", "2025-01-05 00:30", "2025-01-05 12:10"]);
  });

  it("iPhone con corchetes, segundos, LRM y adjuntos", () => {
    const txt = [
      "‎[02/04/24, 10:01:33] Estudio Sol: ‎imagen omitida",
      "[02/04/24, 10:02:10] Luciano Rosano: Recibido",
      "  con un renglón más",
      "[02/04/24, 22:15:00] Estudio Sol: ‎<adjunto: 00000012-PHOTO.jpg>",
    ].join("\n");
    const c = parseWhatsappChat(txt);
    expect(c.messages).toHaveLength(3);
    expect(c.messages[0]?.media).toBe(true);
    expect(c.messages[1]?.text).toBe("Recibido\n  con un renglón más");
    expect(c.messages[2]?.media).toBe(true);
    expect(c.messages[2]?.time).toBe("22:15");
  });

  it("inglés 12 h con AM/PM y mes primero cuando el archivo lo deja claro", () => {
    const txt = "3/25/24, 9:05 PM - Bob: Media omitted\n3/26/24, 7:00 AM - Me: hi";
    const c = parseWhatsappChat(txt);
    expect(c.messages.map((m) => [m.date, m.time])).toEqual([
      ["2024-03-25", "21:05"],
      ["2024-03-26", "07:00"],
    ]);
    expect(c.messages[0]?.media).toBe(true);
  });

  it("texto sin formato → sin mensajes; fechas inválidas se descartan", () => {
    expect(parseWhatsappChat("hola\nesto no es un chat").messages).toHaveLength(0);
    expect(parseWhatsappChat("31/02/24, 10:00 - Ana: imposible").messages).toHaveLength(0);
  });

  it("agrupa por día, transcribe en Markdown y trunca", () => {
    const lines = Array.from(
      { length: 400 },
      (_, i) => `01/06/24, 10:${String(i % 60).padStart(2, "0")} - ${i % 2 ? "Luciano" : "Ana"}: ${"x".repeat(80)} ${i}`,
    );
    const c = parseWhatsappChat(lines.join("\n"));
    const days = groupByDay(c.messages);
    expect(days).toHaveLength(1);
    const md = dayTranscript(days[0] as (typeof days)[number], { me: "Luciano", meLabel: "Luciano (yo)", max: 5000 });
    expect(md.length).toBeLessThanOrEqual(5000);
    expect(md).toContain("**Chat de WhatsApp** · 400 mensajes con Ana");
    expect(md).toMatch(/truncado: \d+ mensajes más/);
    expect(md).toContain("Luciano (yo):");
  });

  it("escapa HTML y marcas de Markdown al inicio de línea", () => {
    const c = parseWhatsappChat("01/06/24, 10:00 - Ana: <script>alert(1)</script>\n# no es título");
    const md = dayTranscript(groupByDay(c.messages)[0] as never);
    expect(md).not.toContain("<script>");
    expect(md).toContain("\\# no es título");
  });

  it("reconoce multimedia en varios idiomas", () => {
    expect(isMediaText("<Multimedia omitido>")).toBe(true);
    expect(isMediaText("audio omitido")).toBe(true);
    expect(isMediaText("<Media omitted>")).toBe(true);
    expect(isMediaText("Mirá esta imagen")).toBe(false);
  });
});

describe("duración y tarifa efectiva", () => {
  it("entiende las formas habituales", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1h30")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1,5h")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1h75")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });

  it("formatea minutos y horas", () => {
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(hoursLabel(90)).toBe("1,5");
    expect(hoursLabel(600)).toBe("10");
  });

  it("tarifa efectiva exacta en centavos", () => {
    expect(effectiveHourlyRate("150000.00", 600)).toBe("15000.00");
    expect(effectiveHourlyRate("100.00", 90)).toBe("66.67");
    expect(effectiveHourlyRate("100.00", 0)).toBeNull();
  });
});
