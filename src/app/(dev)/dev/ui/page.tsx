import { notFound } from "next/navigation";
import { isGalleryAvailable } from "./gallery-availability";
import { Gallery } from "./gallery";

export default function GalleryPage() {
  if (!isGalleryAvailable(process.env.NODE_ENV)) notFound();
  return <Gallery />;
}
