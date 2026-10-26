import { createHash } from "node:crypto";

const passphrase = process.argv[2];

if (!passphrase) {
  console.error('Usage: npm run pass -- "your passphrase"');
  process.exit(1);
}

console.log(createHash("sha256").update(passphrase).digest("hex"));
