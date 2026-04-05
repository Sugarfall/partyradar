const PptxGenJS = require('pptxgenjs')
const pptx = new PptxGenJS()

pptx.defineLayout({ name: 'TIKTOK', width: 10.125, height: 18 })
pptx.layout = 'TIKTOK'
pptx.title = 'PartyRadar — 30-Day TikTok Campaign'
pptx.author = 'PartyRadar'

const BG    = '04040d'
const CYAN  = '00e5ff'
const PINK  = 'ff006e'
const GREEN = '00ff88'
const WHITE = 'e0f2fe'
const DIM   = '4a6080'

function addDivider(day) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }

  // Top line
  slide.addShape(pptx.ShapeType.line, {
    x: 0, y: 7.5, w: 10.125, h: 0,
    line: { color: CYAN, width: 2 }
  })

  // DAY XX
  slide.addText('DAY ' + day, {
    x: 0, y: 7.9, w: 10.125, h: 1.8,
    fontSize: 90, fontFace: 'Arial Black', bold: true,
    color: CYAN, align: 'center', valign: 'middle', margin: 0
  })

  // Bottom line
  slide.addShape(pptx.ShapeType.line, {
    x: 0, y: 10.2, w: 10.125, h: 0,
    line: { color: CYAN, width: 2 }
  })

  // Handle
  slide.addText('\u26a1 @partyradar', {
    x: 0, y: 16.8, w: 10.125, h: 0.7,
    fontSize: 14, fontFace: 'Arial', color: CYAN,
    align: 'center', valign: 'top', margin: 0
  })
}

function addHook(hookText, subtext) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }

  // Pink accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y: 2, w: 0.08, h: 4,
    fill: { color: PINK }, line: { color: PINK, width: 0 }
  })

  // Main hook text
  slide.addText(hookText, {
    x: 1, y: 1.8, w: 8.5, h: 6,
    fontSize: 64, fontFace: 'Arial Black', bold: true,
    color: PINK, align: 'left', valign: 'top',
    lineSpacingMultiple: 1.1, margin: 0
  })

  // Subtext
  slide.addText(subtext, {
    x: 1, y: 9, w: 8.5, h: 1.5,
    fontSize: 28, fontFace: 'Arial', italic: true,
    color: WHITE, align: 'left', valign: 'top', margin: 0
  })

  // Lightning top-left
  slide.addText('\u26a1', {
    x: 0.3, y: 0.3, w: 0.8, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: CYAN,
    align: 'left', valign: 'top', margin: 0
  })

  // Handle
  slide.addText('@partyradar', {
    x: 0, y: 16.8, w: 10.125, h: 0.7,
    fontSize: 14, fontFace: 'Arial', color: DIM,
    align: 'center', valign: 'top', margin: 0
  })
}

function addContent(emoji, headline, body) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }

  // Left cyan accent bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.4, y: 1.8, w: 0.07, h: 13,
    fill: { color: CYAN }, line: { color: CYAN, width: 0 }
  })

  // Emoji line
  slide.addText(emoji, {
    x: 0.9, y: 1.9, w: 8.5, h: 1.2,
    fontSize: 40, fontFace: 'Arial',
    color: WHITE, align: 'left', valign: 'top', margin: 0
  })

  // Headline
  slide.addText(headline, {
    x: 0.9, y: 3.2, w: 8.5, h: 1.5,
    fontSize: 38, fontFace: 'Arial Black', bold: true,
    color: CYAN, align: 'left', valign: 'top', margin: 0
  })

  // Body text
  slide.addText(body, {
    x: 0.9, y: 5.2, w: 8.5, h: 9,
    fontSize: 24, fontFace: 'Arial',
    color: WHITE, align: 'left', valign: 'top',
    lineSpacingMultiple: 1.4, margin: 0
  })

  // Lightning top-left
  slide.addText('\u26a1', {
    x: 0.3, y: 0.3, w: 0.8, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: CYAN,
    align: 'left', valign: 'top', margin: 0
  })

  // Handle
  slide.addText('@partyradar', {
    x: 0, y: 16.8, w: 10.125, h: 0.7,
    fontSize: 14, fontFace: 'Arial', color: DIM,
    align: 'center', valign: 'top', margin: 0
  })
}

function addCTA(topLine) {
  const slide = pptx.addSlide()
  slide.background = { color: BG }

  // Top headline
  slide.addText(topLine, {
    x: 0.5, y: 2, w: 9, h: 2,
    fontSize: 44, fontFace: 'Arial Black', bold: true,
    color: PINK, align: 'center', valign: 'middle', margin: 0
  })

  // Divider line
  slide.addShape(pptx.ShapeType.line, {
    x: 0, y: 6.5, w: 10.125, h: 0,
    line: { color: CYAN, width: 1 }
  })

  // JOIN FREE
  slide.addText('JOIN FREE \u2192', {
    x: 0.5, y: 7, w: 9, h: 3,
    fontSize: 80, fontFace: 'Arial Black', bold: true,
    color: GREEN, align: 'center', valign: 'middle', margin: 0
  })

  // LINK IN BIO
  slide.addText('LINK IN BIO', {
    x: 0.5, y: 11, w: 9, h: 1.5,
    fontSize: 36, fontFace: 'Arial',
    color: WHITE, align: 'center', valign: 'middle', margin: 0
  })

  // Handle
  slide.addText('\u26a1 @PARTYRADAR', {
    x: 0.5, y: 14.5, w: 9, h: 1,
    fontSize: 28, fontFace: 'Arial Black',
    color: CYAN, align: 'center', valign: 'middle', margin: 0
  })

  // Lightning top-left
  slide.addText('\u26a1', {
    x: 0.3, y: 0.3, w: 0.8, h: 0.6,
    fontSize: 20, fontFace: 'Arial', color: CYAN,
    align: 'left', valign: 'top', margin: 0
  })
}

// ─── DAY 1 ───
addDivider('01')
addHook("YOU'VE BEEN FINDING\nPARTIES WRONG.", "There's a smarter way.")
addContent('\u26a1', 'PARTYRADAR', 'The only app that shows you live events, secret parties & celebrity sightings.\n\n\u2022 Warehouse raves\n\u2022 Rooftop house parties\n\u2022 Exclusive club nights')
addContent('\ud83c\udf0d', "IT'S A VIBE MAP", "Real parties. Real locations. Real people.\n\nDrop a pin. See what's popping tonight.")
addCTA('STOP MISSING OUT.')

// ─── DAY 2 ───
addDivider('02')
addHook("THERE'S A RAVE\n0.5 MILES FROM YOU.", 'Did you know?')
addContent('\ud83c\udfaf', 'DISCOVER', 'See every event happening near you tonight.\n\n\u2022 Live event feed\n\u2022 Map view\n\u2022 Filter by vibe')
addContent('\ud83d\udd25', 'WAREHOUSE RAVE \u2014 LONDON', 'Club Night \u00b7 Featured\nHosted by Alex Rivera\n\u00a315.00 entry \u00b7 Limited spots left')
addCTA('FIND YOUR NIGHT.')

// ─── DAY 3 ───
addDivider('03')
addHook('THE CELEBRITY RADAR\nIS ACTUALLY INSANE.', 'No, seriously.')
addContent('\ud83d\udce1', 'CELEBRITY RADAR', 'Track when celebrities are spotted at parties near you.\n\n\u2022 Real-time sightings\n\u2022 Confirmed reports\n\u2022 6-hour window')
addContent('\u2b50', 'SPOTTED NEARBY', 'A celebrity was just reported at an event 2 miles away.\n\nBe first. Move fast.')
addCTA('CHECK YOUR RADAR.')

// ─── DAY 4 ───
addDivider('04')
addHook('NOT ALL PARTIES\nARE THE SAME.', 'PartyRadar knows the difference.')
addContent('\ud83c\udfe0', 'HOME PARTY', 'Invite-only. Private address revealed on RSVP.\n\nParty signals: BAR \u00b7 FLOOR \u00b7 FIRE \u00b7 FOOD \u00b7 DJ')
addContent('\ud83c\udfb5', 'CLUB NIGHT vs CONCERT', 'Ticket tiers. Lineup. Stage times.\n\nEverything you need before you decide.')
addCTA('PICK YOUR VIBE.')

// ─── DAY 5 ───
addDivider('05')
addHook('HOST YOUR OWN PARTY\nIN 6 STEPS.', 'No promoter needed.')
addContent('\ud83c\udfaa', 'BECOME A HOST', 'Create your event in minutes.\n\nPick type \u2192 Details \u2192 Location\nCapacity \u2192 Settings \u2192 Publish')
addContent('\ud83d\udcb0', 'SELL TICKETS BUILT-IN', 'No third-party apps.\n5% platform fee.\nPayouts straight to you.')
addCTA('START HOSTING.')

// ─── DAY 6 ───
addDivider('06')
addHook('THE ADDRESS\nIS HIDDEN.', 'Until you\'re approved.')
addContent('\ud83d\udd12', 'INVITE-ONLY EVENTS', 'Hosts control exactly who gets in.\n\n\u2022 RSVP gating\n\u2022 Guest approval\n\u2022 Address revealed post-approval')
addContent('\u2705', 'YOUR GUEST LIST. YOUR RULES.', 'Set capacity. Approve guests.\nScan QR tickets at the door.')
addCTA('HOST SAFELY.')

// ─── DAY 7 ───
addDivider('07')
addHook('THIS WEEK ON\nPARTYRADAR \ud83d\udc40', 'You missed some things.')
addContent('\ud83d\udd25', 'TRENDING THIS WEEK', '\u2022 Warehouse Rave London \u2014 SOLD OUT\n\u2022 Rooftop House Party \u2014 47 RSVPs\n\u2022 Jazz & Soul Night \u2014 Last 10 tickets')
addContent('\ud83d\udcf2', 'NOTIFICATIONS ON?', "We'll alert you when parties drop near you.\n\nSo you never miss again.")
addCTA('TURN ON ALERTS.')

// ─── DAY 8 ───
addDivider('08')
addHook('PARTY 0.5 MILES\nAWAY RIGHT NOW.', 'That\'s a PartyRadar alert.')
addContent('\ud83d\udd14', 'PARTY ALERTS', 'Get notified the second a new event drops near you.\n\n\u2022 Distance-based alerts\n\u2022 Genre/vibe filters\n\u2022 RSVP in one tap')
addContent('\u26a1', 'WAREHOUSE RAVE \u2014 LONDON', '\ud83c\udf89 Party detected near you!\nShoreditch \u00b7 12 spots left\n\n[RSVP NOW]')
addCTA('ENABLE ALERTS.')

// ─── DAY 9 ───
addDivider('09')
addHook('BLAST YOUR PARTY\nTO 2,000 PEOPLE.', 'For \u00a319.99. Hosts, listen up.')
addContent('\ud83d\udce3', 'PUSH BLAST', 'Notify people near your venue instantly.\n\n\u2022 0.5mi \u2014 \u00a31.99 (~50 people)\n\u2022 2mi \u2014 \u00a34.99 (~200 people)\n\u2022 5mi \u2014 \u00a39.99 (~500 people)\n\u2022 City-wide \u2014 \u00a319.99 (~2,000 people)')
addContent('\ud83d\udca5', 'PAY & BLAST', 'Your custom message. Their phones.\n\nWorks for: last-minute drops,\nsold-out warnings, VIP upgrades.')
addCTA('BLAST YOUR EVENT.')

// ─── DAY 10 ───
addDivider('10')
addHook('EVERY CITY.\nEVERY WEEKEND.', 'The world is one big party.')
addContent('\ud83c\udf10', 'THE GLOBE', 'Spin the globe. See live hotspots.\n\nParties pulsing in real time across every city.')
addContent('\ud83d\udccd', 'ZOOM IN. SEE WHAT\'S HAPPENING.', 'From London to New York.\nGlasgow to Ibiza.\n\nYour next adventure is on the map.')
addCTA('EXPLORE THE GLOBE.')

// ─── DAY 11 ───
addDivider('11')
addHook('THE QR SCANNER\nIS BUILT IN.', 'No paper. No apps. No chaos.')
addContent('\ud83d\udcf7', 'SCAN AT THE DOOR', 'Your phone is your guest list.\n\n\u2022 QR code per ticket\n\u2022 Green = valid. Red = denied.\n\u2022 Manual entry fallback')
addContent('\ud83c\udfab', 'CYBER TICKET DESIGN', 'Every ticket has a unique QR code.\nNeon design. Tamper-proof.\n\nLooks incredible on screen.')
addCTA('GO PAPERLESS.')

// ─── DAY 12 ───
addDivider('12')
addHook("GEN Z DOESN'T USE\nFACEBOOK EVENTS.", 'Obviously.')
addContent('\ud83d\udcf2', 'BUILT FOR THE ALGORITHM GENERATION', 'Fast. Visual. Location-aware.\n\nSwipe events like you swipe everything else.')
addContent('\ud83d\udd25', 'THE VIBE ECONOMY IS HERE', 'Dress codes. Party signals. Gender ratio.\n\nKnow what you\'re walking into before you arrive.')
addCTA('JOIN THE GENERATION.')

// ─── DAY 13 ───
addDivider('13')
addHook('SEE THE VIBE\nBEFORE YOU GO.', 'Party signals included.')
addContent('\u26a1', 'PARTY SIGNALS', 'Hosts set:\n\n\u2022 \ud83c\udf78 BAR  \u2022 \ud83d\udd7a FLOOR\n\u2022 \ud83d\udd25 FIRE  \u2022 \ud83c\udf55 FOOD  \u2022 \ud83c\udfa7 DJ\n\nSo you know exactly what to expect.')
addContent('\ud83d\udcca', 'KNOW BEFORE YOU GO', 'Capacity. Dress code. Age restriction.\n\nNo surprises. Just vibes.')
addCTA('CHECK THE SIGNALS.')

// ─── DAY 14 ───
addDivider('14')
addHook('PARTYRADAR VS.\nINSTAGRAM STORIES.', "It's not even close.")
addContent('\u274c', 'INSTAGRAM', "\u2022 Can't find addresses\n\u2022 No ticket sales\n\u2022 No guest lists\n\u2022 No radar\n\u2022 Always behind")
addContent('\u2705', 'PARTYRADAR', '\u2022 Live event map\n\u2022 Built-in ticketing\n\u2022 QR scanning\n\u2022 Celebrity radar\n\u2022 Instant alerts')
addCTA('UPGRADE YOUR NIGHTLIFE.')

// ─── DAY 15 ───
addDivider('15')
addHook("YOUR FRIENDS ARE\nAT A PARTY.", "You just don't know where.")
addContent('\ud83d\ude2d', 'THE FOMO IS REAL', '47 people RSVP\'d to a rooftop party tonight.\nYou weren\'t invited.\n\nBut you could\'ve been.')
addContent('\ud83d\udcf2', 'WITH PARTYRADAR', 'You see every event.\nYou get the invites.\nYou show up.')
addCTA('NEVER MISS AGAIN.')

// ─── DAY 16 ───
addDivider('16')
addHook('THIS HOST SOLD\n200 TICKETS TONIGHT.', 'Using PartyRadar.')
addContent('\ud83c\udf89', 'HOST SPOTLIGHT', 'Club Night. London. 200 capacity.\nPush blasted to 2,000 people nearby.\n\nSold out in 4 hours.')
addContent('\ud83d\udcb0', 'YOUR EVENTS. YOUR MONEY.', 'Set your price.\nKeep 95% of ticket revenue.\nCash out anytime.')
addCTA('BE THE HOST.')

// ─── DAY 17 ───
addDivider('17')
addHook('SEND ONE LINK.\nFILL YOUR GUEST LIST.', 'Invite system built in.')
addContent('\ud83d\udd17', 'INVITE LINKS', 'Generate a private invite link.\nShare it anywhere.\n\nGuest joins. You approve. Simple.')
addContent('\ud83d\udccb', 'GUEST LIST VIEW', 'See everyone who\'s coming.\n\nCONFIRMED \u00b7 PENDING \u00b7 CANCELLED\n\nAll in real time.')
addCTA('BUILD YOUR GUEST LIST.')

// ─── DAY 18 ───
addDivider('18')
addHook('BUILT FOR PEOPLE\nWHO ACTUALLY GO OUT.', 'Not for people who post about going out.')
addContent('\u26a1', 'PARTYRADAR WAS BUILT FOR:', '\u2022 The promoter with 200 regulars\n\u2022 The host who throws legendary house parties\n\u2022 The person who\'s always first on the dance floor')
addContent('\ud83c\udf19', 'YOUR NIGHTLIFE DESERVES BETTER TECH.', 'Real-time. Location-aware. Beautifully dark.\n\nThis is PartyRadar.')
addCTA('JOIN THE MOVEMENT.')

// ─── DAY 19 ───
addDivider('19')
addHook('FREE TO DISCOVER.\nPOWERFUL TO HOST.', 'No catch.')
addContent('\ud83d\udcb8', 'PARTYRADAR PLANS', '\ud83c\udd93 FREE \u2014 Browse & RSVP\n\ud83d\udd35 BASIC \u00a34.99/mo \u2014 Host small events\n\ud83d\udfe3 PRO \u00a39.99/mo \u2014 Unlimited + tickets\n\u2b50 PREMIUM \u00a319.99/mo \u2014 Analytics + spotlight')
addContent('\ud83c\udfaf', 'START FOR FREE.', 'No credit card.\nBrowse events tonight.\n\nUpgrade when you\'re ready to host.')
addCTA('START FREE.')

// ─── DAY 20 ───
addDivider('20')
addHook('WHAT ARE YOU DOING\nTHIS WEEKEND?', 'Because there\'s a lot happening.')
addContent('\ud83d\uddd3\ufe0f', 'THIS WEEKEND ON PARTYRADAR', '\u2022 Friday: Warehouse Rave \u2014 East London\n\u2022 Saturday: Rooftop House Party \u2014 Hackney\n\u2022 Sunday: Jazz & Soul Night \u2014 Soho')
addContent('\ud83c\udfab', 'TICKETS FROM \u00a30 \u2014 \u00a315', 'Some events are free.\nSome are invite-only.\n\nAll of them are on the radar.')
addCTA('PLAN YOUR WEEKEND.')

// ─── DAY 21 ───
addDivider('21')
addHook("THE DARKEST PARTY APP\nYOU'VE EVER SEEN.", "We didn't do plain white.")
addContent('\ud83d\udda4', 'DESIGNED IN THE DARK', '\u2022 Neon cyan on deep black\n\u2022 Glassmorphic cards\n\u2022 Glowing borders\n\u2022 Cyber ticket designs\n\nIt hits different at 2am.')
addContent('\ud83d\udcf1', 'EVERY SCREEN BUILT FOR ATMOSPHERE', 'Sign In \u2192 Discover \u2192 Radar \u2192 Event\n\nBecause your app should match your night.')
addCTA('SEE IT FOR YOURSELF.')

// ─── DAY 22 ───
addDivider('22')
addHook('OPEN THE APP.\nFIND A PARTY. GO.', "It's literally that simple.")
addContent('\ud83c\udfaf', 'THREE TAPS TO YOUR NIGHT', '1. Open PartyRadar\n2. See events near you\n3. RSVP or buy tickets')
addContent('\ud83c\udfd9\ufe0f', 'WORKS IN EVERY CITY', 'London. Glasgow. Manchester.\nEdinburgh. Bristol. Leeds.\n\nAnd everywhere the party finds you.')
addCTA('GET THE APP.')

// ─── DAY 23 ───
addDivider('23')
addHook('TIRED OF PROMOTING\nON INSTAGRAM?', "There's a better way.")
addContent('\ud83c\udfaa', 'PARTYRADAR FOR HOSTS', '\u2022 Create your event in minutes\n\u2022 Set ticket prices and capacity\n\u2022 Blast to thousands nearby\n\u2022 Scan guests at the door')
addContent('\ud83d\udcc8', 'GROW YOUR AUDIENCE', 'Every event builds your following.\n\nYour attendees become your radar community.')
addCTA('START HOSTING FREE.')

// ─── DAY 24 ───
addDivider('24')
addHook('YOU SAW THIS AD.\nYOU GO OUT.', 'So does everyone else on PartyRadar.')
addContent('\ud83d\udd25', 'JOIN 10,000+ PARTY-GOERS', 'People already using PartyRadar to:\n\n\u2022 Find tonight\'s events\n\u2022 Get on guest lists\n\u2022 Track celebrity sightings')
addContent('\u23f0', "PARTIES DON'T WAIT.", 'Every minute you wait is a minute someone else gets your spot.')
addCTA('JOIN NOW. FREE.')

// ─── DAY 25 ───
addDivider('25')
addHook('PRO HOSTS UNLOCK\nTHE WHOLE CITY.', 'PartyRadar Pro.')
addContent('\ud83d\udfe3', 'GO PRO', '\u00a39.99/month. Includes:\n\n\u2022 Unlimited events\n\u2022 Ticket sales (keep 95%)\n\u2022 Celebrity radar access\n\u2022 Priority listing')
addContent('\u2b50', 'OR GO PREMIUM', '\u00a319.99/month. Adds:\n\n\u2022 Full event analytics\n\u2022 Featured placement\n\u2022 Early celebrity radar access\n\u2022 Push blast credits')
addCTA('GO PRO TODAY.')

// ─── DAY 26 ───
addDivider('26')
addHook("THE PARTY DOESN'T WAIT.\nNEITHER SHOULD YOU.", 'PartyRadar.')
addContent('\ud83c\udf19', 'NIGHTLIFE IS A CULTURE.', "It deserves its own platform.\n\nNot a Facebook group.\nNot an Instagram story.\nA real, live, pulsing map.")
addContent('\u26a1', 'THIS IS NIGHTLIFE TECH IN 2025.', 'Real-time. Location-aware.\n\nBuilt for the generation that actually goes out.')
addCTA('BE PART OF IT.')

// ─── DAY 27 ───
addDivider('27')
addHook("DON'T FOLLOW\nTHE PARTY. FIND IT.", 'PartyRadar \u2014 Live Now.')
addContent('\ud83d\udccd', 'LIVE EVENTS NEAR YOU', 'Open the app right now and see:\n\n\u2022 What\'s happening tonight\n\u2022 Who\'s hosting\n\u2022 How many spots are left')
addContent('\ud83c\udfab', 'FREE TO JOIN. EASY TO USE.', 'No credit card.\nNo waiting list.\n\nJust parties.')
addCTA('TAP. JOIN. GO.')

// ─── DAY 28 ───
addDivider('28')
addHook('48 HOURS UNTIL\nTHE WEEKEND.', 'Have you got a plan?')
addContent('\ud83d\uddd3\ufe0f', 'PLAN AHEAD ON PARTYRADAR', "Events post days in advance.\nRSVP early. Get your spot.\n\nDon't be the one scrambling Friday night.")
addContent('\ud83d\udd14', 'SET AN ALERT FOR YOUR CITY', 'Every new event near you\nlands straight in your notifications.')
addCTA('PLAN YOUR WEEKEND NOW.')

// ─── DAY 29 ───
addDivider('29')
addHook('10,000 PEOPLE\nCAN\'T BE WRONG.', 'Join the radar.')
addContent('\u2764\ufe0f', 'WHAT PEOPLE ARE SAYING', '"Found a warehouse rave I never would have known about"\n\n"Sold out my first event in 3 hours"\n\n"The celebrity radar is actually scary accurate"')
addContent('\ud83c\udf0d', 'FROM GLASGOW TO LONDON AND BEYOND', 'PartyRadar is growing city by city.\n\nIs your city on the map yet?')
addCTA('JOIN FREE TODAY.')

// ─── DAY 30 ───
addDivider('30')
addHook('30 DAYS.\nONE MESSAGE:', 'FIND YOUR NIGHT.')
addContent('\u26a1', 'PARTYRADAR', 'The live party discovery platform.\n\nFind events. Host events. Scan tickets.\nTrack celebrities. Get notified.\n\nDO IT ALL.')
addContent('\ud83c\udf19', 'YOUR CITY IS ALIVE TONIGHT.', 'Open the app.\nSee what\'s happening.\nGo.')
addCTA('JOIN FREE. LINK IN BIO.')

// ─── WRITE FILE ───
pptx.writeFile({ fileName: 'C:/Users/Trippy/PartyRadar/marketing/partyradar-30day-tiktok.pptx' })
  .then(() => console.log('Done! File written successfully.'))
  .catch(err => { console.error('Error:', err); process.exit(1) })
