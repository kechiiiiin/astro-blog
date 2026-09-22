import { getCollection, type CollectionEntry } from 'astro:content';
import { getDateParts } from '../../utils/date';
import { imageTransform } from '../../config';
import { transformDiaryImagesHtml } from '../../plugins/lib/transform-diary-html';
import type { UnifiedBlogEntry, UnifiedDiaryEntry, UnifiedEmonicleEntry } from './types';

export type {
  ContentType,
  UnifiedBlogEntry,
  UnifiedDiaryEntry,
  UnifiedEmonicleEntry,
} from './types';

// Content Collections のエントリを、ページ側が期待する Unified* 形式へ詰め替える。
// format === 'html'（microCMS 移行分）は source:'microcms' 互換にして、既存の set:html 分岐を無改修で活かす。
function toUnified(entry: CollectionEntry<'blog' | 'diary' | 'emonicle'>, slug: string) {
  const isHtml = entry.data.format === 'html';
  return {
    id: entry.slug,          // ファイル名（= 旧contentId or 日付）
    slug,
    data: {
      title: entry.data.title,
      description: entry.data.description,
      date: entry.data.pubDate,           // 既存ページは data.date を参照するため詰め替え
      tags: entry.data.tags,
      draft: entry.data.draft,
      image: entry.data.heroImage,        // 既存ページは data.image を参照
    },
    body: entry.body, // RSS はここを直接使う（元のURLのまま出す。画像の書き換えは render() 側だけ）
    render: isHtml
      ? async () => {
          // format:'html'（microCMS 移行分）は astro:content の render() を通らず、ここで直接
          // entry.body を返す（set:html用）ため、remark/rehype 経路の rehypeDiaryImages が効かない。
          // 同じ書き換えをここで直接かける（imageTransform が false の間は中身を素通しするだけ）。
          const html = await transformDiaryImagesHtml(entry.body, imageTransform);
          return { Content: () => html };
        }
      : () => entry.render(),                          // md は Astro に描画させる
    source: (isHtml ? 'microcms' : 'markdown') as const, // 既存分岐を再利用するための互換値
  };
}

export async function fetchAllBlogs(): Promise<UnifiedBlogEntry[]> {
  const entries = await getCollection('blog');
  return entries.map((e) => toUnified(e, e.slug));
}

export async function fetchAllEmonicles(): Promise<UnifiedEmonicleEntry[]> {
  const entries = await getCollection('emonicle');
  return entries.map((e) => toUnified(e, e.slug));
}

export async function fetchAllDiaries(): Promise<UnifiedDiaryEntry[]> {
  const entries = await getCollection('diary');
  return entries.map((e) => {
    const { year, month, day } = getDateParts(e.data.pubDate); // JST固定の既存関数
    return toUnified(e, `${year}/${month}/${day}`);
  });
}
