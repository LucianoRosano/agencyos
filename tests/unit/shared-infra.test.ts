import { decryptSecret, encryptSecret, signPath, verifySignedPath } from "@agencyos/modules/shared/crypto";
import { assertPublicUrl, isBlockedIp } from "@agencyos/modules/shared/safe-fetch";
import { describe, expect, it } from "vitest";

describe("cifrado de secretos", () => {
  it("cifra y descifra; dos cifrados del mismo texto difieren", () => {
    const a = encryptSecret("ghp_secreto");
    const b = encryptSecret("ghp_secreto");
    expect(a.equals(b)).toBe(false);
    expect(decryptSecret(a)).toBe("ghp_secreto");
    const bad = Buffer.from(a);
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => decryptSecret(bad)).toThrow();
  });
  it("URL firmada vence y no se puede alterar", () => {
    const u = new URL(`http://x${signPath("/api/files/abc")}`);
    expect(verifySignedPath("/api/files/abc", u.searchParams.get("exp"), u.searchParams.get("sig"))).toBe(true);
    expect(verifySignedPath("/api/files/otro", u.searchParams.get("exp"), u.searchParams.get("sig"))).toBe(false);
    expect(verifySignedPath("/api/files/abc", "1", u.searchParams.get("sig"))).toBe(false);
  });
});

describe("anti-SSRF", () => {
  it("bloquea rangos privados, loopback, link-local, CGNAT, metadata e IPv6 locales", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "224.0.0.1",
    ])
      expect(isBlockedIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isBlockedIp(ip), ip).toBe(false);
  });
  it("rechaza esquemas, puertos y hosts no permitidos", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow();
    await expect(assertPublicUrl("http://8.8.8.8:22/")).rejects.toThrow();
    await expect(assertPublicUrl("http://user:pw@8.8.8.8/")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
  });
});
