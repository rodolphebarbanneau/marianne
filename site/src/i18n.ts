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
  nav: {
    features: 'Fonctions',
    privacy: 'Vie privée',
    services: 'Services',
    download: 'Télécharger',
    guide: 'Guide',
    manifesto: 'Manifeste',
    about: 'À propos'
  },
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
        code: 'INFOS',
        title: 'Qui en parle, comment ils titrent',
        text: '3615 INFOS rassemble les titres de vos journaux en sujets, chaque source à la couleur de sa ligne éditoriale. L’article se lit chez le journal, et le choix de vos sources reste sur votre ordinateur.'
      },
      {
        code: 'ÉCHÉANCES',
        title: 'Vos échéances, des tâches qui reviennent',
        text: 'Marianne vous rappelle ce qui arrive : un paiement, un contrôle technique, une déclaration. Une tâche planifiée revient à son jour, pour un rappel ou une vérification qu’elle fait pour vous, comme les péages à payer : elle regarde et vous prévient, elle ne paie jamais.'
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
      {
        code: 'CL',
        name: 'Claude Code',
        maker: 'Anthropic',
        href: 'https://claude.com/product/claude-code',
        plan: 'compris dans un abonnement Claude payant (Pro, Max…), ou avec un compte Claude Console',
        state: 'ready',
        note: ''
      },
      {
        code: 'CX',
        name: 'Codex',
        maker: 'OpenAI',
        href: 'https://chatgpt.com/codex',
        plan: 'Codex fait partie de ChatGPT : il est compris dans votre offre ChatGPT, avec des limites selon l’offre',
        state: 'ready',
        note: ''
      },
      {
        code: 'MI',
        name: 'Mistral Vibe',
        maker: 'Mistral AI',
        href: 'https://mistral.ai/products/vibe',
        plan: 'compris dans votre offre Mistral, gratuite ou Pro, avec des limites selon l’offre',
        state: 'soon',
        note: 'pas encore essayé avec une vraie installation'
      }
    ],
    install: 'installer un moteur'
  },
  services: {
    title: 'Les Services, code 3615.',
    lead: 'Des petits outils d’information publique, avec leurs codes, comme au temps du Minitel. Ils ne sont rattachés à aucun dossier, et chacun peut écrire le sien.',
    items: [
      { code: 'METEO', name: 'Météo', text: 'le temps de votre commune, maintenant, heure par heure et sur 15 jours (Météo-France)' },
      { code: 'PEAGE', name: 'Péage en flux libre', text: 'les autoroutes sans barrière : vos trajets, l’échéance de 72 heures, le paiement officiel' },
      { code: 'INFOS', name: 'Les infos', text: 'l’actualité de vos sources, regroupée en sujets : qui en parle, comment chacun titre' },
      {
        code: 'PARLEMENT',
        name: 'Parlement',
        text: 'l’Assemblée nationale et le Sénat : vos élus, les scrutins, l’agenda, les séances en vidéo et en direct'
      },
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
  manifesto: {
    title: 'Manifeste',
    description: 'Pourquoi nous faisons Marianne : vos droits et vos démarches au même endroit, sur votre ordinateur, chiffrés, sous votre contrôle.',
    heading: 'Vos droits, sans le labyrinthe.',
    lead: 'Nous faisons Marianne parce qu’en France, faire valoir ses droits ne devrait pas demander de connaître le bon site, le bon formulaire et le bon guichet. Voici ce que nous croyons, et ce que nous en faisons.',
    sections: [
      {
        title: 'Plus de mille sites',
        text: [
          'Vos impôts sont sur un site, votre santé sur un autre, vos allocations sur un troisième. Votre retraite, votre carte grise, votre logement, votre mairie : chacun le sien. Les informations et les données des citoyens français sont dispersées sur plus de mille sites publics, chacun avec son compte, ses mots et ses délais.',
          'Chacun de ces sites, pris seul, rend service. Ensemble, ils forment un labyrinthe. Pour faire valoir un droit, il faut d’abord savoir qu’il existe, puis savoir à quelle porte frapper. Beaucoup s’y perdent, se heurtent à un mur, ou renoncent. Ce n’est pas une question d’effort : c’est une question d’architecture.'
        ]
      },
      {
        title: 'Tout au même endroit',
        text: [
          'Marianne rassemble ce qui est dispersé. Vos papiers, vos échéances, vos démarches et l’information publique utile tiennent au même endroit : sur votre ordinateur.',
          'Elle ne remplace pas les sites de l’administration, et ce n’est pas un navigateur de plus : c’est un agrégateur. Elle sait où aller, ouvre le bon site au bon moment par des liens intégrés, prépare ce qui peut l’être et automatise vos échanges avec les services publics et l’État, là où c’est possible. Le dernier mot, celui qui signe, paie ou envoie, reste le vôtre.'
        ]
      },
      {
        title: 'Comprendre, sans chercher',
        text: [
          'Chaque citoyen devrait pouvoir accéder à ses données, comprendre ses droits et ses démarches, sans avoir à savoir où aller. Avec Marianne, vous posez la question comme elle vient, avec vos mots. Elle cherche dans les sources officielles, vous explique ce qui s’applique à vous, et vous dit quoi faire, et avant quand.',
          'Les démarches guidées vous mènent pas à pas. Les échéances viennent à vous, au lieu que vous couriez après elles.'
        ]
      },
      {
        title: 'Chez vous, et nulle part ailleurs',
        text: [
          'Rassembler des données aussi personnelles n’a de sens que dans une architecture à la hauteur. Marianne n’a pas de serveur. Tout ce que vous lui confiez tient dans une archive chiffrée, sur votre ordinateur, que vous êtes la seule personne à pouvoir ouvrir. Pas de compte en ligne, pas de base centrale à pirater, rien à revendre. Nous-mêmes ne pouvons pas la lire.'
        ]
      },
      {
        title: 'L’IA ne voit que des jetons',
        text: [
          'Marianne travaille avec l’IA que vous avez déjà, Claude Code, Codex ou Mistral Vibe, et avec votre abonnement. Mais votre numéro de sécurité sociale, votre numéro fiscal, votre nom, votre adresse ou votre IBAN ne lui sont jamais montrés : elle ne voit que des jetons, que Marianne remet en clair sur votre écran, et seulement là.'
        ]
      },
      {
        title: 'Vous décidez, toujours',
        text: [
          'Une IA peut aider. Elle ne décide pas à votre place. Rien ne change votre profil, ne remplit un formulaire, ne signe, ne paie ni n’envoie sans votre accord, donné sur une carte qui vous montre tout.'
        ]
      },
      {
        title: 'Ouvert, et vérifiable',
        text: [
          'La confiance ne se décrète pas : elle se vérifie. Le code de Marianne est ouvert, sous licence MIT : chacun peut lire ce qu’il fait, le vérifier et l’améliorer. Les démarches et les guides sont relus, et chacun de leurs faits renvoie à une source officielle.'
        ]
      },
      {
        title: 'Indépendante',
        text: [
          'Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration. Elle porte le nom de la République parce qu’elle sert ses citoyens, pas parce qu’elle parle en son nom.'
        ]
      }
    ],
    end: {
      title: 'Les services publics sont à nous tous.',
      text: [
        'Il y a plus de quarante ans, le Minitel faisait entrer des services dans des millions de foyers, avec un code et un écran. Marianne en garde l’esprit : les services publics à portée de main, pour tout le monde. Cette fois, vos données restent chez vous.'
      ]
    },
    signed: 'les auteurs de Marianne',
    download: 'télécharger Marianne',
    guide: 'lire le guide',
    code: 'lire le code'
  },
  about: {
    title: 'À propos',
    description: 'Marianne, l’assistant citoyen sur votre ordinateur : ce qu’elle est, qui la fait, et sous quelle licence.',
    heading: 'À propos de Marianne',
    lead: 'Marianne est un assistant citoyen pour votre ordinateur : vos droits, vos démarches, vos papiers et vos échéances, et l’information publique utile, au même endroit.',
    app: {
      title: 'L’application',
      text: [
        'Marianne est une application de bureau pour Windows, macOS et Linux, gratuite et open source. Elle travaille avec votre propre moteur d’IA, Claude Code, Codex ou Mistral Vibe, à travers ses seuls outils, et garde tout ce que vous lui confiez dans une archive chiffrée, sur votre ordinateur. Elle n’a ni serveur ni compte en ligne.',
        'C’est une version alpha : elle sert à trouver ce qui ne va pas avant une vraie sortie. L’application est en français.'
      ]
    },
    independent: {
      title: 'Un projet indépendant',
      text: [
        'Marianne est un projet indépendant, sans lien avec l’État ni avec aucune administration. Elle aide à comprendre et à préparer vos démarches, sans remplacer l’administration ni un conseil juridique. Les démarches se font sur les sites officiels, avec votre accord.'
      ]
    },
    authors: {
      title: 'Les auteurs',
      lead: 'Marianne est écrite par ses contributeurs, au grand jour, sur GitHub :',
      text: [
        'Rodolphe Barbanneau l’a créée et la maintient : il relit les changements et publie les versions.',
        'Chacun peut y prendre part : signaler un problème, proposer une idée, corriger une démarche, traduire le guide ou écrire un service 3615.'
      ],
      all: 'les contributeurs sur GitHub',
      contribute: 'contribuer'
    },
    license: {
      title: 'Licence et crédits',
      text: [
        'Le code est sous licence MIT (© 2026 Rodolphe Barbanneau) : chacun peut le lire, le réutiliser et le modifier.',
        'En fond de page : Eugène Delacroix, La Liberté guidant le peuple (1830), musée du Louvre, domaine public. Polices : VT323 et JetBrains Mono, sous licence SIL Open Font.'
      ]
    },
    why: 'Pourquoi nous la faisons : le manifeste'
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
  nav: {
    features: 'Features',
    privacy: 'Privacy',
    services: 'Services',
    download: 'Download',
    guide: 'Guide',
    manifesto: 'Manifesto',
    about: 'About'
  },
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
        code: 'INFOS',
        title: 'Who covers it, how they headline it',
        text: '3615 INFOS gathers your newspapers’ headlines into subjects, each source in the colour of its editorial line. The article is read at the newspaper, and your choice of sources stays on your computer.'
      },
      {
        code: 'ÉCHÉANCES',
        title: 'Your deadlines, tasks that come back',
        text: 'Marianne reminds you of what’s coming: a payment, a car inspection, a tax return. A planned task comes back on its day, for a reminder or a check it makes for you, like unpaid tolls: it looks and tells you, it never pays.'
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
      {
        code: 'CL',
        name: 'Claude Code',
        maker: 'Anthropic',
        href: 'https://claude.com/product/claude-code',
        plan: 'included in a paid Claude plan (Pro, Max…), or with a Claude Console account',
        state: 'ready',
        note: ''
      },
      {
        code: 'CX',
        name: 'Codex',
        maker: 'OpenAI',
        href: 'https://chatgpt.com/codex',
        plan: 'Codex is part of ChatGPT: it is included in your ChatGPT plan, with limits that depend on the plan',
        state: 'ready',
        note: ''
      },
      {
        code: 'MI',
        name: 'Mistral Vibe',
        maker: 'Mistral AI',
        href: 'https://mistral.ai/products/vibe',
        plan: 'included in your Mistral plan, Free or Pro, with limits that depend on the plan',
        state: 'soon',
        note: 'not yet tried with a real installation'
      }
    ],
    install: 'install an engine'
  },
  services: {
    title: 'The Services, code 3615.',
    lead: 'Small public-information tools, with their codes, as in the days of the Minitel. They aren’t tied to a folder, and anyone can write one.',
    items: [
      { code: 'METEO', name: 'Weather', text: 'the weather of your commune, now, hour by hour and over 15 days (Météo-France)' },
      { code: 'PEAGE', name: 'Free-flow tolls', text: 'barrier-free motorways: your trips, the 72-hour deadline, the official payment' },
      { code: 'INFOS', name: 'The news', text: 'the news of your sources, grouped into subjects: who covers it, how each one headlines it' },
      {
        code: 'PARLEMENT',
        name: 'Parliament',
        text: 'the National Assembly and the Senate: your representatives, the votes, the agenda, the sittings on video and live'
      },
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
  manifesto: {
    title: 'Manifesto',
    description: 'Why we make Marianne: your rights and formalities in one place, on your computer, encrypted, under your control.',
    heading: 'Your rights, without the maze.',
    lead: 'We make Marianne because, in France, standing up for your rights shouldn’t mean knowing the right website, the right form and the right office. Here is what we believe, and what we do about it.',
    sections: [
      {
        title: 'More than a thousand sites',
        text: [
          'Your taxes are on one site, your health on another, your benefits on a third. Your pension, your car registration, your housing, your town hall: each has its own. The information and data of French citizens are scattered across more than a thousand public websites, each with its own account, its own words and its own deadlines.',
          'Each of these sites, on its own, does its job. Together, they make a maze. To claim a right, you first have to know it exists, then which door to knock on. Many people get lost, hit a wall, or give up. It isn’t a matter of effort: it’s a matter of architecture.'
        ]
      },
      {
        title: 'Everything in one place',
        text: [
          'Marianne brings together what is scattered. Your papers, your deadlines, your formalities and the public information you need sit in one place: on your computer.',
          'It doesn’t replace the administration’s websites, and it isn’t one more browser: it is an aggregator. It knows where to go, opens the right site at the right moment through integrated links, prepares what can be prepared, and automates your dealings with public services and the State where it can. The last word, the one that signs, pays or sends, stays yours.'
        ]
      },
      {
        title: 'Understand, without searching',
        text: [
          'Every citizen should be able to reach their own data and understand their rights and formalities, without having to know where to go. With Marianne, you ask your question as it comes, in your own words. It searches the official sources, explains what applies to you, and tells you what to do, and by when.',
          'Guided formalities take you through, step by step. Deadlines come to you, instead of you chasing them.'
        ]
      },
      {
        title: 'At home, and nowhere else',
        text: [
          'Bringing such personal data together only makes sense in an architecture that lives up to it. Marianne has no server. Everything you give it fits in an encrypted archive, on your computer, that only you can open. No online account, no central database to breach, nothing to sell. Not even we can read it.'
        ]
      },
      {
        title: 'The AI only sees tokens',
        text: [
          'Marianne works with the AI you already have, Claude Code, Codex or Mistral Vibe, on your own subscription. But your social security number, tax number, name, address or IBAN are never shown to it: it only sees tokens, which Marianne turns back into your real values on your screen, and only there.'
        ]
      },
      {
        title: 'You decide, always',
        text: [
          'An AI can help. It doesn’t decide for you. Nothing changes your profile, fills in a form, signs, pays or sends without your approval, given on a card that shows you everything.'
        ]
      },
      {
        title: 'Open, and verifiable',
        text: [
          'Trust isn’t declared: it’s checked. Marianne’s code is open, under the MIT license: anyone can read what it does, check it and improve it. The formalities and guides are reviewed, and each of their facts points to an official source.'
        ]
      },
      {
        title: 'Independent',
        text: [
          'Marianne is an independent project, not affiliated with the French State or any administration. It bears the Republic’s name because it serves its citizens, not because it speaks for it.'
        ]
      }
    ],
    end: {
      title: 'Public services belong to all of us.',
      text: [
        'More than forty years ago, the Minitel brought services into millions of French homes, with a code and a screen. Marianne keeps its spirit: public services within reach, for everyone. This time, your data stays with you.'
      ]
    },
    signed: 'the authors of Marianne',
    download: 'download Marianne',
    guide: 'read the guide',
    code: 'read the code'
  },
  about: {
    title: 'About',
    description: 'Marianne, the citizen assistant on your computer: what it is, who makes it, and under which license.',
    heading: 'About Marianne',
    lead: 'Marianne is a citizen assistant for your computer, for people living in France: your rights, your formalities, your papers and deadlines, and useful public information, in one place.',
    app: {
      title: 'The app',
      text: [
        'Marianne is a desktop app for Windows, macOS and Linux, free and open source. It works with your own AI engine, Claude Code, Codex or Mistral Vibe, through its own tools only, and keeps everything you give it in an encrypted archive, on your computer. It has no server and no online account.',
        'This is an alpha version: it’s here to find what’s wrong before a real release. The app is in French.'
      ]
    },
    independent: {
      title: 'An independent project',
      text: [
        'Marianne is an independent project, not affiliated with the French State or any administration. It helps you understand and prepare your formalities, without replacing the administration or legal advice. Formalities are done on the official websites, with your approval.'
      ]
    },
    authors: {
      title: 'The authors',
      lead: 'Marianne is written by its contributors, in the open, on GitHub:',
      text: [
        'Rodolphe Barbanneau created it and maintains it: he reviews the changes and publishes the releases.',
        'Anyone can take part: report a problem, suggest an idea, correct a formality, translate the guide or write a 3615 service.'
      ],
      all: 'the contributors on GitHub',
      contribute: 'contribute'
    },
    license: {
      title: 'License and credits',
      text: [
        'The code is under the MIT license (© 2026 Rodolphe Barbanneau): anyone may read it, reuse it and change it.',
        'In the background: Eugène Delacroix, Liberty Leading the People (1830), Louvre, public domain. Fonts: VT323 and JetBrains Mono, under the SIL Open Font License.'
      ]
    },
    why: 'Why we make it: the manifesto'
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
