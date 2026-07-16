// Diccionario de comercios que cobran suscripción, con foco en Colombia.
//
// `moneda: 'USD'` es una PISTA, no la verdad: significa que ese comercio suele
// facturar en dólares desde Colombia, y por lo tanto el cargo trae encima
// comisión internacional + IVA + el spread de TRM del banco. Si el extracto
// dice explícitamente que fue compra internacional, esa evidencia manda.
//
// ¿Te falta un comercio? Agrégalo aquí con el texto TAL CUAL sale en tu extracto
// (sin el número de referencia) y manda un PR. Ver CONTRIBUTING.md

export const SUSCRIPCIONES = [
  // --- Streaming de video ---
  { nombre: 'Netflix', categoria: 'streaming', moneda: 'COP', patrones: ['NETFLIX'] },
  { nombre: 'Disney+', categoria: 'streaming', moneda: 'COP', patrones: ['DISNEY PLUS', 'DISNEYPLUS', 'DISNEY+', 'DISNEY'] },
  { nombre: 'Max (HBO)', categoria: 'streaming', moneda: 'COP', patrones: ['HBO MAX', 'HBOMAX', 'HBO', 'WBD MAX', 'MAX STREAMING'] },
  { nombre: 'Prime Video', categoria: 'streaming', moneda: 'COP', patrones: ['PRIME VIDEO', 'AMAZON PRIME'] },
  { nombre: 'Apple TV+', categoria: 'streaming', moneda: 'COP', patrones: ['APPLE TV'] },
  { nombre: 'Paramount+', categoria: 'streaming', moneda: 'COP', patrones: ['PARAMOUNT PLUS', 'PARAMOUNT+', 'PARAMOUNT'] },
  { nombre: 'ViX', categoria: 'streaming', moneda: 'COP', patrones: ['VIX PLUS', 'VIX', 'TELEVISAUNIVISION'] },
  { nombre: 'Crunchyroll', categoria: 'streaming', moneda: 'USD', patrones: ['CRUNCHYROLL'] },
  { nombre: 'Claro Video', categoria: 'streaming', moneda: 'COP', patrones: ['CLARO VIDEO', 'CLAROVIDEO'] },
  { nombre: 'Win Sports+', categoria: 'streaming', moneda: 'COP', patrones: ['WIN SPORTS', 'WINSPORTS'] },
  { nombre: 'DirecTV GO', categoria: 'streaming', moneda: 'COP', patrones: ['DIRECTV GO', 'DGO', 'DIRECTV'] },
  { nombre: 'MUBI', categoria: 'streaming', moneda: 'USD', patrones: ['MUBI'] },
  { nombre: 'Plex', categoria: 'streaming', moneda: 'USD', patrones: ['PLEX'] },

  // --- Música y audio ---
  { nombre: 'Spotify', categoria: 'musica', moneda: 'COP', patrones: ['SPOTIFY'] },
  { nombre: 'YouTube Premium', categoria: 'musica', moneda: 'COP', patrones: ['YOUTUBE PREMIUM', 'YOUTUBEPREMIUM', 'GOOGLE YOUTUBE', 'YOUTUBE MUSIC', 'YOUTUBE'] },
  { nombre: 'Apple Music', categoria: 'musica', moneda: 'COP', patrones: ['APPLE MUSIC'] },
  { nombre: 'Deezer', categoria: 'musica', moneda: 'COP', patrones: ['DEEZER'] },
  { nombre: 'Tidal', categoria: 'musica', moneda: 'USD', patrones: ['TIDAL'] },
  { nombre: 'Amazon Music', categoria: 'musica', moneda: 'COP', patrones: ['AMAZON MUSIC'] },
  { nombre: 'Audible', categoria: 'musica', moneda: 'USD', patrones: ['AUDIBLE'] },
  { nombre: 'Storytel', categoria: 'musica', moneda: 'COP', patrones: ['STORYTEL'] },

  // --- IA ---
  { nombre: 'ChatGPT (OpenAI)', categoria: 'ia', moneda: 'USD', patrones: ['OPENAI', 'CHATGPT', 'CHAT GPT'] },
  { nombre: 'Claude (Anthropic)', categoria: 'ia', moneda: 'USD', patrones: ['ANTHROPIC', 'CLAUDE AI', 'CLAUDE'] },
  { nombre: 'Perplexity', categoria: 'ia', moneda: 'USD', patrones: ['PERPLEXITY'] },
  { nombre: 'Midjourney', categoria: 'ia', moneda: 'USD', patrones: ['MIDJOURNEY'] },
  { nombre: 'Cursor', categoria: 'ia', moneda: 'USD', patrones: ['CURSOR AI', 'CURSOR SH', 'ANYSPHERE'] },
  { nombre: 'GitHub Copilot', categoria: 'ia', moneda: 'USD', patrones: ['GITHUB'] },
  { nombre: 'ElevenLabs', categoria: 'ia', moneda: 'USD', patrones: ['ELEVENLABS', 'ELEVEN LABS'] },
  { nombre: 'Google Gemini', categoria: 'ia', moneda: 'COP', patrones: ['GOOGLE GEMINI', 'GEMINI ADVANCED'] },

  // --- Nube, software y productividad ---
  { nombre: 'iCloud / Apple', categoria: 'software', moneda: 'COP', patrones: ['APPLE COM BILL', 'APPLE.COM/BILL', 'ITUNES', 'APPLE ONE', 'ICLOUD', 'APPLE COM'] },
  { nombre: 'Google One', categoria: 'software', moneda: 'COP', patrones: ['GOOGLE ONE', 'GOOGLE STORAGE'] },
  { nombre: 'Google Workspace', categoria: 'software', moneda: 'USD', patrones: ['GOOGLE WORKSPACE', 'GSUITE', 'G SUITE'] },
  { nombre: 'Dropbox', categoria: 'software', moneda: 'USD', patrones: ['DROPBOX'] },
  { nombre: 'Microsoft 365', categoria: 'software', moneda: 'COP', patrones: ['MICROSOFT 365', 'MSFT 365', 'OFFICE 365', 'MICROSOFT'] },
  { nombre: 'Adobe', categoria: 'software', moneda: 'USD', patrones: ['ADOBE'] },
  { nombre: 'Canva', categoria: 'software', moneda: 'USD', patrones: ['CANVA'] },
  { nombre: 'Notion', categoria: 'software', moneda: 'USD', patrones: ['NOTION'] },
  { nombre: 'Figma', categoria: 'software', moneda: 'USD', patrones: ['FIGMA'] },
  { nombre: '1Password', categoria: 'software', moneda: 'USD', patrones: ['1PASSWORD', 'ONEPASSWORD', 'AGILEBITS'] },
  { nombre: 'NordVPN', categoria: 'software', moneda: 'USD', patrones: ['NORDVPN', 'NORD VPN'] },
  { nombre: 'ExpressVPN', categoria: 'software', moneda: 'USD', patrones: ['EXPRESSVPN', 'EXPRESS VPN'] },
  { nombre: 'Evernote', categoria: 'software', moneda: 'USD', patrones: ['EVERNOTE'] },
  { nombre: 'Slack', categoria: 'software', moneda: 'USD', patrones: ['SLACK'] },
  { nombre: 'Zoom', categoria: 'software', moneda: 'USD', patrones: ['ZOOM VIDEO', 'ZOOM COM', 'ZOOM US'] },
  { nombre: 'Vercel', categoria: 'software', moneda: 'USD', patrones: ['VERCEL'] },

  // --- Domicilios y transporte ---
  { nombre: 'Rappi Pro / Prime', categoria: 'domicilios', moneda: 'COP', patrones: ['RAPPI PRO', 'RAPPIPRO', 'RAPPI PRIME', 'RAPPI SUSCRIPCION'] },
  { nombre: 'Uber One', categoria: 'domicilios', moneda: 'COP', patrones: ['UBER ONE', 'UBERONE'] },
  { nombre: 'DiDi', categoria: 'domicilios', moneda: 'COP', patrones: ['DIDI FOOD', 'DIDI PLUS'] },

  // --- Gimnasios ---
  { nombre: 'Smart Fit', categoria: 'gimnasio', moneda: 'COP', patrones: ['SMART FIT', 'SMARTFIT'] },
  { nombre: 'Bodytech', categoria: 'gimnasio', moneda: 'COP', patrones: ['BODYTECH', 'BODY TECH'] },
  { nombre: 'Stark Gym', categoria: 'gimnasio', moneda: 'COP', patrones: ['STARK GYM', 'GIMNASIO STARK'] },
  { nombre: 'Spinning Center', categoria: 'gimnasio', moneda: 'COP', patrones: ['SPINNING CENTER'] },

  // --- Telco ---
  { nombre: 'Claro', categoria: 'telco', moneda: 'COP', patrones: ['CLARO COLOMBIA', 'COMCEL', 'CLARO'] },
  { nombre: 'Movistar', categoria: 'telco', moneda: 'COP', patrones: ['MOVISTAR', 'TELEFONICA'] },
  { nombre: 'Tigo', categoria: 'telco', moneda: 'COP', patrones: ['TIGO', 'UNE EPM TELCO', 'COLOMBIA MOVIL'] },
  { nombre: 'WOM', categoria: 'telco', moneda: 'COP', patrones: ['WOM COLOMBIA', 'PARTNERS TELECOM'] },
  { nombre: 'ETB', categoria: 'telco', moneda: 'COP', patrones: ['ETB'] },
  { nombre: 'Virgin Mobile', categoria: 'telco', moneda: 'COP', patrones: ['VIRGIN MOBILE'] },

  // --- Juegos ---
  { nombre: 'PlayStation Plus', categoria: 'juegos', moneda: 'COP', patrones: ['PLAYSTATION', 'PSN', 'SONY INTERACTIVE'] },
  { nombre: 'Xbox Game Pass', categoria: 'juegos', moneda: 'COP', patrones: ['XBOX', 'GAME PASS'] },
  { nombre: 'Nintendo', categoria: 'juegos', moneda: 'USD', patrones: ['NINTENDO'] },
  { nombre: 'Steam', categoria: 'juegos', moneda: 'USD', patrones: ['STEAM', 'VALVE'] },
  { nombre: 'Roblox', categoria: 'juegos', moneda: 'USD', patrones: ['ROBLOX'] },
  { nombre: 'Epic Games', categoria: 'juegos', moneda: 'USD', patrones: ['EPIC GAMES'] },
  { nombre: 'Twitch', categoria: 'juegos', moneda: 'USD', patrones: ['TWITCH'] },
  { nombre: 'Discord Nitro', categoria: 'juegos', moneda: 'USD', patrones: ['DISCORD'] },

  // --- Educación ---
  { nombre: 'Duolingo', categoria: 'educacion', moneda: 'USD', patrones: ['DUOLINGO'] },
  { nombre: 'Platzi', categoria: 'educacion', moneda: 'USD', patrones: ['PLATZI'] },
  { nombre: 'Coursera', categoria: 'educacion', moneda: 'USD', patrones: ['COURSERA'] },
  { nombre: 'Udemy', categoria: 'educacion', moneda: 'USD', patrones: ['UDEMY'] },
  { nombre: 'Domestika', categoria: 'educacion', moneda: 'COP', patrones: ['DOMESTIKA'] },
  { nombre: 'Crehana', categoria: 'educacion', moneda: 'COP', patrones: ['CREHANA'] },
  { nombre: 'Babbel', categoria: 'educacion', moneda: 'USD', patrones: ['BABBEL'] },

  // --- Otros ---
  { nombre: 'LinkedIn Premium', categoria: 'otros', moneda: 'USD', patrones: ['LINKEDIN'] },
  { nombre: 'X Premium', categoria: 'otros', moneda: 'USD', patrones: ['X CORP', 'TWITTER', 'X PREMIUM'] },
  { nombre: 'Tinder', categoria: 'otros', moneda: 'USD', patrones: ['TINDER', 'MATCH GROUP'] },
  { nombre: 'Bumble', categoria: 'otros', moneda: 'USD', patrones: ['BUMBLE'] },
  { nombre: 'Strava', categoria: 'otros', moneda: 'USD', patrones: ['STRAVA'] },
  { nombre: 'Calm', categoria: 'otros', moneda: 'USD', patrones: ['CALM COM', 'CALM SUBSCRIPTION'] },
  { nombre: 'Headspace', categoria: 'otros', moneda: 'USD', patrones: ['HEADSPACE'] },
  { nombre: 'Kindle Unlimited', categoria: 'otros', moneda: 'USD', patrones: ['KINDLE'] },
  { nombre: 'Substack', categoria: 'otros', moneda: 'USD', patrones: ['SUBSTACK'] },
  { nombre: 'Patreon', categoria: 'otros', moneda: 'USD', patrones: ['PATREON'] },
  { nombre: 'Medium', categoria: 'otros', moneda: 'USD', patrones: ['MEDIUM MONTHLY', 'MEDIUM COM'] },
];

// Sin emoji, a propósito: ver src/datos/iconos.js
export const CATEGORIAS = {
  streaming: { etiqueta: 'Streaming' },
  musica: { etiqueta: 'Música y audio' },
  ia: { etiqueta: 'Inteligencia artificial' },
  software: { etiqueta: 'Software y nube' },
  domicilios: { etiqueta: 'Domicilios' },
  gimnasio: { etiqueta: 'Gimnasio' },
  telco: { etiqueta: 'Celular e internet' },
  juegos: { etiqueta: 'Juegos' },
  educacion: { etiqueta: 'Educación' },
  otros: { etiqueta: 'Otros' },
  sospechosa: { etiqueta: 'Posible suscripción' },
};

// Palabras que delatan un cobro recurrente aunque no conozcamos el comercio.
export const PISTAS_RECURRENCIA = [
  'SUSCRIPCION', 'SUBSCRIPTION', 'MEMBRESIA', 'MEMBERSHIP', 'MENSUALIDAD',
  'PAGO RECURRENTE', 'DEBITO AUTOMATICO', 'PAGO AUTOMATICO', 'RENOVACION',
  'PLAN MENSUAL', 'PLAN ANUAL', 'PREMIUM', 'MONTHLY', 'YEARLY', 'ANNUAL',
];

// Señales de que la compra se hizo en moneda extranjera.
export const PISTAS_INTERNACIONAL = [
  'COMPRA INTERNACIONAL', 'COMPRA EN EL EXTERIOR', 'TRANSACCION INTERNACIONAL',
  'COMPRA EXTERIOR', 'INTERNACIONAL', 'USD', 'DOLARES', 'EXTERIOR',
];
