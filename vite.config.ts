import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';

const APP_NAME = 'Aura AI Study Assistant';
const APP_DESCRIPTION =
  'Aura is an AI study assistant for students. Ask questions by text or voice, snap a photo of a problem for step-by-step help, and sync your chats across devices.';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is Aura?',
    a: 'Aura is an AI study assistant for school and college students. It explains concepts step by step, solves problems from photos, answers spoken questions, and keeps your chats synced across devices.',
  },
  {
    q: 'Can Aura solve a problem from a photo?',
    a: 'Yes. Upload or capture a photo of a math, science or diagram question and Aura walks through the solution step by step.',
  },
  {
    q: 'Does Aura support voice questions?',
    a: 'Yes. Tap the microphone to ask a question out loud in browsers that support speech recognition, and have answers read back to you.',
  },
  {
    q: 'Is my study data private?',
    a: 'Your chats are stored in your own account and protected with per-user access rules. You can delete all chat history and search records from Settings at any time.',
  },
  {
    q: 'Can I install Aura on my phone?',
    a: 'Yes. Aura is a progressive web app: use "Add to Home Screen" in your mobile browser to install it like a native app.',
  },
];

/**
 * Injects everything that needs the public site URL (canonical, Open Graph, JSON-LD) and emits
 * sitemap.xml + the robots.txt Sitemap line. Set VITE_SITE_URL (e.g. https://aura.example.com)
 * for the production build. Without it, URL-dependent tags are skipped rather than emitted wrong.
 */
function seoPlugin(siteUrl: string): Plugin {
  return {
    name: 'aura-seo',
    transformIndexHtml() {
      const tags: any[] = [];
      if (siteUrl) {
        tags.push(
          { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:url', content: `${siteUrl}/` }, injectTo: 'head' },
          { tag: 'meta', attrs: { property: 'og:image', content: `${siteUrl}/og-image.svg` }, injectTo: 'head' },
          { tag: 'meta', attrs: { name: 'twitter:image', content: `${siteUrl}/og-image.svg` }, injectTo: 'head' }
        );
      }
      const graph = [
        {
          '@type': 'WebApplication',
          name: APP_NAME,
          description: APP_DESCRIPTION,
          applicationCategory: 'EducationalApplication',
          operatingSystem: 'Any (web browser, installable PWA)',
          browserRequirements: 'Requires JavaScript',
          inLanguage: 'en',
          isAccessibleForFree: true,
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          featureList: [
            'Step-by-step explanations',
            'Photo problem solving',
            'Voice questions and spoken answers',
            'Cloud-synced chat history',
          ],
          ...(siteUrl && { url: `${siteUrl}/` }),
        },
        {
          '@type': 'FAQPage',
          mainEntity: FAQ.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        },
      ];
      tags.push({
        tag: 'script',
        attrs: { type: 'application/ld+json' },
        children: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
        injectTo: 'head',
      });
      return tags;
    },
    writeBundle(options) {
      const outDir = options.dir || 'dist';
      if (!siteUrl) {
        this.warn('VITE_SITE_URL is not set: skipping canonical/og:url, sitemap.xml and the robots Sitemap line.');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(
        path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${siteUrl}/</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`
      );
      const robotsPath = path.join(outDir, 'robots.txt');
      const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8').trimEnd() : 'User-agent: *\nAllow: /';
      fs.writeFileSync(robotsPath, `${robots}\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
      const llmsPath = path.join(outDir, 'llms.txt');
      if (fs.existsSync(llmsPath)) {
        fs.writeFileSync(llmsPath, fs.readFileSync(llmsPath, 'utf8').replace(/\{\{SITE_URL\}\}/g, siteUrl));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '');

  return {
    plugins: [react(), tailwindcss(), seoPlugin(siteUrl)],
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    server: { port: 5173, host: true },
    build: {
      sourcemap: false,
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            supabase: ['@supabase/supabase-js'],
            gsap: ['gsap', '@gsap/react'],
          },
        },
      },
    },
  };
});
