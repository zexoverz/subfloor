import { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';

/**
 * Where failures land.
 *
 * A refused signature, an unreachable node, a wallet that cannot sign at all — these were going to
 * the console, which is the one place the person who needs them is not looking. On the panic path
 * that is worse than untidy: pressing stop and seeing nothing happen is indistinguishable from
 * pressing stop and having it work.
 *
 * Styled from the palette rather than the library's defaults, so a failure looks like it came from
 * this application and not from a package.
 *
 * ## Why it is a popover
 *
 * A modal `<dialog>` renders in the browser's top layer, which sits above every `position: fixed`
 * element no matter its z-index. So a toast raised by something inside a sheet — funds sent, a
 * signature refused — appeared *behind* the sheet that caused it, which is the one place it is
 * useless.
 *
 * The app was working around that by rendering a second `<Toaster>` inside one sheet and hiding the
 * global one while that sheet was open. It only ever covered that sheet, it duplicated the
 * container, and every new dialog would have had to remember the same trick.
 *
 * A popover joins the same top layer, so it is above modals rather than under them. Ordering inside
 * that layer is by entry, so a dialog opened afterwards would still cover it — hence the observer:
 * when any dialog opens, the popover leaves the layer and re-enters, which puts it back on top. It
 * watches the `open` attribute rather than a click, so it is right for every dialog including the
 * ones nobody has written yet.
 */
export function Toasts() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    // Older browsers have no popover. They lose the layering fix and keep the toasts, which is the
    // right way round to degrade.
    if (!el || typeof el.showPopover !== 'function') return;

    const raise = () => {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
        el.showPopover();
      } catch {
        // Racing a hide against a show throws rather than returning false; the next open re-tries.
      }
    };

    raise();
    const watch = new MutationObserver((records) => {
      if (records.some((r) => (r.target as Element).tagName === 'DIALOG')) raise();
    });
    watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => watch.disconnect();
  }, []);

  return (
    <div ref={host} popover="manual" className="toast-layer">
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: 'var(--c-surface)',
          color: 'var(--c-ink)',
          border: '1px solid var(--c-rule)',
          borderRadius: '3px',
          boxShadow: 'var(--c-shadow)',
          fontSize: '12.5px',
          fontFamily: 'var(--font-mono)',
          maxWidth: '380px',
        },
        error: { iconTheme: { primary: 'var(--c-refuse)', secondary: 'var(--c-surface)' } },
        success: { iconTheme: { primary: 'var(--c-settle)', secondary: 'var(--c-surface)' } },
      }}
    />
    </div>
  );
}
