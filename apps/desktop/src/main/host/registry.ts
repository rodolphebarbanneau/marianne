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
 * The services built into Marianne: workspace packages of services/ (see docs/services.md).
 * A new built-in service is a package there, a dependency of the app (its package.json), and a
 * line here and in the window's registry.
 */
export const BUILTIN_SERVICES: Array<{ pkg: unknown; module: ServiceModule }> = [
  { pkg: meteo, module: meteoMain },
  { pkg: annuaire, module: annuaireMain },
  { pkg: parlement, module: parlementMain },
  { pkg: carte, module: carteMain },
  { pkg: peage, module: peageMain }
]
