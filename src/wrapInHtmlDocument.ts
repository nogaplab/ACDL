/**
 * Wraps rendered prompt HTML fragments in a full HTML document.
 * Used only by the CLI / static rendering path.
 */
export function wrapInHtmlDocument(
  contentHtml: string,
  title: string = "Rendered Prompt"
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    ${contentHtml}
  </body>
</html>`;
}
