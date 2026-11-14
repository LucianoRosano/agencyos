"use client";

import { formatDate } from "@agencyos/core";
import { Button, cn, Field, Select, Sheet, Textarea } from "@agencyos/ui";
import { FileUp, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { importWhatsappAction, previewWhatsappAction } from "@/app/(app)/crm/actions";

type Opt = { value: string; label: string };
type Preview = { messages: number; media: number; from: string | null; to: string | null; days: number; participants: { name: string; count: number }[] };

const MAX_CHARS = 1_800_000;

/**
 * Importar el .txt de «Exportar chat» de WhatsApp: subir o pegar → vista previa (rango, mensajes, participantes)
 * → elegir quién sos → una interacción por día. Reimportar el mismo chat no duplica.
 */
export function WhatsappImportSheet({
  clientId,
  clients,
  contacts = [],
  defaultContactId,
  trigger,
}: {
  clientId?: string;
  clients?: Opt[];
  contacts?: Opt[];
  defaultContactId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [me, setMe] = useState("");
  const [client, setClient] = useState(clientId ?? clients?.[0]?.value ?? "");
  const [contact, setContact] = useState(defaultContactId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setText("");
    setFileName(null);
    setPreview(null);
    setMe("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFile(f: File | undefined) {
    setError(null);
    setPreview(null);
    if (!f) return;
    if (f.size > MAX_CHARS * 2) {
      setError("El archivo es muy grande. Exportá el chat «sin archivos» o en partes.");
      return;
    }
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    analyze(t);
  }

  function analyze(t = text) {
    setError(null);
    if (!t.trim()) {
      setError("Pegá el chat o elegí el archivo .txt exportado.");
      return;
    }
    if (t.length > MAX_CHARS) {
      setError("El chat es muy grande (máx. ~1,8 MB). Exportalo sin multimedia o en partes.");
      return;
    }
    start(async () => {
      const r = await previewWhatsappAction(t);
      if (!r.ok) {
        setError(r.error.message);
        setPreview(null);
        return;
      }
      setPreview(r.data);
      // por defecto: el participante que se parece a «Luciano», si existe
      const guess = r.data.participants.find((p) => /luciano/i.test(p.name));
      setMe(guess?.name ?? "");
    });
  }

  function confirmImport() {
    if (!client) {
      setError("Elegí el cliente.");
      return;
    }
    start(async () => {
      const r = await importWhatsappAction({ clientId: client, contactId: contact || undefined, text, me: me || undefined });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      const { created, updated, skipped } = r.data;
      toast.success(
        created || updated
          ? `Chat importado: ${created} ${created === 1 ? "día nuevo" : "días nuevos"}${updated ? `, ${updated} actualizado${updated === 1 ? "" : "s"}` : ""}${skipped ? ` · ${skipped} ya estaban` : ""}`
          : "Ese chat ya estaba importado: no hubo cambios",
      );
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      title="Importar chat de WhatsApp"
      description="En WhatsApp: chat → ⋮ → Más → Exportar chat → Sin archivos. Se crea una interacción por día con la conversación."
      trigger={
        trigger ?? (
          <Button variant="secondary">
            <MessageCircle className="size-4" /> Importar chat de WhatsApp
          </Button>
        )
      }
      wide
    >
      <div className="flex flex-col gap-4">
        {!preview ? (
          <>
            <label
              className={cn(
                "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-strong p-4 text-center text-[14px] text-text-muted transition-colors hover:border-accent hover:text-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              )}
            >
              <FileUp className="size-5" />
              <span>{fileName ? `Archivo: ${fileName}` : "Elegí el archivo .txt exportado"}</span>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,text/plain"
                className="sr-only"
                aria-label="Archivo .txt del chat"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            <Field label="O pegá el texto del chat" name="wa-text">
              <Textarea
                id="wa-text"
                rows={6}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setFileName(null);
                }}
                placeholder="12/03/24, 09:16 - Juan: Hola!"
                className="font-mono text-base md:text-[13px]"
              />
            </Field>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-[10px] border border-border bg-bg-elevated p-4 text-[14px] md:grid-cols-4">
              <div>
                <dt className="text-[12px] text-text-muted">Desde</dt>
                <dd className="font-mono text-text">{formatDate(preview.from)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Hasta</dt>
                <dd className="font-mono text-text">{formatDate(preview.to)}</dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Mensajes</dt>
                <dd className="font-mono text-text">
                  {preview.messages.toLocaleString("es-AR")}
                  {preview.media ? <span className="text-text-faint"> · {preview.media} multimedia</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-text-muted">Interacciones</dt>
                <dd className="font-mono text-text">{preview.days} (una por día)</dd>
              </div>
            </dl>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-medium text-text-muted">¿Quién sos vos en el chat?</legend>
              {preview.participants.map((p) => (
                <label
                  key={p.name}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 py-2 text-[14px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                    me === p.name ? "border-accent bg-accent-soft text-text" : "border-border text-text-muted hover:text-text",
                  )}
                >
                  <input type="radio" name="wa-me" value={p.name} checked={me === p.name} onChange={() => setMe(p.name)} className="accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="font-mono text-[12px] text-text-faint">{p.count}</span>
                </label>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3.5 text-[13px] text-text-muted">
                <input type="radio" name="wa-me" value="" checked={me === ""} onChange={() => setMe("")} className="accent-[var(--accent)]" />
                Ninguno (dejar los nombres tal cual)
              </label>
            </fieldset>
            <div className="grid gap-4 md:grid-cols-2">
              {clients ? (
                <Field label="Cliente" name="wa-client" required>
                  <Select id="wa-client" value={client} onChange={(e) => setClient(e.target.value)}>
                    {clients.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {contacts.length ? (
                <Field label="Contacto (opcional)" name="wa-contact">
                  <Select id="wa-contact" value={contact} onChange={(e) => setContact(e.target.value)}>
                    <option value="">Sin contacto</option>
                    {contacts.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" className="rounded-[10px] border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          {preview ? (
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={pending}>
              Volver
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          )}
          {preview ? (
            <Button variant="primary" loading={pending} onClick={confirmImport}>
              Importar {preview.days} {preview.days === 1 ? "día" : "días"}
            </Button>
          ) : (
            <Button variant="primary" loading={pending} onClick={() => analyze()} disabled={!text.trim()}>
              Previsualizar
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
