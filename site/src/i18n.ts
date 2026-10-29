// The site's words, in French (the app's language, and the site's first) and in English. The app's
// labels stay in French in both, as the guide quotes them.

export type Lang = 'fr' | 'en'
export const LANGS: Lang[] = ['fr', 'en']

/** French typography: a non-breaking space before ? ! : ; and inside « », so they never start a line. */
export const nbsp = (s: string) => s.replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« ')

const fr = {
  meta: {
    title: 'Marianne · l’assistant citoyen sur votre ordinateur',
    description:
      'Vos droits, vos démarches et vos papiers, avec votre propre Claude Code, Codex ou Mistral Vibe. Gratuit, open source, et tout reste chiffré sur votre ordinateur.'
  },
  nav: { features: 'Fonctions', privacy: 'Vie privée', services: 'Services', download: 'Télécharger', guide: 'Guide' },
  ui: {
    mono: 'Minitel 1',
    monoTitle: 'Le noir et blanc du premier Minitel',
    other: 'English',
    otherTitle: 'This site in English',
    skip: 'Aller au contenu'
  },
  hero: {
    title: 'Vos droits, vos démarches,\nvos services',
    lead: 'Marianne est un assistant citoyen pour votre ordinateur. Elle vous aide à comprendre vos droits, à préparer vos démarches et à suivre vos échéances, avec l’IA que vous avez déjà : Claude Code, Codex ou Mistral Vibe.',
    placeholder: 'Écrivez à Marianne : une démarche, une question, un document…',
    send: 'envoyer',
    download: { windows: 'Télécharger pour Windows', mac: 'Télécharger pour Mac', linux: 'Télécharger pour Linux', any: 'Télécharger Marianne' },
    sub: 'gratuit · open source · sans compte en ligne',
    others: 'autres systèmes',
    guide: 'lire le guide',
    phone: 'Marianne s’installe sur un ordinateur : Windows, macOS ou Linux.'
  },
  screens: {
    title: 'Un coup d’œil',
    lead: 'Marianne telle que vous la verrez : une question posée, votre accord demandé, vos démarches suivies, vos services sous la main.',
    sample: 'données d’exemple',
    prev: 'précédent',
    next: 'suivant',
    items: {
      dossier: {
        tab: 'un dossier',
        caption: 'Une question, une réponse claire. Marianne consulte ses services et ses sources, puis vous dit quoi faire, et avant quand.'
      },
      accord: {
        tab: 'votre accord',
        caption: 'Marianne remplit le site du péage dans son navigateur, avec votre plaque. Avant chaque clic qui compte, elle vous demande votre accord.'
      },
      demarches: {
        tab: 'vos démarches',
        caption: 'Chaque domaine de votre vie administrative a son tableau de bord : vos échéances, vos véhicules, les démarches guidées.'
      },
      services: {
        tab: 'vos services',
        caption: 'Les Services, avec leurs codes 3615 : vos péages en flux libre, la France en données publiques, le temps de votre commune…'
      }
    }
  },
  features: {
    title: 'Ce que fait Marianne',
    lead: 'Une seule fenêtre pour la paperasse : vous posez la question comme elle vient, Marianne s’occupe du reste, avec vous.',
    items: [
      {
        code: 'DOSSIERS',
        title: 'Un sujet, un dossier',
        text: 'Chaque question devient un dossier : la conversation, les pièces et les étapes au même endroit. Mis en veille, il revient de lui-même à la date choisie.'
      },
      {
        code: 'DÉMARCHES',
        title: 'Des démarches guidées',
        text: 'Déclarer vos revenus, renouveler votre carte d’identité, contester une amende… Marianne vous accompagne pas à pas, d’après des fiches relues et sourcées.'
      },
      {
        code: 'ACCORD',
        title: 'C’est vous qui décidez',
        text: 'Tout ce qui change votre profil, remplit un formulaire, signe, paie ou envoie passe d’abord par une carte : Marianne attend votre accord.'
      },
      {
        code: 'NAVIGATEUR',
        title: 'Les sites officiels, avec elle',
        text: 'Marianne ouvre les sites des démarches dans son navigateur. Vous pouvez reprendre la main à tout moment, et il oublie tout au verrouillage.'
      },
      {
        code: 'ACTUALITÉS',
        title: 'L’actualité utile',
        text: 'Les titres de vos journaux, les rendez-vous du jour, et ce qui change en France : nouvelles règles, aides revalorisées, dates à retenir.'
      },
      {
        code: 'ÉCHÉANCES',
        title: 'Vos papiers, vos échéances',
        text: 'Vos pièces et votre profil servent à préparer vos démarches, et Marianne vous rappelle ce qui arrive : un paiement, un contrôle technique, une déclaration.'
      }
    ]
  },
  privacy: {
    title: 'Rien ne quitte votre ordinateur.',
    lead: 'Marianne n’a ni serveur ni compte en ligne. Tout ce que vous lui confiez tient dans une archive chiffrée : un seul fichier, sur votre disque, que vous êtes la seule personne à pouvoir ouvrir.',
    points: [
      'Une archive chiffrée (AES-256-GCM), ouverte par votre phrase de passe, puis par un simple code sur cet ordinateur.',
      'Le moteur ne voit jamais vos identifiants : numéro de sécurité sociale, numéro fiscal, nom, adresse, IBAN deviennent des jetons.',
      'Les jetons ne redeviennent vos vraies valeurs que sur votre écran.',
      'Le code est ouvert, sous licence MIT : chacun peut vérifier ce qu’il fait.'
    ],
    screen: 'sur votre écran',
    engine: 'ce que reçoit le moteur',
    replay: 'rejouer'
  },
  engines: {
    title: 'Votre IA, votre abonnement.',
    lead: 'Marianne n’a pas d’IA à elle : elle prête ses outils à celle que vous avez déjà, avec votre compte chez son éditeur. Le moteur travaille dans un dossier vide, sans terminal ni accès à vos fichiers : il ne passe que par Marianne.',
    items: [
      { code: 'CL', name: 'Claude Code', maker: 'Anthropic', state: 'ready', note: '' },
      { code: 'CX', name: 'Codex', maker: 'OpenAI', state: 'ready', note: '' },
      { code: 'MI', name: 'Mistral Vibe', maker: 'Mistral', state: 'soon', note: 'pas encore essayé avec une vraie installation' }
    ],
    install: 'installer un moteur'
  },
  services: {
    title: 'Les Services, code 3615.',
    lead: 'Des petits outils d’information publique, avec leurs codes, comme au temps du Minitel. Ils ne sont rattachés à aucun dossier, et chacun peut écrire le sien.',
    items: [
      { code: 'METEO', name: 'Météo', text: 'le temps de votre commune, maintenant et sur 7 jours (Météo-France)' },
      { code: 'PEAGE', name: 'Péage en flux libre', text: 'les autoroutes sans barrière : vos trajets, l’échéance de 72 heures, le paiement officiel' },
      { code: 'PARLEMENT', name: 'Parlement', text: 'l’Assemblée nationale et le Sénat : vos élus, les scrutins, l’agenda, les séances en direct' },
      {
        code: 'ANNUAIRE',
        name: 'Annuaire des services publics',
        text: 'mairie, Caf, CPAM, impôts, tribunaux près de chez vous : adresses, horaires, téléphones'
      },
      { code: 'CARTE', name: 'Carte de France', text: 'départements et communes : population, superficie, densité' }
    ],
    yours: {
      code: 'VOTRE',
      name: 'Le vôtre ?',
      text: 'les services sont des modules ouverts, construits sur un SDK : écrivez celui qui vous manque',
      link: 'le SDK des services'
    }
  },
  download: {
    title: 'Télécharger Marianne',
    lead: 'Gratuit et open source. C’est une version alpha : merci de l’essayer, et de nous dire ce qui ne va pas.',
    version: 'version',
    published: 'publiée le',
    unknown: 'la dernière version',
    all: 'toutes les versions',
    detected: 'votre système',
    windows: {
      name: 'Windows',
      arch: '64 bits',
      note: 'Le programme n’est pas encore signé : Windows affiche « Windows a protégé votre ordinateur ». Cliquez sur « Informations complémentaires », puis « Exécuter quand même ».'
    },
    mac: {
      name: 'macOS',
      arch: 'Apple silicon ou Intel',
      arm: 'Apple silicon',
      intel: 'Mac Intel',
      note: 'L’application n’est pas encore notariée : au premier lancement, faites clic droit › Ouvrir, ou Réglages Système › Confidentialité et sécurité › « Ouvrir quand même ».'
    },
    linux: {
      name: 'Linux',
      arch: '64 bits',
      note: 'Le .deb s’installe et ouvre les archives d’un double clic. L’AppImage marche partout : rendez-la exécutable (chmod +x).'
    },
    engine: {
      title: 'Avant de commencer : un moteur',
      text: 'Marianne parle à Claude Code, Codex ou Mistral Vibe. Installez-en un, puis connectez-vous une fois avec votre compte, dans un terminal.',
      link: 'le guide d’installation'
    }
  },
  guide: {
    title: 'Le guide',
    lead: 'Pas besoin d’être informaticien : le guide explique tout, pas à pas, de l’installation à vos premières démarches.',
    open: 'ouvrir le guide',
    contents: 'sommaire',
    edit: 'modifier cette page',
    prev: 'RETOUR',
    next: 'SUITE',
    back: 'retour à l’accueil'
  },
  bar: { locked: 'rien ne quitte votre ordinateur', prev: 'précédent', next: 'suivant', top: 'haut de page', help: 'le guide' },
  footer: {
    disclaimer:
      'Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration. Elle aide à comprendre et à préparer vos démarches, sans remplacer l’administration ni un conseil juridique.',
    code: 'le code source',
    security: 'sécurité',
    license: 'licence',
    credit: 'En fond : Eugène Delacroix, La Liberté guidant le peuple (1830), musée du Louvre, domaine public.',
    issues: 'nous écrire'
  },
  notFound: {
    title: 'Page introuvable',
    text: 'Le service demandé n’existe pas, ou plus. Revenez au sommaire.',
    home: 'retour au sommaire'
  }
}

const en: typeof fr = {
  meta: {
    title: 'Marianne · the citizen assistant on your computer',
    description:
      'Your rights, your formalities and your papers in France, with your own Claude Code, Codex or Mistral Vibe. Free, open source, and everything stays encrypted on your computer.'
  },
  nav: { features: 'Features', privacy: 'Privacy', services: 'Services', download: 'Download', guide: 'Guide' },
  ui: {
    mono: 'Minitel 1',
    monoTitle: 'The black and white of the first Minitel',
    other: 'Français',
    otherTitle: 'Ce site en français',
    skip: 'Skip to content'
  },
  hero: {
    title: 'Your rights, your formalities,\nyour services',
    lead: 'Marianne is a citizen assistant for your computer, for people living in France. It helps you understand your rights, prepare your formalities and keep up with your deadlines, with the AI you already have: Claude Code, Codex or Mistral Vibe.',
    placeholder: 'Écrivez à Marianne : une démarche, une question, un document…',
    send: 'envoyer',
    download: { windows: 'Download for Windows', mac: 'Download for Mac', linux: 'Download for Linux', any: 'Download Marianne' },
    sub: 'free · open source · no online account · the app is in French',
    others: 'other systems',
    guide: 'read the guide',
    phone: 'Marianne runs on a computer: Windows, macOS or Linux.'
  },
  screens: {
    title: 'A look inside',
    lead: 'Marianne as you’ll see it: a question asked, your approval sought, your formalities followed, your services at hand.',
    sample: 'sample data',
    prev: 'previous',
    next: 'next',
    items: {
      dossier: {
        tab: 'a folder',
        caption: 'A question, a clear answer. Marianne checks its services and sources, then tells you what to do, and by when.'
      },
      accord: {
        tab: 'your approval',
        caption: 'Marianne fills in the toll website in its browser, with your plate. Before any click that matters, it asks for your approval.'
      },
      demarches: {
        tab: 'your formalities',
        caption: 'Each area of your paperwork has its dashboard: your deadlines, your vehicles, the guided formalities.'
      },
      services: {
        tab: 'your services',
        caption: 'The Services, with their 3615 codes: your free-flow tolls, France in public data, the weather of your commune…'
      }
    }
  },
  features: {
    title: 'What Marianne does',
    lead: 'One window for the paperwork: ask your question the way it comes, Marianne takes care of the rest, with you.',
    items: [
      {
        code: 'DOSSIERS',
        title: 'One subject, one folder',
        text: 'Each question becomes a folder: the conversation, the documents and the steps in one place. Snoozed, it comes back on its own on the day you chose.'
      },
      {
        code: 'DÉMARCHES',
        title: 'Guided formalities',
        text: 'Declaring your income, renewing your ID card, appealing a fine… Marianne walks you through them step by step, from reviewed, sourced guides.'
      },
      {
        code: 'ACCORD',
        title: 'You decide',
        text: 'Anything that changes your profile, fills in a form, signs, pays or sends goes through a card first: Marianne waits for your approval.'
      },
      {
        code: 'NAVIGATEUR',
        title: 'Official sites, together',
        text: 'Marianne opens the formalities’ websites in its own browser. You can take over at any time, and it forgets everything when the archive locks.'
      },
      {
        code: 'ACTUALITÉS',
        title: 'News that matters',
        text: 'Your newspapers’ headlines, the day’s events, and what changes in France: new rules, raised benefits, dates to remember.'
      },
      {
        code: 'ÉCHÉANCES',
        title: 'Your papers, your deadlines',
        text: 'Your documents and profile help prepare your formalities, and Marianne reminds you of what’s coming: a payment, a car inspection, a tax return.'
      }
    ]
  },
  privacy: {
    title: 'Nothing leaves your computer.',
    lead: 'Marianne has no server and no online account. Everything you give it fits in an encrypted archive: a single file, on your disk, that only you can open.',
    points: [
      'An encrypted archive (AES-256-GCM), opened with your passphrase, then with a simple PIN on this computer.',
      'The engine never sees your identifiers: social security number, tax number, name, address, IBAN become tokens.',
      'Tokens turn back into your real values on your screen only.',
      'The code is open, under the MIT license: anyone can check what it does.'
    ],
    screen: 'on your screen',
    engine: 'what the engine receives',
    replay: 'replay'
  },
  engines: {
    title: 'Your AI, your subscription.',
    lead: 'Marianne has no AI of its own: it lends its tools to the one you already have, with your account at its maker. The engine works in an empty folder, with no terminal and no access to your files: it only goes through Marianne.',
    items: [
      { code: 'CL', name: 'Claude Code', maker: 'Anthropic', state: 'ready', note: '' },
      { code: 'CX', name: 'Codex', maker: 'OpenAI', state: 'ready', note: '' },
      { code: 'MI', name: 'Mistral Vibe', maker: 'Mistral', state: 'soon', note: 'not yet tried with a real installation' }
    ],
    install: 'install an engine'
  },
  services: {
    title: 'The Services, code 3615.',
    lead: 'Small public-information tools, with their codes, as in the days of the Minitel. They aren’t tied to a folder, and anyone can write one.',
    items: [
      { code: 'METEO', name: 'Weather', text: 'the weather of your commune, now and over 7 days (Météo-France)' },
      { code: 'PEAGE', name: 'Free-flow tolls', text: 'barrier-free motorways: your trips, the 72-hour deadline, the official payment' },
      { code: 'PARLEMENT', name: 'Parliament', text: 'the National Assembly and the Senate: your representatives, the votes, the agenda, live sittings' },
      { code: 'ANNUAIRE', name: 'Public services directory', text: 'town hall, Caf, CPAM, tax office, courts near you: addresses, hours, phone numbers' },
      { code: 'CARTE', name: 'Map of France', text: 'départements and communes: population, area, density' }
    ],
    yours: { code: 'VOTRE', name: 'Yours?', text: 'services are open modules, built on an SDK: write the one you’re missing', link: 'the services SDK' }
  },
  download: {
    title: 'Download Marianne',
    lead: 'Free and open source. This is an alpha version: thank you for trying it, and for telling us what goes wrong.',
    version: 'version',
    published: 'published on',
    unknown: 'the latest version',
    all: 'all versions',
    detected: 'your system',
    windows: {
      name: 'Windows',
      arch: '64-bit',
      note: 'The program isn’t signed yet: Windows shows “Windows protected your PC”. Click “More info”, then “Run anyway”.'
    },
    mac: {
      name: 'macOS',
      arch: 'Apple silicon or Intel',
      arm: 'Apple silicon',
      intel: 'Intel Mac',
      note: 'The app isn’t notarized yet: on first launch, right-click › Open, or System Settings › Privacy & Security › “Open Anyway”.'
    },
    linux: {
      name: 'Linux',
      arch: '64-bit',
      note: 'The .deb installs and opens archives with a double click. The AppImage runs anywhere: make it executable (chmod +x).'
    },
    engine: {
      title: 'Before you start: an engine',
      text: 'Marianne talks to Claude Code, Codex or Mistral Vibe. Install one, then sign in once with your account, in a terminal.',
      link: 'the installation guide'
    }
  },
  guide: {
    title: 'The guide',
    lead: 'No need to be technical: the guide explains everything, step by step, from installing to your first formalities.',
    open: 'open the guide',
    contents: 'contents',
    edit: 'edit this page',
    prev: 'RETOUR',
    next: 'SUITE',
    back: 'back to the home page'
  },
  bar: { locked: 'nothing leaves your computer', prev: 'previous', next: 'next', top: 'top of the page', help: 'the guide' },
  footer: {
    disclaimer:
      'Marianne is an independent project, not affiliated with the French State or any administration. It helps you understand and prepare your formalities, without replacing the administration or legal advice.',
    code: 'the source code',
    security: 'security',
    license: 'license',
    credit: 'Background: Eugène Delacroix, Liberty Leading the People (1830), Louvre, public domain.',
    issues: 'write to us'
  },
  notFound: {
    title: 'Page not found',
    text: 'The service you asked for doesn’t exist, or no longer does. Back to the contents.',
    home: 'back to the contents'
  }
}

/** Every string of a language; the French ones with their non-breaking spaces. */
export function words(lang: Lang): typeof fr {
  return lang === 'fr' ? deep(fr, nbsp) : en
}

function deep<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as T
  if (Array.isArray(value)) return value.map((v) => deep(v, fn)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deep(v, fn)])) as T
  return value
}

/** The site's paths, under its base (BASE_PATH): url('guide/') is /marianne/guide/. */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
  return base + path.replace(/^\//, '')
}

/** A page's path in a language: the French ones at the root, the others under their code. */
export const localized = (lang: Lang, path = '') => url((lang === 'fr' ? '' : `${lang}/`) + path.replace(/^\//, ''))
