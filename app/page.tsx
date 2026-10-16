import fs from "node:fs/promises";
import path from "node:path";
import Script from "next/script";

async function loadStaticShell() {
  // Single source of the static UI shell; script.js and styles.css are served from public/ too.
  const indexPath = path.join(process.cwd(), "public", "index.html");
  const html = await fs.readFile(indexPath, "utf8");
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
  const body = bodyMatch?.[1] ?? "";

  return body.replace(/\s*<script src="\.\/script\.js"><\/script>\s*/, "");
}

export default async function Home() {
  const staticShell = await loadStaticShell();

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: staticShell }} />
      <Script src="/script.js?v=sea-of-souls-theme" strategy="afterInteractive" />
    </>
  );
}
