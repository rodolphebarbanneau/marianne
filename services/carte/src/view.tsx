import { memo, useMemo, useState, type MouseEvent } from 'react'
import { departmentOf, formatNumber, Spinner, useCall, useHost, type Loaded } from '@marianne/sdk/view'
import { densityClasses, inhabitants, legend, perSquareKm, sortRows, squareKm, type Sort } from './display'
import { projectOnMap } from './projection'
import type { CarteMethods, CommuneFigures, DepartmentFigures, MapShape, MapView } from './types'
import './view.css'

/** 3615 CARTE: France by département, then a département by commune, with their figures; the user's commune highlighted. */

export function View() {
  const host = useHost<CarteMethods>()
  const [department, setDepartment] = useState<string | null>(null)
  const map = useCall<CarteMethods, 'france'>('france', [])
  const figures = useCall<CarteMethods, 'departmentFigures'>('departmentFigures', [])
  const name = department ? map.data?.shapes.find((s) => s.code === department)?.name : undefined

  return (
    <div className="carte">
      <div className="carte-body">
        {!host.home && (
          <div className="box-note">
            Renseignez votre adresse pour situer votre commune sur la carte.{' '}
            <button className="link" onClick={() => host.openRoute('settings/identity')}>
              renseigner mon adresse
            </button>
          </div>
        )}
        {map.error ? (
          <div className="box-note">Carte indisponible : {map.error}</div>
        ) : !map.data ? (
          <Spinner />
        ) : department ? (
          <Department
            key={department}
            code={department}
            name={name ?? department}
            figures={figures.data?.find((d) => d.code === department)}
            onBack={() => setDepartment(null)}
          />
        ) : (
          <France view={map.data} figures={figures} onOpen={setDepartment} />
        )}
      </div>
    </div>
  )
}

function France({ view, figures, onOpen }: { view: MapView; figures: Loaded<DepartmentFigures[]>; onOpen: (code: string) => void }) {
  const host = useHost<CarteMethods>()
  const [hovered, setHovered] = useState<string | null>(null)
  const rows = useMemo(() => figures.data ?? [], [figures.data])
  const byCode = useMemo(() => new Map(rows.map((d) => [d.code, d])), [rows])
  const shading = useMemo(() => densityClasses(rows), [rows])
  const home = host.home
  const marker = home?.longitude !== undefined && home.latitude !== undefined ? projectOnMap(view, home.longitude, home.latitude) : null
  const shown = hovered ? (byCode.get(hovered) ?? view.shapes.find((s) => s.code === hovered)) : null

  return (
    <div className="carte-split">
      <div className="carte-pane">
        <div className="carte-status">
          {shown ? (
            <>
              <span className="hi">
                {shown.name} ({shown.code})
              </span>
              {'population' in shown && (
                <span className="dim">
                  {shown.region} · {inhabitants(shown.population)} · {perSquareKm(shown.density)}
                </span>
              )}
            </>
          ) : (
            <span className="dim">Survolez un département, cliquez pour voir ses communes.</span>
          )}
        </div>
        <MapSvg
          view={view}
          classes={shading.classes}
          home={home ? departmentOf(home.code) : null}
          hovered={hovered}
          marker={marker}
          onHover={setHovered}
          onPick={onOpen}
          label="Carte de France par département"
        />
        <Legend thresholds={shading.thresholds} />
        <span className="small dim">{view.credit}</span>
      </div>
      <div className="carte-pane">
        {figures.error ? (
          <div className="box-note">
            Chiffres indisponibles : {figures.error}{' '}
            <button className="link" onClick={figures.reload}>
              réessayer
            </button>
          </div>
        ) : !figures.data ? (
          <span className="dim">
            <Spinner /> chiffres des départements…
          </span>
        ) : (
          <FiguresTable<DepartmentFigures>
            rows={rows}
            columns={[
              { key: 'name', label: 'Département' },
              { key: 'code', label: 'Code' },
              { key: 'population', label: 'Population', numeric: true, format: (d) => formatNumber(d.population) },
              { key: 'area', label: 'km²', numeric: true, format: (d) => formatNumber(d.area) },
              { key: 'density', label: 'hab./km²', numeric: true, format: (d) => formatNumber(d.density, d.density < 100 ? 1 : 0) },
              { key: 'communes', label: 'Communes', numeric: true, format: (d) => formatNumber(d.communes) }
            ]}
            initial={{ key: 'code', desc: false }}
            hovered={hovered}
            home={home ? departmentOf(home.code) : null}
            onHover={setHovered}
            onPick={onOpen}
          />
        )}
      </div>
    </div>
  )
}

function Department({ code, name, figures, onBack }: { code: string; name: string; figures?: DepartmentFigures; onBack: () => void }) {
  const host = useHost<CarteMethods>()
  const map = useCall<CarteMethods, 'department'>('department', [code])
  const communes = useCall<CarteMethods, 'communeFigures'>('communeFigures', [code])
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const rows = useMemo(() => communes.data ?? [], [communes.data])
  const byCode = useMemo(() => new Map(rows.map((c) => [c.code, c])), [rows])
  const shading = useMemo(() => densityClasses(rows), [rows])
  const home = host.home && departmentOf(host.home.code) === code ? host.home.code : null
  const focus = hovered ?? selected
  const shown = focus ? (byCode.get(focus) ?? map.data?.shapes.find((s) => s.code === focus)) : null

  return (
    <>
      <div className="carte-head">
        <button className="btn small" onClick={onBack}>
          ← France
        </button>
        <span className="hi carte-title">
          {name} ({code})
        </span>
        {figures && (
          <span className="dim small">
            {figures.region} · {inhabitants(figures.population)} · {squareKm(figures.area)} · {perSquareKm(figures.density)} · {formatNumber(figures.communes)}{' '}
            communes
          </span>
        )}
      </div>
      <div className="carte-split">
        <div className="carte-pane">
          <div className="carte-status">
            {shown ? (
              <>
                <span className="hi">{shown.name}</span>
                {'population' in shown && (
                  <span className="dim">
                    {shown.postalCodes.join(', ')} · {inhabitants(shown.population)} · {squareKm(shown.area)} · {perSquareKm(shown.density)}
                  </span>
                )}
              </>
            ) : (
              <span className="dim">Survolez ou cliquez une commune.</span>
            )}
          </div>
          {map.error ? (
            <div className="box-note">
              Carte indisponible : {map.error}{' '}
              <button className="link" onClick={map.reload}>
                réessayer
              </button>
            </div>
          ) : map.data ? (
            <>
              <MapSvg
                view={map.data}
                classes={shading.classes}
                home={home}
                selected={selected}
                hovered={hovered}
                onHover={setHovered}
                onPick={(c) => setSelected(c === selected ? null : c)}
                label={`Communes : ${name}`}
              />
              <Legend thresholds={shading.thresholds} />
              <span className="small dim">{map.data.credit}</span>
            </>
          ) : (
            <span className="dim">
              <Spinner /> contours des communes…
            </span>
          )}
        </div>
        <div className="carte-pane">
          {communes.error ? (
            <div className="box-note">
              Chiffres indisponibles : {communes.error}{' '}
              <button className="link" onClick={communes.reload}>
                réessayer
              </button>
            </div>
          ) : communes.data ? (
            <FiguresTable<CommuneFigures>
              rows={rows}
              columns={[
                { key: 'name', label: 'Commune' },
                { key: 'population', label: 'Population', numeric: true, format: (c) => formatNumber(c.population) },
                { key: 'area', label: 'km²', numeric: true, format: (c) => formatNumber(c.area, c.area < 100 ? 2 : 0) },
                { key: 'density', label: 'hab./km²', numeric: true, format: (c) => formatNumber(c.density, c.density < 100 ? 1 : 0) }
              ]}
              initial={{ key: 'population', desc: true }}
              hovered={hovered}
              selected={selected}
              home={home}
              onHover={setHovered}
              onPick={(c) => setSelected(c === selected ? null : c)}
            />
          ) : (
            <span className="dim">
              <Spinner /> chiffres des communes…
            </span>
          )}
        </div>
      </div>
    </>
  )
}

/** The shapes, drawn once: hovering and picking only redraw the outlines on top. */
const Shapes = memo(function Shapes({ shapes, classes }: { shapes: MapShape[]; classes: Record<string, number> }) {
  return (
    <g>
      {shapes.map((s) => (
        <path key={s.code} d={s.path} data-code={s.code} className={`carte-shape carte-d${classes[s.code] ?? 'x'}`} />
      ))}
    </g>
  )
})

interface MapProps {
  view: MapView
  classes: Record<string, number>
  home: string | null
  selected?: string | null
  hovered: string | null
  marker?: [number, number] | null
  onHover: (code: string | null) => void
  onPick: (code: string) => void
  label: string
}

function MapSvg({ view, classes, home, selected, hovered, marker, onHover, onPick, label }: MapProps) {
  const byCode = useMemo(() => new Map(view.shapes.map((s) => [s.code, s])), [view])
  const codeAt = (e: MouseEvent) => (e.target as Element).getAttribute('data-code')
  const outline = (code: string | null | undefined, className: string) => {
    const shape = code ? byCode.get(code) : undefined
    return shape && <path d={shape.path} className={className} />
  }
  return (
    <svg
      className="carte-map"
      viewBox={`0 0 ${view.width} ${view.height}`}
      role="img"
      aria-label={label}
      onMouseOver={(e) => onHover(codeAt(e))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        const code = codeAt(e)
        if (code) onPick(code)
      }}
    >
      {view.frames.map(
        (f) =>
          f.box && (
            <g key={f.label}>
              <rect className="carte-inset" x={f.box[0]} y={f.box[1]} width={f.box[2]} height={f.box[3]} />
              <text className="carte-inset-label" x={f.box[0] + 5} y={f.box[1] + f.box[3] - 6}>
                {f.label}
              </text>
            </g>
          )
      )}
      <Shapes shapes={view.shapes} classes={classes} />
      {outline(home, 'carte-outline carte-home')}
      {outline(selected, 'carte-outline carte-selected')}
      {outline(hovered, 'carte-outline carte-hovered')}
      {marker && <circle className="carte-marker" cx={marker[0]} cy={marker[1]} r={5} />}
    </svg>
  )
}

function Legend({ thresholds }: { thresholds: number[] }) {
  const labels = legend(thresholds)
  if (!labels.length) return null
  return (
    <div className="carte-legend small dim">
      <span>hab./km² :</span>
      {labels.map((l, i) => (
        <span key={l}>
          <i className={`carte-swatch carte-d${i}`} /> {l}
        </span>
      ))}
    </div>
  )
}

interface Column<T> {
  key: keyof T & string
  label: string
  numeric?: boolean
  format?: (row: T) => string
}

interface TableProps<T> {
  rows: T[]
  columns: Array<Column<T>>
  initial: Sort<T>
  hovered: string | null
  selected?: string | null
  home: string | null
  onHover: (code: string | null) => void
  onPick: (code: string) => void
}

function FiguresTable<T extends { code: string }>({ rows, columns, initial, hovered, selected, home, onHover, onPick }: TableProps<T>) {
  const [sort, setSort] = useState<Sort<T>>(initial)
  const sorted = useMemo(() => sortRows(rows, sort), [rows, sort])
  const by = (c: Column<T>) => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : !!c.numeric }))
  return (
    <div className="carte-table-wrap" onMouseLeave={() => onHover(null)}>
      <table className="carte-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.numeric ? 'carte-num' : undefined}
                aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              >
                <button onClick={() => by(c)}>
                  {c.label}
                  {sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.code}
              className={[row.code === hovered && 'carte-row-hovered', row.code === selected && 'carte-row-selected', row.code === home && 'carte-row-home']
                .filter(Boolean)
                .join(' ')}
              onMouseEnter={() => onHover(row.code)}
              onClick={() => onPick(row.code)}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? 'carte-num' : undefined}>
                  {c.format ? c.format(row) : String(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
