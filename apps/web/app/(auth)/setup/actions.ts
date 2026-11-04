"use server";

import { timingSafeEqual } from "node:crypto";
import { type Result, toResultError, validation } from "@agencyos/core";
import { getAuth } from "@agencyos/modules/auth/server";
import { createOwner } from "@agencyos/modules/setup/service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre").max(80),
  email: z.string().trim().toLowerCase().email("Email inválido"),
  password: z.string().min(12, "Mínimo 12 caracteres").max(128),
  password2: z.string(),
  token: z.string().optional(),
});

export async function setupAction(_prev: Result<null> | null, fd: FormData): Promise<Result<null>> {
  try {
    const data = schema.parse(Object.fromEntries(fd));
    if (data.password !== data.password2) throw validation("Las contraseñas no coinciden", { password2: "Las contraseñas no coinciden" });
    const expected = process.env.SETUP_TOKEN;
    if (!expected && process.env.NODE_ENV === "production") throw validation("Falta configurar SETUP_TOKEN en el servidor (ver docs/DEPLOYMENT.md).");
    if (expected) {
      const a = Buffer.from(data.token ?? "");
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw validation("Código de instalación incorrecto", { token: "Código incorrecto" });
    }
    await createOwner({ name: data.name, email: data.email, password: data.password });
    await getAuth().api.signInEmail({ body: { email: data.email, password: data.password }, headers: await headers() });
  } catch (e) {
    return toResultError(e);
  }
  redirect("/seguridad/2fa");
}
