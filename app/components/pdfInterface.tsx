// src/components/PdfInteraction.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChatInterface } from "./chatInterface";

// Configuration du worker pour react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export function PdfInteraction() {
    const [file, setFile] = useState<File | null>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [fileId, setFileId] = useState<string | null>(null); // Pour stocker l'ID du fichier traité
    const viewerRef = useRef<HTMLDivElement | null>(null);


    const [pageToJump, setPageToJump] = useState<number | null>(null);

// ---- AJOUT 2 : L'effet qui exécute le défilement ----
useEffect(() => {
    if (pageToJump && viewerRef.current) {
        const pageElement = viewerRef.current.querySelector(`[data-page-number="${pageToJump}"]`);
        if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Optionnel : ajouter un effet visuel de "flash"
            pageElement.classList.add('flash-animation');
            setTimeout(() => {
                pageElement.classList.remove('flash-animation');
            }, 1500);
        }
        // Réinitialiser pour pouvoir sauter à la même page une autre fois
        setPageToJump(null); 
    }
}, [pageToJump]);


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setFileUrl(URL.createObjectURL(selectedFile));
            setFileId(null); // Réinitialiser l'ID si un nouveau fichier est choisi
            setNumPages(null);
            setCurrentPage(1);
        }
    };

    const [progress, setProgress] = useState(0);
    const [progressStage, setProgressStage] = useState<string | null>(null);

    const handleUpload = async () => {
        if (!file) {
            toast.error("Veuillez sélectionner un fichier.");
            return;
        }
        setIsLoading(true);
        setProgress(0);
        setProgressStage(null);
        setFileId(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.body) {
                throw new Error("La réponse du serveur ne contient pas de corps.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n\n');

                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        const jsonString = line.substring(5);
                        if (jsonString) {
                            try {
                                const data = JSON.parse(jsonString);
                                if (data.error) {
                                    throw new Error(data.error);
                                }
                                setProgress(data.progress);
                                setProgressStage(data.stage);
                                if (data.fileId) {
                                    setFileId(data.fileId);
                                }
                            } catch (e) {
                                console.error("Erreur de parsing JSON:", e);
                            }
                        }
                    }
                }
            }

            toast.success("Le document a été traité. Vous pouvez maintenant poser des questions.");

        } catch (error) {
            toast.error((error as Error).message);
        } finally {
            setIsLoading(false);
            setProgress(0);
            setProgressStage(null);
        }
    };

    function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
        setNumPages(numPages);
    }

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const pageNumber = Number(entry.target.getAttribute('data-page-number'));
                        if (pageNumber) {
                            setCurrentPage(pageNumber);
                        }
                    }
                });
            },
            {
                root: viewerRef.current,
                threshold: 0.5,
            }
        );

        const pageElements = viewerRef.current?.querySelectorAll('[data-page-number]');
        if (pageElements) {
            pageElements.forEach((page) => observer.observe(page));
        }

        return () => {
            if (pageElements) {
                pageElements.forEach((page) => observer.unobserve(page));
            }
        };
    }, [numPages]);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-screen p-4 bg-background">
            {/* Colonne de gauche : PDF et upload */}
            <div className="flex flex-col h-full min-h-0 relative">
                <div className="flex items-center gap-2 mb-4 flex-shrink-0 p-2 bg-card rounded-lg border">
                    <Input 
                        type="file" 
                        accept=".pdf" 
                        onChange={handleFileChange} 
                        className="max-w-xs text-sm" 
                    />
                    <Button 
                        onClick={handleUpload} 
                        disabled={isLoading || !file}
                        size="sm"
                    >
                        {isLoading ? "Traitement..." : "Charger"}
                    </Button>
                </div>
                <div 
                    ref={viewerRef} 
                    className={`flex-1 border rounded-lg overflow-y-auto min-h-0 p-0 w-full h-full bg-gradient-to-br from-yellow-100 via-yellow-200 to-white transition-all duration-300`}
                >
                    {fileUrl ? (
                        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess} className="w-full h-full">
                            {Array.from(new Array(numPages), (el, index) => (
                                <div key={`page_wrapper_${index + 1}`} data-page-number={index + 1}>
                                    <Page 
                                        key={`page_${index + 1}`} 
                                        pageNumber={index + 1}
                                        width={undefined}
                                        className="w-full !m-0 !p-0 flex justify-center items-center"
                                    />
                                </div>
                            ))}
                        </Document>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground p-8">
                            <div className="text-center">
                                <p className="text-lg font-medium mb-2">Aucun document</p>
                                <p className="text-sm">Veuillez uploader un PDF pour l&apos;afficher ici.</p>
                            </div>
                        </div>
                    )}
                    {isLoading && (
                        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                            <div className="w-3/4 max-w-md bg-card border rounded-lg p-6 shadow-lg">
                                <p className="text-center text-lg font-semibold mb-4">Traitement en cours...</p>
                                <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                                    <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                </div>
                                <p className="text-center text-sm text-muted-foreground">{progressStage} ({progress}%)</p>
                            </div>
                        </div>
                    )}
                </div>
                {isLoading && (
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                        <div className="w-3/4 max-w-md bg-card border rounded-lg p-6 shadow-lg">
                            <div className="flex items-center justify-center mb-4">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <p className="text-center text-lg font-semibold">Traitement en cours...</p>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                                <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                            <p className="text-center text-sm text-muted-foreground">{progressStage} ({progress}%)</p>
                        </div>
                    </div>
                )}
                {numPages && (
                    <div className="absolute bottom-5 right-5 bg-zinc-900/60 backdrop-blur-sm text-white text-xs font-medium rounded-full px-3 py-1.5 shadow-lg ring-1 ring-white/10 pointer-events-none">
                        {currentPage} / {numPages}
                    </div>
                )}
            </div>

            {/* Colonne de droite : Chat */}
            <div className="flex flex-col h-full min-h-0">
                <ChatInterface fileId={fileId} onSourceClick={setPageToJump} />
            </div>
        </div>
    );
}