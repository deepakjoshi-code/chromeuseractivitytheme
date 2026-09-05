/**
 * taxonomy.js — pure data. No imports, no chrome.*, no side effects.
 *
 * Adding a category here plus a matching entry in themes.js is the ONLY change
 * required to ship a new theme (PRD §8). An integration test enforces that the
 * two files stay in sync.
 *
 * Weights are unitless and relative. Rough calibration:
 *   4  unmistakable ("bachelorette", "kubernetes")
 *   3  strong ("birthday", "snorkeling")
 *   2  supporting ("gift", "resort")
 *   1  weak / only meaningful alongside others ("party", "trip")
 */

export const NEUTRAL = 'neutral';

/** Signal sources and how much we trust each one. */
export const SOURCE_WEIGHTS = {
  query: 1.0,   // the user typed this — stated intent
  host: 0.9,    // strong, stable prior
  title: 0.6,   // descriptive but noisy
  path: 0.3     // weakest; often slugs and ids
};

export const CATEGORIES = {
  celebration: {
    label: 'Celebration',
    keywords: [
      ['birthday', 4], ['bday', 3], ['birthday party', 4], ['party supplies', 4],
      ['cake', 3], ['cupcake', 3], ['birthday cake', 4], ['frosting', 2],
      ['balloons', 3], ['confetti', 3], ['party favors', 4], ['pinata', 4],
      ['anniversary', 3], ['wedding', 3], ['bridal shower', 4], ['baby shower', 4],
      ['bachelorette', 4], ['bachelor party', 4], ['engagement', 2],
      ['graduation', 3], ['celebrate', 2], ['congratulations', 2],
      ['invitations', 2], ['party ideas', 4], ['party theme', 4],
      ['candles', 2], ['gift ideas', 3], ['streamers', 2], ['toast speech', 3]
    ],
    hosts: [['partycity.com', 4], ['evite.com', 4], ['paperlesspost.com', 4], ['zola.com', 3], ['theknot.com', 3]],
    negatives: [['cakephp', 4], ['piece of cake', 2], ['wedding crashers', 3]]
  },

  tropical: {
    label: 'Tropical',
    keywords: [
      ['hawaii', 4], ['hawaiian', 4], ['maui', 4], ['oahu', 4], ['kauai', 4], ['honolulu', 4],
      ['waikiki', 4], ['big island', 3], ['luau', 4], ['leis', 2],
      ['bali', 4], ['fiji', 4], ['tahiti', 4], ['bora bora', 4], ['maldives', 4],
      ['caribbean', 4], ['bahamas', 4], ['jamaica', 3], ['aruba', 4], ['cancun', 4],
      ['tulum', 4], ['phuket', 4], ['seychelles', 4], ['barbados', 4],
      ['snorkeling', 3], ['scuba diving', 3], ['beach resort', 4], ['palm trees', 3],
      ['tropical', 3], ['island vacation', 4], ['beach vacation', 4], ['surfing', 2],
      ['coral reef', 3], ['tiki', 3], ['pina colada', 3], ['sunset cruise', 3],
      ['overwater bungalow', 4], ['all inclusive resort', 4]
    ],
    hosts: [['gohawaii.com', 4], ['hawaiianairlines.com', 4]],
    negatives: [['island deployment', 4], ['island architecture', 4], ['islands framework', 4], ['rhode island', 3], ['long island', 3], ['staten island', 3]]
  },

  vegas: {
    label: 'Neon Nights',
    keywords: [
      ['las vegas', 4], ['vegas', 3], ['the strip', 3], ['casino', 3], ['blackjack', 3],
      ['roulette', 3], ['poker', 2], ['slot machines', 4], ['sportsbook', 3],
      ['nightclub', 3], ['bellagio', 4], ['caesars palace', 4], ['mgm grand', 4],
      ['the venetian', 4], ['aria resort', 4], ['cirque du soleil', 3],
      ['residency show', 3], ['bottle service', 3], ['pool party', 2], ['reno', 2],
      ['atlantic city', 3], ['macau casino', 4], ['vegas shows', 4], ['vegas hotels', 4]
    ],
    hosts: [['vegas.com', 4], ['caesars.com', 3], ['mgmresorts.com', 3]],
    negatives: [['poker face', 3], ['vegas pro', 4], ['sony vegas', 4]]
  },

  coding: {
    label: 'Focus',
    keywords: [
      ['javascript', 3], ['typescript', 3], ['python', 3], ['rust lang', 4], ['golang', 4],
      ['kubernetes', 4], ['docker', 3], ['terraform', 4], ['ansible', 3],
      ['pull request', 4], ['merge conflict', 4], ['git rebase', 4], ['commit', 2],
      ['stack trace', 4], ['segfault', 4], ['null pointer', 4], ['compile error', 4],
      ['api docs', 3], ['rest api', 3], ['graphql', 4], ['webpack', 4], ['vite', 2],
      ['npm install', 4], ['pip install', 4], ['cargo build', 4],
      ['regex', 3], ['async await', 4], ['unit test', 3], ['refactor', 3],
      ['postgres', 3], ['redis', 3], ['sql query', 3], ['localhost', 3],
      ['ci pipeline', 3], ['github actions', 4], ['code review', 3], ['debugger', 3],
      ['react hooks', 4], ['linked list', 3], ['big o', 2], ['leetcode', 4]
    ],
    hosts: [
      ['github.com', 4], ['gitlab.com', 4], ['stackoverflow.com', 4], ['stackexchange.com', 3],
      ['developer.mozilla.org', 4], ['npmjs.com', 4], ['pypi.org', 4], ['crates.io', 4],
      ['docs.python.org', 4], ['kubernetes.io', 4], ['docker.com', 3], ['jira.com', 3],
      ['atlassian.net', 3], ['codepen.io', 3], ['replit.com', 3], ['leetcode.com', 4],
      ['localhost', 4], ['readthedocs.io', 4], ['devdocs.io', 4]
    ],
    negatives: [['python snake', 4], ['ball python', 4], ['ruby jewelry', 4], ['java island', 4]]
  },

  shopping: {
    label: 'Marketplace',
    keywords: [
      ['add to cart', 4], ['checkout', 3], ['free shipping', 4], ['coupon code', 4],
      ['promo code', 4], ['best deals', 3], ['price comparison', 4], ['on sale', 3],
      ['product reviews', 3], ['order tracking', 3], ['return policy', 3],
      ['buy online', 3], ['shopping cart', 4], ['wishlist', 2], ['black friday', 4],
      ['cyber monday', 4], ['clearance', 3], ['discount', 2], ['gift card', 2],
      ['dress', 2], ['sneakers', 3], ['handbag', 3], ['jeans', 2], ['jacket', 2],
      ['womens clothing', 4], ['mens clothing', 4], ['size guide', 3], ['outfit', 2]
    ],
    hosts: [
      ['amazon.com', 3], ['ebay.com', 4], ['etsy.com', 4], ['walmart.com', 3],
      ['target.com', 3], ['aliexpress.com', 4], ['shein.com', 4], ['zara.com', 4],
      ['hm.com', 3], ['nordstrom.com', 4], ['macys.com', 4], ['asos.com', 4],
      ['wayfair.com', 4], ['bestbuy.com', 3], ['shopify.com', 3], ['costco.com', 3]
    ],
    negatives: [['amazon rainforest', 4], ['amazon river', 4], ['amazon web services', 4], ['aws', 3], ['target audience', 3]]
  },

  kids: {
    label: 'Playtime',
    keywords: [
      ['kids clothing', 4], ['childrens clothing', 4], ['toddler', 4], ['nursery', 3],
      ['baby clothes', 4], ['diapers', 4], ['stroller', 4], ['car seat', 3],
      ['toys', 3], ['lego', 3], ['playground', 3], ['coloring pages', 4],
      ['kids shoes', 4], ['school supplies', 4], ['back to school', 4],
      ['kids books', 4], ['bedtime stories', 4], ['nursery rhymes', 4],
      ['playdate', 3], ['daycare', 3], ['preschool', 3], ['kindergarten', 3],
      ['kids party', 4], ['childrens', 2], ['for kids', 3], ['crafts for kids', 4]
    ],
    hosts: [['carters.com', 4], ['lego.com', 4], ['toysrus.com', 4], ['fisher-price.com', 4], ['pbskids.org', 4]],
    negatives: [['kids these days', 2]]
  },

  travel: {
    label: 'Wanderlust',
    keywords: [
      ['flights', 3], ['cheap flights', 4], ['book a flight', 4], ['boarding pass', 3],
      ['hotels', 2], ['airbnb', 3], ['hostel', 3], ['itinerary', 4], ['road trip', 3],
      ['passport', 3], ['visa application', 3], ['travel insurance', 4],
      ['things to do in', 4], ['best time to visit', 4], ['layover', 3],
      ['train tickets', 3], ['car rental', 3], ['travel guide', 4], ['backpacking', 3],
      ['airport', 2], ['tourist attractions', 4], ['sightseeing', 3], ['jet lag', 3]
    ],
    hosts: [
      ['booking.com', 4], ['expedia.com', 4], ['kayak.com', 4], ['airbnb.com', 4],
      ['tripadvisor.com', 4], ['skyscanner.net', 4], ['hotels.com', 4],
      ['google.com/travel', 3], ['lonelyplanet.com', 4], ['united.com', 3], ['delta.com', 3]
    ],
    negatives: [['time travel', 3], ['travelling salesman', 4]]
  },

  food: {
    label: 'Kitchen',
    keywords: [
      ['recipe', 4], ['recipes', 4], ['how to cook', 4], ['baking', 3], ['roast', 2],
      ['dinner ideas', 4], ['meal prep', 4], ['restaurant', 3], ['menu', 2],
      ['ingredients', 3], ['sourdough', 4], ['pasta', 2], ['curry', 3], ['ramen', 3],
      ['grill', 2], ['air fryer', 4], ['slow cooker', 4], ['sous vide', 4],
      ['vegetarian recipes', 4], ['brunch', 3], ['food delivery', 4], ['takeout', 3],
      ['wine pairing', 4], ['cocktail recipe', 4], ['coffee beans', 3], ['espresso', 3]
    ],
    hosts: [
      ['allrecipes.com', 4], ['seriouseats.com', 4], ['bonappetit.com', 4],
      ['foodnetwork.com', 4], ['yelp.com', 3], ['doordash.com', 4],
      ['ubereats.com', 4], ['epicurious.com', 4], ['nytimes.com/cooking', 4]
    ],
    negatives: [['food for thought', 3], ['recipe for disaster', 3]]
  },

  fitness: {
    label: 'Momentum',
    keywords: [
      ['workout', 4], ['gym', 3], ['exercise routine', 4], ['strength training', 4],
      ['marathon training', 4], ['couch to 5k', 4], ['running shoes', 3],
      ['yoga', 3], ['pilates', 4], ['crossfit', 4], ['deadlift', 4], ['squat', 3],
      ['protein', 2], ['macros', 3], ['personal trainer', 4], ['hiit', 4],
      ['stretching', 3], ['cycling', 2], ['swimming laps', 4], ['rest day', 3],
      ['home workout', 4], ['dumbbell', 4], ['kettlebell', 4], ['step count', 3]
    ],
    hosts: [['strava.com', 4], ['myfitnesspal.com', 4], ['bodybuilding.com', 4], ['peloton.com', 4]],
    negatives: [['mental health', 4], ['eating disorder', 4], ['weight loss surgery', 4]]
  },

  music: {
    label: 'Amplify',
    keywords: [
      ['playlist', 3], ['album', 2], ['concert tickets', 4], ['tour dates', 4],
      ['lyrics', 3], ['guitar chords', 4], ['piano tutorial', 4], ['music theory', 4],
      ['vinyl records', 4], ['headphones', 2], ['synthesizer', 4], ['ableton', 4],
      ['music festival', 4], ['live music', 3], ['band', 1], ['drum kit', 3],
      ['bass line', 3], ['mixing and mastering', 4], ['spotify wrapped', 4]
    ],
    hosts: [
      ['spotify.com', 4], ['music.apple.com', 4], ['soundcloud.com', 4],
      ['bandcamp.com', 4], ['genius.com', 3], ['songkick.com', 4],
      ['ticketmaster.com', 3], ['last.fm', 4]
    ],
    negatives: [['rubber band', 3], ['band aid', 3], ['bandwidth', 4]]
  },

  gaming: {
    label: 'Arcade',
    keywords: [
      ['walkthrough', 4], ['speedrun', 4], ['boss fight', 4], ['patch notes', 3],
      ['loadout', 4], ['skill tree', 4], ['open world', 3], ['multiplayer', 3],
      ['nintendo switch', 4], ['playstation', 4], ['xbox', 4], ['steam deck', 4],
      ['minecraft', 4], ['fortnite', 4], ['elden ring', 4], ['zelda', 4],
      ['dungeon', 3], ['esports', 4], ['game review', 4], ['fps game', 4],
      ['controller', 2], ['frame rate', 3], ['modding', 3]
    ],
    hosts: [
      ['steampowered.com', 4], ['twitch.tv', 4], ['ign.com', 4], ['epicgames.com', 4],
      ['gamefaqs.gamespot.com', 4], ['nintendo.com', 4], ['roblox.com', 4], ['itch.io', 4]
    ],
    negatives: [['gambling', 4], ['gaming the system', 3]]
  },

  nature: {
    label: 'Wildwood',
    keywords: [
      ['hiking', 4], ['hiking trails', 4], ['camping', 4], ['national park', 4],
      ['backpacking trail', 4], ['wildlife', 3], ['birdwatching', 4], ['forest', 2],
      ['mountains', 2], ['kayaking', 3], ['stargazing', 4], ['campfire', 3],
      ['trail map', 4], ['yosemite', 4], ['yellowstone', 4], ['appalachian trail', 4],
      ['gardening', 3], ['native plants', 4], ['tent', 2], ['sunrise hike', 4]
    ],
    hosts: [['alltrails.com', 4], ['nps.gov', 4], ['rei.com', 3], ['recreation.gov', 4]],
    negatives: [['nature of the problem', 3], ['human nature', 3]]
  },

  study: {
    label: 'Study Hall',
    keywords: [
      ['study guide', 4], ['flashcards', 4], ['exam prep', 4], ['final exam', 4],
      ['lecture notes', 4], ['homework help', 4], ['thesis', 3], ['dissertation', 4],
      ['citation', 3], ['bibliography', 4], ['practice problems', 4],
      ['online course', 4], ['syllabus', 4], ['tutorial', 2], ['textbook', 3],
      ['sat prep', 4], ['gre prep', 4], ['research paper', 4], ['literature review', 4]
    ],
    hosts: [
      ['coursera.org', 4], ['edx.org', 4], ['khanacademy.org', 4], ['quizlet.com', 4],
      ['scholar.google.com', 4], ['jstor.org', 4], ['arxiv.org', 4], ['chegg.com', 4]
    ],
    negatives: [['case study', 2], ['study shows', 3]]
  },

  work: {
    label: 'Workday',
    keywords: [
      ['meeting notes', 4], ['quarterly review', 4], ['okr', 4], ['roadmap', 3],
      ['stakeholder', 4], ['presentation deck', 4], ['spreadsheet', 3],
      ['project plan', 4], ['standup', 3], ['sprint planning', 4], ['retrospective', 3],
      ['invoice', 3], ['proposal', 2], ['org chart', 4], ['performance review', 3],
      ['calendar invite', 4], ['inbox', 2], ['out of office', 4]
    ],
    hosts: [
      ['docs.google.com', 3], ['slack.com', 4], ['notion.so', 4], ['asana.com', 4],
      ['trello.com', 4], ['linear.app', 4], ['zoom.us', 4], ['office.com', 3],
      ['outlook.office.com', 4], ['mail.google.com', 3], ['calendar.google.com', 4]
    ],
    negatives: [['work out', 3], ['workout', 4], ['how does it work', 3], ['networking cable', 3]]
  },

  seasonal: {
    label: 'Season',
    keywords: [
      ['christmas', 4], ['xmas', 4], ['santa', 3], ['advent calendar', 4],
      ['halloween', 4], ['trick or treat', 4], ['costume ideas', 4], ['pumpkin carving', 4],
      ['thanksgiving', 4], ['diwali', 4], ['hanukkah', 4], ['lunar new year', 4],
      ['easter', 3], ['new years eve', 4], ['holiday decorations', 4],
      ['gift wrapping', 4], ['secret santa', 4], ['holiday cards', 4]
    ],
    hosts: [],
    negatives: [['christmas island', 4]]
  }
};

/**
 * Sensitive patterns — PRD P4 / P9.
 *
 * If any of these match, the pipeline ABORTS. Nothing is scored, buffered, or
 * logged, and the theme falls back to neutral. This list is intentionally broad:
 * a false positive costs a missed theme, a false negative costs the user's trust.
 * There is no UI to disable it.
 */
export const SENSITIVE_PATTERNS = [
  // Health & medical
  /\b(symptom|symptoms|diagnosis|diagnosed|prognosis|biopsy|chemo|chemotherapy|oncology|tumou?r|cancer|carcinoma)\b/,
  /\b(std|sti|hiv|aids|herpes|chlamydia|hepatitis)\b/,
  /\b(pregnan|miscarriage|abortion|fertility|ivf|contracepti|vasectomy|menopause)/,
  /\b(depression|depressed|anxiety|suicide|suicidal|self harm|bipolar|ptsd|panic attack|therapist|psychiatrist|rehab|addiction|alcoholic|overdose)\b/,
  /\b(eating disorder|anorexia|bulimia)\b/,
  /\b(prescription|medication|dosage|side effects|antidepressant|adderall|xanax|opioid)\b/,
  /\b(erectile|viagra|std test|std testing)\b/,
  /\b(doctor near me|urgent care|emergency room|hospital near me|clinic near me)\b/,

  // Finance & legal distress
  /\b(bankrupt|bankruptcy|foreclosure|debt collector|payday loan|credit score|collections agency)\b/,
  /\b(bank account|routing number|account balance|wire transfer|online banking|net banking)\b/,
  /\b(tax return|irs|owe taxes|tax audit)\b/,
  /\b(divorce|custody battle|restraining order|criminal defense|dui lawyer|lawsuit|sue|attorney near me|expungement)\b/,
  /\b(immigration lawyer|deportation|asylum|green card)\b/,

  // Employment
  /\b(job search|job openings|apply for a job|resume template|cover letter|interview questions|laid off|layoffs|unemployment benefits|quit my job|salary negotiation)\b/,

  // Adult & dating
  /\b(porn|xxx|nsfw|nude|nudes|escort|onlyfans|camgirl|hentai|sex video)\b/,
  /\b(dating app|tinder|bumble|hinge|grindr|hookup|dating profile)\b/,

  // Identity, belief, politics
  /\b(coming out|lgbtq support|gender transition|hrt therapy|transgender support)\b/,
  /\b(voting for|vote for|election results|political party|abortion rights|gun control)\b/,
  /\b(convert to|religious conversion|prayer for|confession)\b/,

  // Personal crisis
  /\b(domestic violence|abuse hotline|shelter near me|crisis hotline|grief|funeral|obituary|hospice)\b/
];

/** Hosts that are sensitive regardless of the text on them. */
export const SENSITIVE_HOSTS = [
  'webmd.com', 'mayoclinic.org', 'healthline.com', 'drugs.com', 'goodrx.com',
  'plannedparenthood.org', 'psychologytoday.com', 'betterhelp.com',
  'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'paypal.com', 'venmo.com',
  'coinbase.com', 'robinhood.com', 'creditkarma.com', 'turbotax.com', 'irs.gov',
  'indeed.com', 'linkedin.com', 'glassdoor.com', 'ziprecruiter.com', 'monster.com',
  'pornhub.com', 'xvideos.com', 'onlyfans.com', 'tinder.com', 'bumble.com',
  'ancestry.com', '23andme.com'
];

/** Where to pull a search query from. Longest host match wins. */
export const SEARCH_ENGINES = [
  { host: 'google.com', params: ['q'] },
  { host: 'google.co.uk', params: ['q'] },
  { host: 'google.co.in', params: ['q'] },
  { host: 'bing.com', params: ['q'] },
  { host: 'duckduckgo.com', params: ['q'] },
  { host: 'search.yahoo.com', params: ['p'] },
  { host: 'ecosia.org', params: ['q'] },
  { host: 'brave.com', params: ['q'] },
  { host: 'startpage.com', params: ['query', 'q'] },
  { host: 'youtube.com', params: ['search_query'] },
  { host: 'amazon.com', params: ['k'] },
  { host: 'etsy.com', params: ['q'] },
  { host: 'ebay.com', params: ['_nkw'] },
  { host: 'walmart.com', params: ['q'] },
  { host: 'target.com', params: ['searchTerm'] },
  { host: 'pinterest.com', params: ['q'] },
  { host: 'reddit.com', params: ['q'] },
  { host: 'github.com', params: ['q'] },
  { host: 'stackoverflow.com', params: ['q'] }
];

/** Never classify or theme on these schemes/hosts. */
export const IGNORED_URL_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://',
  'view-source:', 'file://', 'data:', 'blob:', 'javascript:'
];

export const CATEGORY_KEYS = Object.keys(CATEGORIES);
