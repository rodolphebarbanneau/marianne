import type { Commune } from '@marianne/sdk/main'
import type { RawOffice } from '../src/directory'

/** Records of the DILA directory, as its API gives them (structured fields as JSON strings). */

export const MAIRIE_BORDEAUX: RawOffice = {
  id: 'ff97c4f1-b888-463b-8ca5-7b9f1b45e893',
  nom: 'Mairie - Bordeaux',
  adresse:
    '[{"type_adresse": "Adresse", "complement1": "", "complement2": "", "numero_voie": "Place Pey-Berland", "service_distribution": "", "code_postal": "33000", "nom_commune": "Bordeaux", "pays": "", "continent": "", "longitude": "-0.579635", "latitude": "44.83802"}, {"type_adresse": "Adresse postale", "complement1": "", "complement2": "", "numero_voie": "Place Pey-Berland", "service_distribution": "", "code_postal": "33045", "nom_commune": "Bordeaux", "pays": "France", "continent": "Europe", "longitude": "", "latitude": ""}]',
  telephone: '[{"valeur": "05 56 10 20 30", "description": ""}]',
  adresse_courriel: null,
  site_internet: '[{"libelle": "", "valeur": "https://www.bordeaux.fr"}]',
  plage_ouverture:
    '[{"nom_jour_debut": "Lundi", "nom_jour_fin": "Vendredi", "valeur_heure_debut_1": "09:00:00", "valeur_heure_fin_1": "17:00:00", "valeur_heure_debut_2": "", "valeur_heure_fin_2": "", "commentaire": "État civil ouvert le jeudi de 11h30 à 19h."}]',
  commentaire_plage_ouverture: null,
  formulaire_contact: 'https://mesdemarches.bordeaux.fr/portals/public/services?id=bordeaux&page=DEM_NousContacter_Presentation',
  url_service_public: 'https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/gironde/ff97c4f1-b888-463b-8ca5-7b9f1b45e893',
  pivot: '[{"type_service_local": "mairie", "code_insee_commune": ["33063"]}]'
}

export const CAF_BELCIER: RawOffice = {
  id: 'e913dcc2-e004-4ab9-8a59-9017a337ce7d',
  nom: "Caisse d'allocations familiales (Caf) de Gironde - accueil de Bordeaux - Belcier",
  adresse:
    '[{"type_adresse": "Adresse", "complement1": "", "complement2": "Résidence les Traversants", "numero_voie": "60 rue d\'Armagnac", "service_distribution": "", "code_postal": "33800", "nom_commune": "Bordeaux", "pays": "France", "continent": "Europe", "longitude": "-0.551999", "latitude": "44.821537"}, {"type_adresse": "Adresse postale", "complement1": "Caisse d\'allocations familiales de Gironde", "complement2": "", "numero_voie": "Rue du Docteur-Gabriel-Péry", "service_distribution": "", "code_postal": "33078", "nom_commune": "Bordeaux Cedex", "pays": "France", "continent": "Europe", "longitude": "", "latitude": ""}]',
  telephone:
    '[{"valeur": "32 30", "description": "Du lundi au vendredi de 9h à 16h. Service gratuit + prix d’un appel"}, {"valeur": "0 969 32 52 52", "description": "Pour les étudiants. Du lundi au vendredi de 9h à 19h30. Service gratuit + prix d’un appel"}]',
  adresse_courriel: null,
  site_internet: '[{"libelle": "", "valeur": "https://www.caf.fr"}]',
  plage_ouverture:
    '[{"nom_jour_debut": "Lundi", "nom_jour_fin": "Vendredi", "valeur_heure_debut_1": "08:30:00", "valeur_heure_fin_1": "12:00:00", "valeur_heure_debut_2": "", "valeur_heure_fin_2": "", "commentaire": "Accueil ouvert uniquement sur rendez-vous."}]',
  commentaire_plage_ouverture: null,
  formulaire_contact: 'https://www.caf.fr/allocataires/ma-caf-recherche',
  url_service_public: 'https://lannuaire.service-public.gouv.fr/nouvelle-aquitaine/gironde/e913dcc2-e004-4ab9-8a59-9017a337ce7d',
  pivot: '[{"type_service_local": "caf", "code_insee_commune": ["33063"]}]'
}

export const BORDEAUX: Commune = {
  code: '33063',
  name: 'Bordeaux',
  postalCodes: ['33000', '33100', '33200', '33300', '33800'],
  department: '33',
  departmentName: 'Gironde',
  region: 'Nouvelle-Aquitaine',
  population: 267991,
  longitude: -0.5848,
  latitude: 44.8624
}

export const LORMONT: Commune = {
  code: '33249',
  name: 'Lormont',
  postalCodes: ['33310'],
  department: '33',
  departmentName: 'Gironde',
  region: 'Nouvelle-Aquitaine',
  population: 24000,
  longitude: -0.5217,
  latitude: 44.8792
}

/** An office of the département, elsewhere, with only an address and its page. */
export const office = (id: string, kind: string, longitude: number, latitude: number): RawOffice => ({
  id,
  nom: `${kind} ${id}`,
  adresse: JSON.stringify([
    {
      type_adresse: 'Adresse',
      numero_voie: '1 rue de la Paix',
      code_postal: '33000',
      nom_commune: 'Ailleurs',
      longitude: String(longitude),
      latitude: String(latitude)
    }
  ]),
  telephone: null,
  adresse_courriel: null,
  site_internet: null,
  plage_ouverture: null,
  commentaire_plage_ouverture: null,
  formulaire_contact: null,
  url_service_public: `https://lannuaire.service-public.gouv.fr/x/${id}`,
  pivot: JSON.stringify([{ type_service_local: kind, code_insee_commune: [] }])
})

/** The `where` of a directory request. */
export const whereOf = (url: URL) => url.searchParams.get('where') ?? ''
