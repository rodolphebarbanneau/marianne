/** The browser is never narrower than this. */
export const BROWSER_MIN = 320
/** What the browser leaves the conversation beside it, at least, as its edge is dragged. */
export const CONVERSATION_MIN = 360
/** The pointer moves this far before a press on the edge becomes a drag: a click or a double-click doesn't hide the page. */
export const DRAG_FROM = 3

/**
 * The browser's width as its left edge is dragged: `start` its width then, `moved` how far the
 * pointer went (left is wider), `room` what the conversation could still give. Never under
 * BROWSER_MIN, even when the conversation has no room left.
 */
export const draggedWidth = (start: number, moved: number, room: number) =>
  Math.round(Math.max(BROWSER_MIN, Math.min(start + Math.max(0, room), start - moved)))

/**
 * Where the page goes, in whole pixels, from its box: rounded inward, never outward. The page is a
 * native view drawn over the window; with a display scaled (125 %), the box's edges fall between
 * pixels, and a page rounded outward would cover the panel's edge (its line, lit while dragged) or
 * the bars above and below by a fraction of a pixel.
 */
export function pageBounds(box: { left: number; top: number; right: number; bottom: number }) {
  const x = Math.ceil(box.left)
  const y = Math.ceil(box.top)
  return { x, y, width: Math.max(0, Math.floor(box.right) - x), height: Math.max(0, Math.floor(box.bottom) - y) }
}
