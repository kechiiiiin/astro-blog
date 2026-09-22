import type { Root, Paragraph, RootContent, PhrasingContent } from 'mdast';
import type { Parent } from 'unist';
import { visit, SKIP } from 'unist-util-visit';

/** U+00A0（ノーブレークスペース）のみで構成された行を識別する */
const NBSP_LINE_RE = /^ +$/;
/** 空行段落に埋め込む U+00A0 文字 */
const NBSP = ' ';

/**
 * Markdown 中の「U+00A0 のみの行」を独立した空行段落に展開する remark プラグイン。
 *
 * 保存規約: blog-cms は空段落 <p><br></p> を <p>&nbsp;</p> に置換してから getMarkdown() し、
 * Markdown 上は「U+00A0 のみの行」として保存する（blank-lines.ts 参照）。
 * このプラグインはその表示側の逆変換を担い、line-height ぶんの高さを持つ <p> を生成する。
 *
 * astro.config では remarkBreaksForDiary より **前** に登録すること。
 * mdast の軟改行は段落内 text ノードの "\n" として現れるため、text を行分解して再構成する。
 */
export function remarkBlankLines() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      if (!parent || typeof index !== 'number') return;

      // 段落全体が U+00A0 のみ（既に独立した空行段落）→ 印だけ付けて通す
      if (
        node.children.length === 1 &&
        node.children[0].type === 'text' &&
        NBSP_LINE_RE.test((node.children[0] as { value: string }).value)
      ) {
        node.data = { ...node.data, hProperties: { ...(node.data?.hProperties ?? {}), className: ['blank-line'] } };
        return;
      }

      const newNodes = splitParagraphByNbspLines(node);
      if (newNodes === null) return; // U+00A0 行なし → 変更不要

      (parent as Parent).children.splice(index, 1, ...newNodes);
      // 挿入したノード群を再訪して残りの nbsp 行も処理させる
      return [SKIP, index + newNodes.length];
    });
  };
}

/**
 * paragraph ノードを U+00A0 行で分割した RootContent[] を返す。
 * U+00A0 行が含まれない場合は null を返す。
 *
 * mdast の paragraph はソフト改行を text 内の "\n" で表現するため、
 * text ノードを行単位に分解 → U+00A0 行 = 空行マーカー / その他 = 通常コンテンツ として
 * 再構成する。非テキストノード（link / emphasis 等）はそのまま保持する。
 */
function splitParagraphByNbspLines(node: Paragraph): RootContent[] | null {
  // U+00A0 行が含まれるか先にチェック（大半の段落はここで早期リターン）
  const hasNbsp = node.children.some(
    c => c.type === 'text' && / /.test((c as { value: string }).value)
  );
  if (!hasNbsp) return null;

  // 結果: paragraphs[i] = PhrasingContent[]（内容）または null（空行マーカー）
  const paragraphs: (PhrasingContent[] | null)[] = [[]];

  for (const child of node.children) {
    if (child.type !== 'text') {
      // 非テキストノードは現在の段落にそのまま追加
      (paragraphs[paragraphs.length - 1] as PhrasingContent[]).push(child);
      continue;
    }

    const lines = (child as { value: string }).value.split('\n');
    const textAccum: string[] = [];

    for (const line of lines) {
      if (NBSP_LINE_RE.test(line)) {
        // U+00A0 行: 蓄積テキストを現在段落に flush → null（空行）を挿入 → 新しい空の段落を開く
        if (textAccum.length > 0) {
          (paragraphs[paragraphs.length - 1] as PhrasingContent[]).push(
            { type: 'text', value: textAccum.join('\n') }
          );
          textAccum.length = 0;
        }
        paragraphs.push(null);   // 空行マーカー
        paragraphs.push([]);     // 次のコンテンツ用段落
      } else {
        textAccum.push(line);
      }
    }

    // 残ったテキストを flush
    if (textAccum.length > 0) {
      (paragraphs[paragraphs.length - 1] as PhrasingContent[]).push(
        { type: 'text', value: textAccum.join('\n') }
      );
    }
  }

  // paragraphs を RootContent[] に変換
  const result: RootContent[] = [];
  for (const p of paragraphs) {
    if (p === null) {
      // U+00A0 のみの段落 → <p>&nbsp;</p> → p マージン 0 でも line-height ぶんの高さを持つ
      result.push({
        type: 'paragraph',
        data: { hProperties: { className: ['blank-line'] } },
        children: [{ type: 'text', value: NBSP }],
      } as Paragraph);
    } else if (p.length > 0) {
      result.push({ type: 'paragraph', children: p } as Paragraph);
    }
    // 空の PhrasingContent[] は捨てる（U+00A0 行が連続した場合に生じる）
  }

  // 分割結果が元の単一段落と変わらなければ null を返す
  return result.length > 1 ? result : null;
}
