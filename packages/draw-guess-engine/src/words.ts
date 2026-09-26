import { pickIndex, shuffle, type RandomSource } from './random';
import { MAX_CUSTOM_WORDS, MAX_CUSTOM_WORD_LENGTH, MIN_WORD_LENGTH } from './config';

export const WORD_CATEGORIES = [
  'Animals',
  'Food',
  'Objects',
  'Places',
  'Vehicles',
  'Nature',
  'Sports',
  'Professions',
  'Technology',
  'Everyday',
  'Indian Culture',
  'Indian Food',
  'Indian Places',
  'Festivals',
  'Bollywood',
  'Cricket',
] as const;
export type WordCategory = (typeof WORD_CATEGORIES)[number];

export const WORD_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type WordDifficulty = (typeof WORD_DIFFICULTIES)[number];

export interface WordEntry {
  word: string;
  category: WordCategory;
  difficulty: WordDifficulty;
}

function entries(category: WordCategory, difficulty: WordDifficulty, words: readonly string[]): WordEntry[] {
  return words.map((word) => ({ word, category, difficulty }));
}

/**
 * Original word list (Skribbl.io se copy nahi kiya — generic, common-noun level concepts).
 * Bollywood/Cricket categories jaan-boojh kar sirf generic vocabulary use karte hain
 * (koi real movie title, cricketer ka naam, ya trademark nahi) — copyright-safe rehne ke liye.
 */
export const WORD_BANK: readonly WordEntry[] = [
  ...entries('Animals', 'EASY', ['Dog', 'Cat', 'Cow', 'Fish', 'Bird', 'Lion', 'Tiger', 'Elephant', 'Horse', 'Snake']),
  ...entries('Animals', 'MEDIUM', ['Peacock', 'Camel', 'Monkey', 'Rabbit', 'Parrot', 'Crocodile', 'Kangaroo', 'Squirrel']),
  ...entries('Animals', 'HARD', ['Chameleon', 'Platypus', 'Octopus', 'Porcupine', 'Mongoose']),

  ...entries('Food', 'EASY', ['Rice', 'Bread', 'Milk', 'Egg', 'Tea', 'Mango', 'Apple', 'Banana', 'Cake', 'Pizza']),
  ...entries('Food', 'MEDIUM', ['Samosa', 'Biryani', 'Pancake', 'Noodles', 'Sandwich', 'Omelette', 'Popcorn']),
  ...entries('Food', 'HARD', ['Dumpling', 'Casserole', 'Quesadilla', 'Croissant']),

  ...entries('Objects', 'EASY', ['Chair', 'Table', 'Book', 'Pen', 'Clock', 'Door', 'Key', 'Umbrella', 'Mirror', 'Ladder']),
  ...entries('Objects', 'MEDIUM', ['Scissors', 'Candle', 'Backpack', 'Telescope', 'Calendar', 'Envelope']),
  ...entries('Objects', 'HARD', ['Stethoscope', 'Compass', 'Chandelier', 'Typewriter']),

  ...entries('Places', 'EASY', ['School', 'Park', 'Beach', 'Market', 'Temple', 'Hospital', 'Airport', 'Bridge']),
  ...entries('Places', 'MEDIUM', ['Museum', 'Lighthouse', 'Waterfall', 'Volcano', 'Desert', 'Island']),
  ...entries('Places', 'HARD', ['Amphitheater', 'Observatory', 'Sanctuary']),

  ...entries('Vehicles', 'EASY', ['Car', 'Bus', 'Bike', 'Train', 'Boat', 'Truck', 'Rickshaw', 'Airplane']),
  ...entries('Vehicles', 'MEDIUM', ['Helicopter', 'Submarine', 'Tractor', 'Scooter']),
  ...entries('Vehicles', 'HARD', ['Bulldozer', 'Zeppelin']),

  ...entries('Nature', 'EASY', ['Sun', 'Moon', 'Star', 'Tree', 'River', 'Mountain', 'Rain', 'Cloud', 'Flower']),
  ...entries('Nature', 'MEDIUM', ['Rainbow', 'Thunderstorm', 'Glacier', 'Coral reef', 'Avalanche']),
  ...entries('Nature', 'HARD', ['Monsoon', 'Eclipse', 'Stalactite']),

  ...entries('Sports', 'EASY', ['Football', 'Cricket bat', 'Swimming', 'Running', 'Boxing', 'Chess']),
  ...entries('Sports', 'MEDIUM', ['Badminton', 'Wrestling', 'Archery', 'Gymnastics', 'Skateboarding']),
  ...entries('Sports', 'HARD', ['Fencing', 'Weightlifting', 'Water polo']),

  ...entries('Professions', 'EASY', ['Doctor', 'Teacher', 'Farmer', 'Chef', 'Police officer', 'Pilot']),
  ...entries('Professions', 'MEDIUM', ['Electrician', 'Carpenter', 'Photographer', 'Astronaut']),
  ...entries('Professions', 'HARD', ['Archaeologist', 'Cartographer']),

  ...entries('Technology', 'EASY', ['Phone', 'Computer', 'Camera', 'Robot', 'Television', 'Headphones']),
  ...entries('Technology', 'MEDIUM', ['Satellite', 'Drone', 'Keyboard', 'Microchip']),
  ...entries('Technology', 'HARD', ['Server rack', 'Circuit board']),

  ...entries('Everyday', 'EASY', ['Toothbrush', 'Soap', 'Towel', 'Broom', 'Bucket', 'Pillow']),
  ...entries('Everyday', 'MEDIUM', ['Alarm clock', 'Thermometer', 'Suitcase']),
  ...entries('Everyday', 'HARD', ['Sewing machine', 'Pressure cooker']),

  ...entries('Indian Culture', 'EASY', ['Sari', 'Turban', 'Henna', 'Diya', 'Rangoli', 'Dhol']),
  ...entries('Indian Culture', 'MEDIUM', ['Kathak', 'Sitar', 'Tabla', 'Mehendi'] ),
  ...entries('Indian Culture', 'HARD', ['Kathakali', 'Shehnai']),

  ...entries('Indian Food', 'EASY', ['Dosa', 'Chai', 'Roti', 'Paneer', 'Ladoo', 'Chapati']),
  ...entries('Indian Food', 'MEDIUM', ['Gulab jamun', 'Pani puri', 'Chole bhature']),
  ...entries('Indian Food', 'HARD', ['Rasmalai', 'Dhokla']),

  ...entries('Indian Places', 'EASY', ['Taj Mahal', 'Red Fort', 'Ganga', 'Himalayas']),
  ...entries('Indian Places', 'MEDIUM', ['Gateway of India', 'Charminar', 'Hawa Mahal']),
  ...entries('Indian Places', 'HARD', ['Rann of Kutch', 'Meenakshi Temple']),

  ...entries('Festivals', 'EASY', ['Diwali', 'Holi', 'Eid', 'Christmas', 'Raksha Bandhan']),
  ...entries('Festivals', 'MEDIUM', ['Navratri', 'Onam', 'Pongal', 'Baisakhi']),
  ...entries('Festivals', 'HARD', ['Makar Sankranti', 'Ganesh Chaturthi']),

  // Generic film-industry vocabulary — koi real movie/star ka naam nahi (copyright-safe).
  ...entries('Bollywood', 'EASY', ['Playback singer', 'Item song', 'Villain', 'Director', 'Dance number']),
  ...entries('Bollywood', 'MEDIUM', ['Blockbuster', 'Climax fight', 'Love triangle', 'Cameo']),
  ...entries('Bollywood', 'HARD', ['Flashback scene', 'Method acting']),

  // Generic cricket vocabulary — koi real cricketer ka naam nahi.
  ...entries('Cricket', 'EASY', ['Wicket', 'Six', 'Boundary', 'Umpire', 'Bowler', 'Batsman']),
  ...entries('Cricket', 'MEDIUM', ['Century', 'Spinner', 'Run out', 'Powerplay']),
  ...entries('Cricket', 'HARD', ['Googly', 'Doosra', 'Follow-on']),
] as const;

export interface WordFilter {
  categories?: readonly WordCategory[];
  difficulty?: WordDifficulty;
}

/** Custom word validation ka result — server isi se decide karta hai, silently drop nahi karta. */
export interface CustomWordValidation {
  valid: string[];
  rejected: { word: string; reason: 'TOO_LONG' | 'TOO_SHORT' | 'DUPLICATE' | 'TOO_MANY' }[];
}

/** Owner ke custom words validate karta hai (length, duplicate, count cap). Profanity filter alag layer hai. */
export function validateCustomWords(rawWords: readonly string[]): CustomWordValidation {
  const valid: string[] = [];
  const rejected: CustomWordValidation['rejected'] = [];
  const seen = new Set<string>();
  for (const raw of rawWords) {
    const word = raw.trim();
    if (valid.length + rejected.length >= MAX_CUSTOM_WORDS) {
      rejected.push({ word, reason: 'TOO_MANY' });
      continue;
    }
    const key = word.toLowerCase();
    if (word.length < MIN_WORD_LENGTH) {
      rejected.push({ word, reason: 'TOO_SHORT' });
    } else if (word.length > MAX_CUSTOM_WORD_LENGTH) {
      rejected.push({ word, reason: 'TOO_LONG' });
    } else if (seen.has(key)) {
      rejected.push({ word, reason: 'DUPLICATE' });
    } else {
      seen.add(key);
      valid.push(word);
    }
  }
  return { valid, rejected };
}

/**
 * Drawer ke liye `count` word options chunta hai, jo `usedWords` me nahi hain (isi game me dobara na aayen).
 * `customWords` di ho to unhi me se (aur khatam ho jayen to wapas bank se) — kabhi bhi client ko poora
 * pool nahi bhejte, sirf jo abhi offer karna hai wahi.
 */
export function pickWordChoices(
  count: number,
  usedWords: ReadonlySet<string>,
  random: RandomSource,
  options?: { customWords?: readonly string[]; filter?: WordFilter },
): string[] {
  const customPool = (options?.customWords ?? []).filter((w) => !usedWords.has(w));
  if (customPool.length >= count) {
    return shuffle(customPool, random).slice(0, count);
  }

  let pool = WORD_BANK.filter((e) => !usedWords.has(e.word));
  if (options?.filter?.categories?.length) {
    const cats = new Set(options.filter.categories);
    pool = pool.filter((e) => cats.has(e.category));
  }
  if (options?.filter?.difficulty) {
    pool = pool.filter((e) => e.difficulty === options.filter?.difficulty);
  }
  // Pool bahut chhota pad jaye (bahut sare words use ho chuke) to used-words ignore karke bhi chalao —
  // game kabhi "no words left" par atakna nahi chahiye.
  if (pool.length < count) pool = options?.filter?.categories?.length || options?.filter?.difficulty
    ? WORD_BANK.filter((e) =>
        (!options?.filter?.categories?.length || new Set(options.filter.categories).has(e.category)) &&
        (!options?.filter?.difficulty || e.difficulty === options.filter?.difficulty),
      )
    : [...WORD_BANK];

  const picked = shuffle(pool, random)
    .slice(0, count)
    .map((e) => e.word);
  const remaining = count - picked.length;
  for (let i = 0; i < remaining; i++) {
    const idx = pickIndex(customPool.length, random);
    if (idx >= 0) picked.push(customPool[idx] as string);
  }
  return picked;
}
