// src/app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { v4 as uuidv4 } from 'uuid';

// Fonction pour parser le formulaire (multipart/form-data)
async function parseFormData(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    throw new Error('No file uploaded.');
  }
  return { file };
}

export async function POST(req: Request) {
  try {
    // 1. Extraire le fichier de la requête
    const { file } = await parseFormData(req);
    const fileId = uuidv4(); // Générer un ID unique pour ce document

    // 2. Charger le PDF
    // PDFLoader a besoin d'un Blob, on le crée à partir du fichier
    const pdfLoader = new PDFLoader(file, {
        splitPages: false, // Traiter le PDF comme un seul document
    });
    const docs = await pdfLoader.load();

    // 3. Diviser le texte en chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await textSplitter.splitDocuments(docs);
    
    // Ajouter l'ID du fichier aux métadonnées de chaque chunk
    const chunksWithMetadata = chunks.map(chunk => {
        chunk.metadata.fileId = fileId;
        return chunk;
    });

    // 4. Initialiser Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME!);

    // 5. Créer les embeddings et les stocker dans Pinecone
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY!,
      modelName: "embedding-001", // Modèle d'embedding de Gemini
    });

    await PineconeStore.fromDocuments(chunksWithMetadata, embeddings, {
      pineconeIndex,
      // Le namespace permet d'isoler les vecteurs de ce PDF
      namespace: fileId, 
    });

    // 6. Renvoyer l'ID du fichier au client
    return NextResponse.json({ success: true, fileId: fileId }, { status: 200 });

  } catch (error) {
    console.error('Error processing PDF:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}