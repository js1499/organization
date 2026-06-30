// Seed data — the initial plan, used the first time the app runs (or when the
// cloud/local store is empty). After that, the live edited plan is the source of
// truth. Dates are "YYYY-MM-DD". A task's START is derived as (oe || ne) - dur days.
//
// status: 'normal' | 'inProgress' | 'done' | 'tbd'
// oe = original end (prior plan), ne = new end (current, drives the bar), dur = days.

export const SEED = {
  categories: [
    { id: 'tax',     name: 'Tax Abatement', alias: 'Verity', color: '#17BECF', flag: 'REVISITED POST JAPAN' },
    { id: 'settled', name: 'Settled Tax',   alias: '',       color: '#9467BD', flag: '' },
    { id: 'chem',    name: 'Chemicals',     alias: '',       color: '#8C564B', flag: '' },
    { id: 'squeak',  name: 'Squeaky Clean', alias: '',       color: '#1F77B4', flag: '' },
    { id: 'glide',   name: 'Glide Tax',     alias: '',       color: '#10B981', flag: '' },
    { id: 'door',    name: 'Doorstep',      alias: '',       color: '#FF7F0E', flag: '' },
    { id: 'prophet', name: 'Prophet',       alias: '',       color: '#E377C2', flag: '' },
    { id: 'general', name: 'General',       alias: '',       color: '#7F7F7F', flag: '' },
    { id: 'house',   name: 'House',         alias: '',       color: '#D62728', flag: '' },
  ],
  tasks: [
    { id: 'k1',  cat: 'tax', name: 'Website',                 oe: '2026-06-15', ne: '2026-06-22', dur: 1,  status: 'normal' },
    { id: 'k2',  cat: 'tax', name: 'Insurance',               oe: '2026-06-19', ne: '2026-06-26', dur: 5,  status: 'normal' },
    { id: 'k3',  cat: 'tax', name: 'Launch',                  oe: '2026-06-20', ne: '2026-06-20', dur: 1,  status: 'normal' },
    { id: 'k4',  cat: 'tax', name: 'First PTIN Exam (Jatin)', oe: '2026-06-26', ne: '2026-07-17', dur: 7,  status: 'normal' },
    { id: 'k5',  cat: 'tax', name: 'First PTIN Exam (Aarav)', oe: '2026-10-01', ne: '2026-10-01', dur: 30, status: 'normal' },

    { id: 'k6',  cat: 'settled', name: 'Settled Insurance', oe: '2026-06-18', ne: '2026-07-02', dur: 1, status: 'normal' },
    { id: 'k7',  cat: 'settled', name: 'Launch',            oe: '2026-06-19', ne: '2026-07-02', dur: 1, status: 'normal' },

    { id: 'k8',  cat: 'chem', name: 'Send 5 other India vendors (+2 China) samples', oe: null, ne: '2026-07-02', dur: 5,  status: 'normal' },
    { id: 'k9',  cat: 'chem', name: 'Get test batch',                                oe: '2026-07-03', ne: '2026-07-03', dur: 25, status: 'normal' },
    { id: 'k10', cat: 'chem', name: 'Receive 5 reverse engineered samples + improved versions', oe: null, ne: '2026-07-15', dur: 1, status: 'normal' },
    { id: 'k11', cat: 'chem', name: 'Get quotes for concentrates', oe: null, ne: '2026-07-15', dur: 1, status: 'normal' },

    { id: 'k12', cat: 'squeak', name: 'Regulations and Accounting', oe: null, ne: '2026-06-24', dur: 1,  status: 'done' },
    { id: 'k13', cat: 'squeak', name: 'Tire Shiner Quote Agreed',   oe: '2026-06-19', ne: '2026-07-03', dur: 1,  status: 'normal' },
    { id: 'k14', cat: 'squeak', name: '5 five-star reviews a day',  oe: '2026-06-22', ne: '2026-06-22', dur: 6,  status: 'inProgress' },
    { id: 'k15', cat: 'squeak', name: 'Plastic Installed',          oe: '2026-06-25', ne: '2026-07-02', dur: 4,  status: 'normal' },
    { id: 'k16', cat: 'squeak', name: '3 online memberships a day', oe: '2026-06-26', ne: '2026-06-30', dur: 15, status: 'normal' },
    { id: 'k17', cat: 'squeak', name: 'Store Quote Agreed',         oe: '2026-06-29', ne: '2026-07-06', dur: 10, status: 'normal' },

    { id: 'k18', cat: 'glide', name: 'Glide Insurance',          oe: '2026-06-17', ne: '2026-06-26', dur: 1, status: 'done' },
    { id: 'k19', cat: 'glide', name: 'Launch',                   oe: '2026-06-18', ne: '2026-06-26', dur: 1, status: 'done' },
    { id: 'k20', cat: 'glide', name: 'Stock support',           oe: '2026-06-20', ne: '2026-06-30', dur: 2, status: 'normal' },
    { id: 'k21', cat: 'glide', name: 'Trade reports / analysis', oe: '2026-06-21', ne: '2026-07-01', dur: 1, status: 'normal' },
    { id: 'k22', cat: 'glide', name: 'Tax loss optimization',    oe: '2026-06-22', ne: '2026-07-02', dur: 1, status: 'normal' },
    { id: 'k23', cat: 'glide', name: 'HYPE support',             oe: '2026-06-25', ne: '2026-07-03', dur: 2, status: 'normal' },
    { id: 'k24', cat: 'glide', name: 'Dashboard / analytics page', oe: '2026-06-27', ne: '2026-07-02', dur: 2, status: 'normal' },

    { id: 'k25', cat: 'door', name: 'Resume Rugtomize',     oe: '2026-06-19', ne: '2026-07-01', dur: 4, status: 'normal' },
    { id: 'k26', cat: 'door', name: 'Start Penny Boys',     oe: '2026-06-19', ne: '2026-07-01', dur: 4, status: 'normal' },
    { id: 'k27', cat: 'door', name: 'Start HiStrips',       oe: '2026-06-19', ne: '2026-07-01', dur: 4, status: 'normal' },
    { id: 'k28', cat: 'door', name: 'Start Health Y Sol',   oe: '2026-06-30', ne: '2026-07-07', dur: 7, status: 'normal' },
    { id: 'k29', cat: 'door', name: 'Start Parmint',        oe: '2026-06-30', ne: '2026-07-07', dur: 7, status: 'normal' },
    { id: 'k30', cat: 'door', name: 'Start Oracle Gifts',   oe: '2026-06-30', ne: null, dur: 4, status: 'tbd' },

    { id: 'k31', cat: 'prophet', name: 'Website',                          oe: null, ne: '2026-06-23', dur: 1, status: 'done' },
    { id: 'k32', cat: 'prophet', name: 'App store submission',            oe: null, ne: '2026-06-23', dur: 1, status: 'done' },
    { id: 'k33', cat: 'prophet', name: 'Apply to eBay (second application)', oe: null, ne: '2026-07-01', dur: 1, status: 'normal' },
    { id: 'k34', cat: 'prophet', name: 'App feature development',          oe: null, ne: '2026-06-26', dur: 1, status: 'done' },
    { id: 'k35', cat: 'prophet', name: 'Insurance',                       oe: '2026-06-19', ne: '2026-07-01', dur: 4, status: 'normal' },
    { id: 'k36', cat: 'prophet', name: 'Marketplace Scraping',            oe: '2026-06-26', ne: null, dur: 4, status: 'tbd', tag: 'delayed', striped: true, note: 'Delayed' },

    { id: 'k37', cat: 'general', name: 'Speaking Clearly + Persuasive', oe: '2026-06-17', ne: '2026-07-02', dur: 1, status: 'normal' },
    { id: 'k38', cat: 'general', name: 'Baba CPAP',                     oe: '2026-06-17', ne: '2026-07-02', dur: 1, status: 'normal' },
    { id: 'k39', cat: 'general', name: 'London Lawyer Retained',        oe: '2026-06-18', ne: '2026-06-30', dur: 2, status: 'normal' },
    { id: 'k40', cat: 'general', name: 'Handwriting',                   oe: null, ne: '2026-07-23', dur: 1, status: 'normal' },

    { id: 'k41', cat: 'house', name: "Clean Baba's Room",          oe: '2026-06-20', ne: '2026-07-04', dur: 2, status: 'normal' },
    { id: 'k42', cat: 'house', name: 'Clean Backyard',             oe: '2026-06-20', ne: '2026-07-04', dur: 2, status: 'normal' },
    { id: 'k43', cat: 'house', name: 'Clean Basement',            oe: '2026-06-21', ne: '2026-07-05', dur: 2, status: 'normal' },
    { id: 'k44', cat: 'house', name: 'Decide curtain options',    oe: null, ne: '2026-07-02', dur: 1, status: 'normal' },
    { id: 'k45', cat: 'house', name: 'Room redesign',             oe: null, ne: '2026-07-30', dur: 1, status: 'normal' },
    { id: 'k46', cat: 'house', name: 'Baba Bathroom Installation', oe: null, ne: '2026-08-01', dur: 1, status: 'normal', note: 'Talk to Mommy first' },
    { id: 'k47', cat: 'house', name: 'Basement Office Renovation', oe: null, ne: '2026-08-01', dur: 1, status: 'normal', note: 'Talk to Mommy first' },
  ],
};

// Palette offered in the business color picker (the original chart's hues + a few).
export const PALETTE = [
  '#17BECF', '#9467BD', '#8C564B', '#1F77B4', '#10B981', '#FF7F0E',
  '#E377C2', '#7F7F7F', '#D62728', '#0EA5E9', '#F59E0B', '#22C55E',
  '#6366F1', '#EC4899', '#14B8A6', '#EF4444',
];
