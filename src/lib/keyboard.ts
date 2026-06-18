/**
 * Layout-independent shortcut key.
 *
 * `e.key` returns the produced CHARACTER, which depends on the keyboard layout — on a
 * Cyrillic (or any non-Latin) layout the physical "V" key yields "м", so `e.key === 'v'`
 * never matches and shortcuts silently die. `e.code` is the PHYSICAL key position and is
 * layout-independent (the V key is always `KeyV`). We map common codes back to their
 * US-QWERTY letter/digit/punctuation so a shortcut fires by position, like Figma/Photoshop.
 *
 * Use this for letter/digit/punctuation shortcuts. For named keys (Enter, Escape, Delete,
 * Backspace, Tab, Arrow*, ' ') keep comparing `e.key` — those are already layout-independent.
 */
const PUNCT: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
}

export function physKey(e: KeyboardEvent | React.KeyboardEvent): string {
  const code = e.code
  if (code) {
    if (code.startsWith('Key')) return code.slice(3).toLowerCase() // KeyV → 'v'
    if (code.startsWith('Digit')) return code.slice(5) // Digit1 → '1'
    if (code.startsWith('Numpad') && /^Numpad\d$/.test(code)) return code.slice(6) // Numpad1 → '1'
    if (code in PUNCT) return PUNCT[code]
  }
  // named keys (Escape/Enter/Delete/Arrow…) and anything else: e.key is layout-safe
  return (e.key || '').toLowerCase()
}
