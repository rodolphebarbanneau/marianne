import type { DocumentMeta, Profile } from '@shared/profile'
import { api, useLive } from './api'

/** The profile, kept up to date. */
export const useProfile = (): Profile | null => useLive(api.getProfile, api.onProfile)

/** The archive's documents, kept up to date. */
export const useDocuments = (): DocumentMeta[] => useLive(api.listDocuments, api.onDocuments) ?? []
