import { Mail, MessageCircle, MessageSquare, NotebookPen, Phone, Users } from "lucide-react";
import type { ReactNode } from "react";

/** Ícono por tipo de interacción (sirve en servidor y cliente). */
export const KIND_ICON: Record<string, ReactNode> = {
  whatsapp: <MessageCircle />,
  call: <Phone />,
  email: <Mail />,
  meeting: <Users />,
  message: <MessageSquare />,
  note: <NotebookPen />,
};
