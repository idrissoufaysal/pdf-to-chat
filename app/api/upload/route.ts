/* eslint-disable @typescript-eslint/no-unsafe-function-type */
// src/app/api/upload/route.ts
import { Pinecone } from '@pinecone-database/pinecone';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { PineconeStore } from '@langchain/pinecone';
import { v4 as uuidv4 } from 'uuid';

// Helper to create a Server-Sent Event (SSE) stream
function createSSEStream() {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = async (data: object) => {
    const jsonString = JSON.stringify(data);
    await writer.write(encoder.encode(`data: ${jsonString}\n\n`));
  };

  const closeStream = () => {
    writer.close();
  };

  return { stream, sendEvent, closeStream };
}

export async function POST(req: Request) {
  const { stream, sendEvent, closeStream } = createSSEStream();
  const fileId = uuidv4(); // Generate a unique ID for this document

  // We start processing without awaiting the full completion here
  // The response is sent back to the client immediately with the stream
  processFileUpload(req, fileId, sendEvent, closeStream);

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function processFileUpload(req: Request, fileId: string, sendEvent: Function, closeStream: Function) {
  try {
    // 1. Extraire le fichier de la requête
    await sendEvent({ stage: 'Analyse de la requête...', progress: 5 });
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      throw new Error('Aucun fichier téléchargé.');
    }

    // 2. Charger le PDF
    await sendEvent({ stage: 'Chargement du PDF...', progress: 20 });
    const pdfLoader = new PDFLoader(file, {
        splitPages: false,
    });
    const docs = await pdfLoader.load();

    // 3. Diviser le texte en chunks
    await sendEvent({ stage: 'Découpage du texte...', progress: 40 });
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await textSplitter.splitDocuments(docs);
    
    const chunksWithMetadata = chunks.map(chunk => {
        chunk.metadata.fileId = fileId;
        return chunk;
    });

    // 4. Initialiser Pinecone
    await sendEvent({ stage: 'Initialisation de la base de données...', progress: 60 });
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME!);

    // 5. Créer les embeddings et les stocker
    await sendEvent({ stage: 'Création des embeddings...', progress: 80 });
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY!,
      modelName: "embedding-001",
    });

    await PineconeStore.fromDocuments(chunksWithMetadata, embeddings, {
      pineconeIndex,
      namespace: fileId, 
    });

    // 6. Terminé
    await sendEvent({ stage: 'Terminé !', progress: 100, fileId: fileId });

  } catch (error) {
    await sendEvent({ error: (error as Error).message });
  } finally {
    closeStream();
  }
}