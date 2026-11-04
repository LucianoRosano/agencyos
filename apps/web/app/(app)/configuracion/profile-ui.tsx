"use client";

import { cn } from "@agencyos/ui";
import { Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { setThemeAction } from "@/app/actions/shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextField } from "@/components/fields";
import { saveProfileAction } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  return (
    <ActionForm action={saveProfileAction} successMessage="Perfil actualizado" className="md:max-w-md">
      <TextField label="Nombre" name="name" defaultValue={name} required />
      <TextField label="Email" name="email" defaultValue={email} disabled hint="El email del dueño es el destino de la recuperación de cuenta." />
      <SubmitButton className="self-start">Guardar</SubmitButton>
    </ActionForm>
  );
}

export function ThemePicker({ current }: { current: string }) {
  const router = useRouter();
  const opts = [
    { v: "dark", l: "Oscuro", i: <Moon className="size-4" /> },
    { v: "light", l: "Claro", i: <Sun className="size-4" /> },
    { v: "system", l: "Sistema", i: <Monitor className="size-4" /> },
  ] as const;
  return (
    <div className="grid grid-cols-3 gap-2 md:max-w-md" role="radiogroup" aria-label="Tema">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={current === o.v}
          onClick={async () => {
            await setThemeAction(o.v);
            router.refresh();
          }}
          className={cn("flex h-11 items-center justify-center gap-2 rounded-[10px] border text-[14px]", current === o.v ? "border-accent bg-accent-soft text-text" : "border-border text-text-muted")}
        >
          {o.i} {o.l}
        </button>
      ))}
    </div>
  );
}
