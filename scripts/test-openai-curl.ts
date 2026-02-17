import * as cp from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const exec = util.promisify(cp.exec);
const API_KEY = "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";
const INPUT_IMAGE = 'input.png';
const OUTPUT_IMAGE = 'output_curl.png';

async function testOpenAiCurl() {
  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in .env');
    return;
  }

  if (!fs.existsSync(INPUT_IMAGE)) {
    console.error(
      `Error: ${INPUT_IMAGE} not found. Please provide an input image.`,
    );
    return;
  }

  console.log(`Starting test with Direct CURL Mirror (gpt-image-1.5)`);

  const tmpDir = path.join(process.cwd(), 'scripts', 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const inputPath = path.join(tmpDir, `input_${Date.now()}.png`);
  const promptPath = path.join(tmpDir, `prompt_${Date.now()}.txt`);

  try {
    // 1. Prepare files
    fs.copyFileSync(INPUT_IMAGE, inputPath);
    const prompt =
      'Keep the exact same face, same identity, same facial features. Do not modify the face. Change only the background to a tropical beach. Add realistic sunglasses.';
    fs.writeFileSync(promptPath, prompt);

    // 2. Exact CURL command
    const curlCommand = [
      'curl -s -X POST https://api.openai.com/v1/images/edits',
      `-H "Authorization: Bearer ${API_KEY}"`,
      '-F "model=gpt-image-1.5"',
      `-F "image=@${inputPath};type=image/png"`,
      '-F "input_fidelity=high"',
      '-F "quality=high"',
      `-F "prompt=<${promptPath}"`,
      '-F "size=1024x1536"',
      '-F "response_format=b64_json"',
    ].join(' ');

    console.log(`Executing CURL command...`);
    const { stdout, stderr } = await exec(curlCommand, {
      maxBuffer: 1024 * 1024 * 30,
    });

    if (stderr) {
      console.warn(`CURL Stderr: ${stderr}`);
    }

    const response = JSON.parse(stdout);
    const b64 = response.data?.[0]?.b64_json;

    if (!b64) {
      console.error('CURL failed:', JSON.stringify(response, null, 2));
      return;
    }

    fs.writeFileSync(OUTPUT_IMAGE, Buffer.from(b64, 'base64'));
    console.log(`SUCCESS! Output saved to ${OUTPUT_IMAGE}`);
  } catch (e: any) {
    console.error(`FAILED: ${e.message}`);
  } finally {
    // Cleanup
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
  }
}

testOpenAiCurl();
