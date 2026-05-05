import { useEffect } from "react";

/**
 * Public marketing homepage: static `pinpoint-ehr.html` in `/public`.
 * CTAs inside the document use `target="_top"` so `/login` and `/portal` escape the iframe.
 */
export default function PinpointEhrHomePage() {
  useEffect(() => {
    document.title = "Imani EHR — Home";
  }, []);

  return (
    <iframe
      title="Imani EHR — Home"
      src="/pinpoint-ehr.html"
      className="fixed inset-0 z-0 h-[100dvh] w-full border-0"
      loading="eager"
      data-testid="pinpoint-ehr-home"
    />
  );
}
