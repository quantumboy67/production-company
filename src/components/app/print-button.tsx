"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
