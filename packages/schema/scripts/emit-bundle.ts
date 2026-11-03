/** Prints the merged schema bundle to stdout (used by the Python code generator). */
import { bundle, readSchemas } from "./bundle.ts";

process.stdout.write(`${JSON.stringify(bundle(readSchemas()), null, 2)}\n`);
