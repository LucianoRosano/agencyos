import { detectType, normalizeFileName, sanitizeSvg } from "@agencyos/modules/library/magic";
import { describe, expect, it } from "vitest";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const PDF = Buffer.from("%PDF-1.7\n%âãÏÓ\n");
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(64, 0x90), Buffer.from([0, 0, 0])]);
const zip = (...names: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26), ...names.map((n) => Buffer.from(n))]);

describe("magic bytes", () => {
  it("acepta tipos reales que coinciden con la extensión", () => {
    expect(detectType("logo.png", PNG)).toMatchObject({ mime: "image/png", kind: "image", ext: "png" });
    expect(detectType("foto.JPEG", JPG)).toMatchObject({ mime: "image/jpeg", ext: "jpg" });
    expect(detectType("contrato.pdf", PDF)).toMatchObject({ mime: "application/pdf", kind: "pdf" });
    expect(detectType("a.gif", Buffer.from("GIF89a....")).mime).toBe("image/gif");
    expect(detectType("a.webp", Buffer.from("RIFF\0\0\0\0WEBPVP8 ")).mime).toBe("image/webp");
    expect(detectType("a.svg", Buffer.from('<?xml version="1.0"?>\n<!-- x --><svg xmlns="http://www.w3.org/2000/svg"></svg>')).mime).toBe("image/svg+xml");
    expect(detectType("notas.md", Buffer.from("# Hola\nAcentos: ñandú")).kind).toBe("document");
    expect(detectType("datos.csv", Buffer.from("a,b\n1,2\n")).mime).toContain("text/csv");
    expect(detectType("paquete.zip", zip("x.txt")).kind).toBe("archive");
    expect(detectType("informe.docx", zip("[Content_Types].xml", "word/document.xml")).kind).toBe("document");
    expect(detectType("planilla.xlsx", zip("[Content_Types].xml", "xl/workbook.xml")).kind).toBe("document");
    expect(detectType("video.mp4", Buffer.from("\0\0\0\x18ftypisom")).kind).toBe("video");
    expect(detectType("video.webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1])).kind).toBe("video");
    expect(detectType("f.woff2", Buffer.from("wOF2....")).kind).toBe("font");
    expect(detectType("f.woff", Buffer.from("wOFF....")).kind).toBe("font");
    expect(detectType("f.otf", Buffer.from("OTTO....")).kind).toBe("font");
    expect(detectType("f.ttf", Buffer.from([0, 1, 0, 0, 0, 9])).kind).toBe("font");
  });

  it("rechaza un .exe renombrado a .png", () => {
    expect(() => detectType("foto.png", EXE)).toThrow(/no es un \.png real.*ejecutable/);
  });

  it("rechaza extensiones no permitidas y contenido cruzado", () => {
    expect(() => detectType("virus.exe", EXE)).toThrow(/no permitido/);
    expect(() => detectType("sin-extension", PNG)).toThrow(/no permitido/);
    expect(() => detectType("foto.jpg", PNG)).toThrow(/parece un \.png/);
    expect(() => detectType("doc.pdf", PNG)).toThrow(/no es un \.pdf/);
    expect(() => detectType("texto.txt", EXE)).toThrow(/no es un \.txt/);
    expect(() => detectType("logo.svg", Buffer.from("<html><script>alert(1)</script></html>"))).toThrow();
    expect(() => detectType("informe.docx", zip("x.txt"))).toThrow();
    expect(() => detectType("vacío.png", Buffer.alloc(0))).toThrow(/vacío/);
  });
});

describe("normalizeFileName", () => {
  it("quita rutas, controles y reservados; conserva acentos y baja la extensión", () => {
    expect(normalizeFileName("../../etc/passwd")).toBe("passwd");
    expect(normalizeFileName("C:\\Users\\x\\Logo Final.PNG")).toBe("Logo Final.png");
    expect(normalizeFileName('  a<b>:c"|?*.pdf  ')).toBe("a-b--c----.pdf");
    expect(normalizeFileName("Presentación\u0000\u202e  2026.pdf")).toBe("Presentación 2026.pdf");
    expect(normalizeFileName("...oculto.txt")).toBe("oculto.txt");
    expect(normalizeFileName("")).toBe("archivo");
    const long = normalizeFileName(`${"x".repeat(300)}.docx`);
    expect(long.length).toBeLessThanOrEqual(120);
    expect(long.endsWith(".docx")).toBe(true);
  });
});

describe("sanitizeSvg", () => {
  it("quita scripts, foreignObject, on*, javascript: y DOCTYPE", () => {
    const dirty = `<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" width="10">
  <script>alert('x')</script>
  <svg:script>evil()</svg:script>
  <foreignObject><body><img src=x onerror=alert(2)></body></foreignObject>
  <a href="javascript:alert(3)"><rect onclick="x()" width="5" height="5" fill="red"/></a>
  <a xlink:href="jav&#x61;script:alert(4)">t</a>
  <image href="https://evil.example/track.png" />
  <use href="#ok" />
  <rect style="fill:url(http://evil/x);stroke:blue" />
  <style>@import url(http://evil/a.css); rect{fill:red}</style>
</svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toMatch(/<script|<svg:script|foreignObject|onload|onclick|onerror|javascript:|ENTITY|DOCTYPE|evil|@import/i);
    expect(clean).toContain('<use href="#ok"/>');
    expect(clean).toContain('fill="red"');
    expect(clean).toContain("stroke:blue");
    expect(clean).toContain("rect{fill:red}");
    expect(clean).toMatch(/^<\?xml/);
  });

  it("un <script> sin cerrar descarta el resto", () => {
    expect(sanitizeSvg('<svg><script>alert(1)<rect width="1"/></svg>')).toBe("<svg>");
  });
});
