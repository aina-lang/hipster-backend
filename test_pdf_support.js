const PDFDocument = require('pdfkit');
const fs = require('fs');
const sharp = require('sharp');

async function testAll() {
  const pdfPath = '/home/mercia/PROJETS/MOBILE/Hypster/API/nestjsapi/test_dummy.pdf';
  console.log('Creating test_dummy.pdf...');
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(pdfPath));
  doc.fontSize(25).text('Hello World!', 100, 100);
  doc.end();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('Testing sharp PDF support...');
  try {
    const thumb = await sharp(pdfPath).png().toBuffer();
    console.log('Sharp PDF success! Buffer length:', thumb.length);
  } catch (e) {
    console.log('Sharp PDF failed:', e.message);
  }
}

testAll().catch(console.error);
