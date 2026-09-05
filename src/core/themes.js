/**
 * themes.js — pure theme data + resolution. No imports beyond taxonomy keys.
 *
 * Every theme MUST define both a `light` and a `dark` palette (PRD A9), and
 * every palette must clear WCAG AA contrast for `text` and `textMuted` against
 * both `bg` and `surface` — enforced by test/unit/contrast.test.js (PRD A9/G-09).
 *
 * Gradients are decorative only. Text never sits directly on a gradient stop;
 * it sits on `surface`, which is a solid colour, so contrast is always provable.
 *
 * Adding a theme is a data-only change (PRD §8): add a key here and a matching
 * key in taxonomy.js. test/integration/extensibility.test.js enforces the pair.
 */

import { NEUTRAL } from './taxonomy.js';

/** Motifs are inline SVG fragments using `currentColor`. No network, no decode. */
const MOTIFS = {
  confetti: '<g><rect x="8" y="6" width="4" height="9" rx="1" transform="rotate(24 10 10)"/><rect x="30" y="18" width="4" height="9" rx="1" transform="rotate(-38 32 22)"/><rect x="52" y="4" width="4" height="9" rx="1" transform="rotate(12 54 8)"/><circle cx="20" cy="34" r="2.5"/><circle cx="44" cy="40" r="2"/><circle cx="62" cy="28" r="2.5"/></g>',
  palm: '<g><path d="M30 58c0-14 1-22 3-30l3 1c-2 8-3 15-3 29z"/><path d="M33 28C25 17 15 14 6 18c9-1 16 3 21 11z"/><path d="M33 28c9-11 19-13 27-8-9 0-16 4-21 11z"/><path d="M33 28c-3-13 1-22 10-26-6 8-8 16-7 25z"/><path d="M33 28c6-6 14-7 21-3-8 0-14 2-18 6z"/></g>',
  neon: '<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10 44V20l14 24V20"/><circle cx="46" cy="32" r="11"/><path d="M46 24v16"/></g>',
  brackets: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 18 8 32l14 14"/><path d="M42 18l14 14-14 14"/><path d="M36 14 28 50"/></g>',
  bag: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M14 22h36l-4 30H18z"/><path d="M24 22v-4a8 8 0 0 1 16 0v4"/></g>',
  blocks: '<g><rect x="10" y="30" width="16" height="16" rx="3"/><rect x="30" y="30" width="16" height="16" rx="3"/><rect x="20" y="12" width="16" height="16" rx="3"/></g>',
  compass: '<g fill="none" stroke="currentColor" stroke-width="3"><circle cx="32" cy="32" r="20"/><path d="m24 40 6-16 10 8z" fill="currentColor" stroke="none"/></g>',
  pan: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><ellipse cx="28" cy="34" rx="16" ry="10"/><path d="M44 34h14"/><path d="M22 20c0-4 4-4 4-8M32 20c0-4 4-4 4-8"/></g>',
  pulse: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 34h12l6-16 10 30 8-20 4 6h12"/></g>',
  wave: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 40V22M22 46V16M32 42V20M42 48V14M52 38V24"/></g>',
  pad: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="8" y="22" width="48" height="22" rx="10"/><path d="M20 29v8M16 33h8"/><circle cx="43" cy="31" r="2.4" fill="currentColor"/><circle cx="48" cy="37" r="2.4" fill="currentColor"/></g>',
  pine: '<g><path d="M32 8 20 28h6L14 46h36L38 28h6z"/><rect x="29" y="46" width="6" height="10" rx="1"/></g>',
  book: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M32 20c-6-5-14-6-22-4v30c8-2 16-1 22 4 6-5 14-6 22-4V16c-8-2-16-1-22 4z"/><path d="M32 20v30"/></g>',
  grid: '<g fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><rect x="10" y="14" width="44" height="36" rx="4"/><path d="M10 26h44M26 26v24"/></g>',
  flake: '<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M32 10v44M13 21l38 22M51 21 13 43"/><path d="m26 15 6 5 6-5M26 49l6-5 6 5"/></g>',
  aura: '<g fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="16" opacity=".6"/><circle cx="32" cy="32" r="24" opacity=".3"/></g>'
};

export const THEMES = {
  celebration: {
    label: 'Celebration',
    description: 'Warm, festive, and a little loud. For parties, cake and good news.',
    motif: MOTIFS.confetti,
    light: {
      bg: '#fff7ed', surface: '#ffffff', text: '#4a1d3f', textMuted: '#7a4066',
      accent: '#d1246b', onAccent: '#ffffff',
      gradient: ['#ffd7e8', '#ffe9c7', '#ffc9dd']
    },
    dark: {
      bg: '#241023', surface: '#33172f', text: '#ffe9f3', textMuted: '#e0b3cd',
      accent: '#ff6fa5', onAccent: '#2b0f23',
      gradient: ['#4a1136', '#6b1f3f', '#2d1030']
    }
  },

  tropical: {
    label: 'Tropical',
    description: 'Sunlit water and long afternoons. For islands, beaches and escape.',
    motif: MOTIFS.palm,
    light: {
      bg: '#effcfb', surface: '#ffffff', text: '#0a3f45', textMuted: '#22656b',
      accent: '#00857d', onAccent: '#ffffff',
      gradient: ['#a9f0e6', '#ffe6b8', '#8fdcf0']
    },
    dark: {
      bg: '#04211f', surface: '#0a3230', text: '#d9fbf5', textMuted: '#8fd3c9',
      accent: '#3fd9c0', onAccent: '#032220',
      gradient: ['#07403c', '#0d5a52', '#12303f']
    }
  },

  vegas: {
    label: 'Neon Nights',
    description: 'After dark, lit up. For the strip, the tables and the late show.',
    motif: MOTIFS.neon,
    light: {
      bg: '#f7f2fb', surface: '#ffffff', text: '#3b1050', textMuted: '#63307a',
      accent: '#9b17b0', onAccent: '#ffffff',
      gradient: ['#e9ccf7', '#ffd6ef', '#cfd4ff']
    },
    dark: {
      bg: '#12081f', surface: '#1e0f33', text: '#f4e4ff', textMuted: '#c7a3e0',
      accent: '#d96bff', onAccent: '#1a0a2b',
      gradient: ['#2c0f4d', '#4d1160', '#0f1245']
    }
  },

  coding: {
    label: 'Focus',
    description: 'Quiet, dim and out of the way. For deep work and long problems.',
    motif: MOTIFS.brackets,
    light: {
      bg: '#f2f5f9', surface: '#ffffff', text: '#16233a', textMuted: '#48586f',
      accent: '#0f6ea8', onAccent: '#ffffff',
      gradient: ['#dbe6f2', '#cfe4ea', '#e2e8f2']
    },
    dark: {
      bg: '#0c1220', surface: '#151d2e', text: '#dce6f5', textMuted: '#96a7c0',
      accent: '#4fb3e8', onAccent: '#08101c',
      gradient: ['#101a2c', '#16304a', '#0d1626']
    }
  },

  shopping: {
    label: 'Marketplace',
    description: 'Bright, tidy and easy to scan. For carts, comparisons and deals.',
    motif: MOTIFS.bag,
    light: {
      bg: '#fef6f3', surface: '#ffffff', text: '#4a2113', textMuted: '#7d4a34',
      accent: '#cc4a19', onAccent: '#ffffff',
      gradient: ['#ffdccb', '#ffeed6', '#ffd0c4']
    },
    dark: {
      bg: '#20120c', surface: '#301c13', text: '#ffe9dd', textMuted: '#d9ab94',
      accent: '#ff8a4d', onAccent: '#2b1409',
      gradient: ['#3d2113', '#5c3018', '#2b1a14']
    }
  },

  kids: {
    label: 'Playtime',
    description: 'Primary colours and round corners. For small people and their things.',
    motif: MOTIFS.blocks,
    light: {
      bg: '#fffdf0', surface: '#ffffff', text: '#33380f', textMuted: '#5f6624',
      accent: '#1f7a4d', onAccent: '#ffffff',
      gradient: ['#ffe9a8', '#c8f0cd', '#bfe4ff']
    },
    dark: {
      bg: '#171a0c', surface: '#242814', text: '#f4f7db', textMuted: '#c2c894',
      accent: '#8fd94f', onAccent: '#1a1e0a',
      gradient: ['#2c3313', '#20401f', '#152b38']
    }
  },

  travel: {
    label: 'Wanderlust',
    description: 'Wide horizons and paper maps. For flights, routes and somewhere else.',
    motif: MOTIFS.compass,
    light: {
      bg: '#f4f7fb', surface: '#ffffff', text: '#152f4d', textMuted: '#41607f',
      accent: '#1a6bb5', onAccent: '#ffffff',
      gradient: ['#cfe2f7', '#ffe4c9', '#d5ecf5']
    },
    dark: {
      bg: '#0a1523', surface: '#132234', text: '#dceafa', textMuted: '#96b1cc',
      accent: '#5aa9f0', onAccent: '#07121e',
      gradient: ['#12283f', '#1d3a52', '#3a2a1c']
    }
  },

  food: {
    label: 'Kitchen',
    description: 'Warm ovens and worn wood. For recipes, tables and long dinners.',
    motif: MOTIFS.pan,
    light: {
      bg: '#fdf7ee', surface: '#ffffff', text: '#40260f', textMuted: '#6e4a26',
      accent: '#a35108', onAccent: '#ffffff',
      gradient: ['#f6e0bd', '#ffd9c2', '#e8dfc0']
    },
    dark: {
      bg: '#1d1409', surface: '#2b1e10', text: '#f7e9d5', textMuted: '#cdae88',
      accent: '#e09a3c', onAccent: '#22160a',
      gradient: ['#33230f', '#4a2e14', '#2a2413']
    }
  },

  fitness: {
    label: 'Momentum',
    description: 'Cool, sharp and awake. For training, running and the next set.',
    motif: MOTIFS.pulse,
    light: {
      bg: '#f1faf6', surface: '#ffffff', text: '#0d3a2c', textMuted: '#2f6353',
      accent: '#0a7a54', onAccent: '#ffffff',
      gradient: ['#c3f0dd', '#d7ecff', '#b8e8e0']
    },
    dark: {
      bg: '#07201a', surface: '#0e3028', text: '#d6f8ec', textMuted: '#8ecfba',
      accent: '#33d998', onAccent: '#052018',
      gradient: ['#0b3a2c', '#10513c', '#0b2a38']
    }
  },

  music: {
    label: 'Amplify',
    description: 'Deep and resonant. For records, sets and songs on repeat.',
    motif: MOTIFS.wave,
    light: {
      bg: '#f6f4fd', surface: '#ffffff', text: '#2b1c52', textMuted: '#544277',
      accent: '#5b34c4', onAccent: '#ffffff',
      gradient: ['#ddd4fb', '#f9d3ec', '#cddcff']
    },
    dark: {
      bg: '#110d24', surface: '#1c1638', text: '#e8e2ff', textMuted: '#b3a8dd',
      accent: '#9b7cff', onAccent: '#120d24',
      gradient: ['#241a4a', '#3a2065', '#141a45']
    }
  },

  gaming: {
    label: 'Arcade',
    description: 'High contrast, high energy. For runs, raids and patch nights.',
    motif: MOTIFS.pad,
    light: {
      bg: '#f2f6fb', surface: '#ffffff', text: '#14243f', textMuted: '#3f5674',
      accent: '#0b63c9', onAccent: '#ffffff',
      gradient: ['#d4e4fb', '#e6d7fb', '#cff0f5']
    },
    dark: {
      bg: '#080d1a', surface: '#111a2e', text: '#dfe9fb', textMuted: '#93a6c6',
      accent: '#59c1ff', onAccent: '#061020',
      gradient: ['#0e1c36', '#231a4a', '#0a2438']
    }
  },

  nature: {
    label: 'Wildwood',
    description: 'Moss, granite and cold air. For trails, parks and time outside.',
    motif: MOTIFS.pine,
    light: {
      bg: '#f3f8f1', surface: '#ffffff', text: '#1d3520', textMuted: '#456045',
      accent: '#2f6b32', onAccent: '#ffffff',
      gradient: ['#cfe8c8', '#e6ecc9', '#c6e2dd']
    },
    dark: {
      bg: '#0c1a10', surface: '#152719', text: '#dcefdb', textMuted: '#9cbf9d',
      accent: '#66c46b', onAccent: '#07150a',
      gradient: ['#12291a', '#1c3a22', '#132a28']
    }
  },

  study: {
    label: 'Study Hall',
    description: 'Paper, lamplight and quiet. For courses, notes and exams.',
    motif: MOTIFS.book,
    light: {
      bg: '#fbf8f1', surface: '#ffffff', text: '#33301f', textMuted: '#5e5942',
      accent: '#8a5a12', onAccent: '#ffffff',
      gradient: ['#efe6cf', '#e2e6d6', '#f2ddc6']
    },
    dark: {
      bg: '#1a1811', surface: '#27241a', text: '#f2eee0', textMuted: '#c0b89c',
      accent: '#d9ad4a', onAccent: '#1a1710',
      gradient: ['#2c281a', '#3b3524', '#282a1e']
    }
  },

  work: {
    label: 'Workday',
    description: 'Neutral, calm and unremarkable, on purpose. For the working hours.',
    motif: MOTIFS.grid,
    light: {
      bg: '#f6f7f9', surface: '#ffffff', text: '#22262e', textMuted: '#525a67',
      accent: '#3a5b8c', onAccent: '#ffffff',
      gradient: ['#e2e6ec', '#dfe7f0', '#e9e7ec']
    },
    dark: {
      bg: '#111317', surface: '#1c1f26', text: '#e2e5ea', textMuted: '#9aa3b1',
      accent: '#7fa3d6', onAccent: '#0f1216',
      gradient: ['#191d24', '#232a35', '#171b21']
    }
  },

  seasonal: {
    label: 'Season',
    description: 'Whatever the calendar is doing. For holidays and the year turning.',
    motif: MOTIFS.flake,
    light: {
      bg: '#f4f8fb', surface: '#ffffff', text: '#26303d', textMuted: '#4f5d6d',
      accent: '#a02b2b', onAccent: '#ffffff',
      gradient: ['#dceaf3', '#f6dede', '#e3ecdd']
    },
    dark: {
      bg: '#0e161d', surface: '#18232c', text: '#e3edf4', textMuted: '#9db1c0',
      accent: '#e8746e', onAccent: '#140b0a',
      gradient: ['#152532', '#2c1d22', '#122a26']
    }
  },

  [NEUTRAL]: {
    label: 'Aura',
    description: 'The resting state. Shown when nothing is clear, or when you asked for quiet.',
    motif: MOTIFS.aura,
    light: {
      bg: '#f7f7f8', surface: '#ffffff', text: '#23252b', textMuted: '#565b66',
      accent: '#4b5563', onAccent: '#ffffff',
      gradient: ['#e8eaee', '#eeeaf0', '#e6ecec']
    },
    dark: {
      bg: '#101114', surface: '#1a1c21', text: '#e4e5e9', textMuted: '#989ca6',
      accent: '#9aa2b1', onAccent: '#0f1013',
      gradient: ['#1a1c22', '#22252c', '#181a1f']
    }
  }
};

export const THEME_KEYS = Object.keys(THEMES);

/** Intensity levels (PRD §7.4). Governs how much of the theme is expressed. */
export const INTENSITY = {
  off:        { gradientOpacity: 0,    motifOpacity: 0,    motion: false, ambient: false },
  subtle:     { gradientOpacity: 0.35, motifOpacity: 0,    motion: false, ambient: false },
  balanced:   { gradientOpacity: 0.75, motifOpacity: 0.12, motion: true,  ambient: false },
  expressive: { gradientOpacity: 1,    motifOpacity: 0.20, motion: true,  ambient: true }
};

export const INTENSITY_LEVELS = Object.keys(INTENSITY);

export function getTheme(key) {
  return THEMES[key] || THEMES[NEUTRAL];
}

/**
 * Resolve a theme into a flat map of CSS custom properties.
 *
 * @param {string} key      taxonomy/theme key
 * @param {'light'|'dark'} scheme
 * @param {string} intensity  key of INTENSITY
 * @returns {Record<string,string>} CSS variable name -> value
 */
export function resolveTheme(key, scheme = 'light', intensity = 'balanced') {
  const theme = getTheme(key);
  const palette = theme[scheme === 'dark' ? 'dark' : 'light'];
  const level = INTENSITY[intensity] || INTENSITY.balanced;

  return {
    '--aura-bg': palette.bg,
    '--aura-surface': palette.surface,
    '--aura-text': palette.text,
    '--aura-text-muted': palette.textMuted,
    '--aura-accent': palette.accent,
    '--aura-on-accent': palette.onAccent,
    '--aura-grad-1': palette.gradient[0],
    '--aura-grad-2': palette.gradient[1],
    '--aura-grad-3': palette.gradient[2],
    '--aura-grad-opacity': String(level.gradientOpacity),
    '--aura-motif-opacity': String(level.motifOpacity),
    '--aura-motion': level.motion ? '1' : '0'
  };
}
