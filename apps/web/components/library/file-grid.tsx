import { formatDate, L, label, toISODateAR } from "@agencyos/core";
import type { FileListItem } from "@agencyos/modules/library/queries";
import { EntityChip } from "@agencyos/ui";
import { Folder } from "lucide-react";
import Link from "next/link";
import { FileThumb, formatBytes } from "./file-visual";

export type FolderItem = { id: string; name: string; files: number; href: string; sub?: string };

/** Grilla con miniaturas (o lista compacta) de carpetas y archivos. */
export function FileGrid({ files, folders = [], mode }: { files: FileListItem[]; folders?: FolderItem[]; mode: "grilla" | "lista" }) {
  if (mode === "lista") {
    return (
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        {folders.map((d) => (
          <li key={d.id}>
            <Link href={d.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2/50">
              <Folder className="size-5 shrink-0 text-[#FB923C]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[14px] text-text">{d.name}</span>
              <span className="font-mono text-[12px] text-text-muted">{d.sub ?? `${d.files} archivos`}</span>
            </Link>
          </li>
        ))}
        {files.map(({ f, clientName, projectName, thumbUrl }) => (
          <li key={f.id}>
            <Link href={`/biblioteca/archivo/${f.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2/50" data-file={f.name}>
              <FileThumb thumbUrl={thumbUrl} kind={f.kind} name={f.name} className="size-10 shrink-0 rounded-md [&_span]:hidden" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] text-text">{f.name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-text-muted">
                  <span>{label(L.fileKind, f.kind)}</span>
                  <span aria-hidden>·</span>
                  <span className="font-mono">{formatBytes(f.size)}</span>
                  {f.currentVersion > 1 ? <span className="font-mono">· v{f.currentVersion}</span> : null}
                  {clientName ? <span className="hidden truncate sm:inline">· {clientName}</span> : null}
                  {projectName ? <span className="hidden truncate md:inline">· {projectName}</span> : null}
                </span>
              </span>
              <span className="hidden shrink-0 font-mono text-[12px] text-text-faint sm:block">{formatDate(toISODateAR(f.createdAt))}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {folders.map((d) => (
        <li key={d.id}>
          <Link
            href={d.href}
            className="flex h-full min-h-20 items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 transition-colors hover:border-border-strong"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#FB923C]/10 text-[#FB923C]">
              <Folder className="size-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-text">{d.name}</span>
              <span className="font-mono text-[12px] text-text-muted">{d.sub ?? `${d.files} archivos`}</span>
            </span>
          </Link>
        </li>
      ))}
      {files.map(({ f, clientName, thumbUrl }) => (
        <li key={f.id}>
          <Link
            href={`/biblioteca/archivo/${f.id}`}
            data-file={f.name}
            className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface transition-colors hover:border-border-strong"
          >
            <FileThumb thumbUrl={thumbUrl} kind={f.kind} name={f.name} className="aspect-[4/3] w-full border-b border-border p-2" />
            <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
              <span className="truncate text-[14px] text-text" title={f.name}>
                {f.name}
              </span>
              <span className="flex items-center justify-between gap-2 font-mono text-[12px] text-text-muted">
                <span>{formatBytes(f.size)}</span>
                {f.currentVersion > 1 ? <span>v{f.currentVersion}</span> : null}
              </span>
              {clientName ? (
                <EntityChip color="#22D3EE" className="mt-1 self-start">
                  {clientName}
                </EntityChip>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
