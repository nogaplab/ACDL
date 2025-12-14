/**
 * Enables collapsible behavior for block headers.
 *
 * Any element with one of the supported header classes will:
 * - become clickable
 * - toggle the `collapsed` class on its parent container
 *
 * The actual show/hide behavior is controlled purely by CSS.
 */
export function enableCollapsibleBlocks(): void {
  const headers = document.querySelectorAll(
    ".loop-header, .switch-header, .conditional-header, .role-message-header"
  );

  headers.forEach((header) => {
    const container = header.parentElement;
    if (!container) return;

    header.classList.add("collapsible-header");

    header.addEventListener("click", () => {
      container.classList.toggle("collapsed");
    });
  });
}
