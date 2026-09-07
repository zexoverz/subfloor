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
        <circle cx="12" cy="12" r="12" fill="#2775CA" />
        {/*
          * The mark is a broken ring with the gaps at top and bottom, not a plain disc with a
          * glyph on it. Two arcs and a stroked dollar, so it stays crisp at 15px and does not
          * depend on a font being present.
          */}
        <path
          d="M9.84 4.92A7.4 7.4 0 0 0 9.84 19.08"
          stroke="#fff"
          strokeWidth="1.7"
          fill="none"
          strokeLinecap="butt"
        />
        <path
          d="M14.16 4.92A7.4 7.4 0 0 1 14.16 19.08"
          stroke="#fff"
          strokeWidth="1.7"
          fill="none"
          strokeLinecap="butt"
        />
        <path d="M12 6.2v11.6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M14.5 9.6c0-1.2-1.1-1.9-2.5-1.9s-2.5.7-2.5 1.9c0 2.6 5 1.3 5 3.9 0 1.2-1.1 1.9-2.5 1.9s-2.5-.7-2.5-1.9"
          stroke="#fff"
          strokeWidth="1.5"
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

/**
 * The Chainlink mark: a hexagon ring. Drawn here for the same reason the token marks are — two
 * shapes, one brand colour, and no request to a CDN on the line that says whether the reference is
 * fresh enough to trade against.
 */
export function ChainlinkMark({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.6l9 5.2v10.4l-9 5.2-9-5.2V6.8l9-5.2zm0 4.2L6.6 8.9v6.2L12 18.2l5.4-3.1V8.9L12 5.8z"
        fill="#375BD2"
      />
    </svg>
  );
}
