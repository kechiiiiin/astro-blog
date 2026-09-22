import type { PostFilter } from "./utils/posts";

export interface SiteConfig {
  title: string;
  slogan: string;
  description?: string;
  site: string,
  social: {
    github?: string;
    linkedin?: string;
    email?: string;
    rss?: boolean;
    x?: string;
  };
  homepage: PostFilter;
  googleAnalysis?: string;
  search?: boolean;
}

export const siteConfig: SiteConfig = {
  site: "https://www.kechiiiiin.com/", // your site url
  title: "まあ、そうかもしれない",
  slogan: "このサイトについて",
  description: "けちーんです。日記書いたり、ブログ書いたり、自由に書いていきます",
  social: {
    // github: "https://github.com/keisuke-yamauch1", // leave empty if you don't want to show the github
    // linkedin: "https://www.linkedin.com/in/someone/", // leave empty if you don't want to show the linkedin
    // email: "example@gmail.com", // leave empty if you don't want to show the email
    rss: true, // set this to false if you don't want to provide an rss feed
    x: "https://x.com/kechiiin_",
  },
  homepage: {
    maxPosts: 3,
    tags: [],
    excludeTags: [],
  },
  googleAnalysis: "", // your google analysis id
  search: true, // set this to false if you don't want to provide a search feature
};

// 日記の写真（images.kechiiiiin.com）を Cloudflare の画像変換（/cdn-cgi/image/...）経由に書き換えるか。
// ⚠️ ゾーンで画像変換がまだ有効になっていない間は false のまま（有効化すると /cdn-cgi/image/ は 404）。
// 有効化できたらここを true にして push する（src/plugins/rehype-diary-images.ts・src/lib/content/index.ts が参照）。
export const imageTransform = false;
