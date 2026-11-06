import { schema } from "@agencyos/db";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { decryptSecret } from "../shared/crypto";
import { type DbOrTx, getDb } from "../shared/db";
import { DEFAULT_MODEL } from "./pricing";

/**
 * Cliente del proveedor de IA. Es una interfaz mínima para poder reemplazarlo en tests:
 * en tests y evals NUNCA se llama a la API real (setAiClientFactory con un mock).
 */
export interface AiClient {
  createMessage(params: Anthropic.MessageCreateParamsNonStreaming, opts?: { signal?: AbortSignal; timeoutMs?: number }): Promise<Anthropic.Message>;
  /** Llamada mínima (sin costo de tokens) para validar la clave y el modelo. */
  checkModel(model: string): Promise<void>;
}

export type AiClientFactory = (apiKey: string) => AiClient;

const anthropicFactory: AiClientFactory = (apiKey) => {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  return {
    createMessage: (params, opts) => client.messages.create(params, { signal: opts?.signal, timeout: opts?.timeoutMs }),
    checkModel: async (model) => {
      await client.models.retrieve(model);
    },
  };
};

let factory: AiClientFactory = anthropicFactory;

/** Solo para tests: inyecta un cliente simulado (null restaura el real). */
export function setAiClientFactory(f: AiClientFactory | null) {
  factory = f ?? anthropicFactory;
}

export const makeAiClient = (apiKey: string) => factory(apiKey);

export type ProviderConfig = {
  agentPrompts?: Record<string, string>;
  keyLast4?: string;
};

/** Configuración del proveedor del workspace (fila de ai_provider_config + integración con la clave cifrada). */
export async function loadProvider(db: DbOrTx, workspaceId: string) {
  const [cfg] = await db
    .select()
    .from(schema.aiProviderConfig)
    .where(
      and(eq(schema.aiProviderConfig.workspaceId, workspaceId), eq(schema.aiProviderConfig.provider, "anthropic"), isNull(schema.aiProviderConfig.deletedAt)),
    )
    .limit(1);
  if (!cfg) return null;
  const [integ] = cfg.integrationId
    ? await db
        .select()
        .from(schema.integration)
        .where(and(eq(schema.integration.id, cfg.integrationId), eq(schema.integration.workspaceId, workspaceId), isNull(schema.integration.deletedAt)))
        .limit(1)
    : [];
  const config = (integ?.config ?? {}) as ProviderConfig;
  return {
    cfg,
    integration: integ ?? null,
    config,
    hasKey: Boolean(integ?.secretEnc),
    model: cfg.defaultModel ?? DEFAULT_MODEL,
  };
}

/** La clave descifrada: solo del lado del servidor (worker o prueba de conexión). Nunca viaja al cliente. */
export async function providerApiKey(workspaceId: string, db: DbOrTx = getDb()): Promise<string | null> {
  const p = await loadProvider(db, workspaceId);
  if (!p?.integration?.secretEnc) return null;
  return decryptSecret(p.integration.secretEnc);
}
