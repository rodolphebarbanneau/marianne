import type { ServiceModule } from '@marianne/sdk/main'
import annuaire from '@marianne/service-annuaire/package.json'
import { service as annuaireMain } from '@marianne/service-annuaire/main'
import assemblee from '@marianne/service-assemblee/package.json'
import { service as assembleeMain } from '@marianne/service-assemblee/main'
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
  { pkg: assemblee, module: assembleeMain },
  { pkg: carte, module: carteMain },
  { pkg: peage, module: peageMain }
]
