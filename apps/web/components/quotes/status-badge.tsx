import { L, label } from "@agencyos/core";
import { Badge } from "@agencyos/ui";
import { Ban, CheckCircle2, Clock, Eye, FilePen, Send, XCircle } from "lucide-react";

const META: Record<string, { tone: "neutral" | "accent" | "info" | "success" | "warning" | "danger"; icon: React.ReactNode }> = {
  draft: { tone: "neutral", icon: <FilePen className="size-3" /> },
  sent: { tone: "info", icon: <Send className="size-3" /> },
  viewed: { tone: "accent", icon: <Eye className="size-3" /> },
  accepted: { tone: "success", icon: <CheckCircle2 className="size-3" /> },
  rejected: { tone: "danger", icon: <XCircle className="size-3" /> },
  expired: { tone: "warning", icon: <Clock className="size-3" /> },
  void: { tone: "neutral", icon: <Ban className="size-3" /> },
};

/** Estado del presupuesto: color + ícono + texto (nunca solo color). */
export function QuoteStatusBadge({ status }: { status: string }) {
  const m = META[status] ?? META.draft;
  return (
    <Badge tone={m?.tone ?? "neutral"}>
      {m?.icon}
      {label(L.quoteStatus, status)}
    </Badge>
  );
}
