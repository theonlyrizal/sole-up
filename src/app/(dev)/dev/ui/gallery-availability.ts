export function isGalleryAvailable(environment: string | undefined) {
  return environment !== "production";
}
