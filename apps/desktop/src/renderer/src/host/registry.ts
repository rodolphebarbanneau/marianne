import type { ComponentType } from 'react'
import { View as annuaire } from '@marianne/service-annuaire/view'
import { View as parlement } from '@marianne/service-parlement/view'
import { View as carte } from '@marianne/service-carte/view'
import { View as meteo } from '@marianne/service-meteo/view'
import { View as peage } from '@marianne/service-peage/view'

import annuaireHelp from '@marianne/service-annuaire/help?raw'
import carteHelp from '@marianne/service-carte/help?raw'
import meteoHelp from '@marianne/service-meteo/help?raw'
import parlementHelp from '@marianne/service-parlement/help?raw'
import peageHelp from '@marianne/service-peage/help?raw'

/** The screens of the built-in services, by code (the main process's registry lists the same packages). */
export const SERVICE_VIEWS: Record<string, ComponentType> = { annuaire, carte, meteo, parlement, peage }

/** Their help (Markdown, a few lines), shown in Marianne's guide (F1) on their screen. */
export const SERVICE_HELP: Record<string, string> = {
  annuaire: annuaireHelp,
  carte: carteHelp,
  meteo: meteoHelp,
  parlement: parlementHelp,
  peage: peageHelp
}
