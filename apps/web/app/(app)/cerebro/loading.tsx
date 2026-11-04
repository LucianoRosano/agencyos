export default function Loading() {
  return (
    <div
      role="status"
      className="relative -mx-4 -mt-5 -mb-28 grid h-[calc(100dvh-70px)] place-items-center bg-[#05060a] md:-mx-8 md:-mt-8 md:-mb-12 md:h-[calc(100dvh-72px)]"
      aria-busy="true"
      aria-label="Cargando el Cerebro"
    >
      <span className="skeleton font-mono text-[12px] uppercase tracking-[0.2em] text-[#8a93a6]">Cargando el Cerebro…</span>
    </div>
  );
}
