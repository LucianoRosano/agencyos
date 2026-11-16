"use client";

import { SectionError } from "@/components/section-error";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SectionError section="las automatizaciones" {...props} />;
}
