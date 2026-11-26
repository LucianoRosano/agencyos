/**
 * Envío de email transaccional con Brevo. Si no hay BREVO_API_KEY, no envía:
 * lo deja registrado en el log del servidor (sin datos sensibles) y devuelve false.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const html = msg.html ?? emailHtml(msg.subject, msg.text);
  const key = process.env.BREVO_API_KEY;
  const from = process.env.EMAIL_FROM ?? "lucianorosanott@gmail.com";
  if (!key) {
    console.warn(`[email] Brevo sin configurar: no se envió "${msg.subject}". Configurá BREVO_API_KEY.`);
    if (process.env.NODE_ENV !== "production") console.info(`[email:dev] para ${msg.to}\n${msg.text}`);
    return false;
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: from, name: process.env.EMAIL_FROM_NAME ?? "AGENCYOS" },
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`[email] Brevo respondió ${res.status}`);
    return false;
  }
  return true;
}

export const emailConfigured = () => Boolean(process.env.BREVO_API_KEY);

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * Versión HTML de un mail de texto, con la estética de la marca (marfil, tinta y terracota; serif en el título).
 * Párrafos por línea en blanco, enlaces clickeables y el último enlace como botón. Funciona en Gmail/Outlook
 * (tablas e estilos en línea, sin CSS externo ni imágenes).
 */
export function emailHtml(subject: string, text: string): string {
  const brand = escHtml(process.env.EMAIL_FROM_NAME ?? "AGENCYOS");
  const urls = text.match(/https?:\/\/[^\s)]+/g) ?? [];
  const cta = urls[urls.length - 1];
  const body = escHtml(
    cta && text.trimEnd().endsWith(cta)
      ? text
          .trimEnd()
          .slice(0, -cta.length)
          .replace(/[:\s]+$/, "")
      : text,
  )
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;line-height:1.6">${p
          .replace(/\n/g, "<br>")
          .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" style="color:#9a3f1b">$1</a>')}</p>`,
    )
    .join("");
  const button = cta
    ? `<p style="margin:22px 0 4px"><a href="${escHtml(cta)}" style="display:inline-block;background:#a9471f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Abrir</a></p>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(subject)}</title></head>
<body style="margin:0;background:#f7f4ee;color:#1f1a15;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 6px 14px;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#1f1a15">${brand}</td></tr>
<tr><td style="background:#fffdf9;border:1px solid #e2dacd;border-radius:12px;padding:26px 24px">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.3;font-weight:600;color:#1f1a15">${escHtml(subject.replace(/^AGENCYOS · /, ""))}</h1>
${body}${button}
</td></tr>
<tr><td style="padding:14px 6px 0;font-size:12px;color:#6b6258">Enviado por ${brand}. Si no esperabas este mail, podés ignorarlo.</td></tr>
</table></td></tr></table></body></html>`;
}
