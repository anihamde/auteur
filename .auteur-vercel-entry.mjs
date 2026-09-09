import { getRequestListener } from "@hono/node-server";
import handler from "./apps/auteur-web/api/[...path].ts";

export default getRequestListener(handler);
