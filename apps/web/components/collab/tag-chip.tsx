import { X } from "lucide-react";

type Tag = { id: string; name: string; color: string };

/** Chip de etiqueta (#nombre con su color). Sin estado: sirve en servidor y en cliente. */
export function TagChip({ tag, onRemove }: { tag: Tag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] text-text"
      style={{ background: `color-mix(in srgb, ${tag.color} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: tag.color }} />#{tag.name}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 grid size-6 place-items-center rounded-full text-text-faint hover:text-text"
          aria-label={`Quitar #${tag.name}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
