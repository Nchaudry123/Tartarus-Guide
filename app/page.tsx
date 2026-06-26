import fs from "node:fs/promises";
import path from "node:path";
import Script from "next/script";

async function loadStaticShell() {
  const indexPath = path.join(process.cwd(), "index.html");
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
      <Script src="/script.js?v=answer-status-ux" strategy="afterInteractive" />
    </>
  );
}
