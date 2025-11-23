import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

(async () => {
  const recordings = await prisma.recording.findMany({
    select: { id: true, botId: true, transcriptPath: true, courseCode: true, courseName: true }
  });
  
  console.log('Checking and updating transcript paths to utterances format...\n');
  let updated = 0;
  
  for (const recording of recordings) {
    if (!recording.transcriptPath) continue;
    
    const dir = recording.transcriptPath.substring(0, recording.transcriptPath.lastIndexOf('/'));
    const utterancesPath = dir + '/transcript-utterances.json';
    
    if (fs.existsSync(utterancesPath)) {
      await prisma.recording.update({
        where: { id: recording.id },
        data: { transcriptPath: utterancesPath }
      });
      console.log(`✅ ${recording.botId.substring(0, 8)} - ${recording.courseName}`);
      console.log(`   Updated to: transcript-utterances.json`);
      updated++;
    }
  }
  
  console.log(`\n✨ Updated ${updated} transcript paths to utterances format`);
  console.log('\nThese should now show transcripts in law app!');
  
  await prisma.$disconnect();
})();
