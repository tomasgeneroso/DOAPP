interface LocationParts {
  addressStreet?: string;
  neighborhood?: string;
  postalCode?: string;
  location?: string;
  country?: string;
}

export function formatJobLocation(parts: LocationParts): string {
  const segments: string[] = [];
  if (parts.addressStreet) segments.push(parts.addressStreet);
  if (parts.neighborhood) segments.push(parts.neighborhood);
  if (parts.postalCode) segments.push(`CP ${parts.postalCode}`);
  if (parts.location) segments.push(parts.location);
  segments.push(parts.country || 'Argentina');
  return segments.join(', ');
}
