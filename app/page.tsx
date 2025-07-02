// src/app/page.tsx
import { Toaster } from "@/components/ui/sonner"
import { PdfInteraction } from "./components/pdfInterface";


export default function Home() {
  return (
    <main className="h-screen">
      <PdfInteraction />
      <Toaster richColors />
    </main>
  );
}