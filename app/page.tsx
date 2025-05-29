import MapComponent from '@/components/Map'; // Assuming @ is configured for src or app directory

export default function HomePage() {
  return (
    <main>
      <MapComponent googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} />
    </main>
  );
}
