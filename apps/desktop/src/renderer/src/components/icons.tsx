/** Line icons, drawn like the rest: thin strokes, no fill. */

const svg = (d: string) =>
  function Icon() {
    return (
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d={d} />
      </svg>
    )
  }

export const PanelIcon = svg('M1.5 2.5h13v11h-13z M5.5 2.5v11')
export const SearchIcon = svg('M6.8 2a4.8 4.8 0 1 1 0 9.6a4.8 4.8 0 1 1 0-9.6z M10.3 10.3l4 4')
export const GearIcon = svg(
  'M8 5.6a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8z M8 1v2 M8 13v2 M1 8h2 M13 8h2 M3 3l1.4 1.4 M11.6 11.6L13 13 M3 13l1.4-1.4 M11.6 4.4L13 3'
)
export const LockIcon = svg('M3.5 7.5h9v6.5h-9z M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5')
export const FilterIcon = svg('M2 3.5h12 M4 8h8 M6.5 12.5h3')
export const NewIcon = svg('M2.5 3.5h7 M2.5 3.5v10h10v-6 M7 9l6.5-6.5')
export const MoreIcon = svg('M3 8h.5 M7.75 8h.5 M12.5 8h.5')
export const BrowserIcon = svg('M1.5 2.5h13v11h-13z M1.5 5.5h13 M9.5 5.5v8')
export const CloseIcon = svg('M3.5 3.5l9 9 M12.5 3.5l-9 9')
