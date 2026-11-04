import { cn } from "@agencyos/ui";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { telHref, waHref } from "./shared";

/** Accesos directos de un contacto: WhatsApp (wa.me), llamada (tel:) y email (mailto:). Zonas táctiles de 44 px. */
export function ContactLinks({
  name,
  email,
  phone,
  whatsapp,
  className,
}: {
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  className?: string;
}) {
  const wa = waHref(whatsapp ?? phone);
  const tel = telHref(phone ?? whatsapp);
  const cls =
    "grid size-11 place-items-center rounded-[var(--radius-control)] border border-border bg-bg-elevated text-text-muted transition-colors hover:text-text hover:border-border-strong md:size-9 [&>svg]:size-4";
  if (!wa && !tel && !email) return null;
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`WhatsApp a ${name}`} title="WhatsApp">
          <MessageCircle />
        </a>
      ) : null}
      {tel ? (
        <a href={tel} className={cls} aria-label={`Llamar a ${name}`} title="Llamar">
          <Phone />
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={cls} aria-label={`Email a ${name}`} title="Email">
          <Mail />
        </a>
      ) : null}
    </div>
  );
}
