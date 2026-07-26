import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import rehypePrettyCode from 'rehype-pretty-code';
import { siteConfig } from './src/config';
import mdx from '@astrojs/mdx';
import embeds from 'astro-embed/integration';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';

import {
  remarkBlankLines,
  remarkBreaksForDiary,
  remarkSpotifyEmbed,
  remarkMediaEmbed,
  rehypeTargetBlank,
  rehypeCodeTitle,
  rehypeImageNotProse,
} from './src/plugins';

export default defineConfig({
  site: siteConfig.site,
  output: 'static',
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
  integrations: [
    tailwind(),
    preact({ compat: true }),
    embeds({
      // Configure YouTube to use English UI
      services: {
        YouTube: {
          params: 'hl=en&rel=0'
        },
        Tweet: true,
        Vimeo: true,
        LinkPreview: false
      }
    }),
    sitemap(),
    mdx()
  ],
  markdown: {
    remarkPlugins: [remarkBlankLines, remarkSpotifyEmbed, remarkMediaEmbed, remarkBreaksForDiary],
    rehypePlugins: [
      [rehypePrettyCode, {
        theme: {
          light: 'github-light',
          dark: 'github-dark'
        },
        onVisitLine(node) {
          if (node.children.length === 0) {
            node.children = [{type: 'text', value: ' '}];
          }
        },
      }],
      rehypeTargetBlank,
      rehypeImageNotProse,
    ],
  },
});
