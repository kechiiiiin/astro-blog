import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import rehypePrettyCode from 'rehype-pretty-code';
import { siteConfig, imageTransform } from './src/config';
import mdx from '@astrojs/mdx';
import embeds from 'astro-embed/integration';
import sitemap from '@astrojs/sitemap';
import preact from '@astrojs/preact';

import {
  remarkBlankLines,
  remarkBreaksForDiary,
  remarkSpotifyEmbed,
  remarkMediaEmbed,
  remarkLinkCard,
  rehypeTargetBlank,
  rehypeCodeTitle,
  rehypeImageNotProse,
  rehypeDiaryImages,
} from './src/plugins';

export default defineConfig({
  site: siteConfig.site,
  output: 'static',
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
    // Podcast アートワーク（LISTEN の RSS）をビルド時に astro:assets で縮めるためのリモート画像許可。
    domains: ['image.listen.style'],
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
    // remarkLinkCard は埋め込み（Spotify / X / YouTube）の後・remarkBreaksForDiary の前（リンクカード設計 §7.3）
    remarkPlugins: [remarkBlankLines, remarkSpotifyEmbed, remarkMediaEmbed, remarkLinkCard, remarkBreaksForDiary],
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
      [rehypeDiaryImages, { enabled: imageTransform }],
    ],
  },
});
