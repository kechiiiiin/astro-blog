import type { Link, PhrasingContent } from 'mdast';

// 「行として独立した URL」を見分ける共通ヘルパ。
// remark-media-embed（X / YouTube）と remark-link-card（リンクカード）の両方から使う。
// ⚠️ かけら帳（~/work/kakera-cho/src/lib/markdown.ts の parseStandaloneUrls / parseEmbedTokens）に
//    同じ考え方の写しがある。判定を変えるときは両方を揃えること。

/** 子 text 1個で value===url の GFM autolink literal か。`[テキスト](URL)` と書いた意図的なリンクは対象外。 */
export function isAutolinkLiteral(node: PhrasingContent): node is Link {
  if (node.type !== 'link') return false;
  const link = node as Link;
  return (
    link.children.length === 1 &&
    link.children[0].type === 'text' &&
    (link.children[0] as { value: string }).value === link.url
  );
}

/** その link が段落内で「行として独立」しているか（前後が段落端 or 改行境界）。 */
export function isLineStandalone(children: PhrasingContent[], i: number): boolean {
  const prev = children[i - 1];
  const next = children[i + 1];
  const prevOk = i === 0 || (prev.type === 'text' && (prev as { value: string }).value.endsWith('\n'));
  const nextOk =
    i === children.length - 1 || (next.type === 'text' && (next as { value: string }).value.startsWith('\n'));
  return prevOk && nextOk;
}

/** 境界 text の余分な `\n` を1個だけ削る（remarkBreaksForDiary の孤立 <br> 防止）。空になった text は捨てる。 */
export function trimBoundary(children: PhrasingContent[], side: 'end' | 'start'): PhrasingContent[] {
  if (children.length === 0) return children;
  const idx = side === 'end' ? children.length - 1 : 0;
  const node = children[idx];
  if (node.type === 'text') {
    const t = node as { value: string };
    t.value = side === 'end' ? t.value.replace(/\n$/, '') : t.value.replace(/^\n/, '');
    if (t.value === '') return children.filter((_, k) => k !== idx);
  }
  return children;
}
