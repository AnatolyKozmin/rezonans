import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Корень API-пакета (apps/api) */
export const apiRoot = path.join(__dirname, "..");

export const uploadsRoot = path.join(apiRoot, "uploads");
