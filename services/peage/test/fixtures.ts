import type { ProfileField, Vehicle } from '@marianne/sdk/main'

export const CLIO: Vehicle = { id: 'v1', plate: 'AB-123-CD' }
export const KANGOO: Vehicle = { id: 'v2', plate: 'EF-456-GH' }
/** The user granted the plates and has two vehicles. */
export const GRANTED = { granted: ['vehicles.plate'] as ProfileField[], vehicles: [CLIO, KANGOO] }
