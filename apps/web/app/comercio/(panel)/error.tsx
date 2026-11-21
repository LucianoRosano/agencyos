"use client";

import { Button, Card, EmptyState } from "@agencyos/ui";
import { CircleAlert } from "lucide-react";

export default function ShopError({ reset }: { reset: () => void }) {
  return (
    <Card className="p-2">
      <EmptyState
        icon={<CircleAlert />}
        title="Algo salió mal"
        description="Probá de nuevo. Si sigue pasando, avisale a Luciano."
        action={<Button onClick={reset}>Reintentar</Button>}
      />
    </Card>
  );
}
