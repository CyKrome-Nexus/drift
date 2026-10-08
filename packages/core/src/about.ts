// The facts the Settings › About screen shows on both platforms. Platform-specific rows (shell,
// engine, renderer) are supplied by each app; everything about the product and its publisher
// lives here so the two About screens cannot drift apart.

export const PRODUCT = {
  name: 'Drift',
  blurb:
    'Live wallpapers for your desktop and phone. Slow, seamless loops that play behind everything ' +
    'you do — tuned to stay out of your way, pause when you need the machine, and follow your ' +
    'CyKrome Account from screen to screen.',
} as const;

export const PUBLISHER = {
  prose:
    'Drift is published under CyKrome Nexus, the software line of CyKrome, an organization that ' +
    'builds desktop and smartphone applications.',
  links: [
    { label: 'CyKrome Nexus', text: 'nexus.cykrome.com', href: 'https://nexus.cykrome.com/' },
    { label: 'More apps & games', text: 'cykrome.com', href: 'https://www.cykrome.com/', prefix: 'Get the CyKrome Launcher at ' },
    { label: 'CyKrome Studios', text: 'studios.cykrome.com', href: 'https://studios.cykrome.com/' },
  ],
  /** Same inbox Aperture's Mail to Founder writes to, plus-tagged so Drift mail sorts itself. */
  founderEmail: 'cykromenexus+founder-drift@gmail.com',
} as const;

// Every screen reads these from here. The Pro page is live; the docs, account, sign-up, privacy and
// terms pages are still placeholders to point at real pages before release.
export const LINKS = {
  account: 'https://www.cykrome.com/account',
  signUp: 'https://www.cykrome.com/signup',
  /** What Pro is, how to buy it, and where each kind of subscription is managed. */
  pro: 'https://nexus.cykrome.com/drift/pro/',
  docs: 'https://nexus.cykrome.com/drift/docs',
  privacy: 'https://www.cykrome.com/privacy',
  terms: 'https://www.cykrome.com/terms',
} as const;

export function legalLine(year = new Date().getFullYear()): string {
  return `© ${year} CyKrome. Drift and CyKrome Nexus are trademarks of CyKrome.`;
}
