"use client";

import { Button, Card, Input, SectionLabel } from "@agencyos/ui";
import { BookOpen, Palette, Plus, Shapes, Type, X } from "lucide-react";
import { useEffect, useState } from "react";
import { saveBrandKitAction } from "@/app/(app)/biblioteca/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TextAreaField } from "@/components/fields";
import { LibraryPicker } from "./attachments";
import { FileThumb, formatBytes } from "./file-visual";
import { UploadZone } from "./uploader";

type KitFile = { id: string; name: string; kind: string; size: number; thumbUrl: string | null };
type Color = { name: string; hex: string };
type Font = { name: string; usage?: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function BrandKitEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: { colors: Color[]; fonts: Font[]; logos: KitFile[]; guidelines: KitFile | null; notesMd: string | null };
}) {
  const [colors, setColors] = useState<Color[]>(initial.colors);
  const [fonts, setFonts] = useState<Font[]>(initial.fonts);
  const [logos, setLogos] = useState<KitFile[]>(initial.logos);
  const [guidelines, setGuidelines] = useState<KitFile | null>(initial.guidelines);
  // al guardar, el servidor trae las miniaturas firmadas: se completan sin remontar el formulario (así no se pierde el aviso)
  useEffect(() => {
    setLogos((prev) => prev.map((l) => initial.logos.find((x) => x.id === l.id) ?? l));
    setGuidelines((prev) => (prev && initial.guidelines?.id === prev.id ? initial.guidelines : prev));
  }, [initial.logos, initial.guidelines]);
  const addLogo = (f: KitFile) => setLogos((prev) => (prev.some((x) => x.id === f.id) ? prev : [...prev, f]));

  return (
    <ActionForm action={saveBrandKitAction.bind(null, clientId)} successMessage="Kit de marca guardado" className="gap-5">
      <input type="hidden" name="colors" value={JSON.stringify(colors.filter((c) => c.hex))} />
      <input type="hidden" name="fonts" value={JSON.stringify(fonts.filter((f) => f.name.trim()))} />
      <input type="hidden" name="logoFileIds" value={JSON.stringify(logos.map((l) => l.id))} />
      <input type="hidden" name="guidelinesFileId" value={guidelines?.id ?? ""} />

      <Card className="p-5">
        <SectionLabel icon={<Shapes />} className="mb-4">
          Logos y variantes
        </SectionLabel>
        {logos.length ? (
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {logos.map((l) => (
              <li key={l.id} className="relative overflow-hidden rounded-[10px] border border-border bg-bg-elevated">
                <FileThumb thumbUrl={l.thumbUrl} kind={l.kind} name={l.name} className="aspect-[4/3] w-full p-3" />
                <div className="flex items-center gap-1 border-t border-border py-1 pr-1 pl-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text">{l.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-8"
                    aria-label={`Quitar ${l.name}`}
                    onClick={() => setLogos((p) => p.filter((x) => x.id !== l.id))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-[13px] text-text-faint">Sin logos. Subí las variantes (color, negativo, isotipo) o elegilas de la biblioteca.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <UploadZone
            compact
            className="flex-1"
            label="Subir logos"
            query={{ clientId }}
            onUploaded={(files) => {
              for (const f of files) if (f.kind === "image" || f.kind === "logo") addLogo({ id: f.id, name: f.name, kind: "logo", size: 0, thumbUrl: null });
            }}
          />
          <LibraryPicker kinds={["image", "logo"]} title="Elegir logo" onPick={(f) => addLogo(f)} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionLabel icon={<Palette />} className="mb-4">
          Paleta
        </SectionLabel>
        <ul className="mb-3 flex flex-col gap-2">
          {colors.map((c, i) => {
            const valid = HEX.test(c.hex);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
              <li key={i} className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,8rem)_44px] items-center gap-2">
                <label
                  className="relative block size-11 cursor-pointer overflow-hidden rounded-md border border-border"
                  style={{ background: valid ? c.hex : "transparent" }}
                >
                  <span className="sr-only">Elegir color {i + 1}</span>
                  <input
                    type="color"
                    value={valid ? c.hex : "#000000"}
                    onChange={(e) => setColors((p) => p.map((x, k) => (k === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
                <Input
                  aria-label={`Nombre del color ${i + 1}`}
                  placeholder="Primario"
                  value={c.name}
                  maxLength={40}
                  onChange={(e) => setColors((p) => p.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                />
                <Input
                  aria-label={`Hex del color ${i + 1}`}
                  aria-invalid={!valid || undefined}
                  className="font-mono uppercase"
                  value={c.hex}
                  maxLength={7}
                  onChange={(e) =>
                    setColors((p) => p.map((x, k) => (k === i ? { ...x, hex: e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}` } : x)))
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Quitar color ${i + 1}`}
                  onClick={() => setColors((p) => p.filter((_, k) => k !== i))}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
        {colors.length ? (
          <div className="mb-3 flex h-10 overflow-hidden rounded-md border border-border" aria-hidden>
            {colors
              .filter((c) => HEX.test(c.hex))
              .map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: vista previa
                <span key={i} className="flex-1" style={{ background: c.hex }} />
              ))}
          </div>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => setColors((p) => [...p, { name: "", hex: "#FB923C" }])} disabled={colors.length >= 24}>
          <Plus className="size-4" /> Agregar color
        </Button>
      </Card>

      <Card className="p-5">
        <SectionLabel icon={<Type />} className="mb-4">
          Tipografías
        </SectionLabel>
        <ul className="mb-3 flex flex-col gap-2">
          {fonts.map((f, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2">
              <Input
                aria-label={`Tipografía ${i + 1}`}
                placeholder="Geist"
                value={f.name}
                maxLength={80}
                onChange={(e) => setFonts((p) => p.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                aria-label={`Uso de la tipografía ${i + 1}`}
                placeholder="Títulos"
                value={f.usage ?? ""}
                maxLength={80}
                onChange={(e) => setFonts((p) => p.map((x, k) => (k === i ? { ...x, usage: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`Quitar tipografía ${i + 1}`}
                onClick={() => setFonts((p) => p.filter((_, k) => k !== i))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" onClick={() => setFonts((p) => [...p, { name: "" }])} disabled={fonts.length >= 12}>
          <Plus className="size-4" /> Agregar tipografía
        </Button>
      </Card>

      <Card className="p-5">
        <SectionLabel icon={<BookOpen />} className="mb-4">
          Manual de marca
        </SectionLabel>
        {guidelines ? (
          <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-border bg-bg-elevated p-2 pr-1">
            <FileThumb thumbUrl={guidelines.thumbUrl} kind={guidelines.kind} name={guidelines.name} className="size-11 shrink-0 rounded-md [&_span]:hidden" />
            <a href={`/biblioteca/archivo/${guidelines.id}`} className="min-w-0 flex-1 truncate text-[14px] text-text hover:underline">
              {guidelines.name}
              {guidelines.size ? <span className="ml-2 font-mono text-[12px] text-text-muted">{formatBytes(guidelines.size)}</span> : null}
            </a>
            <Button type="button" variant="ghost" size="icon" className="size-11 md:size-9" aria-label="Quitar manual" onClick={() => setGuidelines(null)}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="mb-3 text-[13px] text-text-faint">Sin manual. Puede ser un PDF de la biblioteca.</p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <UploadZone
            compact
            multiple={false}
            className="flex-1"
            label="Subir manual"
            query={{ clientId }}
            onUploaded={(files) => files[0] && setGuidelines({ id: files[0].id, name: files[0].name, kind: files[0].kind, size: 0, thumbUrl: null })}
          />
          <LibraryPicker title="Elegir manual" onPick={(f) => setGuidelines(f)} />
        </div>
      </Card>

      <Card className="p-5">
        <TextAreaField
          label="Notas de marca (Markdown)"
          name="notesMd"
          defaultValue={initial.notesMd ?? ""}
          rows={5}
          placeholder="Tono, usos prohibidos, espacios de respeto…"
        />
      </Card>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex justify-end md:bottom-4">
        <SubmitButton size="lg">Guardar kit de marca</SubmitButton>
      </div>
    </ActionForm>
  );
}
