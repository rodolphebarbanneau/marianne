import type { ServiceModule } from '@marianne/sdk/main'
import annuaire from '@marianne/service-annuaire/package.json'
import { service as annuaireMain } from '@marianne/service-annuaire/main'
import parlement from '@marianne/service-parlement/package.json'
import { service as parlementMain } from '@marianne/service-parlement/main'
import carte from '@marianne/service-carte/package.json'
import { service as carteMain } from '@marianne/service-carte/main'
import meteo from '@marianne/service-meteo/package.json'
import { service as meteoMain } from '@marianne/service-meteo/main'
import peage from '@marianne/service-peage/package.json'
import { service as peageMain } from '@marianne/service-peage/main'

/**
 * A service built into Marianne. `starter`: among the user's services from the start; false: a
 * newer Marianne's service, offered in « découvrir » for the user to add. Either way, a service the
 * account has never been offered arrives once: a new starter among its services, the others in
 * « découvrir ».
 */
export interface BuiltInService {
  pkg: unknown
  module: ServiceModule
  starter: boolean
}

/**
 * The services built into Marianne: workspace packages of services/ (see docs/services.md).
 * A new built-in service is a package there, a dependency of the app (its package.json), and a
 * line here and in the window's registry.
 */
export const BUILTIN_SERVICES: BuiltInService[] = [
  { pkg: meteo, module: meteoMain, starter: true },
  { pkg: annuaire, module: annuaireMain, starter: true },
  { pkg: parlement, module: parlementMain, starter: true },
  { pkg: carte, module: carteMain, starter: true },
  { pkg: peage, module: peageMain, starter: true }
]
