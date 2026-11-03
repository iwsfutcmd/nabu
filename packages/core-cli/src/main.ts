#!/usr/bin/env node
import { createInterface } from "node:readline";
import { handle } from "./protocol.ts";

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
for await (const line of lines) {
  if (line.trim() === "") continue;
  process.stdout.write(`${JSON.stringify(handle(line))}\n`);
}
