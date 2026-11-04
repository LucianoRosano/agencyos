"use client";

import type { Result } from "@agencyos/core";
import { Button, type ButtonProps, cn } from "@agencyos/ui";
import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

type FieldErrors = Record<string, string> | undefined;
const ErrorsCtx = createContext<FieldErrors>(undefined);

/** Error inline de un campo, leído del último resultado del formulario. */
export function useFieldError(name: string): string | undefined {
  return useContext(ErrorsCtx)?.[name];
}

export function ActionForm<T>({
  action,
  children,
  className,
  successMessage,
  redirectTo,
  onSuccess,
  resetOnSuccess,
  id,
}: {
  action: (prev: Result<T> | null, fd: FormData) => Promise<Result<T>>;
  children: ReactNode;
  className?: string;
  successMessage?: string | ((data: T) => string);
  redirectTo?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
  resetOnSuccess?: boolean;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const last = useRef<unknown>(null);

  useEffect(() => {
    if (!state || last.current === state) return;
    last.current = state;
    if (state.ok) {
      const msg = typeof successMessage === "function" ? successMessage(state.data) : successMessage;
      if (msg) toast.success(msg);
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state.data);
      const to = typeof redirectTo === "function" ? redirectTo(state.data) : redirectTo;
      if (to) router.push(to);
    } else {
      toast.error(state.error.message);
      if (state.error.fields) {
        const first = Object.keys(state.error.fields)[0];
        if (first) ref.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      }
    }
  }, [state, successMessage, redirectTo, onSuccess, resetOnSuccess, router]);

  const errors = state && !state.ok ? state.error.fields : undefined;
  return (
    <ErrorsCtx.Provider value={errors}>
      <form
        id={id}
        ref={ref}
        action={formAction}
        className={cn("flex flex-col gap-4", className)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") ref.current?.requestSubmit();
        }}
        noValidate
      >
        {children}
      </form>
    </ErrorsCtx.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} {...props}>
      {children}
    </Button>
  );
}
