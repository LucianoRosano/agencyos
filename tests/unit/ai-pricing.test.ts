import { costMicroUsd, formatUsd, microToUsd, usdToMicro } from "@agencyos/modules/ai/pricing";
import { scopesForTools } from "@agencyos/modules/ai/tools";
import { describe, expect, it } from "vitest";

describe("IA · precios y alcances", () => {
  it("costo por modelo en enteros (micro-USD)", () => {
    // Sonnet 5.5: $2/M entrada, $10/M salida
    expect(costMicroUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBe(2_000_000n);
    expect(costMicroUsd("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 200 })).toBe(4000n);
    // Haiku 5.5: $0,10/M y $0,50/M
    expect(costMicroUsd("claude-haiku-5-5", { input_tokens: 10_000, output_tokens: 10_000 })).toBe(6000n);
    // caché: escritura 1,25× y lectura 0,1× del precio de entrada
    expect(costMicroUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 })).toBe(
      2700n,
    );
    // modelo desconocido: precio más caro (conservador)
    expect(costMicroUsd("modelo-x", { input_tokens: 1000, output_tokens: 0 })).toBe(10_000n);
    // redondeo hacia arriba
    expect(costMicroUsd("claude-haiku-5-5", { input_tokens: 1, output_tokens: 0 })).toBe(1n);
  });

  it("conversiones USD ↔ micro sin float", () => {
    expect(usdToMicro("2.5")).toBe(2_500_000n);
    expect(usdToMicro("0.000123")).toBe(123n);
    expect(microToUsd(1_002_000n)).toBe("1.002000");
    expect(formatUsd("0.0123")).toBe("US$ 0,0123");
    expect(formatUsd("12.5")).toBe("US$ 12,50");
    expect(() => usdToMicro("abc")).toThrow();
  });

  it("los alcances salen de las herramientas habilitadas", () => {
    expect(scopesForTools(["buscar", "ver_proyecto"])).toEqual(["read:all"]);
    expect(scopesForTools(["buscar", "crear_tarea", "proponer_cambio", "eliminar_elemento"])).toEqual(["propose:*", "read:all", "write:tasks"]);
  });
});
