/**
 * Envío de email transaccional con Brevo. Si no hay BREVO_API_KEY, no envía:
 * lo deja registrado en el log del servidor (sin datos sensibles) y devuelve false.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
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
      ...(msg.html ? { htmlContent: msg.html } : {}),
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
