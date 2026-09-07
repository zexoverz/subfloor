/**
 * Token marks, drawn inline.
 *
 * Not fetched from a token list or a CDN: there are two tokens in this deployment, the shapes are
 * a diamond and a disc, and a network request for them would be one more thing that can be slow,
 * blocked, or quietly wrong on the screen that says what the vault holds.
 *
 * Brand colours rather than palette tokens. These are identifiers — a reader recognises them the
 * way they recognise a logo, and recolouring them to match the page would make them decoration.
 */
export function TokenIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  if (symbol === 'WETH' || symbol === 'ETH') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <circle cx="12" cy="12" r="12" fill="#627EEA" />
        <path d="M12 3.5v6.3l5.3 2.4L12 3.5z" fill="#fff" fillOpacity=".6" />
        <path d="M12 3.5L6.7 12.2l5.3-2.4V3.5z" fill="#fff" />
        <path d="M12 16.4v4.1l5.3-7.3-5.3 3.2z" fill="#fff" fillOpacity=".6" />
        <path d="M12 20.5v-4.1l-5.3-3.2L12 20.5z" fill="#fff" />
        <path d="M12 15.4l5.3-3.2-5.3-2.4v5.6z" fill="#fff" fillOpacity=".2" />
        <path d="M6.7 12.2l5.3 3.2V9.8l-5.3 2.4z" fill="#fff" fillOpacity=".6" />
      </svg>
    );
  }

  if (symbol === 'USDC') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
        {/* Stroked rather than typeset: a text glyph inherited whatever font was around and sat
            off-centre at this size. */}
        <circle cx="12" cy="12" r="12" fill="#2775CA" />
        <path
          d="M12 5.6v12.8"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M15.1 9.1c0-1.4-1.4-2.2-3.1-2.2s-3.1.8-3.1 2.2c0 3.2 6.2 1.5 6.2 4.8 0 1.4-1.4 2.2-3.1 2.2s-3.1-.8-3.1-2.2"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  // Anything else gets its initial rather than a wrong logo.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="12" className="fill-rule" />
      <text
        x="12"
        y="16.4"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="ui-monospace, monospace"
        className="fill-faint"
      >
        {symbol.slice(0, 1)}
      </text>
    </svg>
  );
}
