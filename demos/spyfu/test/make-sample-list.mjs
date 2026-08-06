/**
 * Regenerates data/sample-prospects.csv.
 *
 * The list is deliberately MESSY — mixed case, protocols, paths, www, tracking
 * params, duplicates, blanks, an email address, a "n/a" — because the cleanup
 * counters on the config page are a demo beat ("18 duplicates removed, that's
 * already money saved"). A tidy sample list would waste that moment.
 *
 * Run:  node test/make-sample-list.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toCsv } from '../lib/csv.js';
import { rngFor } from '../lib/util.js';

const rng = rngFor('sample-list', 'v2');

const PRE = ['North', 'Bright', 'Stone', 'Harbour', 'Valley', 'Orchard', 'Crest', 'Fen',
  'Pinnacle', 'Atlas', 'Quiet', 'Ravens', 'Elm', 'Ash', 'Marlow', 'Kings', 'Wold',
  'Barrow', 'Clover', 'Dunmore', 'Everly', 'Fairholm', 'Granger', 'Hollow', 'Ivywood',
  'Jarrow', 'Kelsey', 'Ludlow', 'Merrow', 'Newford', 'Oakley', 'Pennine', 'Quarry',
  'Redland', 'Shelby', 'Tarnbrook', 'Upton', 'Verity', 'Westmoor', 'Yarrow'];
const MID = ['gate', 'path', 'bridge', 'view', 'field', 'wood', 'line', 'wick', 'stead',
  'ford', 'ridge', 'mere', 'holt', 'crest', ''];
const SECTOR = [
  ['Roofing', 'roofing'], ['Dental', 'dental'], ['Logistics', 'logistics'],
  ['Legal', 'legal'], ['Home Care', 'homecare'], ['Packaging', 'packaging'],
  ['HVAC', 'hvac'], ['Interiors', 'interiors'], ['Scaffolding', 'scaffolding'],
  ['Cleaning Services', 'cleaningservices'], ['Studio', 'studio'], ['Garden Centre', 'garden'],
  ['Fit Out', 'fitout'], ['Accountants', 'accountants'], ['Recruitment', 'recruitment'],
  ['Plant Hire', 'planthire'], ['Windows', 'windows'], ['Electrical', 'electrical'],
  ['Groundworks', 'groundworks'], ['Removals', 'removals'], ['Physiotherapy', 'physio'],
  ['Veterinary', 'vets'], ['Insurance Brokers', 'insurance'], ['Print', 'print'],
  ['Signage', 'signage'], ['Security', 'security'], ['Catering', 'catering'],
  ['Flooring', 'flooring'], ['Kitchens', 'kitchens'], ['Landscaping', 'landscaping'],
];
const SUFFIX = ['Ltd', 'Ltd', 'Limited', 'Group', '& Co', 'LLP', 'Inc', ''];
const CITY = ['Manchester', 'Leeds', 'Bristol', 'Glasgow', 'Birmingham', 'Nottingham',
  'Sheffield', 'Cardiff', 'Newcastle', 'Southampton', 'Dublin', 'Belfast', 'Austin',
  'Denver', 'Portland', 'Boston', 'Phoenix', 'Charlotte', 'Toronto', 'Vancouver'];
const OWNER = ['Sam Wheeler', 'Priya Raman', 'Tom Alderton', 'Grace Osei', 'Dan Kovacs',
  'Ellie Marsh', 'Marcus Bright', 'Hana Sato', 'Owen Pryce', 'Nina Bell'];

const pick = (a) => a[Math.floor(rng() * a.length)];

/** Company names for the pinned demo domains, so the table reads naturally. */
const CURATED_NAMES = {
  'northgate-roofing.co.uk': 'Northgate Roofing Ltd',
  'kestrellogistics.com': 'Kestrel Logistics Inc',
  'brightpath-dental.co.uk': 'Brightpath Dental',
  'harbourviewaccountants.co.uk': 'Harbourview Accountants LLP',
  'meridianfitout.com': 'Meridian Fit Out Group',
  'stonebridgelegal.co.uk': 'Stonebridge Legal',
  'valleyhomecare.com': 'Valley Home Care',
  'orchardpackaging.co.uk': 'Orchard Packaging Ltd',
  'crestlinehvac.com': 'Crestline HVAC',
  'fenwickinteriors.co.uk': 'Fenwick Interiors',
  'pinnacle-scaffolding.co.uk': 'Pinnacle Scaffolding Ltd',
  'atlascleaningservices.com': 'Atlas Cleaning Services',
  'quietfoxstudio.co.uk': 'Quiet Fox Studio',
  'ravenswoodgarden.com': 'Ravenswood Garden Centre',
};

/** Deliberately in the list AND in the exclusions file. */
const EXISTING_CLIENTS = [
  ['Lockwood Fabrication', 'lockwoodfabrication.co.uk'],
  ['Sable Court Hotels', 'sablecourthotels.com'],
  ['Trentham Plumbing', 'trenthamplumbing.co.uk'],
];

function messify(domain) {
  const r = rng();
  if (r < 0.28) return `https://www.${domain}`;
  if (r < 0.42) return `http://${domain}/`;
  if (r < 0.52) return `https://${domain}/contact-us`;
  if (r < 0.6) return `www.${domain}`;
  if (r < 0.66) return `https://www.${domain.toUpperCase()}/services?utm_source=list`;
  if (r < 0.7) return ` ${domain} `;
  return domain;
}

const rows = [];
const used = new Set();

function push(company, domain, opts = {}) {
  rows.push({
    'Company Name': company,
    'Website': opts.rawWebsite ?? messify(domain),
    'City': pick(CITY),
    'Employees': String(5 + Math.floor(rng() * 400)),
    'Owner': pick(OWNER),
    'List Source': pick(['Trade show 2026', 'Chamber list', 'LinkedIn scrape', 'Referral', 'Inbound']),
  });
}

// 1. Pinned demo domains first.
for (const [domain, name] of Object.entries(CURATED_NAMES)) {
  push(name, domain);
  used.add(domain);
}

// 2. Existing clients (should be excluded at upload time).
for (const [name, domain] of EXISTING_CLIENTS) {
  push(name, domain);
  used.add(domain);
}

// 3. Filler.
let guard = 0;
while (rows.length < 196 && guard++ < 5000) {
  const [label, slug] = pick(SECTOR);
  const name = `${pick(PRE)}${pick(MID)}`;
  const tld = rng() < 0.55 ? '.co.uk' : '.com';
  const domain = `${name.toLowerCase()}${slug}${tld}`;
  if (used.has(domain)) continue;
  used.add(domain);
  push(`${name} ${label} ${pick(SUFFIX)}`.replace(/\s+/g, ' ').trim(), domain);
}

// 4. Mess: duplicates in different shapes, blanks and junk values.
const dupSource = rows.slice(0, 120);
for (let i = 0; i < 18; i++) {
  const src = dupSource[Math.floor(rng() * dupSource.length)];
  const bare = src.Website.replace(/^https?:\/\//, '').replace(/^www\./, '')
    .split('/')[0].trim().toLowerCase();
  push(src['Company Name'], bare, { rawWebsite: messify(bare) });
}
push('Halden & Moor Consulting', '', { rawWebsite: 'n/a' });
push('Pallister Freight', '', { rawWebsite: '' });
push('Rowan Tree Care', '', { rawWebsite: 'info@rowantreecare.co.uk' });
push('Cobb & Sons', '', { rawWebsite: 'coming soon' });

// Shuffle everything except the first row so the pinned domains aren't obviously
// stacked at the top of the file.
for (let i = rows.length - 1; i > 1; i--) {
  const j = 1 + Math.floor(rng() * i);
  [rows[i], rows[j]] = [rows[j], rows[i]];
}

const here = dirname(fileURLToPath(import.meta.url));
const cols = ['Company Name', 'Website', 'City', 'Employees', 'Owner', 'List Source'];
writeFileSync(join(here, '../data/sample-prospects.csv'), toCsv(rows, cols), 'utf8');

const exclusions = EXISTING_CLIENTS.map(([name, domain]) => ({
  'Company Name': name, 'Website': `https://www.${domain}`, 'Reason': 'Existing client',
}));
writeFileSync(
  join(here, '../data/sample-exclusions.csv'),
  toCsv(exclusions, ['Company Name', 'Website', 'Reason']),
  'utf8',
);

console.log(`Wrote ${rows.length} rows to data/sample-prospects.csv`);
console.log(`Wrote ${exclusions.length} rows to data/sample-exclusions.csv`);
