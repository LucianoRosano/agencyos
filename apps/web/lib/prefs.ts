import "server-only";
import { cookies } from "next/headers";

/** Espacio seleccionado globalmente ("all" o id). Persistido en cookie por dispositivo. */
export async function getSelectedSpace(): Promise<string | undefined> {
  const v = (await cookies()).get("ag-space")?.value;
  return v && v !== "all" ? v : undefined;
}
