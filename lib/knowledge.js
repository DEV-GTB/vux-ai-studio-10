// ============================================================================
// India & Kerala knowledge pack
// ----------------------------------------------------------------------------
// IMPORTANT: this is "knowledge injection", not model retraining. Hosted model
// weights (Gemini, etc.) cannot be fine-tuned from this app. Instead this
// curated, appendable pack is added to the assistant's system context so its
// answers about India and Kerala are grounded and consistent.
//
// To "teach" the assistant more: add facts below and bump KNOWLEDGE_LAST_UPDATED.
// Keep facts general and verifiable. Do not add time-sensitive claims (scores,
// prices, live events) unless a data source is wired in.
// ============================================================================

export const KNOWLEDGE_LAST_UPDATED = '2026-10-11';

export const INDIA_KNOWLEDGE_PROMPT = `
=== REGIONAL KNOWLEDGE PACK: INDIA & KERALA (last reviewed ${KNOWLEDGE_LAST_UPDATED}) ===
Use this to answer questions about India and its states, with a focus on Kerala.
Prefer these facts when relevant. If a detail is not covered here or is
time-sensitive (live scores, prices, current office-holders, breaking news),
say you are not certain and suggest verifying with a current official source.
Never invent places, nicknames, or history that is not listed here.

--- INDIA OVERVIEW ---
- Official name: Republic of India (Bharat). Capital: New Delhi.
- Largest city: Mumbai. Currency: Indian Rupee (INR). National animal: Bengal tiger; national bird: Indian peafowl; national flower: lotus; national fruit: mango; national tree: banyan.
- Government: federal parliamentary democratic republic. About 28 states and 8 union territories.
- Common nicknames for India: "Incredible India", "Land of Diversity", "Land of Festivals", "Land of Spices", "Union of States", "Subcontinent", "Mother India (Bharat Mata)", "Vishwaguru" (guide of the world), "Country of a Billion Dreams".
- Iconic landmarks: Taj Mahal (Agra), Red Fort and India Gate (Delhi), Qutub Minar (Delhi), Gateway of India (Mumbai), Charminar (Hyderabad), Golden Temple (Amritsar), Hawa Mahal (Jaipur), Mysore Palace, Sun Temple (Konark), Meenakshi Amman Temple (Madurai), Lotus Temple (Delhi), Statue of Unity (Gujarat, world's tallest statue at ~182 m).
- Languages: Hindi and English are used for official central purposes; 22 scheduled languages; hundreds of spoken languages.

--- INDIAN STATE NICKNAMES (common, not exhaustive) ---
- Kerala: "God's Own Country"; also "Land of Spices", "Land of Backwaters".
- Tamil Nadu: "Land of Temples".
- Karnataka: "One State, Many Worlds".
- Andhra Pradesh & Telangana region: "Rice Bowl of India"; Hyderabad: "City of Pearls" (Land of Nizams).
- Goa: "Pearl of the Orient"; "Land of Beaches".
- Maharashtra: "Land of Warriors"; "Gateway of India".
- Gujarat: "Jewel of Western India"; "Land of the Legends".
- Rajasthan: "Land of Kings"; "Desert State"; "Land of Palaces".
- Punjab: "Land of Five Rivers"; "Land of Gurus".
- Haryana: "Land of Rotis"; known as a sports powerhouse.
- Himachal Pradesh and Uttarakhand: "Dev Bhoomi" (Land of Gods).
- Jammu & Kashmir: "Paradise on Earth".
- Uttar Pradesh: "Heartland of India"; Lucknow "City of Nawabs".
- Bihar: "Cradle of Civilization".
- Jharkhand: "Land of Forests".
- Chhattisgarh: "Rice Bowl of central India".
- Madhya Pradesh: "Heart of India".
- Odisha: "Soul of India"; "Land of Temples".
- West Bengal: "Cultural Capital of India".
- Assam: "Land of Tea"; "Gateway to North-East India".
- Arunachal Pradesh: "Land of the Rising Sun".
- Meghalaya: "Abode of Clouds".
- Nagaland: "Land of Festivals".
- Manipur: "Jewel of India".
- Mizoram: "Land of Hills".
- Tripura: "Land of Palaces".
- Sikkim: "Land of Monasteries"; an organic-farming state.
- Delhi (UT): "Dilwalon ki Dilli" (City of the Big-hearted); the national capital.

--- KERALA OVERVIEW ---
- Location: south-western coast of India, along the Malabar Coast and the Arabian Sea. Capital: Thiruvananthapuram (Trivandrum).
- Nicknames: "God's Own Country" (tourism branding), "Land of Spices", "Land of Backwaters", "Coconut Country", "Venice of the East" (for Alappuzha's canals).
- Language: Malayalam (official). English is widely used.
- Commonly cited facts: among India's most literate states (around 96%), high human-development indicators, and a major producer of coconut, rubber, pepper, cardamom and other spices.
- 14 districts: Thiruvananthapuram, Kollam, Pathanamthitta, Alappuzha, Kottayam, Idukki, Ernakulam, Thrissur, Palakkad, Malappuram, Kozhikode, Wayanad, Kannur, Kasaragod.

--- KERALA PLACES & HIGHLIGHTS ---
- Kochi (Cochin): historic port; Chinese fishing nets, Fort Kochi, Mattancherry Palace (Dutch Palace), Jew Town and Paradesi Synagogue, Kathakali performances, Kochi-Muziris Biennale.
- Alappuzha (Alleppey): backwater houseboat cruises; called the "Venice of the East"; Nehru Trophy snake-boat race (Vallam Kali).
- Munnar: hill station in Idukki known for tea plantations, Eravikulam National Park (Nilgiri tahr), Anamudi peak (highest in South India).
- Thekkady / Periyar: Periyar Wildlife Sanctuary and Periyar Lake (boating, elephants, tigers).
- Thiruvananthapuram: Padmanabhaswamy Temple (famed as one of the wealthiest temples), Kovalam and Varkala beaches, Napier Museum, Kanakakunnu Palace.
- Athirappilly Falls: large waterfall in Thrissur district, called the "Niagara of India".
- Silent Valley National Park (Palakkad): rainforest reserve and biodiversity hotspot.
- Sabarimala (Pathanamthitta): hill shrine of Lord Ayyappa, one of the world's largest annual pilgrimages.
- Silent-to-known pilgrim/temple sites: Guruvayur Temple; Sree Padmanabhaswamy; Sabarimala; Attukal Temple (Thiruvananthapuram, "Sabarimala of Women").
- Wayanad: misty hills, Edakkal Caves, wildlife and tribal heritage.
- Bekal Fort (Kasaragod): largest fort in Kerala, on the Arabian Sea.
- Kannur: Theyyam rituals and handloom (Kannur), Malabar culture.
- Kottayam: letter-box city; close to Kumarakom bird sanctuary and Vembanad Lake.
- Thrissur: cultural capital of Kerala; Thrissur Pooram festival; Vadakkunnathan Temple.

--- KERALA CULTURE, FESTIVALS & FEATURES ---
- Onam: the main harvest festival (August-September), with Pookalam (flower carpets), Onam Sadya (feast), and Vallam Kali snake-boat races. Recalls the legendary king Mahabali.
- Other festivals: Vishu (Malayali new year), Thrissur Pooram, Theyyam season (north Kerala), Attukal Pongala, Christmas and Eid (Kerala has large Christian and Muslim communities).
- Art forms: Kathakali (dance-drama), Mohiniyattam, Theyyam, Kalaripayattu (ancient martial art), Koodiyattam (UNESCO-recognised), Padayani.
- Tourism highlights: houseboats and backwaters, Ayurveda retreats, monsoon tourism, hill stations, beaches.
- Food: Kerala Sadya (banana leaf feast), appam with stew, puttu and kadala curry, Kerala parotta with beef/chicken, fish molee, Malabar biryani, idiyappam, avial, thoran, payasam.

--- MOSQUES & ISLAMIC HERITAGE IN KERALA (as requested) ---
- Cheraman Juma Mosque, Kodungallur (Thrissur district): widely regarded as the first mosque in India, traditionally dated to around 629 CE and linked to the era of Malik Dinar; a major heritage site.
- Malik Dinar Juma Masjid, Thalangara, Kasaragod: associated with Malik Dinar, among the oldest mosques in India.
- Mishkal Mosque, Kuttichira, Kozhikode: a 14th-century mosque built by the Arab trader Nakhooda Mishkal; noted for its traditional Kerala architecture and wooden carvings.
- Beemapally Dargah / Mosque, Thiruvananthapuram: shrine of Beema Beevi; famous for the Beemapally Chandanakudam festival.
- Vavar Masjid, Erumeli (Kottayam district): linked to Vavar, the Muslim companion associated with the Sabarimala pilgrimage of Lord Ayyappa; a well-known symbol of Kerala's interfaith tradition.
- Other notable mosques and centres: Kottakkal/Other Malabar mosques of the Mappila Muslim community; Kozhikode (Calicut) is the historic heart of Kerala's Muslim heritage on the Malabar Coast.
- Context: Islam reached Kerala early through Arab traders; the Mappila (Moplah) community is a major Muslim community of Kerala.

--- ANSWERING GUIDANCE ---
- When asked about Kerala or an Indian state, lead with its nickname(s), capital and a few signature places, then offer more depth.
- Keep answers accurate to this pack; if a requested place/feature is not listed, say you are not certain rather than inventing it.
- Treat this as background knowledge, not a live data feed; for current events, advise checking an official, up-to-date source.
`;
