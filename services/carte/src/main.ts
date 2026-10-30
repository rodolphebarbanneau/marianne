import { defineService, defineTool, ToolError, type ServiceTool } from '@marianne/sdk/main'
import * as z from 'zod'
import { departmentCode, findDepartments, franceMap, type BundledDepartment } from './map'
import { describeCommune, describeDepartment, describeFrance } from './report'
import { Territory } from './territory'
import { carteTile } from './tile'
import type { CarteMethods } from './types'

/** 3615 CARTE: the map of France, its départements and communes, and their figures. */

/** The département a tool argument designates, or a ToolError saying why there is none. */
function oneDepartment(text: string): BundledDepartment {
  const found = findDepartments(text)
  if (found.length === 1) return found[0]
  if (found.length)
    throw new ToolError(`"${text}" matches several départements: ${found.map((d) => `${d.name} (${d.code})`).join(', ')}. Give one of these codes.`)
  throw new ToolError(`No département "${text}": give its code ("33", "2A", "971") or its name ("Gironde").`)
}

function figuresTool(territory: Territory): ServiceTool {
  return defineTool({
    name: 'figures',
    label: 'chiffres',
    description:
      'Population, area and density of French territories (Insee legal populations, IGN areas): of a commune, with its département, region and postal codes; of a département, ' +
      'with its number of communes and the most populated ones; with neither, of France and every département (a table of 101 rows). ' +
      'Use it for "how many people live in…", "the area of…", "the most densely populated département".',
    input: {
      commune: z.string().trim().min(2).optional().describe('A commune: name ("Saint-Denis"), postal code ("93200") or INSEE code ("93066")'),
      department: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('A département: code ("33", "2A", "971") or name ("Gironde"). With a commune: the département to look for it in')
    },
    readOnly: true,
    run: async ({ commune, department }) => {
      const dep = department ? oneDepartment(department) : null
      if (commune) {
        const found = await territory.findCommunes(commune, dep?.code)
        if (!found.length)
          throw new ToolError(`No commune matches "${commune}"${dep ? ` in ${dep.name} (${dep.code})` : ''}: give its name, postal code or INSEE code.`)
        return describeCommune(found[0], found.slice(1))
      }
      if (dep) {
        const { figures, communes } = await territory.department(dep.code)
        return describeDepartment(figures, communes)
      }
      return describeFrance(await territory.departmentFigures())
    }
  })
}

/** A département code from the view, checked: a French error otherwise. */
function checked(code: string): string {
  const valid = departmentCode(code)
  if (!valid) throw new Error(`Département inconnu : ${code}`)
  return valid
}

export const service = defineService<CarteMethods>({
  activate(ctx) {
    const territory = new Territory(ctx.http)
    return {
      methods: {
        france: () => franceMap(),
        department: (code) => territory.departmentMap(checked(code)),
        departmentFigures: () => territory.departmentFigures(),
        communeFigures: (department) => territory.communeFigures(checked(department))
      },
      tools: [figuresTool(territory)],
      tile: () => carteTile(territory, ctx.home())
    }
  },
  // Legal populations change once a year: once a day is plenty.
  tile: { everyMinutes: 1440 }
})
