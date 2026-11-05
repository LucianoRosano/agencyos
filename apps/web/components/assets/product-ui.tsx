"use client";

import { todayAR } from "@agencyos/core";
import { Button, Menu, MenuItem, MenuSeparator, Sheet } from "@agencyos/ui";
import { MoreHorizontal, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addVersionAction,
  createInstallationAction,
  createProductAction,
  deleteVersionAction,
  restoreAssetAction,
  restoreVersionAction,
  trashAssetAction,
  updateInstallationAction,
  updateProductAction,
} from "@/app/(app)/activos/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/fields";
import { useAction } from "@/components/use-action";
import { INSTALLATION_STATUS, type Opt, opts, PRODUCT_KIND } from "./shared";

export type ProductData = { id: string; name: string; kind: string; description: string | null; repositoryId: string | null };

function ProductFields({ d, repositories }: { d?: ProductData; repositories: Opt[] }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextField label="Nombre" name="name" required defaultValue={d?.name} placeholder="LibreríaOS Fiscal" autoFocus={!d} maxLength={160} />
        <SelectField label="Tipo" name="kind" defaultValue={d?.kind ?? "wp_plugin"} options={opts(PRODUCT_KIND)} />
      </div>
      {repositories.length ? (
        <SelectField label="Repositorio" name="repositoryId" defaultValue={d?.repositoryId ?? ""} placeholder="Sin repositorio" options={repositories} />
      ) : null}
      <TextAreaField
        label="Descripción"
        name="description"
        defaultValue={d?.description ?? ""}
        rows={3}
        hint="Un producto, muchas instalaciones: las diferencias de cada cliente van en su configuración, nunca en copias."
      />
    </>
  );
}

export function NewProductButton({
  repositories,
  label = "Nuevo producto",
  variant = "primary",
}: {
  repositories: Opt[];
  label?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nuevo producto propio"
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> {label}
        </Button>
      }
    >
      <ActionForm
        action={createProductAction}
        successMessage="Producto creado"
        onSuccess={() => setOpen(false)}
        redirectTo={(data: unknown) => `/activos/productos/${(data as { id: string }).id}`}
      >
        <ProductFields repositories={repositories} />
        <div className="flex justify-end">
          <SubmitButton>Crear</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function ProductMenu({ d, repositories }: { d: ProductData; repositories: Opt[] }) {
  const { exec } = useAction();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label="Más acciones" className="size-11 md:size-10">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar «${d.name}» a la papelera? Sus versiones e instalaciones quedan guardadas. Restaurable 30 días.`)) return;
            exec(() => trashAssetAction("own_product", d.id), {
              success: "Producto en la papelera",
              undo: () => restoreAssetAction("own_product", d.id),
              onDone: () => router.push("/activos/productos"),
            });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      <Sheet open={editing} onOpenChange={setEditing} title={`Editar ${d.name}`} wide>
        <ActionForm action={updateProductAction.bind(null, d.id)} successMessage="Producto actualizado" onSuccess={() => setEditing(false)}>
          <ProductFields d={d} repositories={repositories} />
          <div className="flex justify-end">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}

export function AddVersionButton({
  productId,
  productName,
  latest,
  variant = "primary",
}: {
  productId: string;
  productName: string;
  latest: string | null;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={`Nueva versión de ${productName}`}
      description="Se crea una tarea «Actualizar…» por cada instalación activa con una versión anterior."
      wide
      trigger={
        <Button variant={variant}>
          <Tag className="size-4" /> Registrar versión
        </Button>
      }
    >
      <ActionForm
        action={addVersionAction.bind(null, productId)}
        successMessage={(data: unknown) => {
          const n = (data as { tasks: unknown[] }).tasks.length;
          return n ? `Versión registrada · ${n} ${n === 1 ? "tarea creada" : "tareas creadas"} para actualizar instalaciones` : "Versión registrada";
        }}
        onSuccess={() => setOpen(false)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label="Versión"
            name="version"
            required
            autoFocus
            placeholder={latest ? `después de ${latest}` : "1.0.0"}
            hint="Versionado semántico: mayor.menor.parche"
            autoCapitalize="none"
          />
          <TextField label="Publicada el" name="releasedAt" type="date" defaultValue={todayAR()} />
        </div>
        <TextAreaField label="Changelog (Markdown)" name="changelogMd" rows={8} className="font-mono" placeholder={"- Nuevo: …\n- Arreglo: …"} />
        <div className="flex justify-end">
          <SubmitButton>Registrar versión</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function VersionMenu({ id, version }: { id: string; version: string }) {
  const { exec } = useAction();
  return (
    <Menu
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Acciones de v${version}`} className="size-11 md:size-9">
          <MoreHorizontal className="size-4" />
        </Button>
      }
    >
      <MenuItem
        danger
        icon={<Trash2 />}
        onSelect={() => {
          if (!confirm(`¿Quitar la versión v${version}? Las tareas que generó quedan.`)) return;
          exec(() => deleteVersionAction(id), { success: `v${version} quitada`, undo: () => restoreVersionAction(id) });
        }}
      >
        Quitar versión
      </MenuItem>
    </Menu>
  );
}

export type InstallationData = {
  id: string;
  versionId: string | null;
  siteId: string | null;
  clientId: string | null;
  configRefMd: string | null;
  installedAt: string | null;
  status: string;
};

type InstallOptions = { clients: Opt[]; sites: Opt[]; versions: Opt[] };

function InstallationFields({ d, options }: { d?: InstallationData; options: InstallOptions }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField label="Cliente" name="clientId" defaultValue={d?.clientId ?? ""} placeholder="Elegir cliente" options={options.clients} />
        <SelectField label="Sitio" name="siteId" defaultValue={d?.siteId ?? ""} placeholder="Sin sitio" options={options.sites} />
        <SelectField
          label="Versión instalada"
          name="versionId"
          defaultValue={d?.versionId ?? options.versions[0]?.value ?? ""}
          placeholder="No sé / sin registrar"
          options={options.versions}
        />
        <TextField label="Instalada el" name="installedAt" type="date" defaultValue={d?.installedAt ?? ""} />
        <SelectField label="Estado" name="status" defaultValue={d?.status ?? "active"} options={opts(INSTALLATION_STATUS)} />
      </div>
      <TextAreaField
        label="Configuración de este cliente"
        name="configRefMd"
        defaultValue={d?.configRefMd ?? ""}
        rows={4}
        className="font-mono"
        placeholder="Punto de venta 3 · CUIT del cliente en el archivo de config · hook propio para…"
        hint="Referencias y diferencias de configuración. Credenciales: solo la ruta en Bitwarden."
      />
    </>
  );
}

export function NewInstallationButton({
  productId,
  options,
  variant = "secondary",
}: {
  productId: string;
  options: InstallOptions;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Nueva instalación"
      description="Qué versión hay en qué cliente o sitio."
      wide
      trigger={
        <Button variant={variant}>
          <Plus className="size-4" /> Registrar instalación
        </Button>
      }
    >
      <ActionForm action={createInstallationAction.bind(null, productId)} successMessage="Instalación registrada" onSuccess={() => setOpen(false)}>
        <InstallationFields options={options} />
        <div className="flex justify-end">
          <SubmitButton>Registrar</SubmitButton>
        </div>
      </ActionForm>
    </Sheet>
  );
}

export function InstallationMenu({
  d,
  name,
  options,
  latest,
}: {
  d: InstallationData;
  name: string;
  options: InstallOptions;
  latest?: { id: string; version: string } | null;
}) {
  const { exec } = useAction();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <Menu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Acciones de la instalación en ${name}`} className="size-11 md:size-9">
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
          Editar
        </MenuItem>
        {latest && d.versionId !== latest.id ? (
          <MenuItem
            icon={<Tag />}
            onSelect={() => {
              const fd = new FormData();
              for (const [k, v] of Object.entries({ ...d, versionId: latest.id })) fd.set(k, v ?? "");
              const before = new FormData();
              for (const [k, v] of Object.entries(d)) before.set(k, v ?? "");
              exec(() => updateInstallationAction(d.id, null, fd), {
                success: `Marcada como actualizada a v${latest.version}`,
                undo: () => updateInstallationAction(d.id, null, before),
              });
            }}
          >
            Marcar actualizada a v{latest.version}
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => {
            if (!confirm(`¿Mandar la instalación en ${name} a la papelera? Restaurable 30 días.`)) return;
            exec(() => trashAssetAction("installation", d.id), { success: "Instalación en la papelera", undo: () => restoreAssetAction("installation", d.id) });
          }}
        >
          Eliminar
        </MenuItem>
      </Menu>
      <Sheet open={editing} onOpenChange={setEditing} title={`Instalación en ${name}`} wide>
        <ActionForm action={updateInstallationAction.bind(null, d.id)} successMessage="Instalación actualizada" onSuccess={() => setEditing(false)}>
          <InstallationFields d={d} options={options} />
          <div className="flex justify-end">
            <SubmitButton>Guardar</SubmitButton>
          </div>
        </ActionForm>
      </Sheet>
    </>
  );
}
