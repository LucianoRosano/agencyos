import { getAuth } from "@agencyos/modules/auth/server";
import { toNextJsHandler } from "better-auth/next-js";

const handler = () => toNextJsHandler(getAuth());
export const GET = (req: Request) => handler().GET(req);
export const POST = (req: Request) => handler().POST(req);
