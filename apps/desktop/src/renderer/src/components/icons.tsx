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
/** A cog of six teeth (outer radius 7, inner 5.2) around its hub: settings, not a sun. */
export const GearIcon = svg(
  'M6.31 3.08L6.66 1.13L9.34 1.13L9.69 3.08L11.41 4.08L13.28 3.41L14.62 5.72L13.1 7.01L13.1 8.99L14.62 10.28L13.28 12.59L11.41 11.92L9.69 12.92L9.34 14.87L6.66 14.87L6.31 12.92L4.59 11.92L2.72 12.59L1.38 10.28L2.9 8.99L2.9 7.01L1.38 5.72L2.72 3.41L4.59 4.08z M8 5.8a2.2 2.2 0 1 1 0 4.4a2.2 2.2 0 1 1 0-4.4z'
)
export const LockIcon = svg('M3.5 7.5h9v6.5h-9z M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5')
export const FilterIcon = svg('M2 3.5h12 M4 8h8 M6.5 12.5h3')
export const NewIcon = svg('M2.5 3.5h7 M2.5 3.5v10h10v-6 M7 9l6.5-6.5')
/** Three square dots, like mosaic blocks: drawn 2 wide, they want a stroke of 2. */
export const MoreIcon = svg('M2 8h2 M7 8h2 M12 8h2')
export const BrowserIcon = svg('M1.5 2.5h13v11h-13z M1.5 5.5h13 M9.5 5.5v8')
export const CloseIcon = svg('M3.5 3.5l9 9 M12.5 3.5l-9 9')
/** Two sheets, the front one to take: copy. */
export const CopyIcon = svg('M5.5 5.5h8v8h-8z M10.5 5.5v-3h-8v8h3')
export const CheckIcon = svg('M2.5 8.5l3.5 3.5 7.5-8')
/** The GUIDE's links: the code, a bug, an idea's spark, a version's tag, the user guide's book. */
export const CodeIcon = svg('M5 4.5L1.5 8L5 11.5 M11 4.5L14.5 8L11 11.5 M9.2 3L6.8 13')
export const BugIcon = svg(
  'M5 7h6v3a3 3 0 0 1-6 0z M6.5 7V6a1.5 1.5 0 0 1 3 0v1 M8 9v4 M5 9H2 M11 9h3 M5.5 12l-2 1.5 M10.5 12l2 1.5 M5 7.2L3 5.7 M11 7.2l2-1.5'
)
export const SparkIcon = svg('M7 1.5l1.4 4.1 4.1 1.4-4.1 1.4L7 12.5 5.6 8.4 1.5 7l4.1-1.4z M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z')
export const TagIcon = svg('M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5z M5 4.3a.7.7 0 1 1 0 1.4a.7.7 0 1 1 0-1.4z')
export const BookIcon = svg('M8 4.5C6.8 3.4 4.8 3 2 3v9.5c2.8 0 4.8.4 6 1.5 1.2-1.1 3.2-1.5 6-1.5V3c-2.8 0-4.8.4-6 1.5z M8 4.5V14')
/** A turn of the circle and its arrow: reload. */
export const ReloadIcon = svg('M13.5 8a5.5 5.5 0 1 1-5.5-5.5c1.5 0 2.9.6 3.9 1.6l1.6 1.4 M13.5 2.5v3h-3')
