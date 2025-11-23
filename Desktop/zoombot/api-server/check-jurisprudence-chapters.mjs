import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function checkJurisprudenceChapters() {
  const recordings = await prisma.recording.findMany({
    where: {
      OR: [
        { courseName: { contains: 'Jurisprudence' } },
        { courseCode: { contains: '2104' } }
      ]
    },
    select: { botId: true, courseName: true, courseCode: true, recordedAt: true }
  });

  console.log(`\n📚 Found ${recordings.length} Jurisprudence recordings:\n`);

  const recordingsDir = path.join(process.env.HOME, 'Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings');
  
  for (const rec of recordings) {
    console.log(`\n🎥 Bot ID: ${rec.botId}`);
    console.log(`   Course: ${rec.courseName || 'N/A'} (${rec.courseCode || 'N/A'})`);
    console.log(`   Date: ${rec.recordedAt || 'N/A'}`);
    
    // Check for chapters.json
    const chaptersPath = findFile(recordingsDir, rec.botId, 'chapters.json');
    if (chaptersPath) {
      console.log(`   ✅ Chapters: ${chaptersPath}`);
      const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf-8'));
      console.log(`      Topics: ${chapters.chapters?.length || 0} chapters`);
    } else {
      console.log(`   ❌ No chapters.json found`);
    }
  }

  await prisma.$disconnect();
}

function findFile(baseDir, botId, filename) {
  const shortBotId = botId.substring(0, 8);
  
  const findRecursive = (dir) => {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file === botId || file.startsWith(botId) || 
              file.endsWith('-' + shortBotId) || file.includes('-' + shortBotId)) {
            const filePath = path.join(fullPath, filename);
            if (fs.existsSync(filePath)) return filePath;
          }
          const found = findRecursive(fullPath);
          if (found) return found;
        }
      }
    } catch (e) {}
    return null;
  };
  
  return findRecursive(baseDir);
}

checkJurisprudenceChapters();
