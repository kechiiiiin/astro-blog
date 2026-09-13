import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import remarkBreaks from 'remark-breaks';

/**
 * Custom remark plugin to apply remark-breaks to diary and blog collections.
 * This allows single line breaks to be rendered as <br> tags.
 * blog も blog-cms の WYSIWYG で書くため、Enter の改行を diary と同じく <br> にする
 * （既存の blog は microCMS 移行の HTML 本文なので影響しない）。
 */
const BREAKS_DIRS = ['/content/diary/', '/content/blog/'];

export function remarkBreaksForDiary() {
  return (tree: Root, file: VFile) => {
    const filePath = file.path || file.history[file.history.length - 1] || '';

    if (BREAKS_DIRS.some((dir) => filePath.includes(dir))) {
      const breaksPlugin = remarkBreaks();
      return breaksPlugin(tree, file);
    }
  };
}
