/**
 * Parser CSV puro (sin dependencias): separador `;` o `,` detectado, comillas dobles con escape "", saltos de línea
 * dentro de comillas, BOM y CRLF. Pensado para exportaciones de Excel/Sheets en es-AR y de bancos.
 */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => firstLine.split(c).length - 1;
  const counts: [";" | "," | "\t", number][] = [
    [";", count(";")],
    [",", count(",")],
    ["\t", count("\t")],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]?.[1] ? counts[0][0] : ",";
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ""));
}

/** Normaliza un encabezado: minúsculas, sin tildes ni signos («Teléfono / WhatsApp» → "telefonowhatsapp"). */
export const normHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Busca la columna de un campo entre alias posibles. */
export function columnIndex(headers: string[], aliases: string[]): number {
  const norm = headers.map(normHeader);
  for (const a of aliases.map(normHeader)) {
    const i = norm.indexOf(a);
    if (i >= 0) return i;
  }
  return -1;
}

/** Monto en formato es-AR o internacional: «$ 1.234,56», «-1234.56», «(1.500,00)» → "1234.56" con signo aparte. */
export function parseAmount(raw: string): { value: string; negative: boolean } | null {
  let s = raw.replace(/[$\s]|ARS|USD|U\$S/gi, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, "");
  else if (lastComma === -1 && ((s.match(/\./g)?.length ?? 0) > 1 || /^\d{1,3}\.\d{3}$/.test(s))) s = s.replace(/\./g, ""); // «1.234» o «1.234.567» = miles
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ""] = s.split(".");
  return { value: `${Number(int)}.${dec.padEnd(2, "0")}`, negative };
}

/** Fecha «dd/mm/aaaa», «dd-mm-aa», «aaaa-mm-dd» → ISO, o null si no es válida. */
export function parseDateCell(raw: string): string | null {
  const s = raw.trim();
  let y: number;
  let m: number;
  let d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (match) {
    y = Number(match[1]);
    m = Number(match[2]);
    d = Number(match[3]);
  } else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = match[3]?.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  }
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00Z`);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d ? iso : null;
}
