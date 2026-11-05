"use client";

import type { Result } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  convertReminderAction,
  createCertificateAction,
  createCredentialAction,
  createDomainAction,
  createHostingAction,
  restoreAssetAction,
  trashAssetAction,
  updateCertificateAction,
  updateCredentialAction,
  updateDomainAction,
  updateHostingAction,
} from "@/app/(app)/activos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CheckField, SelectField, TextAreaField, TextField } from "@/components/fields";
import { useClearParam } from "@/components/finance/use-deep-link";
import { useAction } from "@/components/use-action";
import { CERT_KIND, type Opt, opts } from "./shared";

export type AssetOptions = { clients: Opt[]; sites: Opt[]; credentials: Opt[] };
type FormAction = (prev: Result<unknown> | null, fd: FormData) => Promise<Result<unknown>>;

/** Sheet con formulario: crear (con botón) o editar (abierto desde el menú o por `?ver=<id>`). */
function FormSheet({
  title,
  description,
  action,
  success,
  submit,
  children,
  trigger,
  open,
  onOpenChange,
}: {
  title: string;
  description?: string;
  action: FormAction;
  success: string;
  submit: string;
  children: ReactNode;
  trigger?: ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} wide trigger={trigger}>
      <ActionForm action={action} successMessage={success} onSuccess={() => onOpenChange(false)}>
        {children}
        <div className="flex justify-end">
          <SubmitButton>{submit}</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

function NotifyField({ value }: { value?: number }) {
  return (
    <TextField
      label="Avisar días antes"
      name="notifyDaysBefore"
      type="number"
      inputMode="numeric"
      min={0}
      max={365}
      defaultValue={String(value ?? 30)}
      hint="Aparece en «Ponerse al día» de Hoy y te llega una notificación."
    />
  );
}

function CredentialSelect({ options, value }: { options: AssetOptions; value?: string | null }) {
  return (
    <SelectField
      label="Credencial (referencia)"
      name="credentialRefId"
      defaultValue={value ?? ""}
      placeholder={options.credentials.length ? "Sin referencia" : "Cargá referencias en Credenciales"}
      options={options.credentials}
      hint="Solo la ruta en Bitwarden, nunca la contraseña."
    />
  );
}

/** Menú de fila: editar + papelera con Deshacer. */
function RowMenu({ type, id, name, onEdit, children }: { type: string; id: string; name: string; onEdit?: () => void; children?: ReactNode }) {
  const { exec } = useAction();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Acciones de ${name}`} className="size-11 shrink-0 md:size-9">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      {onEdit ? (
        <MenuItem icon={<Pencil />} onSelect={onEdit}>
          Editar
        </MenuItem>
      ) : null}
      {children}
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Mandar «${name}» a la papelera? Deja de avisar y se puede restaurar durante 30 días.`)) return;
          exec(() => trashAssetAction(type, id), { success: "Enviado a la papelera", undo: () => restoreAssetAction(type, id) });
        }}
      >
        Eliminar
      </MenuItem>
    </Menu>
  );
}

function useEditState(openInitially?: boolean) {
  const [open, setOpen] = useState(Boolean(openInitially));
  const clear = useClearParam();
  return {
    open,
    setOpen: (o: boolean) => {
      setOpen(o);
      if (!o) clear("ver");
    },
  };
}

const addBtn = (label: string, variant: "primary" | "secondary" = "primary") => (
  <Button variant={variant}>
    <Plus className="size-4" /> {label}
  </Button>
);

// --- Dominios ---
export type DomainData = {
  id: string;
  name: string;
  clientId: string | null;
  siteId: string | null;
  registrar: string | null;
  holder: string | null;
  expiresOn: string | null;
  autoRenew: boolean;
  dnsRef: string | null;
  credentialRefId: string | null;
  notifyDaysBefore: number;
};

function DomainFields({ d, options }: { d?: DomainData; options: AssetOptions }) {
  return (
    <>
      <TextField
        label="Dominio"
        name="name"
        required
        defaultValue={d?.name}
        placeholder="libreriauno.com.ar"
        autoFocus={!d}
        inputMode="url"
        autoCapitalize="none"
        hint="Sin https:// ni www."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="Cliente" name="clientId" defaultValue={d?.clientId ?? ""} placeholder="Propio / sin cliente" options={options.clients} />
        <SelectField label="Sitio" name="siteId" defaultValue={d?.siteId ?? ""} placeholder="Sin sitio" options={options.sites} />
        <TextField label="Registrador" name="registrar" defaultValue={d?.registrar ?? ""} placeholder="NIC Argentina, Hostinger…" maxLength={120} />
        <TextField label="Titular" name="holder" defaultValue={d?.holder ?? ""} placeholder="A nombre de quién está" maxLength={160} />
        <TextField
          label="Vence"
          name="expiresOn"
          type="date"
          defaultValue={d?.expiresOn ?? ""}
          hint="Si lo dejás vacío, el chequeo diario lo busca por RDAP."
        />
        <NotifyField value={d?.notifyDaysBefore} />
        <TextField label="DNS (referencia)" name="dnsRef" defaultValue={d?.dnsRef ?? ""} placeholder="Cloudflare · zona libreriauno" maxLength={300} />
        <CredentialSelect options={options} value={d?.credentialRefId} />
      </div>
      <CheckField label="Renovación automática" name="autoRenew" defaultChecked={d?.autoRenew} hint="Igual te avisamos, para revisar que se haya cobrado." />
    </>
  );
}

export function NewDomainButton({ options, label = "Nuevo dominio", variant }: { options: AssetOptions; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <FormSheet
      title="Nuevo dominio"
      action={createDomainAction}
      success="Dominio agregado"
      submit="Agregar"
      open={open}
      onOpenChange={setOpen}
      trigger={addBtn(label, variant)}
    >
      <DomainFields options={options} />
    </FormSheet>
  );
}

export function DomainMenu({ d, options, openInitially }: { d: DomainData; options: AssetOptions; openInitially?: boolean }) {
  const e = useEditState(openInitially);
  return (
    <>
      <RowMenu type="domain" id={d.id} name={d.name} onEdit={() => e.setOpen(true)} />
      <FormSheet
        title={`Editar ${d.name}`}
        action={updateDomainAction.bind(null, d.id)}
        success="Dominio actualizado"
        submit="Guardar"
        open={e.open}
        onOpenChange={e.setOpen}
      >
        <DomainFields d={d} options={options} />
      </FormSheet>
    </>
  );
}

// --- Hosting ---
export type HostingData = {
  id: string;
  provider: string;
  plan: string | null;
  clientId: string | null;
  expiresOn: string | null;
  location: string | null;
  credentialRefId: string | null;
  notifyDaysBefore: number;
};

function HostingFields({ d, options }: { d?: HostingData; options: AssetOptions }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TextField label="Proveedor" name="provider" required defaultValue={d?.provider} placeholder="Hostinger" autoFocus={!d} maxLength={120} />
      <TextField label="Plan" name="plan" defaultValue={d?.plan ?? ""} placeholder="Business, KVM 2…" maxLength={120} />
      <SelectField label="Cliente" name="clientId" defaultValue={d?.clientId ?? ""} placeholder="Propio / sin cliente" options={options.clients} />
      <TextField label="Ubicación" name="location" defaultValue={d?.location ?? ""} placeholder="São Paulo" maxLength={120} />
      <TextField label="Vence" name="expiresOn" type="date" defaultValue={d?.expiresOn ?? ""} />
      <NotifyField value={d?.notifyDaysBefore} />
      <CredentialSelect options={options} value={d?.credentialRefId} />
    </div>
  );
}

export function NewHostingButton({ options, label = "Nuevo hosting", variant }: { options: AssetOptions; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <FormSheet
      title="Nuevo hosting"
      action={createHostingAction}
      success="Hosting agregado"
      submit="Agregar"
      open={open}
      onOpenChange={setOpen}
      trigger={addBtn(label, variant)}
    >
      <HostingFields options={options} />
    </FormSheet>
  );
}

export function HostingMenu({ d, options, openInitially }: { d: HostingData; options: AssetOptions; openInitially?: boolean }) {
  const e = useEditState(openInitially);
  return (
    <>
      <RowMenu type="hosting" id={d.id} name={d.provider} onEdit={() => e.setOpen(true)} />
      <FormSheet
        title={`Editar ${d.provider}`}
        action={updateHostingAction.bind(null, d.id)}
        success="Hosting actualizado"
        submit="Guardar"
        open={e.open}
        onOpenChange={e.setOpen}
      >
        <HostingFields d={d} options={options} />
      </FormSheet>
    </>
  );
}

// --- Certificados ---
export type CertData = {
  id: string;
  kind: string;
  subject: string;
  expiresOn: string | null;
  siteId: string | null;
  clientId: string | null;
  notes: string | null;
  notifyDaysBefore: number;
};

function CertFields({ d, options }: { d?: CertData; options: AssetOptions }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="Tipo" name="kind" defaultValue={d?.kind ?? "ssl"} options={opts(CERT_KIND)} />
        <TextField
          label="Dominio o nombre"
          name="subject"
          required
          defaultValue={d?.subject}
          placeholder="libreriauno.com.ar · ARCA producción"
          autoFocus={!d}
          maxLength={200}
        />
        <SelectField label="Cliente" name="clientId" defaultValue={d?.clientId ?? ""} placeholder="Propio / sin cliente" options={options.clients} />
        <SelectField label="Sitio" name="siteId" defaultValue={d?.siteId ?? ""} placeholder="Sin sitio" options={options.sites} />
        <TextField label="Vence" name="expiresOn" type="date" defaultValue={d?.expiresOn ?? ""} />
        <NotifyField value={d?.notifyDaysBefore} />
      </div>
      <TextAreaField
        label="Notas"
        name="notes"
        defaultValue={d?.notes ?? ""}
        rows={3}
        hint="Ej.: dónde está el .crt en Bitwarden y cómo se renueva. Nunca la clave privada."
      />
    </>
  );
}

export function NewCertificateButton({
  options,
  label = "Nuevo certificado",
  variant,
}: {
  options: AssetOptions;
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormSheet
      title="Nuevo certificado"
      description="Los SSL de los sitios monitoreados se cargan solos; acá cargás ARCA u otros."
      action={createCertificateAction}
      success="Certificado agregado"
      submit="Agregar"
      open={open}
      onOpenChange={setOpen}
      trigger={addBtn(label, variant)}
    >
      <CertFields options={options} />
    </FormSheet>
  );
}

export function CertificateMenu({ d, options, openInitially }: { d: CertData; options: AssetOptions; openInitially?: boolean }) {
  const e = useEditState(openInitially);
  return (
    <>
      <RowMenu type="certificate" id={d.id} name={d.subject} onEdit={() => e.setOpen(true)} />
      <FormSheet
        title={`Editar ${d.subject}`}
        action={updateCertificateAction.bind(null, d.id)}
        success="Certificado actualizado"
        submit="Guardar"
        open={e.open}
        onOpenChange={e.setOpen}
      >
        <CertFields d={d} options={options} />
      </FormSheet>
    </>
  );
}

// --- Credenciales ---
export type CredData = { id: string; label: string; itemPath: string; notes: string | null };

function CredFields({ d }: { d?: CredData }) {
  return (
    <>
      <TextField label="Nombre" name="label" required defaultValue={d?.label} placeholder="Hostinger · Librería Uno" autoFocus={!d} maxLength={160} />
      <TextField
        label="Dónde está en Bitwarden"
        name="itemPath"
        required
        defaultValue={d?.itemPath}
        placeholder="Bitwarden → Librería Uno → Hostinger"
        maxLength={300}
        hint="La ruta del ítem. La contraseña queda solo en Bitwarden."
      />
      <TextAreaField label="Notas" name="notes" defaultValue={d?.notes ?? ""} rows={3} placeholder="Usuario de acceso, quién más tiene acceso…" />
    </>
  );
}

export function NewCredentialButton({ label = "Nueva referencia", variant }: { label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <FormSheet
      title="Nueva referencia a Bitwarden"
      description="AGENCYOS nunca guarda contraseñas: solo dónde encontrarlas."
      action={createCredentialAction}
      success="Referencia guardada"
      submit="Guardar"
      open={open}
      onOpenChange={setOpen}
      trigger={addBtn(label, variant)}
    >
      <CredFields />
    </FormSheet>
  );
}

export function CredentialMenu({ d }: { d: CredData }) {
  const e = useEditState(false);
  return (
    <>
      <RowMenu type="credential_ref" id={d.id} name={d.label} onEdit={() => e.setOpen(true)} />
      <FormSheet
        title={`Editar ${d.label}`}
        action={updateCredentialAction.bind(null, d.id)}
        success="Referencia actualizada"
        submit="Guardar"
        open={e.open}
        onOpenChange={e.setOpen}
      >
        <CredFields d={d} />
      </FormSheet>
    </>
  );
}

// --- Convertir un vencimiento suelto ---
export function ConvertReminderButton({ r }: { r: { id: string; title: string; kind: string; dueDate: string } }) {
  const [open, setOpen] = useState(false);
  const guess = r.kind === "domain" ? "domain" : r.kind === "hosting" ? "hosting" : "certificate";
  const [target, setTarget] = useState(guess);
  const isArca = /arca|afip/i.test(r.title);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Convertir en activo técnico"
      description={`«${r.title}» · mantiene la fecha, el aviso y el cliente. El vencimiento suelto va a la papelera.`}
      trigger={
        <Button size="sm" variant="secondary">
          Convertir
        </Button>
      }
    >
      <ActionForm action={convertReminderAction.bind(null, r.id)} successMessage="Convertido en activo técnico" onSuccess={() => setOpen(false)}>
        <SelectField
          label="Convertir en"
          name="target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          options={[
            { value: "certificate", label: "Certificado" },
            { value: "domain", label: "Dominio" },
            { value: "hosting", label: "Hosting" },
          ]}
        />
        <TextField
          label={target === "domain" ? "Dominio" : target === "hosting" ? "Proveedor" : "Nombre del certificado"}
          name="name"
          required
          defaultValue={target === "certificate" ? r.title : ""}
          placeholder={target === "domain" ? "libreriauno.com.ar" : target === "hosting" ? "Hostinger" : ""}
          key={target}
        />
        {target === "certificate" ? <SelectField label="Tipo" name="certKind" defaultValue={isArca ? "arca" : "other"} options={opts(CERT_KIND)} /> : null}
        <div className="flex justify-end">
          <SubmitButton>Convertir</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}
