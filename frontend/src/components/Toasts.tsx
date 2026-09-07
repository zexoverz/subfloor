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
 */
export function Toasts() {
  return (
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
  );
}
