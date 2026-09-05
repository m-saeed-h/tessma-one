import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { darken, tint } from '../lib/color';
import { resolveBranding } from '../lib/branding';

const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export async function generateMetadata() {
  const branding = await resolveBranding();
  return { title: `${branding.productName} · Finance` };
}

// Only html/body/fonts/theme-vars live here — the authenticated app shell
// (sidebar/topbar) and the auth-screen chrome are each a nested layout
// scoped to their own route group ((app) vs (auth)), since an anonymous
// visitor on /login has no sidebar to show.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const branding = await resolveBranding();

  // Design system rule: white-label swaps --primary/--accent only. Everything
  // else (--primary-ink, --primary-wash, --accent-wash) is derived from those
  // two here, at render time, rather than being four more stored fields.
  const themeStyle = {
    '--primary': branding.primaryColor,
    '--primary-ink': darken(branding.primaryColor, 0.25),
    '--primary-wash': tint(branding.primaryColor, 0.9),
    '--accent': branding.accentColor,
    '--accent-wash': tint(branding.accentColor, 0.9),
  } as React.CSSProperties;

  return (
    <html lang="en" style={themeStyle} className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
