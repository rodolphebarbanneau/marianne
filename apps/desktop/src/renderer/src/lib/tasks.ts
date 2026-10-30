import { useEffect, useState } from 'react'
import type { PlannedTask, TaskTemplate } from '@shared/types'
import { api, useLive } from './api'

/** The planned tasks, kept up to date. */
export const useTasks = (): PlannedTask[] => useLive(api.listTasks, api.onTasks) ?? []

/** What the services that are on propose, asked again when the tasks or those services change. */
export function useTaskTemplates(key: string): TaskTemplate[] {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  useEffect(() => {
    let alive = true
    void api.taskTemplates().then((list) => alive && setTemplates(list))
    return () => {
      alive = false
    }
  }, [key])
  return templates
}
