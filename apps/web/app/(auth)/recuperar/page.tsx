import { RequestReset } from "./request-reset";

export const metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  const emailOk = Boolean(process.env.BREVO_API_KEY);
  return <RequestReset emailOk={emailOk} />;
}
