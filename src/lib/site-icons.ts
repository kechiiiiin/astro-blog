import { getImage } from 'astro:assets';
import siteIconSource from '../assets/icons/site-icon-source.png';

// ヘッダーのブランドアイコン・タブの favicon 用に、public/favicon.png（2976px・468KB）を
// ビルド時に小さく作り直す。public/favicon.png 自体は OGP や外部参照の可能性があるため触らない
// （src/assets/icons/site-icon-source.png はそのコピーで、ビルド時の最適化専用）。
//
// getImage はモジュール内で1回だけ呼べば足りる（同じ入力なら Astro のアセットキャッシュにも乗るが、
// ここでは Promise を使い回してビルド中に何度も呼ばれても sharp を1回しか回さないようにする）。
let cache: Promise<{
  favicon32: string;
  appleTouchIcon: string;
}> | null = null;

export function getSiteIcons() {
  if (!cache) {
    cache = (async () => {
      const [favicon32, appleTouchIcon] = await Promise.all([
        getImage({ src: siteIconSource, width: 32, height: 32, format: 'png' }),
        getImage({ src: siteIconSource, width: 180, height: 180, format: 'png' }),
      ]);
      return { favicon32: favicon32.src, appleTouchIcon: appleTouchIcon.src };
    })();
  }
  return cache;
}
