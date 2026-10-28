import type { ComponentType } from 'react'
import { View as annuaire } from '@marianne/service-annuaire/view'
import { View as assemblee } from '@marianne/service-assemblee/view'
import { View as carte } from '@marianne/service-carte/view'
import { View as meteo } from '@marianne/service-meteo/view'
import { View as peage } from '@marianne/service-peage/view'

/** The screens of the built-in services, by code (the main process's registry lists the same packages). */
export const SERVICE_VIEWS: Record<string, ComponentType> = { annuaire, assemblee, carte, meteo, peage }
