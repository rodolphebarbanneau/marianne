import { useCallback, useEffect, useState } from 'react'
import type { Config, DeepPartial, SourceStatus } from '@shared/types'

const api = window.marianne

export type Update = (patch: DeepPartial<Config>) => Promise<void>

export function useConfig(): [Config | null, Update] {
  const [config, setConfig] = useState<Config | null>(null)
  useEffect(() => {
    void api.getConfig().then(setConfig)
    return api.onConfig(setConfig)
  }, [])
  const update = useCallback(async (patch: DeepPartial<Config>) => {
    setConfig(await api.setConfig(patch))
  }, [])
  return [config, update]
}

export function useSources(): SourceStatus[] {
  const [list, setList] = useState<SourceStatus[]>([])
  useEffect(() => {
    void api.listSources().then(setList)
    return api.onSources(setList)
  }, [])
  return list
}

/** Apply the display settings to the document (theme, font, effects, size). */
export function useDisplay(config: Config | null): void {
  useEffect(() => {
    if (!config) return
    const root = document.documentElement
    root.dataset.theme = config.ui.theme
    root.dataset.font = config.ui.retroFont ? 'retro' : 'sharp'
    root.dataset.crt = config.ui.crt ? 'on' : 'off'
    root.style.setProperty('--text-size', `${config.ui.textSize}px`)
  }, [config])
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 14:05 today, "hier 14:05", "12/10 14:05", "12/10/2025". */
export function when(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === now.toDateString()) return time
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (d.toDateString() === yesterday.toDateString()) return `hier ${time}`
  if (d.getFullYear() === now.getFullYear()) return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function ipcError(e: Error): string {
  return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
