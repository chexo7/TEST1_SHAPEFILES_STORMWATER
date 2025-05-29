'use client';

import dynamic from 'next/dynamic';

// Dynamically import the Map component with SSR disabled
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => <p>Loading map...</p>, // Optional loading component
});

export default function HomePage() {
  return <Map />;
}
