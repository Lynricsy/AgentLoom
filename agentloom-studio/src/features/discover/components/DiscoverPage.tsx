import {
  MarketplaceBrowsePage,
  type MarketplaceBrowsePageProps,
} from '@/features/marketplace'

export function DiscoverPage(props: Omit<MarketplaceBrowsePageProps, 'mode'>) {
  return <MarketplaceBrowsePage mode="discover" {...props} />
}
