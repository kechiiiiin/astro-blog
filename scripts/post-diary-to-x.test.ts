import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  getDiaryPath,
  isPublished,
  composeText,
  POST_TEMPLATE,
  percentEncode,
  buildSignatureBaseString,
  signRequest,
  buildAuthHeader,
} from './lib/x-post.mjs';
import { getDiaryPath as getDiaryPathTs } from '../src/utils/date';

describe('parseFrontmatter', () => {
  it('シングルクォート付きのスカラーを読む（CMS が出す実際の形）', () => {
    const raw = [
      '---',
      'title: GitHubアカウントを移行した',
      "pubDate: '2026-07-29T12:47:00.000Z'",
      'draft: false',
      'tags: []',
      'description: 移行ってめんどー',
      '---',
      '本文',
    ].join('\n');

    expect(parseFrontmatter(raw)).toEqual({
      title: 'GitHubアカウントを移行した',
      pubDate: '2026-07-29T12:47:00.000Z',
      draft: false,
      description: '移行ってめんどー',
    });
  });

  it('ダブルクォート付き・裸のスカラーの両方を扱える', () => {
    const raw = `---\ntitle: "引用符「入り」のタイトル"\npubDate: 2026-01-02T03:04:05.000Z\ndraft: true\n---\n`;
    const fm = parseFrontmatter(raw);
    expect(fm.title).toBe('引用符「入り」のタイトル');
    expect(fm.pubDate).toBe('2026-01-02T03:04:05.000Z');
    expect(fm.draft).toBe(true);
  });

  it('リスト形式の tags やインデント行を無視する', () => {
    const raw = `---\ntitle: リストあり\ntags:\n  - foo\n  - bar\npubDate: '2026-03-04T00:00:00.000Z'\n---\n`;
    const fm = parseFrontmatter(raw);
    expect(fm.title).toBe('リストあり');
    expect(fm.pubDate).toBe('2026-03-04T00:00:00.000Z');
    expect(fm).not.toHaveProperty('tags');
  });

  it('draft 未指定なら draft は undefined（＝下書き扱いしない）', () => {
    const raw = `---\ntitle: t\npubDate: '2026-03-04T00:00:00.000Z'\n---\n`;
    expect(parseFrontmatter(raw).draft).toBeUndefined();
  });

  it('フロントマターが無ければ空オブジェクト', () => {
    expect(parseFrontmatter('本文だけ')).toEqual({});
  });
});

describe('getDiaryPath（src/utils/date.ts と一致し、末尾スラッシュ付きであること）', () => {
  const cases = [
    '2026-07-29T12:47:00.000Z', // JST 21:47 → 同日
    '2026-07-29T15:30:00.000Z', // JST 翌 00:30 → 日付が繰り上がる
    '2026-07-29T14:59:59.999Z', // JST 23:59 → まだ同日
    '2026-12-31T15:00:00.000Z', // 年またぎ
    '2026-01-01T00:00:00.000Z',
    '2026-02-28T16:00:00.000Z',
  ];

  for (const iso of cases) {
    it(`${iso}`, () => {
      const d = new Date(iso);
      expect(getDiaryPath(d)).toBe(getDiaryPathTs(d) + '/');
    });
  }

  it('UTC 日付境界をまたぐケースが期待どおり', () => {
    expect(getDiaryPath(new Date('2026-07-29T15:30:00.000Z'))).toBe('/diary/2026/07/30/');
    expect(getDiaryPath(new Date('2026-12-31T15:00:00.000Z'))).toBe('/diary/2027/01/01/');
  });
});

describe('isPublished', () => {
  const now = new Date('2026-07-29T12:00:00.000Z'); // JST 2026-07-29 21:00

  it('当日は公開扱い', () => {
    expect(isPublished(new Date('2026-07-29T23:00:00.000Z'), now)).toBe(false); // JST 07-30
    expect(isPublished(new Date('2026-07-29T00:00:00.000Z'), now)).toBe(true);
  });

  it('過去は公開・未来は未公開', () => {
    expect(isPublished(new Date('2026-07-01T00:00:00.000Z'), now)).toBe(true);
    expect(isPublished(new Date('2026-08-01T00:00:00.000Z'), now)).toBe(false);
  });
});

describe('composeText', () => {
  it('テンプレートどおりに組み立てる（タイトルは載せない）', () => {
    const text = composeText('GitHubアカウントを移行した', 'https://www.kechiiiiin.com/diary/2026/07/29/');
    expect(text).toBe('日記投稿\nhttps://www.kechiiiiin.com/diary/2026/07/29/');
    expect(text).toBe(
      POST_TEMPLATE('GitHubアカウントを移行した', 'https://www.kechiiiiin.com/diary/2026/07/29/')
    );
  });

  it('タイトルが長くても本文は 280 に収まる', () => {
    const url = 'https://www.kechiiiiin.com/diary/2026/07/29/';
    const text = composeText('あ'.repeat(500), url);
    const weighted = [...text].length - [...url].length + 23;
    expect(weighted).toBeLessThanOrEqual(280);
  });
});

describe('OAuth 1.0a', () => {
  // X 公式ドキュメント "Creating a signature" のワークサンプル
  const sample = {
    method: 'POST',
    url: 'https://api.twitter.com/1.1/statuses/update.json',
    consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
    consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
    tokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
    timestamp: 1318622958,
    extraParams: {
      include_entities: 'true',
      status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
    },
  };

  it('percentEncode が RFC 3986 準拠', () => {
    expect(percentEncode('Ladies + Gentlemen')).toBe('Ladies%20%2B%20Gentlemen');
    expect(percentEncode("!*'()")).toBe('%21%2A%27%28%29');
    expect(percentEncode('An encoded string!')).toBe('An%20encoded%20string%21');
  });

  it('署名ベース文字列が公式サンプルと一致する', () => {
    const params = {
      oauth_consumer_key: sample.consumerKey,
      oauth_nonce: sample.nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: String(sample.timestamp),
      oauth_token: sample.token,
      oauth_version: '1.0',
      ...sample.extraParams,
    };
    expect(buildSignatureBaseString(sample.method, sample.url, params)).toBe(
      'POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26' +
        'oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26' +
        'oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26' +
        'oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26' +
        'oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26' +
        'oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521'
    );
  });

  it('署名が公式サンプルの期待値と一致する', () => {
    const params = {
      oauth_consumer_key: sample.consumerKey,
      oauth_nonce: sample.nonce,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: String(sample.timestamp),
      oauth_token: sample.token,
      oauth_version: '1.0',
      ...sample.extraParams,
    };
    expect(
      signRequest({
        method: sample.method,
        url: sample.url,
        params,
        consumerSecret: sample.consumerSecret,
        tokenSecret: sample.tokenSecret,
      })
    ).toBe('hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
  });

  it('buildAuthHeader が同じ署名を載せ、oauth_* のみを出力する', () => {
    const header = buildAuthHeader(sample);
    expect(header.startsWith('OAuth ')).toBe(true);
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
    expect(header).toContain('oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"');
    // フォーム／クエリのパラメータはヘッダには載らない
    expect(header).not.toContain('status=');
    expect(header).not.toContain('include_entities');
  });

  it('実際の v2 呼び出し（JSON ボディ・extraParams なし）でもヘッダが組める', () => {
    const header = buildAuthHeader({
      method: 'POST',
      url: 'https://api.x.com/2/tweets',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      token: 'tk',
      tokenSecret: 'ts',
      nonce: 'nonce',
      timestamp: 1700000000,
    });
    expect(header).toMatch(/^OAuth oauth_consumer_key="ck", /);
    expect(header).toContain('oauth_signature=');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
  });
});
