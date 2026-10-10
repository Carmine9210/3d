import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/*/admin', '/*/seller', '/*/account', '/*/cart', '/*/checkout'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
