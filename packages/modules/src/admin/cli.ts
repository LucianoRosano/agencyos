/**
 * CLI de administración (se corre en el servidor):
 *   pnpm admin reset-password <email>      → pide la nueva contraseña por stdin (sin eco en el historial)
 *   pnpm admin import-inicial [--aplicar]   → carga inicial de clientes y proyectos de Luciano (revisión previa)
 *   pnpm admin purgar-papelera
 */
import { createInterface } from "node:readline/promises";
import { closeDb } from "@agencyos/db";
import { adminSetPassword } from "../auth/reauth";
import { purgeTrash } from "../trash/service";

const [cmd, ...args] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "reset-password": {
      const email = args[0];
      if (!email) throw new Error("Uso: pnpm admin reset-password <email>");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const pw = await rl.question("Nueva contraseña (mín. 12): ");
      rl.close();
      await adminSetPassword(email, pw.trim());
      console.log("Contraseña actualizada y sesiones cerradas. El 2FA sigue activo.");
      break;
    }
    case "import-inicial": {
      const { runInitialImport } = await import("./initial-import");
      await runInitialImport({ apply: args.includes("--aplicar") });
      break;
    }
    case "purgar-papelera": {
      console.log(`Elementos purgados: ${await purgeTrash()}`);
      break;
    }
    default:
      console.log("Comandos: reset-password <email> · import-inicial [--aplicar] · purgar-papelera");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
