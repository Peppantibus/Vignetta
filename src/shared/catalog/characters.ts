/**
 * Dizionario di personaggi e squadre usato per classificare i fumetti per editore ed eroe.
 *
 * Ogni voce: [id, nome mostrato, nomi con cui compare nei titoli, famiglia]. Si cercano solo i nomi del terzo campo.
 * I nomi vengono confrontati per parole intere, senza maiuscole, accenti e punteggiatura
 * ("Spider-Man" = "spider man"), e in ogni punto del titolo vince il nome più lungo ("Doomsday Clock" è Watchmen,
 * non Doomsday). Comprendono il nome inglese, quello italiano moderno, i nomi storici delle edizioni italiane
 * (Corno, Mondadori, Play Press…), il nome civile e le testate principali.
 *
 * Famiglie: cattivi, spalle e comprimari appartengono a un eroe o a una squadra (i mutanti agli X-Men). Se il fumetto
 * nomina anche l'eroe va solo sotto di lui ("X-Men - La saga di Fenice Nera" non compare anche sotto Jean Grey); se
 * parla solo di loro hanno il proprio riquadro (una raccolta di Harley Quinn resta Harley Quinn, Gatta Nera resta Gatta
 * Nera). Le versioni alternative dell'eroe (Miles Morales, Spider-Man 2099, Batman Beyond…) invece sono suoi alias:
 * vanno sempre sotto di lui. Gli eroi principali (Wolverine, Iron Man, Thor…) non hanno famiglia: due eroi principali
 * danno due riquadri.
 *
 * Fonti per i nomi italiani: glossario Marvel di comicsando.wordpress.com, voci "DC Comics in Italia", "Avversari di
 * Batman", "Avversari di Superman", "Avversari di Flash", "Uomo Ragno", "Categoria:Personaggi degli X-Men",
 * "Teschio Rosso", "Abominio" di it.wikipedia.org e le edizioni Panini attuali.
 *
 * Volutamente esclusi i nomi italiani che sono anche parole comuni (Tempesta, Bestia, Visione, Fenice, La Cosa,
 * Angelo, Avvoltoio, Pinguino, Spaventapasseri, Mandarino, Metallo, Incantatrice…): darebbero troppi falsi positivi.
 * Quei personaggi vengono comunque trovati tramite il nome inglese, il nome civile o la loro squadra.
 */

export type CharacterEntry = readonly [id: string, name: string, aliases: readonly string[], family?: string]

type Member = readonly [id: string, name: string, aliases: readonly string[]]

/** I membri di una famiglia: appartengono all'eroe o alla squadra `parent`. */
function family(parent: string, members: readonly Member[]): CharacterEntry[] {
  return members.map(([id, name, aliases]) => [id, name, aliases, parent])
}

export const MARVEL_CHARACTERS: readonly CharacterEntry[] = [
  // Spider-Man e dintorni
  ['spider-man', 'Spider-Man', [
    'spider-man', 'spiderman', 'uomo ragno', 'peter parker', 'amazing spider-man', 'spectacular spider-man', 'ultimate spider-man',
    'superior spider-man', 'spider-man noir', 'spider-verse', 'ragnoverso', 'spider-geddon',
    // Versioni alternative: sono sempre Spider-Man, anche quando il fumetto parla solo di loro
    'miles morales', 'spider-gwen', 'ghost-spider', 'gwen stacy', 'spider-man 2099', 'spiderman 2099', 'uomo ragno 2099', "miguel o'hara",
    'spider-ham', 'peter porker', 'scarlet spider', 'ragno rosso', 'ben reilly', 'kaine parker'
  ]],
  ...family('spider-man', [
    ['silk', 'Silk', ['cindy moon']],
    ['madame-web', 'Madame Web', ['madame web']],
    ['mary-jane', 'Mary Jane', ['mary jane', 'mary jane watson']],
    ['jonah-jameson', 'J. Jonah Jameson', ['j. jonah jameson', 'jonah jameson', 'daily bugle']],
    ['venom', 'Venom', ['venom', 'eddie brock', 'agent venom', 'agente venom']],
    ['carnage', 'Carnage', ['carnage', 'cletus kasady', 'maximum carnage']],
    ['knull', 'Knull', ['knull']],
    ['black-cat', 'Gatta Nera', ['black cat', 'gatta nera', 'felicia hardy']],
    ['silver-sable', 'Silver Sable', ['silver sable']],
    ['cloak-and-dagger', 'Cloak e Dagger', ['cloak and dagger', 'cloak e dagger', 'cloak & dagger']],
    ['morbius', 'Morbius', ['morbius']],
    ['kraven', 'Kraven', ['kraven', 'kraven il cacciatore', 'kraven the hunter', "l'ultima caccia di kraven"]],
    ['green-goblin', 'Goblin', ['green goblin', 'goblin', 'norman osborn', 'harry osborn']],
    ['hobgoblin', 'Hobgoblin', ['hobgoblin', 'roderick kingsley']],
    ['doctor-octopus', 'Dottor Octopus', ['doctor octopus', 'dottor octopus', 'doc ock', 'otto octavius']],
    ['sinister-six', 'Sinistri Sei', ['sinister six', 'sinistri sei']],
    ['vulture', 'Avvoltoio', ['vulture', 'adrian toomes']],
    ['sandman-marvel', 'Uomo Sabbia', ['uomo sabbia', 'flint marko']],
    ['electro', 'Electro', ['electro', 'elettro', 'max dillon']],
    ['mysterio', 'Mysterio', ['mysterio', 'quentin beck']],
    ['rhino', 'Rhino', ['rhino', 'aleksei sytsevich']],
    ['lizard', 'Lizard', ['lizard', 'curt connors', 'curtis connors']],
    ['scorpion', 'Scorpione', ['mac gargan']],
    ['shocker', 'Shocker', ['shocker', 'herman schultz']],
    ['jackal', 'Sciacallo', ['jackal', 'miles warren']],
    ['hammerhead', 'Testa di Martello', ['hammerhead', 'testa di martello']],
    ['mister-negative', 'Mister Negative', ['mister negative', 'mr. negative']]
  ]),
  ['spider-woman', 'Spider-Woman', ['spider-woman', 'donna ragno', 'jessica drew']],

  // Avengers
  ['avengers', 'Avengers', ['avengers', 'vendicatori', 'i vendicatori', 'new avengers', 'west coast avengers', 'dark avengers', 'secret avengers', 'mighty avengers', 'uncanny avengers', 'avengers academy', 'young avengers', 'giovani vendicatori']],
  ...family('avengers', [
    ['vision', 'Visione', ['the vision']],
    ['quicksilver', 'Quicksilver', ['quicksilver', 'pietro maximoff']],
    ['wonder-man', 'Wonder Man', ['wonder man', 'simon williams']],
    ['mockingbird', 'Mockingbird', ['mockingbird', 'bobbi morse']],
    ['tigra', 'Tigra', ['tigra', 'greer nelson']],
    ['ultron', 'Ultron', ['ultron', 'age of ultron', 'era di ultron']],
    ['kang', 'Kang', ['kang il conquistatore', 'kang the conqueror']],
    ['masters-of-evil', 'Signori del Male', ['masters of evil', 'signori del male']],
    ['squadron-supreme', 'Squadrone Supremo', ['squadron supreme', 'squadrone supremo']]
  ]),
  ['iron-man', 'Iron Man', ['iron man', 'ironman', 'uomo di ferro', 'tony stark', 'invincible iron man']],
  ...family('iron-man', [
    ['war-machine', 'War Machine', ['war machine', 'james rhodes']],
    ['ironheart', 'Ironheart', ['ironheart', 'riri williams']],
    ['pepper-potts', 'Pepper Potts', ['pepper potts']],
    ['iron-monger', 'Iron Monger', ['iron monger', 'obadiah stane']],
    ['mandarin', 'Mandarino', ['the mandarin']],
    ['justin-hammer', 'Justin Hammer', ['justin hammer']]
  ]),
  ['captain-america', 'Capitan America', ['capitan america', 'captain america', 'steve rogers']],
  ...family('captain-america', [
    ['winter-soldier', 'Soldato d’Inverno', ['winter soldier', "soldato d'inverno", 'bucky barnes']],
    ['falcon', 'Falcon', ['sam wilson']],
    ['red-skull', 'Teschio Rosso', ['red skull', 'teschio rosso', 'johann schmidt']],
    ['baron-zemo', 'Barone Zemo', ['baron zemo', 'barone zemo', 'helmut zemo']],
    ['crossbones', 'Crossbones', ['crossbones', 'brock rumlow']],
    ['arnim-zola', 'Arnim Zola', ['arnim zola']],
    ['agent-carter', 'Peggy Carter', ['peggy carter', 'agent carter', 'agente carter', 'sharon carter']]
  ]),
  ['thor', 'Thor', ['thor', 'mighty thor', 'jane foster', 'potente thor']],
  ...family('thor', [
    ['loki', 'Loki', ['loki']],
    ['hela', 'Hela', ['hela']],
    ['valkyrie', 'Valchiria', ['valkyrie', 'brunnhilde']],
    ['beta-ray-bill', 'Beta Ray Bill', ['beta ray bill']],
    ['sif', 'Lady Sif', ['lady sif']],
    ['malekith', 'Malekith', ['malekith']],
    ['gorr', 'Gorr', ['gorr', 'gorr il macellatore di dei', 'gorr the god butcher']]
  ]),
  ['hulk', 'Hulk', ['hulk', 'incredibile hulk', 'incredible hulk', 'immortal hulk', 'hulk grigio', 'bruce banner', 'planet hulk', 'world war hulk', 'amadeus cho', 'totally awesome hulk']],
  ...family('hulk', [
    ['she-hulk', 'She-Hulk', ['she-hulk', 'hulka', 'jennifer walters']],
    ['red-hulk', 'Hulk Rosso', ['red hulk', 'hulk rosso', 'thunderbolt ross']],
    ['abomination', 'Abominio', ['abomination', 'abominio', 'emil blonsky']],
    ['skaar', 'Skaar', ['skaar']]
  ]),
  ['black-widow', 'Vedova Nera', ['black widow', 'vedova nera', 'natasha romanoff', 'natasha romanova']],
  ...family('black-widow', [['yelena-belova', 'Yelena Belova', ['yelena belova']]]),
  ['hawkeye', 'Occhio di Falco', ['hawkeye', 'occhio di falco', 'clint barton', 'kate bishop']],
  ['ant-man', 'Ant-Man', ['ant-man', 'antman', 'uomo formica', 'hank pym', 'scott lang', 'calabrone', 'yellowjacket']],
  ...family('ant-man', [['wasp', 'Wasp', ['wasp', 'janet van dyne']]]),
  ['scarlet-witch', 'Scarlet', ['scarlet witch', 'wanda maximoff', 'strega scarlatta']],
  ['black-panther', 'Pantera Nera', ['black panther', 'pantera nera', "t'challa"]],
  ...family('black-panther', [
    ['shuri', 'Shuri', ['shuri']],
    ['killmonger', 'Killmonger', ['killmonger', 'erik killmonger']],
    ['dora-milaje', 'Dora Milaje', ['dora milaje']]
  ]),
  ['captain-marvel', 'Captain Marvel', ['captain marvel', 'capitan marvel', 'carol danvers', 'mar-vell']],
  ['ms-marvel', 'Ms. Marvel', ['ms. marvel', 'miss marvel', 'kamala khan']],
  ['nick-fury', 'Nick Fury', ['nick fury', 'agents of shield', 'agenti dello shield', 'agents of s.h.i.e.l.d.']],
  ...family('nick-fury', [
    ['maria-hill', 'Maria Hill', ['maria hill']],
    ['phil-coulson', 'Phil Coulson', ['phil coulson']]
  ]),
  ['sentry', 'Sentry', ['sentry']],
  ['thunderbolts', 'Thunderbolts', ['thunderbolts']],
  ['ultimates', 'Ultimates', ['ultimates']],

  // Eroi urbani e mistici
  ['daredevil', 'Daredevil', ['daredevil', 'devil', 'matt murdock']],
  ...family('daredevil', [
    ['elektra', 'Elektra', ['elektra', 'elektra natchios']],
    ['kingpin', 'Kingpin', ['kingpin', 'wilson fisk']],
    ['bullseye', 'Bullseye', ['bullseye']],
    ['typhoid-mary', 'Typhoid Mary', ['typhoid mary']],
    ['karen-page', 'Karen Page', ['karen page']],
    ['foggy-nelson', 'Foggy Nelson', ['foggy nelson']]
  ]),
  ['punisher', 'Punisher', ['punisher', 'punitore', 'frank castle']],
  ['luke-cage', 'Luke Cage', ['luke cage', 'power man', 'heroes for hire']],
  ['iron-fist', 'Iron Fist', ['iron fist', "pugno d'acciaio", 'danny rand']],
  ...family('iron-fist', [
    ['misty-knight', 'Misty Knight', ['misty knight']],
    ['colleen-wing', 'Colleen Wing', ['colleen wing']]
  ]),
  ['jessica-jones', 'Jessica Jones', ['jessica jones', 'alias investigations']],
  ['defenders', 'Difensori', ['defenders', 'difensori']],
  ['moon-knight', 'Moon Knight', ['moon knight', 'marc spector', 'cavaliere della luna']],
  ...family('moon-knight', [['khonshu', 'Khonshu', ['khonshu']]]),
  ['ghost-rider', 'Ghost Rider', ['ghost rider', 'johnny blaze', 'danny ketch', 'robbie reyes']],
  ...family('ghost-rider', [['blackheart', 'Blackheart', ['blackheart']]]),
  ['mephisto', 'Mephisto', ['mephisto']],
  ['blade', 'Blade', ['blade il cacciatore di vampiri', 'blade the vampire hunter', 'blade vampire hunter', 'eric brooks']],
  ['doctor-strange', 'Doctor Strange', ['doctor strange', 'dottor strange', 'dr. strange', 'stephen strange', 'stregone supremo', 'sorcerer supreme']],
  ...family('doctor-strange', [
    ['dormammu', 'Dormammu', ['dormammu']],
    ['baron-mordo', 'Barone Mordo', ['baron mordo', 'barone mordo']]
  ]),
  ['doctor-voodoo', 'Doctor Voodoo', ['doctor voodoo', 'dottor voodoo', 'brother voodoo', 'fratello voodoo']],
  ['man-thing', 'Uomo Cosa', ['man-thing', 'uomo cosa']],
  ['werewolf-by-night', 'Werewolf by Night', ['werewolf by night', 'jack russell']],
  ['deadpool', 'Deadpool', ['deadpool', 'wade wilson', 'lady deadpool']],
  ['shang-chi', 'Shang-Chi', ['shang-chi', 'shang chi']],
  ['america-chavez', 'America Chavez', ['america chavez']],
  ['moon-girl', 'Moon Girl', ['moon girl', 'devil dinosaur', 'lunella lafayette']],
  ['runaways', 'Runaways', ['runaways']],
  ['new-warriors', 'New Warriors', ['new warriors', 'nuovi guerrieri']],
  ['howard-the-duck', 'Howard il Papero', ['howard the duck', 'howard il papero']],
  ['squirrel-girl', 'Squirrel Girl', ['squirrel girl', 'doreen green']],

  // Mutanti: tutti nella famiglia degli X-Men, tranne Wolverine che ha la sua
  ['x-men', 'X-Men', ['x-men', 'xmen', 'uncanny x-men', 'astonishing x-men', 'new x-men', 'all-new x-men', 'x-men blue', 'x-men gold', 'x-men red', 'giant-size x-men', 'excalibur', 'insuperabili x-men', 'incredibili x-men']],
  ...family('x-men', [
    ['x-force', 'X-Force', ['x-force']],
    ['x-factor', 'X-Factor', ['x-factor']],
    ['new-mutants', 'Nuovi Mutanti', ['new mutants', 'nuovi mutanti']],
    ['generation-x', 'Generation X', ['generation x']],
    ['krakoa', 'House of X', ['house of x', 'powers of x', 'krakoa']],
    ['cyclops', 'Ciclope', ['cyclops', 'ciclope', 'scott summers']],
    ['jean-grey', 'Jean Grey', ['jean grey', 'marvel girl', 'dark phoenix', 'fenice nera', 'saga di fenice nera', 'saga della fenice nera']],
    ['storm', 'Tempesta', ['ororo munroe']],
    ['beast', 'Bestia', ['hank mccoy', 'henry mccoy']],
    ['angel', 'Arcangelo', ['archangel', 'warren worthington']],
    ['iceman', 'Uomo Ghiaccio', ['iceman', 'uomo ghiaccio', 'bobby drake']],
    ['nightcrawler', 'Nightcrawler', ['nightcrawler', 'kurt wagner']],
    ['colossus', 'Colosso', ['colossus', 'piotr rasputin', 'peter rasputin']],
    ['rogue', 'Rogue', ['rogue', 'anna marie']],
    ['gambit', 'Gambit', ['gambit', 'remy lebeau']],
    ['kitty-pryde', 'Kitty Pryde', ['kitty pryde', 'shadowcat']],
    ['jubilee', 'Jubilee', ['jubilee', 'jubilation lee']],
    ['psylocke', 'Psylocke', ['psylocke', 'betsy braddock']],
    ['bishop', 'Bishop', ['lucas bishop']],
    ['cable', 'Cable', ['cable', 'nathan summers']],
    ['havok', 'Havok', ['havok', 'alex summers']],
    ['polaris', 'Polaris', ['lorna dane']],
    ['banshee', 'Banshee', ['sean cassidy']],
    ['sunfire', 'Sole Ardente', ['sunfire', 'sole ardente', 'shiro yoshida']],
    ['magik', 'Magik', ['magik', 'illyana rasputin']],
    ['dazzler', 'Dazzler', ['dazzler', 'alison blaire']],
    ['longshot', 'Longshot', ['longshot']],
    ['northstar', 'Northstar', ['northstar', 'jean-paul beaubier']],
    ['emma-frost', 'Emma Frost', ['emma frost', 'regina bianca', 'white queen']],
    ['professor-x', 'Professor X', ['professor x', 'professor xavier', 'professore x', 'charles xavier']],
    ['magneto', 'Magneto', ['magneto', 'erik lehnsherr']],
    ['mystique', 'Mystica', ['mystique', 'mystica', 'raven darkholme']],
    ['juggernaut', 'Fenomeno', ['juggernaut', 'cain marko']],
    ['mister-sinister', 'Mister Sinister', ['mister sinister', 'mr. sinister', 'mister sinistro', 'nathaniel essex']],
    ['apocalypse', 'Apocalisse', ['apocalypse', 'age of apocalypse', 'era di apocalisse', 'en sabah nur']],
    ['onslaught', 'Onslaught', ['onslaught']],
    ['brotherhood', 'Confraternita dei Mutanti', ['brotherhood of mutants', 'brotherhood of evil mutants', 'confraternita dei mutanti', 'confraternita dei mutanti malvagi']],
    ['hellfire-club', 'Club Infernale', ['hellfire club', 'club infernale']]
  ]),
  ['wolverine', 'Wolverine', ['wolverine', 'logan', 'old man logan', 'vecchio logan', 'arma x', 'weapon x']],
  ...family('wolverine', [
    ['x-23', 'X-23', ['x-23', 'laura kinney']],
    ['daken', 'Daken', ['daken']],
    ['sabretooth', 'Sabretooth', ['sabretooth', 'victor creed']],
    ['lady-deathstrike', 'Lady Deathstrike', ['lady deathstrike', 'yuriko oyama']]
  ]),

  // Fantastici Quattro e cosmo
  ['fantastic-four', 'Fantastici Quattro', ['fantastic four', 'fantastic 4', 'fantastici quattro', 'fantastici 4', 'future foundation']],
  ...family('fantastic-four', [
    ['human-torch', 'Torcia Umana', ['human torch', 'torcia umana', 'johnny storm']],
    ['thing', 'La Cosa', ['the thing', 'ben grimm']],
    ['mister-fantastic', 'Mister Fantastic', ['mister fantastic', 'mr. fantastic', 'reed richards']],
    ['invisible-woman', 'Donna Invisibile', ['invisible woman', 'donna invisibile', 'ragazza invisibile', 'sue storm']],
    ['franklin-richards', 'Franklin Richards', ['franklin richards', 'valeria richards']],
    ['doctor-doom', 'Dottor Destino', ['doctor doom', 'dottor destino', 'dr. destino', 'victor von doom']],
    ['galactus', 'Galactus', ['galactus']],
    ['mole-man', 'Uomo Talpa', ['mole man', 'uomo talpa']],
    ['annihilus', 'Annihilus', ['annihilus']],
    ['super-skrull', 'Super-Skrull', ['super-skrull']]
  ]),
  ['silver-surfer', 'Silver Surfer', ['silver surfer', "surfer d'argento", 'norrin radd']],
  ['thanos', 'Thanos', ['thanos', 'infinity gauntlet', "guanto dell'infinito", 'infinity war']],
  ['guardians-of-the-galaxy', 'Guardiani della Galassia', ['guardians of the galaxy', 'guardiani della galassia']],
  ...family('guardians-of-the-galaxy', [
    ['star-lord', 'Star-Lord', ['star-lord', 'peter quill']],
    ['gamora', 'Gamora', ['gamora']],
    ['drax', 'Drax', ['drax il distruttore', 'drax the destroyer']],
    ['rocket-raccoon', 'Rocket Raccoon', ['rocket raccoon']],
    ['groot', 'Groot', ['groot']]
  ]),
  ['adam-warlock', 'Adam Warlock', ['adam warlock']],
  ['nova', 'Nova', ['nova', 'nova corps', 'richard rider', 'sam alexander']],
  ['inhumans', 'Inumani', ['inhumans', 'inumani', 'black bolt', 'freccia nera']],
  ['eternals', 'Eternals', ['eternals']],
  ['namor', 'Namor', ['namor', 'sub-mariner', 'submariner']],
  ['captain-britain', 'Capitan Bretagna', ['captain britain', 'capitan bretagna', 'brian braddock']],
  ['marvel-zombies', 'Marvel Zombies', ['marvel zombies']]
]

export const DC_CHARACTERS: readonly CharacterEntry[] = [
  // Superman e la sua famiglia
  ['superman', 'Superman', ['superman', 'clark kent', 'nembo kid', 'kal-el']],
  ...family('superman', [
    ['supergirl', 'Supergirl', ['supergirl', 'kara zor-el', 'nembo star']],
    ['superboy', 'Superboy', ['superboy', 'conner kent', 'jon kent', 'kon-el']],
    ['power-girl', 'Power Girl', ['power girl']],
    ['steel', 'Steel', ['john henry irons']],
    ['krypto', 'Krypto', ['krypto']],
    ['lois-lane', 'Lois Lane', ['lois lane']],
    ['jimmy-olsen', 'Jimmy Olsen', ['jimmy olsen']],
    ['lex-luthor', 'Lex Luthor', ['lex luthor']],
    ['doomsday', 'Doomsday', ['doomsday', 'morte di superman', 'death of superman']],
    ['brainiac', 'Brainiac', ['brainiac']],
    ['bizarro', 'Bizzarro', ['bizarro', 'bizzarro']],
    ['zod', 'Generale Zod', ['general zod', 'generale zod']],
    ['mxyzptlk', 'Mister Mxyzptlk', ['mxyzptlk', 'mister mxyzptlk', 'mr. mxyzptlk']],
    ['mongul', 'Mongul', ['mongul']],
    ['metallo', 'Metallo', ['john corben']],
    ['parasite', 'Parassita', ['rudy jones']],
    ['cyborg-superman', 'Cyborg Superman', ['cyborg superman', 'hank henshaw']],
    ['eradicator', 'Eradicatore', ['eradicator', 'eradicatore']],
    ['ultra-humanite', 'Ultra-Humanite', ['ultra-humanite']],
    ['superboy-prime', 'Superboy-Prime', ['superboy-prime', 'superboy prime']]
  ]),

  // Batman e la sua famiglia
  ['batman', 'Batman', ['batman', 'bruce wayne', 'uomo pipistrello', 'batman incorporated', 'batman inc', 'batman beyond', 'batman of the future', 'terry mcginnis']],
  ...family('batman', [
    ['robin', 'Robin', ['robin', 'damian wayne', 'tim drake', 'aquilotto']],
    ['nightwing', 'Nightwing', ['nightwing', 'dick grayson']],
    ['red-hood', 'Red Hood', ['red hood', 'cappuccio rosso', 'jason todd']],
    ['batgirl', 'Batgirl', ['batgirl', 'barbara gordon', 'cassandra cain', 'stephanie brown']],
    ['batwoman', 'Batwoman', ['batwoman', 'kate kane']],
    ['huntress', 'Huntress', ['huntress', 'helena bertinelli', 'helena wayne']],
    ['birds-of-prey', 'Birds of Prey', ['birds of prey']],
    ['azrael', 'Azrael', ['azrael', 'jean-paul valley']],
    ['alfred', 'Alfred', ['alfred pennyworth']],
    ['jim-gordon', 'Commissario Gordon', ['commissario gordon', 'commissioner gordon', 'james gordon', 'jim gordon']],
    ['catwoman', 'Catwoman', ['catwoman', 'selina kyle']],
    ['joker', 'Joker', ['joker', 'killing joke']],
    ['harley-quinn', 'Harley Quinn', ['harley quinn', 'harleen quinzel']],
    ['poison-ivy', 'Poison Ivy', ['poison ivy', 'pamela isley']],
    ['batman-who-laughs', 'Batman che ride', ['batman who laughs', 'batman che ride']],
    ['punchline', 'Punchline', ['punchline']],
    ['bane', 'Bane', ['bane']],
    ['riddler', 'Enigmista', ['riddler', 'enigmista', 'edward nygma', 'edward nigma', 'edward nashton']],
    ['two-face', 'Due Facce', ['two-face', 'harvey dent']],
    ['penguin', 'Pinguino', ['penguin', 'oswald cobblepot']],
    ['scarecrow', 'Spaventapasseri', ['scarecrow', 'spauracchio', 'jonathan crane']],
    ['mister-freeze', 'Mister Freeze', ['mister freeze', 'mr. freeze', 'victor fries']],
    ['ras-al-ghul', "Ra's al Ghul", ["ra's al ghul", 'talia al ghul', 'league of assassins', 'lega degli assassini']],
    ['clayface', 'Clayface', ['clayface', 'basil karlo']],
    ['killer-croc', 'Killer Croc', ['killer croc', 'waylon jones']],
    ['mad-hatter', 'Cappellaio Matto', ['jervis tetch']],
    ['hush', 'Hush', ['hush', 'thomas elliot']],
    ['man-bat', 'Man-Bat', ['man-bat', 'kirk langstrom']],
    ['black-mask', 'Maschera Nera', ['black mask', 'roman sionis']],
    ['zsasz', 'Victor Zsasz', ['zsasz', 'victor zsasz']],
    ['hugo-strange', 'Hugo Strange', ['hugo strange']],
    ['court-of-owls', 'Corte dei Gufi', ['court of owls', 'corte dei gufi', 'talon']],
    ['anarky', 'Anarky', ['anarky']],
    ['calendar-man', 'Uomo Calendario', ['calendar man', 'uomo calendario']],
    ['professor-pyg', 'Professor Pyg', ['professor pyg']]
  ]),

  // Justice League: i fondatori sono eroi principali, ciascuno con la sua famiglia
  ['justice-league', 'Justice League', ['justice league', 'justice league of america', 'jla', 'lega della giustizia', 'amici della legge', 'justice league dark', 'justice league international']],
  ['wonder-woman', 'Wonder Woman', ['wonder woman', 'diana prince']],
  ...family('wonder-woman', [
    ['wonder-girl', 'Wonder Girl', ['wonder girl', 'donna troy', 'cassie sandsmark']],
    ['steve-trevor', 'Steve Trevor', ['steve trevor']],
    ['cheetah', 'Cheetah', ['cheetah', 'barbara minerva']]
  ]),
  ['flash', 'Flash', ['flash', 'barry allen', 'wally west', 'jay garrick', 'flashpoint', 'speed force']],
  ...family('flash', [
    ['kid-flash', 'Kid Flash', ['kid flash', 'impulse', 'bart allen']],
    ['reverse-flash', 'Anti-Flash', ['reverse-flash', 'reverse flash', 'anti-flash', 'professor zoom', 'eobard thawne', 'hunter zolomon']],
    ['gorilla-grodd', 'Gorilla Grodd', ['gorilla grodd', 'grodd']],
    ['captain-cold', 'Capitan Cold', ['captain cold', 'capitan cold', 'leonard snart']],
    ['captain-boomerang', 'Capitan Boomerang', ['captain boomerang', 'capitan boomerang', 'digger harkness']],
    ['mirror-master', 'Mirror Master', ['mirror master']],
    ['weather-wizard', 'Mago del Tempo', ['weather wizard', 'mago del tempo', 'mark mardon']],
    ['heat-wave', 'Heat Wave', ['heat wave', 'mick rory']]
  ]),
  ['green-lantern', 'Lanterna Verde', ['green lantern', 'green lantern corps', 'lanterna verde', 'lanterne verdi', 'corpo delle lanterne verdi', 'hal jordan', 'kyle rayner', 'guy gardner', 'john stewart', 'jessica cruz', 'simon baz', 'alan scott', 'blackest night', 'notte più profonda']],
  ...family('green-lantern', [
    ['sinestro', 'Sinestro', ['sinestro', 'sinestro corps']],
    ['red-lanterns', 'Lanterne Rosse', ['red lanterns', 'lanterne rosse', 'atrocitus']],
    ['larfleeze', 'Larfleeze', ['larfleeze']],
    ['parallax', 'Parallax', ['parallax']],
    ['star-sapphire', 'Zaffiro Stellare', ['star sapphire', 'zaffiro stellare', 'carol ferris']],
    ['kilowog', 'Kilowog', ['kilowog']]
  ]),
  ['green-arrow', 'Freccia Verde', ['green arrow', 'freccia verde', 'oliver queen']],
  ...family('green-arrow', [
    ['black-canary', 'Black Canary', ['black canary', 'canarino nero', 'dinah lance']],
    ['arsenal', 'Arsenal', ['red arrow', 'roy harper']]
  ]),
  ['aquaman', 'Aquaman', ['aquaman', 'arthur curry']],
  ...family('aquaman', [
    ['black-manta', 'Black Manta', ['black manta', 'manta nera']],
    ['ocean-master', 'Ocean Master', ['ocean master', 'orm marius']],
    ['aqualad', 'Aqualad', ['aqualad']]
  ]),
  ['martian-manhunter', 'Martian Manhunter', ['martian manhunter', "j'onn j'onzz"]],
  ['cyborg', 'Cyborg', ['victor stone']],
  ['shazam', 'Shazam', ['shazam', 'billy batson']],
  ...family('shazam', [
    ['black-adam', 'Black Adam', ['black adam']],
    ['mary-marvel', 'Mary Marvel', ['mary marvel']]
  ]),
  ['hawkman', 'Hawkman', ['hawkman', 'hawkgirl', 'carter hall']],
  ['the-atom', 'Atom', ['the atom', 'ray palmer', 'ryan choi']],
  ['blue-beetle', 'Blue Beetle', ['blue beetle', 'jaime reyes', 'ted kord']],
  ['booster-gold', 'Booster Gold', ['booster gold']],
  ['firestorm', 'Firestorm', ['firestorm']],
  ['zatanna', 'Zatanna', ['zatanna']],
  ['plastic-man', 'Plastic Man', ['plastic man']],
  ['captain-atom', 'Capitan Atom', ['captain atom', 'capitan atom']],
  ['the-question', 'Question', ['the question', 'vic sage']],
  ['black-lightning', 'Black Lightning', ['black lightning', 'jefferson pierce']],
  ['vixen', 'Vixen', ['vixen']],
  ['red-tornado', 'Red Tornado', ['red tornado']],
  ['doctor-fate', 'Dottor Fate', ['doctor fate', 'dottor fate', 'kent nelson']],
  ['darkseid', 'Darkseid', ['darkseid', 'new gods', 'nuovi dei']],
  ...family('darkseid', [
    ['kalibak', 'Kalibak', ['kalibak']],
    ['female-furies', 'Furie Femminili', ['female furies', 'furie femminili', 'granny goodness']]
  ]),
  ['mister-miracle', 'Mister Miracle', ['mister miracle', 'mr. miracle', 'scott free']],
  ...family('mister-miracle', [['big-barda', 'Big Barda', ['big barda']]]),
  ['lobo', 'Lobo', ['lobo']],

  // Squadre
  ['justice-society', 'Justice Society', ['justice society', 'jsa', 'societa della giustizia']],
  ...family('justice-society', [['stargirl', 'Stargirl', ['stargirl', 'courtney whitmore']]]),
  ['teen-titans', 'Teen Titans', ['teen titans', 'titans', 'giovani titani', 'new teen titans']],
  ...family('teen-titans', [
    ['starfire', 'Starfire', ['starfire', "koriand'r"]],
    ['beast-boy', 'Beast Boy', ['beast boy', 'garfield logan']],
    ['trigon', 'Trigon', ['trigon']],
    ['deathstroke', 'Deathstroke', ['deathstroke', 'slade wilson']]
  ]),
  ['legion', 'Legione dei Super-Eroi', ['legion of super-heroes', 'legione dei super-eroi', 'legione degli ultra eroi']],
  ['suicide-squad', 'Suicide Squad', ['suicide squad', 'task force x']],
  ...family('suicide-squad', [
    ['deadshot', 'Deadshot', ['deadshot', 'floyd lawton']],
    ['amanda-waller', 'Amanda Waller', ['amanda waller']],
    ['king-shark', 'King Shark', ['king shark']],
    ['peacemaker', 'Peacemaker', ['peacemaker']]
  ]),
  ['doom-patrol', 'Doom Patrol', ['doom patrol']],
  ['watchmen', 'Watchmen', ['watchmen', 'doomsday clock', 'before watchmen']],
  ...family('watchmen', [
    ['rorschach', 'Rorschach', ['rorschach']],
    ['doctor-manhattan', 'Dottor Manhattan', ['doctor manhattan', 'dottor manhattan']],
    ['ozymandias', 'Ozymandias', ['ozymandias']],
    ['nite-owl', 'Nite Owl', ['nite owl', 'gufo notturno']],
    ['silk-spectre', 'Spettro di Seta', ['silk spectre', 'spettro di seta']]
  ]),

  // Vertigo, Black Label e personaggi del soprannaturale
  ['sandman', 'Sandman', ['sandman', 'morpheus', 'the dreaming']],
  ['lucifer', 'Lucifer', ['lucifer morningstar']],
  ['hellblazer', 'Hellblazer', ['hellblazer', 'john constantine', 'constantine']],
  ['swamp-thing', 'Swamp Thing', ['swamp thing', 'cosa della palude']],
  ['animal-man', 'Animal Man', ['animal man', 'buddy baker']],
  ['deadman', 'Deadman', ['deadman', 'boston brand']],
  ['phantom-stranger', 'Phantom Stranger', ['phantom stranger', 'straniero fantasma']],
  ['etrigan', 'Etrigan', ['etrigan']],
  ['the-spectre', 'Spettro', ['the spectre', 'jim corrigan']],
  ['preacher', 'Preacher', ['preacher']],
  ['fables', 'Fables', ['fables']],
  ['y-the-last-man', "Y l'ultimo uomo", ['y the last man', "y l'ultimo uomo"]],
  ['transmetropolitan', 'Transmetropolitan', ['transmetropolitan']],
  ['v-for-vendetta', 'V per Vendetta', ['v for vendetta', 'v per vendetta']],
  ['jonah-hex', 'Jonah Hex', ['jonah hex']]
]

/**
 * Luoghi, soprannomi e testate storiche: indicano l'eroe solo se il fumetto non nomina nessun personaggio.
 * "Gotham Central" è Batman, ma "Harley Quinn e le sirene di Gotham" è Harley Quinn, e "Lex Luthor: Uomo d'acciaio"
 * parla di Lex Luthor: un luogo o un soprannome non fanno assorbire i comprimari dall'eroe.
 */
export const HERO_HINTS: Readonly<Record<string, readonly string[]>> = {
  superman: ["uomo d'acciaio", 'man of steel', 'action comics', 'krypton', 'smallville'],
  batman: ['detective comics', 'cavaliere oscuro', 'dark knight', 'gotham', 'arkham', 'batcaverna', 'batcave'],
  'wonder-woman': ['themyscira', 'temiscira'],
  'black-panther': ['wakanda'],
  'doctor-doom': ['latveria'],
  inhumans: ['attilan'],
  darkseid: ['apokolips']
}

/** Frasi da ignorare prima del confronto: contengono il nome di un eroe ma parlano d'altro. */
export const IGNORED_PHRASES: readonly string[] = [
  'flash gordon',
  'flash thompson',
  'blade runner',
  'devil may cry',
  'devilman',
  'gotham central park',
  'robin hood',
  'rogue one',
  'rogue trooper',
  'goblin slayer',
  'terra nova',
  'bossa nova'
]

/**
 * Indizi sull'editore nel titolo o nei metadati: marchi ed editori italiani che hanno pubblicato
 * solo quell'editore. Esclusi quelli ambigui: Panini (Marvel e DC), Star Comics (Marvel 1987-1994,
 * oggi soprattutto manga), Magic Press.
 */
export const PUBLISHER_HINTS = {
  marvel: ['marvel', 'marvel comics', 'marvel italia', 'editoriale corno', 'corno', 'max comics', 'marvel knights', 'marvel max'],
  dc: ['dc', 'dc comics', 'dc black label', 'black label', 'vertigo', 'wildstorm', 'rw lion', 'rw edizioni', 'lion comics', 'planeta deagostini', 'planeta de agostini', 'planeta', 'play press', 'playpress'],
  manga: ['manga', 'planet manga', 'j-pop', 'jpop', 'gp manga', 'goen', 'dynit', 'flashbook', 'hikari', 'shonen jump', 'weekly shonen jump', 'viz media', 'kodansha', 'shueisha', 'shogakukan']
} as const
