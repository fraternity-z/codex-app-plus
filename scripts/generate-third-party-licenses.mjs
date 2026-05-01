import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function sanitize(licenseMap) {
  return Object.fromEntries(
    Object.entries(licenseMap).map(([licenseName, packages]) => {
      const sanitizedPackages = packages.map((pkg) => ({
        name: pkg.name,
        versions: pkg.versions,
        license: pkg.license,
        author: pkg.author ?? null,
        homepage: pkg.homepage ?? null,
        description: pkg.description ?? null,
      }));
      return [licenseName, sanitizedPackages];
    }),
  );
}

function readPnpmLicensesJson() {
  const options = {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  };

  if (process.platform === "win32") {
    return execFileSync("cmd", ["/c", "pnpm", "licenses", "list", "--json"], options);
  }

  return execFileSync("pnpm", ["licenses", "list", "--json"], options);
}

const rawJson = readPnpmLicensesJson();
const licenseMap = JSON.parse(rawJson);
const output = sanitize(licenseMap);

const outputPath = resolve("src/assets/third-party-licenses.json");
writeFileSync(outputPath, JSON.stringify(output), "utf8");
console.log(`Wrote ${outputPath}`);

