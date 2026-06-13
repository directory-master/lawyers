// GA.Lawyers taxonomy — a LAWYER / LAW-FIRM directory for Georgia.
//
// `slug`  — the stable URL key (NEVER change an existing one; it is a live URL).
// `type`  — the human label shown on cards and headings.
// `group` — clusters practice areas on hub pages.
// `synonyms` feed the import classifier: which practice area does a scraped
//   business Name + Bing Category map onto? Name-first inference lets a generic
//   "Lawyer" row land on a real area when the name reveals one (e.g. "…Elder Law"
//   → Estate & Elder, "…Immigration" → Immigration).
//
// We INCLUDE every kind of law practice and classify it. Generic rows
// ("Lawyer", "Legal services", "Professional services") fall back to
// `general-practice` rather than being dropped. Non-law rows are filtered out at
// ingest (see scripts/import-csv.mjs → isLawyerRow).

export const GROUPS = [
  'Injury & Accidents',
  'Criminal & DUI',
  'Family & Divorce',
  'Estate & Elder',
  'Property & Real Estate',
  'Money & Debt',
  'Immigration',
  'Employment',
  'Disability & Benefits',
  'Tax & IRS',
  'General Practice',
];

export const CATEGORIES = [
  { slug: 'personal-injury', type: 'Personal Injury Lawyer', group: 'Injury & Accidents',
    synonyms: ['personal injury', 'injury and accident', 'injury & accident', 'car accident',
      'auto accident', 'truck accident', 'motorcycle accident', 'wrongful death', 'slip and fall',
      'catastrophic injury', 'accident lawyer', 'accident attorney', 'injury law', 'injury'] },

  { slug: 'criminal-defense', type: 'Criminal Defense Lawyer', group: 'Criminal & DUI',
    synonyms: ['criminal defense', 'criminal law', 'criminal attorney', 'dui', 'dwi', 'vgcsa',
      'drug defense', 'defense attorney', 'not guilty', 'crime', 'criminal'] },

  { slug: 'family-divorce', type: 'Divorce & Family Lawyer', group: 'Family & Divorce',
    synonyms: ['divorce and family', 'divorce & family', 'family law', 'divorce', 'child custody',
      'child support', 'custody', 'alimony', 'adoption', 'family attorney', 'family'] },

  // Real estate is matched BEFORE estate-elder so "Real estate law" never falls
  // into Estate & Elder (which deliberately has no bare "estate" synonym).
  { slug: 'real-estate', type: 'Real Estate Lawyer', group: 'Property & Real Estate',
    synonyms: ['real estate law', 'real estate', 'title', 'closing', 'closings', 'property law',
      'landlord', 'eviction', 'land use', 'zoning'] },

  { slug: 'estate-elder', type: 'Estate & Elder Law Attorney', group: 'Estate & Elder',
    synonyms: ['elder care law', 'elder law', 'elder care', 'estate planning', 'estate law',
      'probate', 'wills', 'trusts', 'guardianship'] },

  { slug: 'bankruptcy', type: 'Bankruptcy Lawyer', group: 'Money & Debt',
    synonyms: ['bankruptcy', 'chapter 7', 'chapter 13', 'debt relief', 'debt', 'foreclosure',
      'creditor', 'insolvency'] },

  { slug: 'immigration', type: 'Immigration Lawyer', group: 'Immigration',
    synonyms: ['immigration law', 'immigration', 'visa', 'green card', 'naturalization',
      'deportation', 'asylum', 'citizenship'] },

  { slug: 'employment', type: 'Employment & Discrimination Lawyer', group: 'Employment',
    synonyms: ['employment law', 'employment', 'discrimination', 'retaliation',
      'wrongful termination', 'sexual harassment', 'harassment', 'whistleblower',
      'workplace', 'wage and hour', 'overtime', 'flsa', 'labor law', 'civil rights'] },

  { slug: 'social-security', type: 'Social Security & Disability Lawyer', group: 'Disability & Benefits',
    synonyms: ['social security law', 'social security disability', 'social security',
      'disability benefits', 'disability attorney', 'disability lawyer', 'disability', 'ssdi'] },

  { slug: 'tax-irs', type: 'Tax & IRS Lawyer', group: 'Tax & IRS',
    synonyms: ['tax law', 'tax attorney', 'tax lawyer', 'tax resolution', 'tax relief',
      'tax defense', 'tax controversy', 'tax debt', 'irs', 'taxation', 'tax'] },

  // Catch-all: generic "Lawyer" / "Law Office" / "Legal services" / "Professional services".
  { slug: 'general-practice', type: 'General Practice Lawyer', group: 'General Practice',
    synonyms: ['general practice', 'attorneys at law', 'attorney at law', 'law offices', 'law office',
      'law firm', 'law group', 'legal group', 'legal services', 'professional services', 'attorneys',
      'attorney', 'lawyer', 'lawyers', 'esq', 'law', 'legal'] },
];

// Convenience lookups
export const TYPE_BY_SLUG = Object.fromEntries(CATEGORIES.map(c => [c.slug, c.type]));
export const SLUG_BY_TYPE = Object.fromEntries(CATEGORIES.map(c => [c.type, c.slug]));
export const CATEGORIES_BY_GROUP = GROUPS.map(g => ({
  group: g,
  items: CATEGORIES.filter(c => c.group === g),
}));
