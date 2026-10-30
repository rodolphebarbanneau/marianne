/**
 * Screen pixels per CSS pixel, kept current (another display, a zoom). What is drawn in whole
 * screen pixels (the logo, the accounts' mosaics, the services' icons) lays itself out with it: at
 * 125 %, edges laid out in CSS pixels fall between two screen pixels, and round unevenly. The SDK
 * has it, for the services' pictures; the window uses the same.
 */
export { usePixelRatio } from '@marianne/sdk/view'
