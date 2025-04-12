import * as admin from 'firebase-admin';
import { initializeFirebase } from './firebaseInit';

// Initialize Firebase
initializeFirebase();
const db = admin.firestore();

interface CollectionInfo {
  name: string;
  documents: Array<{
    id: string;
    data: Record<string, any>;
  }>;
}

async function getCollectionInfo(collectionName: string, limitDocs: number = 5): Promise<CollectionInfo> {
  const collectionRef = db.collection(collectionName);
  const q = collectionRef.orderBy('timestamp', 'desc').limit(limitDocs);
  const snapshot = await q.get();
  
  return {
    name: collectionName,
    documents: snapshot.docs.map((doc: any) => ({
      id: doc.id,
      data: doc.data()
    }))
  };
}

async function main() {
  // List of collections to export (add more as needed)
  const collections = [
    'priceSnapshots',
    'correlatedPairs',
    'trades',
    'accountMetrics',
    'botEvents'
  ];

  const collectionData: CollectionInfo[] = [];

  for (const collectionName of collections) {
    try {
      const info = await getCollectionInfo(collectionName);
      collectionData.push(info);
    } catch (error) {
      console.error(`Error fetching collection ${collectionName}:`, error);
    }
  }

  // Write to file
  const outputPath = '../firebase-data-structure.json';
  const data = {
    timestamp: new Date().toISOString(),
    collections: collectionData
  };

  require('fs').writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Firebase data structure exported to ${outputPath}`);
}

main().catch(console.error);
