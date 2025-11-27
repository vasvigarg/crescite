import fs from 'fs';
import pdf from 'pdf-parse';

const filePath = '/mnt/c/Users/HP/Downloads/clean_statement.pdf';

async function run() {
  try {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found at: ${filePath}`);
        return;
    }
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    console.log('--- PDF TEXT CONTENT START ---');
    console.log(data.text);
    console.log('--- PDF TEXT CONTENT END ---');
  } catch (error) {
    console.error('Error reading PDF:', error);
  }
}

run();
