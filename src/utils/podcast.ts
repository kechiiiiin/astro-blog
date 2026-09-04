import { XMLParser } from 'fast-xml-parser';
import type { PodcastFeed, PodcastEpisode, PodcastChannel, PodcastConfig } from '../types/podcast';

export const PODCAST_CONFIGS: PodcastConfig[] = [
  {
    label: 'けちーんのラジオ',
    rssUrl: 'https://rss.listen.style/p/kechiiiiin/rss',
    linkText: 'LISTENで聴く',
  },
  {
    label: 'いつまじラジオ',
    rssUrl: 'https://rss.listen.style/p/itsumaji-radio/rss',
    linkText: 'LISTENで聴く',
  },
  {
    label: '山、それから。',
    rssUrl: 'https://rss.listen.style/p/yamasore/rss',
    linkText: 'LISTENで聴く',
  },
];

export async function fetchPodcastFeed(rssUrl: string): Promise<PodcastFeed> {
  const response = await fetch(rssUrl);
  const xml = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const result = parser.parse(xml);
  const channel = result.rss.channel;

  const podcastChannel: PodcastChannel = {
    title: channel.title,
    description: channel.description,
    image: channel.image?.url || channel['itunes:image']?.['@_href'],
    link: channel.link,
  };

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  const episodes: PodcastEpisode[] = items.map((item: any) => ({
    title: item.title,
    description: item.description || '',
    pubDate: new Date(item.pubDate),
    duration: item['itunes:duration'] || '',
    audioUrl: item.enclosure?.['@_url'] || '',
    episodeUrl: item.link,
    image: item['itunes:image']?.['@_href'],
  }));

  episodes.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  return { channel: podcastChannel, episodes };
}

export async function fetchAllPodcastFeeds(): Promise<{ config: PodcastConfig; feed: PodcastFeed }[]> {
  const results = await Promise.all(
    PODCAST_CONFIGS.map(async (config) => ({
      config,
      feed: await fetchPodcastFeed(config.rssUrl),
    }))
  );
  return results;
}

export function formatDuration(duration: string): string {
  // 秒数のみの形式 (例: "1825")
  if (/^\d+$/.test(duration)) {
    const totalSeconds = parseInt(duration, 10);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  // HH:MM:SS 形式で先頭が00の場合はMM:SSに
  const parts = duration.split(':');
  if (parts.length === 3 && parts[0] === '00') {
    return `${parts[1]}:${parts[2]}`;
  }
  return duration;
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}
