import { notFound } from "next/navigation";

// Multiple root layouts have no shared not-found boundary. Preserve the
// ordinary site's branded 404 without sharing its third-party resources.
export default function MissingPage() { notFound(); }
